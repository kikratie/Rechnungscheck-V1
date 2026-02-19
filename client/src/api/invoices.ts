import type { ApiResponse, InvoiceListItem, InvoiceDetail } from '@buchungsai/shared';
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
  const response = await apiClient.get<ApiResponse<InvoiceDetail>>(`/invoices/${id}`);
  return response.data;
}
