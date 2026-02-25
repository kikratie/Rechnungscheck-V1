/**
 * Export Service — BMD CSV, Monthly Report PDF, Full ZIP Export
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { BMD_TAX_CODES, PAYMENT_METHODS, BOOKING_TYPES } from '@buchungsai/shared';
import * as storageService from './storage.service.js';

// ============================================================
// BMD CSV Export
// ============================================================

interface BmdExportOptions {
  tenantId: string;
  userId: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Generates BMD-compatible CSV for archived invoices.
 * Format: Semicolon delimiter, comma decimal, dd.MM.yyyy dates, ISO-8859-1 encoding.
 */
export async function generateBmdCsv(options: BmdExportOptions): Promise<Buffer> {
  const { tenantId, userId, dateFrom, dateTo } = options;

  const where: Record<string, unknown> = {
    tenantId,
    processingStatus: { in: ['ARCHIVED', 'RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'EXPORTED'] },
    archivalNumber: { not: null },
  };

  if (dateFrom || dateTo) {
    where.invoiceDate = {};
    if (dateFrom) (where.invoiceDate as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.invoiceDate as Record<string, unknown>).lte = new Date(dateTo);
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { archivalNumber: 'asc' },
    include: {
      extractedData: {
        orderBy: { version: 'desc' },
        take: 1,
      },
      customer: {
        select: { uid: true },
      },
    },
  });

  // Fetch transaction bookings for the same period (Privatentnahme/Privateinlage)
  const bookingWhere: Record<string, unknown> = { tenantId };
  if (dateFrom || dateTo) {
    bookingWhere.transaction = { transactionDate: {} };
    if (dateFrom) (bookingWhere.transaction as Record<string, Record<string, unknown>>).transactionDate.gte = new Date(dateFrom);
    if (dateTo) (bookingWhere.transaction as Record<string, Record<string, unknown>>).transactionDate.lte = new Date(dateTo);
  }
  const bookings = await prisma.transactionBooking.findMany({
    where: bookingWhere,
    include: {
      transaction: { select: { transactionDate: true, counterpartName: true, reference: true } },
    },
    orderBy: { confirmedAt: 'asc' },
  });

  // BMD CSV Header
  const headers = [
    'Belegart', 'Belegnummer', 'Datum', 'Konto', 'Gegenkonto',
    'Betrag', 'Steuercode', 'Text', 'Lieferant', 'UID', 'Leistungsart', 'Privatanteil',
  ];

  const rows: string[][] = [headers];

  for (const inv of invoices) {
    const ed = inv.extractedData[0];
    const invoiceDate = inv.invoiceDate ? formatDateBmd(inv.invoiceDate) : '';

    // Privatanteil: businessFraction = (100 - privatePercent) / 100
    const privatePercent = inv.privatePercent ?? 0;
    const businessFraction = privatePercent > 0 ? (100 - privatePercent) / 100 : 1;

    const rawGross = inv.grossAmount ? new Decimal(inv.grossAmount).toNumber() : 0;
    const exportGross = rawGross * businessFraction;
    const grossAmount = formatDecimalBmd(new Decimal(exportGross));

    const vatRate = inv.vatRate ? new Decimal(inv.vatRate).toNumber() : 20;
    const taxCode = BMD_TAX_CODES[vatRate] || 'V20';
    const direction = inv.direction === 'INCOMING' ? 'ER' : 'AR';
    const serviceType = ed?.serviceType || '';

    // Gegenkonto: CASH → 2700 (Kassa), BANK → 2800 (Bank)
    const paymentMethod = (inv.paymentMethod || 'BANK') as keyof typeof PAYMENT_METHODS;
    const gegenkonto = PAYMENT_METHODS[paymentMethod]?.gegenkontoDefault || '2800';

    // For OUTGOING: use customer info; for INCOMING: use vendor info
    const partnerName = inv.direction === 'OUTGOING'
      ? (inv.customerName || inv.vendorName || '')
      : (inv.vendorName || '');
    const partnerUid = inv.direction === 'OUTGOING'
      ? (inv.customer?.uid || '')
      : (inv.vendorUid || '');

    rows.push([
      direction,
      inv.archivalNumber || '',
      invoiceDate,
      inv.accountNumber || '',
      gegenkonto,
      grossAmount,
      taxCode,
      partnerName,
      partnerName,
      partnerUid,
      serviceType,
      privatePercent > 0 ? `${privatePercent}%` : '',
    ]);
  }

  // TransactionBookings (Privatentnahme/Privateinlage) als eigene Zeilen
  for (const booking of bookings) {
    const bookingDate = booking.transaction.transactionDate
      ? formatDateBmd(booking.transaction.transactionDate)
      : '';
    const bookingAmount = formatDecimalBmd(new Decimal(booking.amount));
    const bookingTypeKey = booking.bookingType as keyof typeof BOOKING_TYPES;
    const label = BOOKING_TYPES[bookingTypeKey]?.label || booking.bookingType;

    rows.push([
      'SO',  // Sonstige Buchung
      '',
      bookingDate,
      booking.accountNumber,  // 9600 or 9610
      '2800',                 // Gegenkonto Bank
      bookingAmount,
      '',                     // kein Steuercode
      `${label}${booking.notes ? ': ' + booking.notes : ''}`,
      booking.transaction.counterpartName || '',
      '',
      '',
      '',
    ]);
  }

  // Build CSV with semicolons
  const csvContent = rows.map(row =>
    row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';'),
  ).join('\r\n');

  // Mark exported invoices
  const invoiceIds = invoices.filter(i => i.processingStatus !== 'EXPORTED').map(i => i.id);
  if (invoiceIds.length > 0) {
    await prisma.invoice.updateMany({
      where: { id: { in: invoiceIds } },
      data: { processingStatus: 'EXPORTED' },
    });
  }

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Export',
    entityId: 'bmd-csv',
    action: 'BMD_CSV_EXPORT',
    newData: { invoiceCount: invoices.length, bookingCount: bookings.length, dateFrom, dateTo },
  });

  // Encode as ISO-8859-1 (Latin-1) for BMD compatibility
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(csvContent);
  // Simple UTF-8 passthrough — for full ISO-8859-1 we'd use iconv-lite
  // but BMD also accepts UTF-8 with BOM
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  return Buffer.concat([bom, Buffer.from(utf8Bytes)]);
}

