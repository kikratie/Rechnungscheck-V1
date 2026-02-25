import { Queue, Worker } from 'bullmq';
import { redisConnection } from './queue.js';

export const emailSyncQueue = new Queue('email-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1, // Kein Retry — nächster Poll wird ohnehin erneut versuchen
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export function createEmailSyncWorker(
  processor: (job: import('bullmq').Job) => Promise<void>,
): Worker {
  const worker = new Worker('email-sync', processor, {
    connection: redisConnection,
    concurrency: 2, // Max 2 IMAP-Verbindungen gleichzeitig
    lockDuration: 300_000, // 5 Min — IMAP kann langsam sein
  });

  worker.on('completed', (job) => {
    console.log(`[EmailSync] Job ${job.id} abgeschlossen`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[EmailSync] Job ${job?.id} fehlgeschlagen:`, err.message);
  });

  return worker;
}
