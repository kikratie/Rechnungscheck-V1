import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { invoiceQueue } from '../jobs/queue.js';
import * as storageService from './storage.service.js';
import { validateInvoice } from './validation.service.js';
import { toEurEstimate } from './exchangeRate.service.js';
import { archiveInvoice, batchArchiveInvoices } from './archival.service.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { Prisma } from '@prisma/client';

interface UploadParams {
  tenantId: string;
  userId: string;
  file: Express.Multer.File;
  direction?: 'INCOMING' | 'OUTGOING';
}

interface UpdateExtractedDataParams {
  tenantId: string;
  userId: string;
  invoiceId: string;
  data: Record<string, unknown>;
  editReason?: string;
}

interface CreateEigenbelegParams {
  tenantId: string;
  userId: string;
  data: {
    issuerName: string;
    description: string;
    invoiceDate: string;
    grossAmount: number;
    vatRate?: number | null;
    reason: string;        // Grund für fehlenden Beleg
    direction?: 'INCOMING' | 'OUTGOING';
    accountNumber?: string | null;
    category?: string | null;
  };
  transactionId?: string;  // Optional: auto-match nach Erstellung
}

interface CreateErsatzbelegParams {
  tenantId: string;
  userId: string;
  originalInvoiceId: string;
  reason: string;
  data: {
    issuerName: string;
    description: string;
    invoiceDate: string;
    grossAmount: number;
    netAmount?: number | null;
    vatAmount?: number | null;
    vatRate?: number | null;
    invoiceNumber?: string | null;
    issuerUid?: string | null;
    accountNumber?: string | null;
    category?: string | null;
  };
}

export async function uploadInvoice(params: UploadParams) {
  const { tenantId, userId, file, direction = 'INCOMING' } = params;

  // Compute file hash
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

  // Check for duplicate by hash within tenant
  const existingByHash = await prisma.invoice.findFirst({
    where: { tenantId, storageHash: hash },
    select: { id: true, originalFileName: true },
  });

  if (existingByHash) {
    throw new ConflictError(
      `Datei bereits hochgeladen als "${existingByHash.originalFileName}" (ID: ${existingByHash.id})`,
    );
  }

  // Generate storage path
  const ext = file.originalname.split('.').pop() || 'bin';
  const fileId = crypto.randomUUID();
  const storagePath = `${tenantId}/temp/${fileId}.${ext}`;

  // Upload to S3
  await storageService.uploadFile(storagePath, file.buffer, file.mimetype);

  // Create DB record with retry for belegNr race condition
  let invoice: Awaited<ReturnType<typeof prisma.invoice.create>> | undefined;
  const MAX_RETRIES = 20;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const lastInvoice = await prisma.invoice.findFirst({
      where: { tenantId },
      orderBy: { belegNr: 'desc' },
      select: { belegNr: true },
    });
    const nextBelegNr = (lastInvoice?.belegNr ?? 0) + 1;

    try {
      invoice = await prisma.invoice.create({
        data: {
          tenantId,
          belegNr: nextBelegNr,
          direction,
          originalFileName: file.originalname,
          storagePath,
          storageHash: hash,
          mimeType: file.mimetype,
          fileSizeBytes: file.size,
          processingStatus: 'UPLOADED',
          uploadedByUserId: userId,
        },
      });
      break; // Success
    } catch (err: unknown) {
      // Prisma P2002 = unique constraint violation
      const code = (err as { code?: string }).code;
      if (code === 'P2002' && attempt < MAX_RETRIES - 1) {
        // Small random delay to spread out concurrent retries
        await new Promise(r => setTimeout(r, Math.random() * 50));
        continue;
      }
      throw err;
    }
  }
  if (!invoice) throw new Error('BelegNr-Vergabe fehlgeschlagen nach ' + MAX_RETRIES + ' Versuchen');

  // Enqueue processing job
  await invoiceQueue.add('process-invoice', {
    invoiceId: invoice.id,
    tenantId,
    storagePath,
    mimeType: file.mimetype,
    direction,
  });

  // Audit log (fire-and-forget)
  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: invoice.id,
    action: 'UPLOAD',
    newData: { fileName: file.originalname, mimeType: file.mimetype, size: file.size },
  });

  return invoice;
}

