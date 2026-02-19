import type { ApiResponse } from '@buchungsai/shared';
import { apiClient } from './client';

export async function listBankStatementsApi(params: { page?: number; limit?: number } = {}) {
  const response = await apiClient.get<ApiResponse<unknown[]>>('/bank-statements', { params });
  return response.data;
}

export async function getBankStatementApi(id: string) {
  const response = await apiClient.get<ApiResponse<unknown>>(`/bank-statements/${id}`);
  return response.data;
}
