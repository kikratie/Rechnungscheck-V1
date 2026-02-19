import { prisma } from '../config/database.js';
import { Prisma } from '@prisma/client';
import type { ViesValidationInfo } from '@buchungsai/shared';

interface FindOrCreateVendorInput {
  tenantId: string;
  name: string;
  uid?: string | null;
  address?: Record<string, string> | null;
  email?: string | null;
  iban?: string | null;
  viesInfo?: ViesValidationInfo | null;
}

/**
 * Find existing vendor by UID (primary) or name (fallback), or create new one.
 * Called automatically after invoice processing.
 */
export async function findOrCreateVendor(input: FindOrCreateVendorInput): Promise<string> {
  const { tenantId, name, uid, address, email, iban, viesInfo } = input;

  // 1. Try to find by UID (most reliable)
  if (uid) {
    const byUid = await prisma.vendor.findUnique({
      where: { tenantId_uid: { tenantId, uid } },
      select: { id: true },
    });

    if (byUid) {
      // Update VIES data if we have fresh info
      if (viesInfo?.checked) {
        await prisma.vendor.update({
          where: { id: byUid.id },
          data: {
            viesName: viesInfo.registeredName,
            viesAddress: viesInfo.registeredAddress,
            viesCheckedAt: new Date(),
          },
        });
      }
      return byUid.id;
    }
  }

  // 2. Try to find by name (fuzzy: exact match on normalized name)
  if (!uid) {
    const byName = await prisma.vendor.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        uid: null, // Only match vendors without UID to avoid false matches
      },
      select: { id: true },
    });

    if (byName) return byName.id;
  }

  // 3. Create new vendor
  const vendor = await prisma.vendor.create({
    data: {
      tenantId,
      name,
      uid: uid || undefined,
      address: address ? (address as Prisma.InputJsonValue) : undefined,
      email: email || undefined,
      iban: iban || undefined,
      viesName: viesInfo?.registeredName || undefined,
      viesAddress: viesInfo?.registeredAddress || undefined,
      viesCheckedAt: viesInfo?.checked ? new Date() : undefined,
    },
  });

  return vendor.id;
}

/**
 * List all vendors for a tenant with invoice counts.
 */
export async function listVendors(
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

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: {
        _count: { select: { invoices: true } },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.vendor.count({ where }),
  ]);

  return {
    vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      uid: v.uid,
      address: v.address,
      email: v.email,
      phone: v.phone,
      iban: v.iban,
      website: v.website,
      trustLevel: v.trustLevel,
      viesName: v.viesName,
      viesCheckedAt: v.viesCheckedAt?.toISOString() || null,
      isActive: v.isActive,
      invoiceCount: v._count.invoices,
      createdAt: v.createdAt.toISOString(),
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
 * Get vendor detail with recent invoices.
 */
export async function getVendorDetail(tenantId: string, vendorId: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
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

  if (!vendor) return null;

  return {
    id: vendor.id,
    name: vendor.name,
    uid: vendor.uid,
    address: vendor.address,
    email: vendor.email,
    phone: vendor.phone,
    iban: vendor.iban,
    bic: vendor.bic,
    website: vendor.website,
    notes: vendor.notes,
    trustLevel: vendor.trustLevel,
    viesName: vendor.viesName,
    viesAddress: vendor.viesAddress,
    viesCheckedAt: vendor.viesCheckedAt?.toISOString() || null,
    isActive: vendor.isActive,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
    invoices: vendor.invoices.map((inv) => ({
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
 * Update vendor details.
 */
export async function updateVendor(
  tenantId: string,
  vendorId: string,
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
    trustLevel?: 'NEW' | 'VERIFIED' | 'TRUSTED';
  },
) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId },
    select: { id: true },
  });

  if (!vendor) return null;

  // Prisma JSON fields need special null handling
  const updateData: Prisma.VendorUpdateInput = {
    ...data,
    address: data.address === null
      ? Prisma.JsonNull
      : data.address
        ? (data.address as Prisma.InputJsonValue)
        : undefined,
  };
  return prisma.vendor.update({
    where: { id: vendorId },
    data: updateData,
  });
}
