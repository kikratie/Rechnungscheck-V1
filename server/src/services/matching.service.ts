import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { AppError, NotFoundError, ConflictError } from '../utils/errors.js';

// ============================================================
// 4-Stage Matching Algorithm
// ============================================================

interface MatchCandidate {
  invoiceId: string;
  transactionId: string;
  confidence: number;
  matchReason: string;
  stage: number;
  differenceAmount?: number; // For stage 2 (invoice number match with amount difference)
}

/**
 * Run the matching algorithm across unmatched transactions and open invoices.
 * @param tenantId
 * @param userId  for audit log
 * @param statementId  optional — limit to transactions from this statement
 * @returns { created: number, deleted: number }
 */
export async function runMatching(
  tenantId: string,
  userId: string,
  statementId?: string,
) {
  // 1. Get unmatched transactions
  const txWhere: Record<string, unknown> = {
    bankStatement: { tenantId },
    isMatched: false,
  };
  if (statementId) {
    txWhere.bankStatementId = statementId;
  }
  const transactions = await prisma.bankTransaction.findMany({
    where: txWhere,
    include: { bankStatement: { select: { tenantId: true } } },
  });

  // 2. Get open invoices (not yet matched with CONFIRMED)
  const confirmedInvoiceIds = (
    await prisma.matching.findMany({
      where: { tenantId, status: 'CONFIRMED' },
      select: { invoiceId: true },
    })
  ).map((m) => m.invoiceId);

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      grossAmount: { not: null },
      processingStatus: { in: ['PROCESSED', 'REVIEW_REQUIRED', 'ARCHIVED', 'RECONCILED'] },
      id: { notIn: confirmedInvoiceIds },
    },
    include: {
      vendor: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  });

  // 3. Delete old SUGGESTED matchings for these transactions (clean slate)
  const txIds = transactions.map((t) => t.id);
  let deleted = 0;
  if (txIds.length > 0) {
    const deleteResult = await prisma.matching.deleteMany({
      where: {
        tenantId,
        transactionId: { in: txIds },
        status: 'SUGGESTED',
      },
    });
    deleted = deleteResult.count;
  }

  // 4. Build IBAN lookup for vendors (for Stage 3 IBAN matching)
  const vendorIbans = new Map<string, string>(); // vendorId → iban
  const vendorIds = [...new Set(invoices.map(i => i.vendorId).filter(Boolean))] as string[];
  if (vendorIds.length > 0) {
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: vendorIds }, iban: { not: null } },
      select: { id: true, iban: true },
    });
    for (const v of vendors) {
      if (v.iban) vendorIbans.set(v.id, v.iban.replace(/\s/g, '').toUpperCase());
    }
  }

  // 5. Run 4-stage matching
  const candidates: MatchCandidate[] = [];
  const matchedTxIds = new Set<string>();
  const matchedInvIds = new Set<string>();

  // Stage 1: Exakt (99%) — Invoice number in reference + amount exact
  for (const tx of transactions) {
    if (matchedTxIds.has(tx.id)) continue;
    const txAmount = Math.abs(new Decimal(tx.amount).toNumber());
    const txRef = [tx.reference, tx.bookingText].filter(Boolean).join(' ').toLowerCase();

    for (const inv of invoices) {
      if (matchedInvIds.has(inv.id)) continue;
      if (!inv.grossAmount || !inv.invoiceNumber) continue;

      const invAmount = new Decimal(inv.grossAmount).toNumber();
      if (Math.abs(txAmount - invAmount) > 0.01) continue;

      const invNum = inv.invoiceNumber.toLowerCase().trim();
      if (!invNum || !txRef.includes(invNum)) continue;

      candidates.push({
        invoiceId: inv.id,
        transactionId: tx.id,
        confidence: 0.99,
        matchReason: `Betrag ${txAmount.toFixed(2)}€ exakt + Rechnungsnr. "${inv.invoiceNumber}" im Verwendungszweck`,
        stage: 1,
      });
      matchedTxIds.add(tx.id);
      matchedInvIds.add(inv.id);
      break;
    }
  }

  // Stage 2: Rechnungsnr.-Match (80%) — Invoice number in reference + amount ±10% → PaymentDifference
  for (const tx of transactions) {
    if (matchedTxIds.has(tx.id)) continue;
    const txAmount = Math.abs(new Decimal(tx.amount).toNumber());
    const txRef = [tx.reference, tx.bookingText].filter(Boolean).join(' ').toLowerCase();

    for (const inv of invoices) {
      if (matchedInvIds.has(inv.id)) continue;
      if (!inv.grossAmount || !inv.invoiceNumber) continue;

      const invAmount = new Decimal(inv.grossAmount).toNumber();
      const invNum = inv.invoiceNumber.toLowerCase().trim();
      if (!invNum || !txRef.includes(invNum)) continue;

      // Amount within ±10%
      const tolerance = invAmount * 0.10;
      const diff = txAmount - invAmount;
      if (Math.abs(diff) > tolerance || Math.abs(diff) <= 0.01) continue; // Skip exact (already handled in stage 1)

      candidates.push({
        invoiceId: inv.id,
        transactionId: tx.id,
        confidence: 0.80,
        matchReason: `Rechnungsnr. "${inv.invoiceNumber}" im Verwendungszweck, Differenz ${diff.toFixed(2)}€ (${txAmount.toFixed(2)}€ vs ${invAmount.toFixed(2)}€)`,
        stage: 2,
        differenceAmount: diff,
      });
      matchedTxIds.add(tx.id);
      matchedInvIds.add(inv.id);
      break;
    }
  }

  // Stage 3: Betrags-Match (70%) — Amount exact + (vendor name OR IBAN match)
  for (const tx of transactions) {
    if (matchedTxIds.has(tx.id)) continue;
    const txAmount = Math.abs(new Decimal(tx.amount).toNumber());
    const counterpart = tx.counterpartName?.toLowerCase().trim() || '';
    const txIban = (tx as Record<string, unknown>).counterpartIban as string | null;
    const txIbanClean = txIban?.replace(/\s/g, '').toUpperCase() || '';

    for (const inv of invoices) {
      if (matchedInvIds.has(inv.id)) continue;
      if (!inv.grossAmount) continue;

      const invAmount = new Decimal(inv.grossAmount).toNumber();
      if (Math.abs(txAmount - invAmount) > 0.01) continue;

      // Check vendor name OR IBAN match
      const vendorName = inv.vendor?.name?.toLowerCase().trim() || inv.vendorName?.toLowerCase().trim() || '';
      const customerName = inv.customer?.name?.toLowerCase().trim() || inv.customerName?.toLowerCase().trim() || '';
      const name = vendorName || customerName;

      let hasNameMatch = false;
      if (name && counterpart) {
        const nameWords = name.split(/\s+/).filter((w) => w.length >= 3);
        hasNameMatch = nameWords.some((w) => counterpart.includes(w)) || counterpart.includes(name);
      }

      let hasIbanMatch = false;
      if (txIbanClean && inv.vendorId && vendorIbans.has(inv.vendorId)) {
        hasIbanMatch = vendorIbans.get(inv.vendorId) === txIbanClean;
      }

      if (!hasNameMatch && !hasIbanMatch) continue;

      const reason = hasIbanMatch
        ? `Betrag ${txAmount.toFixed(2)}€ exakt + IBAN-Übereinstimmung`
        : `Betrag ${txAmount.toFixed(2)}€ exakt + "${name}" als Empfänger/Auftraggeber`;

      candidates.push({
        invoiceId: inv.id,
        transactionId: tx.id,
        confidence: 0.70,
        matchReason: reason,
        stage: 3,
      });
      matchedTxIds.add(tx.id);
      matchedInvIds.add(inv.id);
      break;
    }
  }

  // Stage 4: Fuzzy (50%) — Amount ±2% + Date ±5 days + vendor name similar
  for (const tx of transactions) {
    if (matchedTxIds.has(tx.id)) continue;
    const txAmount = Math.abs(new Decimal(tx.amount).toNumber());
    const txDate = new Date(tx.transactionDate);
    const counterpart = tx.counterpartName?.toLowerCase().trim() || '';

    for (const inv of invoices) {
      if (matchedInvIds.has(inv.id)) continue;
      if (!inv.grossAmount || !inv.invoiceDate) continue;

      const invAmount = new Decimal(inv.grossAmount).toNumber();
      const invDate = new Date(inv.invoiceDate);

      // Amount within ±2%
      const tolerance = invAmount * 0.02;
      if (Math.abs(txAmount - invAmount) > tolerance) continue;

      // Date within ±5 days
      const daysDiff = Math.abs(txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 5) continue;

      // Optional: name match boosts confidence
      const vendorName = inv.vendor?.name?.toLowerCase().trim() || inv.vendorName?.toLowerCase().trim() || '';
      let nameBoost = 0;
      if (vendorName && counterpart) {
        const nameWords = vendorName.split(/\s+/).filter((w) => w.length >= 3);
        if (nameWords.some((w) => counterpart.includes(w))) nameBoost = 0.10;
      }

      const confidence = 0.50 + nameBoost + (1 - Math.abs(txAmount - invAmount) / invAmount) * 0.05 + (1 - daysDiff / 5) * 0.05;

      candidates.push({
        invoiceId: inv.id,
        transactionId: tx.id,
        confidence: Math.min(confidence, 0.70),
        matchReason: `Betrag ähnlich (${txAmount.toFixed(2)}€ vs ${invAmount.toFixed(2)}€), Datum nah (${formatDateDE(txDate)} vs ${formatDateDE(invDate)})`,
        stage: 4,
      });
      matchedTxIds.add(tx.id);
      matchedInvIds.add(inv.id);
      break;
    }
  }

  // 6. Create matching records
  if (candidates.length > 0) {
    await prisma.matching.createMany({
      data: candidates.map((c) => ({
        tenantId,
        invoiceId: c.invoiceId,
        transactionId: c.transactionId,
        matchType: 'AUTO' as const,
        confidence: c.confidence,
        matchReason: c.matchReason,
        status: 'SUGGESTED' as const,
      })),
      skipDuplicates: true,
    });

    // Create PaymentDifference records for Stage 2 matches (invoice number + amount difference)
    const stage2Candidates = candidates.filter((c) => c.stage === 2 && c.differenceAmount);
    if (stage2Candidates.length > 0) {
      // Look up created matchings to get their IDs
      const createdMatchings = await prisma.matching.findMany({
        where: {
          tenantId,
          invoiceId: { in: stage2Candidates.map((c) => c.invoiceId) },
          transactionId: { in: stage2Candidates.map((c) => c.transactionId) },
          status: 'SUGGESTED',
        },
        select: { id: true, invoiceId: true, transactionId: true },
      });

      for (const candidate of stage2Candidates) {
        const matching = createdMatchings.find(
          (m) => m.invoiceId === candidate.invoiceId && m.transactionId === candidate.transactionId,
        );
        if (!matching) continue;

        const inv = invoices.find((i) => i.id === candidate.invoiceId);
        const invAmount = inv?.grossAmount ? new Decimal(inv.grossAmount).toNumber() : 0;
        const paidAmount = invAmount + (candidate.differenceAmount || 0);

        await prisma.paymentDifference.create({
          data: {
            matchingId: matching.id,
            invoiceAmount: invAmount,
            paidAmount,
            differenceAmount: candidate.differenceAmount || 0,
            differenceReason: 'OTHER', // Default, user can change
            requiresVatCorrection: false,
          },
        });
      }
    }
  }

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Matching',
    entityId: statementId || 'batch',
    action: 'MATCHING_RUN',
    newData: {
      statementId: statementId || 'all',
      transactionsChecked: transactions.length,
      invoicesChecked: invoices.length,
      suggestionsCreated: candidates.length,
      oldSuggestionsDeleted: deleted,
    },
  });

  return { created: candidates.length, deleted };
}

// ============================================================
// Confirm / Reject / Manual / Delete
// ============================================================

export async function confirmMatching(tenantId: string, userId: string, matchingId: string) {
  const matching = await prisma.matching.findFirst({
    where: { id: matchingId, tenantId },
    include: { paymentDifference: true },
  });
  if (!matching) throw new NotFoundError('Matching', matchingId);
  if (matching.status === 'CONFIRMED') return matching;

  // Determine invoice status: RECONCILED or RECONCILED_WITH_DIFFERENCE
  const hasDifference = matching.paymentDifference && Math.abs(Number(matching.paymentDifference.differenceAmount)) > 0.01;
  const invoiceStatus = hasDifference ? 'RECONCILED_WITH_DIFFERENCE' : 'RECONCILED';

  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.matching.update({
      where: { id: matchingId },
      data: {
        status: 'CONFIRMED',
        confirmedByUserId: userId,
        confirmedAt: new Date(),
      },
    });
    await tx.bankTransaction.update({
      where: { id: matching.transactionId },
      data: { isMatched: true },
    });
    // Update invoice status to RECONCILED or RECONCILED_WITH_DIFFERENCE
    await tx.invoice.update({
      where: { id: matching.invoiceId },
      data: { processingStatus: invoiceStatus },
    });
    return m;
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Matching',
    entityId: matchingId,
    action: 'MATCHING_CONFIRMED',
    newData: {
      invoiceId: matching.invoiceId,
      transactionId: matching.transactionId,
      invoiceStatus,
      hasDifference,
    },
  });

  return updated;
}

