// @ts-expect-error pdf-parse v2 ESM types not resolved by bundler moduleResolution
import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';
import { callLlm, INVOICE_EXTRACTION_SYSTEM_PROMPT } from './llm.service.js';

interface ExtractionResult {
  fields: Record<string, unknown>;
  confidenceScores: Record<string, number>;
  rawResponse: unknown;
  pipelineStage: 'TEXT_EXTRACTION' | 'VISION_OCR' | 'VISION_OCR_ENHANCED';
}

const MIN_TEXT_LENGTH = 50;
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
  const t0 = Date.now();
  console.log(`[OCR] Start: ${mimeType}, ${(fileBuffer.length / 1024).toFixed(0)} KB`);

  let result: ExtractionResult;

  if (mimeType === 'application/pdf') {
    result = await extractPdf(fileBuffer);
  } else if (mimeType === 'image/tiff') {
    // TIFF: convert to PNG first
    const pngBuffer = await sharp(fileBuffer).png().toBuffer();
    result = await extractWithVision(pngBuffer, 'image/png', fileBuffer);
  } else {
    // JPEG, PNG, WebP: direct Vision OCR
    result = await extractWithVision(fileBuffer, mimeType, fileBuffer);
  }

  console.log(`[OCR] Fertig: ${result.pipelineStage} in ${Date.now() - t0}ms`);
  return result;
}

async function extractPdf(fileBuffer: Buffer): Promise<ExtractionResult> {
  // Stage 1: Try text extraction for digital PDFs
  let extractedText = '';
  let parser: InstanceType<typeof PDFParse> | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    const textResult = await parser.getText();
    extractedText = textResult.text?.trim() || '';
  } catch (err) {
    console.error('[OCR] pdf-parse failed:', err);
  } finally {
    try { await parser?.destroy(); } catch { /* ignore cleanup errors */ }
  }

  if (extractedText.length >= MIN_TEXT_LENGTH) {
    console.log(`[OCR] Text-Layer OK (${extractedText.length} Zeichen) → LLM-Extraktion`);
    const t0 = Date.now();
    const result = await extractFromText(extractedText);
    console.log(`[OCR] TEXT_EXTRACTION abgeschlossen in ${Date.now() - t0}ms`);
    return result;
  }

  // Stage 2: Scan-PDF — render first page to PNG with mupdf, then Vision OCR
  console.log(`[OCR] Text-Layer zu kurz (${extractedText.length} Zeichen) → Vision OCR`);
  const t0 = Date.now();
  const pngBuffer = await renderPdfPageToPng(fileBuffer);
  // Pass partial text layer for IBAN cross-check (even short text may contain an IBAN)
  const result = await extractWithVision(pngBuffer, 'image/png', pngBuffer, extractedText || undefined);
  console.log(`[OCR] ${result.pipelineStage} abgeschlossen in ${Date.now() - t0}ms`);
  return result;
}

async function renderPdfPageToPng(pdfBuffer: Buffer): Promise<Buffer> {
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
  let page, pixmap;
  try {
    page = doc.loadPage(0);
    // Render at 2x resolution for better OCR quality (default 72 DPI → 144 DPI)
    const scale = 2;
    const matrix = mupdf.Matrix.scale(scale, scale);
    pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    const pngData = pixmap.asPNG();
    return Buffer.from(pngData);
  } finally {
    try { pixmap?.destroy(); } catch { /* ignore */ }
    try { page?.destroy(); } catch { /* ignore */ }
    try { doc.destroy(); } catch { /* ignore */ }
  }
}

async function extractWithVision(
  visionBuffer: Buffer,
  visionMime: string,
  originalBuffer: Buffer,
  pdfTextLayer?: string,
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
        // Cross-check IBAN from text layer if available
        if (pdfTextLayer) {
          const corrected = crossCheckIban(retryResult.fields.issuerIban as string | null, pdfTextLayer);
          if (corrected && corrected !== retryResult.fields.issuerIban) {
            console.log(`[OCR] IBAN korrigiert (enhanced): LLM="${retryResult.fields.issuerIban}" → Regex="${corrected}"`);
            retryResult.fields.issuerIban = corrected;
          }
        }
        return { ...retryResult, pipelineStage: 'VISION_OCR_ENHANCED' };
      }
    } catch {
      // Enhancement failed, return original result
    }
  }

  // Cross-check IBAN from text layer if available
  if (pdfTextLayer) {
    const corrected = crossCheckIban(result.fields.issuerIban as string | null, pdfTextLayer);
    if (corrected && corrected !== result.fields.issuerIban) {
      console.log(`[OCR] IBAN korrigiert (vision): LLM="${result.fields.issuerIban}" → Regex="${corrected}"`);
      result.fields.issuerIban = corrected;
    }
  }

  return result;
}

/**
 * Parse JSON from LLM response with clear error message.
 * LLM responses should always be valid JSON (response_format: json_object),
 * but truncated or malformed responses can still occur.
 */
function safeJsonParse(content: string): { fields?: Record<string, unknown>; confidence?: Record<string, number>; notes?: string; [key: string]: unknown } {
  try {
    return JSON.parse(content);
  } catch (err) {
    const preview = content.substring(0, 200);
    throw new Error(`LLM-Antwort ist kein gültiges JSON: ${(err as Error).message}\nAnfang der Antwort: "${preview}..."`);
  }
}

