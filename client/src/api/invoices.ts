import type { ApiResponse, InvoiceListItem, InvoiceDetailExtended, ExtractedDataItem, RecurringCostsSummary, RecurringIntervalType } from '@buchungsai/shared';
import { apiClient } from './client';

export interface InvoiceFilters {
  page?: number;
  limit?: number;
  search?: string;
  direction?: 'INCOMING' | 'OUTGOING';
  processingStatus?: string;
  validationStatus?: string;
  inboxCleared?: boolean;
  overdue?: boolean;
  recurring?: boolean;
  sortBy?: string;
  sortOrder?: string;
}

export async function listInvoicesApi(filters: InvoiceFilters = {}) {
  const response = await apiClient.get<ApiResponse<InvoiceListItem[]>>('/invoices', { params: filters });
  return response.data;
}

export async function getInvoiceApi(id: string) {
  const response = await apiClient.get<ApiResponse<InvoiceDetailExtended>>(`/invoices/${id}`);
  return response.data;
}

export async function uploadInvoiceApi(file: File, direction: 'INCOMING' | 'OUTGOING' = 'INCOMING') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('direction', direction);
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>('/invoices', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function updateInvoiceApi(id: string, data: Record<string, unknown>) {
  const response = await apiClient.put<ApiResponse<ExtractedDataItem>>(`/invoices/${id}`, data);
  return response.data;
}

export async function approveInvoiceApi(id: string, comment?: string | null) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/approve`, { comment: comment || undefined });
  return response.data;
}

export async function rejectInvoiceApi(id: string, reason: string) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/reject`, { reason });
  return response.data;
}

export async function deleteInvoiceApi(id: string) {
  const response = await apiClient.delete<ApiResponse<null>>(`/invoices/${id}`);
  return response.data;
}

export async function createErsatzbelegApi(originalInvoiceId: string, data: Record<string, unknown>) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${originalInvoiceId}/ersatzbeleg`, data);
  return response.data;
}

export async function createEigenbelegApi(data: {
  issuerName: string;
  description: string;
  invoiceDate: string;
  grossAmount: number;
  vatRate?: number | null;
  reason: string;
  direction?: 'INCOMING' | 'OUTGOING';
  accountNumber?: string | null;
  category?: string | null;
  transactionId?: string | null;
}) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>('/invoices/eigenbeleg', data);
  return response.data;
}

export async function batchApproveInvoicesApi(invoiceIds: string[], comment?: string | null) {
  const response = await apiClient.post<ApiResponse<{ archived: number; skipped: string[]; results: Array<{ invoiceId: string; archivalNumber: string }> }>>('/invoices/batch-approve', { invoiceIds, comment: comment || undefined });
  return response.data;
}

export async function getInvoiceDownloadUrl(id: string, original?: boolean) {
  const params = original ? { original: 'true' } : {};
  const response = await apiClient.get<ApiResponse<{ url: string; isArchived?: boolean }>>(`/invoices/${id}/download`, { params });
  return response.data;
}

export async function getInvoiceVersionsApi(id: string) {
  const response = await apiClient.get<ApiResponse<ExtractedDataItem[]>>(`/invoices/${id}/versions`);
  return response.data;
}

export async function parkInvoiceApi(id: string, reason: string) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/park`, { reason });
  return response.data;
}

export async function unparkInvoiceApi(id: string) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/unpark`);
  return response.data;
}

export async function cancelNumberApi(id: string, reason: string) {
  const response = await apiClient.post<ApiResponse<unknown>>(`/invoices/${id}/cancel-number`, { reason });
  return response.data;
}

export async function revalidateAllApi() {
  const response = await apiClient.post<ApiResponse<{ revalidated: number }>>('/invoices/revalidate-all');
  return response.data;
}

export async function markCashPaymentApi(id: string, paymentDate: string) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/cash-payment`, { paymentDate });
  return response.data;
}

export async function undoCashPaymentApi(id: string) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/undo-cash-payment`);
  return response.data;
}

export async function requestCorrectionApi(id: string, note: string) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/request-correction`, { note });
  return response.data;
}

export async function setRecurringApi(id: string, data: { isRecurring: boolean; recurringInterval?: RecurringIntervalType | null; recurringNote?: string | null }) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/set-recurring`, data);
  return response.data;
}

export async function getRecurringSummaryApi() {
  const response = await apiClient.get<ApiResponse<RecurringCostsSummary>>('/invoices/recurring-summary');
  return response.data;
}

export async function triageInvoiceApi(id: string) {
  const response = await apiClient.post<ApiResponse<{ id: string; inboxCleared: boolean }>>(`/invoices/${id}/triage`);
  return response.data;
}

export async function batchTriageInvoicesApi(invoiceIds: string[]) {
  const response = await apiClient.post<ApiResponse<{ triaged: number }>>('/invoices/batch-triage', { invoiceIds });
  return response.data;
}
