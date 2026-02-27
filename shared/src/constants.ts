// Österreichische Steuersätze
export const VAT_RATES = {
  STANDARD: 20,
  REDUCED_1: 13,
  REDUCED_2: 10,
  ZERO: 0,
} as const;

export const VAT_RATE_VALUES = [20, 13, 10, 0] as const;

// BMD Steuercodes
export const BMD_TAX_CODES: Record<number, string> = {
  20: 'V20',
  13: 'V13',
  10: 'V10',
  0: 'V00',
};

// Verarbeitungsstatus
export const PROCESSING_STATUS = {
  INBOX: 'INBOX',
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  PENDING_CORRECTION: 'PENDING_CORRECTION',
  REJECTED: 'REJECTED',
  PARKED: 'PARKED',
  ARCHIVED: 'ARCHIVED',
  RECONCILED: 'RECONCILED',
  RECONCILED_WITH_DIFFERENCE: 'RECONCILED_WITH_DIFFERENCE',
  EXPORTED: 'EXPORTED',
  ERROR: 'ERROR',
  REPLACED: 'REPLACED',
} as const;

// Archivierungs-Prefixes
export const ARCHIVAL_PREFIXES = {
  INCOMING: 'RE',   // Rechnung Eingang
  OUTGOING: 'AR',   // Ausgangsrechnung
  CREDIT_NOTE: 'GS', // Gutschrift
  ADVANCE_PAYMENT: 'AZ', // Anzahlung
} as const;

// Validierungsstatus
export const VALIDATION_STATUS = {
  PENDING: 'PENDING',
  VALID: 'VALID',
  WARNING: 'WARNING',
  INVALID: 'INVALID',
} as const;

// Ampelfarben für UI
export const TRAFFIC_LIGHT_COLORS: Record<string, string> = {
  VALID: '#22c55e',     // Grün
  WARNING: '#f59e0b',   // Gelb
  INVALID: '#ef4444',   // Rot
  PENDING: '#6b7280',   // Grau
};

// User Rollen
export const USER_ROLES = {
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  TAX_ADVISOR: 'TAX_ADVISOR',
} as const;

// Erlaubte Dateitypen für Rechnungen
export const ALLOWED_INVOICE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
] as const;

// Max Dateigröße (20 MB)
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Erlaubte Bank-Statement Formate
export const ALLOWED_BANK_FORMATS = ['CSV', 'MT940', 'CAMT053'] as const;

// Erlaubte MIME-Types für Bank-Statement Upload
export const ALLOWED_BANK_STATEMENT_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'text/plain',
] as const;

// Pagination Defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// Dokumenttypen
export const DOCUMENT_TYPES = {
  INVOICE: 'INVOICE',
  CREDIT_NOTE: 'CREDIT_NOTE',
  ADVANCE_PAYMENT: 'ADVANCE_PAYMENT',
  RECEIPT: 'RECEIPT',
  ERSATZBELEG: 'ERSATZBELEG',
} as const;

// Rechnungsrichtung (Eingang/Ausgang)
export const INVOICE_DIRECTIONS = {
  INCOMING: 'INCOMING',   // Eingangsrechnung (von Lieferant an uns)
  OUTGOING: 'OUTGOING',   // Ausgangsrechnung (von uns an Kunden)
} as const;

// Ingestion-Kanäle
export const INGESTION_CHANNELS = {
  UPLOAD: 'UPLOAD',
  EMAIL: 'EMAIL',
  API: 'API',
} as const;

// Vendor Trust Levels
export const VENDOR_TRUST_LEVELS = {
  NEW: { label: 'Neu', description: 'Standard für neue Lieferanten' },
  VERIFIED: { label: 'Geprüft', description: 'Lieferant wurde geprüft, keine Auto-Genehmigung' },
  TRUSTED: { label: 'Vertrauenswürdig', description: 'Rechnungen werden bei GRÜN automatisch genehmigt' },
} as const;

// Betragsklassen gemäß §11 UStG
export const AMOUNT_CLASS_THRESHOLDS = {
  SMALL_MAX: 400,     // Kleinbetragsrechnung ≤ 400€ brutto
  LARGE_MIN: 10_000,  // Großbetrag > 10.000€ brutto
} as const;

