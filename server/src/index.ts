import 'dotenv/config';
import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';

async function main() {
  // Datenbank-Verbindung testen
  try {
    await prisma.$connect();
    console.log('Datenbank verbunden');
  } catch (error) {
    console.error('Datenbank-Verbindung fehlgeschlagen:', error);
    process.exit(1);
  }

  // Server starten
  app.listen(env.PORT, () => {
    console.log(`\n🚀 BuchungsAI Server läuft auf http://localhost:${env.PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Health:      http://localhost:${env.PORT}/api/v1/health\n`);
  });
}

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('\nServer wird heruntergefahren...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

main().catch((error) => {
  console.error('Server-Start fehlgeschlagen:', error);
  process.exit(1);
});
