import type { ApiResponse } from '@buchungsai/shared';
import { apiClient } from './client';

export interface SendMailPayload {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  entityType?: string;
  entityId?: string;
}

export async function sendMailApi(data: SendMailPayload) {
  const response = await apiClient.post<ApiResponse<{ messageId: string }>>('/mail/send', data);
  return response.data;
}

export async function getMailStatusApi() {
  const response = await apiClient.get<ApiResponse<{ configured: boolean }>>('/mail/status');
  return response.data;
}

export async function generateCorrectionEmailApi(invoiceId: string) {
  const response = await apiClient.post<ApiResponse<{ to: string; subject: string; body: string }>>(`/mail/generate-correction/${invoiceId}`);
  return response.data;
}
