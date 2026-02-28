import { apiClient } from './client';
import type { ApiResponse } from '@buchungsai/shared';

// Types for admin responses
export interface AdminTenantListItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  onboardingComplete: boolean;
  accountingType: string;
  createdAt: string;
  _count: { users: number; invoices: number };
}

export interface AdminTenantDetail extends AdminTenantListItem {
  users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  }>;
  bankAccounts: Array<{
    id: string;
    label: string;
    accountType: string;
    iban: string | null;
    isPrimary: boolean;
  }>;
}

export interface AdminStats {
  tenantCount: number;
  userCount: number;
  invoiceCount: number;
}

// GET /admin/tenants
export async function getAdminTenantsApi() {
  const response = await apiClient.get<ApiResponse<AdminTenantListItem[]>>('/admin/tenants');
  return response.data.data!;
}

// GET /admin/tenants/:id
export async function getAdminTenantDetailApi(id: string) {
  const response = await apiClient.get<ApiResponse<AdminTenantDetail>>(`/admin/tenants/${id}`);
  return response.data.data!;
}

// POST /admin/tenants
export async function createAdminTenantApi(data: {
  tenantName: string;
  tenantSlug?: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  accountingType?: string;
}) {
  const response = await apiClient.post<ApiResponse<AdminTenantDetail>>('/admin/tenants', data);
  return response.data.data!;
}

// PUT /admin/tenants/:id
export async function updateAdminTenantApi(id: string, data: { name?: string; isActive?: boolean }) {
  const response = await apiClient.put<ApiResponse<AdminTenantListItem>>(`/admin/tenants/${id}`, data);
  return response.data.data!;
}

// GET /admin/stats
export async function getAdminStatsApi() {
  const response = await apiClient.get<ApiResponse<AdminStats>>('/admin/stats');
  return response.data.data!;
}

// POST /admin/switch-tenant
export async function switchTenantApi(tenantId: string) {
  const response = await apiClient.post<ApiResponse<{ tenantId: string; tenantName: string }>>('/admin/switch-tenant', { tenantId });
  return response.data.data!;
}

// GET /admin/metrics — Server performance metrics
export interface ServerMetrics {
  uptime: { ms: number; human: string; startedAt: string };
  requests: { total: number; errors: number; errorRate: string };
  topRoutes: Array<{ path: string; count: number; avgMs: number; maxMs: number; errors: number }>;
}

export async function getAdminMetricsApi() {
  const response = await apiClient.get<ApiResponse<ServerMetrics>>('/admin/metrics');
  return response.data.data!;
}

// GET /admin/llm-config — LLM configuration
export interface LlmConfig {
  provider: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyPreview: string | null;
}

export async function getAdminLlmConfigApi() {
  const response = await apiClient.get<ApiResponse<LlmConfig>>('/admin/llm-config');
  return response.data.data!;
}

// GET /dashboard/anomalies — Anomaly detection
export interface AnomalyAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  invoiceIds: string[];
  detectedAt: string;
}

export async function getAnomaliesApi() {
  const response = await apiClient.get<ApiResponse<AnomalyAlert[]>>('/dashboard/anomalies');
  return response.data.data!;
}
