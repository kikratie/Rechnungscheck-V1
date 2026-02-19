import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { listVendors, getVendorDetail, updateVendor } from '../services/vendor.service.js';

const router = Router();
router.use(authenticate, requireTenant);

// GET /api/v1/vendors — List all vendors
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = (req.query.search as string) || undefined;
    const activeOnly = req.query.activeOnly !== 'false';

    const result = await listVendors(tenantId, { page, limit, search, activeOnly });

    res.json({ success: true, data: result.vendors, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/vendors/:id — Vendor detail with invoices
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const vendor = await getVendorDetail(tenantId, req.params.id as string);

    if (!vendor) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lieferant nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/vendors/:id — Update vendor
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const vendor = await updateVendor(tenantId, req.params.id as string, req.body);

    if (!vendor) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lieferant nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
});

export default router;
