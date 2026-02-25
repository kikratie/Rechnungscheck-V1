import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';
import { getDashboardStats, isValidPeriod } from '../services/dashboard.service.js';
import type { DashboardPeriod } from '@buchungsai/shared';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/dashboard/stats?period=currentMonth
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const periodParam = req.query.period as string | undefined;

    let period: DashboardPeriod | undefined;
    if (periodParam) {
      if (!isValidPeriod(periodParam)) {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'period muss einer von last30, last60, last90, currentMonth, currentYear sein',
          },
        });
        return;
      }
      period = periodParam;
    }

    const data = await getDashboardStats({ tenantId, period });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/dashboard/number-gaps — Stornierte Nummern + Lücken-Prüfung
router.get('/number-gaps', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const cancelledNumbers = await prisma.cancelledNumber.findMany({
      where: { tenantId },
      orderBy: { cancelledAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: {
        cancelledNumbers,
        count: cancelledNumbers.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRoutes };
