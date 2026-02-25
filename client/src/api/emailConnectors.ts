import { apiClient } from './client.js';
import type {
  EmailConnectorItem,
  CreateEmailConnectorRequest,
  UpdateEmailConnectorRequest,
  TestEmailConnectorRequest,
  ApiResponse,
} from '@buchungsai/shared';

export async function listEmailConnectorsApi(): Promise<EmailConnectorItem[]> {
  const { data } = await apiClient.get<ApiResponse<EmailConnectorItem[]>>('/email-connectors');
  return data.data!;
}

export async function getEmailConnectorApi(id: string): Promise<EmailConnectorItem> {
  const { data } = await apiClient.get<ApiResponse<EmailConnectorItem>>(`/email-connectors/${id}`);
  return data.data!;
}

export async function createEmailConnectorApi(
  connector: CreateEmailConnectorRequest,
): Promise<EmailConnectorItem> {
  const { data } = await apiClient.post<ApiResponse<EmailConnectorItem>>('/email-connectors', connector);
  return data.data!;
}

export async function updateEmailConnectorApi(
  id: string,
  connector: UpdateEmailConnectorRequest,
): Promise<EmailConnectorItem> {
  const { data } = await apiClient.put<ApiResponse<EmailConnectorItem>>(`/email-connectors/${id}`, connector);
  return data.data!;
}

export async function deleteEmailConnectorApi(id: string): Promise<void> {
  await apiClient.delete(`/email-connectors/${id}`);
}

export async function testEmailConnectorApi(
  params: TestEmailConnectorRequest,
): Promise<{ success: boolean; messageCount?: number; error?: string }> {
  const { data } = await apiClient.post<ApiResponse<{ success: boolean; messageCount?: number; error?: string }>>(
    '/email-connectors/test',
    params,
  );
  return data.data!;
}

export async function triggerSyncApi(id: string): Promise<void> {
  await apiClient.post(`/email-connectors/${id}/sync`);
}
