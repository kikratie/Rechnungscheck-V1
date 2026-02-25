import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.routes.js';
import { tenantRoutes } from './routes/tenant.routes.js';
import { invoiceRoutes } from './routes/invoice.routes.js';
import { bankStatementRoutes } from './routes/bankStatement.routes.js';
import { matchingRoutes } from './routes/matching.routes.js';
import { exportRoutes } from './routes/export.routes.js';
import { auditLogRoutes } from './routes/auditLog.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import vendorRoutes from './routes/vendor.routes.js';
import customerRoutes from './routes/customer.routes.js';
import mailRoutes from './routes/mail.routes.js';
import { prisma } from './config/database.js';
import { invoiceQueue } from './jobs/queue.js';
import type { ApiResponse } from '@buchungsai/shared';

const app = express();

// Security
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// Rate Limiting — Upload-/Invoice-Endpoint großzügiger (1000/15min, da Multi-Upload + Polling)
const uploadLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX * 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Zu viele Anfragen. Bitte versuche es später erneut.',
    },
  },
});

// Rate Limiting — global (100/15min), skip routes that have their own limiter
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/v1/invoices'),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Zu viele Anfragen. Bitte versuche es später erneut.',
    },
  },
});

app.use('/api/v1/invoices', uploadLimiter);
app.use(globalLimiter);

// Body Parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health Check — prüft alle Abhängigkeiten
app.get('/api/v1/health', async (_req, res) => {
  const services: Record<string, 'ok' | 'error'> = {};

  // Database
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    services.db = 'ok';
  } catch { services.db = 'error'; }

  // Redis (BullMQ)
  try {
    const client = await invoiceQueue.client;
    const pong = await client.ping();
    services.redis = pong === 'PONG' ? 'ok' : 'error';
  } catch { services.redis = 'error'; }

  // LLM (key configured?)
  services.llm = env.OPENAI_API_KEY ? 'ok' : 'error';

  const hasErrors = Object.values(services).includes('error');
  const status = hasErrors ? 'degraded' : 'ok';

  res.status(hasErrors ? 503 : 200).json({
    success: true,
    data: { status, timestamp: new Date().toISOString(), services },
  });
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tenant', tenantRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/bank-statements', bankStatementRoutes);
app.use('/api/v1/matchings', matchingRoutes);
app.use('/api/v1/exports', exportRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/mail', mailRoutes);

// 404 Handler
app.use((_req, res) => {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpunkt nicht gefunden',
    },
  };
  res.status(404).json(response);
});

// Error Handler (muss als letztes stehen)
app.use(errorHandler);

export { app };
