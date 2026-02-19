import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/dashboard/stats
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const [
      totalInvoices,
      validCount,
      warningCount,
      invalidCount,
      pendingCount,
    ] = await Promise.all([
      prisma.invoice.count({ where: { tenantId } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'VALID' } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'WARNING' } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'INVALID' } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'PENDING' } }),
    ]);

    res.json({
      success: true,
      data: {
        totalInvoices,
        validationSummary: {
          valid: validCount,
          warning: warningCount,
          invalid: invalidCount,
          pending: pendingCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRoutes };
