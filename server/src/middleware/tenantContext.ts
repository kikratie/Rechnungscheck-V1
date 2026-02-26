import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { checkAccess } from '../services/companyAccess.service.js';
import { prisma } from '../config/database.js';

/**
 * Stellt sicher, dass tenantId im Request vorhanden ist.
 * TAX_ADVISOR users can switch tenants via X-Tenant-Id header.
 * Super-Admins (isSuperAdmin=true) can switch to ANY tenant via X-Tenant-Id.
 * Muss NACH authenticate() verwendet werden.
 */
export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.tenantId) {
      return next(new ForbiddenError('Kein Tenant-Kontext vorhanden'));
    }

    const requestedTenantId = req.headers['x-tenant-id'] as string | undefined;

    if (requestedTenantId && requestedTenantId !== req.tenantId) {
      // Super-Admin can switch to any tenant
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { isSuperAdmin: true },
      });

      if (user?.isSuperAdmin) {
        req.tenantId = requestedTenantId;
        (req as unknown as Record<string, unknown>).accessLevel = 'ADMIN';
        return next();
      }

      // TAX_ADVISOR can switch tenants via access list
      if (req.userRole === 'TAX_ADVISOR') {
        const accessLevel = await checkAccess(req.userId!, requestedTenantId);
        if (!accessLevel) {
          return next(new ForbiddenError('Kein Zugang zu diesem Mandanten'));
        }
        req.tenantId = requestedTenantId;
        (req as unknown as Record<string, unknown>).accessLevel = accessLevel;
        return next();
      }

      return next(new ForbiddenError('Mandantenwechsel nicht erlaubt'));
    }

    next();
  } catch (err) {
    next(err);
  }
}
