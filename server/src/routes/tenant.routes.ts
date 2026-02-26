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
  grantAccessSchema,
  deleteAccountSchema,
  inviteUserSchema,
  updateFeatureVisibilitySchema,
  DEFAULT_FEATURE_VISIBILITY,
} from '@buchungsai/shared';
import type { ApiResponse, TenantProfile } from '@buchungsai/shared';
import crypto from 'node:crypto';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { grantAccess, revokeAccess, getAccessibleTenants, getAccessList } from '../services/companyAccess.service.js';
import { deleteAccount, exportUserData } from '../services/gdpr.service.js';
import { isMailConfigured, sendInvitationEmail } from '../services/mail.service.js';
import { env } from '../config/env.js';

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

// POST /api/v1/tenant/invite — Invite a new user via email (Admin only)
router.post('/invite', requireRole('ADMIN'), validateBody(inviteUserSchema), async (req, res, next) => {
  try {
    const { email, firstName, lastName, role } = req.body;
    const tenantId = req.tenantId!;

    // Check if user already exists in this tenant
    const existing = await prisma.user.findFirst({
      where: { tenantId, email },
    });
    if (existing) {
      throw new ConflictError('Ein Benutzer mit dieser E-Mail existiert bereits in diesem Mandanten');
    }

    // Generate invitation token (48h validity)
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // Create user with isActive=false and no password
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash: '', // Will be set on accept
        firstName,
        lastName,
        role,
        isActive: false,
        invitationToken,
        invitationExpiresAt,
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

    // Send invitation email if SMTP is configured
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    if (isMailConfigured()) {
      const inviteUrl = `${env.FRONTEND_URL}/accept-invite?token=${invitationToken}`;
      await sendInvitationEmail({
        tenantId,
        userId: req.userId!,
        toEmail: email,
        toFirstName: firstName,
        tenantName: tenant?.name || 'Ki2Go Accounting',
        inviteUrl,
      });
    }

    await writeAuditLog({
      tenantId,
      userId: req.userId!,
      entityType: 'User',
      entityId: user.id,
      action: 'INVITE',
      newData: { email, firstName, lastName, role },
    });

    res.status(201).json({ success: true, data: { ...user, invitationSent: isMailConfigured() } } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// STEUERBERATER-ZUGANG (Multi-Tenant Access)
// ============================================================

// GET /api/v1/tenant/accessible-tenants — For TAX_ADVISOR: list all accessible tenants
router.get('/accessible-tenants', async (req, res, next) => {
  try {
    const tenants = await getAccessibleTenants(req.userId!);
    res.json({ success: true, data: tenants } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tenant/grant-access — Admin grants access to a TAX_ADVISOR
router.post('/grant-access', requireRole('ADMIN'), validateBody(grantAccessSchema), async (req, res, next) => {
  try {
    const access = await grantAccess(
      req.tenantId!,
      req.userId!,
      req.body.email as string,
      req.body.accessLevel || 'READ',
    );
    res.status(201).json({ success: true, data: access } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/tenant/revoke-access/:userId — Admin revokes access
router.delete('/revoke-access/:userId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await revokeAccess(req.tenantId!, req.userId!, req.params.userId as string);
    res.json({ success: true, data: { message: 'Zugang entzogen' } } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tenant/access-list — List all users with access to this tenant
router.get('/access-list', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const list = await getAccessList(req.tenantId!);
    res.json({ success: true, data: list } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// FEATURE VISIBILITY (Plattform-Module pro Mandant)
// ============================================================

// PUT /api/v1/tenant/feature-visibility — Admin toggles feature modules
router.put('/feature-visibility', requireRole('ADMIN'), validateBody(updateFeatureVisibilitySchema), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { featureVisibility } = req.body;

    // Read current settings and merge
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
    const currentFv = (currentSettings.featureVisibility as Record<string, boolean>) || {};

    const mergedFv = { ...DEFAULT_FEATURE_VISIBILITY, ...currentFv, ...featureVisibility };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: { ...currentSettings, featureVisibility: mergedFv },
      },
    });

    await writeAuditLog({
      tenantId,
      userId: req.userId!,
      entityType: 'Tenant',
      entityId: tenantId,
      action: 'UPDATE_FEATURE_VISIBILITY',
      previousData: { featureVisibility: currentFv },
      newData: { featureVisibility: mergedFv },
    });

    res.json({ success: true, data: { featureVisibility: mergedFv } } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DSGVO + TERMS
// ============================================================

// POST /api/v1/tenant/accept-terms — User acknowledges retention obligations
router.post('/accept-terms', async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.userId! },
      data: { termsAcceptedAt: new Date() },
    });
    res.json({ success: true, data: { message: 'Aufbewahrungspflichten akzeptiert' } } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/tenant/account — Delete entire account (ADMIN only, requires password)
router.delete('/account', requireRole('ADMIN'), validateBody(deleteAccountSchema), async (req, res, next) => {
  try {
    await deleteAccount(req.userId!, req.tenantId!, req.body.password as string);
    res.json({ success: true, data: { message: 'Konto und alle Daten gelöscht' } } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tenant/data-export — GDPR Art. 20 data export
router.get('/data-export', async (req, res, next) => {
  try {
    const data = await exportUserData(req.userId!, req.tenantId!);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="datenexport.json"');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export { router as tenantRoutes };
