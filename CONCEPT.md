

# CONCEPT.md – Ki2Go Accounting

**Referenzdokument für Claude AI** | **Version:** 1.0 | **Datum:** 19. Februar 2026

---

## 1. Auftrag und Kernziel

Dein Auftrag ist die Entwicklung des **Minimum Viable Product (MVP)** für die Buchhaltungs-Automatisierungsplattform **Ki2Go Accounting**. Du schreibst den gesamten Code für ein modulares Fullstack-Projekt. Das Ziel ist ein funktionsfähiges, testbares und erweiterbares MVP, das die Kern-Workflows abdeckt.

> **Das Kernziel:** Ein österreichischer Einzelunternehmer (E/A-Rechner) spart Zeit bei der Rechnungskontrolle und senkt seine Buchhaltungskosten, weil er perfekt aufbereitete, importfertige Unterlagen an seinen externen Steuerberater liefert.

**Unser USP:** Der automatische Bankabgleich (Bank-Reconciliation) – kein Mitbewerber am österreichischen Markt bietet das. Kombiniert mit der tiefen Rechnungsprüfung nach §11 UStG und dem importfertigen BMD-Export ist Ki2Go die einzige Lösung, die den gesamten Prozess von der Belegsammlung bis zum fertigen Buchhaltungsexport abdeckt.

**UX-Designprinzip:** Die Komplexität läuft unter der Haube. Der Unternehmer sieht nur die Ampel (Grün/Gelb/Rot). Alle technischen Details (Betragsklassen, UID-Validierung, Reverse Charge, Matching-Algorithmen) sind unsichtbar. Bei Klick öffnet sich das Detail mit konkreten Kommentaren und KI-Begründungen.

---

## 2. Tech-Stack (final)

| Komponente | Technologie | Begründung |
|---|---|---|
| **Containerisierung** | Docker + Docker Compose | Identische Auslieferung als SaaS und On-Premise |
| **Hosting (SaaS)** | Hostinger VPS (EU-Server) | Kosteneffizient, DSGVO-konform |
| **Frontend** | React 18 + TypeScript + Vite + TailwindCSS | PWA für mobilen Scan, getrenntes Frontend-Projekt |
| **Backend** | Node.js + TypeScript + Express.js | Getrenntes Backend-Projekt, ideal für asynchrone KI-API-Aufrufe |
| **Datenbank** | PostgreSQL + Drizzle ORM | ACID-konform (Pflicht für Buchhaltung), JSONB für KI-Daten |
| **Dateispeicherung** | Cloudflare R2 (S3-kompatibel) | Kein Egress-Kosten, Object Lock für Revisionssicherheit |
| **Authentifizierung** | JWT + bcrypt | Eigene Auth für On-Premise-Kompatibilität |
| **OCR/KI** | OpenAI GPT-4 Vision | Über austauschbare LLM-Abstraktionsschicht |
| **E-Mail** | Nodemailer (Versand) + IMAP (Empfang) | Für E-Mail-Weiterleitung und Korrektur-Mails |
| **PDF/Bild** | pdf-parse (Text) + sharp (Bilder) | Leichtgewichtig, performant |

---

## 3. Projekt- und Ordnerstruktur

```
/ki2go
  /packages
    /frontend
      /src
        /components
        /pages
        /hooks
        /services
    /backend
      /src
        /modules
          /core          # Auth, Mandanten, Nutzer, Rollen
          /ingestion     # Upload, E-Mail, Scan, WhatsApp
          /ocr           # Dreistufige Erkennungs-Pipeline
          /llm           # LLM-Abstraktionsschicht
          /validation    # Regel-Engine (§11 UStG)
          /workflow      # Ampel, Nummerierung, Archivierung
          /reconciliation # Bankabgleich, Kreditkarten
          /export        # CSV/BMD-Export
          /communication # Mail-Versand (Korrektur, Mahnung)
          /admin         # Admin-Backend
          /audit         # Revisionssicheres Logging
          /connectors    # Portal-Connectoren (Stufe 2+)
        /config
        /middleware
        /routes
        server.ts
    /shared
      /types
      /utils
  /docs
  docker-compose.yml
  package.json
```

---

## 4. Datenbank-Schema (PostgreSQL mit Drizzle ORM)

### 4.1. MVP-Tabellen (Stufe 1)

