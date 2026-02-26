import type { ApiResponse, ExportConfigItem } from '@buchungsai/shared';
import { apiClient } from './client';

export async function exportBmdCsvApi(dateFrom: string, dateTo: string) {
  const response = await apiClient.post('/exports/bmd-csv', { dateFrom, dateTo }, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function exportMonthlyReportApi(year: number, month: number) {
  const response = await apiClient.post('/exports/monthly-report', { year, month }, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function exportFullApi(year?: number) {
  const response = await apiClient.post('/exports/full-export', { year }, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function exportOcrCheckApi(dateFrom?: string, dateTo?: string) {
  const response = await apiClient.post('/exports/ocr-check', { dateFrom, dateTo }, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

// ============================================================
// Export Config CRUD
// ============================================================

export async function getExportConfigsApi() {
  const response = await apiClient.get<ApiResponse<ExportConfigItem[]>>('/exports/configs');
  return response.data;
}

export async function createExportConfigApi(data: {
  name: string;
  format: string;
  delimiter?: string;
  dateFormat?: string;
  decimalSeparator?: string;
  encoding?: string;
  includeHeader?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<ExportConfigItem>>('/exports/configs', data);
  return response.data;
}

export async function updateExportConfigApi(id: string, data: {
  name?: string;
  format?: string;
  delimiter?: string;
  dateFormat?: string;
  decimalSeparator?: string;
  encoding?: string;
  includeHeader?: boolean;
  isDefault?: boolean;
}) {
  const response = await apiClient.put<ApiResponse<ExportConfigItem>>(`/exports/configs/${id}`, data);
  return response.data;
}

export async function deleteExportConfigApi(id: string) {
  const response = await apiClient.delete<ApiResponse<null>>(`/exports/configs/${id}`);
  return response.data;
}

/** Helper: trigger download of a Blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
