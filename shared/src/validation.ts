import { z } from 'zod';

// ============================================================
// Auth Schemas
// ============================================================

export const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
});

export const registerSchema = z.object({
  tenantName: z.string().min(2, 'Firmenname muss mindestens 2 Zeichen lang sein').max(100),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
    .regex(/[A-Z]/, 'Passwort muss mindestens einen Großbuchstaben enthalten')
    .regex(/[0-9]/, 'Passwort muss mindestens eine Zahl enthalten'),
  firstName: z.string().min(1, 'Vorname ist erforderlich').max(50),
  lastName: z.string().min(1, 'Nachname ist erforderlich').max(50),
  accountingType: z.enum(['EA', 'ACCRUAL']).optional().default('EA'),
});

// ============================================================
// Tenant Schemas
// ============================================================

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  taxId: z.string().max(20).optional().nullable(),
  uidNumber: z
    .string()
    .regex(/^ATU\d{8}$/, 'UID-Nummer muss dem Format ATU12345678 entsprechen')
    .optional()
    .nullable(),
  address: z
    .object({
      street: z.string().max(200),
      zip: z.string().max(10),
      city: z.string().max(100),
      country: z.string().length(2).default('AT'),
    })
    .optional()
    .nullable(),
  firmenbuchNr: z.string().max(30).optional().nullable(),
  country: z.string().length(2).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email('Ungültige E-Mail-Adresse').optional().nullable(),
  accountingType: z.enum(['EA', 'ACCRUAL']).optional(),
});

export const completeOnboardingSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  uidNumber: z
    .string()
    .regex(/^ATU\d{8}$/, 'UID-Nummer muss dem Format ATU12345678 entsprechen')
    .optional()
    .nullable(),
  address: z
    .object({
      street: z.string().min(1, 'Straße ist erforderlich').max(200),
      zip: z.string().min(1, 'PLZ ist erforderlich').max(10),
      city: z.string().min(1, 'Stadt ist erforderlich').max(100),
      country: z.string().length(2).default('AT'),
    }),
  firmenbuchNr: z.string().max(30).optional().nullable(),
  country: z.string().length(2).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email('Ungültige E-Mail-Adresse').optional().nullable(),
  accountingType: z.enum(['EA', 'ACCRUAL']).optional(),
  // Optional: first bank account created during onboarding
  bankAccount: z.object({
    label: z.string().min(1).max(100),
    accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'PAYPAL', 'OTHER']).default('CHECKING'),
    iban: z.string().max(34).optional().nullable(),
    bic: z.string().max(11).optional().nullable(),
    bankName: z.string().max(100).optional().nullable(),
  }).optional(),
});

// ============================================================
// Bank Account Schemas
// ============================================================

export const createBankAccountSchema = z.object({
  label: z.string().min(1, 'Bezeichnung ist erforderlich').max(100),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'PAYPAL', 'OTHER']).default('CHECKING'),
  iban: z.string().max(34).optional().nullable(),
  bic: z.string().max(11).optional().nullable(),
  bankName: z.string().max(100).optional().nullable(),
  cardLastFour: z.string().max(4).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const updateBankAccountSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'PAYPAL', 'OTHER']).optional(),
  iban: z.string().max(34).optional().nullable(),
  bic: z.string().max(11).optional().nullable(),
  bankName: z.string().max(100).optional().nullable(),
  cardLastFour: z.string().max(4).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

// ============================================================
// User Schemas
// ============================================================

