import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { DEFAULT_ACCOUNTS } from '@buchungsai/shared';
import type { AccountType } from '@prisma/client';

/**
 * Seed default accounts (from shared constants) for a tenant.
 * Uses createMany with skipDuplicates so it's safe to call multiple times.
 */
export async function seedAccountsForTenant(tenantId: string): Promise<number> {
  const result = await prisma.account.createMany({
    data: DEFAULT_ACCOUNTS.map((acc) => ({
      tenantId,
      number: acc.number,
      name: acc.name,
      type: acc.type,
      category: acc.category ?? null,
      taxCode: acc.taxCode ?? null,
      sortOrder: acc.sortOrder,
      isDefault: true,
    })),
    skipDuplicates: true,
  });

  writeAuditLog({
    tenantId,
    entityType: 'Account',
    entityId: tenantId,
    action: 'SEED_DEFAULT_ACCOUNTS',
    metadata: { count: result.count },
  });

  return result.count;
}

/**
 * List all accounts for a tenant, ordered by sortOrder.
 * Supports filtering by isActive, name/number search, and account type.
 */
export async function listAccounts(
  tenantId: string,
  opts?: { activeOnly?: boolean; search?: string; type?: string },
) {
  const { activeOnly = true, search, type } = opts ?? {};

  const where: Record<string, unknown> = { tenantId };

  if (activeOnly) where.isActive = true;

  if (type) where.type = type;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { number: { contains: search, mode: 'insensitive' } },
    ];
  }

  const accounts = await prisma.account.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
  });

  return accounts.map((a) => ({
    id: a.id,
    tenantId: a.tenantId,
    number: a.number,
    name: a.name,
    type: a.type,
    category: a.category,
    taxCode: a.taxCode,
    isDefault: a.isDefault,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));
}

/**
 * Get a single account by ID, scoped to tenant.
 */
export async function getAccount(tenantId: string, accountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, tenantId },
  });

  if (!account) return null;

  return formatAccount(account);
}

function formatAccount(account: {
  id: string; tenantId: string; number: string; name: string; type: string;
  category: string | null; taxCode: string | null; isDefault: boolean;
  isActive: boolean; sortOrder: number; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: account.id,
    tenantId: account.tenantId,
    number: account.number,
    name: account.name,
    type: account.type,
    category: account.category,
    taxCode: account.taxCode,
    isDefault: account.isDefault,
    isActive: account.isActive,
    sortOrder: account.sortOrder,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

/**
 * Create a new custom account for a tenant.
 * Checks uniqueness of the account number within the tenant.
 */
export async function createAccount(
  tenantId: string,
  data: {
    number: string;
    name: string;
    type: string;
    category?: string | null;
    taxCode?: string | null;
    sortOrder?: number;
  },
) {
  // Check uniqueness of number within tenant
  const existing = await prisma.account.findUnique({
    where: { tenantId_number: { tenantId, number: data.number } },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Konto mit Nummer ${data.number} existiert bereits`);
  }

  const account = await prisma.account.create({
    data: {
      tenantId,
      number: data.number,
      name: data.name,
      type: data.type as AccountType,
      category: data.category ?? null,
      taxCode: data.taxCode ?? null,
      sortOrder: data.sortOrder ?? 0,
      isDefault: false,
    },
  });

  writeAuditLog({
    tenantId,
    entityType: 'Account',
    entityId: account.id,
    action: 'CREATE',
    newData: { number: data.number, name: data.name, type: data.type },
  });

  return formatAccount(account);
}

/**
 * Update an existing account. Verifies it belongs to the tenant.
 */
export async function updateAccount(
  tenantId: string,
  accountId: string,
  data: {
    name?: string;
    category?: string | null;
    taxCode?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  const existing = await prisma.account.findFirst({
    where: { id: accountId, tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Konto', accountId);
  }

  const account = await prisma.account.update({
    where: { id: accountId },
    data,
  });

  writeAuditLog({
    tenantId,
    entityType: 'Account',
    entityId: accountId,
    action: 'UPDATE',
    previousData: { name: existing.name, category: existing.category, taxCode: existing.taxCode, isActive: existing.isActive, sortOrder: existing.sortOrder },
    newData: data,
  });

  return formatAccount(account);
}

/**
 * Deactivate an account (set isActive = false).
 * Prevents deactivation if it's the only active account with that number.
 */
export async function deactivateAccount(tenantId: string, accountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, tenantId },
  });

  if (!account) {
    throw new NotFoundError('Konto', accountId);
  }

  if (!account.isActive) {
    throw new ConflictError('Konto ist bereits deaktiviert');
  }

  const updated = await prisma.account.update({
    where: { id: accountId },
    data: { isActive: false },
  });

  writeAuditLog({
    tenantId,
    entityType: 'Account',
    entityId: accountId,
    action: 'DEACTIVATE',
    previousData: { isActive: true },
    newData: { isActive: false },
  });

  return formatAccount(updated);
}
