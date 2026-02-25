import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database.js';
import { writeAuditLog } from '../middleware/auditLogger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// ============================================================
// Transaction Bookings (Privatentnahme / Privateinlage)
// ============================================================

/**
 * Create a TransactionBooking for a bank transaction (e.g. private withdrawal/deposit).
 * Marks the transaction as matched within a single DB transaction.
 */
export async function createTransactionBooking(
  tenantId: string,
  userId: string,
  data: {
    transactionId: string;
    bookingType: 'PRIVATE_WITHDRAWAL' | 'PRIVATE_DEPOSIT';
    notes?: string | null;
  },
) {
  // 1. Verify transaction belongs to tenant (via bankStatement.tenantId)
  const transaction = await prisma.bankTransaction.findFirst({
    where: { id: data.transactionId, bankStatement: { tenantId } },
    include: { booking: { select: { id: true } } },
  });
  if (!transaction) throw new NotFoundError('Transaktion', data.transactionId);

  // 2. Check transaction is not already matched or has an existing booking
  if (transaction.isMatched) {
    throw new ConflictError('Diese Transaktion ist bereits zugeordnet');
  }
  if (transaction.booking) {
    throw new ConflictError('Diese Transaktion hat bereits eine Buchung');
  }

  // 3. Determine account number
  const accountNumber = data.bookingType === 'PRIVATE_WITHDRAWAL' ? '9600' : '9610';

  // 4. Create booking + mark transaction as matched atomically
  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.transactionBooking.create({
      data: {
        tenantId,
        transactionId: data.transactionId,
        bookingType: data.bookingType,
        accountNumber,
        amount: Math.abs(new Decimal(transaction.amount).toNumber()),
        notes: data.notes ?? null,
        confirmedByUserId: userId,
        confirmedAt: new Date(),
      },
    });

    await tx.bankTransaction.update({
      where: { id: data.transactionId },
      data: { isMatched: true },
    });

    return created;
  });

  // 5. Audit log (fire-and-forget)
  writeAuditLog({
    tenantId,
    userId,
    entityType: 'TransactionBooking',
    entityId: booking.id,
    action: 'TRANSACTION_BOOKING_CREATED',
    newData: {
      transactionId: data.transactionId,
      bookingType: data.bookingType,
      accountNumber,
      amount: booking.amount.toString(),
    },
  });

  return booking;
}

/**
 * Delete a TransactionBooking and unmark the associated transaction.
 */
export async function deleteTransactionBooking(
  tenantId: string,
  userId: string,
  bookingId: string,
) {
  // 1. Find booking and verify it belongs to tenant
  const booking = await prisma.transactionBooking.findFirst({
    where: { id: bookingId, tenantId },
  });
  if (!booking) throw new NotFoundError('TransactionBooking', bookingId);

  // 2. Delete booking + reset isMatched atomically
  await prisma.$transaction(async (tx) => {
    await tx.transactionBooking.delete({ where: { id: bookingId } });
    await tx.bankTransaction.update({
      where: { id: booking.transactionId },
      data: { isMatched: false },
    });
  });

  // 3. Audit log (fire-and-forget)
  writeAuditLog({
    tenantId,
    userId,
    entityType: 'TransactionBooking',
    entityId: bookingId,
    action: 'TRANSACTION_BOOKING_DELETED',
    previousData: {
      transactionId: booking.transactionId,
      bookingType: booking.bookingType,
      accountNumber: booking.accountNumber,
      amount: booking.amount.toString(),
    },
  });
}

/**
 * List all TransactionBookings for a tenant, ordered by confirmedAt desc.
 */
export async function listTransactionBookings(tenantId: string) {
  return prisma.transactionBooking.findMany({
    where: { tenantId },
    include: {
      transaction: {
        select: {
          id: true,
          transactionDate: true,
          valueDate: true,
          amount: true,
          currency: true,
          counterpartName: true,
          counterpartIban: true,
          reference: true,
          bookingText: true,
        },
      },
    },
    orderBy: { confirmedAt: 'desc' },
  });
}
