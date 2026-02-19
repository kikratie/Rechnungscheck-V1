import type { ApiResponse, DashboardStats } from '@buchungsai/shared';
import { apiClient } from './client';

export async function getDashboardStatsApi() {
  const response = await apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats');
  return response.data;
}
