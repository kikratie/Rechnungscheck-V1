// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  pagination?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================
// Auth Types
// ============================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  tenantName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;        // userId
  tenantId: string;
  email: string;
  role: UserRoleType;
  iat: number;
  exp: number;
}

export type UserRoleType = 'ADMIN' | 'ACCOUNTANT' | 'TAX_ADVISOR';

export interface UserProfile {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRoleType;
  tenantName: string;
}

// ============================================================
// Invoice Types
// ============================================================

export type ProcessingStatusType =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'EXPORTED'
  | 'REPLACED'
  | 'ERROR';

export type ValidationStatusType =
  | 'PENDING'
  | 'VALID'
  | 'WARNING'
  | 'INVALID';

export type UidValidationStatusType =
  | 'NOT_CHECKED'
  | 'VALID'
  | 'INVALID'
  | 'SERVICE_UNAVAILABLE';

export interface InvoiceListItem {
  id: string;
  belegNr: number;
  originalFileName: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  grossAmount: string | null;
  currency: string;
  processingStatus: ProcessingStatusType;
  validationStatus: ValidationStatusType;
  isLocked: boolean;
  vendorId: string | null;
  replacedByInvoiceId: string | null;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  vendorUid: string | null;
  vendorAddress: Record<string, string> | null;
  dueDate: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  vatRate: string | null;
  accountNumber: string | null;
  costCenter: string | null;
  category: string | null;
  validationDetails: ValidationResult[];
  uidValidationStatus: UidValidationStatusType;
  aiConfidence: string | null;
  isDuplicate: boolean;
  notes: string | null;
  lineItems: InvoiceLineItemData[];
}

export interface InvoiceLineItemData {
  id: string;
  position: number;
  description: string | null;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  netAmount: string | null;
  vatRate: string | null;
  vatAmount: string | null;
  grossAmount: string | null;
  accountNumber: string | null;
}

export interface ValidationResult {
  rule: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
  message: string;
  details?: unknown;
}

// ============================================================
// Traffic Light & Amount Classes
// ============================================================

export type TrafficLightStatus = 'GREEN' | 'YELLOW' | 'RED';
export type AmountClass = 'SMALL' | 'STANDARD' | 'LARGE';

// ============================================================
// Extracted Data Types
// ============================================================

export interface ExtractedDataItem {
  id: string;
  invoiceId: string;
  version: number;
  issuerName: string | null;
  issuerUid: string | null;
  issuerAddress: Record<string, string> | null;
  issuerEmail: string | null;
  issuerIban: string | null;
  recipientName: string | null;
  recipientUid: string | null;
  recipientAddress: Record<string, string> | null;
  invoiceNumber: string | null;
  sequentialNumber: string | null;
  invoiceDate: string | null;
  deliveryDate: string | null;
  dueDate: string | null;
  description: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  grossAmount: string | null;
  vatRate: string | null;
  currency: string;
  isReverseCharge: boolean;
  accountNumber: string | null;
  costCenter: string | null;
  category: string | null;
  confidenceScores: Record<string, number>;
  source: string;
  pipelineStage: string | null;
  editedByUserId: string | null;
  editReason: string | null;
  createdAt: string;
}

export interface ValidationCheck {
  rule: string;
  status: TrafficLightStatus;
  message: string;
  legalBasis?: string;
  details?: unknown;
}

export interface ViesValidationInfo {
  checked: boolean;
  valid: boolean;
  registeredName: string | null;
  registeredAddress: string | null;
  nameMatch: boolean;
  nameSimilarity: number;
  error?: string;
}

export interface ValidationResultItem {
  id: string;
  invoiceId: string;
  overallStatus: TrafficLightStatus;
  amountClass: AmountClass;
  checks: ValidationCheck[];
  comments: string | null;
  extractedDataVersion: number;
  createdAt: string;
}

export interface InvoiceDetailExtended extends InvoiceDetail {
  extractedData: ExtractedDataItem | null;
  validationResult: ValidationResultItem | null;
  documentType: string;
  deliveryDate: string | null;
  isReverseCharge: boolean;
  recipientUid: string | null;
  issuerEmail: string | null;
  issuerIban: string | null;
}

// ============================================================
// Bank Types
// ============================================================

export interface BankStatementListItem {
  id: string;
  originalFileName: string;
  bankName: string | null;
  iban: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  transactionCount: number;
  processingStatus: ProcessingStatusType;
  createdAt: string;
}

export interface BankTransactionItem {
  id: string;
  transactionDate: string;
  amount: string;
  currency: string;
  counterpartName: string | null;
  reference: string | null;
  bookingText: string | null;
  isMatched: boolean;
}

// ============================================================
// Matching Types
// ============================================================

export type MatchTypeValue = 'AUTO' | 'AI_SUGGESTED' | 'MANUAL';
export type MatchStatusValue = 'SUGGESTED' | 'CONFIRMED' | 'REJECTED';

export interface MatchingItem {
  id: string;
  invoiceId: string;
  transactionId: string;
  matchType: MatchTypeValue;
  confidence: string | null;
  matchReason: string | null;
  status: MatchStatusValue;
  invoice: InvoiceListItem;
  transaction: BankTransactionItem;
}

// ============================================================
// Dashboard Types
// ============================================================

export interface DashboardStats {
  totalInvoices: number;
  pendingReview: number;
  matchedInvoices: number;
  unmatchedInvoices: number;
  validationSummary: {
    valid: number;
    warning: number;
    invalid: number;
    pending: number;
  };
  totalAmount: string;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}
