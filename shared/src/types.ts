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
  accountingType?: AccountingTypeValue;
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

export type VendorTrustLevel = 'NEW' | 'VERIFIED' | 'TRUSTED';

// Chart of Accounts & Payment Types
export type AccountTypeValue = 'ASSET' | 'LIABILITY' | 'EXPENSE' | 'REVENUE' | 'EQUITY';
export type PaymentMethodType = 'BANK' | 'CASH';
export type BookingTypeValue = 'PRIVATE_WITHDRAWAL' | 'PRIVATE_DEPOSIT';
export type AccountingTypeValue = 'EA' | 'ACCRUAL';

export type InvoiceDirection = 'INCOMING' | 'OUTGOING';
export type RecurringIntervalType = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

// Feature Visibility
export type FeatureModuleKey = 'inbox' | 'invoiceCheck' | 'paymentCheck' | 'vendors' | 'customers' | 'accounts' | 'export' | 'auditLog' | 'uvaReport';
export type FeatureVisibility = Record<FeatureModuleKey, boolean>;

export interface UserProfile {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRoleType;
  tenantName: string;
  onboardingComplete: boolean;
  accountingType: AccountingTypeValue;
  featureVisibility: FeatureVisibility;
  isSuperAdmin?: boolean;
}

export type BankAccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'PAYPAL' | 'OTHER';

export interface BankAccountItem {
  id: string;
  tenantId: string;
  label: string;
  accountType: BankAccountType;
  iban: string | null;
  bic: string | null;
  bankName: string | null;
  cardLastFour: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  taxId: string | null;
  uidNumber: string | null;
  address: { street?: string; zip?: string; city?: string; country?: string } | null;
  firmenbuchNr: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  onboardingComplete: boolean;
  accountingType: AccountingTypeValue;
  bankAccounts: BankAccountItem[];
}

// ============================================================
// Invoice Types
// ============================================================

export type ProcessingStatusType =
  | 'INBOX'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'REVIEW_REQUIRED'
  | 'PENDING_CORRECTION'
  | 'REJECTED'
  | 'PARKED'
  | 'ARCHIVED'
  | 'RECONCILED'
  | 'RECONCILED_WITH_DIFFERENCE'
  | 'EXPORTED'
  | 'REPLACED'
  | 'ERROR';

// Steuerberater-Feedback Types
export type ServiceType = 'DELIVERY' | 'SERVICE' | 'BOTH';
export type DifferenceReasonType = 'SKONTO' | 'CURRENCY_DIFFERENCE' | 'TIP' | 'PARTIAL_PAYMENT' | 'ROUNDING' | 'OTHER';
export type AccessLevelType = 'READ' | 'WRITE' | 'ADMIN';

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
  documentType: string;
  direction: InvoiceDirection;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  grossAmount: string | null;
  currency: string;
  estimatedEurGross: string | null;
  exchangeRate: string | null;
  exchangeRateDate: string | null;
  processingStatus: ProcessingStatusType;
  validationStatus: ValidationStatusType;
  isLocked: boolean;
  vendorId: string | null;
  customerId: string | null;
  customerName: string | null;
  replacedByInvoiceId: string | null;
  archivalNumber: string | null;
  archivalPrefix: string | null;
  archivedAt: string | null;
  ingestionChannel: string;
  emailSender: string | null;
  inboxCleared: boolean;
  isRecurring: boolean;
  recurringInterval: RecurringIntervalType | null;
  recurringGroupId: string | null;
  recurringNote: string | null;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  vendorUid: string | null;
  vendorAddress: Record<string, string> | null;
  netAmount: string | null;
  vatAmount: string | null;
  vatRate: string | null;
  vatBreakdown: Array<{ rate: number; netAmount: number; vatAmount: number }> | null;
  accountNumber: string | null;
  costCenter: string | null;
  category: string | null;
  validationDetails: ValidationResult[];
  uidValidationStatus: UidValidationStatusType;
  aiConfidence: string | null;
  isDuplicate: boolean;
  notes: string | null;
  lineItems: InvoiceLineItemData[];
  paymentMethod: PaymentMethodType;
  cashPaymentDate: string | null;
  privatePercent: number | null;
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

