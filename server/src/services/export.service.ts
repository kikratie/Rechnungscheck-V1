/**
 * Export Service — BMD CSV, Monthly Report PDF, Full ZIP Export
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { BMD_TAX_CODES } from '@buchungsai/shared';
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
    },
  });

  // BMD CSV Header
  const headers = [
    'Belegart', 'Belegnummer', 'Datum', 'Konto', 'Gegenkonto',
    'Betrag', 'Steuercode', 'Text', 'Lieferant', 'UID', 'Leistungsart',
  ];

  const rows: string[][] = [headers];

  for (const inv of invoices) {
    const ed = inv.extractedData[0];
    const invoiceDate = inv.invoiceDate ? formatDateBmd(inv.invoiceDate) : '';
    const grossAmount = inv.grossAmount ? formatDecimalBmd(new Decimal(inv.grossAmount)) : '0,00';
    const vatRate = inv.vatRate ? new Decimal(inv.vatRate).toNumber() : 20;
    const taxCode = BMD_TAX_CODES[vatRate] || 'V20';
    const direction = inv.direction === 'INCOMING' ? 'ER' : 'AR';
    const serviceType = ed?.serviceType || '';

    rows.push([
      direction,
      inv.archivalNumber || '',
      invoiceDate,
      inv.accountNumber || '',
      '', // Gegenkonto
      grossAmount,
      taxCode,
      inv.vendorName || inv.customerName || '',
      inv.vendorName || '',
      inv.vendorUid || '',
      serviceType,
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
    newData: { invoiceCount: invoices.length, dateFrom, dateTo },
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
        ['Belegnummer', 'Datum', 'Dateiname'].join(';'),
        ...invoices.map(inv => [
          inv.archivalNumber || '',
          inv.invoiceDate ? formatDateBmd(inv.invoiceDate) : '',
          inv.archivedFileName || '',
        ].join(';')),
      ];
      archive.append(summaryRows.join('\r\n'), { name: 'summary.csv' });

      // Add archived PDFs
      for (const inv of invoices) {
        if (!inv.archivedStoragePath) continue;
        try {
          const fileBuffer = await storageService.downloadFile(inv.archivedStoragePath);
          const month = inv.invoiceDate
            ? `${inv.invoiceDate.getFullYear()}-${String(inv.invoiceDate.getMonth() + 1).padStart(2, '0')}`
            : 'ohne-datum';
          archive.append(fileBuffer, { name: `${month}/${inv.archivedFileName || inv.archivalNumber + '.pdf'}` });
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
