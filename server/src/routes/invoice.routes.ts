import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { validateBody } from '../middleware/validate.js';
import { invoiceUpload } from '../middleware/upload.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';
import { updateExtractedDataSchema, approveInvoiceSchema, rejectInvoiceSchema, createErsatzbelegSchema, createEigenbelegSchema, batchApproveSchema, cancelNumberSchema, parkInvoiceSchema, cashPaymentSchema, requestCorrectionSchema, setRecurringSchema } from '@buchungsai/shared';
import * as invoiceService from '../services/invoice.service.js';
import * as recurringService from '../services/recurring.service.js';
import { cancelArchivalNumber } from '../services/archival.service.js';
import * as storageService from '../services/storage.service.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/invoices
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { skip, take } = getSkipTake(page, limit);

    const where: Record<string, unknown> = { tenantId };

    if (req.query.direction) where.direction = req.query.direction;
    if (req.query.processingStatus) {
      const statuses = (req.query.processingStatus as string).split(',');
      where.processingStatus = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (req.query.validationStatus) where.validationStatus = req.query.validationStatus;
    if (req.query.vendorName) where.vendorName = { contains: req.query.vendorName, mode: 'insensitive' };
    if (req.query.inboxCleared === 'true') where.inboxCleared = true;
    if (req.query.inboxCleared === 'false') where.inboxCleared = false;
    if (req.query.recurring === 'true') where.isRecurring = true;
    if (req.query.overdue === 'true') {
      where.dueDate = { lt: new Date() };
      if (!req.query.processingStatus) {
        where.processingStatus = { notIn: ['RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'ARCHIVED', 'EXPORTED', 'REJECTED', 'ERROR', 'REPLACED'] };
      }
    }
    if (req.query.search) {
      const searchTerm = req.query.search as string;
      const belegNrMatch = searchTerm.match(/^BEL-?(\d+)$/i);
      where.OR = [
        { vendorName: { contains: searchTerm, mode: 'insensitive' } },
        { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
        { originalFileName: { contains: searchTerm, mode: 'insensitive' } },
        ...(belegNrMatch ? [{ belegNr: parseInt(belegNrMatch[1]) }] : []),
      ];
    }

    const ALLOWED_SORT_COLUMNS = new Set([
      'belegNr', 'vendorName', 'invoiceNumber', 'invoiceDate', 'dueDate',
      'grossAmount', 'validationStatus', 'processingStatus', 'createdAt',
    ]);
    const requestedSort = req.query.sortBy as string;
    const sortBy = ALLOWED_SORT_COLUMNS.has(requestedSort) ? requestedSort : 'belegNr';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          belegNr: true,
          direction: true,
          documentType: true,
          originalFileName: true,
          vendorName: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          grossAmount: true,
          currency: true,
          estimatedEurGross: true,
          exchangeRate: true,
          exchangeRateDate: true,
          processingStatus: true,
          validationStatus: true,
          isLocked: true,
          vendorId: true,
          customerId: true,
          customerName: true,
          replacedByInvoiceId: true,
          archivalNumber: true,
          archivalPrefix: true,
          archivedAt: true,
          ingestionChannel: true,
          emailSender: true,
          isRecurring: true,
          recurringInterval: true,
          recurringGroupId: true,
          inboxCleared: true,
          recurringNote: true,
          createdAt: true,
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      success: true,
      data: invoices,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/invoices/recurring-summary — Recurring costs summary (Dashboard widget)
router.get('/recurring-summary', async (req, res, next) => {
  try {
    const summary = await recurringService.getRecurringCostsSummary(req.tenantId!);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id as string, tenantId },
      include: {
        lineItems: { orderBy: { position: 'asc' } },
        vendor: { select: { id: true, name: true, uid: true } },
        customer: { select: { id: true, name: true, uid: true } },
      },
    });

    if (!invoice) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rechnung nicht gefunden' } });
      return;
    }

    // Get latest extracted data
    const extractedData = await prisma.extractedData.findFirst({
      where: { invoiceId: invoice.id as string },
      orderBy: { version: 'desc' },
    });

    // Get latest validation result
    const validationResult = await prisma.validationResult.findFirst({
      where: { invoiceId: invoice.id as string },
      orderBy: { createdAt: 'desc' },
    });

    // If this invoice was replaced, get the Ersatzbeleg belegNr
    let replacedByBelegNr: number | null = null;
    if (invoice.replacedByInvoiceId) {
      const replacement = await prisma.invoice.findUnique({
        where: { id: invoice.replacedByInvoiceId },
        select: { belegNr: true },
      });
      replacedByBelegNr = replacement?.belegNr ?? null;
    }

    // If this is an Ersatzbeleg, get the original belegNr
    let replacesBelegNr: number | null = null;
    if (invoice.replacesInvoiceId) {
      const original = await prisma.invoice.findUnique({
        where: { id: invoice.replacesInvoiceId },
        select: { belegNr: true },
      });
      replacesBelegNr = original?.belegNr ?? null;
    }

    res.json({
      success: true,
      data: {
        ...invoice,
        replacedByBelegNr,
        replacesBelegNr,
        extractedData: extractedData || null,
        validationResult: validationResult
          ? {
              ...validationResult,
              checks: validationResult.checks,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/eigenbeleg — Create self-receipt (§132 BAO)
router.post('/eigenbeleg', validateBody(createEigenbelegSchema), async (req, res, next) => {
  try {
    const { transactionId, ...data } = req.body;
    const eigenbeleg = await invoiceService.createEigenbeleg({
      tenantId: req.tenantId!,
      userId: req.userId!,
      data,
      transactionId: transactionId || undefined,
    });
    res.status(201).json({ success: true, data: eigenbeleg });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices — Upload
router.post('/', invoiceUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(422).json({ success: false, error: { code: 'NO_FILE', message: 'Keine Datei hochgeladen' } });
      return;
    }

    // direction + inboxCleared kommen als FormData-Felder neben dem File
    const directionRaw = req.body.direction as string | undefined;
    const direction = directionRaw === 'OUTGOING' ? 'OUTGOING' as const : 'INCOMING' as const;
    const skipInbox = req.body.inboxCleared === 'true';

    const invoice = await invoiceService.uploadInvoice({
      tenantId: req.tenantId!,
      userId: req.userId!,
      file: req.file,
      direction,
    });

    // If uploaded from Check page, mark as already triaged
    if (skipInbox) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { inboxCleared: true, inboxClearedAt: new Date() },
      });
      invoice.inboxCleared = true;
    }

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/invoices/:id — Manual correction
router.put('/:id', validateBody(updateExtractedDataSchema), async (req, res, next) => {
  try {
    // Guard: archived invoices are immutable
    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId! },
      select: { isLocked: true },
    });
    if (existing?.isLocked) {
      res.status(409).json({
        success: false,
        error: { code: 'LOCKED', message: 'Archivierte Rechnung kann nicht bearbeitet werden' },
      });
      return;
    }

    const extractedData = await invoiceService.updateExtractedData({
      tenantId: req.tenantId!,
      userId: req.userId!,
      invoiceId: req.params.id as string,
      data: req.body,
      editReason: req.body.editReason as string | undefined,
    });

    res.json({ success: true, data: extractedData });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/approve
router.post('/:id/approve', validateBody(approveInvoiceSchema), async (req, res, next) => {
  try {
    const invoice = await invoiceService.approveInvoice(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
      req.body.comment as string | undefined,
    );
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/reject
router.post('/:id/reject', validateBody(rejectInvoiceSchema), async (req, res, next) => {
  try {
    const invoice = await invoiceService.rejectInvoice(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
      req.body.reason as string,
    );
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/park — Park invoice
router.post('/:id/park', validateBody(parkInvoiceSchema), async (req, res, next) => {
  try {
    const invoice = await invoiceService.parkInvoice(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
      req.body.reason as string,
    );
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/unpark — Resume parked invoice
router.post('/:id/unpark', async (req, res, next) => {
  try {
    const invoice = await invoiceService.unparkInvoice(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
    );
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/request-correction — Request corrected invoice from supplier
router.post('/:id/request-correction', validateBody(requestCorrectionSchema), async (req, res, next) => {
  try {
    const invoice = await invoiceService.requestCorrection(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
      req.body.note as string,
    );
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/ersatzbeleg — Create replacement receipt
router.post('/:id/ersatzbeleg', validateBody(createErsatzbelegSchema), async (req, res, next) => {
  try {
    const ersatzbeleg = await invoiceService.createErsatzbeleg({
      tenantId: req.tenantId!,
      userId: req.userId!,
      originalInvoiceId: req.params.id as string,
      reason: req.body.reason as string,
      data: req.body,
    });
    res.status(201).json({ success: true, data: ersatzbeleg });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/invoices/:id — Delete (only UPLOADED/ERROR)
router.delete('/:id', async (req, res, next) => {
  try {
    await invoiceService.deleteInvoice(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
    );
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/invoices/:id/download — Presigned URL
// ?original=true → returns the unarchived original; default returns archived (stamped) version if available
router.get('/:id/download', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId! },
      select: { storagePath: true, archivedStoragePath: true, archivedFileName: true },
    });
    if (!invoice) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rechnung nicht gefunden' } });
      return;
    }

    const wantOriginal = req.query.original === 'true';
    const path = (!wantOriginal && invoice.archivedStoragePath) ? invoice.archivedStoragePath : invoice.storagePath;
    const url = await storageService.getPresignedUrl(path);
    res.json({
      success: true,
      data: {
        url,
        fileName: (!wantOriginal && invoice.archivedFileName) ? invoice.archivedFileName : undefined,
        isArchived: !wantOriginal && !!invoice.archivedStoragePath,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/invoices/:id/versions — ExtractedData version history
router.get('/:id/versions', async (req, res, next) => {
  try {
    const versions = await invoiceService.getInvoiceVersions(
      req.tenantId!,
      req.params.id as string,
    );
    res.json({ success: true, data: versions });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/batch-approve — Approve multiple invoices at once
router.post('/batch-approve', validateBody(batchApproveSchema), async (req, res, next) => {
  try {
    const result = await invoiceService.batchApproveInvoices(
      req.tenantId!,
      req.userId!,
      req.body.invoiceIds as string[],
      req.body.comment as string | undefined,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/batch-triage — Triage multiple invoices (send to check)
router.post('/batch-triage', async (req, res, next) => {
  try {
    const ids = req.body.invoiceIds as string[];
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'invoiceIds required' } });
      return;
    }
    const result = await prisma.invoice.updateMany({
      where: {
        id: { in: ids },
        tenantId: req.tenantId!,
        processingStatus: { in: ['PROCESSED', 'REVIEW_REQUIRED', 'ERROR', 'PENDING_CORRECTION'] },
        inboxCleared: false,
      },
      data: { inboxCleared: true, inboxClearedAt: new Date() },
    });
    res.json({ success: true, data: { triaged: result.count } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/triage — Triage single invoice (send to check)
router.post('/:id/triage', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!invoice) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rechnung nicht gefunden' } });
      return;
    }
    const triageableStatuses = ['PROCESSED', 'REVIEW_REQUIRED', 'ERROR', 'PENDING_CORRECTION'];
    if (!triageableStatuses.includes(invoice.processingStatus)) {
      res.status(409).json({
        success: false,
        error: { code: 'NOT_READY', message: 'Beleg wurde noch nicht verarbeitet' },
      });
      return;
    }
    await prisma.invoice.update({
      where: { id: req.params.id },
      data: { inboxCleared: true, inboxClearedAt: new Date() },
    });
    res.json({ success: true, data: { id: req.params.id, inboxCleared: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/cancel-number — Storno einer Archivnummer
router.post('/:id/cancel-number', validateBody(cancelNumberSchema), async (req, res, next) => {
  try {
    const result = await cancelArchivalNumber(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
      req.body.reason as string,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/cash-payment — Mark invoice as cash-paid
router.post('/:id/cash-payment', validateBody(cashPaymentSchema), async (req, res, next) => {
  try {
    const invoice = await invoiceService.markCashPayment(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
      req.body.paymentDate as string,
    );
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/undo-cash-payment — Undo cash payment
router.post('/:id/undo-cash-payment', async (req, res, next) => {
  try {
    const invoice = await invoiceService.undoCashPayment(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
    );
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/revalidate-all — Re-validate all invoices with current rules
router.post('/revalidate-all', async (req, res, next) => {
  try {
    const result = await invoiceService.revalidateAll(req.tenantId!);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/invoices/:id/set-recurring — Mark/unmark invoice as recurring
router.post('/:id/set-recurring', validateBody(setRecurringSchema), async (req, res, next) => {
  try {
    const invoice = await recurringService.setRecurring({
      tenantId: req.tenantId!,
      invoiceId: req.params.id as string,
      isRecurring: req.body.isRecurring as boolean,
      recurringInterval: req.body.recurringInterval,
      recurringNote: req.body.recurringNote,
    });
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

export { router as invoiceRoutes };
