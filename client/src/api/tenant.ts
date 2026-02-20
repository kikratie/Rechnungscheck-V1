import { apiClient } from './client';
import type { ApiResponse, TenantProfile, BankAccountItem } from '@buchungsai/shared';

export async function getTenantApi() {
  const response = await apiClient.get<ApiResponse<TenantProfile>>('/tenant');
  return response.data.data!;
}

export async function updateTenantApi(data: Partial<TenantProfile>) {
  const response = await apiClient.put<ApiResponse<TenantProfile>>('/tenant', data);
  return response.data.data!;
}

export async function completeOnboardingApi(data: Record<string, unknown>) {
  const response = await apiClient.post<ApiResponse<TenantProfile>>('/tenant/complete-onboarding', data);
  return response.data.data!;
}

// Bank Account CRUD
export async function getBankAccountsApi() {
  const response = await apiClient.get<ApiResponse<BankAccountItem[]>>('/tenant/bank-accounts');
  return response.data.data!;
}

export async function createBankAccountApi(data: {
  label: string;
  accountType?: string;
  iban?: string | null;
  bic?: string | null;
  bankName?: string | null;
  cardLastFour?: string | null;
  isPrimary?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<BankAccountItem>>('/tenant/bank-accounts', data);
  return response.data.data!;
}

export async function updateBankAccountApi(id: string, data: {
  label?: string;
  accountType?: string;
  iban?: string | null;
  bic?: string | null;
  bankName?: string | null;
  cardLastFour?: string | null;
  isPrimary?: boolean;
}) {
  const response = await apiClient.put<ApiResponse<BankAccountItem>>(`/tenant/bank-accounts/${id}`, data);
  return response.data.data!;
}

export async function deleteBankAccountApi(id: string) {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>(`/tenant/bank-accounts/${id}`);
  return response.data.data!;
}
