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
