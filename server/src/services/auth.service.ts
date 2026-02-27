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
  FeatureVisibility,
} from '@buchungsai/shared';
import { DEFAULT_FEATURE_VISIBILITY } from '@buchungsai/shared';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { seedAccountsForTenant } from './account.service.js';
import { seedRulesForTenant } from './deductibilityRule.service.js';

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function extractFeatureVisibility(settings: unknown): FeatureVisibility {
  const s = settings as Record<string, unknown> | null;
  const fv = s?.featureVisibility as Record<string, boolean> | undefined;
  return { ...DEFAULT_FEATURE_VISIBILITY, ...fv } as FeatureVisibility;
}

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
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
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
        accountingType: data.accountingType || 'EA',
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

  // Standard-Kontenplan + Genehmigungs-Regeln für neuen Mandanten seeden
  await seedAccountsForTenant(result.tenant.id);
  await seedRulesForTenant(result.tenant.id);

  // BMD NTCS System-Exportprofil erstellen
  await prisma.exportConfig.create({
    data: {
      tenantId: result.tenant.id,
      name: 'BMD NTCS',
      format: 'BMD_CSV',
      columnMapping: {
        belegart: 'direction',
        belegnummer: 'archivalNumber',
        datum: 'invoiceDate',
        konto: 'accountNumber',
        gegenkonto: 'paymentMethod',
        betrag: 'grossAmount',
        steuercode: 'vatRate',
        text: 'vendorName',
        lieferant: 'vendorName',
        uid: 'vendorUid',
      },
      delimiter: ';',
      dateFormat: 'dd.MM.yyyy',
      decimalSeparator: ',',
      encoding: 'UTF-8',
      includeHeader: true,
      isDefault: true,
      isSystem: true,
    },
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
    onboardingComplete: false,
    accountingType: result.tenant.accountingType,
    featureVisibility: DEFAULT_FEATURE_VISIBILITY as FeatureVisibility,
    isSuperAdmin: false,
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

  // Account lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new UnauthorizedError(
      `Konto vorübergehend gesperrt. Bitte versuchen Sie es in ${remainingMin} Minute${remainingMin > 1 ? 'n' : ''} erneut.`,
    );
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    // Increment failed attempts
    const newAttempts = user.failedLoginAttempts + 1;
    const updateData: { failedLoginAttempts: number; lockedUntil?: Date } = {
      failedLoginAttempts: newAttempts,
    };

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);

      await writeAuditLog({
        tenantId: user.tenantId,
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        action: 'ACCOUNT_LOCKED',
        newData: { failedAttempts: newAttempts, lockedUntilMs: LOCKOUT_DURATION_MS },
        ipAddress,
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    const attemptsLeft = MAX_LOGIN_ATTEMPTS - newAttempts;
    if (attemptsLeft > 0) {
      throw new UnauthorizedError(
        `Ungültige E-Mail oder Passwort. Noch ${attemptsLeft} Versuch${attemptsLeft > 1 ? 'e' : ''}.`,
      );
    }
    throw new UnauthorizedError(
      'Konto vorübergehend gesperrt wegen zu vieler Fehlversuche. Bitte versuchen Sie es in 15 Minuten erneut.',
    );
  }

  // Successful login → reset lockout counters
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
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
    onboardingComplete: user.tenant.onboardingComplete,
    accountingType: user.tenant.accountingType,
    featureVisibility: extractFeatureVisibility(user.tenant.settings),
    isSuperAdmin: user.isSuperAdmin,
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
    onboardingComplete: user.tenant.onboardingComplete,
    accountingType: user.tenant.accountingType,
    featureVisibility: extractFeatureVisibility(user.tenant.settings),
    isSuperAdmin: user.isSuperAdmin,
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, tenantId: true },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordValid) {
    throw new UnauthorizedError('Aktuelles Passwort ist falsch');
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  await writeAuditLog({
    tenantId: user.tenantId,
    userId,
    entityType: 'User',
    entityId: userId,
    action: 'PASSWORD_CHANGED',
  });
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
  });

  // Always return success (prevent email enumeration)
  if (!user) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
    },
  });

  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    entityType: 'User',
    entityId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
  });

  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ email: string }> {
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: token },
  });

  if (!user) {
    throw new UnauthorizedError('Ungültiger oder bereits verwendeter Link');
  }

  if (user.passwordResetExpiresAt && user.passwordResetExpiresAt < new Date()) {
    // Clear expired token
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: null, passwordResetExpiresAt: null },
    });
    throw new UnauthorizedError('Der Link ist abgelaufen. Bitte fordern Sie einen neuen an.');
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    entityType: 'User',
    entityId: user.id,
    action: 'PASSWORD_RESET_COMPLETED',
  });

  return { email: user.email };
}
