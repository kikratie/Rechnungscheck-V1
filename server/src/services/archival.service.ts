/**
 * Archival Service — Genehmigungs- und Archivierungs-Workflow
 *
 * Handles:
 * - Sequential number generation (RE-2026-02-0001) with SELECT FOR UPDATE
 * - PDF stamping (sachlicher Eingangsstempel, ohne Farbcodes)
 * - Image-to-PDF conversion for non-PDF uploads
 * - File rename + move to archive/
 * - Single and batch archival
 * - Storno (cancellation) tracking
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import * as storageService from './storage.service.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

// ============================================================
// TYPES
// ============================================================

interface NextNumberResult {
  number: number;
  formatted: string; // "RE-2026-02-0001"
}

interface StampData {
  archivalNumber: string;
  eingangsdatum: Date;    // Upload date
  archivedAt: Date;       // Approval timestamp
  approvedBy: string;     // "Max Mustermann"
  validationNotes: string[]; // RED/YELLOW checks als sachliche Notizen
  approvalRuleName?: string | null;  // Name der gewählten Abzugsregel
  approvalNote?: string | null;      // Freitext-Anmerkung
}

interface ArchiveResult {
  archivalNumber: string;
  archivedStoragePath: string;
  archivedFileName: string;
  archivedAt: Date;
}

interface InvoiceForArchival {
  id: string;
  tenantId: string;
  direction: string;
  documentType: string;
  vendorName: string | null;
  invoiceDate: Date | null;
  storagePath: string;
  mimeType: string;
  processingStatus: string;
  isLocked: boolean;
  archivalNumber: string | null;
  validationStatus: string;
  createdAt: Date; // Upload date (Eingangsdatum)
  // Approval data (set during approve step)
  approvalComment: string | null;
  approvalRuleId: string | null;
  approvalNote: string | null;
}

// ============================================================
// SEQUENTIAL NUMBER GENERATION
// ============================================================

/**
 * Gets next sequential number using SELECT FOR UPDATE to prevent duplicates.
 * Format: RE-2026-02-0001 (prefix-year-month-number)
 * MUST be called inside a Prisma interactive transaction.
 */
