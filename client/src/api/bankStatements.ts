import type { ApiResponse, BankStatementUploadResult } from '@buchungsai/shared';
import { apiClient } from './client';

export async function listBankStatementsApi(params: { page?: number; limit?: number } = {}) {
  const response = await apiClient.get<ApiResponse<unknown[]>>('/bank-statements', { params });
  return response.data;
}

export async function getBankStatementApi(id: string) {
  const response = await apiClient.get<ApiResponse<unknown>>(`/bank-statements/${id}`);
  return response.data;
}

export async function uploadBankStatementApi(file: File, bankAccountId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (bankAccountId) formData.append('bankAccountId', bankAccountId);
  const response = await apiClient.post<ApiResponse<BankStatementUploadResult>>('/bank-statements', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteBankStatementApi(id: string) {
  const response = await apiClient.delete<ApiResponse<null>>(`/bank-statements/${id}`);
  return response.data;
}
