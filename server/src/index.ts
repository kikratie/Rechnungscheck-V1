import 'dotenv/config';
import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { ensureBucket } from './services/storage.service.js';
import { createInvoiceWorker } from './jobs/queue.js';
import { processInvoiceJob } from './jobs/invoiceProcessor.job.js';

async function main() {
  // Datenbank-Verbindung testen
  try {
    await prisma.$connect();
    console.log('Datenbank verbunden');
  } catch (error) {
    console.error('Datenbank-Verbindung fehlgeschlagen:', error);
    process.exit(1);
  }

  // S3/MinIO Bucket sicherstellen
  try {
    await ensureBucket();
    console.log('Storage-Bucket bereit');
  } catch (error) {
    console.warn('Storage-Bucket Warnung:', (error as Error).message);
  }

  // BullMQ Worker starten
  const worker = createInvoiceWorker(processInvoiceJob);
  console.log('Invoice-Processing Worker gestartet');

  // Server starten
  app.listen(env.PORT, () => {
    console.log(`\nBuchungsAI Server läuft auf http://localhost:${env.PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Health:      http://localhost:${env.PORT}/api/v1/health\n`);
  });

  // Graceful Shutdown
  async function shutdown() {
    console.log('\nServer wird heruntergefahren...');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Server-Start fehlgeschlagen:', error);
  process.exit(1);
});
