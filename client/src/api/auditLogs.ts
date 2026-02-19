import type { ApiResponse } from '@buchungsai/shared';
import { apiClient } from './client';

export async function listAuditLogsApi(params: { page?: number; limit?: number; entityType?: string; action?: string } = {}) {
  const response = await apiClient.get<ApiResponse<unknown[]>>('/audit-logs', { params });
  return response.data;
}
