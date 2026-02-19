import type { Request, Response, NextFunction } from 'express';
import type { UserRoleType } from '@buchungsai/shared';
import { ForbiddenError } from '../utils/errors.js';

/**
 * Middleware-Factory: Erlaubt nur bestimmte Rollen.
 * Muss NACH authenticate() verwendet werden.
 *
 * Beispiel: requireRole('ADMIN', 'ACCOUNTANT')
 */
export function requireRole(...allowedRoles: UserRoleType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return next(
        new ForbiddenError(
          `Diese Aktion erfordert eine der folgenden Rollen: ${allowedRoles.join(', ')}`,
        ),
      );
    }
    next();
  };
}
