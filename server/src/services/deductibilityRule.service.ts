import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';
import { DEFAULT_DEDUCTIBILITY_RULES } from '@buchungsai/shared';

/**
 * Seed default deductibility rules for a tenant.
 * Uses createMany with skipDuplicates so it's safe to call multiple times.
 */
export async function seedRulesForTenant(tenantId: string): Promise<number> {
  const result = await prisma.deductibilityRule.createMany({
    data: DEFAULT_DEDUCTIBILITY_RULES.map((rule) => ({
      tenantId,
      name: rule.name,
      description: rule.description,
      inputTaxPercent: rule.inputTaxPercent,
      expensePercent: rule.expensePercent,
      ruleType: rule.ruleType,
      createsReceivable: rule.createsReceivable,
      isSystem: true,
      sortOrder: rule.sortOrder,
    })),
    skipDuplicates: true,
  });

  writeAuditLog({
    tenantId,
    entityType: 'DeductibilityRule',
    entityId: tenantId,
    action: 'SEED_DEFAULT_RULES',
    metadata: { count: result.count },
  });

  return result.count;
}

/**
 * List all deductibility rules for a tenant, ordered by sortOrder.
 */
export async function listRules(
  tenantId: string,
  opts?: { activeOnly?: boolean },
) {
  const { activeOnly = true } = opts ?? {};

  const where: Record<string, unknown> = { tenantId };
  if (activeOnly) where.isActive = true;

  const rules = await prisma.deductibilityRule.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
  });

  return rules.map(formatRule);
}

/**
 * Get a single rule by ID, scoped to tenant.
 */
export async function getRule(tenantId: string, ruleId: string) {
  const rule = await prisma.deductibilityRule.findFirst({
    where: { id: ruleId, tenantId },
  });

  if (!rule) return null;
  return formatRule(rule);
}

/**
 * Create a new custom deductibility rule.
 */
export async function createRule(
  tenantId: string,
  data: {
    name: string;
    description?: string | null;
    inputTaxPercent: number;
    expensePercent: number;
    ruleType?: string;
    createsReceivable?: boolean;
  },
) {
  // Check uniqueness of name within tenant
  const existing = await prisma.deductibilityRule.findUnique({
    where: { tenantId_name: { tenantId, name: data.name } },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Regel mit Name "${data.name}" existiert bereits`);
  }

  // Get max sortOrder for this tenant
  const maxSort = await prisma.deductibilityRule.aggregate({
    where: { tenantId },
    _max: { sortOrder: true },
  });

  const rule = await prisma.deductibilityRule.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description ?? null,
      inputTaxPercent: data.inputTaxPercent,
      expensePercent: data.expensePercent,
      ruleType: data.ruleType ?? 'standard',
      createsReceivable: data.createsReceivable ?? false,
      isSystem: false,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });

  writeAuditLog({
    tenantId,
    entityType: 'DeductibilityRule',
    entityId: rule.id,
    action: 'CREATE',
    newData: { name: data.name, inputTaxPercent: data.inputTaxPercent, expensePercent: data.expensePercent },
  });

  return formatRule(rule);
}

/**
 * Update an existing rule. System rules cannot be edited.
 */
export async function updateRule(
  tenantId: string,
  ruleId: string,
  data: {
    name?: string;
    description?: string | null;
    inputTaxPercent?: number;
    expensePercent?: number;
    ruleType?: string;
    createsReceivable?: boolean;
    isActive?: boolean;
  },
) {
  const existing = await prisma.deductibilityRule.findFirst({
    where: { id: ruleId, tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Regel', ruleId);
  }

  if (existing.isSystem) {
    throw new ForbiddenError('System-Regeln können nicht bearbeitet werden');
  }

  // If name is changing, check uniqueness
  if (data.name && data.name !== existing.name) {
    const duplicate = await prisma.deductibilityRule.findUnique({
      where: { tenantId_name: { tenantId, name: data.name } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(`Regel mit Name "${data.name}" existiert bereits`);
    }
  }

  const rule = await prisma.deductibilityRule.update({
    where: { id: ruleId },
    data,
  });

  writeAuditLog({
    tenantId,
    entityType: 'DeductibilityRule',
    entityId: ruleId,
    action: 'UPDATE',
    previousData: {
      name: existing.name,
      inputTaxPercent: existing.inputTaxPercent.toString(),
      expensePercent: existing.expensePercent.toString(),
      isActive: existing.isActive,
    },
    newData: data,
  });

  return formatRule(rule);
}

/**
 * Deactivate a rule (soft-delete). System rules cannot be deactivated.
 */
export async function deactivateRule(tenantId: string, ruleId: string) {
  const rule = await prisma.deductibilityRule.findFirst({
    where: { id: ruleId, tenantId },
  });

  if (!rule) {
    throw new NotFoundError('Regel', ruleId);
  }

  if (rule.isSystem) {
    throw new ForbiddenError('System-Regeln können nicht deaktiviert werden');
  }

  if (!rule.isActive) {
    throw new ConflictError('Regel ist bereits deaktiviert');
  }

  const updated = await prisma.deductibilityRule.update({
    where: { id: ruleId },
    data: { isActive: false },
  });

  writeAuditLog({
    tenantId,
    entityType: 'DeductibilityRule',
    entityId: ruleId,
    action: 'DEACTIVATE',
    previousData: { isActive: true },
    newData: { isActive: false },
  });

  return formatRule(updated);
}

function formatRule(rule: {
  id: string; tenantId: string; name: string; description: string | null;
  inputTaxPercent: unknown; expensePercent: unknown; ruleType: string;
  createsReceivable: boolean; isSystem: boolean;
  isActive: boolean; sortOrder: number; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: rule.id,
    tenantId: rule.tenantId,
    name: rule.name,
    description: rule.description,
    inputTaxPercent: String(rule.inputTaxPercent),
    expensePercent: String(rule.expensePercent),
    ruleType: rule.ruleType as 'standard' | 'private_withdrawal' | 'private_deposit',
    createsReceivable: rule.createsReceivable,
    isSystem: rule.isSystem,
    isActive: rule.isActive,
    sortOrder: rule.sortOrder,
    createdAt: rule.createdAt.toISOString(),
  };
}
