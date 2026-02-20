import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Demo Tenant erstellen
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-gmbh' },
    update: {
      firmenbuchNr: 'FN 123456a',
      country: 'AT',
      phone: '+43 1 234 5678',
      email: 'office@demo-gmbh.at',
      onboardingComplete: true,
    },
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
      firmenbuchNr: 'FN 123456a',
      country: 'AT',
      phone: '+43 1 234 5678',
      email: 'office@demo-gmbh.at',
      onboardingComplete: true,
    },
  });

  console.log(`Tenant erstellt: ${tenant.name} (${tenant.id})`);

  // Bankkonten erstellen
  await prisma.bankAccount.deleteMany({ where: { tenantId: tenant.id } });
  const bankAccounts = await Promise.all([
    prisma.bankAccount.create({
      data: {
        tenantId: tenant.id,
        label: 'Geschäftskonto Erste Bank',
        accountType: 'CHECKING',
        iban: 'AT611904300234573201',
        bic: 'GIBAATWWXXX',
        bankName: 'Erste Bank',
        isPrimary: true,
      },
    }),
    prisma.bankAccount.create({
      data: {
        tenantId: tenant.id,
        label: 'Visa Business',
        accountType: 'CREDIT_CARD',
        cardLastFour: '4832',
        bankName: 'Erste Bank',
        isPrimary: false,
      },
    }),
  ]);

  console.log(`${bankAccounts.length} Bankkonten erstellt`);

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

  // ============================================================
  // RECHNUNGEN (Invoices) — verschiedene Status & Lieferanten
  // ============================================================

  const invoices = await Promise.all([
    // 1) Vollständig verarbeitet & gematcht — Büromaterial
    prisma.invoice.upsert({
      where: { id: 'inv-001' },
      update: {},
      create: {
        id: 'inv-001',
        tenantId: tenant.id,
        belegNr: 1,
        originalFileName: 'RE-2026-0042_Papyrus.pdf',
        storagePath: 'demo-gmbh/invoices/inv-001.pdf',
        storageHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        mimeType: 'application/pdf',
        fileSizeBytes: 245_000,
        vendorName: 'Papyrus Bürobedarf GmbH',
        vendorUid: 'ATU63456789',
        vendorAddress: { street: 'Mariahilfer Str. 45', zip: '1060', city: 'Wien', country: 'AT' },
        invoiceNumber: 'RE-2026-0042',
        invoiceDate: new Date('2026-01-15'),
        dueDate: new Date('2026-02-14'),
        netAmount: 420.00,
        vatAmount: 84.00,
        grossAmount: 504.00,
        vatRate: 20.00,
        accountNumber: '7600',
        category: 'Büromaterial',
        validationStatus: 'VALID',
        uidValidationStatus: 'VALID',
        uidValidationDate: new Date('2026-01-15'),
        processingStatus: 'APPROVED',
        aiConfidence: 0.9650,
        aiRawResponse: { model: 'gpt-4o', tokens: 1240 },
      },
    }),

    // 2) Verarbeitet, Review nötig — IT-Dienstleistung
    prisma.invoice.upsert({
      where: { id: 'inv-002' },
      update: {},
      create: {
        id: 'inv-002',
        tenantId: tenant.id,
        belegNr: 2,
        originalFileName: '2026-R-1187_WebAgentur.pdf',
        storagePath: 'demo-gmbh/invoices/inv-002.pdf',
        storageHash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
        mimeType: 'application/pdf',
        fileSizeBytes: 189_000,
        vendorName: 'WebAgentur Steiner KG',
        vendorUid: 'ATU74567890',
        vendorAddress: { street: 'Landstraßer Hauptstr. 12', zip: '1030', city: 'Wien', country: 'AT' },
        invoiceNumber: '2026-R-1187',
        invoiceDate: new Date('2026-01-22'),
        dueDate: new Date('2026-02-21'),
        netAmount: 3_200.00,
        vatAmount: 640.00,
        grossAmount: 3_840.00,
        vatRate: 20.00,
        accountNumber: '7770',
        category: 'IT-Dienstleistung',
        validationStatus: 'WARNING',
        validationDetails: [{ field: 'dueDate', message: 'Zahlungsziel kürzer als 30 Tage' }],
        uidValidationStatus: 'VALID',
        uidValidationDate: new Date('2026-01-22'),
        processingStatus: 'REVIEW_REQUIRED',
        aiConfidence: 0.8720,
        aiRawResponse: { model: 'gpt-4o', tokens: 1580 },
      },
    }),

    // 3) Gerade erst hochgeladen — Tankrechnung
    prisma.invoice.upsert({
      where: { id: 'inv-003' },
      update: {},
      create: {
        id: 'inv-003',
        tenantId: tenant.id,
        belegNr: 3,
        originalFileName: 'Tankrechnung_OMV_Feb.jpg',
        storagePath: 'demo-gmbh/invoices/inv-003.jpg',
        storageHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1_120_000,
        processingStatus: 'UPLOADED',
        validationStatus: 'PENDING',
      },
    }),

    // 4) Verarbeitet & exportiert — Miete
    prisma.invoice.upsert({
      where: { id: 'inv-004' },
      update: {},
      create: {
        id: 'inv-004',
        tenantId: tenant.id,
        belegNr: 4,
        originalFileName: 'Miete_Jänner_2026.pdf',
        storagePath: 'demo-gmbh/invoices/inv-004.pdf',
        storageHash: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
        mimeType: 'application/pdf',
        fileSizeBytes: 98_000,
        vendorName: 'Immo Verwaltung Hofer GmbH',
        vendorUid: 'ATU55667788',
        vendorAddress: { street: 'Kärntner Ring 22', zip: '1010', city: 'Wien', country: 'AT' },
        invoiceNumber: 'MV-2026-01',
        invoiceDate: new Date('2026-01-01'),
        dueDate: new Date('2026-01-05'),
        netAmount: 2_500.00,
        vatAmount: 500.00,
        grossAmount: 3_000.00,
        vatRate: 20.00,
        accountNumber: '7010',
        category: 'Miete',
        validationStatus: 'VALID',
        uidValidationStatus: 'VALID',
        uidValidationDate: new Date('2026-01-01'),
        processingStatus: 'EXPORTED',
        aiConfidence: 0.9890,
        aiRawResponse: { model: 'gpt-4o', tokens: 980 },
      },
    }),

    // 5) Fehler bei Verarbeitung — schlecht gescanntes Bild
    prisma.invoice.upsert({
      where: { id: 'inv-005' },
      update: {},
      create: {
        id: 'inv-005',
        tenantId: tenant.id,
        belegNr: 5,
        originalFileName: 'scan_unleserlich.pdf',
        storagePath: 'demo-gmbh/invoices/inv-005.pdf',
        storageHash: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        mimeType: 'application/pdf',
        fileSizeBytes: 3_400_000,
        processingStatus: 'ERROR',
        processingError: 'OCR konnte keinen Text extrahieren. Bitte besseren Scan hochladen.',
        validationStatus: 'INVALID',
      },
    }),

    // 6) UID ungültig — verdächtige Rechnung
    prisma.invoice.upsert({
      where: { id: 'inv-006' },
      update: {},
      create: {
        id: 'inv-006',
        tenantId: tenant.id,
        belegNr: 6,
        originalFileName: 'RE_2026_Consulting_XY.pdf',
        storagePath: 'demo-gmbh/invoices/inv-006.pdf',
        storageHash: 'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
        mimeType: 'application/pdf',
        fileSizeBytes: 156_000,
        vendorName: 'Consulting XY e.U.',
        vendorUid: 'ATU99999999',
        vendorAddress: { street: 'Favoritenstr. 100', zip: '1100', city: 'Wien', country: 'AT' },
        invoiceNumber: 'CXY-2026-003',
        invoiceDate: new Date('2026-02-01'),
        dueDate: new Date('2026-03-03'),
        netAmount: 8_500.00,
        vatAmount: 1_700.00,
        grossAmount: 10_200.00,
        vatRate: 20.00,
        accountNumber: '7790',
        category: 'Beratung',
        validationStatus: 'INVALID',
        validationDetails: [{ field: 'vendorUid', message: 'UID-Nummer beim VIES ungültig' }],
        uidValidationStatus: 'INVALID',
        uidValidationDate: new Date('2026-02-01'),
        processingStatus: 'REVIEW_REQUIRED',
        aiConfidence: 0.9410,
        aiRawResponse: { model: 'gpt-4o', tokens: 1320 },
      },
    }),

    // 7) Duplikat erkannt
    prisma.invoice.upsert({
      where: { id: 'inv-007' },
      update: {},
      create: {
        id: 'inv-007',
        tenantId: tenant.id,
        belegNr: 7,
        originalFileName: 'RE-2026-0042_Papyrus_kopie.pdf',
        storagePath: 'demo-gmbh/invoices/inv-007.pdf',
        storageHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        mimeType: 'application/pdf',
        fileSizeBytes: 245_100,
        vendorName: 'Papyrus Bürobedarf GmbH',
        vendorUid: 'ATU63456789',
        invoiceNumber: 'RE-2026-0042',
        invoiceDate: new Date('2026-01-15'),
        netAmount: 420.00,
        vatAmount: 84.00,
        grossAmount: 504.00,
        vatRate: 20.00,
        validationStatus: 'INVALID',
        validationDetails: [{ field: 'duplicate', message: 'Duplikat von RE-2026-0042' }],
        processingStatus: 'REVIEW_REQUIRED',
        isDuplicate: true,
        duplicateOfId: 'inv-001',
        aiConfidence: 0.9980,
      },
    }),

    // 8) 13% USt — Beherbergung
    prisma.invoice.upsert({
      where: { id: 'inv-008' },
      update: {},
      create: {
        id: 'inv-008',
        tenantId: tenant.id,
        belegNr: 8,
        originalFileName: 'Hotel_Sacher_Jän2026.pdf',
        storagePath: 'demo-gmbh/invoices/inv-008.pdf',
        storageHash: 'a8b8c8d8e8f8a8b8c8d8e8f8a8b8c8d8',
        mimeType: 'application/pdf',
        fileSizeBytes: 210_000,
        vendorName: 'Hotel Sacher Wien GmbH',
        vendorUid: 'ATU36789012',
        vendorAddress: { street: 'Philharmoniker Str. 4', zip: '1010', city: 'Wien', country: 'AT' },
        invoiceNumber: 'HS-2026-00412',
        invoiceDate: new Date('2026-01-28'),
        dueDate: new Date('2026-02-28'),
        netAmount: 354.00,
        vatAmount: 46.02,
        grossAmount: 400.02,
        vatRate: 13.00,
        accountNumber: '7660',
        category: 'Reisekosten',
        validationStatus: 'VALID',
        uidValidationStatus: 'VALID',
        uidValidationDate: new Date('2026-01-28'),
        processingStatus: 'APPROVED',
        aiConfidence: 0.9540,
        aiRawResponse: { model: 'gpt-4o', tokens: 1100 },
      },
    }),

    // 9) 10% USt — Lebensmittel/Bewirtung
    prisma.invoice.upsert({
      where: { id: 'inv-009' },
      update: {},
      create: {
        id: 'inv-009',
        tenantId: tenant.id,
        belegNr: 9,
        originalFileName: 'Metro_Bewirtung_Feb2026.pdf',
        storagePath: 'demo-gmbh/invoices/inv-009.pdf',
        storageHash: 'a9b9c9d9e9f9a9b9c9d9e9f9a9b9c9d9',
        mimeType: 'application/pdf',
        fileSizeBytes: 312_000,
        vendorName: 'METRO Cash & Carry Österreich GmbH',
        vendorUid: 'ATU45678901',
        vendorAddress: { street: 'Metro-Platz 1', zip: '1230', city: 'Wien', country: 'AT' },
        invoiceNumber: 'M-2026-887431',
        invoiceDate: new Date('2026-02-05'),
        dueDate: new Date('2026-02-19'),
        netAmount: 272.73,
        vatAmount: 27.27,
        grossAmount: 300.00,
        vatRate: 10.00,
        accountNumber: '7650',
        category: 'Bewirtung',
        validationStatus: 'VALID',
        uidValidationStatus: 'VALID',
        uidValidationDate: new Date('2026-02-05'),
        processingStatus: 'PROCESSED',
        aiConfidence: 0.9310,
        aiRawResponse: { model: 'gpt-4o', tokens: 1450 },
      },
    }),

    // 10) Hochgeladen, noch nicht verarbeitet (kein Dummy-PROCESSING mehr)
    prisma.invoice.upsert({
      where: { id: 'inv-010' },
      update: {},
      create: {
        id: 'inv-010',
        tenantId: tenant.id,
        belegNr: 10,
        originalFileName: 'A1_Telekom_Feb2026.pdf',
        storagePath: 'demo-gmbh/invoices/inv-010.pdf',
        storageHash: 'aab0c0d0e0f0a0b0c0d0e0f0a0b0c0d0',
        mimeType: 'application/pdf',
        fileSizeBytes: 178_000,
        processingStatus: 'ERROR',
        processingError: 'Testdaten — keine echte Datei vorhanden',
        validationStatus: 'PENDING',
      },
    }),
  ]);

  console.log(`${invoices.length} Rechnungen erstellt`);

  // ============================================================
  // EXTRACTED DATA (KI-Extraktionen für verarbeitete Rechnungen)
  // ============================================================

  const extractedDataRecords = await Promise.all([
    // inv-001: Papyrus Bürobedarf — vollständig
    prisma.extractedData.upsert({
      where: { invoiceId_version: { invoiceId: 'inv-001', version: 1 } },
      update: {},
      create: {
        invoiceId: 'inv-001', version: 1, source: 'AI', pipelineStage: 'TEXT_EXTRACTION',
        issuerName: 'Papyrus Bürobedarf GmbH', issuerUid: 'ATU63456789',
        issuerAddress: { street: 'Mariahilfer Str. 45', zip: '1060', city: 'Wien', country: 'AT' },
        issuerIban: 'AT88 3200 0000 1234 5678',
        recipientName: 'Demo GmbH', recipientUid: 'ATU12345678',
        invoiceNumber: 'RE-2026-0042', invoiceDate: new Date('2026-01-15'),
        deliveryDate: new Date('2026-01-14'), dueDate: new Date('2026-02-14'),
        description: 'Büromaterial: Kopierpapier, Druckerpatronen, Ordner',
        netAmount: 420.00, vatAmount: 84.00, grossAmount: 504.00, vatRate: 20.00,
        confidenceScores: { issuerName: 0.98, issuerUid: 0.97, invoiceNumber: 0.99, netAmount: 0.96, vatRate: 0.99 },
      },
    }),

    // inv-002: WebAgentur — Review nötig
    prisma.extractedData.upsert({
      where: { invoiceId_version: { invoiceId: 'inv-002', version: 1 } },
      update: {},
      create: {
        invoiceId: 'inv-002', version: 1, source: 'AI', pipelineStage: 'TEXT_EXTRACTION',
        issuerName: 'WebAgentur Steiner KG', issuerUid: 'ATU74567890',
        issuerAddress: { street: 'Landstraßer Hauptstr. 12', zip: '1030', city: 'Wien', country: 'AT' },
        recipientName: 'Demo GmbH',
        invoiceNumber: '2026-R-1187', invoiceDate: new Date('2026-01-22'),
        dueDate: new Date('2026-02-21'),
        description: 'Website-Redesign: Konzept, Wireframes, Frontend-Entwicklung, Hosting',
        netAmount: 3200.00, vatAmount: 640.00, grossAmount: 3840.00, vatRate: 20.00,
        confidenceScores: { issuerName: 0.95, invoiceNumber: 0.97, netAmount: 0.92, deliveryDate: 0.0 },
      },
    }),

    // inv-004: Miete — exportiert
    prisma.extractedData.upsert({
      where: { invoiceId_version: { invoiceId: 'inv-004', version: 1 } },
      update: {},
      create: {
        invoiceId: 'inv-004', version: 1, source: 'AI', pipelineStage: 'TEXT_EXTRACTION',
        issuerName: 'Immo Verwaltung Hofer GmbH', issuerUid: 'ATU55667788',
        issuerAddress: { street: 'Kärntner Ring 22', zip: '1010', city: 'Wien', country: 'AT' },
        recipientName: 'Demo GmbH', recipientUid: 'ATU12345678',
        invoiceNumber: 'MV-2026-01', invoiceDate: new Date('2026-01-01'),
        deliveryDate: new Date('2026-01-01'), dueDate: new Date('2026-01-05'),
        description: 'Büromiete Jänner 2026, 120m²',
        netAmount: 2500.00, vatAmount: 500.00, grossAmount: 3000.00, vatRate: 20.00,
        confidenceScores: { issuerName: 0.99, invoiceNumber: 0.99, netAmount: 0.99, vatRate: 0.99 },
      },
    }),

    // inv-006: Consulting XY — ungültige UID
    prisma.extractedData.upsert({
      where: { invoiceId_version: { invoiceId: 'inv-006', version: 1 } },
      update: {},
      create: {
        invoiceId: 'inv-006', version: 1, source: 'AI', pipelineStage: 'TEXT_EXTRACTION',
        issuerName: 'Consulting XY e.U.', issuerUid: 'ATU99999999',
        issuerAddress: { street: 'Favoritenstr. 100', zip: '1100', city: 'Wien', country: 'AT' },
        recipientName: 'Demo GmbH', recipientUid: 'ATU12345678',
        invoiceNumber: 'CXY-2026-003', invoiceDate: new Date('2026-02-01'),
        dueDate: new Date('2026-03-03'),
        description: 'Unternehmensberatung Jänner 2026',
        netAmount: 8500.00, vatAmount: 1700.00, grossAmount: 10200.00, vatRate: 20.00,
        confidenceScores: { issuerName: 0.97, issuerUid: 0.94, invoiceNumber: 0.98, netAmount: 0.96 },
      },
    }),

    // inv-008: Hotel Sacher — 13% USt
    prisma.extractedData.upsert({
      where: { invoiceId_version: { invoiceId: 'inv-008', version: 1 } },
      update: {},
      create: {
        invoiceId: 'inv-008', version: 1, source: 'AI', pipelineStage: 'TEXT_EXTRACTION',
        issuerName: 'Hotel Sacher Wien GmbH', issuerUid: 'ATU36789012',
        issuerAddress: { street: 'Philharmoniker Str. 4', zip: '1010', city: 'Wien', country: 'AT' },
        recipientName: 'Demo GmbH',
        invoiceNumber: 'HS-2026-00412', invoiceDate: new Date('2026-01-28'),
        deliveryDate: new Date('2026-01-28'), dueDate: new Date('2026-02-28'),
        description: 'Übernachtung Einzelzimmer, 2 Nächte',
        netAmount: 354.00, vatAmount: 46.02, grossAmount: 400.02, vatRate: 13.00,
        confidenceScores: { issuerName: 0.97, invoiceNumber: 0.95, netAmount: 0.94, vatRate: 0.96 },
      },
    }),

    // inv-009: Metro — 10% USt
    prisma.extractedData.upsert({
      where: { invoiceId_version: { invoiceId: 'inv-009', version: 1 } },
      update: {},
      create: {
        invoiceId: 'inv-009', version: 1, source: 'AI', pipelineStage: 'TEXT_EXTRACTION',
        issuerName: 'METRO Cash & Carry Österreich GmbH', issuerUid: 'ATU45678901',
        issuerAddress: { street: 'Metro-Platz 1', zip: '1230', city: 'Wien', country: 'AT' },
        invoiceNumber: 'M-2026-887431', invoiceDate: new Date('2026-02-05'),
        dueDate: new Date('2026-02-19'),
        description: 'Diverse Lebensmittel Kundenbewirtung',
        netAmount: 272.73, vatAmount: 27.27, grossAmount: 300.00, vatRate: 10.00,
        confidenceScores: { issuerName: 0.96, invoiceNumber: 0.93, netAmount: 0.95, vatRate: 0.97 },
      },
    }),
  ]);

  console.log(`${extractedDataRecords.length} ExtractedData Versionen erstellt`);

  // ============================================================
  // VALIDATION RESULTS
  // ============================================================

  const validationResults = await Promise.all([
    // inv-001: Alles grün
    prisma.validationResult.create({
      data: {
        invoiceId: 'inv-001', overallStatus: 'GREEN', amountClass: 'STANDARD',
        extractedDataVersion: 1,
        checks: [
          { rule: 'ISSUER_NAME', status: 'GREEN', message: 'Name des Ausstellers vorhanden: Papyrus Bürobedarf GmbH', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'ISSUER_ADDRESS', status: 'GREEN', message: 'Anschrift des Ausstellers vorhanden', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'ISSUER_UID', status: 'GREEN', message: 'UID-Nummer des Ausstellers vorhanden: ATU63456789', legalBasis: '§11 Abs 1 Z 2 UStG' },
          { rule: 'INVOICE_NUMBER', status: 'GREEN', message: 'Rechnungsnummer vorhanden: RE-2026-0042', legalBasis: '§11 Abs 1 Z 5 UStG' },
          { rule: 'INVOICE_DATE', status: 'GREEN', message: 'Ausstellungsdatum vorhanden', legalBasis: '§11 Abs 1 Z 4 UStG' },
          { rule: 'DELIVERY_DATE', status: 'GREEN', message: 'Liefer-/Leistungsdatum vorhanden', legalBasis: '§11 Abs 1 Z 4 UStG' },
          { rule: 'MATH_CHECK', status: 'GREEN', message: 'Netto (420) + USt (84) = Brutto (504) ✓', legalBasis: '§11 UStG' },
          { rule: 'VAT_RATE_VALID', status: 'GREEN', message: 'Steuersatz 20% ist gültig', legalBasis: '§10 UStG' },
          { rule: 'UID_SYNTAX', status: 'GREEN', message: 'UID-Syntax korrekt: ATU63456789', legalBasis: 'Art 28 MwStSystRL' },
          { rule: 'DUPLICATE_CHECK', status: 'GREEN', message: 'Kein Duplikat gefunden', legalBasis: 'Betriebsprüfung' },
        ],
      },
    }),

    // inv-002: Gelb — Lieferdatum fehlt
    prisma.validationResult.create({
      data: {
        invoiceId: 'inv-002', overallStatus: 'YELLOW', amountClass: 'STANDARD',
        extractedDataVersion: 1,
        checks: [
          { rule: 'ISSUER_NAME', status: 'GREEN', message: 'Name des Ausstellers vorhanden: WebAgentur Steiner KG', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'ISSUER_ADDRESS', status: 'GREEN', message: 'Anschrift des Ausstellers vorhanden', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'ISSUER_UID', status: 'GREEN', message: 'UID-Nummer vorhanden: ATU74567890', legalBasis: '§11 Abs 1 Z 2 UStG' },
          { rule: 'DELIVERY_DATE', status: 'YELLOW', message: 'Liefer-/Leistungsdatum fehlt — kann das Rechnungsdatum sein', legalBasis: '§11 Abs 1 Z 4 UStG' },
          { rule: 'MATH_CHECK', status: 'GREEN', message: 'Netto (3200) + USt (640) = Brutto (3840) ✓', legalBasis: '§11 UStG' },
          { rule: 'VAT_RATE_VALID', status: 'GREEN', message: 'Steuersatz 20% ist gültig', legalBasis: '§10 UStG' },
          { rule: 'DUPLICATE_CHECK', status: 'GREEN', message: 'Kein Duplikat gefunden', legalBasis: 'Betriebsprüfung' },
        ],
      },
    }),

    // inv-004: Alles grün (Miete)
    prisma.validationResult.create({
      data: {
        invoiceId: 'inv-004', overallStatus: 'GREEN', amountClass: 'STANDARD',
        extractedDataVersion: 1,
        checks: [
          { rule: 'ISSUER_NAME', status: 'GREEN', message: 'Name vorhanden: Immo Verwaltung Hofer GmbH', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'MATH_CHECK', status: 'GREEN', message: 'Netto (2500) + USt (500) = Brutto (3000) ✓', legalBasis: '§11 UStG' },
          { rule: 'VAT_RATE_VALID', status: 'GREEN', message: 'Steuersatz 20% ist gültig', legalBasis: '§10 UStG' },
          { rule: 'DUPLICATE_CHECK', status: 'GREEN', message: 'Kein Duplikat gefunden', legalBasis: 'Betriebsprüfung' },
        ],
      },
    }),

    // inv-006: Rot — UID ungültig + Großbetrag >10k ohne Empfänger-UID
    prisma.validationResult.create({
      data: {
        invoiceId: 'inv-006', overallStatus: 'RED', amountClass: 'LARGE',
        extractedDataVersion: 1,
        checks: [
          { rule: 'ISSUER_NAME', status: 'GREEN', message: 'Name vorhanden: Consulting XY e.U.', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'ISSUER_UID', status: 'GREEN', message: 'UID vorhanden: ATU99999999', legalBasis: '§11 Abs 1 Z 2 UStG' },
          { rule: 'RECIPIENT_UID', status: 'GREEN', message: 'Empfänger-UID vorhanden: ATU12345678', legalBasis: '§11 Abs 1 Z 3a UStG' },
          { rule: 'DELIVERY_DATE', status: 'YELLOW', message: 'Liefer-/Leistungsdatum fehlt', legalBasis: '§11 Abs 1 Z 4 UStG' },
          { rule: 'MATH_CHECK', status: 'GREEN', message: 'Netto (8500) + USt (1700) = Brutto (10200) ✓', legalBasis: '§11 UStG' },
          { rule: 'UID_SYNTAX', status: 'GREEN', message: 'UID-Syntax korrekt: ATU99999999', legalBasis: 'Art 28 MwStSystRL' },
          { rule: 'DUPLICATE_CHECK', status: 'GREEN', message: 'Kein Duplikat gefunden', legalBasis: 'Betriebsprüfung' },
        ],
        comments: 'UID ATU99999999 bei VIES als ungültig gemeldet',
      },
    }),

    // inv-008: Grün (Hotel 13%)
    prisma.validationResult.create({
      data: {
        invoiceId: 'inv-008', overallStatus: 'GREEN', amountClass: 'SMALL',
        extractedDataVersion: 1,
        checks: [
          { rule: 'ISSUER_NAME', status: 'GREEN', message: 'Name vorhanden: Hotel Sacher Wien GmbH', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'INVOICE_DATE', status: 'GREEN', message: 'Ausstellungsdatum vorhanden', legalBasis: '§11 Abs 1 Z 4 UStG' },
          { rule: 'MATH_CHECK', status: 'GREEN', message: 'Netto (354) + USt (46.02) = Brutto (400.02) ✓', legalBasis: '§11 UStG' },
          { rule: 'VAT_RATE_VALID', status: 'GREEN', message: 'Steuersatz 13% ist gültig', legalBasis: '§10 UStG' },
          { rule: 'DUPLICATE_CHECK', status: 'GREEN', message: 'Kein Duplikat gefunden', legalBasis: 'Betriebsprüfung' },
        ],
      },
    }),

    // inv-009: Gelb (Metro — kein Lieferdatum)
    prisma.validationResult.create({
      data: {
        invoiceId: 'inv-009', overallStatus: 'GREEN', amountClass: 'SMALL',
        extractedDataVersion: 1,
        checks: [
          { rule: 'ISSUER_NAME', status: 'GREEN', message: 'Name vorhanden: METRO Cash & Carry Österreich GmbH', legalBasis: '§11 Abs 1 Z 1 UStG' },
          { rule: 'INVOICE_DATE', status: 'GREEN', message: 'Ausstellungsdatum vorhanden', legalBasis: '§11 Abs 1 Z 4 UStG' },
          { rule: 'MATH_CHECK', status: 'GREEN', message: 'Netto (272.73) + USt (27.27) = Brutto (300) ✓', legalBasis: '§11 UStG' },
          { rule: 'VAT_RATE_VALID', status: 'GREEN', message: 'Steuersatz 10% ist gültig', legalBasis: '§10 UStG' },
          { rule: 'DUPLICATE_CHECK', status: 'GREEN', message: 'Kein Duplikat gefunden', legalBasis: 'Betriebsprüfung' },
        ],
      },
    }),
  ]);

  console.log(`${validationResults.length} ValidationResult Records erstellt`);

  // ============================================================
  // LIEFERANTEN (Vendors) — auto-erstellt aus Rechnungsdaten
  // ============================================================

  const vendors = await Promise.all([
    prisma.vendor.upsert({
      where: { tenantId_uid: { tenantId: tenant.id, uid: 'ATU63456789' } },
      update: {},
      create: {
        id: 'vendor-001', tenantId: tenant.id,
        name: 'Papyrus Bürobedarf GmbH', uid: 'ATU63456789',
        address: { street: 'Mariahilfer Str. 45', zip: '1060', city: 'Wien', country: 'AT' },
        iban: 'AT88 3200 0000 1234 5678',
        viesName: 'PAPYRUS BÜROBEDARF GMBH', viesCheckedAt: new Date('2026-01-15'),
      },
    }),
    prisma.vendor.upsert({
      where: { tenantId_uid: { tenantId: tenant.id, uid: 'ATU74567890' } },
      update: {},
      create: {
        id: 'vendor-002', tenantId: tenant.id,
        name: 'WebAgentur Steiner KG', uid: 'ATU74567890',
        address: { street: 'Landstraßer Hauptstr. 12', zip: '1030', city: 'Wien', country: 'AT' },
        email: 'office@webagentur-steiner.at', website: 'https://webagentur-steiner.at',
        viesName: 'WEBAGENTUR STEINER KG', viesCheckedAt: new Date('2026-01-22'),
      },
    }),
    prisma.vendor.upsert({
      where: { tenantId_uid: { tenantId: tenant.id, uid: 'ATU55667788' } },
      update: {},
      create: {
        id: 'vendor-003', tenantId: tenant.id,
        name: 'Immo Verwaltung Hofer GmbH', uid: 'ATU55667788',
        address: { street: 'Kärntner Ring 22', zip: '1010', city: 'Wien', country: 'AT' },
        phone: '+43 1 512 1234',
        viesName: 'IMMO VERWALTUNG HOFER GMBH', viesCheckedAt: new Date('2026-01-01'),
      },
    }),
    prisma.vendor.upsert({
      where: { tenantId_uid: { tenantId: tenant.id, uid: 'ATU99999999' } },
      update: {},
      create: {
        id: 'vendor-004', tenantId: tenant.id,
        name: 'Consulting XY e.U.', uid: 'ATU99999999',
        address: { street: 'Favoritenstr. 100', zip: '1100', city: 'Wien', country: 'AT' },
        // VIES invalid — no viesName
        viesCheckedAt: new Date('2026-02-01'),
      },
    }),
    prisma.vendor.upsert({
      where: { tenantId_uid: { tenantId: tenant.id, uid: 'ATU36789012' } },
      update: {},
      create: {
        id: 'vendor-005', tenantId: tenant.id,
        name: 'Hotel Sacher Wien GmbH', uid: 'ATU36789012',
        address: { street: 'Philharmoniker Str. 4', zip: '1010', city: 'Wien', country: 'AT' },
        email: 'reservierung@sacher.com', website: 'https://www.sacher.com',
        viesName: 'HOTEL SACHER WIEN GMBH', viesCheckedAt: new Date('2026-01-28'),
      },
    }),
    prisma.vendor.upsert({
      where: { tenantId_uid: { tenantId: tenant.id, uid: 'ATU45678901' } },
      update: {},
      create: {
        id: 'vendor-006', tenantId: tenant.id,
        name: 'METRO Cash & Carry Österreich GmbH', uid: 'ATU45678901',
        address: { street: 'Metro-Platz 1', zip: '1230', city: 'Wien', country: 'AT' },
        viesName: 'METRO CASH & CARRY ÖSTERREICH GMBH', viesCheckedAt: new Date('2026-02-05'),
      },
    }),
  ]);

  // Link invoices to vendors
  await Promise.all([
    prisma.invoice.update({ where: { id: 'inv-001' }, data: { vendorId: 'vendor-001' } }),
    prisma.invoice.update({ where: { id: 'inv-002' }, data: { vendorId: 'vendor-002' } }),
    prisma.invoice.update({ where: { id: 'inv-003' }, data: { vendorId: 'vendor-002' } }),
    prisma.invoice.update({ where: { id: 'inv-004' }, data: { vendorId: 'vendor-003' } }),
    prisma.invoice.update({ where: { id: 'inv-006' }, data: { vendorId: 'vendor-004' } }),
    prisma.invoice.update({ where: { id: 'inv-007' }, data: { vendorId: 'vendor-001' } }),
    prisma.invoice.update({ where: { id: 'inv-008' }, data: { vendorId: 'vendor-005' } }),
    prisma.invoice.update({ where: { id: 'inv-009' }, data: { vendorId: 'vendor-006' } }),
  ]);

  console.log(`${vendors.length} Lieferanten erstellt und mit Rechnungen verknüpft`);

  // ============================================================
  // RECHNUNGSPOSITIONEN (Line Items)
  // ============================================================

  const lineItems = await Promise.all([
    // Positionen für inv-001 (Büromaterial)
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-001-1' },
      update: {},
      create: { id: 'li-001-1', invoiceId: 'inv-001', position: 1, description: 'Kopierpapier A4, 80g, 5000 Blatt', quantity: 10, unit: 'Pkg', unitPrice: 24.90, netAmount: 249.00, vatRate: 20.00, vatAmount: 49.80, grossAmount: 298.80, accountNumber: '7600' },
    }),
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-001-2' },
      update: {},
      create: { id: 'li-001-2', invoiceId: 'inv-001', position: 2, description: 'Druckerpatronen HP 305XL Schwarz', quantity: 3, unit: 'Stk', unitPrice: 38.90, netAmount: 116.70, vatRate: 20.00, vatAmount: 23.34, grossAmount: 140.04, accountNumber: '7600' },
    }),
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-001-3' },
      update: {},
      create: { id: 'li-001-3', invoiceId: 'inv-001', position: 3, description: 'Ordner Leitz breit, 10er Pack', quantity: 2, unit: 'Pkg', unitPrice: 27.15, netAmount: 54.30, vatRate: 20.00, vatAmount: 10.86, grossAmount: 65.16, accountNumber: '7600' },
    }),

    // Positionen für inv-002 (IT-Dienstleistung)
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-002-1' },
      update: {},
      create: { id: 'li-002-1', invoiceId: 'inv-002', position: 1, description: 'Website-Redesign: Konzept & Wireframes', quantity: 16, unit: 'Std', unitPrice: 120.00, netAmount: 1_920.00, vatRate: 20.00, vatAmount: 384.00, grossAmount: 2_304.00, accountNumber: '7770' },
    }),
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-002-2' },
      update: {},
      create: { id: 'li-002-2', invoiceId: 'inv-002', position: 2, description: 'Frontend-Entwicklung: Umsetzung', quantity: 8, unit: 'Std', unitPrice: 135.00, netAmount: 1_080.00, vatRate: 20.00, vatAmount: 216.00, grossAmount: 1_296.00, accountNumber: '7770' },
    }),
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-002-3' },
      update: {},
      create: { id: 'li-002-3', invoiceId: 'inv-002', position: 3, description: 'Hosting-Pauschale Februar 2026', quantity: 1, unit: 'Pausch.', unitPrice: 200.00, netAmount: 200.00, vatRate: 20.00, vatAmount: 40.00, grossAmount: 240.00, accountNumber: '7770' },
    }),

    // Positionen für inv-004 (Miete)
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-004-1' },
      update: {},
      create: { id: 'li-004-1', invoiceId: 'inv-004', position: 1, description: 'Büromiete Jänner 2026, 120m²', quantity: 1, unit: 'Monat', unitPrice: 2_500.00, netAmount: 2_500.00, vatRate: 20.00, vatAmount: 500.00, grossAmount: 3_000.00, accountNumber: '7010' },
    }),

    // Positionen für inv-008 (Hotel)
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-008-1' },
      update: {},
      create: { id: 'li-008-1', invoiceId: 'inv-008', position: 1, description: 'Übernachtung Einzelzimmer, 2 Nächte', quantity: 2, unit: 'Nacht', unitPrice: 177.00, netAmount: 354.00, vatRate: 13.00, vatAmount: 46.02, grossAmount: 400.02, accountNumber: '7660' },
    }),

    // Positionen für inv-009 (Bewirtung)
    prisma.invoiceLineItem.upsert({
      where: { id: 'li-009-1' },
      update: {},
      create: { id: 'li-009-1', invoiceId: 'inv-009', position: 1, description: 'Diverse Lebensmittel Kundenbewirtung', quantity: 1, unit: 'Pausch.', unitPrice: 272.73, netAmount: 272.73, vatRate: 10.00, vatAmount: 27.27, grossAmount: 300.00, accountNumber: '7650' },
    }),
  ]);

  console.log(`${lineItems.length} Rechnungspositionen erstellt`);

  // ============================================================
  // KONTOAUSZÜGE (Bank Statements)
  // ============================================================

  const bankStatement = await prisma.bankStatement.upsert({
    where: { id: 'bs-001' },
    update: {},
    create: {
      id: 'bs-001',
      tenantId: tenant.id,
      originalFileName: 'Kontoauszug_Erste_Jän2026.csv',
      storagePath: 'demo-gmbh/bank/bs-001.csv',
      storageHash: 'ba1ba2ba3ba4ba5ba6ba7ba8ba9ba0ba1',
      fileFormat: 'CSV',
      bankName: 'Erste Bank',
      iban: 'AT61 1904 3002 3457 3201',
      bic: 'GIBAATWWXXX',
      statementDate: new Date('2026-01-31'),
      periodFrom: new Date('2026-01-01'),
      periodTo: new Date('2026-01-31'),
      openingBalance: 45_320.50,
      closingBalance: 37_476.50,
      processingStatus: 'PROCESSED',
    },
  });

  const bankStatement2 = await prisma.bankStatement.upsert({
    where: { id: 'bs-002' },
    update: {},
    create: {
      id: 'bs-002',
      tenantId: tenant.id,
      originalFileName: 'Kontoauszug_Erste_Feb2026.csv',
      storagePath: 'demo-gmbh/bank/bs-002.csv',
      storageHash: 'bb1bb2bb3bb4bb5bb6bb7bb8bb9bb0bb1',
      fileFormat: 'CSV',
      bankName: 'Erste Bank',
      iban: 'AT61 1904 3002 3457 3201',
      bic: 'GIBAATWWXXX',
      statementDate: new Date('2026-02-15'),
      periodFrom: new Date('2026-02-01'),
      periodTo: new Date('2026-02-15'),
      openingBalance: 37_476.50,
      closingBalance: 23_336.48,
      processingStatus: 'PROCESSED',
    },
  });

  console.log('2 Kontoauszüge erstellt');

  // ============================================================
  // BANKTRANSAKTIONEN
  // ============================================================

  const transactions = await Promise.all([
    // Jänner-Transaktionen (bs-001)
    prisma.bankTransaction.upsert({
      where: { id: 'bt-001' },
      update: {},
      create: { id: 'bt-001', bankStatementId: 'bs-001', transactionDate: new Date('2026-01-05'), valueDate: new Date('2026-01-05'), amount: -3_000.00, counterpartName: 'Immo Verwaltung Hofer GmbH', counterpartIban: 'AT44 2011 1822 3344 5566', reference: 'Miete Jänner 2026', bookingText: 'Überweisung', isMatched: true },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-002' },
      update: {},
      create: { id: 'bt-002', bankStatementId: 'bs-001', transactionDate: new Date('2026-01-16'), valueDate: new Date('2026-01-16'), amount: -504.00, counterpartName: 'Papyrus Bürobedarf GmbH', counterpartIban: 'AT88 3200 0000 1234 5678', reference: 'RE-2026-0042', bookingText: 'Überweisung', isMatched: true },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-003' },
      update: {},
      create: { id: 'bt-003', bankStatementId: 'bs-001', transactionDate: new Date('2026-01-20'), valueDate: new Date('2026-01-20'), amount: 12_500.00, counterpartName: 'Kunde Maier GmbH', counterpartIban: 'AT22 5200 0000 9876 5432', reference: 'AR-2026-0011 Zahlung', bookingText: 'Gutschrift' },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-004' },
      update: {},
      create: { id: 'bt-004', bankStatementId: 'bs-001', transactionDate: new Date('2026-01-25'), valueDate: new Date('2026-01-26'), amount: -85.00, counterpartName: 'OMV Tankstelle', reference: 'Kartenzahlung 24.01.', bookingText: 'Bankomat' },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-005' },
      update: {},
      create: { id: 'bt-005', bankStatementId: 'bs-001', transactionDate: new Date('2026-01-28'), valueDate: new Date('2026-01-28'), amount: -400.02, counterpartName: 'Hotel Sacher Wien GmbH', counterpartIban: 'AT77 6000 0000 7654 3210', reference: 'HS-2026-00412', bookingText: 'Überweisung', isMatched: true },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-006' },
      update: {},
      create: { id: 'bt-006', bankStatementId: 'bs-001', transactionDate: new Date('2026-01-30'), valueDate: new Date('2026-01-30'), amount: -4_354.98, counterpartName: 'Finanzamt Wien', counterpartIban: 'AT83 0100 0000 0553 4409', reference: 'UVA 12/2025', bookingText: 'Überweisung' },
    }),

    // Februar-Transaktionen (bs-002)
    prisma.bankTransaction.upsert({
      where: { id: 'bt-007' },
      update: {},
      create: { id: 'bt-007', bankStatementId: 'bs-002', transactionDate: new Date('2026-02-03'), valueDate: new Date('2026-02-03'), amount: -3_840.00, counterpartName: 'WebAgentur Steiner KG', counterpartIban: 'AT55 3600 0000 4321 8765', reference: '2026-R-1187', bookingText: 'Überweisung' },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-008' },
      update: {},
      create: { id: 'bt-008', bankStatementId: 'bs-002', transactionDate: new Date('2026-02-06'), valueDate: new Date('2026-02-06'), amount: -300.00, counterpartName: 'METRO Cash & Carry', counterpartIban: 'AT99 1200 0000 1111 2222', reference: 'M-2026-887431', bookingText: 'Überweisung' },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-009' },
      update: {},
      create: { id: 'bt-009', bankStatementId: 'bs-002', transactionDate: new Date('2026-02-10'), valueDate: new Date('2026-02-10'), amount: 18_000.00, counterpartName: 'Projektpartner Huber AG', counterpartIban: 'AT11 4300 0000 5555 6666', reference: 'Anzahlung Projekt Alpha', bookingText: 'Gutschrift' },
    }),
    prisma.bankTransaction.upsert({
      where: { id: 'bt-010' },
      update: {},
      create: { id: 'bt-010', bankStatementId: 'bs-002', transactionDate: new Date('2026-02-12'), valueDate: new Date('2026-02-13'), amount: -75.02, counterpartName: 'A1 Telekom Austria AG', counterpartIban: 'AT66 1100 0000 2233 4455', reference: 'Mobilfunk Feb 2026', bookingText: 'Einzugsermächtigung' },
    }),
  ]);

  console.log(`${transactions.length} Banktransaktionen erstellt`);

  // ============================================================
  // MATCHINGS (Rechnung ↔ Transaktion)
  // ============================================================

  const matchings = await Promise.all([
    // Miete — automatisch gematcht (exakter Betrag + Referenz)
    prisma.matching.upsert({
      where: { invoiceId_transactionId: { invoiceId: 'inv-004', transactionId: 'bt-001' } },
      update: {},
      create: {
        id: 'match-001',
        tenantId: tenant.id,
        invoiceId: 'inv-004',
        transactionId: 'bt-001',
        matchType: 'AUTO',
        confidence: 0.9950,
        matchReason: 'Exakter Betrag (€3.000,00) + Lieferantenname übereinstimmend',
        status: 'CONFIRMED',
        confirmedByUserId: admin.id,
        confirmedAt: new Date('2026-01-06'),
      },
    }),

    // Büromaterial — automatisch gematcht
    prisma.matching.upsert({
      where: { invoiceId_transactionId: { invoiceId: 'inv-001', transactionId: 'bt-002' } },
      update: {},
      create: {
        id: 'match-002',
        tenantId: tenant.id,
        invoiceId: 'inv-001',
        transactionId: 'bt-002',
        matchType: 'AUTO',
        confidence: 0.9870,
        matchReason: 'Exakter Betrag (€504,00) + Rechnungsnummer in Referenz',
        status: 'CONFIRMED',
        confirmedByUserId: accountant.id,
        confirmedAt: new Date('2026-01-17'),
      },
    }),

    // Hotel — AI-Vorschlag, bestätigt
    prisma.matching.upsert({
      where: { invoiceId_transactionId: { invoiceId: 'inv-008', transactionId: 'bt-005' } },
      update: {},
      create: {
        id: 'match-003',
        tenantId: tenant.id,
        invoiceId: 'inv-008',
        transactionId: 'bt-005',
        matchType: 'AI_SUGGESTED',
        confidence: 0.9210,
        matchReason: 'Betrag (€400,02) + Lieferantenname + Rechnungsnummer in Referenz',
        status: 'CONFIRMED',
        confirmedByUserId: accountant.id,
        confirmedAt: new Date('2026-01-29'),
      },
    }),

    // WebAgentur — AI-Vorschlag, noch offen
    prisma.matching.upsert({
      where: { invoiceId_transactionId: { invoiceId: 'inv-002', transactionId: 'bt-007' } },
      update: {},
      create: {
        id: 'match-004',
        tenantId: tenant.id,
        invoiceId: 'inv-002',
        transactionId: 'bt-007',
        matchType: 'AI_SUGGESTED',
        confidence: 0.8850,
        matchReason: 'Betrag (€3.840,00) + Rechnungsnummer in Referenz',
        status: 'SUGGESTED',
      },
    }),

    // Metro Bewirtung — AI-Vorschlag, noch offen
    prisma.matching.upsert({
      where: { invoiceId_transactionId: { invoiceId: 'inv-009', transactionId: 'bt-008' } },
      update: {},
      create: {
        id: 'match-005',
        tenantId: tenant.id,
        invoiceId: 'inv-009',
        transactionId: 'bt-008',
        matchType: 'AI_SUGGESTED',
        confidence: 0.9100,
        matchReason: 'Exakter Betrag (€300,00) + Rechnungsnummer in Referenz',
        status: 'SUGGESTED',
      },
    }),
  ]);

  console.log(`${matchings.length} Matchings erstellt`);

  // ============================================================
  // AUDIT-LOG Einträge
  // ============================================================

  await prisma.auditLog.createMany({
    data: [
      { tenantId: tenant.id, userId: admin.id, entityType: 'Invoice', entityId: 'inv-001', action: 'UPLOAD', metadata: { fileName: 'RE-2026-0042_Papyrus.pdf' }, createdAt: new Date('2026-01-15T08:30:00Z') },
      { tenantId: tenant.id, userId: null, entityType: 'Invoice', entityId: 'inv-001', action: 'AI_PROCESSED', metadata: { confidence: 0.965, duration_ms: 3200 }, createdAt: new Date('2026-01-15T08:30:45Z') },
      { tenantId: tenant.id, userId: accountant.id, entityType: 'Invoice', entityId: 'inv-001', action: 'APPROVE', createdAt: new Date('2026-01-15T09:15:00Z') },
      { tenantId: tenant.id, userId: accountant.id, entityType: 'Matching', entityId: 'match-002', action: 'CONFIRM', metadata: { invoiceId: 'inv-001', transactionId: 'bt-002' }, createdAt: new Date('2026-01-17T10:00:00Z') },
      { tenantId: tenant.id, userId: admin.id, entityType: 'Invoice', entityId: 'inv-006', action: 'UPLOAD', metadata: { fileName: 'RE_2026_Consulting_XY.pdf' }, createdAt: new Date('2026-02-01T14:00:00Z') },
      { tenantId: tenant.id, userId: null, entityType: 'Invoice', entityId: 'inv-006', action: 'UID_VALIDATION_FAILED', metadata: { uid: 'ATU99999999', reason: 'VIES: ungültig' }, createdAt: new Date('2026-02-01T14:01:00Z') },
    ],
    skipDuplicates: true,
  });

  console.log('6 Audit-Log Einträge erstellt');

  console.log('\n--- Seed abgeschlossen ---');
  console.log('Demo-Logins:');
  console.log('  Admin:         admin@demo.at / Admin123!');
  console.log('  Buchhalter:    buchhalter@demo.at / Buchhalter123!');
  console.log('  Steuerberater: steuerberater@demo.at / Steuerberater123!');
  console.log('\nTestdaten:');
  console.log('  10 Rechnungen (verschiedene Status: UPLOADED, PROCESSING, APPROVED, ERROR, REVIEW_REQUIRED, EXPORTED)');
  console.log('  10 Rechnungspositionen');
  console.log('  2  Kontoauszüge (Jänner + Februar 2026)');
  console.log('  10 Banktransaktionen');
  console.log('  5  Matchings (3 bestätigt, 2 offen)');
  console.log('  6  Audit-Log Einträge');
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
