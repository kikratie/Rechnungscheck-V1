import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import {
  updateTenantSchema,
  completeOnboardingSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
} from '@buchungsai/shared';
import type { ApiResponse, TenantProfile } from '@buchungsai/shared';
import { NotFoundError } from '../utils/errors.js';

const router = Router();

// Alle Tenant-Routes erfordern Authentifizierung
router.use(authenticate, requireTenant);

// GET /api/v1/tenant - Eigenen Tenant abrufen (inkl. bankAccounts)
router.get('/', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      include: {
        bankAccounts: {
          where: { isActive: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    res.json({ success: true, data: tenant } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/tenant - Tenant aktualisieren (nur Admin)
router.put('/', requireRole('ADMIN'), validateBody(updateTenantSchema), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId! },
      data: req.body,
      include: {
        bankAccounts: {
          where: { isActive: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    res.json({ success: true, data: tenant } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/complete-onboarding - Onboarding abschließen
router.post('/complete-onboarding', requireRole('ADMIN'), validateBody(completeOnboardingSchema), async (req, res, next) => {
  try {
    const { bankAccount, ...tenantData } = req.body;

    const tenant = await prisma.$transaction(async (tx) => {
      // Update tenant data
      const updated = await tx.tenant.update({
        where: { id: req.tenantId! },
        data: {
          ...tenantData,
          onboardingComplete: true,
        },
      });

      // Create first bank account if provided
      if (bankAccount && (bankAccount.iban || bankAccount.bankName)) {
        await tx.bankAccount.create({
          data: {
            tenantId: req.tenantId!,
            label: bankAccount.label || 'Geschäftskonto',
            accountType: bankAccount.accountType || 'CHECKING',
            iban: bankAccount.iban || null,
            bic: bankAccount.bic || null,
            bankName: bankAccount.bankName || null,
            isPrimary: true,
          },
        });
      }

      return tx.tenant.findUnique({
        where: { id: req.tenantId! },
        include: {
          bankAccounts: {
            where: { isActive: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    await writeAuditLog({
      tenantId: req.tenantId!,
      userId: req.userId!,
      entityType: 'Tenant',
      entityId: req.tenantId!,
      action: 'ONBOARDING_COMPLETE',
      newData: req.body,
    });

    res.json({ success: true, data: tenant } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// BANK ACCOUNTS CRUD
// ============================================================

// GET /api/v1/tenant/bank-accounts - Alle Konten des Tenants
router.get('/bank-accounts', async (req, res, next) => {
  try {
    const accounts = await prisma.bankAccount.findMany({
      where: { tenantId: req.tenantId!, isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, data: accounts } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/bank-accounts - Konto anlegen (ADMIN)
router.post('/bank-accounts', requireRole('ADMIN'), validateBody(createBankAccountSchema), async (req, res, next) => {
  try {
    const { isPrimary, ...data } = req.body;

    const account = await prisma.$transaction(async (tx) => {
      // If this should be primary, unset existing primary
      if (isPrimary) {
        await tx.bankAccount.updateMany({
          where: { tenantId: req.tenantId!, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.bankAccount.create({
        data: {
          ...data,
          isPrimary: isPrimary ?? false,
          tenantId: req.tenantId!,
        },
      });
    });

    await writeAuditLog({
      tenantId: req.tenantId!,
      userId: req.userId!,
      entityType: 'BankAccount',
      entityId: account.id,
      action: 'CREATE',
      newData: req.body,
    });

    res.status(201).json({ success: true, data: account } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/tenant/bank-accounts/:id - Konto aktualisieren (ADMIN)
router.put('/bank-accounts/:id', requireRole('ADMIN'), validateBody(updateBankAccountSchema), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const { isPrimary, ...data } = req.body;

    // Verify ownership
    const existing = await prisma.bankAccount.findFirst({
      where: { id, tenantId: req.tenantId!, isActive: true },
    });
    if (!existing) throw new NotFoundError('BankAccount', id);

    const account = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.bankAccount.updateMany({
          where: { tenantId: req.tenantId!, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.bankAccount.update({
        where: { id },
        data: {
          ...data,
          ...(isPrimary !== undefined ? { isPrimary } : {}),
        },
      });
    });

    await writeAuditLog({
      tenantId: req.tenantId!,
      userId: req.userId!,
      entityType: 'BankAccount',
      entityId: id,
      action: 'UPDATE',
      previousData: existing,
      newData: req.body,
    });

    res.json({ success: true, data: account } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/tenant/bank-accounts/:id - Konto deaktivieren (ADMIN)
router.delete('/bank-accounts/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.bankAccount.findFirst({
      where: { id, tenantId: req.tenantId!, isActive: true },
    });
    if (!existing) throw new NotFoundError('BankAccount', id);

    await prisma.bankAccount.update({
      where: { id },
      data: { isActive: false, isPrimary: false },
    });

    await writeAuditLog({
      tenantId: req.tenantId!,
      userId: req.userId!,
      entityType: 'BankAccount',
      entityId: id,
      action: 'DELETE',
      previousData: existing,
    });

    res.json({ success: true, data: { message: 'Bankkonto deaktiviert' } } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tenant/users - Alle User des Tenants
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId! },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    res.json({ success: true, data: users } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/users - Neuen User anlegen (nur Admin)
router.post('/users', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(req.body.password, 12);

    const user = await prisma.user.create({
      data: {
        tenantId: req.tenantId!,
        email: req.body.email,
        passwordHash,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        role: req.body.role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    res.status(201).json({ success: true, data: user } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

export { router as tenantRoutes };