export async function updateExtractedData(params: UpdateExtractedDataParams) {
  const { tenantId, userId, invoiceId, data, editReason } = params;

  // Verify invoice belongs to tenant
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  // Get latest version
  const latestVersion = await prisma.extractedData.findFirst({
    where: { invoiceId },
    orderBy: { version: 'desc' },
  });
  const newVersion = (latestVersion?.version ?? 0) + 1;

  // Create new extracted data version
  const extractedData = await prisma.extractedData.create({
    data: {
      invoiceId,
      version: newVersion,
      source: 'MANUAL',
      editedByUserId: userId,
      editReason: editReason || 'Manuelle Korrektur',
      issuerName: data.issuerName as string ?? latestVersion?.issuerName ?? null,
      issuerUid: data.issuerUid as string ?? latestVersion?.issuerUid ?? null,
      issuerAddress: (data.issuerAddress ?? latestVersion?.issuerAddress ?? null) as Prisma.InputJsonValue,
      issuerEmail: data.issuerEmail as string ?? latestVersion?.issuerEmail ?? null,
      issuerIban: data.issuerIban as string ?? latestVersion?.issuerIban ?? null,
      recipientName: data.recipientName as string ?? latestVersion?.recipientName ?? null,
      recipientUid: data.recipientUid as string ?? latestVersion?.recipientUid ?? null,
      recipientAddress: (data.recipientAddress ?? latestVersion?.recipientAddress ?? null) as Prisma.InputJsonValue,
      invoiceNumber: data.invoiceNumber as string ?? latestVersion?.invoiceNumber ?? null,
      sequentialNumber: data.sequentialNumber as string ?? latestVersion?.sequentialNumber ?? null,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate as string) : latestVersion?.invoiceDate ?? null,
      deliveryDate: data.deliveryDate
        ? new Date(data.deliveryDate as string)
        : latestVersion?.deliveryDate
          ?? (data.invoiceDate ? new Date(data.invoiceDate as string) : latestVersion?.invoiceDate ?? null),
      dueDate: data.dueDate ? new Date(data.dueDate as string) : latestVersion?.dueDate ?? null,
      description: data.description as string ?? latestVersion?.description ?? null,
      netAmount: data.netAmount as number ?? (latestVersion?.netAmount ? Number(latestVersion.netAmount) : null),
      vatAmount: data.vatAmount as number ?? (latestVersion?.vatAmount ? Number(latestVersion.vatAmount) : null),
      grossAmount: data.grossAmount as number ?? (latestVersion?.grossAmount ? Number(latestVersion.grossAmount) : null),
      vatRate: data.vatRate as number ?? (latestVersion?.vatRate ? Number(latestVersion.vatRate) : null),
      vatBreakdown: (data.vatBreakdown ?? latestVersion?.vatBreakdown ?? undefined) as Prisma.InputJsonValue | undefined,
      currency: data.currency as string ?? latestVersion?.currency ?? 'EUR',
      isReverseCharge: data.isReverseCharge as boolean ?? latestVersion?.isReverseCharge ?? false,
      accountNumber: data.accountNumber as string ?? latestVersion?.accountNumber ?? null,
      costCenter: data.costCenter as string ?? latestVersion?.costCenter ?? null,
      category: data.category as string ?? latestVersion?.category ?? null,
      confidenceScores: {} as Prisma.InputJsonValue,
    },
  });

  // Re-validate + sync (zentrale Funktion für alle Pfade)
  await runValidationAndSync({
    invoiceId,
    tenantId,
    extracted: extractedData,
    extractedDataVersion: newVersion,
    direction: (invoice.direction as 'INCOMING' | 'OUTGOING') || 'INCOMING',
  });

  // Audit log
  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'MANUAL_CORRECTION',
    newData: { version: newVersion, editReason },
  });

  return extractedData;
}

/**
 * Re-validiert alle Rechnungen eines Tenants die ExtractedData haben.
 * Nützlich wenn sich Validierungsregeln geändert haben.
 */
