import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validateBody } from '../middleware/validate.js';
import { markShareholderTransactionPaidSchema } from '@buchungsai/shared';
import {
  listTransactions,
  getOpenBalance,
  markAsPaid,
} from '../services/shareholderTransaction.service.js';

const router = Router();
router.use(authenticate, requireTenant);

// GET /api/v1/shareholder-transactions — List all shareholder transactions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const status = req.query.status as 'OPEN' | 'PAID' | undefined;
    const transactionType = req.query.transactionType as 'RECEIVABLE' | 'PAYABLE' | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = await listTransactions(tenantId, { status, transactionType, page, limit });

    res.json({
      success: true,
      data: result.items,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/shareholder-transactions/balance — Get open balance summary
router.get('/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const balance = await getOpenBalance(tenantId);

    res.json({ success: true, data: balance });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/shareholder-transactions/:id/pay — Mark as paid
router.patch(
  '/:id/pay',
  requireRole('ADMIN'),
  validateBody(markShareholderTransactionPaidSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : undefined;

      const tx = await markAsPaid(tenantId, req.params.id as string, userId, paidAt);

      res.json({ success: true, data: tx });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
