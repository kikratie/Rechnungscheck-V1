import { prisma } from '../config/database.js';
import { emailSyncQueue } from '../jobs/emailSyncQueue.js';
import { encrypt, decrypt, isEncryptionConfigured } from './encryption.service.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import type { EmailConnectorItem, CreateEmailConnectorRequest, UpdateEmailConnectorRequest, TestEmailConnectorRequest } from '@buchungsai/shared';
import { ImapFlow } from 'imapflow';

function toConnectorItem(row: Record<string, unknown>): EmailConnectorItem {
  return {
    id: row.id as string,
    tenantId: row.tenantId as string,
    label: row.label as string,
    host: row.host as string,
    port: row.port as number,
    secure: row.secure as boolean,
    username: row.username as string,
    folder: row.folder as string,
    lastSyncAt: row.lastSyncAt ? (row.lastSyncAt as Date).toISOString() : null,
    lastSyncStatus: row.lastSyncStatus as string | null,
    lastSyncError: row.lastSyncError as string | null,
    consecutiveFailures: row.consecutiveFailures as number,
    pollIntervalMinutes: row.pollIntervalMinutes as number,
    isActive: row.isActive as boolean,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

export async function listConnectors(tenantId: string): Promise<EmailConnectorItem[]> {
  const connectors = await prisma.emailConnector.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, tenantId: true, label: true, host: true, port: true,
      secure: true, username: true, folder: true, lastSyncAt: true,
      lastSyncStatus: true, lastSyncError: true, consecutiveFailures: true,
      pollIntervalMinutes: true, isActive: true, createdAt: true,
    },
  });
  return connectors.map((c) => toConnectorItem(c as unknown as Record<string, unknown>));
}

export async function getConnector(tenantId: string, connectorId: string): Promise<EmailConnectorItem> {
  const connector = await prisma.emailConnector.findFirst({
    where: { id: connectorId, tenantId },
    select: {
      id: true, tenantId: true, label: true, host: true, port: true,
      secure: true, username: true, folder: true, lastSyncAt: true,
      lastSyncStatus: true, lastSyncError: true, consecutiveFailures: true,
      pollIntervalMinutes: true, isActive: true, createdAt: true,
    },
  });
  if (!connector) throw new NotFoundError('EmailConnector', connectorId);
  return toConnectorItem(connector as unknown as Record<string, unknown>);
}

export async function createConnector(
  tenantId: string,
  userId: string,
  data: CreateEmailConnectorRequest,
): Promise<EmailConnectorItem> {
  if (!isEncryptionConfigured()) {
    throw new ConflictError('ENCRYPTION_KEY nicht konfiguriert — E-Mail-Connector kann nicht erstellt werden');
  }

  const passwordEncrypted = encrypt(data.password);

  const connector = await prisma.emailConnector.create({
    data: {
      tenantId,
      label: data.label,
      host: data.host,
      port: data.port ?? 993,
      secure: data.secure ?? true,
      username: data.username,
      passwordEncrypted,
      folder: data.folder ?? 'INBOX',
      pollIntervalMinutes: data.pollIntervalMinutes ?? 5,
      createdByUserId: userId,
    },
  });

  // Repeatable Job registrieren
  await registerRepeatableJob(connector.id, connector.pollIntervalMinutes);

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'EmailConnector',
    entityId: connector.id,
    action: 'EMAIL_CONNECTOR_CREATED',
    newData: { label: data.label, host: data.host, username: data.username },
  });

  return getConnector(tenantId, connector.id);
}

