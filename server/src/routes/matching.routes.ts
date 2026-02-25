import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';
import { manualMatchingSchema, updatePaymentDifferenceSchema, createTransactionBookingSchema } from '@buchungsai/shared';
import { validateBody } from '../middleware/validate.js';
import * as matchingService from '../services/matching.service.js';
import * as transactionBookingService from '../services/transactionBooking.service.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/matchings/monthly — Monatsabstimmung
router.get('/monthly', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const month = req.query.month as string | undefined;

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'month muss Format YYYY-MM haben' },
      });
      return;
    }

    const data = await matchingService.getMonthlyReconciliation(tenantId, month);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/matchings
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { skip, take } = getSkipTake(page, limit);

    const where: Record<string, unknown> = { tenantId };

    if (req.query.status) where.status = req.query.status;
    if (req.query.matchType) where.matchType = req.query.matchType;

    const [matchings, total] = await Promise.all([
      prisma.matching.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              originalFileName: true,
              vendorName: true,
              invoiceNumber: true,
              invoiceDate: true,
              grossAmount: true,
              currency: true,
              processingStatus: true,
              validationStatus: true,
              isLocked: true,
              createdAt: true,
            },
          },
          transaction: {
            select: {
              id: true,
              transactionDate: true,
              amount: true,
              currency: true,
              counterpartName: true,
              reference: true,
              bookingText: true,
              isMatched: true,
            },
          },
          paymentDifference: true,
        },
      }),
      prisma.matching.count({ where }),
    ]);

    res.json({
      success: true,
      data: matchings,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/matchings/run — Trigger matching algorithm
router.post('/run', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const statementId = req.body.statementId as string | undefined;

    const result = await matchingService.runMatching(tenantId, userId, statementId);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/matchings — Create manual matching
router.post('/', validateBody(manualMatchingSchema), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { invoiceId, transactionId } = req.body;

    const matching = await matchingService.createManualMatching(tenantId, userId, invoiceId, transactionId);

    res.status(201).json({ success: true, data: matching });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/matchings/:id/confirm
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const matching = await matchingService.confirmMatching(tenantId, userId, req.params.id);

    res.json({ success: true, data: matching });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/matchings/:id/reject
router.post('/:id/reject', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    const matching = await matchingService.rejectMatching(tenantId, userId, req.params.id);

    res.json({ success: true, data: matching });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/matchings/:id/difference — Update payment difference reason
router.put('/:id/difference', validateBody(updatePaymentDifferenceSchema), async (req, res, next) => {
  try {
    const result = await matchingService.updatePaymentDifference(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
      req.body,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/matchings/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    await matchingService.deleteMatching(tenantId, userId, req.params.id);

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Transaction Bookings (Privatentnahme / Privateinlage)
// ============================================================

// POST /api/v1/matchings/bookings — Create private withdrawal/deposit
router.post('/bookings', validateBody(createTransactionBookingSchema), async (req, res, next) => {
  try {
    const booking = await transactionBookingService.createTransactionBooking(
      req.tenantId!,
      req.userId!,
      req.body,
    );
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/matchings/bookings — List all transaction bookings
router.get('/bookings', async (req, res, next) => {
  try {
    const bookings = await transactionBookingService.listTransactionBookings(req.tenantId!);
    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/matchings/bookings/:id — Delete a transaction booking
router.delete('/bookings/:id', async (req, res, next) => {
  try {
    await transactionBookingService.deleteTransactionBooking(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
    );
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

export { router as matchingRoutes };
