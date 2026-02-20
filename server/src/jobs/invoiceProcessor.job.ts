import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { downloadFile } from '../services/storage.service.js';
import { extractInvoiceData } from '../services/ocr.service.js';
import { runValidationAndSync } from '../services/invoice.service.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { findOrCreateVendor } from '../services/vendor.service.js';

interface InvoiceJobData {
  invoiceId: string;
  tenantId: string;
  storagePath: string;
  mimeType: string;
}

/**
 * Robuste Konvertierung von LLM-Feldern zu number | null.
 * Das LLM gibt Beträge manchmal als String zurück ("1234.56" statt 1234.56).
 */
function parseNumericField(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (!cleaned) return null;
    // Europäisches Format: "1.234,56" → 1234.56
    if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    const num = parseFloat(cleaned.replace(',', '.'));
    if (!isNaN(num)) return num;
  }
  return null;
}

export async function processInvoiceJob(job: Job<InvoiceJobData>): Promise<void> {
  const { invoiceId, tenantId, storagePath, mimeType } = job.data;
  const startTime = Date.now();

  try {
    // Update status to PROCESSING
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { processingStatus: 'PROCESSING' },
    });

    // Download file from S3
    const fileBuffer = await downloadFile(storagePath);

    // Run OCR pipeline
    const extraction = await extractInvoiceData(fileBuffer, mimeType);
    const fields = extraction.fields;

    // Compute overall confidence
    const confidenceValues = Object.values(extraction.confidenceScores).filter(
      (v): v is number => typeof v === 'number' && v > 0,
    );
    const avgConfidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
        : 0;

    // Fallback: Kein Leistungszeitraum → Rechnungsdatum übernehmen
    const invoiceDate = fields.invoiceDate ? new Date(fields.invoiceDate as string) : null;
    const deliveryDate = fields.deliveryDate
      ? new Date(fields.deliveryDate as string)
      : invoiceDate; // §11 Abs 1 Z 4 UStG: Rechnungsdatum gilt als Leistungsdatum

    // Parse amounts robustly (LLM may return strings)
    let netAmount = parseNumericField(fields.netAmount);
    let vatAmount = parseNumericField(fields.vatAmount);
    let grossAmount = parseNumericField(fields.grossAmount);
    const vatRate = parseNumericField(fields.vatRate);

    // Derive missing amounts from available data
    if (grossAmount !== null && vatRate !== null) {
      if (netAmount === null) {
        netAmount = Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100;
      }
      if (vatAmount === null) {
        vatAmount = Math.round((grossAmount - (netAmount ?? grossAmount / (1 + vatRate / 100))) * 100) / 100;
      }
    } else if (netAmount !== null && vatAmount !== null && grossAmount === null) {
      grossAmount = Math.round((netAmount + vatAmount) * 100) / 100;
    } else if (grossAmount !== null && netAmount !== null && vatAmount === null) {
      vatAmount = Math.round((grossAmount - netAmount) * 100) / 100;
    } else if (grossAmount !== null && vatAmount !== null && netAmount === null) {
      netAmount = Math.round((grossAmount - vatAmount) * 100) / 100;
    }

    // Create ExtractedData Version 1
    const extractedData = await prisma.extractedData.create({
      data: {
        invoiceId,
        version: 1,
        source: 'AI',
        pipelineStage: extraction.pipelineStage,
        issuerName: (fields.issuerName as string) || null,
        issuerUid: (fields.issuerUid as string) || null,
        issuerAddress: fields.issuerAddress ? (fields.issuerAddress as Prisma.InputJsonValue) : undefined,
        issuerEmail: (fields.issuerEmail as string) || null,
        issuerIban: (fields.issuerIban as string) || null,
        recipientName: (fields.recipientName as string) || null,
        recipientUid: (fields.recipientUid as string) || null,
        recipientAddress: fields.recipientAddress ? (fields.recipientAddress as Prisma.InputJsonValue) : undefined,
        invoiceNumber: (fields.invoiceNumber as string) || null,
        sequentialNumber: (fields.sequentialNumber as string) || null,
        invoiceDate,
        deliveryDate,
        dueDate: fields.dueDate ? new Date(fields.dueDate as string) : null,
        description: (fields.description as string) || null,
        netAmount,
        vatAmount,
        grossAmount,
        vatRate,
        currency: (fields.currency as string) || 'EUR',
        isReverseCharge: (fields.isReverseCharge as boolean) || false,
        accountNumber: (fields.accountNumber as string) || null,
        costCenter: (fields.costCenter as string) || null,
        category: (fields.category as string) || null,
        confidenceScores: extraction.confidenceScores as Prisma.InputJsonValue,
      },
    });

    // Run validation + sync (zentrale Funktion — gleich für alle Pfade)
    const validationOutput = await runValidationAndSync({
      invoiceId,
      tenantId,
      extracted: extractedData,
      extractedDataVersion: 1,
    });

    // Auto-link to vendor (find or create)
    let vendorId: string | undefined;
    if (extractedData.issuerName) {
      try {
        vendorId = await findOrCreateVendor({
          tenantId,
          name: extractedData.issuerName,
          uid: extractedData.issuerUid,
          address: extractedData.issuerAddress as Record<string, string> | null,
          email: extractedData.issuerEmail,
          iban: extractedData.issuerIban,
          viesInfo: validationOutput.viesInfo,
        });
      } catch (err) {
        console.error(`Vendor auto-link failed for ${invoiceId}:`, err);
      }
    }

    // Worker-specific fields on top of what runValidationAndSync already set
    const processingStatus =
      validationOutput.overallStatus === 'GREEN' ? 'PROCESSED' : 'REVIEW_REQUIRED';

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        processingStatus,
        vendorId: vendorId || undefined,
        aiConfidence: avgConfidence,
        aiRawResponse: extraction.rawResponse as Prisma.InputJsonValue,
      },
    });

    const duration = Date.now() - startTime;

    writeAuditLog({
      tenantId,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: 'AI_PROCESSED',
      newData: {
        confidence: avgConfidence,
        pipelineStage: extraction.pipelineStage,
        overallStatus: validationOutput.overallStatus,
        duration_ms: duration,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error(`Invoice processing error for ${invoiceId}:`, errorMessage);

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        processingStatus: 'ERROR',
        processingError: errorMessage,
      },
    });

    writeAuditLog({
      tenantId,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: 'PROCESSING_ERROR',
      newData: { error: errorMessage },
    });

    throw error;
  }
}
