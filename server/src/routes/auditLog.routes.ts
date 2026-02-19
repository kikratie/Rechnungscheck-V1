import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/audit-logs
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { skip, take } = getSkipTake(page, limit);

    const where: Record<string, unknown> = { tenantId: req.tenantId! };

    if (req.query.entityType) where.entityType = req.query.entityType;
    if (req.query.entityId) where.entityId = req.query.entityId;
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.action) where.action = req.query.action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

export { router as auditLogRoutes };
