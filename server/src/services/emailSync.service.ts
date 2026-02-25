import { prisma } from '../config/database.js';
import { decrypt } from './encryption.service.js';
import { uploadInvoice } from './invoice.service.js';
import { removeRepeatableJob } from './emailConnector.service.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { MAX_CONSECUTIVE_FAILURES, ALLOWED_EMAIL_ATTACHMENT_MIMES } from '@buchungsai/shared';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { Readable } from 'stream';

interface SyncResult {
  processedEmails: number;
  createdInvoices: number;
  skippedDuplicates: number;
  errors: string[];
}

/**
 * Sync a single EmailConnector: connect to IMAP, fetch new messages, extract attachments.
 */
export async function syncEmailConnector(connectorId: string): Promise<SyncResult> {
  const result: SyncResult = { processedEmails: 0, createdInvoices: 0, skippedDuplicates: 0, errors: [] };

  // 1. Connector laden
  const connector = await prisma.emailConnector.findUnique({ where: { id: connectorId } });
  if (!connector) {
    console.error(`[EmailSync] Connector ${connectorId} nicht gefunden`);
    return result;
  }
  if (!connector.isActive) {
    console.log(`[EmailSync] Connector "${connector.label}" ist deaktiviert — überspringe`);
    return result;
  }

  // Status: RUNNING
  await prisma.emailConnector.update({
    where: { id: connectorId },
    data: { lastSyncStatus: 'RUNNING' },
  });

  let client: ImapFlow | null = null;

  try {
    // 2. Passwort entschlüsseln
    const password = decrypt(connector.passwordEncrypted);

    // 3. IMAP verbinden
    client = new ImapFlow({
      host: connector.host,
      port: connector.port,
      secure: connector.secure,
      auth: { user: connector.username, pass: password },
      logger: false as unknown as import('imapflow').Logger,
    });

    await client.connect();

    // 4. Folder öffnen
    const mailbox = await client.mailboxOpen(connector.folder);
    if (!mailbox) {
      throw new Error(`Ordner "${connector.folder}" konnte nicht geöffnet werden`);
    }

    // 5. Nachrichten suchen (UID > lastSyncedUid oder UNSEEN bei erstem Sync)
    let searchCriteria: string | { uid: string };
    if (connector.lastSyncedUid && connector.lastSyncedUid > 0) {
      searchCriteria = { uid: `${connector.lastSyncedUid + 1}:*` };
    } else {
      searchCriteria = 'UNSEEN';
    }

    let highestUid = connector.lastSyncedUid ?? 0;

    for await (const message of client.fetch(searchCriteria, {
      uid: true,
      envelope: true,
      source: true,
    })) {
      try {
        result.processedEmails++;

        // 6. Parse mit mailparser
        if (!message.source) {
          continue;
        }
        const parsed: ParsedMail = await simpleParser(message.source);
        const fromAddress = parsed.from?.value?.[0]?.address ?? 'unknown';
        const subject = parsed.subject ?? '(kein Betreff)';
        const messageId = parsed.messageId ?? `no-msgid-${message.uid}`;

        // 7. Attachments verarbeiten
        if (parsed.attachments && parsed.attachments.length > 0) {
          for (const attachment of parsed.attachments) {
            // Nur erlaubte MIME-Types
            const allowedMimes: readonly string[] = ALLOWED_EMAIL_ATTACHMENT_MIMES;
            if (!allowedMimes.includes(attachment.contentType)) {
              continue;
            }

            // Nur echte Attachments (nicht inline images)
            if (attachment.contentDisposition === 'inline' && !attachment.filename) {
              continue;
            }

            const originalFileName = attachment.filename || `email-attachment-${Date.now()}.pdf`;

            // 8. Dedup-Check: gleiche Email + gleicher Dateiname?
            const existing = await prisma.invoice.findFirst({
              where: {
                tenantId: connector.tenantId,
                emailMessageId: messageId,
                originalFileName,
              },
              select: { id: true },
            });

            if (existing) {
              result.skippedDuplicates++;
              continue;
            }

            // 9. uploadInvoice() aufrufen
            const multerFile = {
              buffer: attachment.content,
              mimetype: attachment.contentType,
              originalname: originalFileName,
              size: attachment.size,
              fieldname: 'file',
              destination: '',
              path: '',
              encoding: '7bit',
              filename: originalFileName,
              stream: Readable.from(attachment.content),
            } as Express.Multer.File;

            const invoice = await uploadInvoice({
              tenantId: connector.tenantId,
              userId: connector.createdByUserId,
              file: multerFile,
              direction: 'INCOMING',
              ingestionChannel: 'EMAIL',
            });

            // 10. Email-Metadaten setzen
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                emailSender: fromAddress,
                emailSubject: subject.substring(0, 500),
                emailMessageId: messageId,
              },
            });

            result.createdInvoices++;
          }
        }

        // Höchste UID tracken
        if (message.uid > highestUid) {
          highestUid = message.uid;
        }
      } catch (emailErr) {
        const errMsg = `Fehler bei E-Mail UID ${message.uid}: ${(emailErr as Error).message}`;
        console.error(`[EmailSync]`, errMsg);
        result.errors.push(errMsg);
        // Weiter mit nächster E-Mail
        if (message.uid > highestUid) {
          highestUid = message.uid;
        }
      }
    }

    // 11. Erfolg
    await prisma.emailConnector.update({
      where: { id: connectorId },
      data: {
        lastSyncedUid: highestUid > 0 ? highestUid : connector.lastSyncedUid,
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        lastSyncError: null,
        consecutiveFailures: 0,
      },
    });

    if (result.createdInvoices > 0) {
      writeAuditLog({
        tenantId: connector.tenantId,
        userId: connector.createdByUserId,
        entityType: 'EmailConnector',
        entityId: connectorId,
        action: 'EMAIL_SYNC_COMPLETED',
        newData: {
          processedEmails: result.processedEmails,
          createdInvoices: result.createdInvoices,
          skippedDuplicates: result.skippedDuplicates,
        },
      });
    }

    console.log(
      `[EmailSync] "${connector.label}": ${result.processedEmails} Mails, ${result.createdInvoices} Rechnungen, ${result.skippedDuplicates} Duplikate`,
    );

  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error(`[EmailSync] "${connector.label}" fehlgeschlagen:`, errorMessage);

    const newFailures = connector.consecutiveFailures + 1;

    await prisma.emailConnector.update({
      where: { id: connectorId },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ERROR',
        lastSyncError: errorMessage.substring(0, 1000),
        consecutiveFailures: newFailures,
        // Auto-Deaktivierung nach MAX_CONSECUTIVE_FAILURES
        ...(newFailures >= MAX_CONSECUTIVE_FAILURES ? { isActive: false } : {}),
      },
    });

    // Job entfernen wenn deaktiviert
    if (newFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(`[EmailSync] "${connector.label}" nach ${newFailures} Fehlern deaktiviert`);
      await removeRepeatableJob(connectorId);

      writeAuditLog({
        tenantId: connector.tenantId,
        userId: connector.createdByUserId,
        entityType: 'EmailConnector',
        entityId: connectorId,
        action: 'EMAIL_CONNECTOR_AUTO_DEACTIVATED',
        newData: { consecutiveFailures: newFailures, lastError: errorMessage },
      });
    }

    result.errors.push(errorMessage);
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch {
        // Ignorieren — Verbindung könnte bereits geschlossen sein
      }
    }
  }

  return result;
}
