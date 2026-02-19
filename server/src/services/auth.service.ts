import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../utils/errors.js';
import type {
  AuthTokens,
  JwtPayload,
  RegisterRequest,
  UserProfile,
} from '@buchungsai/shared';
import { writeAuditLog } from '../middleware/auditLogger.js';

const SALT_ROUNDS = 12;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>): AuthTokens {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });

  const refreshToken = crypto.randomBytes(64).toString('hex');

  return { accessToken, refreshToken };
}

export async function register(data: RegisterRequest): Promise<{ user: UserProfile; tokens: AuthTokens }> {
  // Prüfe ob E-Mail bereits existiert (global, nicht nur pro Tenant)
  const existingUser = await prisma.user.findFirst({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new ConflictError('Ein Benutzer mit dieser E-Mail-Adresse existiert bereits');
  }

  // Slug generieren
  let slug = generateSlug(data.tenantName);
  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Passwort hashen
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  // Tenant + Admin-User erstellen (Transaction)
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: data.tenantName,
        slug,
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'ADMIN',
      },
    });

    return { tenant, user };
  });

  // Tokens generieren
  const tokens = generateTokens({
    sub: result.user.id,
    tenantId: result.tenant.id,
    email: result.user.email,
    role: result.user.role,
  });

  // Refresh Token speichern
  await prisma.refreshToken.create({
    data: {
      userId: result.user.id,
      token: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 Tage
    },
  });

  // Audit Log
  await writeAuditLog({
    tenantId: result.tenant.id,
    userId: result.user.id,
    entityType: 'Tenant',
    entityId: result.tenant.id,
    action: 'CREATE',
    newData: { tenantName: data.tenantName, email: data.email },
  });

  const userProfile: UserProfile = {
    id: result.user.id,
    tenantId: result.tenant.id,
    email: result.user.email,
    firstName: result.user.firstName,
    lastName: result.user.lastName,
    role: result.user.role,
    tenantName: result.tenant.name,
  };

  return { user: userProfile, tokens };
}

export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ user: UserProfile; tokens: AuthTokens }> {
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    include: { tenant: true },
  });

  if (!user) {
    throw new UnauthorizedError('Ungültige E-Mail oder Passwort');
  }

  if (!user.tenant.isActive) {
    throw new UnauthorizedError('Dieser Mandant ist deaktiviert');
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    throw new UnauthorizedError('Ungültige E-Mail oder Passwort');
  }

  // Tokens generieren
  const tokens = generateTokens({
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  // Refresh Token speichern
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Last Login aktualisieren
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Audit Log
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    entityType: 'User',
    entityId: user.id,
    action: 'LOGIN',
    ipAddress,
    userAgent,
  });

  const userProfile: UserProfile = {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantName: user.tenant.name,
  };

  return { user: userProfile, tokens };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!stored || stored.expiresAt < new Date()) {
    // Abgelaufenen Token löschen
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
    }
    throw new UnauthorizedError('Ungültiger oder abgelaufener Refresh-Token');
  }

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    include: { tenant: true },
  });

  if (!user || !user.isActive || !user.tenant.isActive) {
    throw new UnauthorizedError('Benutzer oder Mandant ist deaktiviert');
  }

  // Alten Token löschen (Token-Rotation)
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  // Neue Tokens generieren
  const tokens = generateTokens({
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  // Neuen Refresh Token speichern
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return tokens;
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { token: refreshToken },
  });
}

export async function getMe(userId: string): Promise<UserProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantName: user.tenant.name,
  };
}
