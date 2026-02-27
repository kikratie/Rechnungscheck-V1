import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validateBody } from '../middleware/validate.js';
import { createDeductibilityRuleSchema, updateDeductibilityRuleSchema } from '@buchungsai/shared';
import {
  listRules,
  createRule,
  updateRule,
  deactivateRule,
  seedRulesForTenant,
} from '../services/deductibilityRule.service.js';

const router = Router();
router.use(authenticate, requireTenant);

// GET /api/v1/deductibility-rules — List all rules
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const activeOnly = req.query.activeOnly !== 'false';

    const rules = await listRules(tenantId, { activeOnly });

    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/deductibility-rules — Create new rule (ADMIN only)
router.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createDeductibilityRuleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const rule = await createRule(tenantId, req.body);

      res.status(201).json({ success: true, data: rule });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/deductibility-rules/:id — Update rule (ADMIN only)
router.put(
  '/:id',
  requireRole('ADMIN'),
  validateBody(updateDeductibilityRuleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const rule = await updateRule(tenantId, req.params.id as string, req.body);

      res.json({ success: true, data: rule });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/deductibility-rules/:id — Deactivate rule (ADMIN only)
router.delete(
  '/:id',
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const rule = await deactivateRule(tenantId, req.params.id as string);

      res.json({ success: true, data: rule });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/deductibility-rules/seed — Re-seed default rules (ADMIN only)
router.post('/seed', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const count = await seedRulesForTenant(tenantId);

    res.json({ success: true, data: { message: `${count} Standard-Regeln angelegt`, count } });
  } catch (err) {
    next(err);
  }
});

export default router;
