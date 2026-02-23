import { prisma } from '../config/database.js';
import { Prisma } from '@prisma/client';

interface FindOrCreateCustomerInput {
  tenantId: string;
  name: string;
  uid?: string | null;
  address?: Record<string, string> | null;
  email?: string | null;
  iban?: string | null;
}

/**
 * Find existing customer by UID (primary) or name (fallback), or create new one.
 * Called automatically after processing OUTGOING invoices.
 */
export async function findOrCreateCustomer(input: FindOrCreateCustomerInput): Promise<string> {
  const { tenantId, name, uid, address, email, iban } = input;

  // 1. Try to find by UID (most reliable)
  if (uid) {
    const byUid = await prisma.customer.findUnique({
      where: { tenantId_uid: { tenantId, uid } },
      select: { id: true },
    });

    if (byUid) return byUid.id;
  }

  // 2. Try to find by name (exact match, case-insensitive)
  if (!uid) {
    const byName = await prisma.customer.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        uid: null,
      },
      select: { id: true },
    });

    if (byName) return byName.id;
  }

  // 3. Create new customer
  const customer = await prisma.customer.create({
    data: {
      tenantId,
      name,
      uid: uid || undefined,
      address: address ? (address as Prisma.InputJsonValue) : undefined,
      email: email || undefined,
      iban: iban || undefined,
    },
  });

  return customer.id;
}

/**
 * List all customers for a tenant with invoice counts.
 */
export async function listCustomers(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; activeOnly?: boolean },
) {
  const { page = 1, limit = 50, search, activeOnly = true } = options;

  const where: Record<string, unknown> = { tenantId };
  if (activeOnly) where.isActive = true;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { uid: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        _count: { select: { invoices: true } },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      uid: c.uid,
      address: c.address,
      email: c.email,
      phone: c.phone,
      iban: c.iban,
      website: c.website,
      isActive: c.isActive,
      invoiceCount: c._count.invoices,
      createdAt: c.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get customer detail with recent outgoing invoices.
 */
export async function getCustomerDetail(tenantId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    include: {
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          belegNr: true,
          originalFileName: true,
          invoiceNumber: true,
          invoiceDate: true,
          grossAmount: true,
          currency: true,
          processingStatus: true,
          validationStatus: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer) return null;

  return {
    id: customer.id,
    name: customer.name,
    uid: customer.uid,
    address: customer.address,
    email: customer.email,
    phone: customer.phone,
    iban: customer.iban,
    bic: customer.bic,
    website: customer.website,
    notes: customer.notes,
    viesName: customer.viesName,
    viesAddress: customer.viesAddress,
    viesCheckedAt: customer.viesCheckedAt?.toISOString() || null,
    isActive: customer.isActive,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    invoices: customer.invoices.map((inv) => ({
      id: inv.id,
      belegNr: inv.belegNr,
      originalFileName: inv.originalFileName,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate?.toISOString() || null,
      grossAmount: inv.grossAmount?.toString() || null,
      currency: inv.currency,
      processingStatus: inv.processingStatus,
      validationStatus: inv.validationStatus,
      createdAt: inv.createdAt.toISOString(),
    })),
  };
}

/**
 * Update customer details.
 */
export async function updateCustomer(
  tenantId: string,
  customerId: string,
  data: {
    name?: string;
    uid?: string | null;
    address?: Record<string, string> | null;
    email?: string | null;
    phone?: string | null;
    iban?: string | null;
    bic?: string | null;
    website?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true },
  });

  if (!customer) return null;

  const updateData: Prisma.CustomerUpdateInput = {
    ...data,
    address: data.address === null
      ? Prisma.JsonNull
      : data.address
        ? (data.address as Prisma.InputJsonValue)
        : undefined,
  };
  return prisma.customer.update({
    where: { id: customerId },
    data: updateData,
  });
}
