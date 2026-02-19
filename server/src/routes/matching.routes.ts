import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';

const router = Router();

router.use(authenticate, requireTenant);

// Placeholder - wird in Phase 5 implementiert
router.get('/', async (_req, res) => {
  res.json({ success: true, data: [] });
});

export { router as matchingRoutes };
