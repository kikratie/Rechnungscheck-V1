import type { ApiResponse, MatchingItem } from '@buchungsai/shared';
import { apiClient } from './client';

export async function listMatchingsApi(params: { page?: number; limit?: number; status?: string } = {}) {
  const response = await apiClient.get<ApiResponse<MatchingItem[]>>('/matchings', { params });
  return response.data;
}
