import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validateBody } from '../middleware/validate.js';
import { createAccountSchema, updateAccountSchema } from '@buchungsai/shared';
import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deactivateAccount,
  seedAccountsForTenant,
} from '../services/account.service.js';

const router = Router();
router.use(authenticate, requireTenant);

// GET /api/v1/accounts — List all accounts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const activeOnly = req.query.activeOnly !== 'false';
    const search = (req.query.search as string) || undefined;
    const type = (req.query.type as string) || undefined;

    const accounts = await listAccounts(tenantId, { activeOnly, search, type });

    res.json({ success: true, data: accounts });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/accounts/:id — Get single account
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const account = await getAccount(tenantId, req.params.id as string);

    if (!account) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Konto nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/accounts — Create new account
router.post('/', validateBody(createAccountSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const account = await createAccount(tenantId, req.body);

    res.status(201).json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/accounts/:id — Update account
router.put('/:id', validateBody(updateAccountSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const account = await updateAccount(tenantId, req.params.id as string, req.body);

    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/accounts/:id — Deactivate account (soft-delete)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const account = await deactivateAccount(tenantId, req.params.id as string);

    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/accounts/seed — Re-seed default accounts (admin only)
router.post('/seed', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const count = await seedAccountsForTenant(tenantId);

    res.json({ success: true, data: { message: `${count} Standard-Konten angelegt`, count } });
  } catch (err) {
    next(err);
  }
});

export default router;
