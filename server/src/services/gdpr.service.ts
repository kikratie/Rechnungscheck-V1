/**
 * GDPR Service — Account deletion + data export
 *
 * Art. 17 DSGVO: Recht auf Löschung
 * Art. 20 DSGVO: Recht auf Datenübertragbarkeit
 */

import bcrypt from 'bcrypt';
import { prisma } from '../config/database.js';
import { deleteFile } from './storage.service.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

/**
 * Delete user account and all associated tenant data.
 * Requires password confirmation.
 * Only ADMIN can delete the account (deletes entire tenant).
 */
export async function deleteAccount(
  userId: string,
  tenantId: string,
  password: string,
) {
  // Verify password
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, role: true },
  });

  if (!user) {
    throw new UnauthorizedError('Benutzer nicht gefunden');
  }

  if (user.role !== 'ADMIN') {
    throw new ForbiddenError('Nur der Administrator kann das Konto löschen');
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    throw new UnauthorizedError('Falsches Passwort');
  }

  // Collect all storage paths before deletion
  const invoices = await prisma.invoice.findMany({
    where: { tenantId },
    select: { storagePath: true, archivedStoragePath: true },
  });

  const storagePaths = invoices.flatMap((inv) =>
    [inv.storagePath, inv.archivedStoragePath].filter(Boolean) as string[],
  );

  // Delete all data in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete in dependency order
    await tx.paymentDifference.deleteMany({ where: { matching: { tenantId } } });
    await tx.matching.deleteMany({ where: { tenantId } });
    await tx.bankTransaction.deleteMany({ where: { bankStatement: { tenantId } } });
    await tx.bankStatement.deleteMany({ where: { tenantId } });
    await tx.bankAccount.deleteMany({ where: { tenantId } });
    await tx.substituteDocument.deleteMany({ where: { invoice: { tenantId } } });
    await tx.invoiceLineItem.deleteMany({ where: { invoice: { tenantId } } });
    await tx.validationResult.deleteMany({ where: { invoice: { tenantId } } });
    await tx.extractedData.deleteMany({ where: { invoice: { tenantId } } });
    await tx.documentVersion.deleteMany({ where: { invoice: { tenantId } } });
    await tx.invoice.deleteMany({ where: { tenantId } });
    await tx.vendor.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });
    await tx.cancelledNumber.deleteMany({ where: { tenantId } });
    await tx.sequentialNumber.deleteMany({ where: { tenantId } });
    await tx.exportLog.deleteMany({ where: { tenantId } });
    await tx.auditLog.deleteMany({ where: { tenantId } });
    await tx.userCompanyAccess.deleteMany({ where: { tenantId } });
    const userIds = (await tx.user.findMany({ where: { tenantId }, select: { id: true } })).map((u) => u.id);
    await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.tenant.delete({ where: { id: tenantId } });
  });

  // Delete storage files (non-blocking, best-effort)
  for (const path of storagePaths) {
    try {
      await deleteFile(path);
    } catch {
      // Log but don't fail — data is already deleted from DB
    }
  }
}

/**
 * Export all user data (DSGVO Art. 20 — Recht auf Datenübertragbarkeit).
 * Returns a JSON object with all personal data.
 */
export async function exportUserData(userId: string, tenantId: string) {
  const [user, tenant, invoices, vendors, customers, auditLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        uidNumber: true,
        address: true,
        phone: true,
        email: true,
        createdAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: { tenantId },
      select: {
        id: true,
        belegNr: true,
        direction: true,
        documentType: true,
        vendorName: true,
        invoiceNumber: true,
        invoiceDate: true,
        grossAmount: true,
        netAmount: true,
        vatAmount: true,
        currency: true,
        processingStatus: true,
        validationStatus: true,
        archivalNumber: true,
        createdAt: true,
      },
    }),
    prisma.vendor.findMany({
      where: { tenantId },
      select: { id: true, name: true, uid: true, createdAt: true },
    }),
    prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, name: true, uid: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, userId },
      select: {
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ]);

  return {
    exportDate: new Date().toISOString(),
    gdprArticle: 'Art. 20 DSGVO — Recht auf Datenübertragbarkeit',
    user,
    tenant,
    invoices,
    vendors,
    customers,
    auditLogs,
  };
}