// ============================================================
// PaymentDifference CRUD
// ============================================================

export async function updatePaymentDifference(
  tenantId: string,
  userId: string,
  matchingId: string,
  data: { differenceReason: string; notes?: string | null },
) {
  const matching = await prisma.matching.findFirst({
    where: { id: matchingId, tenantId },
    include: { paymentDifference: true },
  });
  if (!matching) throw new NotFoundError('Matching', matchingId);
  if (!matching.paymentDifference) throw new NotFoundError('Zahlungsdifferenz', matchingId);

  // SKONTO requires VAT correction
  const requiresVatCorrection = data.differenceReason === 'SKONTO';

  const updated = await prisma.paymentDifference.update({
    where: { id: matching.paymentDifference.id },
    data: {
      differenceReason: data.differenceReason as 'SKONTO' | 'CURRENCY_DIFFERENCE' | 'TIP' | 'PARTIAL_PAYMENT' | 'ROUNDING' | 'OTHER',
      notes: data.notes ?? null,
      requiresVatCorrection,
    },
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'PaymentDifference',
    entityId: updated.id,
    action: 'PAYMENT_DIFFERENCE_UPDATED',
    newData: { differenceReason: data.differenceReason, requiresVatCorrection },
  });

  return updated;
}

export async function rejectMatching(tenantId: string, userId: string, matchingId: string) {
  const matching = await prisma.matching.findFirst({
    where: { id: matchingId, tenantId },
  });
  if (!matching) throw new NotFoundError('Matching', matchingId);

  // Delete the matching record (not just status change) so the unique constraint
  // doesn't block future re-matching. Reset isMatched on the transaction.
  await prisma.$transaction(async (tx) => {
    await tx.matching.delete({ where: { id: matchingId } });
    // Check if transaction still has other confirmed matchings
    const otherConfirmed = await tx.matching.count({
      where: { transactionId: matching.transactionId, status: 'CONFIRMED', id: { not: matchingId } },
    });
    if (otherConfirmed === 0) {
      await tx.bankTransaction.update({
        where: { id: matching.transactionId },
        data: { isMatched: false },
      });
    }
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Matching',
    entityId: matchingId,
    action: 'MATCHING_REJECTED',
    newData: { invoiceId: matching.invoiceId, transactionId: matching.transactionId },
  });

  // Return the old matching data with REJECTED status for the API response
  return { ...matching, status: 'REJECTED' as const };
}

