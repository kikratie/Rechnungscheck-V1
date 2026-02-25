import type { ApiResponse, DashboardStats, DashboardPeriod } from '@buchungsai/shared';
import { apiClient } from './client';

export async function getDashboardStatsApi(period?: DashboardPeriod) {
  const params = period ? { period } : {};
  const response = await apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats', { params });
  return response.data;
}
