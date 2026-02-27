# PROGRESS.md – Ki2Go Accounting

**Letzte Aktualisierung:** 27. Februar 2026 (Session 21 — Phase 17: Genehmigungs-Regeln V2 mit Privat-Logik)

---

## Konzept-Abgleich: Ist-Stand vs. CONCEPT.md

### Abweichungen zwischen Konzept und aktueller Implementierung

| Bereich | CONCEPT.md | Ist-Stand | Bewertung |
|---------|-----------|-----------|-----------|
| **Projektname** | Ki2Go Accounting | BuchungsAI | Umbenennung nötig |
| **ORM** | Drizzle ORM | Prisma ORM | Prisma ist ausgereifter, bessere TS-Integration — **Prisma beibehalten empfohlen** |
| **Package Manager** | pnpm workspaces | npm workspaces | Funktional gleichwertig — **npm beibehalten OK** |
| **Ordnerstruktur** | `/packages/frontend`, `/packages/backend` mit `/modules/*` | `/client`, `/server`, `/shared` flach | Backend-Module fehlen (siehe unten) |
| **Storage** | Cloudflare R2 | MinIO (S3-kompatibel) | MinIO für Dev OK, R2 für Prod — **Abstraktionsschicht vorhanden** |
| **DB-Schema** | `companies`, `documents`, `extracted_data` (getrennt) | `tenants`, `invoices` + `extracted_data` + `validation_results` | ✅ Konzept-Tabellen implementiert |
| **API-Pfade** | `/api/documents/*`, `/api/reconciliation/*` | `/api/v1/invoices/*`, `/api/v1/matchings/*` | Konzept-Pfade übernehmen oder Mapping dokumentieren |
| **Rollen** | `admin`, `user`, `accountant` | `ADMIN`, `ACCOUNTANT`, `TAX_ADVISOR` | Konzept hat `user` statt `TAX_ADVISOR` |
| **Dokumenttypen** | incoming/outgoing/credit_note/advance/final | ✅ documentType Feld vorhanden (INVOICE, CREDIT_NOTE, RECEIPT) | MVP fokussiert auf Eingangsrechnungen |

### Fehlende DB-Tabellen (laut Konzept)

| Tabelle | Zweck | Status |
|---------|-------|--------|
| `bank_accounts` | Separate Bankkontenverwaltung (Multi-Konto) | ✅ IMPLEMENTIERT (Phase 4) |
| `extracted_data` | Versionierte KI-Extraktionsdaten | ✅ IMPLEMENTIERT |
| `validation_results` | Separates Prüfprotokoll (Regel-Engine Output) | ✅ IMPLEMENTIERT |
| `sequential_numbers` | Fortlaufende Nummerierung ER/AR-JJJJ-NNNNN | ✅ IMPLEMENTIERT (Phase 5) |
| `deductibility_rules` | Genehmigungs-Regeln (VSt/BA %, ruleType, createsReceivable) | ✅ IMPLEMENTIERT (Phase 16+17) |
| `shareholder_transactions` | Gesellschafter-Verrechnungskonto (GmbH) | ✅ IMPLEMENTIERT (Phase 17) |
| `llm_config` | Admin-konfigurierbare LLM-Einstellungen | OFFEN — MVP nutzt env-Konfiguration |
| `storage_config` | Admin-konfigurierbare Storage-Einstellungen | NIEDRIG — hardcoded reicht für MVP |

### Fehlende Backend-Module (laut Konzept)

| Modul | Zweck | Ist-Stand |
|-------|-------|-----------|
| `/modules/ingestion` | Upload, E-Mail, Scan, WhatsApp | ✅ Upload (Multer + S3) + E-Mail IMAP-Polling (Phase 12) |
| `/modules/ocr` | Dreistufige Erkennungs-Pipeline | ✅ Implementiert (pdf-parse → Vision → sharp) |
| `/modules/llm` | LLM-Abstraktionsschicht | ✅ Implementiert (OpenAI, env-konfiguriert) |
| `/modules/validation` | Regel-Engine (§11 UStG) | ✅ 18 Prüfregeln + Ampel-Logik |
| `/modules/workflow` | Ampel, Nummerierung, Archivierung | ✅ Ampel + Archivierung + Nummerierung (Phase 5) |
| `/modules/reconciliation` | Bankabgleich-Algorithmen | ✅ CSV-Import + 4-Stufen-Matching (Phase 8: IBAN-Match + PaymentDifference) |
| `/modules/export` | CSV/BMD-Export-Generierung | ✅ BMD CSV + Monatsreport PDF + Voll-ZIP-Export (Phase 8) |
| `/modules/communication` | Mail-Versand | ✅ Nodemailer SMTP + SendEmailDialog (Phase 5) |
| `/modules/admin` | Admin-Backend | Nicht implementiert |

---

## Erledigte Aufgaben

### Phase 1: Infrastruktur & Auth ✅

- [x] Projekt-Setup: npm workspaces, TypeScript, ESM
- [x] Docker Compose: PostgreSQL 16, Redis 7, MinIO
- [x] Prisma-Schema: 14 Tabellen mit Multi-Tenant-Indizes
- [x] Prisma Migration: `init` erstellt und angewandt
- [x] Shared Package: Types, Zod-Schemas, Konstanten
- [x] Express-Server: Helmet, CORS, Rate Limiting, Error Handler
- [x] JWT-Auth: Register, Login, Refresh (Rotation), Logout
- [x] Middleware: authenticate, requireTenant, requireRole, validateBody
- [x] Audit-Log: Revisionssicheres Logging aller Aktionen
- [x] Tenant-Management: GET/PUT Tenant, User-CRUD
- [x] Seed: Demo-Tenant + 3 User (Admin, Buchhalter, Steuerberater)

### Phase 1.5: UI & Testdaten ✅

- [x] Seed erweitert: 10 Rechnungen (alle Status), 10 Positionen, 2 Kontoauszüge, 10 Transaktionen, 5 Matchings, 6 Audit-Logs
- [x] Server-Endpoints: Invoices (list+detail), BankStatements (list+detail+transactions), Matchings (list+filter), Dashboard (live stats)
- [x] Client API-Layer: Axios-Funktionen für alle Endpoints
- [x] Dashboard: Live-Statistiken, Validierungs-Übersicht, letzte Aktivitäten, Schnellzugriff
- [x] Rechnungen-Seite: Tabelle mit Suche/Filter, Detail-Panel, Status-Badges, Positionen
- [x] Kontoauszüge-Seite: Aufklappbare Auszüge mit Transaktions-Tabelle
- [x] Abgleich-Seite: Side-by-Side Rechnung ↔ Transaktion, Konfidenz, Match-Typ
- [x] Audit-Log-Seite: Paginierte Tabelle mit Aktions-Badges
- [x] Export-Seite: Übersicht exportbereiter Rechnungen, Format-Auswahl

### Phase 2: Invoice Processing Pipeline ✅

- [x] **DB-Schema**: ExtractedData + ValidationResult Tabellen, Invoice-Erweiterungen (documentType, deliveryDate, isReverseCharge, recipientUid, issuerEmail, issuerIban, uploadedByUserId)
- [x] **Shared Types**: ExtractedDataItem, ValidationCheck, ValidationResultItem, TrafficLightStatus, AmountClass
- [x] **Shared Constants**: AMOUNT_CLASS_THRESHOLDS, VALIDATION_RULES (18 Regeln mit Rechtsgrundlage), DOCUMENT_TYPES, INGESTION_CHANNELS
- [x] **Shared Validation**: updateExtractedDataSchema, rejectInvoiceSchema
- [x] **Upload Middleware**: Multer memoryStorage, 20MB Limit, MIME-Filter (PDF, JPEG, PNG, TIFF, WebP)
- [x] **Storage Service**: uploadFile, downloadFile, getPresignedUrl, deleteFile, ensureBucket (S3/MinIO)
- [x] **LLM Service**: OpenAI-Abstraktionsschicht, JSON-Output, Konfidenz-Scores, deutscher System-Prompt für §11 UStG
- [x] **OCR Pipeline** (3-stufig): pdf-parse (Text-PDFs) → GPT-4o Vision (Scans/Bilder) → sharp Preprocessing + Retry
- [x] **Regel-Engine** (§11 UStG): 18 Prüfregeln (Betragsklassen, Pflichtmerkmale, Mathe, USt-Satz, UID-Syntax, IBAN-Syntax, Reverse Charge, Duplikat), Ampel-Logik
- [x] **Invoice Service**: uploadInvoice (Hash-Duplikat, S3, BullMQ-Job), updateExtractedData (Versionierung + Re-Validierung + Sync), approve, reject, getVersions, getDownloadUrl
- [x] **BullMQ Worker**: Async Processing (Download → OCR → Validate → DB-Write → Status-Update), Error-Handling
- [x] **Invoice Routes**: POST / (Upload), PUT /:id (Korrektur), POST /:id/approve, POST /:id/reject, GET /:id/download, GET /:id/versions, erweiterte GET /:id
- [x] **Server Startup**: Worker-Start + ensureBucket() in index.ts, Graceful Shutdown
- [x] **Seed erweitert**: 6 ExtractedData Version 1, 6 ValidationResult Records mit strukturierten Checks
- [x] **Client API**: uploadInvoiceApi, updateInvoiceApi, approveInvoiceApi, rejectInvoiceApi, getInvoiceDownloadUrl, getInvoiceVersionsApi
- [x] **Client UI**: Upload-Dialog (Drag & Drop), Detail-Panel mit Edit-Mode, Prüfprotokoll mit Ampel-Icons + Rechtsgrundlage, Approve/Reject Buttons, Polling bei UPLOADED/PROCESSING, Download-Button, Versionsinfo

---

## Offene Aufgaben (MVP laut CONCEPT.md)

### Phase 2.5: VIES + Lieferanten + UX ✅