export type TrafficLightStatus = 'GREEN' | 'YELLOW' | 'RED' | 'GRAY';
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
  // Steuerberater-Feedback
  serviceType: ServiceType | null;
  hospitalityGuests: string | null;
  hospitalityReason: string | null;
  deductibilityPercent: number | null;
  deductibilityNote: string | null;
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
  mimeType: string;
  deliveryDate: string | null;
  isReverseCharge: boolean;
  recipientUid: string | null;
  issuerEmail: string | null;
  issuerIban: string | null;
  // Relations
  vendor: { id: string; name: string; uid: string | null } | null;
  customer: { id: string; name: string; uid: string | null } | null;
  // Ersatzbeleg fields
  replacesInvoiceId: string | null;
  replacesBelegNr: number | null;
  replacedByInvoiceId: string | null;
  replacedByBelegNr: number | null;
  ersatzReason: string | null;
  // Archival fields
  archivedByUserId: string | null;
  archivedStoragePath: string | null;
  archivedFileName: string | null;
  stampFailed: boolean;
  approvalComment: string | null;
  // Correction request fields
  correctionRequestedAt: string | null;
  correctionNote: string | null;
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
  closingBalance: string | null;
  createdAt: string;
}

export interface BankStatementUploadResult {
  statement: BankStatementListItem;
  transactionsImported: number;
  matchingSuggestions: number;
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

export interface PaymentDifferenceItem {
  id: string;
  matchingId: string;
  invoiceAmount: string;
  paidAmount: string;
  differenceAmount: string;
  differenceReason: DifferenceReasonType;
  notes: string | null;
  requiresVatCorrection: boolean;
}

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
  paymentDifference: PaymentDifferenceItem | null;
}

// ============================================================
// Monthly Reconciliation Types (Monatsabstimmung)
// ============================================================

export interface MonthlyReconciliationSummary {
  month: string;
  totalIncome: string;
  totalExpenses: string;
  totalTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  openInvoices: number;
  matchedPercent: number;
  vorsteuerTotal: string;
  vorsteuerByRate: Array<{ rate: number; netAmount: string; vatAmount: string }>;
}

export interface ReconciliationMatchedItem {
  matchingId: string;
  matchType: MatchTypeValue;
  matchStatus: MatchStatusValue;
  confidence: string | null;
  matchReason: string | null;
  invoice: {
    id: string;
    belegNr: number;
    vendorName: string | null;
    customerName: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    grossAmount: string | null;
    netAmount: string | null;
    vatAmount: string | null;
    vatRate: string | null;
    currency: string;
    direction: InvoiceDirection;
    validationStatus: ValidationStatusType;
    archivalNumber: string | null;
  };
  transaction: {
    id: string;
    transactionDate: string;
    amount: string;
    currency: string;
    counterpartName: string | null;
    reference: string | null;
    bookingText: string | null;
  };
}

export interface ReconciliationUnmatchedTransaction {
  id: string;
  transactionDate: string;
  amount: string;
  currency: string;
  counterpartName: string | null;
  reference: string | null;
  bookingText: string | null;
  hasSuggestedMatching: boolean;
  suggestedMatchingId: string | null;
  suggestedInvoiceName: string | null;
}

export interface ReconciliationUnmatchedInvoice {
  id: string;
  belegNr: number;
  vendorName: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  grossAmount: string | null;
  currency: string;
  direction: InvoiceDirection;
  validationStatus: ValidationStatusType;
  processingStatus: ProcessingStatusType;
  hasSuggestedMatching: boolean;
  suggestedMatchingId: string | null;
  suggestedTransactionDate: string | null;
}

export interface ReconciliationBookedTransaction {
  bookingId: string;
  bookingType: BookingTypeValue;
  accountNumber: string;
  amount: string;
  notes: string | null;
  confirmedAt: string;
  transaction: {
    id: string;
    transactionDate: string;
    amount: string;
    currency: string;
    counterpartName: string | null;
    reference: string | null;
    bookingText: string | null;
  };
}

export interface MonthlyReconciliationData {
  summary: MonthlyReconciliationSummary;
  matched: ReconciliationMatchedItem[];
  unmatchedTransactions: ReconciliationUnmatchedTransaction[];
  unmatchedInvoices: ReconciliationUnmatchedInvoice[];
  bookedTransactions: ReconciliationBookedTransaction[];
  availableMonths: string[];
}

// ============================================================
// Dashboard Types
// ============================================================

export type DashboardPeriod = 'last30' | 'last60' | 'last90' | 'currentMonth' | 'currentYear';

