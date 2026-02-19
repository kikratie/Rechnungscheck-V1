import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/bank-statements
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { skip, take } = getSkipTake(page, limit);

    const [statements, total] = await Promise.all([
      prisma.bankStatement.findMany({
        where: { tenantId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { transactions: true } },
        },
      }),
      prisma.bankStatement.count({ where: { tenantId } }),
    ]);

    const data = statements.map((s) => ({
      ...s,
      transactionCount: s._count.transactions,
      _count: undefined,
    }));

    res.json({
      success: true,
      data,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-statements/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const statement = await prisma.bankStatement.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        transactions: {
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    if (!statement) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Kontoauszug nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: statement });
  } catch (err) {
    next(err);
  }
});

export { router as bankStatementRoutes };
