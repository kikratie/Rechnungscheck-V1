import type { ApiResponse } from '@buchungsai/shared';
import { apiClient } from './client';

export interface VendorListItem {
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

export interface VendorDetail extends VendorListItem {
  bic: string | null;
  notes: string | null;
  viesAddress: string | null;
  updatedAt: string;
  invoices: VendorInvoice[];
}

export interface VendorInvoice {
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

export interface VendorFilters {
  page?: number;
  limit?: number;
  search?: string;
  activeOnly?: boolean;
}

export async function listVendorsApi(filters: VendorFilters = {}) {
  const response = await apiClient.get<ApiResponse<VendorListItem[]>>('/vendors', { params: filters });
  return response.data;
}

export async function getVendorApi(id: string) {
  const response = await apiClient.get<ApiResponse<VendorDetail>>(`/vendors/${id}`);
  return response.data;
}

export async function updateVendorApi(id: string, data: Record<string, unknown>) {
  const response = await apiClient.put<ApiResponse<VendorDetail>>(`/vendors/${id}`, data);
  return response.data;
}