- [x] **Beleg-Nr. (BEL-XXX)**: Pro-Tenant fortlaufende sichtbare Belegnummer für alle Rechnungen
- [x] **Ersatzbeleg-Feature**: Manueller Ersatzbeleg für unleserliche Rechnungen (§132 BAO), Verknüpfung Original ↔ Ersatzbeleg
- [x] **Upload UX**: Multi-File Upload, Auto-Refresh bei Processing, Feedback bei Genehmigung
- [x] **VIES UID-Validierung**: Live-Prüfung gegen EU VIES REST API (validateUid + compareCompanyNames)
- [x] **Validation Rules erweitert**: 20+ Regeln (FOREIGN_VAT_CHECK, ISSUER_SELF_CHECK, UID_VIES_CHECK, DUPLICATE_CHECK)
- [x] **Vendor-Model**: Prisma-Model mit VIES-Cache, auto-findOrCreate aus verarbeiteten Rechnungen
- [x] **Vendor-Service**: listVendors (mit invoiceCount), getVendorDetail (mit Rechnungsliste), updateVendor
- [x] **Vendor-Routes**: GET /api/v1/vendors, GET /:id, PUT /:id (mit auth)
- [x] **Vendor-UI**: Lieferantenliste mit Suche, VIES-Badge, Detail-Panel mit Kontaktdaten + verknüpften Rechnungen
- [x] **Navigation**: Lieferanten-Link in Sidebar (zwischen Rechnungen und Kontoauszüge)
- [x] **Seed**: 6 Vendor-Testdaten mit VIES-Daten und Rechnungsverknüpfung

### Phase 3: Batch-Genehmigung + Vendor Trust Level ✅

- [x] **Vendor Trust Level**: Enum `NEW` → `VERIFIED` → `TRUSTED` im Prisma-Schema
- [x] **Auto-Approve**: Rechnungen von TRUSTED-Lieferanten werden bei GREEN-Validierung automatisch genehmigt
- [x] **Batch-Genehmigung**: POST `/api/v1/invoices/batch-approve` — bis zu 100 Rechnungen auf einmal genehmigen
- [x] **Vendor UI**: Trust-Level Badge in Listentabelle + Dropdown-Selector im Detail-Panel
- [x] **Invoice UI**: Checkbox-Spalte + "Alle auswählen" + Batch-Toolbar mit Genehmigen-Button
- [x] **Audit-Log**: `trigger: BATCH` bzw. `trigger: AUTO_TRUST` in Metadata

### Phase 3.5: Tenant-Onboarding + IBAN-Verbesserung ✅

- [x] **Tenant-Schema erweitert**: +8 Felder (iban, bic, bankName, firmenbuchNr, country, phone, email, onboardingComplete)
- [x] **Shared Types**: TenantProfile Interface, UserProfile um onboardingComplete erweitert
- [x] **Shared Validation**: updateTenantSchema erweitert, neues completeOnboardingSchema
- [x] **Auth Service**: onboardingComplete in register(), login(), getMe() UserProfile
- [x] **Tenant Routes**: validateBody(updateTenantSchema) auf PUT /, neuer POST /complete-onboarding Endpoint
- [x] **IBAN Mod-97 Validierung**: ISO 13616 Prüfziffern-Check (BigInt mod 97), länderspezifische Längentabelle
- [x] **IBAN Tenant-Vergleich**: checkIbanSyntax erkennt eigene Firmen-IBAN → YELLOW Hinweis
- [x] **Aussteller-Prüfung**: checkIssuerIsNotSelf vergleicht jetzt auch IBAN (nicht nur UID + Name)
- [x] **Validierung optimiert**: Tenant-Info wird einmal geladen und an alle Checks durchgereicht
- [x] **Client Onboarding-Seite**: 4-Sections-Formular (Firma, Adresse*, Bank, Kontakt)
- [x] **Client Onboarding-Redirect**: ProtectedRoute prüft onboardingComplete → /onboarding
- [x] **Client Settings-Upgrade**: Von read-only Stub zum vollständigen Edit-Formular mit Firmen-IBAN
- [x] **Client API-Layer**: getTenantApi, updateTenantApi, completeOnboardingApi
- [x] **Auth Store**: setOnboardingComplete() Helper
- [x] **Seed**: Demo-Tenant mit Bankdaten + onboardingComplete: true

### Phase 4: Multi-Bankkonto + vatBreakdown ✅

- [x] **Multi-Bankkonto**: `BankAccount`-Tabelle (1:n pro Tenant), CRUD-Endpoints, Settings-UI mit Multi-Konto-Liste
- [x] **Onboarding erstellt erstes BankAccount** automatisch aus Tenant-IBAN
- [x] **IBAN-Validierung** gegen ALLE Tenant-IBANs (nicht nur eine)
- [x] **Seed**: 2 Demo-Konten (Girokonto + Kreditkarte)
- [x] **vatBreakdown (Multi-USt)**: `vatBreakdown Json?` auf Invoice + ExtractedData, LLM-Prompt, OCR-Normalisierung, Mathe-Check pro USt-Satz, Sync, Client-UI Aufschlüsselung
- [x] **IBAN Mod-97 Cross-Check**: Regex-Extraktion aus PDF-Textlayer als Fallback bei LLM-OCR-Fehlern
- [x] **Spalten-Sortierung**: Alle Spalten in Rechnungstabelle sortierbar, Backend-Whitelist
- [x] **Vendor-Display verbessert**: Dateiname kursiv + "Lieferant wird erkannt..." bei neuen Belegen

### Phase 4.5: Validation-Tests + UID-Bugfixes ✅

- [x] **EU OSS UID-Erkennung**: `'EU'` Präfix zu `EU_UID_PREFIXES` hinzugefügt — Midjourney (EU372045196) wurde fälschlich als "DRITTLAND" klassifiziert
- [x] **EU OSS VIES-Skip**: VIES API unterstützt EU OSS Non-Union-Scheme nicht → Early Return mit GREEN + Info-Message
- [x] **GR-Präfix (Griechenland)**: `'GR'` zu `EU_UID_PREFIXES` hinzugefügt — Griechenland nutzt `EL` als UID-Präfix aber `GR` als ISO-Code
- [x] **XI-Präfix (Nordirland)**: `'XI'` + UID-Pattern für NI Protocol (post-Brexit) hinzugefügt
- [x] **resolveCountryName()** vervollständigt: 11 fehlende EU-Länder (GR, CY, EE, LV, LT, MT, FI, SE, DK + XI, NO)
- [x] **OCR-Pipeline Robustness** (8 Verbesserungen): Regex-Fallback für Beträge, fehlertolerantere UID-Extraktion, IBAN Cross-Check aus PDF-Textlayer
- [x] **vatBreakdown (Multi-USt)**: LLM-Prompt + Normalisierung + Mathe-Check pro USt-Satz
- [x] **Vitest-Konfiguration**: `server/vitest.config.ts` + `npm run test` Script
- [x] **174 Unit-Tests**: Validation-Service vollständig getestet (alle 18+ Prüfregeln, EU-Ländermuster, Grenzwerte, Integration)
- [x] **`_testing` Export**: Alle internen Funktionen über Namespace exportiert für direktes Unit-Testing

### Phase 5: Archivierungs-Workflow (Genehmigung → Nummerierung → Stempel → Archiv) ✅

- [x] **ProcessingStatus Refactoring**: APPROVED entfernt → ARCHIVED (Genehmigung = sofortige Archivierung) + RECONCILED
- [x] **SequentialNumber-Model**: Lückenlose fortlaufende Nummerierung (ER-2026-00001), SELECT FOR UPDATE via Prisma Raw SQL
- [x] **CancelledNumber-Model**: Storno-Tracking mit Grund, Zeitpunkt, User (für Betriebsprüfung)
- [x] **Invoice Archivierungsfelder**: archivalNumber, archivalPrefix, archivedAt, archivedByUserId, archivedStoragePath, archivedFileName, stampFailed
- [x] **Archival Service** (Kernstück): getNextSequentialNumber, stampPdf (pdf-lib), imageToPdf (sharp→pdf-lib), archiveInvoice, batchArchiveInvoices, cancelArchivalNumber
- [x] **PDF-Stempel**: Eingangsstempel oben rechts auf erster Seite (Archivnummer, Status, Datum, Genehmiger)
- [x] **Bild→PDF-Konvertierung**: JPEG/PNG/TIFF/WebP werden bei Archivierung automatisch in A4-PDF gewrappt
- [x] **Upload-Pfad geändert**: Neue Uploads → `{tenantId}/temp/`, Archivierung → `{tenantId}/archive/{year}/`
- [x] **Storage Service erweitert**: copyFile + moveFile (S3 CopyObjectCommand)
- [x] **Archiv-Immutabilität**: isLocked bei Archivierung, PUT-Endpoint lehnt Änderungen ab (HTTP 409)
- [x] **Stamp-Fehler-Toleranz**: Archivierung läuft auch bei kaputtem PDF, stampFailed Flag
- [x] **Auto-Approve via BullMQ**: TRUSTED-Vendor Rechnungen werden asynchron archiviert
- [x] **Duale Nummern-Anzeige**: ER-2026-00001 grün + prominent, BEL-001 klein/grau (Tabelle + Detail)
- [x] **Client UI komplett**: Archivierungs-Info-Box, "Genehmigen & Archivieren" Button, ARCHIVED/RECONCILED Filter + Badges
- [x] **Routes**: cancel-number Endpoint, number-gaps Dashboard-Endpoint, Download mit ?original=true
- [x] **Seed aktualisiert**: 2 archivierte Rechnungen + Sequential Number Counter
- [x] **Genehmigungs-Kommentar**: Optionaler Kommentar bei Genehmigung trotz Warnung/Ungültig
  - `approvalComment` Feld auf Invoice-Model
  - Kommentar wird auf PDF-Stempel geschrieben (gekürzt auf 100 Zeichen, "Anm: ...")
  - Stempel-Box wächst dynamisch bei vorhandenem Kommentar (72px → 86px)
  - INVALID: Kommentar Pflicht (Modal-Dialog) / WARNING: optional (Modal-Dialog) / VALID: kein Dialog
  - Batch-Genehmigung: Kommentar-Dialog wenn Auswahl WARNING/INVALID enthält
  - Voller Kommentar in Archivierungs-Info-Box + Audit-Log sichtbar
  - `approveInvoiceSchema` (Zod) für Body-Validierung

