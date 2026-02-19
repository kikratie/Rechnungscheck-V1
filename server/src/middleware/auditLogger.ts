import { prisma } from '../config/database.js';

interface AuditEntry {
  tenantId: string;
  userId?: string;
  entityType: string;
  entityId: string;
  action: string;
  previousData?: unknown;
  newData?: unknown;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Schreibt einen Eintrag ins Audit-Log.
 * Wird von Services/Controllern aufgerufen.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        previousData: entry.previousData ? JSON.parse(JSON.stringify(entry.previousData)) : undefined,
        newData: entry.newData ? JSON.parse(JSON.stringify(entry.newData)) : undefined,
        metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    // Audit-Log-Fehler dürfen die Hauptoperation nicht blockieren
    console.error('Audit-Log Fehler:', error);
  }
}
