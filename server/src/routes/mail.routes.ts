import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { isMailConfigured, sendMail } from '../services/mail.service.js';

const router = Router();
router.use(authenticate, requireTenant);

// GET /api/v1/mail/status — check if SMTP is configured
router.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, data: { configured: isMailConfigured() } });
});

// POST /api/v1/mail/send — send an email
router.post('/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { to, subject, body, replyTo, entityType, entityId } = req.body;

    if (!to || !subject || !body) {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'to, subject und body sind Pflichtfelder' },
      });
      return;
    }

    if (!isMailConfigured()) {
      res.status(400).json({
        success: false,
        error: { code: 'SMTP_NOT_CONFIGURED', message: 'SMTP ist nicht konfiguriert. Bitte SMTP-Einstellungen in der .env setzen.' },
      });
      return;
    }

    const result = await sendMail({
      tenantId,
      userId,
      to,
      subject,
      body,
      replyTo,
      entityType,
      entityId,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