export async function revalidateAll(tenantId: string): Promise<{ total: number; updated: number; errors: string[] }> {
  // Find all invoices with extracted data
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      processingStatus: { in: ['PROCESSED', 'REVIEW_REQUIRED', 'ARCHIVED', 'RECONCILED', 'EXPORTED'] },
    },
    select: { id: true, belegNr: true, direction: true },
  });

  let updated = 0;
  const errors: string[] = [];

  for (const inv of invoices) {
    try {
      // Get latest extracted data
      const latestEd = await prisma.extractedData.findFirst({
        where: { invoiceId: inv.id },
        orderBy: { version: 'desc' },
      });
      if (!latestEd) continue;

      // Zentrale Validierung + Sync (gleiche Funktion wie Worker und manuelle Korrektur)
      await runValidationAndSync({
        invoiceId: inv.id,
        tenantId,
        extracted: latestEd,
        extractedDataVersion: latestEd.version,
        direction: (inv.direction as 'INCOMING' | 'OUTGOING') || 'INCOMING',
      });

      updated++;
    } catch (err) {
      errors.push(`BEL-${String(inv.belegNr).padStart(3, '0')}: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
    }
  }

  return { total: invoices.length, updated, errors };
}

export async function approveInvoice(tenantId: string, userId: string, invoiceId: string, comment?: string | null) {
  // Approval now triggers full archival workflow:
  // sequential number → stamp PDF → move to archive/ → lock
  await archiveInvoice(tenantId, userId, invoiceId, comment);

  // Return the updated invoice for the API response
  return prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
}

export async function rejectInvoice(tenantId: string, userId: string, invoiceId: string, reason: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  if (invoice.isLocked) {
    throw new ConflictError('Gesperrte Rechnung kann nicht abgelehnt werden. Bitte zuerst entsperren.');
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      processingStatus: 'REJECTED',
      notes: reason,
    },
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'REJECT',
    newData: { reason },
  });

  return updated;
}

export async function createErsatzbeleg(params: CreateErsatzbelegParams) {
  const { tenantId, userId, originalInvoiceId, reason, data } = params;

  // Verify original invoice exists and belongs to tenant
  const original = await prisma.invoice.findFirst({
    where: { id: originalInvoiceId, tenantId },
  });
  if (!original) throw new NotFoundError('Rechnung', originalInvoiceId);

  // Don't allow if already replaced
  if (original.replacedByInvoiceId) {
    throw new ConflictError(
      `Rechnung wurde bereits durch einen Ersatzbeleg ersetzt (${original.replacedByInvoiceId})`,
    );
  }

  // Calculate VAT if not provided
  let netAmount = data.netAmount;
  let vatAmount = data.vatAmount;
  const vatRate = data.vatRate ?? 20;
  if (netAmount == null && vatAmount == null) {
    netAmount = Math.round((data.grossAmount / (1 + vatRate / 100)) * 100) / 100;
    vatAmount = Math.round((data.grossAmount - netAmount) * 100) / 100;
  } else if (netAmount != null && vatAmount == null) {
    vatAmount = Math.round((data.grossAmount - netAmount) * 100) / 100;
  } else if (vatAmount != null && netAmount == null) {
    netAmount = Math.round((data.grossAmount - vatAmount) * 100) / 100;
  }

  const invoiceDate = new Date(data.invoiceDate);

  // Create Ersatzbeleg + ExtractedData + ValidationResult + update original in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Get next belegNr inside transaction for atomicity
    const lastInvoice = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { belegNr: 'desc' },
      select: { belegNr: true },
    });
    const nextBelegNr = (lastInvoice?.belegNr ?? 0) + 1;

    // 1. Create the Ersatzbeleg invoice (inherits direction from original)
    const ersatzbeleg = await tx.invoice.create({
      data: {
        tenantId,
        belegNr: nextBelegNr,
        direction: original.direction,
        documentType: 'ERSATZBELEG',
        ingestionChannel: 'UPLOAD',
        originalFileName: `Ersatzbeleg_BEL-${String(original.belegNr).padStart(3, '0')}.pdf`,
        storagePath: original.storagePath,     // Reference original file
        storageHash: `ersatz-${original.id}`,  // Unique hash
        mimeType: 'application/pdf',
        fileSizeBytes: 0,
        vendorName: data.issuerName,
        vendorUid: data.issuerUid || null,
        invoiceNumber: data.invoiceNumber || null,
        invoiceDate,
        deliveryDate: invoiceDate,
        netAmount: netAmount!,
        vatAmount: vatAmount!,
        grossAmount: data.grossAmount,
        vatRate,
        accountNumber: data.accountNumber || null,
        category: data.category || null,
        currency: 'EUR',
        processingStatus: 'PROCESSED',
        validationStatus: 'WARNING',
        replacesInvoiceId: originalInvoiceId,
        ersatzReason: reason,
        uploadedByUserId: userId,
      },
    });

    // 2. Create ExtractedData (version 1, source MANUAL)
    await tx.extractedData.create({
      data: {
        invoiceId: ersatzbeleg.id,
        version: 1,
        source: 'MANUAL',
        editedByUserId: userId,
        editReason: `Ersatzbeleg für BEL-${String(original.belegNr).padStart(3, '0')}: ${reason}`,
        issuerName: data.issuerName,
        issuerUid: data.issuerUid || null,
        invoiceNumber: data.invoiceNumber || null,
        invoiceDate,
        deliveryDate: invoiceDate,
        description: data.description,
        netAmount: netAmount!,
        vatAmount: vatAmount!,
        grossAmount: data.grossAmount,
        vatRate,
        currency: 'EUR',
        accountNumber: data.accountNumber || null,
        category: data.category || null,
        confidenceScores: {},
      },
    });

    // 3. Update original invoice → REPLACED
    await tx.invoice.update({
      where: { id: originalInvoiceId },
      data: {
        processingStatus: 'REPLACED',
        replacedByInvoiceId: ersatzbeleg.id,
      },
    });

    return ersatzbeleg;
  });

  // Volle Validierung mit Regel-Engine (nach Transaction, da runValidationAndSync keine tx nutzt)
  await runValidationAndSync({
    invoiceId: result.id,
    tenantId,
    direction: (original.direction as 'INCOMING' | 'OUTGOING') || 'INCOMING',
    extracted: {
      issuerName: data.issuerName,
      issuerUid: data.issuerUid || null,
      issuerAddress: null,
      issuerEmail: null,
      issuerIban: null,
      recipientName: null,
      recipientUid: null,
      invoiceNumber: data.invoiceNumber || null,
      sequentialNumber: null,
      invoiceDate,
      deliveryDate: invoiceDate,
      dueDate: null,
      description: data.description,
      netAmount: netAmount!,
      vatAmount: vatAmount!,
      grossAmount: data.grossAmount,
      vatRate,
      vatBreakdown: null,
      isReverseCharge: false,
      accountNumber: data.accountNumber || null,
      costCenter: null,
      category: data.category || null,
      currency: 'EUR',
    },
    extractedDataVersion: 1,
  });

  // Audit log
  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: result.id,
    action: 'CREATE_ERSATZBELEG',
    newData: {
      originalInvoiceId,
      originalBelegNr: original.belegNr,
      reason,
    },
  });

  return result;
}

export async function createEigenbeleg(params: CreateEigenbelegParams) {
  const { tenantId, userId, data, transactionId } = params;

  const vatRate = data.vatRate ?? 20;
  const netAmount = Math.round((data.grossAmount / (1 + vatRate / 100)) * 100) / 100;
  const vatAmount = Math.round((data.grossAmount - netAmount) * 100) / 100;
  const invoiceDate = new Date(data.invoiceDate);
  const direction = data.direction || 'INCOMING';

  const result = await prisma.$transaction(async (tx) => {
    const lastInvoice = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { belegNr: 'desc' },
      select: { belegNr: true },
    });
    const nextBelegNr = (lastInvoice?.belegNr ?? 0) + 1;

    const eigenbeleg = await tx.invoice.create({
      data: {
        tenantId,
        belegNr: nextBelegNr,
        direction,
        documentType: 'EIGENBELEG',
        ingestionChannel: 'UPLOAD',
        originalFileName: `Eigenbeleg_BEL-${String(nextBelegNr).padStart(3, '0')}.pdf`,
        storagePath: '',
        storageHash: `eigenbeleg-${Date.now()}-${nextBelegNr}`,
        mimeType: 'application/pdf',
        fileSizeBytes: 0,
        vendorName: data.issuerName,
        invoiceDate,
        deliveryDate: invoiceDate,
        netAmount,
        vatAmount,
        grossAmount: data.grossAmount,
        vatRate,
        accountNumber: data.accountNumber || null,
        category: data.category || null,
        currency: 'EUR',
        processingStatus: 'PROCESSED',
        validationStatus: 'WARNING',
        ersatzReason: data.reason,
        uploadedByUserId: userId,
      },
    });

    await tx.extractedData.create({
      data: {
        invoiceId: eigenbeleg.id,
        version: 1,
        source: 'MANUAL',
        editedByUserId: userId,
        editReason: `Eigenbeleg (§132 BAO): ${data.reason}`,
        issuerName: data.issuerName,
        invoiceDate,
        deliveryDate: invoiceDate,
        description: data.description,
        netAmount,
        vatAmount,
        grossAmount: data.grossAmount,
        vatRate,
        currency: 'EUR',
        accountNumber: data.accountNumber || null,
        category: data.category || null,
        confidenceScores: {},
      },
    });

    // Auto-match to transaction if provided
    if (transactionId) {
      const transaction = await tx.bankTransaction.findFirst({
        where: { id: transactionId, bankStatement: { tenantId } },
      });
      if (transaction) {
        // Delete any existing SUGGESTED matchings for this transaction
        await tx.matching.deleteMany({
          where: { transactionId, status: 'SUGGESTED' },
        });
        await tx.matching.create({
          data: {
            tenantId,
            invoiceId: eigenbeleg.id,
            transactionId,
            matchType: 'MANUAL',
            confidence: 1.0,
            matchReason: `Eigenbeleg manuell erstellt für Transaktion`,
            status: 'CONFIRMED',
            confirmedByUserId: userId,
            confirmedAt: new Date(),
          },
        });
      }
    }

    return eigenbeleg;
  });

  // Run validation
  await runValidationAndSync({
    invoiceId: result.id,
    tenantId,
    direction,
    extracted: {
      issuerName: data.issuerName,
      issuerUid: null,
      issuerAddress: null,
      issuerEmail: null,
      issuerIban: null,
      recipientName: null,
      recipientUid: null,
      invoiceNumber: null,
      sequentialNumber: null,
      invoiceDate,
      deliveryDate: invoiceDate,
      dueDate: null,
      description: data.description,
      netAmount,
      vatAmount,
      grossAmount: data.grossAmount,
      vatRate,
      vatBreakdown: null,
      isReverseCharge: false,
      accountNumber: data.accountNumber || null,
      costCenter: null,
      category: data.category || null,
      currency: 'EUR',
    },
    extractedDataVersion: 1,
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: result.id,
    action: 'CREATE_EIGENBELEG',
    newData: { reason: data.reason, transactionId: transactionId || null },
  });

  return result;
}

// ============================================================
// Beleg-Parken (Phase A5)
// ============================================================

export async function parkInvoice(tenantId: string, userId: string, invoiceId: string, reason: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  if (invoice.isLocked) {
    throw new ConflictError('Archivierte Rechnung kann nicht geparkt werden.');
  }

  // Only parkable from certain statuses
  const parkableStatuses = ['UPLOADED', 'PROCESSING', 'PROCESSED', 'REVIEW_REQUIRED', 'ERROR'];
  if (!parkableStatuses.includes(invoice.processingStatus)) {
    throw new ConflictError(
      `Rechnung mit Status "${invoice.processingStatus}" kann nicht geparkt werden.`,
    );
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      processingStatus: 'PARKED',
      notes: reason,
    },
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'PARK',
    newData: { reason },
  });

  return updated;
}

export async function unparkInvoice(tenantId: string, userId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  if (invoice.processingStatus !== 'PARKED') {
    throw new ConflictError('Nur geparkte Rechnungen können fortgesetzt werden.');
  }

  // Determine the correct status to restore to
  // If there's extracted data → PROCESSED, otherwise → UPLOADED
  const hasExtractedData = await prisma.extractedData.count({ where: { invoiceId } });
  const restoredStatus = hasExtractedData > 0 ? 'PROCESSED' : 'UPLOADED';

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      processingStatus: restoredStatus,
      notes: null,
    },
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'UNPARK',
    newData: { restoredStatus },
  });

  return updated;
}

export async function batchApproveInvoices(
  tenantId: string,
  userId: string,
  invoiceIds: string[],
  comment?: string | null,
) {
  // Batch approval now triggers full archival workflow for all invoices
  // (sequential numbering, PDF stamp, archive move, lock — in one transaction)
  return batchArchiveInvoices(tenantId, userId, invoiceIds, comment);
}

export async function getInvoiceVersions(tenantId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { id: true },
  });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  return prisma.extractedData.findMany({
    where: { invoiceId },
    orderBy: { version: 'desc' },
  });
}

const DELETABLE_STATUSES = ['UPLOADED', 'ERROR'] as const;

export async function deleteInvoice(tenantId: string, userId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
  });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  if (!DELETABLE_STATUSES.includes(invoice.processingStatus as typeof DELETABLE_STATUSES[number])) {
    throw new ConflictError(
      `Rechnung mit Status "${invoice.processingStatus}" kann nicht gelöscht werden. Nur Rechnungen mit Status UPLOADED oder ERROR sind löschbar.`,
    );
  }

  // Delete all related records first (order matters for FK constraints)
  await prisma.auditLog.deleteMany({ where: { entityType: 'Invoice', entityId: invoiceId } });
  await prisma.matching.deleteMany({ where: { invoiceId } });
  await prisma.documentVersion.deleteMany({ where: { invoiceId } });
  await prisma.validationResult.deleteMany({ where: { invoiceId } });
  await prisma.extractedData.deleteMany({ where: { invoiceId } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId } });

  // Delete from S3
  if (invoice.storagePath) {
    try {
      await storageService.deleteFile(invoice.storagePath);
    } catch {
      // Storage deletion failed — still delete DB record
    }
  }

  // Delete invoice
  await prisma.invoice.delete({ where: { id: invoiceId } });
}

export async function getInvoiceDownloadUrl(tenantId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { storagePath: true },
  });
  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);

  return storageService.getPresignedUrl(invoice.storagePath);
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Zentrale Funktion: ExtractedData → validateInvoice() → ValidationResult speichern → Invoice sync.
 * Wird von ALLEN Pfaden genutzt (Worker, manuelle Korrektur, Revalidierung, Ersatzbeleg).
 */
interface ExtractedDataRecord {
  issuerName: string | null;
  issuerUid: string | null;
  issuerAddress: unknown;
  issuerEmail: string | null;
  issuerIban: string | null;
  recipientName: string | null;
  recipientUid: string | null;
  invoiceNumber: string | null;
  sequentialNumber: string | null;
  invoiceDate: Date | null;
  deliveryDate: Date | null;
  dueDate: Date | null;
  description: string | null;
  netAmount: Prisma.Decimal | number | null;
  vatAmount: Prisma.Decimal | number | null;
  grossAmount: Prisma.Decimal | number | null;
  vatRate: Prisma.Decimal | number | null;
  vatBreakdown: unknown;
  isReverseCharge: boolean;
  accountNumber: string | null;
  costCenter: string | null;
  category: string | null;
  currency: string;
}

export async function runValidationAndSync(params: {
  invoiceId: string;
  tenantId: string;
  extracted: ExtractedDataRecord;
  extractedDataVersion: number;
  direction?: 'INCOMING' | 'OUTGOING';
}) {
  const { invoiceId, tenantId, extracted, extractedDataVersion, direction = 'INCOMING' } = params;

  // 1. Compute EUR estimate for foreign currency invoices (needed for validation thresholds)
  let estimatedEurGross: number | null = null;
  let exchangeRate: number | null = null;
  let exchangeRateDate: Date | null = null;
  let exchangeRateDateStr: string | null = null;

  const currency = extracted.currency || 'EUR';
  if (currency !== 'EUR' && extracted.grossAmount) {
    const estimate = await toEurEstimate(Number(extracted.grossAmount), currency);
    if (estimate) {
      estimatedEurGross = estimate.eurAmount;
      exchangeRate = estimate.rate;
      exchangeRateDate = new Date(estimate.date);
      exchangeRateDateStr = estimate.date;
    }
  }

  // 2. Run validation with current rules (uses EUR estimate for amount class)
  // Load hospitality fields from extracted data if available (for HOSPITALITY_CHECK)
  const extractedRecord = extracted as unknown as Record<string, unknown>;
  const hospitalityGuests = (extractedRecord.hospitalityGuests as string) || null;
  const hospitalityReason = (extractedRecord.hospitalityReason as string) || null;

  const validationOutput = await validateInvoice({
    extractedFields: {
      issuerName: extracted.issuerName,
      issuerUid: extracted.issuerUid,
      issuerAddress: extracted.issuerAddress as Record<string, string> | null,
      recipientName: extracted.recipientName,
      recipientUid: extracted.recipientUid,
      invoiceNumber: extracted.invoiceNumber,
      invoiceDate: extracted.invoiceDate,
      deliveryDate: extracted.deliveryDate,
      description: extracted.description,
      netAmount: extracted.netAmount ? Number(extracted.netAmount) : null,
      vatAmount: extracted.vatAmount ? Number(extracted.vatAmount) : null,
      grossAmount: extracted.grossAmount ? Number(extracted.grossAmount) : null,
      vatRate: extracted.vatRate ? Number(extracted.vatRate) : null,
      vatBreakdown: extracted.vatBreakdown as Array<{ rate: number; netAmount: number; vatAmount: number }> | null,
      isReverseCharge: extracted.isReverseCharge,
      issuerIban: extracted.issuerIban,
      issuerEmail: extracted.issuerEmail,
      currency,
    },
    tenantId,
    invoiceId,
    direction,
    estimatedEurGross,
    exchangeRate,
    exchangeRateDate: exchangeRateDateStr,
    hospitalityGuests,
    hospitalityReason,
  });

  // 3. Save validation result (append, keeps history)
  await prisma.validationResult.create({
    data: {
      invoiceId,
      overallStatus: validationOutput.overallStatus,
      amountClass: validationOutput.amountClass,
      checks: validationOutput.checks as unknown as Prisma.InputJsonValue,
      extractedDataVersion,
    },
  });

  // 4. Sync ALL denormalized fields to invoice (consistent across all paths)
  const validationStatus =
    validationOutput.overallStatus === 'GREEN' ? 'VALID' :
    validationOutput.overallStatus === 'YELLOW' ? 'WARNING' : 'INVALID';

  // 4a. Check if vendor is TRUSTED → auto-approve GREEN invoices
  let autoApprove = false;
  if (validationOutput.overallStatus === 'GREEN') {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { vendorId: true, processingStatus: true },
    });
    if (invoice?.vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: invoice.vendorId },
        select: { trustLevel: true },
      });
      if (vendor?.trustLevel === 'TRUSTED') {
        autoApprove = true;
      }
    }
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      vendorName: extracted.issuerName,
      vendorUid: extracted.issuerUid,
      vendorAddress: extracted.issuerAddress as Prisma.InputJsonValue,
      customerName: direction === 'OUTGOING' ? extracted.recipientName : undefined,
      invoiceNumber: extracted.invoiceNumber,
      sequentialNumber: extracted.sequentialNumber,
      invoiceDate: extracted.invoiceDate,
      deliveryDate: extracted.deliveryDate,
      dueDate: extracted.dueDate,
      netAmount: extracted.netAmount,
      vatAmount: extracted.vatAmount,
      grossAmount: extracted.grossAmount,
      vatRate: extracted.vatRate,
      vatBreakdown: extracted.vatBreakdown ? (extracted.vatBreakdown as Prisma.InputJsonValue) : Prisma.DbNull,
      isReverseCharge: extracted.isReverseCharge,
      recipientUid: extracted.recipientUid,
      issuerEmail: extracted.issuerEmail,
      issuerIban: extracted.issuerIban,
      accountNumber: extracted.accountNumber,
      costCenter: extracted.costCenter,
      category: extracted.category,
      currency: extracted.currency,
      estimatedEurGross,
      exchangeRate,
      exchangeRateDate,
      validationStatus,
      // Auto-approve is now handled asynchronously via archival job (see below)
      // Felder die vorher nur im Worker gesetzt wurden — jetzt überall konsistent
      isDuplicate: validationOutput.checks.some(
        (c) => c.rule === 'DUPLICATE_CHECK' && c.status === 'RED',
      ),
      validationDetails: validationOutput.checks.filter(
        (c) => c.status !== 'GREEN' && c.status !== 'GRAY',
      ) as unknown as Prisma.InputJsonValue,
      uidValidationStatus: validationOutput.viesInfo?.checked
        ? validationOutput.viesInfo.valid
          ? 'VALID'
          : validationOutput.viesInfo.error
            ? 'SERVICE_UNAVAILABLE'
            : 'INVALID'
        : 'NOT_CHECKED',
      uidValidationDate: validationOutput.viesInfo?.checked ? new Date() : undefined,
    },
  });

  // 4b. Auto-approve for TRUSTED vendors: enqueue archival job
  if (autoApprove) {
    invoiceQueue.add('archive-invoice', { invoiceId, tenantId }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
    writeAuditLog({
      tenantId,
      userId: undefined,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: 'AUTO_APPROVE',
      metadata: { trigger: 'AUTO_TRUST', vendorTrustLevel: 'TRUSTED' },
    });
  }

  return validationOutput;
}