### Prio 2: Bankabgleich

- [x] **Bankkonten-Verwaltung** (CRUD `/api/bank-accounts`) → Phase 4
- [x] **CSV-Import für Kontoauszüge** (Flexible Header-Erkennung, AT/DE Bankformate, meinElba-Support) — ✅ Phase 8
- [x] **Matching-Algorithmen** (4-stufig: Exakt 99% → RechnungsNr-Match 80% → Betrags-Match 70% → Fuzzy 50%) — ✅ Phase 8
- [x] **Gruppenfreigabe** (alle grünen per Klick) → Phase 3: Batch-Genehmigung

### Prio 3: Export & Kommunikation

- [x] **BMD CSV-Export** (Semikolon, UTF-8 BOM, dd.MM.yyyy) — ✅ Phase 8
- [ ] **Editierbare Exportfelder** (Export-Templates)
- [x] **Korrektur-Mail an Lieferant** (LLM-generiert mit Fallback) — ✅ Phase 8
- [ ] **E-Mail-Weiterleitung** (Inbound Webhook)

### Prio 4: Eingangskanäle

- [x] **Mobiler Scan (PWA)** — Kamera-Capture im Upload-Dialog vorhanden (camera input capture="environment")
- [ ] **WhatsApp-Bot** — Webhook-Endpunkt

### Prio 5: Admin-Backend

- [ ] **LLM-Konfiguration UI** (Provider, Modell, API-Key, Fallback)
- [ ] **Nutzerverwaltung im Mandant** (User CRUD innerhalb Tenant)

---

## Verbesserungsvorschläge

### 1. Backend modularisieren (MITTEL)

Die aktuelle Flat-Struktur (`routes/`, `services/`) funktioniert, aber das Konzept sieht `/modules/*` vor. **Empfehlung:** Bei wachsender Codebasis in Module umstrukturieren — aktuell noch nicht kritisch.

### 2. Projektname vereinheitlichen (NIEDRIG)

Code sagt "BuchungsAI", Konzept sagt "Ki2Go Accounting". Package names, localStorage keys, Docker container names etc. sind auf "buchungsai" gesetzt. **Empfehlung:** Entscheidung treffen und durchgängig umsetzen.

### 3. ~~UID-Validierung online~~ ✅ ERLEDIGT

VIES-Abfrage ist implementiert (validateUid + compareCompanyNames in vies.service.ts). Wird automatisch bei der Verarbeitung aufgerufen + VIES-Daten im Vendor gecacht.

---

## Technische Schulden

| Schuld | Auswirkung | Aufwand |
|--------|-----------|---------|
| Prisma-Schema läuft von `server/` aber liegt unter `/prisma` | Migration-Befehle brauchen `--schema ../prisma/schema.prisma` | Klein — Prisma config anpassen |
| Kein `.env.example` im Root | Neue Entwickler müssen `.env` manuell erstellen | Klein |
| ~~Keine Tests vorhanden~~ | ~~Keine Absicherung bei Refactoring~~ | ✅ 174 Unit-Tests (Phase 4.5) |
| `url.parse()` Deprecation Warning | Node.js 24 Warnung bei jedem Start | Klein |
| Pre-existing auth.service.ts TS error | JWT sign type mismatch | Klein |

## Neue Dateien (Phase 2)

| Datei | Zweck |
|-------|-------|
| `server/src/middleware/upload.ts` | Multer-Konfiguration |
| `server/src/services/storage.service.ts` | S3/MinIO Operationen |
| `server/src/services/llm.service.ts` | LLM-Abstraktionsschicht |
| `server/src/services/ocr.service.ts` | 3-stufige OCR-Pipeline |
| `server/src/services/validation.service.ts` | Regel-Engine §11 UStG (18 Regeln) |
| `server/src/services/invoice.service.ts` | Invoice Business-Logik |
| `server/src/jobs/queue.ts` | BullMQ Queue-Setup |
| `server/src/jobs/invoiceProcessor.job.ts` | Background Worker |
| `server/src/types/pdf-parse.d.ts` | Type Declaration |

## Neue Dateien (Phase 2.5)

| Datei | Zweck |
|-------|-------|
| `server/src/services/vies.service.ts` | EU VIES REST API UID-Validierung |
| `server/src/services/vendor.service.ts` | Lieferanten-CRUD + findOrCreate |
| `server/src/routes/vendor.routes.ts` | Vendor API-Endpoints |
| `client/src/api/vendors.ts` | Vendor API-Client |
| `client/src/pages/VendorsPage.tsx` | Lieferantenliste UI |

## Neue Dateien (Phase 3.5)

| Datei | Zweck |
|-------|-------|
| `client/src/api/tenant.ts` | Tenant API-Client (get, update, completeOnboarding) |
| `client/src/pages/OnboardingPage.tsx` | Onboarding-Formular (4 Sections) |
| `prisma/migrations/20260220_add_tenant_onboarding_fields/` | DB-Migration für Tenant-Felder |

## Neue Dateien (Phase 4.5)

| Datei | Zweck |
|-------|-------|
| `server/vitest.config.ts` | Vitest-Konfiguration (globals, node environment) |
| `server/src/services/__tests__/validation.service.test.ts` | 174 Unit-Tests für Regel-Engine |

## Neue Dateien (Phase 5)

| Datei | Zweck |
|-------|-------|
| `server/src/services/archival.service.ts` | Kernlogik: Nummerierung + PDF-Stempel + Archivierung |
| `prisma/migrations/20260223200000_add_archival_workflow/` | DB-Migration: SequentialNumber, CancelledNumber, Invoice-Archivfelder, APPROVED→ARCHIVED |

---

## Phase 8: Steuerberater-Feedback (13 Punkte) ✅

**25. Februar 2026** — Implementierung aller 13 Verbesserungspunkte vom Steuerberater.

### Zusammenfassung der Änderungen

#### A. DB-Schema + Nummernschema + Parken + ServiceType + Stempel
- [x] 3 neue Enums (ServiceType, DifferenceReason, AccessLevel), 3 neue Tabellen (SubstituteDocument, PaymentDifference, UserCompanyAccess)
- [x] ProcessingStatus erweitert: +PARKED, RECONCILED_WITH_DIFFERENCE
- [x] ExtractedData: 5 neue Felder (serviceType, hospitalityGuests, hospitalityReason, deductibilityPercent, deductibilityNote)
- [x] Nummernformat: ER-JJJJ-NNNNN → RE-JJJJ-MM-NNNN (mit Monat)
- [x] Stempel: sachliches Design ohne Farben, Validierungs-Notizen als Bullet-Points
- [x] Invoice-Parken: parkInvoice/unparkInvoice + Frontend-Buttons
- [x] ServiceType (Lieferung/Leistung/Beides): LLM-Erkennung + Speicherung

#### B. Matching-Logik + Zahlungsdifferenzen
- [x] 4-stufiger Matching-Algorithmus (Exakt 99% → Rechnungsnr.-Match 80% → Betrags-Match 70% → Fuzzy 50%)
- [x] IBAN-Matching (Vendor-IBAN vs. Transaction counterpartIban)
- [x] PaymentDifference auto-create bei Betrags-Differenz
- [x] Differenz-Grund-Dropdown (Skonto, Kursdifferenz, Trinkgeld, Teilzahlung, Rundung, Sonstiges)
- [x] USt-Korrektur-Hinweis bei Skonto

#### C. Bewirtungsbeleg-Erkennung
- [x] LLM-Prompt: isHospitality, hospitalityGuests, hospitalityReason
- [x] Validation-Rule: HOSPITALITY_CHECK (§20 Abs 1 Z 3 EStG)
- [x] Auto-Erkennung: Restaurant-Keywords im Firmennamen + gemischte 10%/20% USt

#### D. Ersatzbeleg + Korrektur-Mail
- [x] Korrektur-Mail per LLM (GPT-4.1-nano) mit Fallback-Template
- [x] Frontend: Korrektur-Mail-Button öffnet vorausgefüllten SendEmailDialog

#### E. Monatsreport PDF + BMD-Export + Voll-Export
- [x] BMD CSV-Export: Semikolon, Komma-Dezimal, dd.MM.yyyy, UTF-8 BOM
- [x] Monatsreport PDF (A4 quer): Zusammenfassung, Ampel-Verteilung, Beleg-Tabelle
- [x] Voll-Export ZIP: archivierte PDFs nach Monat + summary.csv
- [x] Frontend: ExportPage komplett überarbeitet (Datums-Picker, Download-Buttons)

#### F. Multi-Tenant Steuerberater-Zugang
- [x] companyAccess.service.ts: grantAccess, revokeAccess, getAccessibleTenants
- [x] tenantContext.ts: X-Tenant-Id Header für TAX_ADVISOR-Mandantenwechsel
- [x] Tenant-Routes: accessible-tenants, grant/revoke-access, access-list
- [x] Frontend: Mandanten-Switcher im Sidebar, Kontext-Banner, authStore erweitert

#### G. Legal Pages + DSGVO
- [x] /terms — Aufbewahrungspflichten (§132 BAO)
- [x] /privacy — Datenschutzerklärung (DSGVO)
- [x] GDPR-Service: Account-Löschung (Art. 17) + Datenexport (Art. 20)
- [x] Settings: Steuerberater-Zugang-Verwaltung + DSGVO-Sektion

### Neue Dateien (Phase 8)

| Datei | Zweck |
|-------|-------|
| `server/src/services/export.service.ts` | BMD CSV + Voll-ZIP Export |
| `server/src/services/report.service.ts` | Monatsreport-PDF |
| `server/src/services/companyAccess.service.ts` | Steuerberater Multi-Tenant |
| `server/src/services/gdpr.service.ts` | Konto-Löschung + Datenexport |
| `client/src/api/exports.ts` | Export-API-Client |
| `client/src/pages/TermsPage.tsx` | Aufbewahrungspflicht |
| `client/src/pages/PrivacyPage.tsx` | Datenschutzerklärung |
| `prisma/migrations/20260225080000_steuerberater_feedback/` | Hauptmigration |
| `prisma/migrations/20260225090000_add_terms_accepted_at/` | termsAcceptedAt Feld |

