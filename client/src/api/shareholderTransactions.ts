import { apiClient } from './client.js';
import type { ShareholderTransactionItem, ShareholderBalanceSummary, ApiResponse } from '@buchungsai/shared';

export async function listShareholderTransactionsApi(params?: {
  status?: 'OPEN' | 'PAID';
  transactionType?: 'RECEIVABLE' | 'PAYABLE';
  page?: number;
  limit?: number;
}): Promise<{ items: ShareholderTransactionItem[]; total: number }> {
  const { data } = await apiClient.get<ApiResponse<ShareholderTransactionItem[]> & { pagination?: { total: number } }>(
    '/shareholder-transactions',
    { params },
  );
  return {
    items: data.data!,
    total: data.pagination?.total ?? data.data!.length,
  };
}

export async function getShareholderBalanceApi(): Promise<ShareholderBalanceSummary> {
  const { data } = await apiClient.get<ApiResponse<ShareholderBalanceSummary>>('/shareholder-transactions/balance');
  return data.data!;
}

export async function markShareholderTransactionPaidApi(
  id: string,
  paidAt?: string,
): Promise<ShareholderTransactionItem> {
  const { data } = await apiClient.patch<ApiResponse<ShareholderTransactionItem>>(
    `/shareholder-transactions/${id}/pay`,
    paidAt ? { paidAt } : {},
  );
  return data.data!;
}
