import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Demo Tenant erstellen
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-gmbh' },
    update: {},
    create: {
      name: 'Demo GmbH',
      slug: 'demo-gmbh',
      uidNumber: 'ATU12345678',
      address: {
        street: 'Musterstraße 1',
        zip: '1010',
        city: 'Wien',
        country: 'AT',
      },
    },
  });

  console.log(`Tenant erstellt: ${tenant.name} (${tenant.id})`);

  // Admin User
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.at' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.at',
      passwordHash: adminPassword,
      firstName: 'Max',
      lastName: 'Mustermann',
      role: 'ADMIN',
    },
  });

  console.log(`Admin erstellt: ${admin.email}`);

  // Buchhalter User
  const accountantPassword = await bcrypt.hash('Buchhalter123!', 12);
  const accountant = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'buchhalter@demo.at' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'buchhalter@demo.at',
      passwordHash: accountantPassword,
      firstName: 'Anna',
      lastName: 'Buchhalterin',
      role: 'ACCOUNTANT',
    },
  });

  console.log(`Buchhalter erstellt: ${accountant.email}`);

  // Steuerberater User
  const advisorPassword = await bcrypt.hash('Steuerberater123!', 12);
  const advisor = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'steuerberater@demo.at' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'steuerberater@demo.at',
      passwordHash: advisorPassword,
      firstName: 'Peter',
      lastName: 'Steuerberater',
      role: 'TAX_ADVISOR',
    },
  });

  console.log(`Steuerberater erstellt: ${advisor.email}`);

  // BMD Export-Konfiguration
  await prisma.exportConfig.upsert({
    where: { id: 'bmd-default' },
    update: {},
    create: {
      id: 'bmd-default',
      tenantId: tenant.id,
      name: 'BMD Standard-Export',
      format: 'BMD_CSV',
      columnMapping: {
        satzart: 0,
        buchungsdatum: 1,
        belegnummer: 2,
        buchungstext: 3,
        betrag: 4,
        sollkonto: 5,
        habenkonto: 6,
        steuersatz: 7,
        uidNummer: 8,
        belegdatum: 9,
      },
      delimiter: ';',
      dateFormat: 'dd.MM.yyyy',
      decimalSeparator: ',',
      encoding: 'ISO-8859-1',
      includeHeader: true,
      isDefault: true,
    },
  });

  console.log('BMD Export-Konfiguration erstellt');

  console.log('\n--- Seed abgeschlossen ---');
  console.log('Demo-Logins:');
  console.log('  Admin:         admin@demo.at / Admin123!');
  console.log('  Buchhalter:    buchhalter@demo.at / Buchhalter123!');
  console.log('  Steuerberater: steuerberater@demo.at / Steuerberater123!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
