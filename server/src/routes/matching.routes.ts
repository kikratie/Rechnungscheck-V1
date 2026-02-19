import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/matchings
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { skip, take } = getSkipTake(page, limit);

    const where: Record<string, unknown> = { tenantId };

    if (req.query.status) where.status = req.query.status;
    if (req.query.matchType) where.matchType = req.query.matchType;

    const [matchings, total] = await Promise.all([
      prisma.matching.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              originalFileName: true,
              vendorName: true,
              invoiceNumber: true,
              invoiceDate: true,
              grossAmount: true,
              currency: true,
              processingStatus: true,
              validationStatus: true,
              isLocked: true,
              createdAt: true,
            },
          },
          transaction: {
            select: {
              id: true,
              transactionDate: true,
              amount: true,
              currency: true,
              counterpartName: true,
              reference: true,
              bookingText: true,
              isMatched: true,
            },
          },
        },
      }),
      prisma.matching.count({ where }),
    ]);

    res.json({
      success: true,
      data: matchings,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

export { router as matchingRoutes };
