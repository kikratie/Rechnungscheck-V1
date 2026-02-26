/**
 * Recurring Costs Service — Laufende Kosten
 *
 * Manages recurring invoice flags, pattern detection, and summary queries.
 */

import { randomUUID } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database.js';
import { RECURRING_INTERVALS } from '@buchungsai/shared';
import type { RecurringIntervalType, RecurringCostItem, RecurringCostsSummary } from '@buchungsai/shared';

// ============================================================
// Set / Update recurring flag on a single invoice
// ============================================================

interface SetRecurringParams {
  tenantId: string;
  invoiceId: string;
  isRecurring: boolean;
  recurringInterval?: RecurringIntervalType | null;
  recurringNote?: string | null;
}

export async function setRecurring(params: SetRecurringParams) {
  const { tenantId, invoiceId, isRecurring, recurringInterval, recurringNote } = params;

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { id: true, vendorId: true, isRecurring: true, recurringGroupId: true },
  });
  if (!invoice) throw new Error('Rechnung nicht gefunden');

  let groupId = invoice.recurringGroupId;

  if (isRecurring && !groupId) {
    // Try to find an existing group for the same vendor
    if (invoice.vendorId) {
      const existingGroupInvoice = await prisma.invoice.findFirst({
        where: {
          tenantId,
          vendorId: invoice.vendorId,
          isRecurring: true,
          recurringGroupId: { not: null },
        },
        select: { recurringGroupId: true },
      });
      groupId = existingGroupInvoice?.recurringGroupId ?? randomUUID();
    } else {
      groupId = randomUUID();
    }
  }

  if (!isRecurring) {
    groupId = null;
  }

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      isRecurring,
      recurringInterval: isRecurring ? (recurringInterval ?? 'MONTHLY') : null,
      recurringGroupId: groupId,
      recurringNote: isRecurring ? (recurringNote ?? null) : null,
    },
  });
}

// ============================================================
// Get recurring costs summary for Dashboard
// ============================================================

export async function getRecurringCostsSummary(tenantId: string): Promise<RecurringCostsSummary> {
  // Get all recurring invoices, grouped by recurringGroupId
  const recurringInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      isRecurring: true,
      direction: 'INCOMING',
    },
    select: {
      id: true,
      vendorName: true,
      grossAmount: true,
      invoiceDate: true,
      recurringGroupId: true,
      recurringInterval: true,
      recurringNote: true,
    },
    orderBy: { invoiceDate: 'desc' },
  });

  // Group by recurringGroupId (or vendorName fallback)
  const groups = new Map<string, typeof recurringInvoices>();
  for (const inv of recurringInvoices) {
    const key = inv.recurringGroupId || inv.vendorName || inv.id;
    const list = groups.get(key) ?? [];
    list.push(inv);
    groups.set(key, list);
  }

  let monthlyTotal = 0;
  const items: RecurringCostItem[] = [];

  const now = new Date();

  for (const [groupId, invoices] of groups) {
    const latest = invoices[0]; // Already sorted desc
    const interval = (latest.recurringInterval as RecurringIntervalType) ?? 'MONTHLY';
    const lastAmount = Number(latest.grossAmount ?? 0);
    const months = RECURRING_INTERVALS[interval].months;

    // Calculate monthly equivalent
    monthlyTotal += lastAmount / months;

    // Calculate next expected date
    let nextExpectedDate: string | null = null;
    let isOverdue = false;

    if (latest.invoiceDate) {
      const next = new Date(latest.invoiceDate);
      next.setMonth(next.getMonth() + months);
      nextExpectedDate = next.toISOString().split('T')[0];

      // Check if overdue: expected date is more than 7 days in the past
      const graceDays = 7;
      const overdueThreshold = new Date(next);
      overdueThreshold.setDate(overdueThreshold.getDate() + graceDays);
      isOverdue = overdueThreshold < now;
    }

    items.push({
      vendorName: latest.vendorName ?? 'Unbekannt',
      recurringGroupId: groupId,
      recurringInterval: interval,
      recurringNote: latest.recurringNote,
      lastGrossAmount: lastAmount.toFixed(2),
      lastInvoiceDate: latest.invoiceDate?.toISOString().split('T')[0] ?? null,
      nextExpectedDate,
      invoiceCount: invoices.length,
      isOverdue,
    });
  }

  // Sort: overdue first, then by monthly amount descending
  items.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return Number(b.lastGrossAmount) - Number(a.lastGrossAmount);
  });

  return {
    monthlyTotal: monthlyTotal.toFixed(2),
    items,
  };
}

// ============================================================
// Auto-detect recurring invoices (called after new invoice is processed)
// ============================================================

export async function detectRecurring(tenantId: string, invoiceId: string): Promise<boolean> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      id: true,
      vendorId: true,
      vendorName: true,
      grossAmount: true,
      invoiceDate: true,
      isRecurring: true,
    },
  });
  if (!invoice || invoice.isRecurring || !invoice.vendorId) return false;

  // Find similar invoices from the same vendor (same vendor, similar amount, last 18 months)
  const eighteenMonthsAgo = new Date();
  eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);

  const similarInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      vendorId: invoice.vendorId,
      id: { not: invoice.id },
      direction: 'INCOMING',
      invoiceDate: { gte: eighteenMonthsAgo },
      processingStatus: { notIn: ['REJECTED', 'ERROR', 'REPLACED'] },
    },
    select: {
      id: true,
      grossAmount: true,
      invoiceDate: true,
      isRecurring: true,
      recurringGroupId: true,
    },
    orderBy: { invoiceDate: 'desc' },
  });

  if (similarInvoices.length < 2) return false;

  // Check if amounts are similar (within 10% tolerance)
  const currentAmount = Number(invoice.grossAmount ?? 0);
  if (currentAmount === 0) return false;

  const similarAmountInvoices = similarInvoices.filter(inv => {
    const amt = Number(inv.grossAmount ?? 0);
    if (amt === 0) return false;
    const ratio = Math.abs(amt - currentAmount) / currentAmount;
    return ratio < 0.1; // 10% tolerance
  });

  if (similarAmountInvoices.length < 2) return false;

  // Detect interval from date differences
  const dates = [invoice, ...similarAmountInvoices]
    .filter(inv => inv.invoiceDate)
    .map(inv => inv.invoiceDate!)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 3) return false;

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const diffMonths = (dates[i].getFullYear() - dates[i - 1].getFullYear()) * 12
      + (dates[i].getMonth() - dates[i - 1].getMonth());
    intervals.push(diffMonths);
  }

  // Determine the most common interval
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  let detectedInterval: RecurringIntervalType;

  if (avgInterval <= 1.5) detectedInterval = 'MONTHLY';
  else if (avgInterval <= 4) detectedInterval = 'QUARTERLY';
  else if (avgInterval <= 8) detectedInterval = 'HALF_YEARLY';
  else detectedInterval = 'YEARLY';

  // Check if already part of a recurring group
  const existingGroup = similarAmountInvoices.find(inv => inv.recurringGroupId);
  const groupId = existingGroup?.recurringGroupId ?? randomUUID();

  // Mark current invoice and all similar ones as recurring
  const allIds = [invoice.id, ...similarAmountInvoices.map(inv => inv.id)];
  await prisma.invoice.updateMany({
    where: { id: { in: allIds }, tenantId },
    data: {
      isRecurring: true,
      recurringInterval: detectedInterval,
      recurringGroupId: groupId,
    },
  });

  return true;
}