// ============================================================
// Full ZIP Export
// ============================================================

export async function generateFullExport(
  tenantId: string,
  userId: string,
  year?: number,
): Promise<Buffer> {
  const archiver = (await import('archiver')).default;

  const where: Record<string, unknown> = {
    tenantId,
    archivedStoragePath: { not: null },
  };

  if (year) {
    where.invoiceDate = {
      gte: new Date(year, 0, 1),
      lte: new Date(year, 11, 31, 23, 59, 59),
    };
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { archivalNumber: 'asc' },
    select: {
      id: true,
      archivalNumber: true,
      archivedStoragePath: true,
      archivedFileName: true,
      invoiceDate: true,
      direction: true,
    },
  });

  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => {
      writeAuditLog({
        tenantId,
        userId,
        entityType: 'Export',
        entityId: 'full-zip',
        action: 'FULL_EXPORT',
        newData: { invoiceCount: invoices.length, year },
      });
      resolve(Buffer.concat(chunks));
    });
    archive.on('error', reject);

    // Add files organized by month
    const addFilesAsync = async () => {
      // Generate summary CSV
      const summaryRows = [
        ['Typ', 'Belegnummer', 'Datum', 'Dateiname'].join(';'),
        ...invoices.map(inv => [
          inv.direction === 'OUTGOING' ? 'AR' : 'ER',
          inv.archivalNumber || '',
          inv.invoiceDate ? formatDateBmd(inv.invoiceDate) : '',
          inv.archivedFileName || '',
        ].join(';')),
      ];
      archive.append(summaryRows.join('\r\n'), { name: 'summary.csv' });

      // Add archived PDFs — organized by direction/month
      for (const inv of invoices) {
        if (!inv.archivedStoragePath) continue;
        try {
          const fileBuffer = await storageService.downloadFile(inv.archivedStoragePath);
          const dirPrefix = inv.direction === 'OUTGOING' ? 'AR-Ausgang' : 'ER-Eingang';
          const month = inv.invoiceDate
            ? `${inv.invoiceDate.getFullYear()}-${String(inv.invoiceDate.getMonth() + 1).padStart(2, '0')}`
            : 'ohne-datum';
          archive.append(fileBuffer, { name: `${dirPrefix}/${month}/${inv.archivedFileName || inv.archivalNumber + '.pdf'}` });
        } catch (err) {
          console.warn(`[Export] Datei nicht gefunden: ${inv.archivedStoragePath}`, err);
        }
      }

      archive.finalize();
    };

    addFilesAsync().catch(reject);
  });
}

