import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';

/**
 * Stellt sicher, dass tenantId im Request vorhanden ist.
 * Muss NACH authenticate() verwendet werden.
 */
export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.tenantId) {
    return next(new ForbiddenError('Kein Tenant-Kontext vorhanden'));
  }
  next();
}
