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
    processingStatus: { in: ['APPROVED', 'ARCHIVED', 'RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'EXPORTED'] },
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
      approvalRule: {
        select: { name: true, inputTaxPercent: true, expensePercent: true, ruleType: true },
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
    'Abzugsregel', 'Buchungsart', 'VSt-Abzug %', 'BA-Abzug %', 'VSt-Betrag', 'BA-Betrag', 'Anmerkung',
  ];

  const rows: string[][] = [headers];

  for (const inv of invoices) {
    const ed = inv.extractedData[0];
    const invoiceDate = inv.invoiceDate ? formatDateBmd(inv.invoiceDate) : '';

    const rawGross = inv.grossAmount ? new Decimal(inv.grossAmount).toNumber() : 0;
    const rawVat = inv.vatAmount ? new Decimal(inv.vatAmount).toNumber() : 0;
    const vatRate = inv.vatRate ? new Decimal(inv.vatRate).toNumber() : 20;
    const direction = inv.direction === 'INCOMING' ? 'ER' : 'AR';
    const serviceType = ed?.serviceType || '';

    // For OUTGOING: use customer info; for INCOMING: use vendor info
    const partnerName = inv.direction === 'OUTGOING'
      ? (inv.customerName || inv.vendorName || '')
      : (inv.vendorName || '');
    const partnerUid = inv.direction === 'OUTGOING'
      ? (inv.customer?.uid || '')
      : (inv.vendorUid || '');

    const rule = inv.approvalRule;
    const ruleType = rule?.ruleType || 'standard';

    // Gegenkonto: CASH → 2700 (Kassa), BANK → 2800 (Bank)
    const paymentMethod = (inv.paymentMethod || 'BANK') as keyof typeof PAYMENT_METHODS;
    const defaultGegenkonto = PAYMENT_METHODS[paymentMethod]?.gegenkontoDefault || '2800';

    // Privatanteil: businessFraction = (100 - privatePercent) / 100
    const privatePercent = inv.privatePercent ?? 0;
    const businessFraction = privatePercent > 0 ? (100 - privatePercent) / 100 : 1;

    let konto: string;
    let gegenkonto: string;
    let exportGross: number;
    let taxCode: string;
    let vstBetrag: number;
    let baBetrag: number;
    let buchungsart: string;

    if (ruleType === 'private_withdrawal') {
      // Privatentnahme: Konto 9600, kein VSt, kein BA
      // privatePercent wird ignoriert — gesamter Betrag ist privat
      konto = '9600';
      gegenkonto = defaultGegenkonto;
      exportGross = rawGross;
      taxCode = '';        // Kein Steuercode bei Privatentnahme
      vstBetrag = 0;
      baBetrag = 0;
      buchungsart = 'Privatentnahme';
    } else if (ruleType === 'private_deposit') {
      // Privateinlage: Normale Betriebsausgabe, aber Gegenkonto 9610
      konto = inv.accountNumber || '7000';
      gegenkonto = '9610';  // Privateinlage statt Bank/Kassa
      exportGross = rawGross * businessFraction;
      taxCode = BMD_TAX_CODES[vatRate] || 'V20';
      const inputTaxPct = rule ? new Decimal(rule.inputTaxPercent).toNumber() : 100;
      const expensePct = rule ? new Decimal(rule.expensePercent).toNumber() : 100;
      vstBetrag = rawVat * (inputTaxPct / 100) * businessFraction;
      baBetrag = rawGross * (expensePct / 100) * businessFraction;
      buchungsart = 'Privateinlage';
    } else {
      // Standard: Wie bisher
      konto = inv.accountNumber || '';
      gegenkonto = defaultGegenkonto;
      exportGross = rawGross * businessFraction;
      taxCode = BMD_TAX_CODES[vatRate] || 'V20';
      const inputTaxPct = rule ? new Decimal(rule.inputTaxPercent).toNumber() : 100;
      const expensePct = rule ? new Decimal(rule.expensePercent).toNumber() : 100;
      vstBetrag = rawVat * (inputTaxPct / 100) * businessFraction;
      baBetrag = rawGross * (expensePct / 100) * businessFraction;
      buchungsart = 'Standard';
    }

    const inputTaxPctDisplay = rule ? new Decimal(rule.inputTaxPercent).toNumber() : 100;
    const expensePctDisplay = rule ? new Decimal(rule.expensePercent).toNumber() : 100;

    rows.push([
      direction,
      inv.archivalNumber || '',
      invoiceDate,
      konto,
      gegenkonto,
      formatDecimalBmd(new Decimal(exportGross)),
      taxCode,
      partnerName,
      partnerName,
      partnerUid,
      serviceType,
      privatePercent > 0 ? `${privatePercent}%` : '',
      rule?.name || '',
      buchungsart,
      rule ? `${inputTaxPctDisplay}` : '',
      rule ? `${expensePctDisplay}` : '',
      formatDecimalBmd(new Decimal(vstBetrag)),
      formatDecimalBmd(new Decimal(baBetrag)),
      inv.approvalNote || '',
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
      '', '', '', '', '', '', // Abzugsregel Spalten
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
// Export Config CRUD
// ============================================================

export async function getExportConfigs(tenantId: string) {
  return prisma.exportConfig.findMany({
    where: { tenantId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

export async function createExportConfig(tenantId: string, data: {
  name: string;
  format: 'CSV_GENERIC' | 'BMD_CSV' | 'BMD_XML';
  delimiter?: string;
  dateFormat?: string;
  decimalSeparator?: string;
  encoding?: string;
  includeHeader?: boolean;
  columnMapping?: Record<string, string>;
}) {
  return prisma.exportConfig.create({
    data: {
      tenantId,
      name: data.name,
      format: data.format,
      delimiter: data.delimiter ?? ';',
      dateFormat: data.dateFormat ?? 'dd.MM.yyyy',
      decimalSeparator: data.decimalSeparator ?? ',',
      encoding: data.encoding ?? 'UTF-8',
      includeHeader: data.includeHeader ?? true,
      columnMapping: data.columnMapping ?? {},
    },
  });
}

export async function updateExportConfig(tenantId: string, configId: string, data: {
  name?: string;
  format?: 'CSV_GENERIC' | 'BMD_CSV' | 'BMD_XML';
  delimiter?: string;
  dateFormat?: string;
  decimalSeparator?: string;
  encoding?: string;
  includeHeader?: boolean;
  columnMapping?: Record<string, string>;
  isDefault?: boolean;
}) {
  // Verify ownership + not system
  const config = await prisma.exportConfig.findFirst({
    where: { id: configId, tenantId },
  });
  if (!config) throw new Error('Export-Profil nicht gefunden');
  if (config.isSystem) throw new Error('System-Profile können nicht bearbeitet werden');

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await prisma.exportConfig.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.exportConfig.update({
    where: { id: configId },
    data,
  });
}

export async function deleteExportConfig(tenantId: string, configId: string) {
  const config = await prisma.exportConfig.findFirst({
    where: { id: configId, tenantId },
  });
  if (!config) throw new Error('Export-Profil nicht gefunden');
  if (config.isSystem) throw new Error('System-Profile können nicht gelöscht werden');

  return prisma.exportConfig.delete({ where: { id: configId } });
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
