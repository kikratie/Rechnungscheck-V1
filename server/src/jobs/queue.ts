import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';

// Parse Redis URL for BullMQ connection
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

const connection = parseRedisUrl(env.REDIS_URL);

export const invoiceQueue = new Queue('invoice-processing', { connection });

export function createInvoiceWorker(
  processor: (job: import('bullmq').Job) => Promise<void>,
): Worker {
  const worker = new Worker('invoice-processing', processor, {
    connection,
    concurrency: 3,
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} (invoice ${job.data.invoiceId}) abgeschlossen`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} fehlgeschlagen:`, err.message);
  });

  return worker;
}
