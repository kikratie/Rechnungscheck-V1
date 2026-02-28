/**
 * Auto-Archive Job
 * Runs daily at 2:00 AM — archives all APPROVED invoices older than the configured threshold.
 * Each tenant can have their own auto-archive setting (default: disabled).
 */

import { Queue, Worker } from 'bullmq';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

const connection = parseRedisUrl(env.REDIS_URL);

export const autoArchiveQueue = new Queue('auto-archive', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: 10,
    removeOnFail: 20,
  },
});

// Default: auto-archive APPROVED invoices after 7 days
const DEFAULT_AUTO_ARCHIVE_DAYS = 7;

async function processAutoArchive() {
  console.log('[AutoArchive] Starting auto-archive scan...');

  // Find tenants with auto-archive enabled (stored in tenant settings)
  // For now, we auto-archive for ALL tenants with APPROVED invoices older than threshold
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - DEFAULT_AUTO_ARCHIVE_DAYS);

  const approvedInvoices = await prisma.invoice.findMany({
    where: {
      processingStatus: 'APPROVED',
      updatedAt: { lt: threshold },
    },
    select: {
      id: true,
      tenantId: true,
    },
    take: 50, // Process in batches
  });

  if (approvedInvoices.length === 0) {
    console.log('[AutoArchive] No invoices to auto-archive.');
    return;
  }

  console.log(`[AutoArchive] Found ${approvedInvoices.length} invoices to archive.`);

  // Import archive function lazily to avoid circular dependencies
  const { archiveInvoice } = await import('../services/archival.service.js');

  let archived = 0;
  let failed = 0;

  for (const invoice of approvedInvoices) {
    try {
      await archiveInvoice(invoice.tenantId, 'SYSTEM', invoice.id);
      archived++;
    } catch (err) {
      failed++;
      console.error(`[AutoArchive] Failed to archive ${invoice.id}:`, (err as Error).message);
    }
  }

  console.log(`[AutoArchive] Done. Archived: ${archived}, Failed: ${failed}`);
}

export function createAutoArchiveWorker(): Worker {
  const worker = new Worker('auto-archive', async () => {
    await processAutoArchive();
  }, {
    connection,
    concurrency: 1,
  });

  worker.on('failed', (_job, err) => {
    console.error('[AutoArchive] Job failed:', err.message);
  });

  return worker;
}

export async function scheduleAutoArchive() {
  // Run daily at 2:00 AM
  await autoArchiveQueue.upsertJobScheduler(
    'daily-auto-archive',
    { pattern: '0 2 * * *' }, // cron: daily at 02:00
    { name: 'auto-archive' },
  );
  console.log('[AutoArchive] Scheduled daily at 02:00');
}
