/**
 * Super-Admin routes — system-wide administration endpoints.
 * All routes require isSuperAdmin=true on the authenticated user.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError, ConflictError } from '../utils/errors.js';
import { adminCreateTenantSchema, adminUpdateTenantSchema } from '@buchungsai/shared';
import { getMetrics } from '../middleware/metrics.js';
import { env as appEnv } from '../config/env.js';
import type { ApiResponse } from '@buchungsai/shared';

const router = Router();

/**
 * Middleware: require super-admin status.
 */
async function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      return next(new ForbiddenError('Nicht authentifiziert'));
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isSuperAdmin: true },
    });

    if (!user?.isSuperAdmin) {
      return next(new ForbiddenError('Super-Admin-Berechtigung erforderlich'));
    }

    next();
  } catch (err) {
    next(err);
  }
}

router.use(authenticate, requireSuperAdmin);

// GET /api/v1/admin/tenants — List all tenants (for tenant switching)
router.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        onboardingComplete: true,
        accountingType: true,
        createdAt: true,
        _count: { select: { users: true, invoices: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: tenants } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/stats — System-wide statistics
router.get('/stats', async (_req, res, next) => {
  try {
    const [tenantCount, userCount, invoiceCount] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.invoice.count(),
    ]);

    res.json({
      success: true,
      data: { tenantCount, userCount, invoiceCount },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/switch-tenant — Switch to a specific tenant (returns new tokens)
router.post('/switch-tenant', async (req, res, next) => {
  try {
    const { tenantId } = req.body;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Mandant nicht gefunden' },
      });
      return;
    }

    // Return tenant info — client uses X-Tenant-Id header for subsequent requests
    res.json({
      success: true,
      data: { tenantId: tenant.id, tenantName: tenant.name },
    } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/tenants/:id — Tenant detail with users and stats
router.get('/tenants/:id', async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
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
          orderBy: { createdAt: 'asc' },
        },
        bankAccounts: {
          where: { isActive: true },
          select: { id: true, label: true, accountType: true, iban: true, isPrimary: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        _count: { select: { invoices: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant', id);
    }

    res.json({ success: true, data: tenant } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/tenants — Create new tenant with admin user
router.post('/tenants', validateBody(adminCreateTenantSchema), async (req, res, next) => {
  try {
    const { tenantName, tenantSlug, adminEmail, adminFirstName, adminLastName, adminPassword, accountingType } = req.body;

    // Generate slug from name if not provided
    const slug = tenantSlug || tenantName
      .toLowerCase()
      .replace(/[äöüß]/g, (c: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] || c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check slug uniqueness
    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      throw new ConflictError('Ein Mandant mit diesem Slug existiert bereits');
    }

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const tenant = await prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          accountingType: accountingType || 'EA',
          onboardingComplete: false,
        },
      });

      await tx.user.create({
        data: {
          tenantId: newTenant.id,
          email: adminEmail,
          passwordHash,
          firstName: adminFirstName,
          lastName: adminLastName,
          role: 'ADMIN',
        },
      });

      return tx.tenant.findUnique({
        where: { id: newTenant.id },
        include: {
          users: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
          },
          _count: { select: { invoices: true } },
        },
      });
    });

    res.status(201).json({ success: true, data: tenant } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/tenants/:id — Update tenant (name, active status)
router.put('/tenants/:id', validateBody(adminUpdateTenantSchema), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Tenant', id);
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: req.body,
      include: {
        _count: { select: { users: true, invoices: true } },
      },
    });

    res.json({ success: true, data: tenant } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/metrics — Server performance metrics
router.get('/metrics', (_req, res) => {
  res.json({ success: true, data: getMetrics() } satisfies ApiResponse);
});

// GET /api/v1/admin/llm-config — Current LLM configuration
router.get('/llm-config', (_req, res) => {
  res.json({
    success: true,
    data: {
      provider: 'openai',
      model: appEnv.OPENAI_MODEL || 'gpt-4o',
      apiKeyConfigured: !!appEnv.OPENAI_API_KEY,
      apiKeyPreview: appEnv.OPENAI_API_KEY
        ? `sk-...${appEnv.OPENAI_API_KEY.slice(-4)}`
        : null,
    },
  } satisfies ApiResponse);
});

export default router;
