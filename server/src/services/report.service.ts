/**
 * Report Service — Monthly Report PDF generation
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeAuditLog } from '../middleware/auditLogger.js';

interface MonthlyReportOptions {
  tenantId: string;
  userId: string;
  year: number;
  month: number;
}

/**
 * Generates a monthly report PDF with:
 * - Header: Tenant name, period, date
 * - Summary: Invoice count, traffic light distribution, net/VAT totals
 * - Invoice table: Nr., Date, Vendor, Net, VAT, Gross, Status
 * - Open items, parked invoices, payment differences
 */
export async function generateMonthlyReport(options: MonthlyReportOptions): Promise<Buffer> {
  const { tenantId, userId, year, month } = options;

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // Load data
  const [tenant, invoices, parkedInvoices] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.invoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: periodStart, lte: periodEnd },
        processingStatus: { notIn: ['UPLOADED', 'PROCESSING', 'ERROR'] },
      },
      orderBy: { archivalNumber: 'asc' },
      select: {
        archivalNumber: true,
        vendorName: true,
        customerName: true,
        invoiceDate: true,
        netAmount: true,
        vatAmount: true,
        grossAmount: true,
        vatRate: true,
        currency: true,
        direction: true,
        validationStatus: true,
        processingStatus: true,
      },
    }),
    prisma.invoice.count({
      where: { tenantId, processingStatus: 'PARKED' },
    }),
  ]);

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 842; // A4 landscape
  const pageHeight = 595;
  const margin = 40;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const textColor = rgb(0.1, 0.1, 0.1);
  const headerColor = rgb(0.2, 0.4, 0.7);
  const lightGray = rgb(0.6, 0.6, 0.6);

  // Helper: draw text
  const drawText = (text: string, x: number, yPos: number, size: number, f = font, color = textColor) => {
    page.drawText(text, { x, y: yPos, size, font: f, color });
  };

  // Header
  drawText(`Monatsreport ${monthStr}`, margin, y, 18, fontBold, headerColor);
  y -= 20;
  drawText(`${tenant?.name || 'Unbekannt'} — Erstellt am ${new Date().toLocaleDateString('de-AT')}`, margin, y, 10, font, lightGray);
  y -= 30;

  // Summary — split by direction
  const incoming = invoices.filter(i => i.direction !== 'OUTGOING');
  const outgoing = invoices.filter(i => i.direction === 'OUTGOING');

  const sumGross = (list: typeof invoices) => list.reduce((s, i) => s + (i.grossAmount ? new Decimal(i.grossAmount).toNumber() : 0), 0);
  const sumNet = (list: typeof invoices) => list.reduce((s, i) => s + (i.netAmount ? new Decimal(i.netAmount).toNumber() : 0), 0);
  const sumVat = (list: typeof invoices) => list.reduce((s, i) => s + (i.vatAmount ? new Decimal(i.vatAmount).toNumber() : 0), 0);

  const totalNet = sumNet(invoices);
  const totalVat = sumVat(invoices);
  const totalGross = sumGross(invoices);
  const greenCount = invoices.filter(i => i.validationStatus === 'VALID').length;
  const yellowCount = invoices.filter(i => i.validationStatus === 'WARNING').length;
  const redCount = invoices.filter(i => i.validationStatus === 'INVALID').length;

  drawText('Zusammenfassung', margin, y, 12, fontBold);
  y -= 16;
  drawText(`Belege: ${invoices.length} (${incoming.length} Eingang, ${outgoing.length} Ausgang) | Gruen: ${greenCount} | Gelb: ${yellowCount} | Rot: ${redCount} | Geparkt: ${parkedInvoices}`, margin, y, 9);
  y -= 14;
  drawText(`Gesamt — Netto: ${totalNet.toFixed(2)} EUR | USt: ${totalVat.toFixed(2)} EUR | Brutto: ${totalGross.toFixed(2)} EUR`, margin, y, 9);
  y -= 14;
  if (incoming.length > 0) {
    drawText(`Ausgaben (ER): Netto ${sumNet(incoming).toFixed(2)} EUR | USt ${sumVat(incoming).toFixed(2)} EUR | Brutto ${sumGross(incoming).toFixed(2)} EUR`, margin, y, 9);
    y -= 14;
  }
  if (outgoing.length > 0) {
    drawText(`Einnahmen (AR): Netto ${sumNet(outgoing).toFixed(2)} EUR | USt ${sumVat(outgoing).toFixed(2)} EUR | Brutto ${sumGross(outgoing).toFixed(2)} EUR`, margin, y, 9);
    y -= 14;
  }
  y -= 10;

  // Table header
  drawText('Belege', margin, y, 12, fontBold);
  y -= 16;

  const cols = [margin, margin + 30, margin + 110, margin + 200, margin + 320, margin + 400, margin + 480, margin + 560, margin + 640, margin + 720];
  const colHeaders = ['Typ', 'Nr.', 'Datum', 'Lieferant/Kunde', 'Netto', 'USt', 'Brutto', 'Ampel', 'Status'];

  for (let i = 0; i < colHeaders.length; i++) {
    drawText(colHeaders[i], cols[i], y, 8, fontBold);
  }
  y -= 12;

  // Sort: incoming first, then outgoing (each sorted by archivalNumber)
  const sortedInvoices = [...invoices].sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'INCOMING' ? -1 : 1;
    return (a.archivalNumber || '').localeCompare(b.archivalNumber || '');
  });

  // Table rows
  for (const inv of sortedInvoices) {
    if (y < margin + 20) {
      // New page
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    const typ = inv.direction === 'OUTGOING' ? 'AR' : 'ER';
    const dateStr = inv.invoiceDate ? inv.invoiceDate.toLocaleDateString('de-AT') : '-';
    const name = (inv.direction === 'OUTGOING' ? inv.customerName || inv.vendorName : inv.vendorName || inv.customerName || '-')?.substring(0, 20) || '-';
    const net = inv.netAmount ? new Decimal(inv.netAmount).toFixed(2) : '-';
    const vat = inv.vatAmount ? new Decimal(inv.vatAmount).toFixed(2) : '-';
    const gross = inv.grossAmount ? new Decimal(inv.grossAmount).toFixed(2) : '-';
    const ampel = inv.validationStatus === 'VALID' ? 'Gruen' :
      inv.validationStatus === 'WARNING' ? 'Gelb' :
      inv.validationStatus === 'INVALID' ? 'Rot' : 'Offen';
    const status = inv.processingStatus;

    const rowData = [typ, inv.archivalNumber || '-', dateStr, name, net, vat, gross, ampel, status];
    for (let i = 0; i < rowData.length; i++) {
      drawText(rowData[i], cols[i], y, 7);
    }
    y -= 11;
  }

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'Export',
    entityId: 'monthly-report',
    action: 'MONTHLY_REPORT_GENERATED',
    newData: { year, month, invoiceCount: invoices.length },
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