export async function createManualMatching(
  tenantId: string,
  userId: string,
  invoiceId: string,
  transactionId: string,
) {
  // Verify invoice belongs to tenant
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  // Verify transaction belongs to tenant
  const transaction = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, bankStatement: { tenantId } },
  });
  if (!transaction) throw new NotFoundError('Transaktion', transactionId);

  // Check for existing confirmed matching
  const existingForInvoice = await prisma.matching.findFirst({
    where: { invoiceId, tenantId, status: 'CONFIRMED' },
  });
  if (existingForInvoice) {
    throw new ConflictError('Diese Rechnung hat bereits ein bestätigtes Matching');
  }

  const existingForTx = await prisma.matching.findFirst({
    where: { transactionId, tenantId, status: 'CONFIRMED' },
  });
  if (existingForTx) {
    throw new ConflictError('Diese Transaktion hat bereits ein bestätigtes Matching');
  }

  const matching = await prisma.$transaction(async (tx) => {
    const m = await tx.matching.create({
      data: {
        tenantId,
        invoiceId,
        transactionId,
        matchType: 'MANUAL',
        confidence: 1.0,
        matchReason: 'Manuell zugeordnet',
        status: 'CONFIRMED',
        confirmedByUserId: userId,
        confirmedAt: new Date(),
      },
    });
    await tx.bankTransaction.update({
      where: { id: transactionId },
      data: { isMatched: true },
    });
    return m;
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Matching',
    entityId: matching.id,
    action: 'MATCHING_MANUAL_CREATED',
    newData: { invoiceId, transactionId },
  });

  return matching;
}