export const createUserSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: z.enum(['ADMIN', 'ACCOUNTANT', 'TAX_ADVISOR']),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  role: z.enum(['ADMIN', 'ACCOUNTANT', 'TAX_ADVISOR']).optional(),
  isActive: z.boolean().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  firstName: z.string().min(1, 'Vorname ist erforderlich').max(50),
  lastName: z.string().min(1, 'Nachname ist erforderlich').max(50),
  role: z.enum(['ADMIN', 'ACCOUNTANT', 'TAX_ADVISOR']),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Token ist erforderlich'),
  password: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
    .regex(/[A-Z]/, 'Passwort muss mindestens einen Großbuchstaben enthalten')
    .regex(/[0-9]/, 'Passwort muss mindestens eine Zahl enthalten'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Aktuelles Passwort ist erforderlich'),
  newPassword: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
    .regex(/[A-Z]/, 'Passwort muss mindestens einen Großbuchstaben enthalten')
    .regex(/[0-9]/, 'Passwort muss mindestens eine Zahl enthalten'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token ist erforderlich'),
  password: z
    .string()
    .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
    .regex(/[A-Z]/, 'Passwort muss mindestens einen Großbuchstaben enthalten')
    .regex(/[0-9]/, 'Passwort muss mindestens eine Zahl enthalten'),
});

// ============================================================
// Invoice Schemas
// ============================================================

export const updateInvoiceSchema = z.object({
  vendorName: z.string().max(200).optional().nullable(),
  vendorUid: z
    .string()
    .regex(/^ATU\d{8}$/, 'UID-Nummer muss dem Format ATU12345678 entsprechen')
    .optional()
    .nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  netAmount: z.number().min(0).optional().nullable(),
  vatAmount: z.number().min(0).optional().nullable(),
  grossAmount: z.number().min(0).optional().nullable(),
  vatRate: z.number().min(0).max(100).optional().nullable(),
  accountNumber: z.string().max(20).optional().nullable(),
  costCenter: z.string().max(50).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ============================================================
// Query / Pagination Schemas
// ============================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const invoiceFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  direction: z.enum(['INCOMING', 'OUTGOING']).optional(),
  processingStatus: z
    .enum(['INBOX', 'UPLOADED', 'PROCESSING', 'PROCESSED', 'REVIEW_REQUIRED', 'PENDING_CORRECTION', 'REJECTED', 'PARKED', 'APPROVED', 'ARCHIVED', 'RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'EXPORTED', 'ERROR', 'REPLACED'])
    .optional(),
  validationStatus: z.enum(['PENDING', 'VALID', 'WARNING', 'INVALID']).optional(),
  vendorName: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['createdAt', 'invoiceDate', 'grossAmount', 'vendorName']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================
// Export Schemas
// ============================================================

export const exportGenerateSchema = z.object({
  configId: z.string().uuid().optional(),
  format: z.enum(['CSV_GENERIC', 'BMD_CSV', 'BMD_XML']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  invoiceIds: z.array(z.string().uuid()).optional(),
});

export const ocrCheckExportSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// ============================================================
// Extracted Data Correction Schema (manual edit)
// ============================================================

// EU-UID: 2 Buchstaben Ländercode + alphanumerisch (2-12 Zeichen)
const euUidRegex = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

export const updateExtractedDataSchema = z.object({
  issuerName: z.string().max(200).optional().nullable(),
  issuerUid: z
    .string()
    .regex(euUidRegex, 'UID-Nummer muss mit 2-stelligem Ländercode beginnen (z.B. ATU12345678, DE123456789, IE9825613N)')
    .optional()
    .nullable(),
  issuerAddress: z
    .object({
      street: z.string().max(200).optional().default(''),
      zip: z.string().max(10).optional().nullable().default(''),
      city: z.string().max(100).optional().default(''),
      country: z.string().max(50).optional().default(''),
    })
    .optional()
    .nullable(),
  issuerEmail: z.string().email().optional().nullable(),
  issuerIban: z.string().max(34).optional().nullable(),
  recipientName: z.string().max(200).optional().nullable(),
  recipientUid: z
    .string()
    .regex(euUidRegex, 'UID-Nummer muss mit 2-stelligem Ländercode beginnen (z.B. ATU12345678, DE123456789)')
    .optional()
    .nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  sequentialNumber: z.string().max(100).optional().nullable(),
  invoiceDate: z.string().datetime().optional().nullable(),
  deliveryDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  netAmount: z.number().min(0).optional().nullable(),
  vatAmount: z.number().min(0).optional().nullable(),
  grossAmount: z.number().min(0).optional().nullable(),
  vatRate: z.number().min(0).max(100).optional().nullable(),
  currency: z.string().length(3).optional(),
  isReverseCharge: z.boolean().optional(),
  accountNumber: z.string().max(20).optional().nullable(),
  costCenter: z.string().max(50).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  // Steuerberater-Feedback Felder
  serviceType: z.enum(['DELIVERY', 'SERVICE', 'BOTH']).optional().nullable(),
  hospitalityGuests: z.string().max(500).optional().nullable(),
  hospitalityReason: z.string().max(500).optional().nullable(),
  deductibilityPercent: z.number().int().min(0).max(100).optional().nullable(),
  deductibilityNote: z.string().max(500).optional().nullable(),
  // Privatanteil (0-100%)
  privatePercent: z.number().int().min(0).max(100).optional().nullable(),
  editReason: z.string().max(500).optional(),
});

export const rejectInvoiceSchema = z.object({
  reason: z.string().min(1, 'Begründung ist erforderlich').max(2000),
});

// ============================================================
// Ersatzbeleg Schema
// ============================================================

export const createErsatzbelegSchema = z.object({
  reason: z.string().min(1, 'Begründung ist erforderlich').max(2000),
  issuerName: z.string().min(1, 'Lieferant ist erforderlich').max(200),
  description: z.string().min(1, 'Beschreibung ist erforderlich').max(2000),
  invoiceDate: z.string().min(1, 'Datum ist erforderlich'),
  grossAmount: z.number().min(0.01, 'Betrag ist erforderlich'),
  netAmount: z.number().min(0).optional().nullable(),
  vatAmount: z.number().min(0).optional().nullable(),
  vatRate: z.number().min(0).max(100).optional().nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  issuerUid: z.string().max(20).optional().nullable(),
  accountNumber: z.string().max(20).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
});

// ============================================================
// Eigenbeleg Schema (§132 BAO — self-created receipt)
// ============================================================

export const createEigenbelegSchema = z.object({
  issuerName: z.string().min(1, 'Geschäftspartner ist erforderlich').max(200),
  description: z.string().min(1, 'Leistungsbeschreibung ist erforderlich').max(2000),
  invoiceDate: z.string().min(1, 'Datum ist erforderlich'),
  grossAmount: z.number().min(0.01, 'Betrag ist erforderlich'),
  vatRate: z.number().min(0).max(100).optional().nullable(),
  reason: z.string().min(1, 'Grund für fehlenden Beleg ist erforderlich').max(2000),
  direction: z.enum(['INCOMING', 'OUTGOING']).optional(),
  accountNumber: z.string().max(20).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  transactionId: z.string().uuid().optional().nullable(),
});

// ============================================================
// Approve / Archive
// ============================================================

export const approveInvoiceSchema = z.object({
  comment: z.string().max(2000).optional().nullable(),
  ruleId: z.string().uuid().optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

// ============================================================
// Batch Approve (sets rule + note, status → APPROVED)
// ============================================================

export const batchApproveSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(100),
  comment: z.string().max(2000).optional().nullable(),
  ruleId: z.string().uuid().optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

// ============================================================
// Archive (separate from approve — assigns number, stamps, locks)
// ============================================================

export const archiveInvoiceSchema = z.object({
  comment: z.string().max(2000).optional().nullable(),
});

export const batchArchiveSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(100),
  comment: z.string().max(2000).optional().nullable(),
});

// ============================================================
// Cancel Archival Number (Storno)
// ============================================================

export const cancelNumberSchema = z.object({
  reason: z.string().min(1, 'Begründung ist erforderlich').max(2000),
});

// ============================================================
// UID Validation
// ============================================================

export const uidSchema = z.object({
  uid: z.string().regex(/^[A-Z]{2}[A-Za-z0-9]+$/, 'Ungültiges UID-Format'),
});

// ============================================================
// Matching Schemas
// ============================================================

export const manualMatchingSchema = z.object({
  invoiceId: z.string().uuid('Ungültige Rechnungs-ID'),
  transactionId: z.string().uuid('Ungültige Transaktions-ID'),
});

export const uidBatchSchema = z.object({
  uids: z.array(z.string()).min(1).max(50),
});

// ============================================================
// Beleg-Parken Schemas
// ============================================================

export const parkInvoiceSchema = z.object({
  reason: z.string().min(1, 'Begründung ist erforderlich').max(2000),
});

// ============================================================
// Substitute Document Schema (Ersatzbeleg-Workflow)
// ============================================================

export const createSubstituteDocSchema = z.object({
  reason: z.string().min(1, 'Begründung ist erforderlich').max(2000),
  paymentDate: z.string().optional().nullable(),
  amount: z.number().min(0.01, 'Betrag ist erforderlich'),
  description: z.string().max(2000).optional().nullable(),
  vatDeductible: z.boolean().default(true),
  vatNote: z.string().max(500).optional().nullable(),
});

// ============================================================
// Payment Difference Schema
// ============================================================

export const updatePaymentDifferenceSchema = z.object({
  differenceReason: z.enum(['SKONTO', 'CURRENCY_DIFFERENCE', 'TIP', 'PARTIAL_PAYMENT', 'ROUNDING', 'OTHER']),
  notes: z.string().max(2000).optional().nullable(),
});

// ============================================================
// DSGVO — Account Delete Schema
// ============================================================

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Passwort ist erforderlich'),
  confirmText: z.string().refine((val) => val === 'LÖSCHEN', {
    message: 'Bitte "LÖSCHEN" eingeben zur Bestätigung',
  }),
});

// ============================================================
// Company Access Schema (Steuerberater-Zugang)
// ============================================================

// ============================================================
// Chart of Accounts Schemas
// ============================================================

export const createAccountSchema = z.object({
  number: z.string().min(1).max(10).regex(/^\d+$/, 'Kontonummer muss numerisch sein'),
  name: z.string().min(1, 'Name ist erforderlich').max(100),
  type: z.enum(['ASSET', 'LIABILITY', 'EXPENSE', 'REVENUE', 'EQUITY']),
  category: z.string().max(100).optional().nullable(),
  taxCode: z.string().max(10).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: z.string().max(100).optional().nullable(),
  taxCode: z.string().max(10).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ============================================================
// Cash Payment Schema
// ============================================================

export const cashPaymentSchema = z.object({
  paymentDate: z.string().min(1, 'Zahlungsdatum ist erforderlich'),
});

// ============================================================
// Transaction Booking Schemas (Privatentnahme/Privateinlage)
// ============================================================

export const createTransactionBookingSchema = z.object({
  transactionId: z.string().uuid('Ungültige Transaktions-ID'),
  bookingType: z.enum(['PRIVATE_WITHDRAWAL', 'PRIVATE_DEPOSIT']),
  notes: z.string().max(500).optional().nullable(),
});

// ============================================================
// Company Access Schema (Steuerberater-Zugang)
// ============================================================

export const grantAccessSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  accessLevel: z.enum(['READ', 'WRITE', 'ADMIN']).default('READ'),
});

// ============================================================
// Export Schemas (erweitert)
// ============================================================

export const createExportConfigSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich').max(100),
  format: z.enum(['CSV_GENERIC', 'BMD_CSV', 'BMD_XML']),
  delimiter: z.string().max(5).default(';'),
  dateFormat: z.string().max(20).default('dd.MM.yyyy'),
  decimalSeparator: z.string().max(5).default(','),
  encoding: z.string().max(20).default('UTF-8'),
  includeHeader: z.boolean().default(true),
  columnMapping: z.record(z.string()).optional().default({}),
});

export const updateExportConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  format: z.enum(['CSV_GENERIC', 'BMD_CSV', 'BMD_XML']).optional(),
  delimiter: z.string().max(5).optional(),
  dateFormat: z.string().max(20).optional(),
  decimalSeparator: z.string().max(5).optional(),
  encoding: z.string().max(20).optional(),
  includeHeader: z.boolean().optional(),
  columnMapping: z.record(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

export const monthlyReportSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const fullExportSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

// ============================================================
// Correction Request Schema (PENDING_CORRECTION workflow)
// ============================================================

export const requestCorrectionSchema = z.object({
  note: z.string().min(1, 'Korrekturhinweis ist erforderlich').max(2000),
});

// ============================================================
// Email Connector Schemas
// ============================================================

export const createEmailConnectorSchema = z.object({
  label: z.string().min(1, 'Bezeichnung ist erforderlich').max(100),
  host: z.string().min(1, 'IMAP-Host ist erforderlich').max(255),
  port: z.coerce.number().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1, 'Benutzername ist erforderlich').max(255),
  password: z.string().min(1, 'Passwort ist erforderlich').max(500),
  folder: z.string().max(255).default('INBOX'),
  pollIntervalMinutes: z.coerce.number().min(1).max(60).default(5),
});

export const updateEmailConnectorSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.coerce.number().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).max(500).optional(),
  folder: z.string().max(255).optional(),
  pollIntervalMinutes: z.coerce.number().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
});

