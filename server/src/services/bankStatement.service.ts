import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import * as storageService from './storage.service.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { ConflictError, AppError } from '../utils/errors.js';

// ============================================================
// CSV Parsing
// ============================================================

interface ParsedTransaction {
  transactionDate: Date;
  valueDate: Date | null;
  amount: number; // positive = income, negative = expense
  currency: string;
  counterpartName: string | null;
  counterpartIban: string | null;
  reference: string | null;
  bookingText: string | null;
}

interface ParsedStatement {
  transactions: ParsedTransaction[];
  periodFrom: Date | null;
  periodTo: Date | null;
}

// Column name keywords for flexible header mapping
const COLUMN_MAPPINGS = {
  date: ['buchungstag', 'buchungsdatum', 'datum', 'date', 'valuta', 'wertstellungstag'],
  valueDate: ['valuta', 'wertstellungstag', 'wertstellung', 'value date'],
  amount: ['betrag', 'umsatz', 'amount', 'betrag in eur', 'betrag (eur)'],
  name: ['auftraggeber', 'empfänger', 'empfaenger', 'name', 'counterpart', 'zahlungsempfänger', 'zahlungspflichtiger', 'auftraggeber / empfänger'],
  reference: ['verwendungszweck', 'zahlungsreferenz', 'reference', 'referenz', 'zahlungsgrund'],
  iban: ['iban', 'konto', 'konto-nr', 'kontonummer', 'empfänger-iban'],
  bookingText: ['buchungstext', 'text', 'booking text', 'umsatzart', 'geschäftsvorfall'],
  currency: ['währung', 'waehrung', 'currency', 'whg'],
} as const;

function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs >= semicolons && tabs >= commas) return '\t';
  if (semicolons >= commas) return ';';
  return ',';
}

function parseEuropeanNumber(value: string): number {
  // "1.234,56" → 1234.56, "-1.234,56" → -1234.56
  let cleaned = value.trim();
  // Remove currency symbols and whitespace
  cleaned = cleaned.replace(/[€$\s]/g, '');
  // Handle European format: dots as thousands, comma as decimal
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // "1.234,56" format
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // "1234,56" format (no thousands separator)
    cleaned = cleaned.replace(',', '.');
  }
  // else: already in US format "1234.56"
  const num = parseFloat(cleaned);
  if (isNaN(num)) throw new Error(`Ungültiger Betrag: "${value}"`);
  return num;
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // dd.MM.yyyy (Austrian standard)
  const euMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // yyyy-MM-dd (ISO)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(trimmed);
  }

  // dd/MM/yyyy
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  return null;
}

