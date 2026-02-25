/**
 * Company Access Service — Multi-Tenant Steuerberater-Zugang
 *
 * Allows TAX_ADVISOR users to access multiple tenants.
 * ADMINs can grant/revoke access to their tenant.
 */

import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';

type AccessLevel = 'READ' | 'WRITE' | 'ADMIN';

/**
 * Grant a user access to a tenant.
 */
export async function grantAccess(
  tenantId: string,
  grantedByUserId: string,
  userEmail: string,
  accessLevel: AccessLevel = 'READ',
) {
  // Find user by email (must be TAX_ADVISOR)
  const user = await prisma.user.findFirst({
    where: { email: userEmail, role: 'TAX_ADVISOR' },
    select: { id: true, email: true, firstName: true, lastName: true, tenantId: true },
  });

  if (!user) {
    throw new NotFoundError('Steuerberater mit dieser E-Mail', userEmail);
  }

  // Don't grant access to own tenant
  if (user.tenantId === tenantId) {
    throw new ConflictError('Benutzer gehört bereits zu diesem Mandanten.');
  }

  // Check if access already exists
  const existing = await prisma.userCompanyAccess.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId } },
  });

  if (existing) {
    // Update access level
    const updated = await prisma.userCompanyAccess.update({
      where: { id: existing.id },
      data: { accessLevel, grantedByUserId },
    });

    writeAuditLog({
      tenantId,
      userId: grantedByUserId,
      entityType: 'UserCompanyAccess',
      entityId: updated.id,
      action: 'ACCESS_UPDATED',
      newData: { userId: user.id, email: user.email, accessLevel },
    });

    return updated;
  }

  const access = await prisma.userCompanyAccess.create({
    data: {
      userId: user.id,
      tenantId,
      accessLevel,
      grantedByUserId,
    },
  });

  writeAuditLog({
    tenantId,
    userId: grantedByUserId,
    entityType: 'UserCompanyAccess',
    entityId: access.id,
    action: 'ACCESS_GRANTED',
    newData: { userId: user.id, email: user.email, accessLevel },
  });

  return access;
}

/**
 * Revoke a user's access to a tenant.
 */
export async function revokeAccess(
  tenantId: string,
  revokedByUserId: string,
  targetUserId: string,
) {
  const access = await prisma.userCompanyAccess.findUnique({
    where: { userId_tenantId: { userId: targetUserId, tenantId } },
  });

  if (!access) {
    throw new NotFoundError('Zugang', targetUserId);
  }

  await prisma.userCompanyAccess.delete({ where: { id: access.id } });

  writeAuditLog({
    tenantId,
    userId: revokedByUserId,
    entityType: 'UserCompanyAccess',
    entityId: access.id,
    action: 'ACCESS_REVOKED',
    newData: { userId: targetUserId },
  });
}

/**
 * Get all tenants a TAX_ADVISOR user has access to.
 */
export async function getAccessibleTenants(userId: string) {
  // Get the user's own tenant
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, role: true },
  });

  if (!user || user.role !== 'TAX_ADVISOR') {
    return [];
  }

  const accesses = await prisma.userCompanyAccess.findMany({
    where: { userId },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return accesses.map((a) => ({
    tenantId: a.tenantId,
    name: a.tenant.name,
    slug: a.tenant.slug,
    accessLevel: a.accessLevel,
  }));
}

/**
 * Get all users with access to a tenant.
 */
export async function getAccessList(tenantId: string) {
  return prisma.userCompanyAccess.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Check if a user has access to a tenant (and at what level).
 */
export async function checkAccess(
  userId: string,
  tenantId: string,
): Promise<AccessLevel | null> {
  const access = await prisma.userCompanyAccess.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { accessLevel: true },
  });

  return access?.accessLevel as AccessLevel | null;
}
