import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { validateBody } from '../middleware/validate.js';
import { invoiceUpload } from '../middleware/upload.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';
import { updateExtractedDataSchema, rejectInvoiceSchema, createErsatzbelegSchema, batchApproveSchema } from '@buchungsai/shared';
import * as invoiceService from '../services/invoice.service.js';

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

    if (req.query.processingStatus) where.processingStatus = req.query.processingStatus;
    if (req.query.validationStatus) where.validationStatus = req.query.validationStatus;
    if (req.query.vendorName) where.vendorName = { contains: req.query.vendorName, mode: 'insensitive' };
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
      'belegNr', 'vendorName', 'invoiceNumber', 'invoiceDate',
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
          documentType: true,
          originalFileName: true,
          vendorName: true,
          invoiceNumber: true,
          invoiceDate: true,
          grossAmount: true,
          currency: true,
          processingStatus: true,
          validationStatus: true,
          isLocked: true,
          vendorId: true,
          replacedByInvoiceId: true,
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

// GET /api/v1/invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id as string, tenantId },
      include: {
        lineItems: { orderBy: { position: 'asc' } },
        vendor: { select: { id: true, name: true, uid: true } },
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

// POST /api/v1/invoices — Upload
router.post('/', invoiceUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(422).json({ success: false, error: { code: 'NO_FILE', message: 'Keine Datei hochgeladen' } });
      return;
    }

    const invoice = await invoiceService.uploadInvoice({
      tenantId: req.tenantId!,
      userId: req.userId!,
      file: req.file,
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/invoices/:id — Manual correction
router.put('/:id', validateBody(updateExtractedDataSchema), async (req, res, next) => {
  try {
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
router.post('/:id/approve', async (req, res, next) => {
  try {
    const invoice = await invoiceService.approveInvoice(
      req.tenantId!,
      req.userId!,
      req.params.id as string,
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
router.get('/:id/download', async (req, res, next) => {
  try {
    const url = await invoiceService.getInvoiceDownloadUrl(
      req.tenantId!,
      req.params.id as string,
    );
    res.json({ success: true, data: { url } });
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
    );
    res.json({ success: true, data: result });
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

export { router as invoiceRoutes };