export async function updateConnector(
  tenantId: string,
  connectorId: string,
  data: UpdateEmailConnectorRequest,
): Promise<EmailConnectorItem> {
  const existing = await prisma.emailConnector.findFirst({
    where: { id: connectorId, tenantId },
  });
  if (!existing) throw new NotFoundError('EmailConnector', connectorId);

  const updateData: Record<string, unknown> = {};
  if (data.label !== undefined) updateData.label = data.label;
  if (data.host !== undefined) updateData.host = data.host;
  if (data.port !== undefined) updateData.port = data.port;
  if (data.secure !== undefined) updateData.secure = data.secure;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.folder !== undefined) updateData.folder = data.folder;
  if (data.pollIntervalMinutes !== undefined) updateData.pollIntervalMinutes = data.pollIntervalMinutes;

  if (data.password) {
    if (!isEncryptionConfigured()) {
      throw new ConflictError('ENCRYPTION_KEY nicht konfiguriert');
    }
    updateData.passwordEncrypted = encrypt(data.password);
  }

  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
    // Bei Reaktivierung: Fehler-Counter zurücksetzen
    if (data.isActive && !existing.isActive) {
      updateData.consecutiveFailures = 0;
      updateData.lastSyncError = null;
    }
  }

  await prisma.emailConnector.update({
    where: { id: connectorId },
    data: updateData,
  });

  // Job aktualisieren
  const newInterval = data.pollIntervalMinutes ?? existing.pollIntervalMinutes;
  const newActive = data.isActive ?? existing.isActive;
  await removeRepeatableJob(connectorId);
  if (newActive) {
    await registerRepeatableJob(connectorId, newInterval);
  }

  writeAuditLog({
    tenantId,
    userId: '',
    entityType: 'EmailConnector',
    entityId: connectorId,
    action: 'EMAIL_CONNECTOR_UPDATED',
    newData: { ...data, password: data.password ? '***' : undefined },
  });

  return getConnector(tenantId, connectorId);
}

export async function deleteConnector(tenantId: string, userId: string, connectorId: string): Promise<void> {
  const existing = await prisma.emailConnector.findFirst({
    where: { id: connectorId, tenantId },
  });
  if (!existing) throw new NotFoundError('EmailConnector', connectorId);

  await removeRepeatableJob(connectorId);

  await prisma.emailConnector.delete({ where: { id: connectorId } });

  writeAuditLog({
    tenantId,
    userId,
    entityType: 'EmailConnector',
    entityId: connectorId,
    action: 'EMAIL_CONNECTOR_DELETED',
    previousData: { label: existing.label, host: existing.host, username: existing.username },
  });
}

export async function testConnection(data: TestEmailConnectorRequest): Promise<{ success: boolean; messageCount?: number; error?: string }> {
  const client = new ImapFlow({
    host: data.host,
    port: data.port ?? 993,
    secure: data.secure ?? true,
    auth: { user: data.username, pass: data.password },
    logger: false,
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX');
    const messageCount = mailbox.exists ?? 0;
    await client.logout();
    return { success: true, messageCount };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function triggerSync(tenantId: string, connectorId: string): Promise<void> {
  const connector = await prisma.emailConnector.findFirst({
    where: { id: connectorId, tenantId, isActive: true },
  });
  if (!connector) throw new NotFoundError('EmailConnector', connectorId);

  await emailSyncQueue.add('sync-connector', { connectorId }, {
    jobId: `manual-sync-${connectorId}-${Date.now()}`,
  });
}

export async function registerRepeatableJob(connectorId: string, intervalMinutes: number): Promise<void> {
  await emailSyncQueue.add('sync-connector', { connectorId }, {
    repeat: { every: intervalMinutes * 60 * 1000 },
    jobId: `email-sync-${connectorId}`,
  });
}

export async function removeRepeatableJob(connectorId: string): Promise<void> {
  const repeatableJobs = await emailSyncQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id === `email-sync-${connectorId}`) {
      await emailSyncQueue.removeRepeatableByKey(job.key);
    }
  }
}

/**
 * Bei Server-Start: Alle aktiven Connectors registrieren.
 */
export async function registerAllActiveConnectors(): Promise<void> {
  if (!isEncryptionConfigured()) {
    console.log('[EmailSync] ENCRYPTION_KEY nicht gesetzt — E-Mail-Abruf deaktiviert');
    return;
  }

  const activeConnectors = await prisma.emailConnector.findMany({
    where: { isActive: true },
    select: { id: true, pollIntervalMinutes: true, label: true },
  });

  if (activeConnectors.length === 0) {
    console.log('[EmailSync] Keine aktiven E-Mail-Connectors gefunden');
    return;
  }

  // Zuerst alle alten repeatable Jobs aufräumen
  const existingJobs = await emailSyncQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await emailSyncQueue.removeRepeatableByKey(job.key);
  }

  // Dann alle aktiven neu registrieren
  for (const connector of activeConnectors) {
    await registerRepeatableJob(connector.id, connector.pollIntervalMinutes);
    console.log(`[EmailSync] Connector "${connector.label}" registriert (alle ${connector.pollIntervalMinutes} Min)`);
  }
}
