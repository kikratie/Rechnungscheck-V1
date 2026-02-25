import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/dashboard/stats
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const [
      totalInvoices,
      validCount,
      warningCount,
      invalidCount,
      pendingCount,
      pendingReview,
      parkedInvoices,
      matchedInvoices,
      eurAmountResult,
      foreignEurEstimateResult,
      foreignCurrencyCount,
      recentLogs,
    ] = await Promise.all([
      prisma.invoice.count({ where: { tenantId } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'VALID' } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'WARNING' } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'INVALID' } }),
      prisma.invoice.count({ where: { tenantId, validationStatus: 'PENDING' } }),
      prisma.invoice.count({ where: { tenantId, processingStatus: 'REVIEW_REQUIRED' } }),
      prisma.invoice.count({ where: { tenantId, processingStatus: 'PARKED' } }),
      prisma.matching.count({ where: { tenantId, status: 'CONFIRMED' } }),
      prisma.invoice.aggregate({ where: { tenantId, grossAmount: { not: null }, currency: 'EUR' }, _sum: { grossAmount: true } }),
      prisma.invoice.aggregate({ where: { tenantId, estimatedEurGross: { not: null }, currency: { not: 'EUR' } }, _sum: { estimatedEurGross: true } }),
      prisma.invoice.count({ where: { tenantId, currency: { not: 'EUR' } } }),
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const recentActivity = recentLogs.map((log) => ({
      id: log.id,
      type: log.action,
      description: formatAuditDescription(log),
      timestamp: log.createdAt.toISOString(),
    }));

    res.json({
      success: true,
      data: {
        totalInvoices,
        pendingReview,
        parkedInvoices,
        matchedInvoices,
        unmatchedInvoices: totalInvoices - matchedInvoices,
        validationSummary: {
          valid: validCount,
          warning: warningCount,
          invalid: invalidCount,
          pending: pendingCount,
        },
        totalAmount: (
          Number(eurAmountResult._sum.grossAmount ?? 0) +
          Number(foreignEurEstimateResult._sum.estimatedEurGross ?? 0)
        ).toFixed(2),
        foreignCurrencyCount,
        recentActivity,
      },
    });
  } catch (err) {
    next(err);
  }
});

function formatAuditDescription(log: {
  action: string;
  entityType: string;
  entityId: string;
  user: { firstName: string; lastName: string } | null;
}): string {
  const user = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System';
  const actions: Record<string, string> = {
    UPLOAD: 'hat hochgeladen',
    AI_PROCESSED: 'KI-Verarbeitung abgeschlossen',
    APPROVE: 'hat genehmigt',
    APPROVE_AND_ARCHIVE: 'hat genehmigt & archiviert',
    AUTO_APPROVE: 'automatisch genehmigt (Trusted Vendor)',
    CANCEL_ARCHIVAL_NUMBER: 'Archivnummer storniert',
    CONFIRM: 'hat bestätigt',
    LOGIN: 'hat sich angemeldet',
    REGISTER: 'hat sich registriert',
    PARK: 'hat geparkt',
    UNPARK: 'hat fortgesetzt',
    REJECT: 'hat abgelehnt',
    UID_VALIDATION_FAILED: 'UID-Validierung fehlgeschlagen',
  };
  const action = actions[log.action] || log.action;
  return `${user}: ${action} (${log.entityType} ${log.entityId.substring(0, 8)}...)`;
}

// GET /api/v1/dashboard/number-gaps — Stornierte Nummern + Lücken-Prüfung
router.get('/number-gaps', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const cancelledNumbers = await prisma.cancelledNumber.findMany({
      where: { tenantId },
      orderBy: { cancelledAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: {
        cancelledNumbers,
        count: cancelledNumbers.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRoutes };
