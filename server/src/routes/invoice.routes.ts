import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/invoices
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { skip, take } = getSkipTake(page, limit);

    const where: Record<string, unknown> = { tenantId };

    if (req.query.processingStatus) where.processingStatus = req.query.processingStatus;
    if (req.query.validationStatus) where.validationStatus = req.query.validationStatus;
    if (req.query.vendorName) where.vendorName = { contains: req.query.vendorName, mode: 'insensitive' };
    if (req.query.search) {
      where.OR = [
        { vendorName: { contains: req.query.search, mode: 'insensitive' } },
        { invoiceNumber: { contains: req.query.search, mode: 'insensitive' } },
        { originalFileName: { contains: req.query.search, mode: 'insensitive' } },
      ];
    }

    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
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
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      success: true,
      data: invoices,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lineItems: { orderBy: { position: 'asc' } },
      },
    });

    if (!invoice) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rechnung nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

export { router as invoiceRoutes };
