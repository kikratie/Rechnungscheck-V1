import { apiClient } from './client.js';
import type { AccountItem, ApiResponse } from '@buchungsai/shared';

export async function listAccountsApi(params?: {
  activeOnly?: boolean;
  search?: string;
  type?: string;
}): Promise<AccountItem[]> {
  const { data } = await apiClient.get<ApiResponse<AccountItem[]>>('/accounts', { params });
  return data.data!;
}

export async function getAccountApi(id: string): Promise<AccountItem> {
  const { data } = await apiClient.get<ApiResponse<AccountItem>>(`/accounts/${id}`);
  return data.data!;
}

export async function createAccountApi(account: {
  number: string;
  name: string;
  type: string;
  category?: string | null;
  taxCode?: string | null;
  sortOrder?: number;
}): Promise<AccountItem> {
  const { data } = await apiClient.post<ApiResponse<AccountItem>>('/accounts', account);
  return data.data!;
}

export async function updateAccountApi(id: string, account: {
  name?: string;
  category?: string | null;
  taxCode?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<AccountItem> {
  const { data } = await apiClient.put<ApiResponse<AccountItem>>(`/accounts/${id}`, account);
  return data.data!;
}

export async function deactivateAccountApi(id: string): Promise<AccountItem> {
  const { data } = await apiClient.delete<ApiResponse<AccountItem>>(`/accounts/${id}`);
  return data.data!;
}

export async function seedAccountsApi(): Promise<{ message: string; count: number }> {
  const { data } = await apiClient.post<ApiResponse<{ message: string; count: number }>>('/accounts/seed');
  return data.data!;
}
