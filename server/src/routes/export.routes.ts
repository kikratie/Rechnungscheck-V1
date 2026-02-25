import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { validateBody } from '../middleware/validate.js';
import { exportGenerateSchema, monthlyReportSchema, fullExportSchema } from '@buchungsai/shared';
import { generateBmdCsv, generateFullExport } from '../services/export.service.js';
import { generateMonthlyReport } from '../services/report.service.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/exports/configs — Placeholder for export configs
router.get('/configs', async (_req, res) => {
  res.json({ success: true, data: [] });
});

// POST /api/v1/exports/bmd-csv — Generate BMD CSV export
router.post('/bmd-csv', validateBody(exportGenerateSchema), async (req, res, next) => {
  try {
    const buffer = await generateBmdCsv({
      tenantId: req.tenantId!,
      userId: req.userId!,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bmd-export.csv"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/exports/monthly-report — Generate monthly report PDF
router.post('/monthly-report', validateBody(monthlyReportSchema), async (req, res, next) => {
  try {
    const buffer = await generateMonthlyReport({
      tenantId: req.tenantId!,
      userId: req.userId!,
      year: req.body.year,
      month: req.body.month,
    });

    const monthStr = `${req.body.year}-${String(req.body.month).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="monatsreport-${monthStr}.pdf"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/exports/full-export — Generate full ZIP export
router.post('/full-export', validateBody(fullExportSchema), async (req, res, next) => {
  try {
    const buffer = await generateFullExport(
      req.tenantId!,
      req.userId!,
      req.body.year,
    );

    const yearStr = req.body.year ? `-${req.body.year}` : '';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="vollexport${yearStr}.zip"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export { router as exportRoutes };
