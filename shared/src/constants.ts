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
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  APPROVED: 'APPROVED',
  EXPORTED: 'EXPORTED',
  ERROR: 'ERROR',
  REPLACED: 'REPLACED',
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
  RECEIPT: 'RECEIPT',
  ERSATZBELEG: 'ERSATZBELEG',
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
} as const;
