/**
 * Anomaly Detection Service
 *
 * Analyzes invoice patterns per tenant to detect unusual activity:
 * 1. Duplicate amounts from same vendor
 * 2. Unusual amounts (statistical outliers)
 * 3. Weekend/holiday invoices
 * 4. New vendors with high amounts
 * 5. Frequency anomalies (sudden spike)
 */

import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';

export interface AnomalyAlert {
  type: 'duplicate_amount' | 'unusual_amount' | 'weekend_invoice' | 'new_vendor_high_amount' | 'frequency_spike';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  invoiceIds: string[];
  detectedAt: string;
}

export async function detectAnomalies(tenantId: string): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch recent invoices
  const recentInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: {
      id: true,
      grossAmount: true,
      vendorId: true,
      vendorName: true,
      invoiceDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentInvoices.length < 3) return alerts;

  // 1. Duplicate amounts from same vendor (potential double-entry)
  const vendorAmountMap = new Map<string, { ids: string[]; amount: number }[]>();
  for (const inv of recentInvoices) {
    if (!inv.vendorId || !inv.grossAmount) continue;
    const key = inv.vendorId;
    if (!vendorAmountMap.has(key)) vendorAmountMap.set(key, []);
    vendorAmountMap.get(key)!.push({ ids: [inv.id], amount: Number(inv.grossAmount) });
  }

  for (const [, entries] of vendorAmountMap) {
    const amountCounts = new Map<number, string[]>();
    for (const e of entries) {
      const key = e.amount;
      if (!amountCounts.has(key)) amountCounts.set(key, []);
      amountCounts.get(key)!.push(e.ids[0]);
    }
    for (const [amount, ids] of amountCounts) {
      if (ids.length >= 2 && amount > 0) {
        const vendorName = recentInvoices.find(i => i.id === ids[0])?.vendorName || 'Unbekannt';
        alerts.push({
          type: 'duplicate_amount',
          severity: 'warning',
          title: 'Mögliche Doppelbuchung',
          description: `${ids.length}x gleicher Betrag (${amount.toFixed(2)} €) von ${vendorName} in 30 Tagen`,
          invoiceIds: ids.slice(0, 5),
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 2. Unusual amounts (> 3 standard deviations from mean)
  const amounts = recentInvoices
    .map(i => Number(i.grossAmount))
    .filter(a => a > 0);

  if (amounts.length >= 5) {
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stddev = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length);
    const threshold = mean + 3 * stddev;

    for (const inv of recentInvoices) {
      const amount = Number(inv.grossAmount);
      if (amount > threshold && amount > 100) {
        alerts.push({
          type: 'unusual_amount',
          severity: 'warning',
          title: 'Ungewöhnlich hoher Betrag',
          description: `${amount.toFixed(2)} € von ${inv.vendorName || 'Unbekannt'} — Durchschnitt: ${mean.toFixed(2)} €`,
          invoiceIds: [inv.id],
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 3. Weekend invoices (unusual for B2B)
  const weekendInvoices = recentInvoices.filter(inv => {
    if (!inv.invoiceDate) return false;
    const day = new Date(inv.invoiceDate).getDay();
    return day === 0 || day === 6;
  });

  if (weekendInvoices.length > 0) {
    alerts.push({
      type: 'weekend_invoice',
      severity: 'info',
      title: 'Wochenend-Rechnungen',
      description: `${weekendInvoices.length} Rechnung(en) mit Wochenend-Datum — unüblich für B2B`,
      invoiceIds: weekendInvoices.slice(0, 5).map(i => i.id),
      detectedAt: new Date().toISOString(),
    });
  }

  // 4. New vendors with high first invoice
  const allVendorIds = await prisma.invoice.groupBy({
    by: ['vendorId'],
    where: { tenantId, vendorId: { not: null } },
    _min: { createdAt: true },
    _max: { grossAmount: true },
  });

  const medianAmount = amounts.length > 0
    ? amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)]
    : 0;

  for (const vg of allVendorIds) {
    if (!vg._min.createdAt || !vg._max.grossAmount) continue;
    const firstInvoiceDate = vg._min.createdAt;
    const maxAmount = Number(vg._max.grossAmount);

    if (firstInvoiceDate >= thirtyDaysAgo && maxAmount > medianAmount * 3 && maxAmount > 500) {
      const inv = recentInvoices.find(i => i.vendorId === vg.vendorId);
      alerts.push({
        type: 'new_vendor_high_amount',
        severity: 'warning',
        title: 'Neuer Lieferant mit hohem Betrag',
        description: `${inv?.vendorName || 'Unbekannt'}: ${maxAmount.toFixed(2)} € — 3x über Median (${medianAmount.toFixed(2)} €)`,
        invoiceIds: inv ? [inv.id] : [],
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // 5. Frequency spike (this week vs. average)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thisWeekCount = recentInvoices.filter(i => i.createdAt >= sevenDaysAgo).length;
  const avgWeekly = recentInvoices.length / 4.3; // ~30 days / 4.3 weeks

  if (avgWeekly > 2 && thisWeekCount > avgWeekly * 2.5) {
    alerts.push({
      type: 'frequency_spike',
      severity: 'info',
      title: 'Überdurchschnittlich viele Rechnungen',
      description: `${thisWeekCount} Rechnungen diese Woche — Durchschnitt: ${avgWeekly.toFixed(1)}/Woche`,
      invoiceIds: [],
      detectedAt: new Date().toISOString(),
    });
  }

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}