### Verifikation

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ `npm run test` — 174 bestehende Tests laufen (server)
- ✅ Prisma-Migration angewandt

---

## Phase 9: Kontenplan + Barzahlung + Privatentnahme ✅

**25. Februar 2026** — Fünf neue Features für vollständige E/A-Rechner-Buchhaltung.

### Zusammenfassung

#### 1. Editierbarer Kontenplan (Chart of Accounts)
- [x] Account-Tabelle im Prisma-Schema (pro Mandant, `@@unique([tenantId, number])`)
- [x] 26 Standard-Konten (österreichischer EKR): 2700 Kassa, 2800 Bank, 4000-4050 Erlöse, 5000-5100 Material, 7000-7900 Aufwendungen, 9600/9610 Privat
- [x] CRUD-API: `GET/POST/PUT/DELETE /api/v1/accounts`, Seed-Endpoint
- [x] Auto-Seeding bei Registrierung neuer Mandanten
- [x] Frontend: AccountsPage mit Gruppierung, Suche, Typ-Filter, Inline-Edit, Deaktivierung
- [x] AccountSelector-Kombobox ersetzt Freitext-Konto-Feld im Invoice-Edit

#### 2. Barzahlung (Cash Payment)
- [x] `paymentMethod` Enum (BANK/CASH) auf Invoice-Tabelle
- [x] "Bar bezahlt" Button im Invoice-Detail → Datums-Dialog → Status wird RECONCILED ohne Matching
- [x] Rückgängig-Funktion (undoCashPayment)
- [x] BMD-Export: Gegenkonto 2700 (Kassa) bei CASH, 2800 (Bank) bei BANK

#### 3. Privatentnahme / Privateinlage
- [x] TransactionBooking-Tabelle für Buchungen ohne Rechnung (1:1 zu BankTransaction)
- [x] "Privat" Button bei ungematchten Transaktionen in der Monatsabstimmung
- [x] Automatische Konto-Zuordnung: Privatentnahme → 9600, Privateinlage → 9610
- [x] Buchungs-Dialog mit optionalem Notiz-Feld
- [x] Monatsabstimmung: bookedTransactions in Response, korrekte Statistiken

#### 4. Privatanteil (%)
- [x] `privatePercent` Int-Feld auf Invoice (0-100)
- [x] Eingabefeld im Edit-Modus mit berechneter betrieblicher Anteil-Anzeige
- [x] BMD-Export: Betrag × (100 - privatePercent)/100

#### 5. Vendor Default Account (Lerneffekt)
- [x] `defaultAccountNumber` Feld auf Vendor-Tabelle
- [x] Auto-Zuweisung bei Rechnungsverarbeitung: wenn Vendor bekannt + Konto hinterlegt → auto-assign
- [x] Lerneffekt: wenn User Konto manuell ändert → Vendor.defaultAccountNumber aktualisiert

### Neue Dateien (Phase 9)

| Datei | Zweck |
|-------|-------|
| `server/src/services/account.service.ts` | Kontenplan CRUD + Seeding |
| `server/src/services/transactionBooking.service.ts` | Privatentnahme/-einlage |
| `server/src/routes/account.routes.ts` | Kontenplan API |
| `client/src/api/accounts.ts` | Kontenplan API-Client |
| `client/src/pages/AccountsPage.tsx` | Kontenplan-Seite |
| `client/src/components/AccountSelector.tsx` | Konto-Dropdown Komponente |
| `prisma/migrations/20260225120000_add_accounts_cash_private/` | DB-Migration |

### Geänderte Dateien (Phase 9)

| Datei | Änderungen |
|-------|-----------|
| `prisma/schema.prisma` | 3 Enums, 2 Tabellen, 4 Invoice-Felder, 1 Vendor-Feld |
| `shared/src/types.ts` | Neue Types + InvoiceDetail erweitert + ReconciliationBookedTransaction |
| `shared/src/constants.ts` | DEFAULT_ACCOUNTS, PAYMENT_METHODS, BOOKING_TYPES |
| `shared/src/validation.ts` | 4 neue Schemas, privatePercent in updateExtractedData |
| `server/src/services/invoice.service.ts` | markCashPayment, undoCashPayment, privatePercent, Vendor Default |
| `server/src/services/matching.service.ts` | Reconciliation: bookedTransactions, korrigierte Statistiken |
| `server/src/services/export.service.ts` | Gegenkonto, Privatanteil, TransactionBookings-Export |
| `server/src/services/auth.service.ts` | seedAccountsForTenant bei Registrierung |
| `server/src/routes/invoice.routes.ts` | + cash-payment Routes |
| `server/src/routes/matching.routes.ts` | + bookings Routes |
| `server/src/app.ts` | Account-Routes registriert |
| `client/src/pages/InvoicesPage.tsx` | AccountSelector, Bar-bezahlt-Button, Privatanteil |
| `client/src/pages/MatchingPage.tsx` | Privat-Button bei ungematchten Transaktionen |
| `client/src/App.tsx` | + /accounts Route |
| `client/src/components/layout/AppLayout.tsx` | + Kontenplan Nav-Item |
| `prisma/seed.ts` | Standard-Konten seeden |

### Verifikation

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ Prisma-Migration angewandt
- ✅ Seed: 26 Standard-Konten für Demo-Mandant erstellt

## Phase 10: Zwei-Zielgruppen-Strategie + A-B-C Workflow ✅

**Basis-Dokumente:** `docs/Analyse & Umsetzung_ Zwei-Zielgruppen-Strategie.md` + `docs/Neuer 3-Prozess-Workflow_ A-B-C.md`

### 10a: AccountingType auf Tenant
- [x] Neues `AccountingType` Enum (EA, ACCRUAL) in Prisma-Schema
- [x] `accountingType` Feld auf Tenant (default EA)
- [x] `AccountingTypeValue` Type in shared/types.ts
- [x] `ACCOUNTING_TYPES` Konstante mit Label + Description
- [x] Register-Schema + Onboarding-Schema erweitert
- [x] Server: accountingType in register/login/getMe durchgereicht
- [x] Client: Auswahl-Cards auf RegisterPage + OnboardingPage

### 10b: Neue ProcessingStatus-Werte
- [x] `INBOX` + `PENDING_CORRECTION` in ProcessingStatus Enum
- [x] `correctionRequestedAt` + `correctionNote` Felder auf Invoice
- [x] `requestCorrectionSchema` Zod-Validierung
- [x] Server: `requestCorrection()` Service-Funktion (PROCESSED/REVIEW_REQUIRED → PENDING_CORRECTION)
- [x] Server: `POST /:id/request-correction` Route
- [x] Server: Comma-separated `processingStatus` Filter (für Inbox: `INBOX,UPLOADED`)
- [x] Client: `requestCorrectionApi()` + Korrektur-Button im Detail-Panel
- [x] Client: PENDING_CORRECTION Info-Box mit Note + Datum
- [x] Client: INBOX + PENDING_CORRECTION Badges in ProcessingBadge

### 10c: Navigation umbauen auf A-B-C
- [x] AppLayout: Grouped nav (Hauptprozess / Stammdaten / Berichte & Export / System)
- [x] Dashboard erreichbar über Logo-Klick + eigenem Link
- [x] Neue InboxPage (`/inbox`): Upload + INBOX/UPLOADED Belege, Drag&Drop
- [x] BottomTabBar: Home → Eingang → Scannen → Prüfung → Mehr
- [x] App.tsx: `/inbox` + `/tax/uva` Routen hinzugefügt

### 10d: Conditional UI nach accountingType
- [x] `useAccountingType()` Hook
- [x] AppLayout: UVA-Bericht nur für EA sichtbar
- [x] ExportPage: BMD CSV nur für ACCRUAL sichtbar
- [x] UvaReportPage: Placeholder ("Kommt bald")

### 10e: OCR-Prüfexport
- [x] Server: `generateOcrCheckCsv()` in export.service.ts (21 Spalten inkl. Confidence-Scores)
- [x] Server: `POST /exports/ocr-check` Route
- [x] `ocrCheckExportSchema` Zod-Schema
- [x] Client: `exportOcrCheckApi()` API-Funktion
- [x] Client: "OCR-Export" Button auf InvoicesPage Header

### 10f: BMD als fixes ExportConfig-Profil
- [x] `isSystem Boolean @default(false)` auf ExportConfig
- [x] Server: BMD ExportConfig Seed bei Registration (isSystem: true)
- [x] Seed: Demo-Tenant BMD Config mit isSystem: true

### Migration
- Einzelne Migration: `20260226120000_add_accounting_type_inbox_correction`
- AccountingType Enum + Feld, INBOX/PENDING_CORRECTION, correction fields, isSystem

### Neue Dateien (Phase 10)

| Datei | Zweck |
|-------|-------|
| `client/src/pages/InboxPage.tsx` | Prozess A: Rechnungseingang mit Upload + Belegliste |
| `client/src/pages/UvaReportPage.tsx` | UVA-Bericht Placeholder (EA only) |
| `client/src/hooks/useAccountingType.ts` | accountingType aus AuthStore |
| `prisma/migrations/20260226120000_add_accounting_type_inbox_correction/` | DB-Migration |

### Geänderte Dateien (Phase 10)

