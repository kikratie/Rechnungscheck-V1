import 'dotenv/config';
import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { ensureBucket } from './services/storage.service.js';
import { createInvoiceWorker } from './jobs/queue.js';
import { createEmailSyncWorker } from './jobs/emailSyncQueue.js';
import { processInvoiceJob } from './jobs/invoiceProcessor.job.js';
import { syncEmailConnector } from './services/emailSync.service.js';
import { registerAllActiveConnectors } from './services/emailConnector.service.js';
import { archiveInvoice } from './services/archival.service.js';

/**
 * Pre-flight checks: verify OCR dependencies are functional before accepting work.
 * Failures log warnings but don't prevent server start (manual workflows still work).
 */
async function runPreflightChecks() {
  const results: Record<string, 'ok' | 'warn' | 'fail'> = {};

  // pdf-parse: verify import + basic API works
  try {
    // @ts-expect-error pdf-parse v2 ESM types not resolved
    const { PDFParse } = await import('pdf-parse');
    if (typeof PDFParse !== 'function') throw new Error('PDFParse is not a constructor');
    results['pdf-parse'] = 'ok';
  } catch (err) {
    results['pdf-parse'] = 'fail';
    console.error('[PREFLIGHT] pdf-parse FEHLER:', (err as Error).message);
  }

  // mupdf: verify WASM module loads
  try {
    const mupdf = await import('mupdf');
    if (!mupdf.Document) throw new Error('mupdf.Document not available');
    results['mupdf'] = 'ok';
  } catch (err) {
    results['mupdf'] = 'fail';
    console.error('[PREFLIGHT] mupdf FEHLER:', (err as Error).message);
  }

  // sharp: verify native bindings
  try {
    const sharp = (await import('sharp')).default;
    await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer();
    results['sharp'] = 'ok';
  } catch (err) {
    results['sharp'] = 'fail';
    console.error('[PREFLIGHT] sharp FEHLER:', (err as Error).message);
  }

  // OpenAI API key
  if (env.OPENAI_API_KEY) {
    results['openai-key'] = 'ok';
  } else {
    results['openai-key'] = 'warn';
    console.warn('[PREFLIGHT] OPENAI_API_KEY nicht gesetzt — KI-Extraktion deaktiviert');
  }

  // Summary
  const failCount = Object.values(results).filter(v => v === 'fail').length;
  const warnCount = Object.values(results).filter(v => v === 'warn').length;
  const status = failCount > 0 ? 'DEGRADED' : warnCount > 0 ? 'WARNUNG' : 'OK';
  console.log(`[PREFLIGHT] Status: ${status}`, results);
}

/**
 * Verify database schema is consistent: no pending or failed migrations.
 * Prevents running code against a mismatched database schema.
 */
async function checkMigrationStatus() {
  try {
    const result = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
      ORDER BY started_at DESC
    `;

    if (result.length > 0) {
      console.error('[SCHEMA] WARNUNG: Inkonsistente Migrationen gefunden:');
      for (const row of result) {
        const status = row.rolled_back_at ? 'ROLLED BACK' : 'NICHT ABGESCHLOSSEN';
        console.error(`  - ${row.migration_name}: ${status}`);
      }
      console.error('[SCHEMA] Bitte "npx prisma migrate deploy" ausführen!');
      // Don't exit — allow the app to start so the deploy pipeline can fix it
    } else {
      console.log('Datenbank-Schema konsistent (alle Migrationen angewandt)');
    }
  } catch {
    // _prisma_migrations table may not exist on first deploy — that's OK
    console.warn('[SCHEMA] Migration-Tabelle nicht lesbar (erster Start?)');
  }
}

async function main() {
  // Datenbank-Verbindung testen
  try {
    await prisma.$connect();
    console.log('Datenbank verbunden');
  } catch (error) {
    console.error('Datenbank-Verbindung fehlgeschlagen:', error);
    process.exit(1);
  }

  // Schema-Konsistenz prüfen
  await checkMigrationStatus();

  // S3/MinIO Bucket sicherstellen
  try {
    await ensureBucket();
    console.log('Storage-Bucket bereit');
  } catch (error) {
    console.warn('Storage-Bucket Warnung:', (error as Error).message);
  }

  // Pre-flight: OCR-Abhängigkeiten prüfen
  await runPreflightChecks();

  // BullMQ Worker starten (dispatches by job name)
  const worker = createInvoiceWorker(async (job) => {
    if (job.name === 'archive-invoice') {
      const { invoiceId, tenantId } = job.data;
      await archiveInvoice(tenantId, 'SYSTEM', invoiceId);
    } else {
      await processInvoiceJob(job);
    }
  });
  console.log('Invoice-Processing Worker gestartet');

  // Email-Sync Worker starten
  const emailSyncWorker = createEmailSyncWorker(async (job) => {
    if (job.name === 'sync-connector') {
      const { connectorId } = job.data;
      await syncEmailConnector(connectorId);
    }
  });
  console.log('Email-Sync Worker gestartet');

  // Aktive E-Mail-Connectors registrieren
  try {
    await registerAllActiveConnectors();
  } catch (err) {
    console.warn('[EmailSync] Fehler beim Registrieren der Connectors:', (err as Error).message);
  }

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
    await emailSyncWorker.close();
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
