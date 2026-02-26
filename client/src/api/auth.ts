import { apiClient } from './client';
import type { ApiResponse, AuthTokens, UserProfile, LoginRequest, RegisterRequest } from '@buchungsai/shared';

export async function loginApi(data: LoginRequest) {
  const response = await apiClient.post<ApiResponse<{ user: UserProfile; tokens: AuthTokens }>>(
    '/auth/login',
    data,
  );
  return response.data.data!;
}

export async function registerApi(data: RegisterRequest) {
  const response = await apiClient.post<ApiResponse<{ user: UserProfile; tokens: AuthTokens }>>(
    '/auth/register',
    data,
  );
  return response.data.data!;
}

export async function getMeApi() {
  const response = await apiClient.get<ApiResponse<UserProfile>>('/auth/me');
  return response.data.data!;
}

export async function logoutApi(refreshToken: string) {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function acceptInviteApi(token: string, password: string) {
  const response = await apiClient.post<ApiResponse<{
    message: string;
    email: string;
    tenantName: string;
  }>>('/auth/accept-invite', { token, password });
  return response.data;
}

export async function changePasswordApi(currentPassword: string, newPassword: string) {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  return response.data;
}

export async function forgotPasswordApi(email: string) {
  const response = await apiClient.post<ApiResponse<{ message: string }>>('/auth/forgot-password', { email });
  return response.data;
}

export async function resetPasswordApi(token: string, password: string) {
  const response = await apiClient.post<ApiResponse<{ message: string; email: string }>>('/auth/reset-password', {
    token,
    password,
  });
  return response.data;
}
