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

/**
 * Sends an invitation email to a new team member.
 */
export async function sendInvitationEmail(input: {
  tenantId: string;
  userId: string;
  toEmail: string;
  toFirstName: string;
  tenantName: string;
  inviteUrl: string;
}): Promise<{ messageId: string }> {
  const body = `Hallo ${input.toFirstName},

Sie wurden zum Team von „${input.tenantName}" auf Ki2Go Accounting eingeladen.

Bitte klicken Sie auf den folgenden Link, um Ihr Konto zu aktivieren und ein Passwort festzulegen:

${input.inviteUrl}

Dieser Link ist 48 Stunden gültig.

Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.

Mit freundlichen Grüßen
Das Ki2Go Accounting Team`;

  return sendMail({
    tenantId: input.tenantId,
    userId: input.userId,
    to: input.toEmail,
    subject: `Einladung zu ${input.tenantName} — Ki2Go Accounting`,
    body,
    entityType: 'User',
    entityId: input.toEmail,
  });
}

/**
 * Generates a professional correction email text using LLM based on validation results.
 * Used when the user wants to request a corrected invoice from a vendor.
 */
export async function generateCorrectionEmailText(
  invoiceId: string,
  tenantId: string,
): Promise<{ subject: string; body: string; vendorEmail: string | null }> {
  // Load invoice + validation + extracted data
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      vendorName: true,
      invoiceNumber: true,
      invoiceDate: true,
      grossAmount: true,
      issuerEmail: true,
    },
  });
  if (!invoice) throw new Error('Rechnung nicht gefunden');

  const validation = await prisma.validationResult.findFirst({
    where: { invoiceId },
    orderBy: { createdAt: 'desc' },
    select: { checks: true },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  // Extract RED/YELLOW issues
  const issues = (validation?.checks as Array<{ status: string; message: string; legalBasis?: string }> || [])
    .filter((c) => c.status === 'RED' || c.status === 'YELLOW')
    .map((c) => `- ${c.message}${c.legalBasis ? ` (${c.legalBasis})` : ''}`);

  if (issues.length === 0) {
    return {
      subject: `Rechnungskorrektur: ${invoice.invoiceNumber || 'ohne Nr.'}`,
      body: 'Keine Beanstandungen gefunden. Die Rechnung scheint korrekt zu sein.',
      vendorEmail: invoice.issuerEmail,
    };
  }

  // Try LLM generation
  try {
    const { callLlm } = await import('./llm.service.js');

    const response = await callLlm({
      task: 'correction_email',
      systemPrompt: `Du bist ein professioneller Buchhalter in Österreich. Verfasse eine höfliche, sachliche E-Mail an den Lieferanten, in der du um eine korrigierte Rechnung bittest. Die E-Mail soll auf Deutsch sein, professionell und freundlich. Antworte als JSON mit "subject" und "body".`,
      userContent: `Erstelle eine Korrektur-E-Mail für folgende Rechnung:

Lieferant: ${invoice.vendorName || 'Unbekannt'}
Rechnungsnummer: ${invoice.invoiceNumber || 'keine'}
Rechnungsdatum: ${invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('de-AT') : 'unbekannt'}
Bruttobetrag: ${invoice.grossAmount || 'unbekannt'}€
Unser Unternehmen: ${tenant?.name || 'Ki2Go Accounting'}

Festgestellte Mängel:
${issues.join('\n')}

Die E-Mail soll:
- Höflich um eine korrigierte Rechnung bitten
- Die konkreten Mängel auflisten
- Auf die gesetzliche Grundlage verweisen (§11 UStG)
- Um zeitnahe Korrektur bitten`,
      temperature: 0.3,
      maxTokens: 1024,
    });

    const parsed = JSON.parse(response.content);
    return {
      subject: parsed.subject || `Rechnungskorrektur: ${invoice.invoiceNumber || 'ohne Nr.'}`,
      body: parsed.body || issues.join('\n'),
      vendorEmail: invoice.issuerEmail,
    };
  } catch {
    // Fallback: manual template
    const dateStr = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('de-AT') : 'unbekannt';
    return {
      subject: `Bitte um Rechnungskorrektur — ${invoice.invoiceNumber || 'ohne Nr.'} vom ${dateStr}`,
      body: `Sehr geehrte Damen und Herren,

bei der Prüfung Ihrer Rechnung ${invoice.invoiceNumber || ''} vom ${dateStr} über ${invoice.grossAmount || ''}€ haben wir folgende Mängel festgestellt:

${issues.join('\n')}

Wir bitten Sie, uns eine korrigierte Rechnung gemäß §11 UStG zukommen zu lassen.

Mit freundlichen Grüßen
${tenant?.name || ''}`,
      vendorEmail: invoice.issuerEmail,
    };
  }
}