function findColumnIndex(headers: string[], keywords: readonly string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim().replace(/["\u00BF-\u00FF]/g, (c) => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  for (const keyword of keywords) {
    const idx = normalized.findIndex((h) => h.includes(keyword.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Extract structured info from a meinElba-style mega-description field.
 * The field packs name, reference, IBAN, booking text into one cell:
 *   "ZahlungsempfÃ¤nger: IONOS SE Verwendungszweck: KD-Nr... IBAN ZahlungsempfÃ¤nger: DE83..."
 *   "Verwendungszweck: MIDJOURNEY INC. SOUTH SAN FRA..."
 *   "ONLINE BANKING VOM 02.12 UM 11:45 EmpfÃ¤nger: wilfried orth Zahlungsreferenz: LV25106..."
 */
function parseMegaField(text: string): {
  counterpartName: string | null;
  counterpartIban: string | null;
  reference: string | null;
  bookingText: string;
} {
  let counterpartName: string | null = null;
  let counterpartIban: string | null = null;
  let reference: string | null = null;

  // Extract counterpart name: "Empfänger: XXX" or "Zahlungsempfänger: XXX"
  const nameMatch = text.match(/(?:Zahlungsempf[aä]nger|Empf[aä]nger):\s*([^,\n]+?)(?:\s+(?:Verwendungszweck|IBAN|BIC|Zahlungsreferenz|Auftraggeberreferenz|Empf|Mandat)[:.]|$)/i);
  if (nameMatch) {
    counterpartName = nameMatch[1].trim();
  }

  // Extract IBAN: "IBAN Empfänger: ATxxx" or "IBAN Zahlungsempfänger: DExxx"
  const ibanMatch = text.match(/IBAN\s+(?:Empf[aä]nger|Zahlungsempf[aä]nger):\s*([A-Z]{2}\d[\dA-Z\s]{10,34})/i);
  if (ibanMatch) {
    counterpartIban = ibanMatch[1].replace(/\s/g, '');
  }

  // Extract reference: "Zahlungsreferenz: XXX" or "Verwendungszweck: XXX"
  const refMatch = text.match(/Zahlungsreferenz:\s*(.+?)(?:\s+(?:IBAN|BIC|Empf|Kartenzahlung|Mandat|Auftraggeberreferenz)[:.]|$)/i);
  if (refMatch) {
    reference = refMatch[1].trim();
  }
  if (!reference) {
    const zweckMatch = text.match(/Verwendungszweck:\s*(.+?)(?:\s+(?:IBAN|BIC|Zahlungsreferenz|Mandat|Auftraggeberreferenz|Empf)[:.]|$)/i);
    if (zweckMatch) {
      reference = zweckMatch[1].trim();
    }
  }

  // If no explicit name found, try to extract merchant from Verwendungszweck
  if (!counterpartName) {
    const zweckForName = text.match(/Verwendungszweck:\s*(.+?)(?:\s+Zahlungsreferenz:)/i);
    const merchantSource = zweckForName ? zweckForName[1].trim() : null;
    if (merchantSource) {
      // "MICROSOFT-G127478604 MSBILL.INFO 2" → "MICROSOFT"
      // "CLAUDE.AI SUBSCRIPTION SAN FRANCISCO 94104" → "CLAUDE.AI SUBSCRIPTION"
      // "MIDJOURNEY INC. SOUTH SAN FRA 94080" → "MIDJOURNEY INC."
      // "MANUS AI SINGAPORE 179097" → "MANUS AI"
      // Extract up to city/zip: stop at a known city pattern or ZIP code
      const nameMatch = merchantSource.match(/^(.+?)(?:\s+(?:[A-Z]{2,}\s+\d{4,}|\d{4,})\s*$)/);
      if (nameMatch) {
        // Clean up: remove trailing location-like words (common city names are uppercase)
        let name = nameMatch[1].trim();
        // Remove trailing city-like tokens: "SAN FRANCISCO", "SINGAPORE", etc.
        name = name.replace(/\s+(?:SAN\s+\w+|SINGAPORE|WIEN|GRAZ|LINZ|LONDON|BERLIN|STRASSEN|SOUTH\s+\w+)$/i, '').trim();
        if (name.length >= 3) counterpartName = name;
      }
      if (!counterpartName && merchantSource.length >= 3 && merchantSource.length <= 80) {
        counterpartName = merchantSource;
      }
    }
  }

  return { counterpartName, counterpartIban, reference, bookingText: text };
}

/**
 * Auto-detect column roles by analyzing data patterns (for headerless CSVs like meinElba).
 * Returns column indices or -1 if not found.
 */
function autoDetectColumns(lines: string[], delimiter: string): {
  dateCol: number; valueDateCol: number; amountCol: number;
  currencyCol: number; megaFieldCol: number; dataStartRow: number;
} | null {
  // Analyze first few data lines
  const sampleSize = Math.min(lines.length, 5);
  const datePattern = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
  const amountPattern = /^-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/;
  const currencyPattern = /^[A-Z]{3}$/;

  const firstFields = parseCSVLine(lines[0], delimiter);
  const colCount = firstFields.length;
  if (colCount < 3) return null;

  // Score each column by pattern matches
  const dateCols: number[] = [];
  const amountCols: number[] = [];
  let currencyCol = -1;
  let megaFieldCol = -1;
  let maxTextLen = 0;

  for (let col = 0; col < colCount; col++) {
    let dateHits = 0;
    let amountHits = 0;
    let currHits = 0;
    let totalTextLen = 0;

    for (let row = 0; row < sampleSize; row++) {
      const fields = parseCSVLine(lines[row], delimiter);
      const val = (fields[col] || '').trim();
      if (datePattern.test(val)) dateHits++;
      if (amountPattern.test(val)) amountHits++;
      if (currencyPattern.test(val)) currHits++;
      totalTextLen += val.length;
    }

    if (dateHits >= sampleSize * 0.8) dateCols.push(col);
    if (amountHits >= sampleSize * 0.8) amountCols.push(col);
    if (currHits >= sampleSize * 0.8) currencyCol = col;
    if (totalTextLen > maxTextLen) {
      maxTextLen = totalTextLen;
      megaFieldCol = col;
    }
  }

  if (dateCols.length === 0 || amountCols.length === 0) return null;

  return {
    dateCol: dateCols[0],
    valueDateCol: dateCols.length > 1 ? dateCols[1] : -1,
    amountCol: amountCols[0],
    currencyCol,
    megaFieldCol,
    dataStartRow: 0,
  };
}

export function parseCSV(buffer: Buffer): ParsedStatement {
  // Try UTF-8 first, fall back to latin1 for ISO-8859-1 files
  let text = buffer.toString('utf-8');
  // If we get replacement characters, try latin1
  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
  }
  // Remove BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) {
    throw new AppError(422, 'CSV_EMPTY', 'CSV-Datei enthält keine Daten');
  }

  const delimiter = detectDelimiter(lines[0]);

  // Try to find a header row with keywords in the first 10 lines
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const fields = parseCSVLine(lines[i], delimiter);
    const lower = fields.map((f) => f.toLowerCase());
    const hasDate = lower.some((f) => COLUMN_MAPPINGS.date.some((k) => f.includes(k)));
    const hasAmount = lower.some((f) => COLUMN_MAPPINGS.amount.some((k) => f.includes(k)));
    if (hasDate && hasAmount && fields.length >= 3) {
      headerIndex = i;
      break;
    }
  }

  // ========== Headerless mode (e.g. meinElba) ==========
  if (headerIndex === -1) {
    const detected = autoDetectColumns(lines, delimiter);
    if (!detected) {
      throw new AppError(422, 'CSV_INVALID_FORMAT', 'CSV-Datei muss mindestens Datum- und Betrag-Spalten enthalten');
    }

    const transactions: ParsedTransaction[] = [];
    let periodFrom: Date | null = null;
    let periodTo: Date | null = null;

    for (let i = detected.dataStartRow; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i], delimiter);
      if (fields.length <= detected.amountCol) continue;

      const dateStr = fields[detected.dateCol];
      const amountStr = fields[detected.amountCol];
      if (!dateStr || !amountStr) continue;

      const txDate = parseDate(dateStr);
      if (!txDate) continue;

      let amount: number;
      try {
        amount = parseEuropeanNumber(amountStr);
      } catch {
        continue;
      }

      const valueDate = detected.valueDateCol !== -1 && fields[detected.valueDateCol]
        ? parseDate(fields[detected.valueDateCol]) : null;
      const currency = detected.currencyCol !== -1 && fields[detected.currencyCol]
        ? fields[detected.currencyCol].trim() : 'EUR';

      // Parse mega-field (all info in one column)
      let counterpartName: string | null = null;
      let counterpartIban: string | null = null;
      let reference: string | null = null;
      let bookingText: string | null = null;

      if (detected.megaFieldCol !== -1 && fields[detected.megaFieldCol]) {
        const mega = parseMegaField(fields[detected.megaFieldCol]);
        counterpartName = mega.counterpartName;
        counterpartIban = mega.counterpartIban;
        reference = mega.reference;
        bookingText = mega.bookingText;
      }

      transactions.push({
        transactionDate: txDate,
        valueDate,
        amount,
        currency: currency || 'EUR',
        counterpartName,
        counterpartIban,
        reference,
        bookingText,
      });

      if (!periodFrom || txDate < periodFrom) periodFrom = txDate;
      if (!periodTo || txDate > periodTo) periodTo = txDate;
    }

    if (transactions.length === 0) {
      throw new AppError(422, 'CSV_NO_TRANSACTIONS', 'Keine gültigen Transaktionen in der CSV-Datei gefunden');
    }

    return { transactions, periodFrom, periodTo };
  }

  // ========== Header-based mode (standard CSVs) ==========
  const headers = parseCSVLine(lines[headerIndex], delimiter);
  const dateCol = findColumnIndex(headers, COLUMN_MAPPINGS.date);
  const valueDateCol = findColumnIndex(headers, COLUMN_MAPPINGS.valueDate);
  const amountCol = findColumnIndex(headers, COLUMN_MAPPINGS.amount);
  const nameCol = findColumnIndex(headers, COLUMN_MAPPINGS.name);
  const referenceCol = findColumnIndex(headers, COLUMN_MAPPINGS.reference);
  const ibanCol = findColumnIndex(headers, COLUMN_MAPPINGS.iban);
  const bookingTextCol = findColumnIndex(headers, COLUMN_MAPPINGS.bookingText);
  const currencyCol = findColumnIndex(headers, COLUMN_MAPPINGS.currency);

  if (dateCol === -1 || amountCol === -1) {
    throw new AppError(422, 'CSV_INVALID_FORMAT', 'CSV-Datei muss mindestens Datum- und Betrag-Spalten enthalten');
  }

  const transactions: ParsedTransaction[] = [];
  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i], delimiter);
    if (fields.length <= amountCol) continue;

    const dateStr = fields[dateCol];
    const amountStr = fields[amountCol];
    if (!dateStr || !amountStr) continue;

    const txDate = parseDate(dateStr);
    if (!txDate) continue;

    let amount: number;
    try {
      amount = parseEuropeanNumber(amountStr);
    } catch {
      continue; // skip unparseable rows
    }

    const valueDate = valueDateCol !== -1 && fields[valueDateCol] ? parseDate(fields[valueDateCol]) : null;
    const currency = currencyCol !== -1 && fields[currencyCol] ? fields[currencyCol].trim().replace(/"/g, '') : 'EUR';

    transactions.push({
      transactionDate: txDate,
      valueDate,
      amount,
      currency: currency || 'EUR',
      counterpartName: nameCol !== -1 ? (fields[nameCol]?.replace(/"/g, '').trim() || null) : null,
      counterpartIban: ibanCol !== -1 ? (fields[ibanCol]?.replace(/"/g, '').replace(/\s/g, '').trim() || null) : null,
      reference: referenceCol !== -1 ? (fields[referenceCol]?.replace(/"/g, '').trim() || null) : null,
      bookingText: bookingTextCol !== -1 ? (fields[bookingTextCol]?.replace(/"/g, '').trim() || null) : null,
    });

    // Track period
    if (!periodFrom || txDate < periodFrom) periodFrom = txDate;
    if (!periodTo || txDate > periodTo) periodTo = txDate;
  }

  if (transactions.length === 0) {
    throw new AppError(422, 'CSV_NO_TRANSACTIONS', 'Keine gültigen Transaktionen in der CSV-Datei gefunden');
  }

  return { transactions, periodFrom, periodTo };
}

// ============================================================
// Upload & Parse
// ============================================================

export async function uploadAndParse(
  tenantId: string,
  userId: string,
  file: { originalname: string; buffer: Buffer; mimetype: string },
  bankAccountId?: string,
) {
  // 1. SHA256 dedup
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const existing = await prisma.bankStatement.findFirst({
    where: { tenantId, storageHash: hash },
  });
  if (existing) {
    throw new ConflictError('Dieser Kontoauszug wurde bereits importiert');
  }

  // 2. Resolve bank account info
  let bankName: string | null = null;
  let iban: string | null = null;
  let bic: string | null = null;
  if (bankAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, tenantId },
    });
    if (account) {
      bankName = account.bankName;
      iban = account.iban;
      bic = account.bic;
    }
  }

  // 3. Parse CSV
  const parsed = parseCSV(file.buffer);

  // 4. Upload to S3
  const fileId = crypto.randomUUID();
  const storagePath = `${tenantId}/statements/${fileId}.csv`;
  await storageService.uploadFile(storagePath, file.buffer, file.mimetype);

  // 5. Create DB records in transaction
  const statement = await prisma.$transaction(async (tx) => {
    const stmt = await tx.bankStatement.create({
      data: {
        tenantId,
        originalFileName: file.originalname,
        storagePath,
        storageHash: hash,
        fileFormat: 'CSV',
        bankName,
        iban,
        bic,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        processingStatus: 'PROCESSED',
      },
    });

    // Create transactions
    await tx.bankTransaction.createMany({
      data: parsed.transactions.map((tx) => ({
        bankStatementId: stmt.id,
        transactionDate: tx.transactionDate,
        valueDate: tx.valueDate,
        amount: tx.amount,
        currency: tx.currency,
        counterpartName: tx.counterpartName,
        counterpartIban: tx.counterpartIban,
        reference: tx.reference,
        bookingText: tx.bookingText,
      })),
    });

    return stmt;
  });

  // 6. Audit log
  writeAuditLog({
    tenantId,
    userId,
    entityType: 'BankStatement',
    entityId: statement.id,
    action: 'BANK_STATEMENT_UPLOADED',
    newData: {
      fileName: file.originalname,
      transactionCount: parsed.transactions.length,
      periodFrom: parsed.periodFrom?.toISOString(),
      periodTo: parsed.periodTo?.toISOString(),
    },
  });

  return {
    statement,
    transactionsImported: parsed.transactions.length,
  };
}

// ============================================================
// Delete Statement
// ============================================================

export async function deleteStatement(tenantId: string, userId: string, statementId: string) {
  const statement = await prisma.bankStatement.findFirst({
    where: { id: statementId, tenantId },
    include: { transactions: { select: { id: true } } },
  });

  if (!statement) {
    throw new AppError(404, 'NOT_FOUND', 'Kontoauszug nicht gefunden');
  }

  const txIds = statement.transactions.map((t) => t.id);

  await prisma.$transaction(async (tx) => {
    // Delete matchings for these transactions
    if (txIds.length > 0) {
      // Reset isMatched on transactions that had confirmed matchings
      await tx.matching.deleteMany({
        where: { transactionId: { in: txIds } },
      });
    }
    // Delete transactions
    await tx.bankTransaction.deleteMany({
      where: { bankStatementId: statementId },
    });
    // Delete statement
    await tx.bankStatement.delete({
      where: { id: statementId },
    });
  });

  // Delete from S3 (fire-and-forget)
  storageService.deleteFile(statement.storagePath).catch(() => {});

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'BankStatement',
    entityId: statementId,
    action: 'BANK_STATEMENT_DELETED',
    previousData: {
      fileName: statement.originalFileName,
      transactionCount: txIds.length,
    },
  });
}
