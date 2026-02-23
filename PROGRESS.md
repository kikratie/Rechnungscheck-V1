# PROGRESS.md – Ki2Go Accounting

**Letzte Aktualisierung:** 23. Februar 2026 (Session 8)

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
| `sequential_numbers` | Fortlaufende Nummerierung ER/AR-JJJJ-NNNNN | OFFEN — Prio 2 |
| `llm_config` | Admin-konfigurierbare LLM-Einstellungen | OFFEN — MVP nutzt env-Konfiguration |
| `storage_config` | Admin-konfigurierbare Storage-Einstellungen | NIEDRIG — hardcoded reicht für MVP |

### Fehlende Backend-Module (laut Konzept)

| Modul | Zweck | Ist-Stand |
|-------|-------|-----------|
| `/modules/ingestion` | Upload, E-Mail, Scan, WhatsApp | ✅ Upload implementiert (Multer + S3) |
| `/modules/ocr` | Dreistufige Erkennungs-Pipeline | ✅ Implementiert (pdf-parse → Vision → sharp) |
| `/modules/llm` | LLM-Abstraktionsschicht | ✅ Implementiert (OpenAI, env-konfiguriert) |
| `/modules/validation` | Regel-Engine (§11 UStG) | ✅ 18 Prüfregeln + Ampel-Logik |
| `/modules/workflow` | Ampel, Nummerierung, Archivierung | ✅ Ampel + Approve/Reject, Nummerierung offen |
| `/modules/reconciliation` | Bankabgleich-Algorithmen | Nur DB-Matchings, keine Algorithmen |
| `/modules/export` | CSV/BMD-Export-Generierung | Stub-Route |
| `/modules/communication` | Mail-Versand | Nicht implementiert |
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

### Prio 2: Workflow & Bankabgleich

- [ ] **Fortlaufende Nummerierung** (ER-JJJJ-NNNNN / AR-JJJJ-NNNNN)
  - `sequential_numbers` Tabelle
  - Nummernlücken-Warnung
- [ ] **Bankkonten-Verwaltung** (CRUD `/api/bank-accounts`)
- [ ] **CSV-Import für Kontoauszüge** (Parsing verschiedener Bankformate)
- [ ] **Matching-Algorithmen** (3-stufig)
  - Exakt: Betrag + Rechnungsnr. im Verwendungszweck
  - Betrags-Match: Betrag + Lieferantenname
  - Fuzzy: Betrag ±2% + Datum ±5 Tage
- [x] **Gruppenfreigabe** (alle grünen per Klick) → Phase 3: Batch-Genehmigung

### Prio 3: Export & Kommunikation

- [ ] **BMD CSV-Export** (Semikolon, ISO-8859-1, dd.MM.yyyy)
- [ ] **Editierbare Exportfelder** (Export-Templates)
- [ ] **Korrektur-Mail an Lieferant** (E-Mail aus Rechnung extrahiert)
- [ ] **E-Mail-Weiterleitung** (IMAP-Listener)

### Prio 4: Eingangskanäle

- [ ] **Mobiler Scan (PWA)** — Kamerazugriff, Dokumentenerkennung, Perspektivkorrektur
- [ ] **WhatsApp-Bot** — Webhook-Endpunkt

### Prio 5: Admin-Backend

- [ ] **LLM-Konfiguration UI** (Provider, Modell, API-Key, Fallback)
- [ ] **Storage-Konfiguration UI**
- [ ] **Mandantenverwaltung** (alle Mandanten als Admin)
- [ ] **Nutzerverwaltung** (mandantenübergreifend)

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
