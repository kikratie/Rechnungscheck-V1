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
  originalFileName: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  grossAmount: string | null;
  currency: string;
  processingStatus: ProcessingStatusType;
  validationStatus: ValidationStatusType;
  isLocked: boolean;
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
