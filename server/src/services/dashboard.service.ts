import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database.js';
import type { DashboardStats, DashboardPeriod, CashflowForecastPoint, OpenInvoiceItem } from '@buchungsai/shared';

interface DashboardOptions {
  tenantId: string;
  period?: DashboardPeriod;
}

const VALID_PERIODS: DashboardPeriod[] = ['last30', 'last60', 'last90', 'currentMonth', 'currentYear'];

export function isValidPeriod(value: string): value is DashboardPeriod {
  return VALID_PERIODS.includes(value as DashboardPeriod);
}

function computeDateRange(period: DashboardPeriod): { from: Date; to: Date } {
  const now = new Date();
  let from: Date;

  switch (period) {
    case 'last30':
      from = new Date(now);
      from.setDate(from.getDate() - 30);
      break;
    case 'last60':
      from = new Date(now);
      from.setDate(from.getDate() - 60);
      break;
    case 'last90':
      from = new Date(now);
      from.setDate(from.getDate() - 90);
      break;
    case 'currentMonth':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'currentYear':
      from = new Date(now.getFullYear(), 0, 1);
      break;
  }

  return { from, to: now };
}

export async function getDashboardStats(options: DashboardOptions): Promise<DashboardStats> {
  const { tenantId, period } = options;

  // === V1 queries (12 parallel) ===
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
    prisma.invoice.aggregate({
      where: { tenantId, grossAmount: { not: null }, currency: 'EUR' },
      _sum: { grossAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { tenantId, estimatedEurGross: { not: null }, currency: { not: 'EUR' } },
      _sum: { estimatedEurGross: true },
    }),
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

  const baseStats: DashboardStats = {
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
  };

  // === V2 queries (only when period is provided) ===
  if (period) {
    const { from, to } = computeDateRange(period);
    const dateFilter = { gte: from, lte: to };

    const openStatuses: string[] = [
      'RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'ARCHIVED', 'EXPORTED', 'REJECTED', 'ERROR', 'REPLACED',
    ];

    const [
      revenueResult,
      costsResult,
      latestBankStatement,
      topReceivablesRaw,
      topPayablesRaw,
      futureReceivables,
      futurePayables,
    ] = await Promise.all([
      // Revenue (OUTGOING invoices in period)
      prisma.invoice.aggregate({
        where: { tenantId, direction: 'OUTGOING', grossAmount: { not: null }, invoiceDate: dateFilter },
        _sum: { grossAmount: true },
      }),
      // Costs (INCOMING invoices in period)
      prisma.invoice.aggregate({
        where: { tenantId, direction: 'INCOMING', grossAmount: { not: null }, invoiceDate: dateFilter },
        _sum: { grossAmount: true },
      }),
      // Latest bank balance
      prisma.bankStatement.findFirst({
        where: { tenantId, closingBalance: { not: null } },
        orderBy: { periodTo: 'desc' },
        select: { closingBalance: true },
      }),
      // Top 5 receivables (OUTGOING, open)
      prisma.invoice.findMany({
        where: {
          tenantId,
          direction: 'OUTGOING',
          grossAmount: { not: null },
          processingStatus: { notIn: openStatuses as never[] },
        },
        orderBy: { grossAmount: 'desc' },
        take: 5,
        select: { id: true, customerName: true, vendorName: true, grossAmount: true, dueDate: true, invoiceNumber: true },
      }),
      // Top 5 payables (INCOMING, open)
      prisma.invoice.findMany({
        where: {
          tenantId,
          direction: 'INCOMING',
          grossAmount: { not: null },
          processingStatus: { notIn: openStatuses as never[] },
        },
        orderBy: { grossAmount: 'desc' },
        take: 5,
        select: { id: true, vendorName: true, customerName: true, grossAmount: true, dueDate: true, invoiceNumber: true },
      }),
      // Future receivables for cashflow forecast
      prisma.invoice.findMany({
        where: {
          tenantId,
          direction: 'OUTGOING',
          grossAmount: { not: null },
          dueDate: { gt: new Date() },
          processingStatus: { notIn: openStatuses as never[] },
        },
        select: { grossAmount: true, dueDate: true },
      }),
      // Future payables for cashflow forecast
      prisma.invoice.findMany({
        where: {
          tenantId,
          direction: 'INCOMING',
          grossAmount: { not: null },
          dueDate: { gt: new Date() },
          processingStatus: { notIn: openStatuses as never[] },
        },
        select: { grossAmount: true, dueDate: true },
      }),
    ]);

    const revenue = Number(revenueResult._sum.grossAmount ?? 0);
    const costs = Number(costsResult._sum.grossAmount ?? 0);
    const currentBalance = latestBankStatement?.closingBalance
      ? new Decimal(latestBankStatement.closingBalance as unknown as Decimal).toString()
      : null;

    const now = new Date();
    const mapOpenInvoice = (
      inv: { id: string; vendorName: string | null; customerName: string | null; grossAmount: unknown; dueDate: Date | null; invoiceNumber: string | null },
      direction: 'INCOMING' | 'OUTGOING',
    ): OpenInvoiceItem => {
      const partnerName = direction === 'OUTGOING'
        ? (inv.customerName || inv.vendorName || 'Unbekannt')
        : (inv.vendorName || inv.customerName || 'Unbekannt');
      let daysOverdue = 0;
      if (inv.dueDate && inv.dueDate < now) {
        daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        id: inv.id,
        partnerName,
        grossAmount: inv.grossAmount ? new Decimal(inv.grossAmount as unknown as Decimal).toString() : '0',
        dueDate: inv.dueDate?.toISOString() ?? null,
        daysOverdue,
        invoiceNumber: inv.invoiceNumber,
      };
    };

    const cashflowForecast = buildCashflowForecast(
      currentBalance ? Number(currentBalance) : 0,
      futureReceivables.map(i => ({ amount: Number(i.grossAmount ?? 0), dueDate: i.dueDate! })),
      futurePayables.map(i => ({ amount: Number(i.grossAmount ?? 0), dueDate: i.dueDate! })),
    );

    baseStats.revenue = revenue.toFixed(2);
    baseStats.costs = costs.toFixed(2);
    baseStats.profit = (revenue - costs).toFixed(2);
    baseStats.currentBalance = currentBalance;
    baseStats.topReceivables = topReceivablesRaw.map(inv => mapOpenInvoice(inv, 'OUTGOING'));
    baseStats.topPayables = topPayablesRaw.map(inv => mapOpenInvoice(inv, 'INCOMING'));
    baseStats.cashflowForecast = cashflowForecast;
    baseStats.period = period;
    baseStats.periodFrom = from.toISOString();
    baseStats.periodTo = to.toISOString();
  }

  return baseStats;
}

function buildCashflowForecast(
  startBalance: number,
  receivables: Array<{ amount: number; dueDate: Date }>,
  payables: Array<{ amount: number; dueDate: Date }>,
): CashflowForecastPoint[] {
  const points: CashflowForecastPoint[] = [];
  let balance = startBalance;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Bucket receivables/payables by day for O(30 + R + P) instead of O(30 * (R + P))
  const dayMap = new Map<string, number>();

  for (const r of receivables) {
    const key = r.dueDate.toISOString().split('T')[0];
    dayMap.set(key, (dayMap.get(key) ?? 0) + r.amount);
  }
  for (const p of payables) {
    const key = p.dueDate.toISOString().split('T')[0];
    dayMap.set(key, (dayMap.get(key) ?? 0) - p.amount);
  }

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    balance += dayMap.get(dateStr) ?? 0;

    points.push({
      date: dateStr,
      projectedBalance: balance.toFixed(2),
    });
  }

  return points;
}

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