export const testEmailConnectorSchema = z.object({
  host: z.string().min(1, 'IMAP-Host ist erforderlich').max(255),
  port: z.coerce.number().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1, 'Benutzername ist erforderlich').max(255),
  password: z.string().min(1, 'Passwort ist erforderlich').max(500),
});

// ============================================================
// Recurring Costs Schemas (Laufende Kosten)
// ============================================================

export const setRecurringSchema = z.object({
  isRecurring: z.boolean(),
  recurringInterval: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).nullable().optional(),
  recurringNote: z.string().max(200).nullable().optional(),
});

// ============================================================
// Feature Visibility Schema
// ============================================================

export const updateFeatureVisibilitySchema = z.object({
  featureVisibility: z.record(z.string(), z.boolean()),
});

// ============================================================
// Super-Admin Schemas (Mandanten-Verwaltung)
// ============================================================

export const adminCreateTenantSchema = z.object({
  tenantName: z.string().min(2, 'Firmenname muss mindestens 2 Zeichen lang sein').max(100),
  tenantSlug: z.string().regex(/^[a-z0-9-]+$/, 'Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten').min(2).max(50).optional(),
  adminEmail: z.string().email('Ungültige E-Mail-Adresse'),
  adminFirstName: z.string().min(1, 'Vorname ist erforderlich').max(50),
  adminLastName: z.string().min(1, 'Nachname ist erforderlich').max(50),
  adminPassword: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
  accountingType: z.enum(['EA', 'ACCRUAL']).optional(),
});

export const adminUpdateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================
// Deductibility Rules (Genehmigungs-Regeln)
// ============================================================

export const createDeductibilityRuleSchema = z.object({
  name: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein').max(100),
  description: z.string().max(500).optional().nullable(),
  inputTaxPercent: z.number().min(0).max(100),
  expensePercent: z.number().min(0).max(100),
  ruleType: z.enum(['standard', 'private_withdrawal', 'private_deposit']).optional().default('standard'),
  createsReceivable: z.boolean().optional().default(false),
});

export const updateDeductibilityRuleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  inputTaxPercent: z.number().min(0).max(100).optional(),
  expensePercent: z.number().min(0).max(100).optional(),
  ruleType: z.enum(['standard', 'private_withdrawal', 'private_deposit']).optional(),
  createsReceivable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// Shareholder Transaction Schemas
export const markShareholderTransactionPaidSchema = z.object({
  paidAt: z.string().datetime().optional(),
});