| Datei | Änderung |
|-------|----------|
| `prisma/schema.prisma` | AccountingType Enum, ProcessingStatus +2, Invoice +2 Felder, ExportConfig +isSystem |
| `shared/src/types.ts` | AccountingTypeValue, ProcessingStatusType +2, UserProfile/TenantProfile/RegisterRequest +accountingType |
| `shared/src/constants.ts` | ACCOUNTING_TYPES, PROCESSING_STATUS +2 |
| `shared/src/validation.ts` | registerSchema +accountingType, requestCorrectionSchema, ocrCheckExportSchema |
| `server/src/services/auth.service.ts` | accountingType in register/login/getMe, BMD ExportConfig Seed |
| `server/src/services/invoice.service.ts` | requestCorrection(), parkableStatuses +INBOX/PENDING_CORRECTION |
| `server/src/services/export.service.ts` | generateOcrCheckCsv() |
| `server/src/routes/invoice.routes.ts` | POST request-correction, comma-filter |
| `server/src/routes/export.routes.ts` | POST ocr-check |
| `client/src/components/layout/AppLayout.tsx` | Grouped navGroups, useAccountingType |
| `client/src/components/mobile/BottomTabBar.tsx` | A-B-C Tabs |
| `client/src/pages/RegisterPage.tsx` | accountingType Auswahl |
| `client/src/pages/OnboardingPage.tsx` | accountingType Auswahl |
| `client/src/pages/ExportPage.tsx` | Conditional BMD (ACCRUAL only) |
| `client/src/pages/InvoicesPage.tsx` | Korrektur-Button, PENDING_CORRECTION Badge, OCR-Export |
| `client/src/api/invoices.ts` | requestCorrectionApi() |
| `client/src/api/exports.ts` | exportOcrCheckApi() |
| `client/src/App.tsx` | /inbox, /tax/uva Routen |
| `prisma/seed.ts` | BMD Config isSystem: true |

### Verifikation

- ✅ `npx tsc --noEmit` — server + client kompilieren ohne Fehler
- ✅ Prisma-Migration erstellt und angewandt
- ✅ Shared-Paket gebaut

## Phase 11: Ausgangsrechnungen (OUTGOING) ✅

**25. Februar 2026** — Kompletter Support für Ausgangsrechnungen.

### Bereits vorhandene Infrastruktur (aus früheren Phasen)
- ✅ `direction` Feld auf Invoice (INCOMING/OUTGOING), Index `@@index([tenantId, direction])`
- ✅ Customer-Model + customer.service.ts (findOrCreate, list, detail, update)
- ✅ Customer-Routes `/api/v1/customers` (GET /, GET /:id, PUT /:id)
- ✅ CustomersPage mit Suche, Detail-Panel, Edit, E-Mail-Dialog, VIES-Badges
- ✅ InvoiceUploadDialog mit Direction-Picker (INCOMING/OUTGOING Toggle)
- ✅ Direction-Tabs in InvoicesPage (Alle/Eingang/Ausgang)
- ✅ Archival-Prefix: RE für Eingang, AR für Ausgang
- ✅ Matching-Service: OUTGOING korrekt von Vorsteuer ausgeschlossen
- ✅ 4 Validierungsregeln direction-aware (IBAN, ReverseCharge, ForeignVat, IssuerNotSelf)

### Neue Änderungen (Session 15)
- [x] **InboxPage Direction-Toggle**: Eingangsrechnung/Ausgangsrechnung Buttons vor Upload-Area
- [x] **InboxPage Upload**: Direction wird an `uploadInvoiceApi()` durchgereicht
- [x] **InboxPage AR/ER-Badge**: Jeder Beleg zeigt direction-Badge (AR blau, ER grau)
- [x] **InboxPage Name-Anzeige**: OUTGOING zeigt customerName statt vendorName
- [x] **BMD CSV Export**: Partner-Name/-UID direction-aware (OUTGOING → Customer, INCOMING → Vendor)
- [x] **BMD CSV Export**: Customer-UID via Relation geladen (kein Feld auf Invoice)
- [x] **Monatsreport PDF**: Getrennte Summen (Ausgaben ER / Einnahmen AR)
- [x] **Monatsreport PDF**: Typ-Spalte (ER/AR) in Belegtabelle, sortiert nach Direction
- [x] **Full ZIP Export**: Ordnerstruktur `ER-Eingang/YYYY-MM/` vs. `AR-Ausgang/YYYY-MM/`
- [x] **Full ZIP Summary**: Typ-Spalte im summary.csv

### Geänderte Dateien (Phase 11)

| Datei | Änderung |
|-------|----------|
| `client/src/pages/InboxPage.tsx` | Direction-Toggle, AR/ER-Badge, customerName für OUTGOING |
| `server/src/services/export.service.ts` | BMD: partnerName/partnerUid direction-aware, customer relation; ZIP: direction-Subfolder |
| `server/src/services/report.service.ts` | Getrennte ER/AR-Summen, Typ-Spalte, Direction-Sortierung |

### Verifikation (Phase 11)

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler

---

## Phase 12: E-Mail-Weiterleitung (Inbound Email Ingestion) ✅

**26. Februar 2026** — Automatischer Rechnungseingang per E-Mail via IMAP-Polling.

### Zusammenfassung

Mandanten konfigurieren IMAP-Mailboxen in den Einstellungen. BullMQ pollt regelmäßig (Standard: alle 5 Minuten), extrahiert PDF/Bild-Attachments und speist sie automatisch in die bestehende `uploadInvoice()`-Pipeline ein. Passwörter werden mit AES-256-GCM verschlüsselt gespeichert.

### Features

#### 1. EmailConnector (Prisma Model + CRUD)
- [x] `EmailConnector` Tabelle: IMAP-Config, verschlüsseltes Passwort, Sync-Status, Fehler-Tracking
- [x] `@@unique([tenantId, username])` — ein Konto pro Mandant
- [x] Invoice: +emailSender, +emailSubject, +emailMessageId (nullable)
- [x] Index `(tenantId, emailMessageId)` für Dedup
- [x] REST API: GET/POST/PUT/DELETE `/api/v1/email-connectors`, POST `/test`, POST `/:id/sync`
- [x] ADMIN-only für Erstellen/Ändern/Löschen

#### 2. AES-256-GCM Verschlüsselung
- [x] `encryption.service.ts`: encrypt/decrypt mit ENCRYPTION_KEY aus `.env`
- [x] Format: `iv:authTag:ciphertext` (hex-kodiert)
- [x] `isEncryptionConfigured()` Guard — Feature deaktiviert ohne Key

#### 3. IMAP-Sync (Kernlogik)
- [x] `imapflow` + `mailparser` für IMAP-Verbindung und Mail-Parsing
- [x] UID-basiertes Tracking (nur neue Mails nach `lastSyncedUid`)
- [x] Erster Sync: UNSEEN-Mails
- [x] Attachment-Filter: nur PDF, JPEG, PNG, TIFF, WebP
- [x] Inline-Images (ohne Dateiname) werden ignoriert
- [x] Pro Attachment → `uploadInvoice()` mit `ingestionChannel: 'EMAIL'`
- [x] Email-Metadaten (Absender, Betreff, Message-ID) auf Invoice gesetzt

#### 4. Deduplication + Fehlerbehandlung
- [x] Dedup via `tenantId + emailMessageId + originalFileName`
- [x] Auto-Deaktivierung nach 3 aufeinanderfolgenden Fehlern (MAX_CONSECUTIVE_FAILURES)
- [x] Audit-Log bei Deaktivierung
- [x] Fehler-Counter Reset bei Reaktivierung

#### 5. BullMQ Job-Scheduling
- [x] Eigene Queue `email-sync` mit Concurrency 2
- [x] Repeatable Jobs pro Connector (konfigurierbar: 1–60 Minuten)
- [x] Manueller Sync-Trigger möglich
- [x] Server-Boot: alle aktiven Connectors registrieren, alte Jobs aufräumen
- [x] Graceful Shutdown: emailSyncWorker.close()

#### 6. Settings UI (E-Mail-Abruf)
- [x] Connector-Liste mit Status-Badges (SUCCESS grün, RUNNING blau, ERROR rot)
- [x] Hinzufügen-Dialog: Host, Port, SSL, Username, App-Passwort, Ordner, Intervall
- [x] "Verbindung testen" Button
- [x] Pro Connector: Bearbeiten, Löschen, "Jetzt synchronisieren", Aktiv-Toggle
- [x] Auto-Deaktivierung Warnung (3x fehlgeschlagen)
- [x] Nur für ADMIN sichtbar

#### 7. InboxPage Enhancement
- [x] Email-Icon (lila) + "E-Mail" Badge bei `ingestionChannel === 'EMAIL'`
- [x] Absender als Tooltip

### Neue Dateien (Phase 12)

| Datei | Zweck |
|-------|-------|
| `server/src/services/encryption.service.ts` | AES-256-GCM für IMAP-Passwörter |
| `server/src/services/emailConnector.service.ts` | CRUD + Job-Management |
| `server/src/services/emailSync.service.ts` | IMAP-Sync Kernlogik |
| `server/src/jobs/emailSyncQueue.ts` | BullMQ Queue + Worker |
| `server/src/routes/emailConnector.routes.ts` | REST-Endpoints |
| `client/src/api/emailConnectors.ts` | API-Client Funktionen |
| `prisma/migrations/20260226150000_add_email_connectors/` | DB-Migration |

### Geänderte Dateien (Phase 12)

| Datei | Änderung |
|-------|----------|
| `prisma/schema.prisma` | +EmailConnector Model, +3 Email-Felder auf Invoice |
| `shared/src/types.ts` | +EmailConnectorItem, +Create/Update/Test Request Types |
| `shared/src/constants.ts` | +EMAIL_CONNECTOR_SYNC_STATUS, +MAX_CONSECUTIVE_FAILURES, +ALLOWED_EMAIL_ATTACHMENT_MIMES |
| `shared/src/validation.ts` | +3 Zod-Schemas (create, update, test connector) |
| `server/src/config/env.ts` | +ENCRYPTION_KEY (optional, 64 hex chars) |
| `server/src/services/invoice.service.ts` | +ingestionChannel Parameter in UploadParams |
| `server/src/routes/invoice.routes.ts` | +ingestionChannel/emailSender in List-Select |
| `server/src/app.ts` | emailConnector Routes registriert |
| `server/src/index.ts` | +Email-Sync Worker, +registerAllActiveConnectors(), +Graceful Shutdown |
| `client/src/pages/SettingsPage.tsx` | +EmailConnectorsSection (ADMIN only) |
| `client/src/pages/InboxPage.tsx` | +Email-Icon + Absender-Badge |

