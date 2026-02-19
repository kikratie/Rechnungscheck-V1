import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import type { ApiResponse, AuthTokens, UserProfile } from '@buchungsai/shared';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);

    const response: ApiResponse<{ user: UserProfile; tokens: AuthTokens }> = {
      success: true,
      data: result,
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(
      email,
      password,
      req.ip,
      req.headers['user-agent'],
    );

    const response: ApiResponse<{ user: UserProfile; tokens: AuthTokens }> = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshAccessToken(refreshToken);

    const response: ApiResponse<AuthTokens> = {
      success: true,
      data: tokens,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);

    const response: ApiResponse = { success: true };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.userId!);

    const response: ApiResponse<UserProfile> = {
      success: true,
      data: user,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