// ============================================================
// OCR Check CSV Export
// ============================================================

interface OcrCheckExportOptions {
  tenantId: string;
  userId: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Generates a CSV for OCR quality checking — includes extracted data + confidence scores.
 */
export async function generateOcrCheckCsv(options: OcrCheckExportOptions): Promise<Buffer> {
  const { tenantId, userId, dateFrom, dateTo } = options;

  const where: Record<string, unknown> = {
    tenantId,
    processingStatus: { notIn: ['INBOX'] },
  };

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { belegNr: 'asc' },
    include: {
      extractedData: {
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  const headers = [
    'InvoiceID', 'BelegNr', 'ArchivalNumber', 'IssuerName', 'InvoiceNumber',
    'InvoiceDate', 'NetAmount', 'VatAmount', 'GrossAmount', 'VatRate',
    'Currency', 'Source', 'PipelineStage',
    'Conf_IssuerName', 'Conf_InvoiceNumber', 'Conf_InvoiceDate',
    'Conf_NetAmount', 'Conf_VatAmount', 'Conf_GrossAmount',
    'ProcessingStatus', 'ValidationStatus',
  ];

  const rows: string[][] = [headers];

  for (const inv of invoices) {
    const ed = inv.extractedData[0];
    const conf = (ed?.confidenceScores as Record<string, number> | null) || {};

    rows.push([
      inv.id,
      String(inv.belegNr),
      inv.archivalNumber || '',
      ed?.issuerName || inv.vendorName || '',
      ed?.invoiceNumber || inv.invoiceNumber || '',
      inv.invoiceDate ? formatDateBmd(inv.invoiceDate) : '',
      ed?.netAmount ? new Decimal(ed.netAmount).toFixed(2) : '',
      ed?.vatAmount ? new Decimal(ed.vatAmount).toFixed(2) : '',
      inv.grossAmount ? new Decimal(inv.grossAmount).toFixed(2) : '',
      inv.vatRate ? new Decimal(inv.vatRate).toFixed(1) : '',
      inv.currency || 'EUR',
      ed?.source || '',
      ed?.pipelineStage || '',
      conf.issuerName != null ? conf.issuerName.toFixed(4) : '',
      conf.invoiceNumber != null ? conf.invoiceNumber.toFixed(4) : '',
      conf.invoiceDate != null ? conf.invoiceDate.toFixed(4) : '',
      conf.netAmount != null ? conf.netAmount.toFixed(4) : '',
      conf.vatAmount != null ? conf.vatAmount.toFixed(4) : '',
      conf.grossAmount != null ? conf.grossAmount.toFixed(4) : '',
      inv.processingStatus,
      inv.validationStatus,
    ]);
  }

  const csvContent = rows.map(row =>
    row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';'),
  ).join('\r\n');

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Export',
    entityId: 'ocr-check',
    action: 'OCR_CHECK_EXPORT',
    newData: { invoiceCount: invoices.length, dateFrom, dateTo },
  });

  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  return Buffer.concat([bom, Buffer.from(csvContent)]);
}

// ============================================================
// Helpers
// ============================================================

function formatDateBmd(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

function formatDecimalBmd(decimal: Decimal): string {
  return decimal.toFixed(2).replace('.', ',');
}