```sql
-- Mandanten (Unternehmen)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    uid_number VARCHAR(20),
    address TEXT,
    legal_form VARCHAR(50),
    tax_regime VARCHAR(50),
    package VARCHAR(50) DEFAULT 'starter',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Nutzer
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user', 'accountant')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bankkonten pro Mandant
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    account_name VARCHAR(255) NOT NULL,
    iban VARCHAR(34),
    bic VARCHAR(11),
    bank_name VARCHAR(255),
    account_type VARCHAR(50) CHECK (account_type IN ('bank', 'credit_card', 'paypal', 'stripe')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hochgeladene Dokumente (Rechnungen)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id),
    sequential_number VARCHAR(100),
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('incoming_invoice', 'outgoing_invoice', 'credit_note', 'advance_invoice', 'final_invoice')),
    ingestion_channel VARCHAR(50) CHECK (ingestion_channel IN ('upload', 'email', 'scan', 'whatsapp', 'onedrive', 'api')),
    ingestion_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    file_path VARCHAR(1024) NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending_ocr' CHECK (status IN ('pending_ocr', 'ocr_processing', 'pending_review', 'approved', 'archived', 'rejected', 'error')),
    validation_status VARCHAR(20) CHECK (validation_status IN ('green', 'yellow', 'red')),
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Extrahierte Rechnungsdaten (KI-Output)
CREATE TABLE extracted_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER DEFAULT 1,
    issuer_name VARCHAR(255),
    issuer_address TEXT,
    issuer_uid VARCHAR(20),
    issuer_firmenbuch VARCHAR(50),
    issuer_email VARCHAR(255),
    issuer_iban VARCHAR(34),
    recipient_name VARCHAR(255),
    recipient_address TEXT,
    recipient_uid VARCHAR(20),
    invoice_number VARCHAR(100),
    invoice_date DATE,
    delivery_date DATE,
    delivery_period_start DATE,
    delivery_period_end DATE,
    net_amount DECIMAL(12, 2),
    tax_rate DECIMAL(5, 2),
    tax_amount DECIMAL(12, 2),
    gross_amount DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    item_description TEXT,
    is_reverse_charge BOOLEAN DEFAULT FALSE,
    reverse_charge_note TEXT,
    payment_terms TEXT,
    due_date DATE,
    raw_data JSONB,
    confidence_scores JSONB,
    is_manually_corrected BOOLEAN DEFAULT FALSE,
    corrected_by UUID REFERENCES users(id),
    corrected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Validierungsergebnisse (Regel-Engine Output)
CREATE TABLE validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    overall_status VARCHAR(20) NOT NULL CHECK (overall_status IN ('green', 'yellow', 'red')),
    checks JSONB NOT NULL,
    amount_class VARCHAR(50),
    comments TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Banktransaktionen (aus CSV-Import)
CREATE TABLE bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    bank_account_id UUID REFERENCES bank_accounts(id),
    transaction_date DATE NOT NULL,
    value_date DATE,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    counterparty_name VARCHAR(255),
    counterparty_iban VARCHAR(34),
    reference TEXT,
    description TEXT,
    transaction_type VARCHAR(50),
    is_reconciled BOOLEAN DEFAULT FALSE,
    import_batch_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Verknüpfung Rechnungen <-> Transaktionen
CREATE TABLE reconciliation_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    match_type VARCHAR(50) CHECK (match_type IN ('exact', 'amount', 'fuzzy', 'manual')),
    confidence DECIMAL(5, 2),
    linked_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fortlaufende Nummerierung
CREATE TABLE sequential_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    prefix VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    last_number INTEGER DEFAULT 0,
    UNIQUE(company_id, prefix, year)
);

-- LLM-Konfiguration
CREATE TABLE llm_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_name VARCHAR(100) NOT NULL UNIQUE,
    primary_provider VARCHAR(50) NOT NULL,
    primary_model VARCHAR(100) NOT NULL,
    primary_api_key_encrypted TEXT,
    fallback_provider VARCHAR(50),
    fallback_model VARCHAR(100),
    fallback_api_key_encrypted TEXT,
    endpoint_url VARCHAR(500),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Storage-Konfiguration
CREATE TABLE storage_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL DEFAULT 'cloudflare_r2',
    endpoint_url VARCHAR(500),
    access_key_encrypted TEXT,
    secret_key_encrypted TEXT,
    bucket_name VARCHAR(255),
    region VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit-Log (revisionssicher)
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    company_id UUID REFERENCES companies(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Export-Templates
CREATE TABLE export_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    format VARCHAR(50) DEFAULT 'bmd',
    field_mapping JSONB NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2. Indizes

```sql
CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_validation ON documents(validation_status);
CREATE INDEX idx_extracted_data_document ON extracted_data(document_id);
CREATE INDEX idx_bank_transactions_company ON bank_transactions(company_id);
CREATE INDEX idx_bank_transactions_reconciled ON bank_transactions(is_reconciled);
CREATE INDEX idx_reconciliation_links_document ON reconciliation_links(document_id);
CREATE INDEX idx_reconciliation_links_transaction ON reconciliation_links(transaction_id);
CREATE INDEX idx_audit_log_company ON audit_log(company_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
```

---

## 5. API-Endpunkte (REST-API)

### 5.1. Authentifizierung

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| POST | `/api/auth/register` | Neuen Nutzer + Mandant registrieren |
| POST | `/api/auth/login` | Login, JWT zurückgeben |
| POST | `/api/auth/refresh` | JWT erneuern |
| GET | `/api/auth/me` | Eigenes Profil abrufen |

### 5.2. Dokumente (Rechnungen)

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| POST | `/api/documents/upload` | Rechnung(en) hochladen (multipart/form-data) |
| GET | `/api/documents` | Alle Rechnungen des Mandanten (Filter, Sortierung, Pagination) |
| GET | `/api/documents/:id` | Einzelne Rechnung mit extrahierten Daten und Prüfstatus |
| PUT | `/api/documents/:id` | Manuelle Korrektur der extrahierten Daten |
| POST | `/api/documents/:id/approve` | Rechnung freigeben |
| POST | `/api/documents/archive` | Eine oder mehrere Rechnungen archivieren |
| POST | `/api/documents/:id/reject` | Rechnung ablehnen |

### 5.3. Bankabgleich

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| POST | `/api/reconciliation/upload-statement` | Kontoauszug (CSV) hochladen |
| GET | `/api/reconciliation/status` | Status des Bankabgleichs (zugeordnet, offen) |
| POST | `/api/reconciliation/link` | Manuell Rechnung mit Transaktion verknüpfen |
| DELETE | `/api/reconciliation/link/:id` | Verknüpfung aufheben |
| GET | `/api/reconciliation/unmatched` | Nicht zugeordnete Transaktionen |

### 5.4. Bankkonten

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/bank-accounts` | Alle Bankkonten des Mandanten |
| POST | `/api/bank-accounts` | Neues Bankkonto anlegen |
| PUT | `/api/bank-accounts/:id` | Bankkonto bearbeiten |
| DELETE | `/api/bank-accounts/:id` | Bankkonto deaktivieren |

### 5.5. Export

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| POST | `/api/export/bmd` | BMD-kompatiblen CSV-Export generieren |
| GET | `/api/export/templates` | Export-Templates abrufen |
| POST | `/api/export/templates` | Neues Export-Template anlegen |

### 5.6. Admin

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| GET | `/api/admin/companies` | Alle Mandanten verwalten |
| GET | `/api/admin/users` | Alle Nutzer verwalten |
| GET | `/api/admin/llm-config` | LLM-Konfiguration abrufen |
| PUT | `/api/admin/llm-config/:id` | LLM-Konfiguration aktualisieren |
| GET | `/api/admin/storage-config` | Storage-Konfiguration abrufen |
| PUT | `/api/admin/storage-config` | Storage-Konfiguration aktualisieren |
| GET | `/api/admin/audit-log` | Audit-Log abrufen (mit Filter) |

### 5.7. WhatsApp Webhook

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| POST | `/api/whatsapp/webhook` | Bild entgegennehmen, als neues Dokument anlegen |

### 5.8. E-Mail

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| POST | `/api/email/send-correction` | Korrektur-Mail an Lieferant senden |

---

## 6. Österreichische Rechnungsprüfungskriterien (Regel-Engine)

Die Regel-Engine ist das Herzstück der Compliance. Sie prüft alle extrahierten Daten gegen das österreichische Steuer- und Unternehmensrecht. Die Rechtsgrundlagen sind das Umsatzsteuergesetz (UStG), das Unternehmensgesetzbuch (UGB) und die Bundesabgabenordnung (BAO).

### 6.1. Betragsklassen-Logik (§11 UStG)

Die Prüftiefe hängt vom Bruttobetrag der Rechnung ab. Dies ist die fundamentale Wenn-Dann-Logik der Regel-Engine.

**Kleinbetragsrechnung (bis 400 EUR brutto):**

| Pflichtmerkmal | Rechtsgrundlage | Feld in extracted_data |
|---|---|---|
| Name und Anschrift des Ausstellers | §11 Abs. 6 Z 1 UStG | `issuer_name`, `issuer_address` |
| Menge und handelsübliche Bezeichnung | §11 Abs. 6 Z 2 UStG | `item_description` |
| Tag der Lieferung/Leistung | §11 Abs. 6 Z 3 UStG | `delivery_date` |
| Gesamtbetrag (Brutto) | §11 Abs. 6 Z 4 UStG | `gross_amount` |
| Steuersatz (20%, 13%, 10%) | §11 Abs. 6 Z 5 UStG | `tax_rate` |
| Ausstellungsdatum | §11 Abs. 6 UStG | `invoice_date` |

**Standardrechnung (über 400 EUR brutto) – zusätzlich zu oben:**

| Pflichtmerkmal | Rechtsgrundlage | Feld in extracted_data |
|---|---|---|
| Name und Anschrift des Leistungsempfängers | §11 Abs. 1 UStG | `recipient_name`, `recipient_address` |
| UID-Nummer des leistenden Unternehmers | §11 Abs. 1 UStG | `issuer_uid` |
| Fortlaufende Rechnungsnummer | §11 Abs. 1 UStG | `invoice_number` |
| Separate Ausweisung von Netto und USt | §11 Abs. 1 UStG | `net_amount`, `tax_amount` |

**Grossbetragsrechnung (über 10.000 EUR brutto) – zusätzlich zu oben:**

| Pflichtmerkmal | Rechtsgrundlage | Feld in extracted_data |
|---|---|---|
| UID-Nummer des Leistungsempfängers | §11 Abs. 1 UStG | `recipient_uid` |

### 6.2. Rechtsformspezifische Prüfung (§14 UGB)

| Rechtsform | Pflichtangaben auf der Rechnung |
|---|---|
| Nicht protokolliertes Einzelunternehmen | Vor- und Zuname, Betriebsadresse |
| Eingetragenes Einzelunternehmen (e.U.) | Firma (lt. Firmenbuch), Rechtsformzusatz e.U., Sitz, FB-Nummer, FB-Gericht |
| GmbH | Vollständiger Firmenname, Rechtsform GmbH, Sitz, FB-Nummer, FB-Gericht |

### 6.3. Reverse Charge Prüfung (§19 UStG)

| Prüfpunkt | Erwartetes Ergebnis |
|---|---|
| Steuerausweis auf der Rechnung | Keiner – kein Steuerbetrag, kein Steuersatz |
| Pflichthinweis | "Übergang der Steuerschuld" oder "Reverse Charge" muss vorhanden sein |
| UID-Nummern | Beide UID-Nummern (Aussteller und Empfänger) müssen angegeben sein |

### 6.4. Spezialfälle

| Spezialfall | Prüflogik |
|---|---|
| **Gutschrift (§11 Abs. 8 UStG)** | Muss als Gutschrift bezeichnet sein. Rollen getauscht. Alle Merkmale vorhanden. |
| **Anzahlungsrechnung** | Als Anzahlungsrechnung gekennzeichnet. Leistungszeitraum angegeben. |
| **Schlussrechnung** | Anzahlungen und darauf entfallende Steuern offen abgesetzt. |
| **Fremdwährung** | Steuerbetrag auch in EUR. EZB-Wechselkurs stichtagsgenau. |

### 6.5. Automatische Validierungen

| Validierung | Methode | Stufe |
|---|---|---|
| **UID-Nummer** | Syntaktische Prüfung (MVP), VIES-API (Stufe 2) | MVP / Stufe 2 |
| **IBAN** | Syntaktische Prüfung (Länge, Prüfziffer, Länderkennzeichen) | MVP |
| **Mathematik** | Netto × Steuersatz = USt; Netto + USt = Brutto | MVP |
| **Steuersätze** | Nur gültige österreichische Sätze: 20%, 13%, 10% | MVP |
| **Handelsübliche Bezeichnung** | KI-Warnung bei vagen Begriffen ("Diverse Waren", "Sonstiges") | MVP |
| **Dublettenerkennung** | Gleiche Rechnungsnummer + gleicher Lieferant = Warnung | MVP |

### 6.6. Ampelsystem-Logik

| Farbe | Bedeutung | Kriterien |
|---|---|---|
| **Grün** | Alles in Ordnung, kann archiviert werden | Alle Pflichtmerkmale vorhanden, Mathematik korrekt, keine Warnungen |
| **Gelb** | Bitte kurz prüfen | Kleinere Mängel (z.B. fehlende FB-Nummer, niedrige Konfidenz bei einem Feld) |
| **Rot** | Hier stimmt etwas nicht | Kritische Mängel (z.B. fehlende UID, falsche USt, fehlende Pflichtmerkmale) |

---

## 7. Kern-Workflows

### 7.1. Workflow 1: Rechnungsverarbeitung

| Schritt | Aktion | Details |
|---|---|---|
| 1. Eingang | Beleg gelangt ins System | Über Eingangskanal. Eingangsdatum automatisch. Original in R2. |
| 2. KI-Analyse | Daten werden extrahiert | Dreistufige Pipeline. Konfidenz-Score pro Feld. JSON in DB. |
| 3. Regel-Validierung | Prüfung gegen §11 UStG | Regel-Engine prüft alle Felder. Prüfprotokoll mit Kommentaren. |
| 4. Ampel-Anzeige | Ergebnis im Dashboard | Grün/Gelb/Rot. Klick zeigt konkreten Mangel. |
| 5. Nummerierung | Fortlaufende Nummer | ER-JJJJ-NNNNN / AR-JJJJ-NNNNN. Lücken werden gemeldet. |
| 6a. Grün | Gruppenfreigabe | Per Klick gruppenweise archivieren. |
| 6b. Rot/Gelb | Einzelprüfung | Manuelle Korrektur. Mail an Lieferant bei Fehlern. |
| 7. Archivierung | Revisionsfest | Original + Prüfprotokoll + Daten in R2. Eingangsstempel auf PDF. |

### 7.2. Workflow 2: Bankabgleich (USP)

| Schritt | Aktion | Details |
|---|---|---|
| 1. Upload | Kontoauszug CSV hochladen | Multi-Konto-Fähigkeit (1 bis X Bankkonten). |
| 2. Analyse | Transaktionen auslesen | Datum, Betrag, Empfänger, Verwendungszweck, IBAN. |
| 3. Matching | Automatischer Abgleich | Stufe 1: Exakt (Betrag + Rechnungsnr. im Verwendungszweck). Stufe 2: Betrags-Match (Betrag + Lieferantenname). Stufe 3: Fuzzy (Betrag ±2% + Datum ±5 Tage). |
| 4. Dashboard | Ergebnis anzeigen | Grün (bezahlt), Rot (offen), Gelb (Buchung ohne Rechnung), Orange (Doppelzahlung). |
| 5. Manuell | Offene Posten lösen | Drag-and-Drop oder Dropdown-Zuordnung. |
| 6. Export | BMD-CSV generieren | Bezahlte Rechnungen, offene Posten, Prüfprotokoll. |

### 7.3. Hierarchischer Zahlungsströme-Abgleich

| Ebene | Zahlungsquelle | Stufe |
|---|---|---|
| Ebene 1 (Hauptkonto) | Bankkonto(en) – CSV | MVP |
| Ebene 2 (Kreditkarte) | Visa, Mastercard – CSV | MVP |
| Ebene 3 (Online) | PayPal, Stripe – CSV | Stufe 2 |

Das System erkennt Sammelabbuchungen (z.B. "VISA Monatsabrechnung") und verknüpft sie mit den Einzelposten der Kreditkartenabrechnung. So entsteht eine lückenlose Kette: Einzelbeleg → Kreditkartenposten → Sammelabbuchung.

---

## 8. OCR- und KI-Pipeline

### 8.1. Dreistufige Erkennungs-Pipeline

| Stufe | Anwendung | Technologie |
|---|---|---|
| 1. Textextraktion | Digitale PDFs mit eingebettetem Text | pdf-parse (schnell, fehlerfrei, kostenlos) |
| 2. KI-Vision | Scans, Fotos, Bilder | GPT-4 Vision (OCR + Extraktion + Klassifizierung in einem Aufruf) |
| 3. Bildvorverarbeitung | Thermobelege, schlechte Fotos | sharp (Entzerrung, Kontrast, Rauschunterdrückung, Zuschnitt) |

### 8.2. Konfidenz-Score pro Feld

| Konfidenz | Anzeige | Aktion |
|---|---|---|
| Über 95% | Feld grün hinterlegt | Automatisch übernommen |
| 70 bis 95% | Feld gelb hinterlegt | Nutzer sollte prüfen |
| Unter 70% | Feld rot hinterlegt | Nutzer muss manuell eingeben |

### 8.3. LLM-Abstraktionsschicht

Kein Teil der Anwendung ruft eine LLM-API direkt auf. Alles läuft über eine zentrale Abstraktionsschicht:

| Aufgabe | Primärer Provider | Modell | Fallback |
|---|---|---|---|
| Bilderkennung + Datenextraktion | OpenAI | GPT-4 Vision | Google Gemini 2.5 Flash |
| Mail-Generierung | OpenAI | GPT-4.1-nano | Google Gemini 2.5 Flash |
| KI-Begründungen | OpenAI | GPT-4.1-mini | Anthropic Claude 4 Haiku |

Jede Zeile ist im Admin-Backend editierbar. Neuer Provider, neues Modell, API-Key ändern – alles ohne Code-Änderung. API-Keys werden verschlüsselt in der DB gespeichert.

---

## 9. Eingangskanäle

| Kanal | Funktionsweise | Stufe |
|---|---|---|
| **Manueller Upload** | Drag-and-Drop, Dateiauswahl, Batch (ZIP). PDF, JPG, PNG. | MVP |
| **E-Mail-Weiterleitung** | Dedizierte Adresse (rechnungen@firma.ki2go.at). IMAP-Listener. | MVP |
| **Mobiler Scan (PWA)** | Kamera über PWA. Inklusive automatischer Dokumentenerkennung, Perspektivkorrektur und Sofort-Feedback. | MVP |
| **WhatsApp-Bot** | Foto per WhatsApp senden. Webhook-Endpunkt. Niedrigste Hemmschwelle. | MVP |
| **Automatischer E-Mail-Abruf** | IMAP/OAuth direkt an Mail-Accounts. | Stufe 2 |
| **OneDrive-Sync** | Microsoft Graph API. Definierte Ordner. | Stufe 2 |
| **Online-Portal-Download** | API-Connectoren für Top-5-Portale. | Stufe 2 |

### 9.1. Mobiler Scan: Anforderungen (PWA)

| Feature | Beschreibung |
|---|---|
| **Automatische Dokumentenerkennung** | Die Kamera erkennt die Ränder des Belegs automatisch und schneidet das Bild passend zu. |
| **Perspektivkorrektur** | Schief aufgenommene Fotos werden automatisch entzerrt, um die Texterkennung zu verbessern. |
| **Mehrfach-Scan** | Der Nutzer kann mehrere Belege direkt hintereinander scannen, ohne die Kamera-Ansicht verlassen zu müssen. |
| **Sofort-Feedback** | Unmittelbar nach dem Scan zeigt die App eine Vorschau der erkannten Daten zur schnellen Überprüfung an. |
| **Blitz-Steuerung** | Die App aktiviert bei schlechten Lichtverhältnissen automatisch den Blitz, um die Bildqualität zu sichern. |

---

## 10. Vollständiger Feature-Katalog mit Stufenzuordnung

### 10.1. MVP (Stufe 1 – Starter-Paket)

**Kernverarbeitung:** Computer Vision (GPT-4 Vision), Dublettenerkennung, IBAN-Prüfung, MwSt./Betrags-Prüfung, Betragsklassen-Logik, Reverse Charge Erkennung, Währungsumrechnung (EZB), Kreditkartenabrechnungen (CSV), KI-Begründungen pro Buchungsvorschlag.

**Workflow:** Manueller Upload (Drag-and-Drop, Batch), Mobiler Scan (PWA), WhatsApp-Bot, CSV-Bankabgleich (Multi-Konto), Ampelsystem (Grün/Gelb/Rot), Fortlaufende Nummerierung (ER/AR-JJJJ-NNNNN), Gruppenfreigabe, Review-Workflow, Digitaler Eingangsstempel, E-Mail-Weiterleitung.

**Kommunikation:** Mail-Funktion für Korrekturen an Lieferanten (E-Mail aus Rechnung extrahiert).

**Compliance:** Revisionssichere Protokollierung (Audit-Log), UID-Validierung (syntaktisch), Versionierung (Original + korrigierte Version), Nummernlücken-Warnung, Prüfprotokoll pro Rechnung.

**Export:** BMD-kompatibler CSV-Export mit editierbaren Exportfeldern.

**Admin:** Admin-Login, LLM-Konfiguration (UI), Storage-Konfiguration, Mandantenverwaltung, Nutzerverwaltung.

**Infrastruktur:** Multi-Mandanten von Anfang an, Rollensystem (admin, user), Docker + Docker Compose, Cloudflare R2 Anbindung.

### 10.2. Stufe 2 (Professional-Paket)

OneDrive-Sync, IMAP E-Mail-Abruf, Online-Portal-Connectoren (Top 5), PayPal-Abgleich, Mehrstufiges Freigabesystem, Fälligkeitskontrolle/Mahnwesen, Mahnungsmail-Vorschläge, Hierarchischer Kreditkartenabgleich, Konfigurierbarer Export (BMD NTCS, RZL), Kostenstellen-Zuordnung, Skonto-Prüfung, Kategorisierung/Regeln, Lieferanten-/Kundenstamm, KI-Betrugserkennung, Kommentarfunktion pro Beleg, Rechtskonforme Langzeitarchivierung (7 Jahre BAO), UID-Validierung über VIES-API, Rolle "accountant" (Steuerberater-Zugang).

### 10.3. Stufe 3 (Professional+)

Buchungslogik für doppelte Buchführung, Instant Learning, Erweiterte Steuerberater-Exporte, Reverse-Charge-Automatik (Verbuchung), Web-Scraping-Connectoren.

### 10.4. Stufe 4 (Enterprise)

Autopilot-Modus, Steuerung in natürlicher Sprache, PSD2-Bankschnittstelle, API-Zugriff, Cashflow-Analyse/Prognose, Lokale LLM-Modelle (Ollama).

---

## 11. Feature-Checkliste (MVP)

### Modul: Core (Auth & Mandanten)

- [ ] Nutzer-Registrierung: Neuer Nutzer + Mandant wird automatisch erstellt
- [ ] Nutzer-Login: JWT-basiert
- [ ] Mandantentrennung: Alle DB-Abfragen strikt nach company_id
- [ ] Rollen-System: admin und user (accountant in Stufe 2)

### Modul: Ingestion (Eingangskanäle)

- [ ] Manueller Upload: PDF, JPG, PNG per Drag-and-Drop oder Dateiauswahl
- [ ] E-Mail-Weiterleitung: IMAP-Listener, Anhänge extrahieren
- [ ] **Mobiler Scan (PWA):**
  - [ ] Kamerazugriff und Foto-Upload
  - [ ] Automatische Dokumentenerkennung und Zuschnitt
  - [ ] Perspektivkorrektur für schiefe Fotos
  - [ ] Mehrfach-Scan-Funktion
  - [ ] Sofort-Feedback mit erkannten Daten
  - [ ] Automatische Blitz-Steuerung
- [ ] WhatsApp-Bot: Webhook-Endpunkt /api/whatsapp/webhook

### Modul: OCR & LLM

- [ ] LLM-Abstraktionsschicht: Provider + Modell aus DB laden
- [ ] GPT-4 Vision Anbindung: Bild → strukturiertes JSON
- [ ] Konfidenz-Scores: Pro extrahiertem Feld
- [ ] Dreistufige Pipeline: Textextraktion → KI-Vision → Bildvorverarbeitung

### Modul: Validation (Regel-Engine)

- [ ] Betragsklassen-Logik: ≤400 / >400 / >10.000 EUR
- [ ] Pflichtmerkmale-Prüfung: Alle Merkmale nach §11 UStG
- [ ] Reverse Charge Prüfung: §19 UStG
- [ ] Mathematische Prüfung: Netto + USt = Brutto
- [ ] Steuersatz-Prüfung: Nur 20%, 13%, 10%
- [ ] IBAN-Prüfung: Syntaktisch
- [ ] UID-Prüfung: Syntaktisch (VIES in Stufe 2)
- [ ] Dublettenerkennung: Rechnungsnummer + Lieferant
- [ ] Handelsübliche Bezeichnung: KI-Warnung bei vagen Begriffen

### Modul: Workflow

- [ ] Dashboard mit Rechnungs-Tabelle
- [ ] Ampelsystem: Grün, Gelb, Rot
- [ ] Detailansicht: Rechnungsbild + extrahierte Daten + Prüfergebnisse
- [ ] Manuelle Korrektur: Felder editierbar
- [ ] Fortlaufende Nummerierung: ER-JJJJ-NNNNN / AR-JJJJ-NNNNN
- [ ] Nummernlücken-Warnung
- [ ] Gruppenfreigabe: Alle grünen per Klick archivieren
- [ ] Digitaler Eingangsstempel auf PDF
- [ ] Revisionsfeste Archivierung in Cloudflare R2

### Modul: Reconciliation (Bankabgleich)

- [ ] CSV-Upload für Kontoauszüge
- [ ] Transaktions-Parsing aus CSV
- [ ] Automatisches Matching: Exakt, Betrags-Match, Fuzzy
- [ ] Ergebnis-Dashboard: zugeordnet, offen, Warnungen
- [ ] Manuelle Zuordnung
- [ ] Multi-Konto-Verwaltung (1 bis X Bankkonten)

### Modul: Export

- [ ] BMD-kompatibler CSV-Export
- [ ] Editierbare Exportfelder

### Modul: Communication

- [ ] Korrektur-Mail an Lieferant (E-Mail aus Rechnung extrahiert)

### Modul: Admin

- [ ] Admin-Login (Rolle admin)
- [ ] LLM-Konfiguration UI (Provider, Modell, API-Key, Fallback)
- [ ] Storage-Konfiguration UI
- [ ] Mandantenverwaltung
- [ ] Nutzerverwaltung

### Modul: Audit

- [ ] Revisionssicheres Logging aller Aktionen
- [ ] Zeitstempel, Nutzer, Aktion, IP-Adresse
- [ ] Unveränderlich (append-only)

---

## 12. Rechtliche Konformität (Österreich)

| Gesetz | Anforderung | Umsetzung |
|---|---|---|
| **§11 UStG** | 11 Pflichtmerkmale je Betragsklasse | Regel-Engine (Kapitel 6) |
| **§14 UGB** | Rechtsformspezifische Angaben | Regel-Engine (Kapitel 6.2) |
| **§19 UStG** | Reverse Charge Prüfung | Regel-Engine (Kapitel 6.3) |
| **§132 BAO** | 7 Jahre Aufbewahrungspflicht | Cloudflare R2 mit Object Lock (Stufe 2) |
| **§189 UGB** | Doppelte Buchführung für GmbH | Buchungslogik (Stufe 3) |
| **DSGVO** | Datenschutz, Mandantentrennung | Strikte company_id-Trennung, Verschlüsselung |
| **GoBD** | Revisionssichere Archivierung | Audit-Log, Versionierung, Eingangsstempel |
| **E-Rechnung** | ebInterface, ZUGFeRD, XRechnung | Archivierung im Empfangsformat |

---

**zu §11 UStG**
Um Rechnungen nach österreichischem Finanzrecht zu prüfen, müssen folgende Kriterien berücksichtigt werden. Diese Kriterien basieren auf den Anforderungen des Umsatzsteuergesetzes (UStG) und anderen relevanten Gesetzen.

**Pflichtangaben auf Rechnungen (§ 11 UStG):**

1.  **Name und Anschrift des leistenden Unternehmers:**
    *   Vollständiger Name (Firma)
    *   Vollständige Anschrift des Unternehmenssitzes
2.  **Name und Anschrift des Leistungsempfängers:**
    *   Vollständiger Name (Firma)
    *   Vollständige Anschrift des Leistungsempfängers
3.  **UID-Nummer des leistenden Unternehmers:**
    *   Umsatzsteuer-Identifikationsnummer (UID) des Rechnungsstellers
4.  **UID-Nummer des Leistungsempfängers (bei innergemeinschaftlichen Lieferungen/Leistungen):**
    *   Falls der Leistungsempfänger ein Unternehmer in einem anderen EU-Land ist, muss dessen UID-Nummer angegeben werden.
5.  **Ausstellungsdatum der Rechnung:**
    *   Datum, an dem die Rechnung ausgestellt wurde.
6.  **Fortlaufende Rechnungsnummer:**
    *   Eindeutige, fortlaufende Nummer zur Identifizierung der Rechnung.
7.  **Beschreibung der gelieferten Gegenstände oder erbrachten Leistungen:**
    *   Genaue Bezeichnung der Waren oder Dienstleistungen.
    *   Menge und Art der gelieferten Gegenstände.
    *   Umfang und Art der erbrachten Leistungen.
8.  **Zeitpunkt der Lieferung/Leistung:**
    *   Datum oder Zeitraum, in dem die Lieferung/Leistung erbracht wurde.
    *   Falls Rechnungsdatum und Leistungsdatum abweichen, müssen beide angegeben werden.
9.  **Entgelt (Rechnungsbetrag):**
    *   Nettoentgelt (Betrag ohne Umsatzsteuer).
    *   Gesondert ausgewiesener Umsatzsteuerbetrag.
    *   Umsatzsteuersatz (z.B. 20%, 13%, 10% oder 0%).
10. **Steuerbefreiungen:**
    *   Falls eine Steuerbefreiung vorliegt (z.B. bei innergemeinschaftlichen Lieferungen oder bestimmten Leistungen), muss ein Hinweis auf die Steuerbefreiung angegeben werden (z.B. "Steuerfreie innergemeinschaftliche Lieferung").
11. **Hinweis auf Gutschriften:**
    *   Bei Gutschriften muss ein Hinweis auf die ursprüngliche Rechnung angegeben werden (Rechnungsnummer und Datum).
12. **Kleinbetragsrechnungen (§ 11 UStG Abs. 6):**
    *   Für Rechnungen bis 400 Euro (inkl. USt) gelten vereinfachte Anforderungen:
        *   Name und Anschrift des leistenden Unternehmers
        *   Ausstellungsdatum
        *   Menge und Art der gelieferten Gegenstände oder erbrachten Leistungen
        *   Entgelt und Umsatzsteuerbetrag in einer Summe
        *   Umsatzsteuersatz
13. **Sonderfälle:**
    *   **Reverse-Charge-Verfahren:** Bei Leistungen, die dem Reverse-Charge-Verfahren unterliegen, muss ein Hinweis auf den Übergang der Steuerschuld auf den Leistungsempfänger erfolgen (z.B. "Steuerschuld geht auf den Leistungsempfänger über").
    *   **Margenbesteuerung:** Bei Anwendung der Margenbesteuerung muss ein Hinweis darauf erfolgen (z.B. "Margenbesteuerung nach § 24 UStG").

**Zusätzliche Hinweise und Empfehlungen:**

*   **Aufbewahrungspflicht:** Rechnungen müssen in Österreich grundsätzlich 7 Jahre aufbewahrt werden.
*   **Formvorschriften:** Rechnungen können grundsätzlich elektronisch übermittelt werden, sofern der Empfänger zustimmt. Die Echtheit der Herkunft und die Unversehrtheit des Inhalts müssen gewährleistet sein.
*   **Währung:** Rechnungen können in Euro oder einer anderen Währung ausgestellt werden. Bei Fremdwährungen muss der Umrechnungskurs zum Zeitpunkt der Leistungserbringung oder der Rechnungsstellung angegeben werden.

**Prüfprozess im Detail:**

1.  **Vollständigkeit prüfen:** Sind alle Pflichtangaben vorhanden?
2.  **Plausibilität prüfen:** Sind die Angaben logisch und widerspruchsfrei?
3.  **Korrektheit prüfen:** Stimmen die Beträge, Steuersätze und Berechnungen?
4.  **Formale Prüfung:** Entspricht die Rechnung den formalen Anforderungen (z.B. fortlaufende Rechnungsnummer)?
5.  **Inhaltliche Prüfung:** Entsprechen die beschriebenen Leistungen/Lieferungen den tatsächlichen Vereinbarungen?

Diese Kriterien sollten bei der Entwicklung der "Rechnungcheck V1"-Webapp berücksichtigt werden, um eine umfassende Prüfung der Rechnungen nach österreichischem Finanzrecht zu gewährleisten. Die App sollte in der Lage sein, diese Kriterien automatisiert zu prüfen und bei Bedarf auf fehlende oder fehlerhafte Angaben hinzuweisen.

## 13. Wichtige Anweisungen für die Entwicklung

**Modulare Struktur:** Halte dich strikt an die modulare Architektur. Kein Modul darf direkt auf die Interna eines anderen Moduls zugreifen. Kommunikation erfolgt über definierte Schnittstellen.

**LLM-Abstraktionsschicht:** Baue die LLM-Anbindung so, dass der Provider (OpenAI, Google, Anthropic) und das Modell im Admin-Backend konfigurierbar sind. Hartcodiere keine API-Keys oder Modellnamen.

**Mandantentrennung:** Implementiere von Anfang an eine strikte Mandantentrennung auf Datenbankebene. Jede Abfrage muss eine `WHERE company_id = ?` Klausel enthalten. Ein Nutzer von Mandant A darf unter keinen Umständen Daten von Mandant B sehen.

**Fehlerbehandlung:** Implementiere eine robuste Fehlerbehandlung und ein umfassendes Logging. Jede Aktion wird im Audit-Log protokolliert.

**Code-Qualität:** Schreibe sauberen, kommentierten und testbaren TypeScript-Code.

**Sicherheit:** API-Keys verschlüsselt in der DB. JWT mit angemessener Ablaufzeit. Passwörter mit bcrypt gehasht. Input-Validierung auf allen Endpunkten.

---

## 14. Vorgehensweise (Schritt für Schritt)

| Schritt | Aufgabe | Referenz |
|---|---|---|
| 1 | Projekt-Setup (Monorepo, pnpm workspaces) | Kapitel 3 |
| 2 | Datenbank-Schema mit Drizzle ORM | Kapitel 4 |
| 3 | Backend-Module (Express.js, modularer Monolith) | Kapitel 3 |
| 4 | API-Endpunkte implementieren | Kapitel 5 |
| 5 | Frontend-Komponenten (React) | Login, Dashboard, Upload, Tabelle, Detail, Bankabgleich, Admin |
| 6 | Kern-Workflows implementieren | Kapitel 7 |
| 7 | Docker-Konfiguration | docker-compose.yml |

Beginne mit Schritt 1 (Projekt-Setup). Viel Erfolg!