export async function getNextSequentialNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  prefix: string,
  year: number,
  month: number,
): Promise<NextNumberResult> {
  // SELECT FOR UPDATE — locks the row for this transaction
  const rows = await tx.$queryRaw<Array<{ id: string; lastNumber: number }>>`
    SELECT id, "lastNumber"
    FROM sequential_numbers
    WHERE "tenantId" = ${tenantId}
      AND prefix = ${prefix}
      AND year = ${year}
      AND month = ${month}
    FOR UPDATE
  `;

  let nextNumber: number;

  if (rows.length === 0) {
    // First number for this tenant/prefix/year/month
    nextNumber = 1;
    await tx.$executeRaw`
      INSERT INTO sequential_numbers (id, "tenantId", prefix, year, month, "lastNumber", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${tenantId}, ${prefix}, ${year}, ${month}, 1, NOW(), NOW())
    `;
  } else {
    nextNumber = rows[0].lastNumber + 1;
    await tx.$executeRaw`
      UPDATE sequential_numbers
      SET "lastNumber" = ${nextNumber}, "updatedAt" = NOW()
      WHERE id = ${rows[0].id}
    `;
  }

  const monthStr = String(month).padStart(2, '0');
  const formatted = `${prefix}-${year}-${monthStr}-${String(nextNumber).padStart(4, '0')}`;
  return { number: nextNumber, formatted };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Sanitizes vendor name for use in filenames.
 * Umlauts → ae/oe/ue/ss, special chars removed, spaces → hyphens, max 50 chars.
 */
export function sanitizeVendorName(name: string | null): string {
  if (!name) return 'Unbekannt';

  return name
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
    || 'Unbekannt';
}

/**
 * Determines the archival prefix based on document type and direction.
 * CREDIT_NOTE → GS, OUTGOING → AR, default (INCOMING) → RE
 */
export function getArchivalPrefix(documentType: string, direction?: string): string {
  if (documentType === 'CREDIT_NOTE') return 'GS';
  if (documentType === 'ADVANCE_PAYMENT') return 'AZ';
  if (direction === 'OUTGOING') return 'AR';
  return 'RE'; // Rechnung Eingang (INVOICE, RECEIPT, ERSATZBELEG)
}

/**
 * Builds the archived filename.
 * Format: RE-2026-02-0001_Lieferantenname_2026-01-15.pdf
 */
export function buildArchivedFileName(
  archivalNumber: string,
  vendorName: string | null,
  invoiceDate: Date | null,
): string {
  const sanitizedVendor = sanitizeVendorName(vendorName);
  const dateStr = invoiceDate
    ? invoiceDate.toISOString().slice(0, 10)
    : 'kein-datum';
  return `${archivalNumber}_${sanitizedVendor}_${dateStr}.pdf`;
}

/**
 * Builds the archive storage path.
 * Format: {tenantId}/archive/{year}/{month}/{filename}
 */
export function buildArchivePath(
  tenantId: string,
  archivalNumber: string,
  vendorName: string | null,
  invoiceDate: Date | null,
): string {
  // Extract year and month from "RE-2026-02-0001"
  const parts = archivalNumber.split('-');
  const year = parts[1];
  const month = parts[2];
  const fileName = buildArchivedFileName(archivalNumber, vendorName, invoiceDate);
  return `${tenantId}/archive/${year}/${month}/${fileName}`;
}

// ============================================================
// PDF STAMPING
// ============================================================

/**
 * Adds a sachlicher Eingangsstempel to the first page of a PDF.
 * Design: Neutral box (keine Farbcodes), mit Notizen aus Validierungs-Checks.
 *
 * Layout:
 * ┌─────────────────────────────────┐
 * │ RE-2026-02-0001                 │
 * │ Eingang: 15.02.2026             │
 * │ Geprüft: 15.02.2026 14:30      │
 * │ Freigabe: Josef N.              │
 * │                                 │
 * │ Notizen:                        │
 * │ • UID-Nummer nicht vorhanden    │
 * │ • Lieferdatum nicht angegeben   │
 * └─────────────────────────────────┘
 */
export async function stampPdf(pdfBuffer: Buffer, stamp: StampData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error('PDF hat keine Seiten');

  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  // Prepare notes (max 5 lines to keep stamp compact)
  const notes = stamp.validationNotes.slice(0, 5);
  const hasNotes = notes.length > 0;
  const hasRule = !!stamp.approvalRuleName;
  const hasApprovalNote = !!stamp.approvalNote;

  // Dynamic box height based on note count + approval rule info
  const baseHeight = 62; // archivalNumber + Eingang + Geprüft + Freigabe
  const ruleHeight = hasRule ? 12 : 0;
  const approvalNoteHeight = hasApprovalNote ? 12 : 0;
  const notesHeaderHeight = hasNotes ? 14 : 0;
  const notesHeight = notes.length * 11;
  const boxHeight = baseHeight + ruleHeight + approvalNoteHeight + notesHeaderHeight + notesHeight + 8;
  const boxWidth = 240;
  const margin = 8;
  const x = width - boxWidth - margin;
  const y = height - boxHeight - margin;

  const textColor = rgb(0.2, 0.2, 0.2);
  const lightColor = rgb(0.4, 0.4, 0.4);

  // Neutral background box (kein Farbcode)
  firstPage.drawRectangle({
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.4, 0.4, 0.4),
    borderWidth: 0.8,
    opacity: 0.93,
  });

  let lineY = y + boxHeight - 16;

  // Line 1: Archival number (bold)
  firstPage.drawText(stamp.archivalNumber, {
    x: x + 8,
    y: lineY,
    size: 11,
    font: helveticaBold,
    color: textColor,
  });
  lineY -= 14;

  // Line 2: Eingangsdatum
  const eingangStr = stamp.eingangsdatum.toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  firstPage.drawText(`Eingang: ${eingangStr}`, {
    x: x + 8,
    y: lineY,
    size: 7.5,
    font: helvetica,
    color: lightColor,
  });
  lineY -= 12;

  // Line 3: Geprüft (Archivierungszeitpunkt)
  const archiveStr = stamp.archivedAt.toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  firstPage.drawText(`Geprueft: ${archiveStr}`, {
    x: x + 8,
    y: lineY,
    size: 7.5,
    font: helvetica,
    color: lightColor,
  });
  lineY -= 12;

  // Line 4: Freigabe (Approver name)
  firstPage.drawText(`Freigabe: ${stamp.approvedBy.substring(0, 40)}`, {
    x: x + 8,
    y: lineY,
    size: 7.5,
    font: helvetica,
    color: lightColor,
  });
  lineY -= 6;

  // Approval rule name (if set)
  if (hasRule) {
    lineY -= 6;
    firstPage.drawText(`Regel: ${stamp.approvalRuleName!.substring(0, 45)}`, {
      x: x + 8,
      y: lineY,
      size: 7.5,
      font: helvetica,
      color: textColor,
    });
  }

  // Approval note (if set)
  if (hasApprovalNote) {
    lineY -= 6;
    firstPage.drawText(`Anm.: ${stamp.approvalNote!.substring(0, 45)}`, {
      x: x + 8,
      y: lineY,
      size: 7,
      font: helvetica,
      color: lightColor,
    });
  }

  // Notes section (sachliche Auflistung der Prüfungsergebnisse)
  if (hasNotes) {
    lineY -= 8;
    firstPage.drawText('Notizen:', {
      x: x + 8,
      y: lineY,
      size: 7,
      font: helveticaBold,
      color: textColor,
    });
    lineY -= 11;

    for (const note of notes) {
      const bulletText = `\u2022 ${note.substring(0, 50)}`;
      firstPage.drawText(bulletText, {
        x: x + 10,
        y: lineY,
        size: 6.5,
        font: helvetica,
        color: lightColor,
      });
      lineY -= 11;
    }
  }

  const stamped = await pdfDoc.save();
  return Buffer.from(stamped);
}

