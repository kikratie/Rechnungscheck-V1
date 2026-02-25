import type { ApiResponse, MatchingItem, MonthlyReconciliationData } from '@buchungsai/shared';
import { apiClient } from './client';

export async function listMatchingsApi(params: { page?: number; limit?: number; status?: string } = {}) {
  const response = await apiClient.get<ApiResponse<MatchingItem[]>>('/matchings', { params });
  return response.data;
}

export async function getMonthlyReconciliationApi(month?: string) {
  const response = await apiClient.get<ApiResponse<MonthlyReconciliationData>>(
    '/matchings/monthly',
    { params: month ? { month } : {} },
  );
  return response.data;
}

export async function runMatchingApi(statementId?: string) {
  const response = await apiClient.post<ApiResponse<{ created: number; deleted: number }>>('/matchings/run', { statementId });
  return response.data;
}

export async function createManualMatchingApi(invoiceId: string, transactionId: string) {
  const response = await apiClient.post<ApiResponse<MatchingItem>>('/matchings', { invoiceId, transactionId });
  return response.data;
}

export async function confirmMatchingApi(id: string) {
  const response = await apiClient.post<ApiResponse<MatchingItem>>(`/matchings/${id}/confirm`);
  return response.data;
}

export async function rejectMatchingApi(id: string) {
  const response = await apiClient.post<ApiResponse<MatchingItem>>(`/matchings/${id}/reject`);
  return response.data;
}

export async function deleteMatchingApi(id: string) {
  const response = await apiClient.delete<ApiResponse<null>>(`/matchings/${id}`);
  return response.data;
}

export async function updatePaymentDifferenceApi(matchingId: string, data: { differenceReason: string; notes?: string }) {
  const response = await apiClient.put<ApiResponse<unknown>>(`/matchings/${matchingId}/difference`, data);
  return response.data;
}

export async function createTransactionBookingApi(data: {
  transactionId: string;
  bookingType: 'PRIVATE_WITHDRAWAL' | 'PRIVATE_DEPOSIT';
  notes?: string | null;
}) {
  const response = await apiClient.post<ApiResponse<unknown>>('/matchings/bookings', data);
  return response.data;
}

export async function deleteTransactionBookingApi(id: string) {
  const response = await apiClient.delete<ApiResponse<null>>(`/matchings/bookings/${id}`);
  return response.data;
}