// Validierungsregeln §11 UStG
export const VALIDATION_RULES = {
  // Pflichtmerkmale je Betragsklasse
  ISSUER_NAME: { id: 'ISSUER_NAME', label: 'Name des Ausstellers', legalBasis: '§11 Abs 1 Z 1 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  ISSUER_ADDRESS: { id: 'ISSUER_ADDRESS', label: 'Anschrift des Ausstellers', legalBasis: '§11 Abs 1 Z 1 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  ISSUER_UID: { id: 'ISSUER_UID', label: 'UID-Nummer des Ausstellers', legalBasis: '§11 Abs 1 Z 2 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  RECIPIENT_NAME: { id: 'RECIPIENT_NAME', label: 'Name des Empfängers', legalBasis: '§11 Abs 1 Z 3 UStG', requiredFor: ['LARGE'] },
  RECIPIENT_UID: { id: 'RECIPIENT_UID', label: 'UID-Nummer des Empfängers', legalBasis: '§11 Abs 1 Z 3a UStG', requiredFor: ['LARGE'] },
  INVOICE_NUMBER: { id: 'INVOICE_NUMBER', label: 'Rechnungsnummer', legalBasis: '§11 Abs 1 Z 5 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  INVOICE_DATE: { id: 'INVOICE_DATE', label: 'Ausstellungsdatum', legalBasis: '§11 Abs 1 Z 4 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  DELIVERY_DATE: { id: 'DELIVERY_DATE', label: 'Liefer-/Leistungsdatum', legalBasis: '§11 Abs 1 Z 4 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  DESCRIPTION: { id: 'DESCRIPTION', label: 'Leistungsbeschreibung', legalBasis: '§11 Abs 1 Z 3 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  NET_AMOUNT: { id: 'NET_AMOUNT', label: 'Entgelt (Nettobetrag)', legalBasis: '§11 Abs 1 Z 5 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  VAT_RATE: { id: 'VAT_RATE', label: 'Steuersatz', legalBasis: '§11 Abs 1 Z 5 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  VAT_AMOUNT: { id: 'VAT_AMOUNT', label: 'Steuerbetrag', legalBasis: '§11 Abs 1 Z 5 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  GROSS_AMOUNT: { id: 'GROSS_AMOUNT', label: 'Bruttobetrag', legalBasis: '§11 Abs 1 Z 5 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  // Rechnerische Prüfungen
  MATH_CHECK: { id: 'MATH_CHECK', label: 'Rechnerische Richtigkeit', legalBasis: '§11 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  VAT_RATE_VALID: { id: 'VAT_RATE_VALID', label: 'Gültiger Steuersatz', legalBasis: '§10 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  UID_SYNTAX: { id: 'UID_SYNTAX', label: 'UID-Nummer Syntax', legalBasis: 'Art 28 MwStSystRL', requiredFor: ['STANDARD', 'LARGE'] },
  IBAN_SYNTAX: { id: 'IBAN_SYNTAX', label: 'IBAN Syntax', legalBasis: 'SEPA-Verordnung', requiredFor: [] },
  REVERSE_CHARGE: { id: 'REVERSE_CHARGE', label: 'Reverse Charge Prüfung', legalBasis: '§19 Abs 1 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  DUPLICATE_CHECK: { id: 'DUPLICATE_CHECK', label: 'Duplikat-Prüfung', legalBasis: 'Betriebsprüfung', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  FOREIGN_VAT_CHECK: { id: 'FOREIGN_VAT_CHECK', label: 'Ausländische USt-Prüfung', legalBasis: '§19 Abs 1 / Art 196 MwStSystRL', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  ISSUER_SELF_CHECK: { id: 'ISSUER_SELF_CHECK', label: 'Aussteller-Empfänger Verwechslung', legalBasis: '§11 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  UID_VIES_CHECK: { id: 'UID_VIES_CHECK', label: 'UID-Prüfung (VIES)', legalBasis: 'Art 28 MwStSystRL / VO (EU) 904/2010', requiredFor: ['STANDARD', 'LARGE'] },
  PLZ_UID_CHECK: { id: 'PLZ_UID_CHECK', label: 'PLZ-UID Plausibilität', legalBasis: '§11 Abs 1 Z 1–2 UStG', requiredFor: ['STANDARD', 'LARGE'] },
  CURRENCY_INFO: { id: 'CURRENCY_INFO', label: 'Fremdwährungs-Info', legalBasis: '§20 Abs 2 UStG', requiredFor: [] },
  HOSPITALITY_CHECK: { id: 'HOSPITALITY_CHECK', label: 'Bewirtungsbeleg-Prüfung', legalBasis: '§20 Abs 1 Z 3 EStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
  LEGAL_FORM_CHECK: { id: 'LEGAL_FORM_CHECK', label: 'Rechtsform-Prüfung (§14 UGB)', legalBasis: '§14 UGB', requiredFor: ['STANDARD', 'LARGE'] },
  CREDIT_NOTE_CHECK: { id: 'CREDIT_NOTE_CHECK', label: 'Gutschrift-Prüfung', legalBasis: '§11 Abs 1 UStG', requiredFor: ['SMALL', 'STANDARD', 'LARGE'] },
} as const;

// Österreichische Rechtsformen (§14 UGB)
export const LEGAL_FORMS = {
  // Juristische Personen (UID PFLICHT)
  GMBH: { pattern: /\bGmbH\b/i, label: 'GmbH', uidRequired: true },
  AG: { pattern: /\bAG\b/, label: 'AG', uidRequired: true },
  SE: { pattern: /\bSE\b/, label: 'SE (Europäische Gesellschaft)', uidRequired: true },
  GENOSSENSCHAFT: { pattern: /\beGen\b|\bGenossenschaft\b/i, label: 'Genossenschaft', uidRequired: true },
  VEREIN: { pattern: /\bVerein\b/i, label: 'Verein', uidRequired: false },
  STIFTUNG: { pattern: /\bStiftung\b|\bPrivatstiftung\b/i, label: 'Stiftung', uidRequired: true },
  // Personengesellschaften (UID empfohlen)
  OG: { pattern: /\bOG\b|\bOHG\b/, label: 'OG', uidRequired: false },
  KG: { pattern: /\bKG\b|\bGmbH\s*&\s*Co\.?\s*KG\b/i, label: 'KG', uidRequired: false },
  // Einzelunternehmer
  EU: { pattern: /\be\.?\s?U\.?\b/i, label: 'Einzelunternehmen (e.U.)', uidRequired: false },
  // Deutsche Rechtsformen (häufig auf AT-Rechnungen)
  DE_GMBH: { pattern: /\bGesellschaft\s+mit\s+beschränkter\s+Haftung\b/i, label: 'GmbH (ausgeschrieben)', uidRequired: true },
  DE_UG: { pattern: /\bUG\s*\(haftungsbeschränkt\)\b/i, label: 'UG (haftungsbeschränkt)', uidRequired: true },
} as const;

// Wiederkehrende Kosten — Intervalle
export const RECURRING_INTERVALS = {
  MONTHLY: { label: 'Monatlich', months: 1 },
  QUARTERLY: { label: 'Vierteljährlich', months: 3 },
  HALF_YEARLY: { label: 'Halbjährlich', months: 6 },
  YEARLY: { label: 'Jährlich', months: 12 },
} as const;

// Zahlungsdifferenz-Gründe (Labels)
export const DIFFERENCE_REASONS = {
  SKONTO: { label: 'Skonto', requiresVatCorrection: true },
  CURRENCY_DIFFERENCE: { label: 'Kursdifferenz', requiresVatCorrection: false },
  TIP: { label: 'Trinkgeld', requiresVatCorrection: false },
  PARTIAL_PAYMENT: { label: 'Teilzahlung', requiresVatCorrection: false },
  ROUNDING: { label: 'Rundungsdifferenz', requiresVatCorrection: false },
  OTHER: { label: 'Sonstiges', requiresVatCorrection: false },
} as const;

// Service-Typen (Lieferung/Leistung)
export const SERVICE_TYPES = {
  DELIVERY: { label: 'Lieferung', description: 'Lieferung von Waren' },
  SERVICE: { label: 'Leistung', description: 'Erbringung von Dienstleistungen' },
  BOTH: { label: 'Beides', description: 'Lieferung und Leistung' },
} as const;

// Abzugsfähigkeit (Bewirtung)
export const DEDUCTIBILITY_OPTIONS = [
  { value: 100, label: '100% abzugsfähig', description: 'Betrieblich veranlasst, keine Bewirtung' },
  { value: 50, label: '50% abzugsfähig', description: 'Bewirtung von Geschäftspartnern (§20 Abs 1 Z 3 EStG)' },
  { value: 0, label: 'Nicht abzugsfähig', description: 'Rein private Bewirtung' },
] as const;

// ============================================================
// Chart of Accounts — Standard-Kontenrahmen für E/A-Rechner (AT)
// ============================================================

export const DEFAULT_ACCOUNTS = [
  // Aktiva — Zahlungsmittel
  { number: '2700', name: 'Kassa', type: 'ASSET' as const, category: 'Zahlungsmittel', taxCode: null, sortOrder: 10 },
  { number: '2800', name: 'Bank', type: 'ASSET' as const, category: 'Zahlungsmittel', taxCode: null, sortOrder: 20 },
  // Erlöse
  { number: '4000', name: 'Erlöse 20%', type: 'REVENUE' as const, category: 'Erlöse', taxCode: 'V20', sortOrder: 100 },
  { number: '4010', name: 'Erlöse 10%', type: 'REVENUE' as const, category: 'Erlöse', taxCode: 'V10', sortOrder: 110 },
  { number: '4020', name: 'Erlöse 13%', type: 'REVENUE' as const, category: 'Erlöse', taxCode: 'V13', sortOrder: 120 },
  { number: '4050', name: 'Erlöse steuerfrei', type: 'REVENUE' as const, category: 'Erlöse', taxCode: 'V00', sortOrder: 130 },
  // Material
  { number: '5000', name: 'Wareneinsatz / Material', type: 'EXPENSE' as const, category: 'Material', taxCode: 'V20', sortOrder: 200 },
  { number: '5100', name: 'Bezugsnebenkosten', type: 'EXPENSE' as const, category: 'Material', taxCode: 'V20', sortOrder: 210 },
  // Betriebliche Aufwendungen
  { number: '7000', name: 'Mietaufwand', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 300 },
  { number: '7010', name: 'Betriebskosten', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 310 },
  { number: '7020', name: 'Energiekosten', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 320 },
  { number: '7100', name: 'Büromaterial', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 330 },
  { number: '7200', name: 'Telefon / Internet', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 340 },
  { number: '7300', name: 'Versicherungen', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V00', sortOrder: 350 },
  { number: '7310', name: 'KFZ-Versicherung', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V00', sortOrder: 355 },
  { number: '7350', name: 'KFZ-Aufwand', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 360 },
  { number: '7400', name: 'Werbung / Marketing', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 370 },
  { number: '7500', name: 'Reisekosten', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 380 },
  { number: '7510', name: 'Bewirtung (50%)', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 385 },
  { number: '7600', name: 'Beratung / Steuerberater', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 390 },
  { number: '7700', name: 'Abschreibung (AfA)', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: null, sortOrder: 400 },
  { number: '7800', name: 'Sonstige Aufwendungen', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 410 },
  { number: '7810', name: 'Bankspesen', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V00', sortOrder: 420 },
  { number: '7900', name: 'Software / Lizenzen', type: 'EXPENSE' as const, category: 'Betriebliche Aufwendungen', taxCode: 'V20', sortOrder: 430 },
  // Eigenkapital / Privat
  { number: '9600', name: 'Privatentnahme', type: 'EQUITY' as const, category: 'Privat', taxCode: null, sortOrder: 900 },
  { number: '9610', name: 'Privateinlage', type: 'EQUITY' as const, category: 'Privat', taxCode: null, sortOrder: 910 },
] as const;

// Zahlungsmethoden
export const PAYMENT_METHODS = {
  BANK: { label: 'Überweisung', gegenkontoDefault: '2800' },
  CASH: { label: 'Bar', gegenkontoDefault: '2700' },
} as const;

// Buchungstypen (Privatentnahme/Privateinlage)
export const BOOKING_TYPES = {
  PRIVATE_WITHDRAWAL: { label: 'Privatentnahme', accountNumber: '9600', description: 'Privatentnahme aus Geschäftskonto' },
  PRIVATE_DEPOSIT: { label: 'Privateinlage', accountNumber: '9610', description: 'Privateinlage ins Geschäftskonto' },
} as const;

// Gewinnermittlungsart (Accounting Type)
export const ACCOUNTING_TYPES = {
  EA: { label: 'Einnahmen-Ausgaben-Rechnung', description: 'Einzelunternehmer, Freiberufler (E/A-Rechner)' },
  ACCRUAL: { label: 'Bilanzierung', description: 'GmbH, AG (doppelte Buchführung)' },
} as const;

// Steuerberater Zugangsebenen
export const ACCESS_LEVELS = {
  READ: { label: 'Lesezugriff', description: 'Nur Ansicht, keine Bearbeitung' },
  WRITE: { label: 'Schreibzugriff', description: 'Belege bearbeiten und archivieren' },
  ADMIN: { label: 'Vollzugriff', description: 'Wie Schreibzugriff + Benutzer verwalten' },
} as const;

// E-Mail-Connector Sync-Status
export const EMAIL_CONNECTOR_SYNC_STATUS = {
  SUCCESS: 'SUCCESS',
  RUNNING: 'RUNNING',
  ERROR: 'ERROR',
} as const;

// Maximale aufeinanderfolgende Fehler bevor Connector deaktiviert wird
export const MAX_CONSECUTIVE_FAILURES = 3;

// Erlaubte MIME-Types für E-Mail-Anhänge (= gleich wie Upload)
export const ALLOWED_EMAIL_ATTACHMENT_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
] as const;

// ============================================================
// Feature-Module — togglebar pro Mandant
// ============================================================

export const FEATURE_MODULES = {
  inbox:        { label: 'Rechnungseingang', description: 'Eingangskorb & E-Mail-Import' },
  invoiceCheck: { label: 'Rechnungs-Check', description: 'Prüfung & Validierung' },
  paymentCheck: { label: 'Zahlungs-Check', description: 'Matching & Monatsabstimmung' },
  vendors:      { label: 'Lieferanten', description: 'Lieferanten-Verwaltung' },
  customers:    { label: 'Kunden', description: 'Kunden-Verwaltung' },
  accounts:     { label: 'Kontenplan', description: 'Kontenplan-Verwaltung' },
  export:       { label: 'Export', description: 'BMD-Export & Exportprofile' },
  auditLog:     { label: 'Audit-Log', description: 'Änderungsprotokoll' },
  uvaReport:    { label: 'UVA-Bericht', description: 'Umsatzsteuer-Voranmeldung' },
} as const;

export const DEFAULT_FEATURE_VISIBILITY: Record<string, boolean> =
  Object.fromEntries(Object.keys(FEATURE_MODULES).map(k => [k, true]));

// ============================================================
// Validation Check → Extracted Field Mapping
// ============================================================

/** Maps validation rule IDs to the extracted data field(s) they validate */
export const CHECK_TO_FIELDS: Record<string, string[]> = {
  ISSUER_NAME: ['issuerName'],
  ISSUER_ADDRESS: ['issuerAddress'],
  ISSUER_UID: ['issuerUid'],
  RECIPIENT_NAME: ['recipientName'],
  RECIPIENT_UID: ['recipientUid'],
  INVOICE_NUMBER: ['invoiceNumber'],
  INVOICE_DATE: ['invoiceDate'],
  DELIVERY_DATE: ['deliveryDate'],
  DESCRIPTION: ['description'],
  NET_AMOUNT: ['netAmount'],
  VAT_RATE: ['vatRate'],
  VAT_AMOUNT: ['vatAmount'],
  GROSS_AMOUNT: ['grossAmount'],
  MATH_CHECK: ['netAmount', 'vatAmount', 'grossAmount'],
  VAT_RATE_VALID: ['vatRate'],
  UID_SYNTAX: ['issuerUid'],
  UID_VIES_CHECK: ['issuerUid'],
  IBAN_SYNTAX: ['issuerIban'],
  REVERSE_CHARGE: ['vatAmount'],
  DUPLICATE_CHECK: ['invoiceNumber', 'issuerName'],
  FOREIGN_VAT_CHECK: ['vatRate', 'issuerUid'],
  PLZ_UID_CHECK: ['issuerUid', 'issuerAddress'],
  HOSPITALITY_CHECK: ['description'],
  LEGAL_FORM_CHECK: ['issuerName'],
  CREDIT_NOTE_CHECK: ['grossAmount'],
};
