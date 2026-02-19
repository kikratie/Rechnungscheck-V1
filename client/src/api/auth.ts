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
