import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { checkAccess } from '../services/companyAccess.service.js';

/**
 * Stellt sicher, dass tenantId im Request vorhanden ist.
 * TAX_ADVISOR users can switch tenants via X-Tenant-Id header.
 * Muss NACH authenticate() verwendet werden.
 */
export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.tenantId) {
      return next(new ForbiddenError('Kein Tenant-Kontext vorhanden'));
    }

    // TAX_ADVISOR can switch tenants via X-Tenant-Id header
    const requestedTenantId = req.headers['x-tenant-id'] as string | undefined;

    if (requestedTenantId && requestedTenantId !== req.tenantId && req.userRole === 'TAX_ADVISOR') {
      // Verify user has access to this tenant
      const accessLevel = await checkAccess(req.userId!, requestedTenantId);
      if (!accessLevel) {
        return next(new ForbiddenError('Kein Zugang zu diesem Mandanten'));
      }

      // Override tenant context
      req.tenantId = requestedTenantId;
      // Store access level for downstream use
      (req as unknown as Record<string, unknown>).accessLevel = accessLevel;
    } else if (requestedTenantId && requestedTenantId !== req.tenantId) {
      return next(new ForbiddenError('Mandantenwechsel nur für Steuerberater erlaubt'));
    }

    next();
  } catch (err) {
    next(err);
  }
}
