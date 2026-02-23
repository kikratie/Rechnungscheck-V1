import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { listCustomers, getCustomerDetail, updateCustomer } from '../services/customer.service.js';

const router = Router();
router.use(authenticate, requireTenant);

// GET /api/v1/customers — List all customers
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = (req.query.search as string) || undefined;
    const activeOnly = req.query.activeOnly !== 'false';

    const result = await listCustomers(tenantId, { page, limit, search, activeOnly });

    res.json({ success: true, data: result.customers, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/customers/:id — Customer detail with invoices
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const customer = await getCustomerDetail(tenantId, req.params.id as string);

    if (!customer) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Kunde nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/customers/:id — Update customer
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const customer = await updateCustomer(tenantId, req.params.id as string, req.body);

    if (!customer) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Kunde nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

export default router;