### Setup-Anleitung

```bash
# 1. ENCRYPTION_KEY generieren und in server/.env setzen:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → ENCRYPTION_KEY=<64-hex-chars>

# 2. Migration anwenden:
npm run db:migrate

# 3. Gmail-Test:
# Gmail → Einstellungen → Sicherheit → App-Passwörter → neues Passwort generieren
# Connector anlegen: Host=imap.gmail.com, Port=993, SSL=ja, Username=email@gmail.com
```

### Verifikation (Phase 12)

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ Prisma-Migration erstellt und angewandt
- ✅ TypeScript: tsc --noEmit fehlerfrei (server + client)

---

## Phase 13: Verbleibende Features (ohne Stufe 2) ✅

**26. Februar 2026** — 6 Features implementiert, die für die MVP-Vollständigkeit fehlten.

### Feature 1: §14 UGB Checks (Rechtsform-Prüfung)
- [x] `LEGAL_FORMS` Konstante: 11 Regex-Patterns für AT/DE-Rechtsformen (GmbH, AG, KG, OG, e.U., etc.) mit `uidRequired` Flag
- [x] `checkLegalForm()` Validierungsregel: erkennt Rechtsform aus issuerName, warnt wenn juristische Person ohne UID
- [x] `LEGAL_FORM_CHECK` + `CREDIT_NOTE_CHECK` in VALIDATION_RULES

### Feature 2: Fälligkeitskontrolle (Überfällig-Filter)
- [x] Backend: `overdue=true` Query-Param auf Invoice-Route (WHERE dueDate < NOW() AND status NOT IN closed)
- [x] `dueDate` in Invoice-Select und ALLOWED_SORT_COLUMNS
- [x] Frontend: "Überfällig" Tab (rot) mit Clock-Icon
- [x] `DueDateCell` Komponente: Überfällig-Badge (rot "Xd"), bald fällig (gelb "in Xd")
- [x] Mobile: Überfällig-Badge im Card-View

### Feature 3: Gutschrift/Anzahlung (LLM + Validierung + UI)
- [x] `ADVANCE_PAYMENT` in DOCUMENT_TYPES + `AZ` Archivierungs-Prefix
- [x] LLM-Prompt: DOKUMENTTYP-ERKENNUNG + originalInvoiceReference
- [x] Job-Processor: `detectedDocumentType` aus LLM-Antwort extrahieren + speichern
- [x] `checkCreditNote()` Validierungsregel: warnt bei positiver Gutschrift, prüft Referenz
- [x] Frontend: `DocumentTypeBadge` (Gutschrift=lila, Anzahlung=teal, Ersatzbeleg=orange)
- [x] Detail-Boxes für CREDIT_NOTE und ADVANCE_PAYMENT im Invoice-Detail

### Feature 4: Ersatzbeleg UI
- [x] War bereits vollständig implementiert via `BelegFormDialog.tsx` mit `mode: 'ersatzbeleg'`
- Keine Änderungen nötig

### Feature 5: Export Templates UI (CRUD + Profilverwaltung)
- [x] Zod-Schema: `createExportConfigSchema` + `updateExportConfigSchema`
- [x] Server: CRUD-Service (getExportConfigs, createExportConfig, updateExportConfig, deleteExportConfig)
- [x] Server: CRUD-Routes (GET/POST/PUT/DELETE /exports/configs) — ersetzt Placeholder
- [x] Client: API-Funktionen + `ExportConfigItem` Type
- [x] ExportPage: "Exportprofile" Tabelle mit Create/Edit Dialog
  - Format (CSV/BMD_CSV/BMD_XML), Trennzeichen, Datumsformat, Dezimaltrennzeichen, Encoding, Kopfzeile
  - System-Profile (BMD NTCS) sind nicht editierbar, visuell markiert
  - Default-Stern, Edit/Delete Actions

### Feature 6: User-Einladung (Token-Flow + E-Mail + UI)
- [x] DB-Migration: `invitationToken` + `invitationExpiresAt` + Index auf User-Tabelle
- [x] Zod-Schemas: `inviteUserSchema` (email, firstName, lastName, role) + `acceptInviteSchema` (token, password)
- [x] Server: `POST /tenant/invite` — erstellt User mit isActive=false, generiert Token (48h), sendet E-Mail
- [x] Server: `POST /auth/accept-invite` — validiert Token, setzt Passwort, aktiviert User
- [x] `sendInvitationEmail()` in mail.service.ts (deutscher Text mit Aktivierungs-Link)
- [x] Client: `inviteUserApi()` + `acceptInviteApi()` + `getTenantUsersApi()`
- [x] AcceptInvitePage: Standalone-Seite für Token-Validierung + Passwort-Eingabe
- [x] SettingsPage: "Team-Mitglieder" Sektion mit User-Liste + Status-Badges (Aktiv/Eingeladen) + Einladungs-Formular

### Neue Dateien (Phase 13)

| Datei | Zweck |
|-------|-------|
| `client/src/pages/AcceptInvitePage.tsx` | Einladung annehmen + Passwort setzen |
| `prisma/migrations/20260226180000_add_invitation_token/` | DB-Migration |

### Geänderte Dateien (Phase 13)

| Datei | Änderung |
|-------|----------|
| `shared/src/constants.ts` | +LEGAL_FORMS, +ADVANCE_PAYMENT, +AZ, +LEGAL_FORM_CHECK, +CREDIT_NOTE_CHECK |
| `shared/src/types.ts` | +dueDate in InvoiceListItem, +ExportConfigItem, +ExportFormatType |
| `shared/src/validation.ts` | +inviteUserSchema, +acceptInviteSchema, +createExportConfigSchema, +updateExportConfigSchema |
| `server/src/services/validation.service.ts` | +checkLegalForm(), +checkCreditNote(), +documentType in ValidationInput |
| `server/src/services/llm.service.ts` | +DOKUMENTTYP-ERKENNUNG im Extraktions-Prompt |
| `server/src/services/archival.service.ts` | +ADVANCE_PAYMENT → AZ Prefix |
| `server/src/services/export.service.ts` | +CRUD für ExportConfig |
| `server/src/services/mail.service.ts` | +sendInvitationEmail() |
| `server/src/routes/invoice.routes.ts` | +overdue Filter, +dueDate Select/Sort |
| `server/src/routes/export.routes.ts` | +CRUD Endpoints für /exports/configs |
| `server/src/routes/tenant.routes.ts` | +POST /tenant/invite |
| `server/src/routes/auth.routes.ts` | +POST /auth/accept-invite |
| `server/src/jobs/invoiceProcessor.job.ts` | +detectedDocumentType Extraktion |
| `client/src/api/invoices.ts` | +overdue Filter |
| `client/src/api/exports.ts` | +ExportConfig CRUD API |
| `client/src/api/auth.ts` | +acceptInviteApi() |
| `client/src/api/tenant.ts` | +inviteUserApi(), +getTenantUsersApi() |
| `client/src/pages/InvoicesPage.tsx` | +Überfällig Tab, +DueDateCell, +DocumentTypeBadge |
| `client/src/pages/ExportPage.tsx` | +Exportprofile Sektion + Create/Edit Dialog |
| `client/src/pages/SettingsPage.tsx` | +TeamSection (User-Liste + Einladungsformular) |
| `client/src/App.tsx` | +/accept-invite Route, +AcceptInvitePage Import |
| `prisma/schema.prisma` | +invitationToken, +invitationExpiresAt, +Index auf User |

### Verifikation (Phase 13)

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ Prisma-Migration erstellt und angewandt
- ✅ Prisma-Client regeneriert

## Phase 14: Sicherheit + Laufende Kosten ✅

### DSGVO / Sicherheit

- [x] **Passwort ändern**: `POST /auth/change-password` + SettingsPage UI (ChangePasswordSection)
- [x] **Account-Lockout**: 5 fehlgeschlagene Logins → 15 Minuten Sperre (`failedLoginAttempts`, `lockedUntil`)
- [x] **Passwort zurücksetzen**: `POST /auth/forgot-password` + `POST /auth/reset-password` + ResetPasswordPage
  - Token: crypto.randomBytes(32), 1h Ablauf, Single-Use
  - Anti-Enumeration: Immer Erfolg zurückgeben
  - Rate-Limiting: 5 Requests/15min (authSensitiveLimiter)
- [x] **Super-Admin**: `isSuperAdmin` Flag auf User, `requireSuperAdmin` Middleware
  - Admin-Routes: `GET /admin/tenants`, `GET /admin/stats`, `POST /admin/switch-tenant`
  - CLI-Script: `npm run db:superadmin <email> [password]`
  - Tenant-Wechsel via `X-Tenant-Id` Header

### Laufende Kosten (Recurring Costs)

- [x] **DB-Schema**: `isRecurring`, `recurringInterval` (MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY), `recurringGroupId`, `recurringNote` auf Invoice
- [x] **Prisma-Migration**: `20260226210000_add_recurring_costs` + RecurringInterval Enum
- [x] **recurring.service.ts**: Pattern-Erkennung (2+ ähnliche Rechnungen vom selben Vendor → Auto-Detect), setRecurring(), getRecurringCostsSummary()
- [x] **API-Endpoints**:
  - `POST /invoices/:id/set-recurring` — Manuell markieren/demarkieren mit Intervall + Notiz
  - `GET /invoices/recurring-summary` — Zusammenfassung für Dashboard-Widget
  - `GET /invoices?recurring=true` — Filter für laufende Kosten
- [x] **InvoicesPage UI**:
  - Lila "Laufend" Filter-Tab (neben Überfällig)
  - Lila "Laufend" Badge in Rechnungsliste (Desktop + Mobile)
  - Toggle-Switch im Detail-Panel: Laufende Kosten an/aus
  - Intervall-Dropdown (Monatlich/Vierteljährlich/Halbjährlich/Jährlich)
  - Notiz-Feld (z.B. "Monatliche Miete Büro")
- [x] **Dashboard-Widget "Laufende Kosten"**:
  - Monatliche Gesamtsumme
  - Tabelle: Lieferant, Betrag, Intervall, nächste Fälligkeit
  - Überfällig-Warnung wenn erwartete Rechnung ausbleibt (7 Tage Toleranz)
  - Link "Alle laufenden Kosten anzeigen" → InvoicesPage mit recurring-Filter

### Neue Dateien (Phase 14)

| Datei | Zweck |
|-------|-------|
| `server/src/services/recurring.service.ts` | Laufende Kosten Service (CRUD + Pattern-Detection + Summary) |
| `server/src/routes/admin.routes.ts` | Super-Admin Routes (Tenant-Liste, Stats, Switch) |
| `server/src/scripts/create-superadmin.ts` | CLI: Super-Admin erstellen/promoten |
| `client/src/pages/ResetPasswordPage.tsx` | Passwort zurücksetzen (Token aus URL) |
| `prisma/migrations/20260226200000_add_lockout_password_reset_superadmin/` | Lockout + Reset + SuperAdmin Felder |
| `prisma/migrations/20260226210000_add_recurring_costs/` | Recurring Cost Felder + Index |

### Verifikation (Phase 14)

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ Prisma-Migrationen erstellt und angewandt (2 Migrationen)
- ✅ Prisma-Client regeneriert

---

## Phase 15: Inbox Triage + Split-View (Session 19 — 27.02.2026)

### Übersicht

Inbox wurde von einfacher Liste zur **Triage-Station** umgebaut. Belege werden im Split-Screen angezeigt, geprüft ob es tatsächlich Rechnungen sind, und dann gezielt "zur Prüfung gesendet" oder gelöscht. InvoicesPage (Check) zeigt nur bereits triagierte Belege.

### Architektur-Entscheidung: `inboxCleared` Boolean

Neues Boolean-Feld `inboxCleared` (default `false`) auf Invoice statt neuem Status-Enum:
- **InboxPage** zeigt `inboxCleared = false` (neue, ungesichtete Belege)
- **InvoicesPage (Check)** zeigt `inboxCleared = true` (triagierte + archivierte Belege)
- OCR-Pipeline (`processingStatus`) bleibt komplett unberührt

### Split-View Infrastruktur

- [x] **DocumentViewer**: PDF/Bild-Viewer mit zoom, rotate, fullscreen
- [x] **InvoiceSplitView**: 60/40 Layout (Dokument links, Daten rechts) mit resize handle
- [x] **ValidatedField**: Feld-Label mit Validierungs-Ampel (grün/gelb/rot) aus Prüfergebnis

### Inbox Triage Workflow

- [x] **DB-Schema**: `inboxCleared Boolean @default(false)`, `inboxClearedAt DateTime?`, Index `[tenantId, inboxCleared]`
- [x] **Prisma-Migration**: `20260227100000_add_inbox_cleared` + Data-Migration (bestehende archivierte → `inboxCleared = true`)
- [x] **API-Endpoints**:
  - `POST /invoices/:id/triage` — Einzelnen Beleg zur Prüfung senden (setzt `inboxCleared = true`)
  - `POST /invoices/batch-triage` — Batch-Triage für Mehrfachauswahl
  - `GET /invoices?inboxCleared=false` — Inbox-Filter
  - `GET /invoices?inboxCleared=true` — Check-Filter (Default in InvoicesPage)
- [x] **Auto-Clear bei Archivierung**: `archiveInvoiceInTransaction()` setzt automatisch `inboxCleared = true`
- [x] **Direct Upload Bypass**: Upload in InvoicesPage setzt `inboxCleared = true` via FormData-Parameter → überspringt Inbox

### InboxPage (Rewrite)

- [x] Split-View mit InvoiceSplitView (Desktop) — Dokument links, InboxTriagePanel rechts
- [x] FullScreenPanel für Mobile
- [x] Batch-Selektion mit Checkboxen + "Alle auswählen"
- [x] Batch-Toolbar: "X ausgewählt → Zur Prüfung senden"
- [x] Auto-Refresh bei Processing-Status (refetchInterval: 5s)
- [x] Leerer State wenn Inbox leer ("Alles gesichtet!")

### InboxTriagePanel (Neu)

- [x] Vereinfachte Detail-Ansicht: Lieferant/Kunde, Rechnungsdaten, Beträge
- [x] ValidatedField für alle Kernfelder mit Ampel-Status
- [x] Issues-Summary (RED/YELLOW Prüfungen, max 5)
- [x] Sticky Action-Buttons: "Zur Prüfung senden" (grün) + "Kein Beleg / Löschen" (rot)
- [x] Processing-Indicator für UPLOADED/PROCESSING Belege

### InvoicesPage Anpassungen

- [x] Default-Filter: `inboxCleared: true` (zeigt nur triagierte Belege)
- [x] Upload-Dialog mit `inboxCleared` Prop → Direkt-Upload überspringt Inbox
- [x] URL-Parameter `?id=` für Deep-Links zu bestimmten Rechnungen

### Neue Dateien (Phase 15)

| Datei | Zweck |
|-------|-------|
| `client/src/components/DocumentViewer.tsx` | PDF/Bild-Viewer mit Zoom, Rotation, Fullscreen |
| `client/src/components/InvoiceSplitView.tsx` | 60/40 Split-Layout für Dokument + Daten |
| `client/src/components/ValidatedField.tsx` | Feld mit Validierungs-Ampel |
| `client/src/components/InboxTriagePanel.tsx` | Triage-Panel für Inbox (vereinfachte Detail-Ansicht + Aktionen) |
| `prisma/migrations/20260227100000_add_inbox_cleared/` | inboxCleared Feld + Index + Data-Migration |

### Verifikation (Phase 15)

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ Prisma-Migration erstellt und angewandt
- ✅ API-Endpunkte getestet: Login, Inbox-Filter (0 Items), Check-Filter (8 Items)
- ✅ Server-Health: DB, Redis, LLM alle OK

---

## Phase 16: Genehmigungs-Regeln V1 (Dynamische Absetzbarkeits-Regeln + Approve/Archive-Trennung) ✅

**27. Februar 2026** — Neues DeductibilityRule-System für strukturierte Rechnungsgenehmigung + APPROVED-Status als eigene Stufe vor Archivierung.

### Konzeptdokument

`docs/Konzept & Umsetzung_ Dynamische Genehmigungs-Regeln (V2 mit Privat-Logik).md` — V1-Teil (Standard-Regeln, CRUD, Genehmigungs-Dialog, Approve/Archive-Trennung)

### DeductibilityRule System

- [x] **DB-Schema**: `DeductibilityRule` Tabelle (tenantId, name, vatDeductionPercent, expenseDeductionPercent, accountNumber, isDefault, isSystem, sortOrder)
- [x] **10 Standard-Regeln** (österreichisches Steuerrecht):
  1. Voll abzugsfähig (100/100)
  2. Nicht betrieblich privat (0/0)
  3. Bewirtung 50% (50/100)
  4. Bewirtung Werbezweck (100/100)
  5. Repräsentation (0/50)
  6. PKW 50% privat (50/50)
  7. Handy 30% privat (70/70)
  8. Internet 20% privat (80/80)
  9. Arbeitszimmer 40% (40/40)
  10. Reisekosten Verpflegung (0/100)
- [x] **CRUD-API**: `GET/POST/PUT/DELETE /api/v1/deductibility-rules`, `POST /seed` Endpoint
- [x] **Auto-Seeding**: Bei Registrierung werden Standard-Regeln erstellt
- [x] **Regel-Engine**: `approvalRuleId` + `approvedVstPercent` + `approvedExpensePercent` auf Invoice
- [x] **Genehmigungs-Dialog**: Regel-Dropdown mit VSt/BA-Vorschau, manuelle Überschreibung möglich
- [x] **Batch-Genehmigung**: Einheitliche Regel für ausgewählte Rechnungen

### APPROVED Status (Approve ≠ Archive)

- [x] **Neuer Status**: `APPROVED` zwischen PROCESSED/REVIEW_REQUIRED und ARCHIVED
- [x] **Getrennte Endpoints**:
  - `POST /invoices/:id/approve` — Setzt APPROVED + Regel
  - `POST /invoices/:id/archive` — APPROVED → ARCHIVED (Nummerierung + Stempel + S3)
  - `POST /invoices/batch-approve` — Batch-Genehmigung
  - `POST /invoices/batch-archive` — Batch-Archivierung
- [x] **Archivierung nur ab APPROVED**: archiveInvoice prüft Status
- [x] **Client**: Getrennte "Genehmigen" + "Archivieren" Buttons, APPROVED Badge (blau), Filter

### Settings: Regelverwaltung

- [x] Tabelle mit System/Custom Badge, VSt/BA %, Konto
- [x] Create/Edit Dialog für Custom-Regeln
- [x] System-Regeln sind nicht löschbar

### Neue Dateien (Phase 16)

| Datei | Zweck |
|-------|-------|
| `server/src/services/deductibilityRule.service.ts` | Regel CRUD + Seeding |
| `server/src/routes/deductibilityRule.routes.ts` | REST-Endpoints |
| `client/src/api/deductibilityRules.ts` | API-Client |
| `prisma/migrations/20260227120000_add_deductibility_rules/` | DeductibilityRule Tabelle + Invoice-Felder |
| `prisma/migrations/20260227150000_add_approved_status/` | APPROVED Status + approvalRule Relation |

### Geänderte Dateien (Phase 16)

