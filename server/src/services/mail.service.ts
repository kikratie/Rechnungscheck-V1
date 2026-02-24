import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';

let transporter: Transporter | null = null;

/**
 * Check if SMTP is configured (host + user are the minimum requirements).
 */
export function isMailConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER);
}

/**
 * Get or create the nodemailer transporter (lazy singleton).
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (!isMailConfigured()) {
    throw new Error('SMTP ist nicht konfiguriert. Bitte SMTP_HOST und SMTP_USER in der .env setzen.');
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER!,
      pass: env.SMTP_PASS || '',
    },
  });

  return transporter;
}

interface SendMailInput {
  tenantId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Send an email via SMTP and log it to the audit trail.
 */
export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const { tenantId, userId, to, subject, body, replyTo, entityType, entityId } = input;

  // Load tenant for from-name and reply-to
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, email: true },
  });

  const fromName = env.SMTP_FROM_NAME || tenant?.name || 'Ki2Go Accounting';
  const fromEmail = env.SMTP_FROM_EMAIL || env.SMTP_USER!;
  const effectiveReplyTo = replyTo || tenant?.email || fromEmail;

  const transport = getTransporter();

  const info = await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    replyTo: effectiveReplyTo,
    subject,
    text: body,
  });

  // Audit log (fire-and-forget)
  writeAuditLog({
    tenantId,
    userId,
    entityType: entityType || 'Mail',
    entityId: entityId || 'direct',
    action: 'EMAIL_SENT',
    newData: {
      to,
      subject,
      messageId: info.messageId,
    },
  });

  return { messageId: info.messageId };
}
