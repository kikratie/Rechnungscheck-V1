import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import sharp from 'sharp';
import { callLlm, INVOICE_EXTRACTION_SYSTEM_PROMPT } from './llm.service.js';

interface ExtractionResult {
  fields: Record<string, unknown>;
  confidenceScores: Record<string, number>;
  rawResponse: unknown;
  pipelineStage: 'TEXT_EXTRACTION' | 'VISION_OCR' | 'VISION_OCR_ENHANCED';
}

const MIN_TEXT_LENGTH = 10;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * OCR pipeline:
 * - PDFs (digital): pdf-parse text extraction → LLM
 * - PDFs (scan): mupdf renders to PNG → GPT-4o Vision
 * - Images (JPEG, PNG, WebP): direct GPT-4o Vision
 * - TIFF: sharp converts to PNG → GPT-4o Vision
 * - Low confidence: sharp enhancement + retry
 */
export async function extractInvoiceData(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  if (mimeType === 'application/pdf') {
    return await extractPdf(fileBuffer);
  }

  // TIFF: convert to PNG first
  if (mimeType === 'image/tiff') {
    const pngBuffer = await sharp(fileBuffer).png().toBuffer();
    return await extractWithVision(pngBuffer, 'image/png', fileBuffer);
  }

  // JPEG, PNG, WebP: direct Vision OCR
  return await extractWithVision(fileBuffer, mimeType, fileBuffer);
}

async function extractPdf(fileBuffer: Buffer): Promise<ExtractionResult> {
  // Stage 1: Try text extraction for digital PDFs
  let extractedText = '';
  try {
    const pdfData = await pdfParse(fileBuffer);
    extractedText = pdfData.text?.trim() || '';
  } catch (err) {
    console.error('pdf-parse failed:', err);
  }

  if (extractedText.length >= MIN_TEXT_LENGTH) {
    return await extractFromText(extractedText);
  }

  // Stage 2: Scan-PDF — render first page to PNG with mupdf, then Vision OCR
  console.log('PDF hat keinen Text — rendere als Bild mit mupdf...');
  const pngBuffer = await renderPdfPageToPng(fileBuffer);
  return await extractWithVision(pngBuffer, 'image/png', pngBuffer);
}

async function renderPdfPageToPng(pdfBuffer: Buffer): Promise<Buffer> {
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
  const page = doc.loadPage(0);

  // Render at 2x resolution for better OCR quality (default 72 DPI → 144 DPI)
  const scale = 2;
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const pngData = pixmap.asPNG();

  return Buffer.from(pngData);
}

async function extractWithVision(
  visionBuffer: Buffer,
  visionMime: string,
  originalBuffer: Buffer,
): Promise<ExtractionResult> {
  const result = await extractFromImage(visionBuffer, visionMime);

  // Stage 3: If confidence is low, preprocess and retry
  const avgConfidence = computeAverageConfidence(result.confidenceScores);
  if (avgConfidence < LOW_CONFIDENCE_THRESHOLD) {
    try {
      const enhanced = await sharp(originalBuffer)
        .greyscale()
        .normalise()
        .sharpen()
        .png()
        .toBuffer();
      const retryResult = await extractFromImage(enhanced, 'image/png');
      const retryAvg = computeAverageConfidence(retryResult.confidenceScores);
      if (retryAvg > avgConfidence) {
        return { ...retryResult, pipelineStage: 'VISION_OCR_ENHANCED' };
      }
    } catch {
      // Enhancement failed, return original result
    }
  }

  return result;
}

async function extractFromText(text: string): Promise<ExtractionResult> {
  const response = await callLlm({
    task: 'invoice_extraction',
    systemPrompt: INVOICE_EXTRACTION_SYSTEM_PROMPT,
    userContent: `Extrahiere die Rechnungsdaten aus folgendem Text:\n\n${text}`,
    temperature: 0.1,
  });

  const parsed = JSON.parse(response.content);

  return {
    fields: normalizeFields(parsed.fields || {}),
    confidenceScores: parsed.confidence || {},
    rawResponse: { model: response.model, usage: response.usage, notes: parsed.notes },
    pipelineStage: 'TEXT_EXTRACTION',
  };
}

async function extractFromImage(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  const base64 = fileBuffer.toString('base64');

  const response = await callLlm({
    task: 'invoice_extraction_vision',
    systemPrompt: INVOICE_EXTRACTION_SYSTEM_PROMPT,
    userContent: [
      {
        type: 'text',
        text: 'Extrahiere die Rechnungsdaten aus diesem Bild:',
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
          detail: 'high',
        },
      },
    ],
    temperature: 0.1,
  });

  const parsed = JSON.parse(response.content);

  return {
    fields: normalizeFields(parsed.fields || {}),
    confidenceScores: parsed.confidence || {},
    rawResponse: { model: response.model, usage: response.usage, notes: parsed.notes },
    pipelineStage: 'VISION_OCR',
  };
}

/**
 * Numerische Felder aus LLM-Antwort normalisieren.
 * GPT gibt manchmal Zahlen als Strings zurück — hier zwangskonvertieren.
 */
const NUMERIC_FIELDS = ['netAmount', 'vatAmount', 'grossAmount', 'vatRate'];

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...fields };
  for (const key of NUMERIC_FIELDS) {
    const val = normalized[key];
    if (val === null || val === undefined) continue;
    if (typeof val === 'number') continue;
    if (typeof val === 'string') {
      const cleaned = val.trim();
      if (!cleaned) { normalized[key] = null; continue; }
      // Europäisches Format: "1.234,56" → 1234.56
      if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
        normalized[key] = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
        continue;
      }
      const num = parseFloat(cleaned.replace(',', '.'));
      normalized[key] = isNaN(num) ? null : num;
    }
  }
  return normalized;
}

function computeAverageConfidence(scores: Record<string, number>): number {
  const values = Object.values(scores).filter((v) => typeof v === 'number' && v > 0);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
