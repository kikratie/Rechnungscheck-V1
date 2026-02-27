import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { Decimal } from '@prisma/client/runtime/library';
import type { ShareholderTransactionItem, ShareholderBalanceSummary } from '@buchungsai/shared';

// ============================================================
// CRUD Operations
// ============================================================

/**
 * Create a shareholder transaction (called during invoice approval).
 */
export async function createTransaction(
  tenantId: string,
  data: {
    userId: string;
    invoiceId?: string | null;
    transactionType: 'RECEIVABLE' | 'PAYABLE';
    amount: number | Decimal;
    description?: string | null;
    dueDate?: Date | null;
  },
): Promise<ShareholderTransactionItem> {
  const tx = await prisma.shareholderTransaction.create({
    data: {
      tenantId,
      userId: data.userId,
      invoiceId: data.invoiceId ?? null,
      transactionType: data.transactionType,
      amount: typeof data.amount === 'number' ? data.amount : data.amount,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      status: 'OPEN',
    },
    include: {
      user: { select: { firstName: true, lastName: true } },
      invoice: { select: { belegNr: true } },
    },
  });

  writeAuditLog({
    tenantId,
    userId: data.userId,
    entityType: 'ShareholderTransaction',
    entityId: tx.id,
    action: 'CREATE',
    newData: {
      transactionType: data.transactionType,
      amount: String(data.amount),
      invoiceId: data.invoiceId,
    },
  });

  return formatTransaction(tx);
}

/**
 * List shareholder transactions for a tenant with optional filters.
 */
export async function listTransactions(
  tenantId: string,
  opts?: {
    status?: 'OPEN' | 'PAID';
    transactionType?: 'RECEIVABLE' | 'PAYABLE';
    page?: number;
    limit?: number;
  },
): Promise<{ items: ShareholderTransactionItem[]; total: number }> {
  const { status, transactionType, page = 1, limit = 50 } = opts ?? {};

  const where: Record<string, unknown> = { tenantId };
  if (status) where.status = status;
  if (transactionType) where.transactionType = transactionType;

  const [items, total] = await Promise.all([
    prisma.shareholderTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { firstName: true, lastName: true } },
        invoice: { select: { belegNr: true } },
      },
    }),
    prisma.shareholderTransaction.count({ where }),
  ]);

  return {
    items: items.map(formatTransaction),
    total,
  };
}

/**
 * Get the open balance summary for a tenant's shareholder account.
 */
export async function getOpenBalance(tenantId: string): Promise<ShareholderBalanceSummary> {
  const [receivableAgg, payableAgg, openCount] = await Promise.all([
    prisma.shareholderTransaction.aggregate({
      where: { tenantId, status: 'OPEN', transactionType: 'RECEIVABLE' },
      _sum: { amount: true },
    }),
    prisma.shareholderTransaction.aggregate({
      where: { tenantId, status: 'OPEN', transactionType: 'PAYABLE' },
      _sum: { amount: true },
    }),
    prisma.shareholderTransaction.count({
      where: { tenantId, status: 'OPEN' },
    }),
  ]);

  const totalReceivable = receivableAgg._sum.amount ?? new Decimal(0);
  const totalPayable = payableAgg._sum.amount ?? new Decimal(0);
  const netBalance = new Decimal(totalReceivable.toString()).minus(totalPayable.toString());

  return {
    totalReceivable: totalReceivable.toString(),
    totalPayable: totalPayable.toString(),
    netBalance: netBalance.toString(),
    openCount,
  };
}

/**
 * Mark a shareholder transaction as paid.
 */
export async function markAsPaid(
  tenantId: string,
  transactionId: string,
  userId: string,
  paidAt?: Date,
): Promise<ShareholderTransactionItem> {
  const existing = await prisma.shareholderTransaction.findFirst({
    where: { id: transactionId, tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Gesellschafter-Transaktion', transactionId);
  }

  if (existing.status === 'PAID') {
    throw new ConflictError('Transaktion ist bereits als bezahlt markiert');
  }

  const updated = await prisma.shareholderTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'PAID',
      paidAt: paidAt ?? new Date(),
    },
    include: {
      user: { select: { firstName: true, lastName: true } },
      invoice: { select: { belegNr: true } },
    },
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'ShareholderTransaction',
    entityId: transactionId,
    action: 'MARK_PAID',
    previousData: { status: 'OPEN' },
    newData: { status: 'PAID', paidAt: updated.paidAt?.toISOString() },
  });

  return formatTransaction(updated);
}

/**
 * Get shareholder transactions linked to a specific invoice.
 */
export async function getTransactionsByInvoice(
  tenantId: string,
  invoiceId: string,
): Promise<ShareholderTransactionItem[]> {
  const txs = await prisma.shareholderTransaction.findMany({
    where: { tenantId, invoiceId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { firstName: true, lastName: true } },
      invoice: { select: { belegNr: true } },
    },
  });

  return txs.map(formatTransaction);
}

// ============================================================
// Helper
// ============================================================

function formatTransaction(tx: {
  id: string;
  tenantId: string;
  userId: string;
  invoiceId: string | null;
  transactionType: string;
  amount: Decimal | unknown;
  description: string | null;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  user: { firstName: string; lastName: string };
  invoice: { belegNr: number } | null;
}): ShareholderTransactionItem {
  return {
    id: tx.id,
    tenantId: tx.tenantId,
    userId: tx.userId,
    userName: `${tx.user.firstName} ${tx.user.lastName}`,
    invoiceId: tx.invoiceId,
    invoiceBelegNr: tx.invoice?.belegNr ?? null,
    transactionType: tx.transactionType as 'RECEIVABLE' | 'PAYABLE',
    amount: String(tx.amount),
    description: tx.description,
    status: tx.status as 'OPEN' | 'PAID',
    dueDate: tx.dueDate?.toISOString() ?? null,
    paidAt: tx.paidAt?.toISOString() ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}