export async function deleteMatching(tenantId: string, userId: string, matchingId: string) {
  const matching = await prisma.matching.findFirst({
    where: { id: matchingId, tenantId },
  });
  if (!matching) throw new NotFoundError('Matching', matchingId);

  await prisma.$transaction(async (tx) => {
    await tx.matching.delete({ where: { id: matchingId } });
    // Check if transaction still has other confirmed matchings
    const otherConfirmed = await tx.matching.count({
      where: { transactionId: matching.transactionId, status: 'CONFIRMED', id: { not: matchingId } },
    });
    if (otherConfirmed === 0) {
      await tx.bankTransaction.update({
        where: { id: matching.transactionId },
        data: { isMatched: false },
      });
    }
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Matching',
    entityId: matchingId,
    action: 'MATCHING_DELETED',
    previousData: { invoiceId: matching.invoiceId, transactionId: matching.transactionId },
  });
}

// ============================================================
// Monthly Reconciliation (Monatsabstimmung)
// ============================================================

import type { MonthlyReconciliationData } from '@buchungsai/shared';

export async function getMonthlyReconciliation(
  tenantId: string,
  month?: string,
): Promise<MonthlyReconciliationData> {
  // 1. Determine target month
  let periodStart: Date;
  let periodEnd: Date;
  let targetMonth: string;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, mon] = month.split('-').map(Number);
    periodStart = new Date(year, mon - 1, 1);
    periodEnd = new Date(year, mon, 0, 23, 59, 59, 999);
    targetMonth = month;
  } else {
    // Default: most recent statement's period
    const latestStatement = await prisma.bankStatement.findFirst({
      where: { tenantId },
      orderBy: { periodTo: 'desc' },
      select: { periodTo: true },
    });
    if (latestStatement?.periodTo) {
      const d = new Date(latestStatement.periodTo);
      periodStart = new Date(d.getFullYear(), d.getMonth(), 1);
      periodEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      targetMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else {
      // Fallback: current month
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // 2. Parallel queries
  const [
    allTransactions,
    matchingsInPeriod,
    confirmedInvoiceIds,
    availableMonthsRaw,
    transactionBookingsInPeriod,
  ] = await Promise.all([
    // A: All transactions in month
    prisma.bankTransaction.findMany({
      where: {
        bankStatement: { tenantId },
        transactionDate: { gte: periodStart, lte: periodEnd },
      },
      include: {
        matchings: {
          where: { tenantId },
          select: {
            id: true,
            status: true,
            invoiceId: true,
            invoice: { select: { vendorName: true, customerName: true, invoiceNumber: true } },
          },
        },
        booking: { select: { id: true, bookingType: true, accountNumber: true, amount: true, notes: true } },
      },
      orderBy: { transactionDate: 'desc' },
    }),

    // B: Matchings for transactions in period (CONFIRMED + SUGGESTED)
    prisma.matching.findMany({
      where: {
        tenantId,
        status: { in: ['CONFIRMED', 'SUGGESTED'] },
        transaction: {
          transactionDate: { gte: periodStart, lte: periodEnd },
        },
      },
      include: {
        invoice: {
          select: {
            id: true, belegNr: true, vendorName: true, customerName: true,
            invoiceNumber: true, invoiceDate: true, grossAmount: true,
            netAmount: true, vatAmount: true, vatRate: true,
            currency: true, direction: true, validationStatus: true,
            archivalNumber: true,
          },
        },
        transaction: {
          select: {
            id: true, transactionDate: true, amount: true, currency: true,
            counterpartName: true, reference: true, bookingText: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),

    // C: All invoice IDs with CONFIRMED matching (for open invoices)
    prisma.matching.findMany({
      where: { tenantId, status: 'CONFIRMED' },
      select: { invoiceId: true },
    }),

    // D: Available months from transaction data
    prisma.$queryRaw<Array<{ month: string }>>`
      SELECT DISTINCT TO_CHAR(bt."transactionDate", 'YYYY-MM') AS month
      FROM bank_transactions bt
      JOIN bank_statements bs ON bt."bankStatementId" = bs.id
      WHERE bs."tenantId" = ${tenantId}
      ORDER BY month DESC
      LIMIT 24
    `,

    // E: Transaction bookings in period (Privatentnahme/Privateinlage)
    prisma.transactionBooking.findMany({
      where: {
        tenantId,
        transaction: {
          transactionDate: { gte: periodStart, lte: periodEnd },
        },
      },
      include: {
        transaction: {
          select: {
            id: true, transactionDate: true, amount: true, currency: true,
            counterpartName: true, reference: true, bookingText: true,
          },
        },
      },
      orderBy: { confirmedAt: 'desc' },
    }),
  ]);

  // 3. Open invoices (not confirmed-matched)
  const confirmedIds = confirmedInvoiceIds.map((m) => m.invoiceId);
  const openInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      id: { notIn: confirmedIds.length > 0 ? confirmedIds : ['__none__'] },
      processingStatus: { in: ['PROCESSED', 'REVIEW_REQUIRED', 'ARCHIVED', 'RECONCILED'] },
      grossAmount: { not: null },
    },
    include: {
      matchings: {
        where: { status: 'SUGGESTED' },
        select: {
          id: true,
          transaction: { select: { transactionDate: true } },
        },
        take: 1,
      },
    },
    orderBy: { invoiceDate: 'desc' },
    take: 200,
  });

  // 4. Build sets for categorization
  const confirmedTxIds = new Set<string>();
  const bookedTxIds = new Set<string>();
  for (const tx of allTransactions) {
    if (tx.matchings.some((m) => m.status === 'CONFIRMED')) {
      confirmedTxIds.add(tx.id);
    }
    if (tx.booking) {
      bookedTxIds.add(tx.id);
    }
  }

  // 5. Unmatched transactions (exclude confirmed matchings AND transaction bookings)
  const unmatchedTransactions = allTransactions
    .filter((tx) => !confirmedTxIds.has(tx.id) && !bookedTxIds.has(tx.id))
    .map((tx) => {
      const suggested = tx.matchings.find((m) => m.status === 'SUGGESTED');
      return {
        id: tx.id,
        transactionDate: tx.transactionDate.toISOString(),
        amount: new Decimal(tx.amount).toString(),
        currency: tx.currency,
        counterpartName: tx.counterpartName,
        reference: tx.reference,
        bookingText: tx.bookingText,
        hasSuggestedMatching: !!suggested,
        suggestedMatchingId: suggested?.id ?? null,
        suggestedInvoiceName: suggested
          ? (suggested.invoice.vendorName || suggested.invoice.customerName || suggested.invoice.invoiceNumber || null)
          : null,
      };
    });

  // 6. Matched items from matchings
  const matched = matchingsInPeriod.map((m) => ({
    matchingId: m.id,
    matchType: m.matchType as 'AUTO' | 'AI_SUGGESTED' | 'MANUAL',
    matchStatus: m.status as 'SUGGESTED' | 'CONFIRMED' | 'REJECTED',
    confidence: m.confidence ? new Decimal(m.confidence).toString() : null,
    matchReason: m.matchReason,
    invoice: {
      id: m.invoice.id,
      belegNr: m.invoice.belegNr,
      vendorName: m.invoice.vendorName,
      customerName: m.invoice.customerName,
      invoiceNumber: m.invoice.invoiceNumber,
      invoiceDate: m.invoice.invoiceDate?.toISOString() ?? null,
      grossAmount: m.invoice.grossAmount ? new Decimal(m.invoice.grossAmount).toString() : null,
      netAmount: m.invoice.netAmount ? new Decimal(m.invoice.netAmount).toString() : null,
      vatAmount: m.invoice.vatAmount ? new Decimal(m.invoice.vatAmount).toString() : null,
      vatRate: m.invoice.vatRate ? new Decimal(m.invoice.vatRate).toString() : null,
      currency: m.invoice.currency,
      direction: m.invoice.direction as 'INCOMING' | 'OUTGOING',
      validationStatus: m.invoice.validationStatus as 'PENDING' | 'VALID' | 'WARNING' | 'INVALID',
      archivalNumber: m.invoice.archivalNumber,
    },
    transaction: {
      id: m.transaction.id,
      transactionDate: m.transaction.transactionDate.toISOString(),
      amount: new Decimal(m.transaction.amount).toString(),
      currency: m.transaction.currency,
      counterpartName: m.transaction.counterpartName,
      reference: m.transaction.reference,
      bookingText: m.transaction.bookingText,
    },
  }));

  // 7. Unmatched invoices
  const unmatchedInvoiceItems = openInvoices.map((inv) => {
    const suggested = inv.matchings[0] ?? null;
    return {
      id: inv.id,
      belegNr: inv.belegNr,
      vendorName: inv.vendorName,
      customerName: inv.customerName,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate?.toISOString() ?? null,
      dueDate: inv.dueDate?.toISOString() ?? null,
      grossAmount: inv.grossAmount ? new Decimal(inv.grossAmount).toString() : null,
      currency: inv.currency,
      direction: inv.direction as 'INCOMING' | 'OUTGOING',
      validationStatus: inv.validationStatus as 'PENDING' | 'VALID' | 'WARNING' | 'INVALID',
      processingStatus: inv.processingStatus as 'PROCESSED' | 'REVIEW_REQUIRED' | 'ARCHIVED' | 'RECONCILED',
      hasSuggestedMatching: !!suggested,
      suggestedMatchingId: suggested?.id ?? null,
      suggestedTransactionDate: suggested?.transaction?.transactionDate?.toISOString() ?? null,
    };
  });

  // 7b. Booked transactions (Privatentnahme/Privateinlage)
  const bookedTransactions = transactionBookingsInPeriod.map((b) => ({
    bookingId: b.id,
    bookingType: b.bookingType,
    accountNumber: b.accountNumber,
    amount: new Decimal(b.amount).toString(),
    notes: b.notes,
    confirmedAt: b.confirmedAt.toISOString(),
    transaction: {
      id: b.transaction.id,
      transactionDate: b.transaction.transactionDate.toISOString(),
      amount: new Decimal(b.transaction.amount).toString(),
      currency: b.transaction.currency,
      counterpartName: b.transaction.counterpartName,
      reference: b.transaction.reference,
      bookingText: b.transaction.bookingText,
    },
  }));

  // 8. Summary calculations
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const tx of allTransactions) {
    const amt = new Decimal(tx.amount).toNumber();
    if (amt > 0) totalIncome += amt;
    else totalExpenses += Math.abs(amt);
  }

  // Vorsteuer from confirmed matched INCOMING invoices
  const vorsteuerMap = new Map<number, { net: number; vat: number }>();
  for (const m of matchingsInPeriod) {
    if (m.status !== 'CONFIRMED') continue;
    if (m.invoice.direction !== 'INCOMING') continue;
    if (!m.invoice.vatAmount) continue;

    const vatAmt = new Decimal(m.invoice.vatAmount).toNumber();
    const netAmt = m.invoice.netAmount ? new Decimal(m.invoice.netAmount).toNumber() : 0;
    const rate = m.invoice.vatRate ? new Decimal(m.invoice.vatRate).toNumber() : 0;

    const existing = vorsteuerMap.get(rate) ?? { net: 0, vat: 0 };
    existing.net += netAmt;
    existing.vat += vatAmt;
    vorsteuerMap.set(rate, existing);
  }

  let vorsteuerTotal = 0;
  const vorsteuerByRate = Array.from(vorsteuerMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([rate, { net, vat }]) => {
      vorsteuerTotal += vat;
      return { rate, netAmount: net.toFixed(2), vatAmount: vat.toFixed(2) };
    });

  const resolvedTxCount = confirmedTxIds.size + bookedTxIds.size;
  const summary = {
    month: targetMonth,
    totalIncome: totalIncome.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    totalTransactions: allTransactions.length,
    matchedTransactions: resolvedTxCount,
    unmatchedTransactions: unmatchedTransactions.length,
    openInvoices: openInvoices.length,
    matchedPercent: allTransactions.length > 0
      ? Math.round((resolvedTxCount / allTransactions.length) * 100)
      : 0,
    vorsteuerTotal: vorsteuerTotal.toFixed(2),
    vorsteuerByRate,
  };

  return {
    summary,
    matched,
    unmatchedTransactions,
    unmatchedInvoices: unmatchedInvoiceItems,
    bookedTransactions,
    availableMonths: availableMonthsRaw.map((r) => r.month),
  };
}

// ============================================================
// Helpers
// ============================================================

function formatDateDE(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}
