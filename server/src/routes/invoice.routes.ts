import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';

const router = Router();

router.use(authenticate, requireTenant);

// Placeholder - wird in Phase 2-3 implementiert
router.get('/', async (_req, res) => {
  res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
});

export { router as invoiceRoutes };
