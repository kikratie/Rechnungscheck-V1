import type { ApiResponse, InvoiceListItem, InvoiceDetailExtended, ExtractedDataItem } from '@buchungsai/shared';
import { apiClient } from './client';

export interface InvoiceFilters {
  page?: number;
  limit?: number;
  search?: string;
  processingStatus?: string;
  validationStatus?: string;
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

export async function uploadInvoiceApi(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>('/invoices', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function updateInvoiceApi(id: string, data: Record<string, unknown>) {
  const response = await apiClient.put<ApiResponse<ExtractedDataItem>>(`/invoices/${id}`, data);
  return response.data;
}

export async function approveInvoiceApi(id: string) {
  const response = await apiClient.post<ApiResponse<InvoiceListItem>>(`/invoices/${id}/approve`);
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

export async function batchApproveInvoicesApi(invoiceIds: string[]) {
  const response = await apiClient.post<ApiResponse<{ approved: number; skipped: string[] }>>('/invoices/batch-approve', { invoiceIds });
  return response.data;
}

export async function getInvoiceDownloadUrl(id: string) {
  const response = await apiClient.get<ApiResponse<{ url: string }>>(`/invoices/${id}/download`);
  return response.data;
}

export async function getInvoiceVersionsApi(id: string) {
  const response = await apiClient.get<ApiResponse<ExtractedDataItem[]>>(`/invoices/${id}/versions`);
  return response.data;
}