// ============================================================
// IMAGE TO PDF CONVERSION
// ============================================================

/**
 * Wraps an image (JPEG, PNG, TIFF, WebP) into a single-page A4 PDF.
 * Used during archival so all archived documents can be stamped uniformly.
 */
export async function imageToPdf(imageBuffer: Buffer, mimeType: string): Promise<Buffer> {
  let processedBuffer: Buffer;
  let embedMethod: 'jpg' | 'png';

  if (mimeType === 'image/jpeg') {
    processedBuffer = imageBuffer;
    embedMethod = 'jpg';
  } else {
    // Convert TIFF, WebP, PNG to PNG for pdf-lib compatibility
    processedBuffer = await sharp(imageBuffer).png().toBuffer();
    embedMethod = 'png';
  }

  const pdfDoc = await PDFDocument.create();

  // Get image dimensions
  const metadata = await sharp(processedBuffer).metadata();
  const imgWidth = metadata.width || 595;
  const imgHeight = metadata.height || 842;

  // Scale to fit A4 page (595 x 842 points) with margin
  const pageWidth = 595;
  const pageHeight = 842;
  const pageMargin = 20;
  const maxWidth = pageWidth - 2 * pageMargin;
  const maxHeight = pageHeight - 2 * pageMargin;

  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
  const scaledWidth = imgWidth * scale;
  const scaledHeight = imgHeight * scale;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const image = embedMethod === 'jpg'
    ? await pdfDoc.embedJpg(processedBuffer)
    : await pdfDoc.embedPng(processedBuffer);

  page.drawImage(image, {
    x: (pageWidth - scaledWidth) / 2,
    y: pageHeight - scaledHeight - pageMargin, // top-aligned
    width: scaledWidth,
    height: scaledHeight,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ============================================================
// CORE ARCHIVAL FUNCTIONS
// ============================================================

/**
 * Archives a single invoice inside an interactive Prisma transaction.
 * This is the transaction body — called from archiveInvoice() or batchArchive().
 */
async function archiveInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  invoice: InvoiceForArchival,
  userId: string | undefined,
  userName: string,
  comment?: string | null,
  ruleId?: string | null,
  approvalNote?: string | null,
  approvalRuleName?: string | null,
): Promise<ArchiveResult> {
  // Guard: only APPROVED invoices can be archived (or PROCESSED/REVIEW_REQUIRED for backward compat)
  const archivableStatuses = ['APPROVED', 'PROCESSED', 'REVIEW_REQUIRED'];
  if (!archivableStatuses.includes(invoice.processingStatus)) {
    throw new ConflictError(
      `Rechnung kann nicht archiviert werden (Status: ${invoice.processingStatus}). Nur genehmigte Rechnungen sind archivierbar.`,
    );
  }

  // Guard: already archived
  if (invoice.archivalNumber) {
    throw new ConflictError(
      `Rechnung bereits archiviert als ${invoice.archivalNumber}`,
    );
  }

  // 1. Get next sequential number (SELECT FOR UPDATE)
  const prefix = getArchivalPrefix(invoice.documentType, invoice.direction);
  const refDate = invoice.invoiceDate || new Date();
  const year = refDate.getFullYear();
  const month = refDate.getMonth() + 1; // 1-12

  const { formatted: archivalNumber } = await getNextSequentialNumber(
    tx, invoice.tenantId, prefix, year, month,
  );

  // 2. Build archive path and filename
  const archivedFileName = buildArchivedFileName(archivalNumber, invoice.vendorName, invoice.invoiceDate);
  const archivedStoragePath = buildArchivePath(
    invoice.tenantId, archivalNumber, invoice.vendorName, invoice.invoiceDate,
  );

  // 3. Download original file
  let fileBuffer = await storageService.downloadFile(invoice.storagePath);

  // 4. If image, convert to PDF first
  if (invoice.mimeType !== 'application/pdf') {
    fileBuffer = await imageToPdf(fileBuffer, invoice.mimeType);
  }

  // 5. Load validation notes for stamp (RED/YELLOW checks)
  const validationNotes = await getValidationNotes(tx, invoice.id);

  // 6. Stamp the PDF (with error tolerance)
  const archivedAt = new Date();
  let stampFailed = false;
  try {
    fileBuffer = await stampPdf(fileBuffer, {
      archivalNumber,
      eingangsdatum: invoice.createdAt,
      archivedAt,
      approvedBy: userName,
      validationNotes,
      approvalRuleName,
      approvalNote,
    });
  } catch (err) {
    console.warn(`[Archival] PDF-Stempel fehlgeschlagen für ${invoice.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    stampFailed = true;
    // Continue without stamp — archival still proceeds
  }

  // 7. Upload stamped file to archive location
  await storageService.uploadFile(archivedStoragePath, fileBuffer, 'application/pdf');

  // 8. Update invoice in DB (within transaction)
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      processingStatus: 'ARCHIVED',
      archivalNumber,
      archivalPrefix: prefix,
      archivedAt,
      archivedByUserId: userId || null,
      archivedStoragePath,
      archivedFileName,
      stampFailed,
      approvalComment: comment || null,
      approvalRuleId: ruleId || null,
      approvalNote: approvalNote || null,
      inboxCleared: true,
      inboxClearedAt: archivedAt,
      isLocked: true,
      lockedAt: archivedAt,
      lockedByUserId: userId || null,
    },
  });

  return { archivalNumber, archivedStoragePath, archivedFileName, archivedAt };
}

/**
 * Loads validation check messages (RED/YELLOW) as notes for the stamp.
 */
async function getValidationNotes(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<string[]> {
  const validation = await tx.validationResult.findFirst({
    where: { invoiceId },
    orderBy: { createdAt: 'desc' },
    select: { checks: true },
  });

  if (!validation?.checks || !Array.isArray(validation.checks)) return [];

  return (validation.checks as Array<{ status: string; message: string }>)
    .filter((c) => c.status === 'RED' || c.status === 'YELLOW')
    .map((c) => c.message);
}

// ============================================================
// PUBLIC API
// ============================================================

const ARCHIVAL_SELECT = {
  id: true, tenantId: true, direction: true, documentType: true, vendorName: true,
  invoiceDate: true, storagePath: true, mimeType: true,
  processingStatus: true, isLocked: true, archivalNumber: true,
  validationStatus: true, createdAt: true,
  approvalComment: true, approvalRuleId: true, approvalNote: true,
} as const;

/**
 * Archives a single invoice. Full workflow:
 * sequential number → download → stamp PDF → upload to archive → update DB → audit log
 *
 * Approval data (rule, note, comment) is read from the invoice itself
 * (set during the separate approve step).
 */
export async function archiveInvoice(
  tenantId: string,
  userId: string | undefined,
  invoiceId: string,
  comment?: string | null,
): Promise<ArchiveResult> {
  const [invoice, user] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: ARCHIVAL_SELECT,
    }),
    userId ? prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    }) : null,
  ]);

  if (!invoice) throw new NotFoundError('Rechnung', invoiceId);
  const userName = user ? `${user.firstName} ${user.lastName}` : 'System';

  // Load rule name + type from already-saved approvalRuleId (set during approve step)
  const ruleId = invoice.approvalRuleId;
  const approvalNote = invoice.approvalNote;
  let ruleName: string | null = null;
  let ruleType: string | null = null;
  if (ruleId) {
    const rule = await prisma.deductibilityRule.findUnique({
      where: { id: ruleId },
      select: { name: true, ruleType: true },
    });
    ruleName = rule?.name || null;
    ruleType = rule?.ruleType || null;
  }

  // Prefix rule name with Privatentnahme/Privateinlage marker for PDF stamp
  const stampRuleName = ruleType === 'private_withdrawal'
    ? `⚠ Privatentnahme — ${ruleName}`
    : ruleType === 'private_deposit'
    ? `↗ Privateinlage — ${ruleName}`
    : ruleName;

  // Interactive transaction with 30s timeout (file operations may be slow)
  const archivalComment = comment || invoice.approvalComment;
  const result = await prisma.$transaction(
    async (tx) => archiveInvoiceInTransaction(tx, invoice, userId, userName, archivalComment, ruleId, approvalNote, stampRuleName),
    { timeout: 30_000 },
  );

  // Audit log (fire-and-forget, outside transaction)
  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'ARCHIVE',
    newData: {
      archivalNumber: result.archivalNumber,
      archivedStoragePath: result.archivedStoragePath,
      archivedFileName: result.archivedFileName,
      approvalRuleId: ruleId || undefined,
      approvalRuleName: ruleName || undefined,
      approvalNote: approvalNote || undefined,
    },
  });

  return result;
}

/**
 * Archives multiple invoices in a single transaction.
 * Each gets the next sequential number (guaranteed sequential, no gaps within batch).
 * Approval data (rule, note) is read from each invoice individually.
 */
export async function batchArchiveInvoices(
  tenantId: string,
  userId: string,
  invoiceIds: string[],
  comment?: string | null,
): Promise<{ archived: number; results: Array<{ invoiceId: string; archivalNumber: string }>; skipped: string[] }> {
  const [invoices, user] = await Promise.all([
    prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, tenantId },
      select: { ...ARCHIVAL_SELECT, belegNr: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    }),
  ]);

  const userName = user ? `${user.firstName} ${user.lastName}` : 'System';
  const foundMap = new Map(invoices.map((i) => [i.id, i]));
  const skipped: string[] = [];
  const archivableStatuses = ['APPROVED', 'PROCESSED', 'REVIEW_REQUIRED'];
  const toArchive: (InvoiceForArchival & { belegNr: number })[] = [];

  for (const id of invoiceIds) {
    const inv = foundMap.get(id);
    if (!inv) { skipped.push(id); continue; }
    if (!archivableStatuses.includes(inv.processingStatus)) {
      skipped.push(`BEL-${String(inv.belegNr).padStart(3, '0')} (${inv.processingStatus})`);
      continue;
    }
    if (inv.archivalNumber) {
      skipped.push(`${inv.archivalNumber} (bereits archiviert)`);
      continue;
    }
    toArchive.push(inv);
  }

  // Pre-load rule names + types for all invoices that have approvalRuleId
  const ruleIds = [...new Set(toArchive.map(i => i.approvalRuleId).filter(Boolean))] as string[];
  const ruleMap = new Map<string, { name: string; ruleType: string }>();
  if (ruleIds.length > 0) {
    const rules = await prisma.deductibilityRule.findMany({
      where: { id: { in: ruleIds } },
      select: { id: true, name: true, ruleType: true },
    });
    for (const r of rules) ruleMap.set(r.id, { name: r.name, ruleType: r.ruleType });
  }

  const results: Array<{ invoiceId: string; archivalNumber: string }> = [];

  if (toArchive.length > 0) {
    // Single transaction for all — guarantees sequential numbers without gaps
    await prisma.$transaction(
      async (tx) => {
        for (const inv of toArchive) {
          const ruleData = inv.approvalRuleId ? ruleMap.get(inv.approvalRuleId) : null;
          let stampRuleName: string | null = ruleData?.name || null;
          if (ruleData?.ruleType === 'private_withdrawal') {
            stampRuleName = `⚠ Privatentnahme — ${ruleData.name}`;
          } else if (ruleData?.ruleType === 'private_deposit') {
            stampRuleName = `↗ Privateinlage — ${ruleData.name}`;
          }
          const archivalComment = comment || inv.approvalComment;
          const res = await archiveInvoiceInTransaction(
            tx, inv, userId, userName, archivalComment,
            inv.approvalRuleId, inv.approvalNote, stampRuleName,
          );
          results.push({ invoiceId: inv.id, archivalNumber: res.archivalNumber });
        }
      },
      { timeout: toArchive.length * 15_000 },
    );

    // Audit logs (fire-and-forget, outside transaction)
    for (const res of results) {
      writeAuditLog({
        tenantId,
        userId,
        entityType: 'Invoice',
        entityId: res.invoiceId,
        action: 'ARCHIVE',
        newData: { archivalNumber: res.archivalNumber },
        metadata: { trigger: 'BATCH', batchSize: toArchive.length },
      });
    }
  }

  return { archived: results.length, results, skipped };
}

/**
 * Cancels an archival number (Storno).
 * The number is NOT reused — it's documented in cancelled_numbers.
 */
export async function cancelArchivalNumber(
  tenantId: string,
  userId: string,
  invoiceId: string,
  reason: string,
): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId, archivalNumber: { not: null } },
    select: { id: true, archivalNumber: true },
  });

  if (!invoice || !invoice.archivalNumber) {
    throw new NotFoundError('Archivierte Rechnung', invoiceId);
  }

  await prisma.cancelledNumber.create({
    data: {
      tenantId,
      archivalNumber: invoice.archivalNumber,
      invoiceId,
      reason,
      cancelledByUserId: userId,
    },
  });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'CANCEL_ARCHIVAL_NUMBER',
    newData: { archivalNumber: invoice.archivalNumber, reason },
  });
}
