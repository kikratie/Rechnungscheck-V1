import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { prisma } from '../config/database.js';
import { getSkipTake, buildPaginationMeta } from '../utils/pagination.js';
import { bankStatementUpload } from '../middleware/upload.js';
import * as bankStatementService from '../services/bankStatement.service.js';
import { runMatching } from '../services/matching.service.js';

const router = Router();

router.use(authenticate, requireTenant);

// GET /api/v1/bank-statements
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const { skip, take } = getSkipTake(page, limit);

    const [statements, total] = await Promise.all([
      prisma.bankStatement.findMany({
        where: { tenantId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { transactions: true } },
        },
      }),
      prisma.bankStatement.count({ where: { tenantId } }),
    ]);

    const data = statements.map((s) => ({
      ...s,
      transactionCount: s._count.transactions,
      _count: undefined,
    }));

    res.json({
      success: true,
      data,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-statements/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const statement = await prisma.bankStatement.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        transactions: {
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    if (!statement) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Kontoauszug nicht gefunden' } });
      return;
    }

    res.json({ success: true, data: statement });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/bank-statements — Upload CSV
router.post('/', bankStatementUpload.single('file'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    if (!req.file) {
      res.status(422).json({ success: false, error: { code: 'NO_FILE', message: 'Keine Datei hochgeladen' } });
      return;
    }

    const bankAccountId = req.body.bankAccountId as string | undefined;

    const result = await bankStatementService.uploadAndParse(
      tenantId,
      userId,
      req.file,
      bankAccountId,
    );

    // Auto-run matching after import
    let matchingSuggestions = 0;
    try {
      const matchResult = await runMatching(tenantId, userId, result.statement.id);
      matchingSuggestions = matchResult.created;
    } catch {
      // Matching failure shouldn't fail the upload
    }

    const statement = await prisma.bankStatement.findUnique({
      where: { id: result.statement.id },
      include: { _count: { select: { transactions: true } } },
    });

    res.status(201).json({
      success: true,
      data: {
        statement: {
          ...statement,
          transactionCount: statement!._count.transactions,
          _count: undefined,
        },
        transactionsImported: result.transactionsImported,
        matchingSuggestions,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/bank-statements/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    await bankStatementService.deleteStatement(tenantId, userId, req.params.id);

    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

export { router as bankStatementRoutes };
