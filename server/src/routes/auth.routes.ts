import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  loginSchema,
  registerSchema,
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@buchungsai/shared';
import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { changePassword, createPasswordResetToken, resetPassword } from '../services/auth.service.js';
import { isMailConfigured, sendMail } from '../services/mail.service.js';
import { env } from '../config/env.js';

// Strict rate limit for sensitive auth endpoints (5 attempts per 15min per IP)
const authSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Zu viele Versuche. Bitte warten Sie 15 Minuten.' },
  },
});

const router = Router();

router.post('/register', validateBody(registerSchema), authController.register);
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

// POST /api/v1/auth/accept-invite — Accept invitation and set password
router.post('/accept-invite', authSensitiveLimiter, validateBody(acceptInviteSchema), async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const user = await prisma.user.findFirst({
      where: { invitationToken: token },
      include: { tenant: { select: { name: true } } },
    });

    if (!user) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Ungültiger oder bereits verwendeter Einladungslink' },
      });
      return;
    }

    if (user.invitationExpiresAt && user.invitationExpiresAt < new Date()) {
      res.status(400).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Der Einladungslink ist abgelaufen. Bitte fordern Sie eine neue Einladung an.' },
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive: true,
        invitationToken: null,
        invitationExpiresAt: null,
      },
    });

    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.id,
      entityType: 'User',
      entityId: user.id,
      action: 'ACCEPT_INVITE',
    });

    res.json({
      success: true,
      data: {
        message: 'Konto erfolgreich aktiviert. Sie können sich jetzt anmelden.',
        email: user.email,
        tenantName: user.tenant.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/change-password — Change password (authenticated)
router.post('/change-password', authenticate, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    await changePassword(req.userId!, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true, data: { message: 'Passwort erfolgreich geändert' } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/forgot-password — Request password reset email
router.post('/forgot-password', authSensitiveLimiter, validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const token = await createPasswordResetToken(req.body.email);

    // Send email if token was created and SMTP is configured
    if (token && isMailConfigured()) {
      const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;

      // We need tenantId for sendMail — find the user
      const user = await prisma.user.findFirst({
        where: { email: req.body.email, isActive: true },
        select: { id: true, tenantId: true, firstName: true },
      });

      if (user) {
        await sendMail({
          tenantId: user.tenantId,
          userId: user.id,
          to: req.body.email,
          subject: 'Passwort zurücksetzen — Ki2Go Accounting',
          body: `Hallo ${user.firstName},

Sie haben eine Passwortzurücksetzung angefordert.

Klicken Sie auf den folgenden Link, um ein neues Passwort festzulegen:

${resetUrl}

Dieser Link ist 1 Stunde gültig.

Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren. Ihr Passwort bleibt unverändert.

Mit freundlichen Grüßen
Das Ki2Go Accounting Team`,
          entityType: 'User',
          entityId: user.id,
        });
      }
    }

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      data: { message: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.' },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/reset-password — Reset password with token
router.post('/reset-password', authSensitiveLimiter, validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const result = await resetPassword(req.body.token, req.body.password);
    res.json({
      success: true,
      data: { message: 'Passwort erfolgreich zurückgesetzt. Sie können sich jetzt anmelden.', email: result.email },
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
