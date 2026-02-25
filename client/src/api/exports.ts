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
