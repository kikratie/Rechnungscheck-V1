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

// Steuerberater-Zugang (Multi-Tenant Access)
export async function getAccessibleTenantsApi() {
  const response = await apiClient.get<ApiResponse<Array<{ tenantId: string; name: string; slug: string; accessLevel: string }>>>('/tenant/accessible-tenants');
  return response.data.data!;
}

export async function grantAccessApi(email: string, accessLevel: string = 'READ') {
  const response = await apiClient.post<ApiResponse<unknown>>('/tenant/grant-access', { email, accessLevel });
  return response.data;
}

export async function revokeAccessApi(userId: string) {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>(`/tenant/revoke-access/${userId}`);
  return response.data;
}

export async function getAccessListApi() {
  const response = await apiClient.get<ApiResponse<Array<{
    id: string;
    accessLevel: string;
    user: { id: string; email: string; firstName: string; lastName: string };
  }>>>('/tenant/access-list');
  return response.data.data!;
}

// DSGVO / Terms
export async function acceptTermsApi() {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/tenant/accept-terms');
  return response.data;
}

export async function deleteAccountApi(password: string) {
  const response = await apiClient.delete<ApiResponse<{ message: string }>>('/tenant/account', {
    data: { password },
  });
  return response.data;
}

export async function exportUserDataApi() {
  const response = await apiClient.get('/tenant/data-export', { responseType: 'blob' });
  return response.data as Blob;
}