| Datei | Änderung |
|-------|----------|
| `prisma/schema.prisma` | DeductibilityRule Model, ProcessingStatus +APPROVED, Invoice +5 Approval-Felder |
| `shared/src/types.ts` | DeductibilityRuleItem, Invoice Types +approval Felder |
| `shared/src/constants.ts` | DEFAULT_DEDUCTIBILITY_RULES, PROCESSING_STATUS +APPROVED |
| `shared/src/validation.ts` | create/updateDeductibilityRuleSchema, approveInvoiceSchema erweitert |
| `server/src/services/invoice.service.ts` | approveInvoice mit Regel-Logik, archiveInvoice nur ab APPROVED |
| `server/src/services/archival.service.ts` | Stempel mit Regelname |
| `server/src/routes/invoice.routes.ts` | Getrennte approve/archive Routes |
| `server/src/app.ts` | DeductibilityRule Routes registriert |
| `client/src/pages/InvoicesPage.tsx` | ApproveDialog, BatchApproveDialog, APPROVED Filter + Buttons |
| `client/src/pages/SettingsPage.tsx` | DeductibilityRules Verwaltung |
| `client/src/components/layout/AppLayout.tsx` | Nav unverändert |

### Verifikation (Phase 16)

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ Prisma-Migrationen erstellt und angewandt (2 Migrationen)

---

## Phase 17: Genehmigungs-Regeln V2 — Privat-Logik + GmbH-Fähigkeit ✅

**27. Februar 2026** — Erweiterung der Genehmigungs-Regeln um `ruleType` (Standard/Privatentnahme/Privateinlage) + Gesellschafter-Verrechnungskonto für GmbH/Bilanzierer. **BMD-kritisch: Daten müssen 1:1 importierbar sein.**

### Konzeptdokument

`docs/Konzept & Umsetzung_ Dynamische Genehmigungs-Regeln (V2 mit Privat-Logik).md`

### Kernkonzept: ruleType vs. privatePercent

| Feld | Bedeutung | Beispiel |
|------|-----------|---------|
| `privatePercent` | Teilweise privat (Anteil %) | 30% Handy → 70% abzugsfähig |
| `ruleType = private_withdrawal` | 100% privat, gesamte Rechnung | Konto 9600, 0 VSt, 0 BA |
| `ruleType = private_deposit` | Vom Privatkonto bezahlt | Normaler Aufwand, Gegenkonto 9610 |

### Buchhaltungs-Logik (BMD-Export)

| ruleType | E/A-Rechner | GmbH (ACCRUAL) |
|----------|-------------|----------------|
| `standard` | Normaler Export (wie bisher) | Normaler Export (wie bisher) |
| `private_withdrawal` | Konto 9600, 0 VSt, 0 BA | Konto 9600 + **Forderung an Gesellschafter** |
| `private_deposit` | Normaler Aufwand + Gegenkonto 9610 | Normaler Aufwand + **Verbindlichkeit ggü. Gesellschafter** |

### DB-Schema Änderungen

- [x] **DeductibilityRule**: +`ruleType` (String, default "standard"), +`createsReceivable` (Boolean, default false)
- [x] **ShareholderTransaction**: Neues Model (tenantId, userId, invoiceId?, transactionType RECEIVABLE/PAYABLE, amount Decimal(12,2), status OPEN/PAID, paidAt)
- [x] **2 neue Enums**: ShareholderTransactionType, ShareholderTransactionStatus
- [x] **Relationen**: Tenant, User, Invoice → ShareholderTransaction

### 3 neue Standard-Regeln (+ 10 bestehende = 13 gesamt)

| # | Name | VSt | BA | ruleType | createsReceivable |
|---|------|-----|-----|----------|-------------------|
| 11 | Privatentnahme (E/A) | 0% | 0% | private_withdrawal | false |
| 12 | Forderung Gesellschafter (GmbH) | 0% | 0% | private_withdrawal | true |
| 13 | Privateinlage | 100% | 100% | private_deposit | false |

Bestehende Regel "Nicht betrieblich (privat)" → `ruleType: 'private_withdrawal'`

### ShareholderTransaction Service (neu)

- [x] `createTransaction()` — Erstellt Forderung/Verbindlichkeit (mit Audit-Log)
- [x] `listTransactions(tenantId, opts?)` — Paginiert mit Status/Type-Filter
- [x] `getOpenBalance(tenantId)` — Aggregiert: totalReceivable, totalPayable, netBalance, openCount
- [x] `markAsPaid(tenantId, id, userId)` — Status → PAID (mit Audit-Log)
- [x] `getTransactionsByInvoice(tenantId, invoiceId)` — Für Invoice-Detail

### API-Endpoints (neu)

- [x] `GET /api/v1/shareholder-transactions` — Liste mit Status/Type-Filter
- [x] `GET /api/v1/shareholder-transactions/balance` — Offener Saldo
- [x] `PATCH /api/v1/shareholder-transactions/:id/pay` — Als bezahlt markieren (ADMIN only)

### Approval-Flow Erweiterung (Kernstück)

- [x] `approveInvoice()`: Nach Genehmigung prüft `rule.ruleType` + `tenant.accountingType`:
  - `private_withdrawal` + ACCRUAL + createsReceivable → RECEIVABLE ShareholderTransaction
  - `private_deposit` + ACCRUAL → PAYABLE ShareholderTransaction
  - E/A: Keine Seiteneffekte (Export handled by ruleType)

### BMD-Export Anpassung (BMD-KRITISCH)

- [x] **Privatentnahme**: Konto 9600, Gegenkonto Bank/Kassa, 0 VSt, 0 BA, kein Steuercode
- [x] **Privateinlage**: Normales Aufwandskonto, Gegenkonto 9610, normale VSt/BA
- [x] **Standard**: Unverändert
- [x] **Neue Spalte**: "Buchungsart" (Standard/Privatentnahme/Privateinlage)

### Archival-Stempel

- [x] PDF-Stempel-Prefix bei ruleType:
  - `private_withdrawal` → "⚠ Privatentnahme — {Regelname}"
  - `private_deposit` → "↗ Privateinlage — {Regelname}"

### Client: Genehmigungs-Dialog Info-Boxen

- [x] **ApproveDialog + BatchApproveDialog**: ruleType-basierte Hinweise:
  - `private_withdrawal` + E/A: "Privatentnahme → Konto 9600, kein VSt/BA"
  - `private_withdrawal` + GmbH: "Erzeugt Forderung an Gesellschafter — verdeckte Gewinnausschüttung beachten!"
  - `private_deposit` + E/A: "Privateinlage → Gegenkonto 9610"
  - `private_deposit` + GmbH: "Erzeugt Verbindlichkeit gegenüber Gesellschafter"

### Client: Verrechnungskonto-Seite (GmbH only)

- [x] Route `/shareholder-account` (nur sichtbar bei `accountingType === 'ACCRUAL'`)
- [x] 3 Saldo-Karten: Forderungen (rot), Verbindlichkeiten (blau), Netto-Saldo
- [x] Filtertabs: Alle/Offen/Bezahlt
- [x] Transaktions-Tabelle mit "Als bezahlt markieren" Button
- [x] Navigation: "Verrechnungskonto" mit Scale-Icon in Sidebar (ACCRUAL only)

### Client: Dashboard-Widget (GmbH only)

- [x] "Gesellschafter-Verrechnungskonto" Widget (nur bei ACCRUAL)
- [x] 3 Werte: Forderungen, Verbindlichkeiten, Netto-Saldo
- [x] Farbcodiert: Rot (Forderungen > 0), Grün (0)
- [x] Link zur Verrechnungskonto-Seite

### Client: Settings Erweiterung

- [x] Regeltabelle zeigt ruleType-Badges (Privatentnahme/Privateinlage) unter System/Custom Badge

### Neue Dateien (Phase 17)

| Datei | Zweck |
|-------|-------|
| `server/src/services/shareholderTransaction.service.ts` | ShareholderTransaction CRUD + Balance |
| `server/src/routes/shareholderTransaction.routes.ts` | REST-Endpoints |
| `client/src/api/shareholderTransactions.ts` | API-Client |
| `client/src/pages/ShareholderAccountPage.tsx` | Verrechnungskonto-Seite (GmbH) |
| `prisma/migrations/20260227200000_add_v2_deductibility_rules/` | ruleType + createsReceivable + ShareholderTransaction |

### Geänderte Dateien (Phase 17)

| Datei | Änderung |
|-------|----------|
| `prisma/schema.prisma` | +ruleType, +createsReceivable auf DeductibilityRule, +ShareholderTransaction Model + 2 Enums |
| `shared/src/types.ts` | +RuleTypeValue, +ShareholderTransactionItem, +ShareholderBalanceSummary, DeductibilityRuleItem erweitert |
| `shared/src/constants.ts` | +RULE_TYPES, +RULE_TYPE_LABELS, +3 neue Regeln, +Konto 3500, bestehende Regeln erweitert |
| `shared/src/validation.ts` | Rule-Schemas +ruleType/createsReceivable, +markShareholderTransactionPaidSchema |
| `server/src/services/deductibilityRule.service.ts` | Seed/Create/Update/Format für neue Felder |
| `server/src/services/invoice.service.ts` | approveInvoice: ruleType-Logik → ShareholderTransaction erstellen |
| `server/src/services/export.service.ts` | **BMD-KRITISCH**: 3 Code-Pfade nach ruleType, +Buchungsart Spalte |
| `server/src/services/archival.service.ts` | Stempel mit ruleType-Prefix |
| `server/src/app.ts` | shareholderTransaction Routes registriert |
| `client/src/api/deductibilityRules.ts` | +ruleType, +createsReceivable in Create/Update |
| `client/src/pages/InvoicesPage.tsx` | ApproveDialog + BatchApproveDialog: ruleType Info-Boxen |
| `client/src/pages/DashboardPage.tsx` | +Gesellschafter-Verrechnungskonto Widget (ACCRUAL) |
| `client/src/pages/SettingsPage.tsx` | +ruleType Badges in Regeltabelle |
| `client/src/components/layout/AppLayout.tsx` | +Verrechnungskonto Nav-Item (ACCRUAL only) |
| `client/src/App.tsx` | +/shareholder-account Route |

### Verifikation (Phase 17)

- ✅ `npm run build` — shared + server + client kompilieren ohne Fehler
- ✅ Prisma-Migration erstellt und angewandt
- ✅ Prisma-Client regeneriert
