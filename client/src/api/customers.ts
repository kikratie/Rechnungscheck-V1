import type { ApiResponse } from '@buchungsai/shared';
import { apiClient } from './client';

export interface CustomerListItem {
  id: string;
  name: string;
  uid: string | null;
  address: Record<string, string> | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  website: string | null;
  viesName: string | null;
  viesCheckedAt: string | null;
  isActive: boolean;
  invoiceCount: number;
  createdAt: string;
}

export interface CustomerDetail extends CustomerListItem {
  bic: string | null;
  notes: string | null;
  viesName: string | null;
  viesAddress: string | null;
  viesCheckedAt: string | null;
  updatedAt: string;
  invoices: CustomerInvoice[];
}

export interface CustomerInvoice {
  id: string;
  belegNr: number;
  originalFileName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  grossAmount: string | null;
  currency: string;
  processingStatus: string;
  validationStatus: string;
  createdAt: string;
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  activeOnly?: boolean;
}

export async function listCustomersApi(filters: CustomerFilters = {}) {
  const response = await apiClient.get<ApiResponse<CustomerListItem[]>>('/customers', { params: filters });
  return response.data;
}

export async function getCustomerApi(id: string) {
  const response = await apiClient.get<ApiResponse<CustomerDetail>>(`/customers/${id}`);
  return response.data;
}

export async function updateCustomerApi(id: string, data: Record<string, unknown>) {
  const response = await apiClient.put<ApiResponse<CustomerDetail>>(`/customers/${id}`, data);
  return response.data;
}
