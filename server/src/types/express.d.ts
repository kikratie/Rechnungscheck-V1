import type { UserRoleType } from '@buchungsai/shared';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tenantId?: string;
      userRole?: UserRoleType;
    }
  }
}

export {};