export interface CashflowForecastPoint {
  date: string;              // "YYYY-MM-DD"
  projectedBalance: string;  // Decimal as string
}

export interface OpenInvoiceItem {
  id: string;
  partnerName: string;
  grossAmount: string;
  dueDate: string | null;
  daysOverdue: number;
  invoiceNumber: string | null;
}

export interface DashboardStats {
  // V1 fields
  totalInvoices: number;
  pendingReview: number;
  matchedInvoices: number;
  unmatchedInvoices: number;
  parkedInvoices: number;
  validationSummary: {
    valid: number;
    warning: number;
    invalid: number;
    pending: number;
  };
  totalAmount: string;
  foreignCurrencyCount: number;
  recentActivity: ActivityItem[];

  // V2 KPIs
  revenue?: string;
  costs?: string;
  profit?: string;
  currentBalance?: string | null;

  // V2 Cashflow Forecast
  cashflowForecast?: CashflowForecastPoint[];

  // V2 Top 5 Open Items
  topReceivables?: OpenInvoiceItem[];
  topPayables?: OpenInvoiceItem[];

  // Period metadata
  period?: DashboardPeriod;
  periodFrom?: string;
  periodTo?: string;
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}

// ============================================================
// Substitute Document Types (Ersatzbeleg-Workflow)
// ============================================================

export interface SubstituteDocumentItem {
  id: string;
  invoiceId: string;
  tenantId: string;
  reason: string;
  paymentDate: string | null;
  amount: string;
  description: string | null;
  vatDeductible: boolean;
  vatNote: string | null;
  storagePath: string | null;
  createdByUserId: string;
  createdAt: string;
}

// ============================================================
// User Company Access Types (Steuerberater Multi-Tenant)
// ============================================================

// ============================================================
// Chart of Accounts Types
// ============================================================

export interface AccountItem {
  id: string;
  tenantId: string;
  number: string;
  name: string;
  type: AccountTypeValue;
  category: string | null;
  taxCode: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Transaction Booking Types (Privatentnahme/Privateinlage)
// ============================================================

export interface TransactionBookingItem {
  id: string;
  tenantId: string;
  transactionId: string;
  bookingType: BookingTypeValue;
  accountNumber: string;
  amount: string;
  notes: string | null;
  confirmedByUserId: string;
  confirmedAt: string;
  createdAt: string;
}

// ============================================================
// User Company Access Types (Steuerberater Multi-Tenant)
// ============================================================

export interface UserCompanyAccessItem {
  id: string;
  userId: string;
  tenantId: string;
  accessLevel: AccessLevelType;
  grantedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; email: string; firstName: string; lastName: string };
  tenant?: { id: string; name: string; slug: string };
}

// ============================================================
// Email Connector Types
// ============================================================

export interface EmailConnectorItem {
  id: string;
  tenantId: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  folder: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  consecutiveFailures: number;
  pollIntervalMinutes: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateEmailConnectorRequest {
  label: string;
  host: string;
  port?: number;
  secure?: boolean;
  username: string;
  password: string;
  folder?: string;
  pollIntervalMinutes?: number;
}

export interface UpdateEmailConnectorRequest {
  label?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  folder?: string;
  pollIntervalMinutes?: number;
  isActive?: boolean;
}

export interface TestEmailConnectorRequest {
  host: string;
  port?: number;
  secure?: boolean;
  username: string;
  password: string;
}

// ============================================================
// Recurring Costs Types (Laufende Kosten)
// ============================================================

export interface RecurringCostItem {
  vendorName: string;
  recurringGroupId: string;
  recurringInterval: RecurringIntervalType;
  recurringNote: string | null;
  lastGrossAmount: string;
  lastInvoiceDate: string | null;
  nextExpectedDate: string | null;
  invoiceCount: number;
  isOverdue: boolean;
}

export interface RecurringCostsSummary {
  monthlyTotal: string;
  items: RecurringCostItem[];
}

// ============================================================
// Export Config Types
// ============================================================

export type ExportFormatType = 'CSV_GENERIC' | 'BMD_CSV' | 'BMD_XML';

export interface ExportConfigItem {
  id: string;
  tenantId: string;
  name: string;
  format: ExportFormatType;
  delimiter: string;
  dateFormat: string;
  decimalSeparator: string;
  encoding: string;
  includeHeader: boolean;
  columnMapping: Record<string, string>;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}
