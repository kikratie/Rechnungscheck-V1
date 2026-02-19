import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requireRole } from '../middleware/roleGuard.js';
import { prisma } from '../config/database.js';
import type { ApiResponse, UserProfile } from '@buchungsai/shared';

const router = Router();

// Alle Tenant-Routes erfordern Authentifizierung
router.use(authenticate, requireTenant);

// GET /api/v1/tenant - Eigenen Tenant abrufen
router.get('/', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
    });
    res.json({ success: true, data: tenant } satisfies ApiResponse);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/tenant - Tenant aktualisieren (nur Admin)
router.put('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId! },
      data: req.body,
    });
    res.json({ success: true, data: tenant } satisfies ApiResponse);
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
