import { apiClient } from './client.js';
import type { DeductibilityRuleItem, ApiResponse } from '@buchungsai/shared';

export async function listRulesApi(params?: {
  activeOnly?: boolean;
}): Promise<DeductibilityRuleItem[]> {
  const { data } = await apiClient.get<ApiResponse<DeductibilityRuleItem[]>>('/deductibility-rules', { params });
  return data.data!;
}

export async function createRuleApi(rule: {
  name: string;
  description?: string | null;
  inputTaxPercent: number;
  expensePercent: number;
  ruleType?: string;
  createsReceivable?: boolean;
}): Promise<DeductibilityRuleItem> {
  const { data } = await apiClient.post<ApiResponse<DeductibilityRuleItem>>('/deductibility-rules', rule);
  return data.data!;
}

export async function updateRuleApi(id: string, rule: {
  name?: string;
  description?: string | null;
  inputTaxPercent?: number;
  expensePercent?: number;
  ruleType?: string;
  createsReceivable?: boolean;
  isActive?: boolean;
}): Promise<DeductibilityRuleItem> {
  const { data } = await apiClient.put<ApiResponse<DeductibilityRuleItem>>(`/deductibility-rules/${id}`, rule);
  return data.data!;
}

export async function deactivateRuleApi(id: string): Promise<DeductibilityRuleItem> {
  const { data } = await apiClient.delete<ApiResponse<DeductibilityRuleItem>>(`/deductibility-rules/${id}`);
  return data.data!;
}

export async function seedRulesApi(): Promise<{ message: string; count: number }> {
  const { data } = await apiClient.post<ApiResponse<{ message: string; count: number }>>('/deductibility-rules/seed');
  return data.data!;
}
