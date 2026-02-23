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

export const invoiceQueue = new Queue('invoice-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }, // 2s → 4s → 8s
    removeOnComplete: 100, // keep last 100 completed jobs for debugging
    removeOnFail: 200,
  },
});

export function createInvoiceWorker(
  processor: (job: import('bullmq').Job) => Promise<void>,
): Worker {
  const worker = new Worker('invoice-processing', processor, {
    connection,
    concurrency: 3,
    lockDuration: 120_000, // 2 min — OpenAI Vision can take 30-60s
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} (invoice ${job.data.invoiceId}) abgeschlossen`);
  });

  worker.on('failed', (job, err) => {
    const attempt = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;
    if (attempt < maxAttempts) {
      console.warn(`Job ${job?.id} fehlgeschlagen (Versuch ${attempt}/${maxAttempts}, Retry):`, err.message);
    } else {
      console.error(`Job ${job?.id} endgültig fehlgeschlagen nach ${attempt} Versuchen:`, err.message);
    }
  });

  return worker;
}

/** Expose connection for health checks */
export { connection as redisConnection };
