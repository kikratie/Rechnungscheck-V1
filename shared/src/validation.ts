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
  processingStatus: z
    .enum(['UPLOADED', 'PROCESSING', 'PROCESSED', 'REVIEW_REQUIRED', 'APPROVED', 'EXPORTED', 'ERROR'])
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
// UID Validation
// ============================================================

export const uidSchema = z.object({
  uid: z.string().regex(/^[A-Z]{2}[A-Za-z0-9]+$/, 'Ungültiges UID-Format'),
});

export const uidBatchSchema = z.object({
  uids: z.array(z.string()).min(1).max(50),
});