async function extractFromText(text: string): Promise<ExtractionResult> {
  const response = await callLlm({
    task: 'invoice_extraction',
    systemPrompt: INVOICE_EXTRACTION_SYSTEM_PROMPT,
    userContent: `Extrahiere die Rechnungsdaten aus folgendem Text:\n\n${text}`,
    temperature: 0.1,
  });

  const parsed = safeJsonParse(response.content);
  const fields = normalizeFields(parsed.fields || {});

  // Cross-check IBAN: if LLM extracted one that fails Mod-97, try regex from text
  const correctedIban = crossCheckIban(fields.issuerIban as string | null, text);
  if (correctedIban && correctedIban !== fields.issuerIban) {
    console.log(`[OCR] IBAN korrigiert: LLM="${fields.issuerIban}" → Regex="${correctedIban}"`);
    fields.issuerIban = correctedIban;
  }

  return {
    fields,
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

  const parsed = safeJsonParse(response.content);

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

  // Normalize IBAN: strip spaces, uppercase
  if (typeof normalized.issuerIban === 'string') {
    normalized.issuerIban = normalized.issuerIban.replace(/\s/g, '').toUpperCase();
  }

  // Normalize vatBreakdown: ensure all numbers, derive totals
  if (Array.isArray(normalized.vatBreakdown) && normalized.vatBreakdown.length > 0) {
    const breakdown = (normalized.vatBreakdown as Array<Record<string, unknown>>)
      .map((item) => ({
        rate: typeof item.rate === 'string' ? parseFloat(item.rate) : (item.rate as number),
        netAmount: typeof item.netAmount === 'string' ? parseFloat(item.netAmount) : (item.netAmount as number),
        vatAmount: typeof item.vatAmount === 'string' ? parseFloat(item.vatAmount) : (item.vatAmount as number),
      }))
      .filter((item) => !isNaN(item.rate) && !isNaN(item.netAmount) && !isNaN(item.vatAmount));

    if (breakdown.length > 1) {
      normalized.vatBreakdown = breakdown;
      // Derive totals from breakdown
      const totalNet = Math.round(breakdown.reduce((s, b) => s + b.netAmount, 0) * 100) / 100;
      const totalVat = Math.round(breakdown.reduce((s, b) => s + b.vatAmount, 0) * 100) / 100;
      if (normalized.netAmount === null || normalized.netAmount === undefined) {
        normalized.netAmount = totalNet;
      }
      if (normalized.vatAmount === null || normalized.vatAmount === undefined) {
        normalized.vatAmount = totalVat;
      }
      // Mixed rates → set vatRate to null
      normalized.vatRate = null;
    } else if (breakdown.length === 1) {
      // Single entry → convert to flat fields, drop breakdown
      normalized.vatRate = breakdown[0].rate;
      if (normalized.netAmount === null || normalized.netAmount === undefined) {
        normalized.netAmount = breakdown[0].netAmount;
      }
      if (normalized.vatAmount === null || normalized.vatAmount === undefined) {
        normalized.vatAmount = breakdown[0].vatAmount;
      }
      delete normalized.vatBreakdown;
    } else {
      delete normalized.vatBreakdown;
    }
  }

  return normalized;
}

// --- IBAN validation & cross-check helpers ---

/**
 * ISO 13616 Mod-97 check: returns true if the IBAN checksum is valid.
 */
function validateIbanMod97(ibanClean: string): boolean {
  const rearranged = ibanClean.substring(4) + ibanClean.substring(0, 4);
  let numericStr = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numericStr += (code - 55).toString();
    } else {
      numericStr += ch;
    }
  }
  try {
    return BigInt(numericStr) % 97n === 1n;
  } catch {
    return false;
  }
}

/**
 * Extract all IBAN candidates from raw text using regex.
 * Matches patterns like "AT42 2011 1824 5416 4200" or "AT4220111824541642000".
 */
function extractIbansFromText(text: string): string[] {
  // Match country code (2 letters) + check digits (2 digits) + BBAN (groups of alphanums)
  // IBANs in text often have spaces every 4 chars
  const ibanRegex = /\b([A-Z]{2}\d{2})\s*(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{0,4})\b/g;
  const candidates: string[] = [];
  let match;
  while ((match = ibanRegex.exec(text)) !== null) {
    const iban = match.slice(1).join('').replace(/\s/g, '');
    if (iban.length >= 16 && iban.length <= 34) {
      candidates.push(iban);
    }
  }
  // Also try fully concatenated IBANs (no spaces)
  const compactRegex = /\b([A-Z]{2}\d{14,30})\b/g;
  while ((match = compactRegex.exec(text)) !== null) {
    const iban = match[1];
    if (!candidates.includes(iban) && iban.length >= 16 && iban.length <= 34) {
      candidates.push(iban);
    }
  }
  return candidates;
}

/**
 * Cross-check the LLM-extracted IBAN against IBANs found via regex in the text.
 * If the LLM IBAN fails Mod-97 but a regex candidate passes, return the regex one.
 * If the LLM IBAN passes Mod-97, keep it.
 */
function crossCheckIban(llmIban: string | null, rawText: string): string | null {
  if (!rawText) return llmIban;

  const llmClean = llmIban?.replace(/\s/g, '').toUpperCase() || '';

  // If LLM IBAN passes Mod-97, it's correct
  if (llmClean && validateIbanMod97(llmClean)) {
    return llmClean;
  }

  // LLM IBAN is missing or fails Mod-97 — try regex extraction
  const candidates = extractIbansFromText(rawText);
  const validCandidates = candidates.filter(c => validateIbanMod97(c));

  if (validCandidates.length === 0) return llmIban;

  // If LLM had a specific country prefix, prefer a candidate with the same prefix
  if (llmClean.length >= 2) {
    const sameCountry = validCandidates.find(c => c.startsWith(llmClean.substring(0, 2)));
    if (sameCountry) return sameCountry;
  }

  // Return first valid candidate
  return validCandidates[0];
}

function computeAverageConfidence(scores: Record<string, number>): number {
  const values = Object.values(scores).filter((v) => typeof v === 'number' && v > 0);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
