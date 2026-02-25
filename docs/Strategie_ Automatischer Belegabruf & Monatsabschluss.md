# Strategie: Automatischer Belegabruf & Monatsabschluss

**Ziel:** Die Belegerfassung soll zu 90% automatisch und ohne manuelles Eingreifen des Nutzers erfolgen ("Zero-Touch Invoicing"). Das System agiert proaktiv und holt sich die Belege selbstständig aus allen relevanten Quellen.

---

## 1. Die 3 Säulen des automatischen Abrufs

Wir erweitern die bestehenden Eingangskanäle um drei vollautomatische Säulen. Jede Säule wird in Stufen ausgebaut, um schnell erste Ergebnisse zu liefern und Komplexität schrittweise zu steigern.

| Säule | Funktionsweise | Sicherheit & Technik |
|---|---|---|
| **1. E-Mail-Postfächer** | Das System verbindet sich direkt mit dem E-Mail-Konto des Nutzers (z.B. Gmail, Outlook) und holt automatisch alle E-Mails mit Rechnungs-Anhängen ab. | **OAuth 2.0** (sicher, kein Passwort-Speichern), IMAP-Protokoll, Filter-Regeln (z.B. "nur Mails mit Anhang von rechnung@lieferant.at") |
| **2. Online-Portale** | Das System loggt sich in Online-Portale von Lieferanten (z.B. A1, Amazon Business) ein und lädt die dort hinterlegten Rechnungen herunter. | **Credential Manager** mit AES-256-Verschlüsselung, **Puppeteer/Playwright** für Web-Scraping, **Desktop-Connector** (Stufe 3) für maximale Sicherheit. |
| **3. Cloud-Speicher** | Das System synchronisiert einen definierten Ordner im Cloud-Speicher des Nutzers (z.B. OneDrive, Google Drive, Dropbox). | **Offizielle APIs** (Microsoft Graph API, Google Drive API), Webhooks für Echtzeit-Benachrichtigungen. |

## 2. Implementierungs-Roadmap (Stufen)

| Stufe | Feature | Nutzen für den Kunden |
|---|---|---|
| **Stufe 1 (MVP Erweiterung)** | **Automatischer E-Mail-Abruf** für Gmail & Microsoft 365 via OAuth 2.0. | Der Großteil der Rechnungen (ca. 70%) kommt per Mail. Dieser Schritt hat den größten Hebel. |
| **Stufe 2 (Professional)** | **Connector-Framework** + **Top 5 AT-Portale** (A1, Amazon Business, ÖBB, Wien Energie, Magenta). | Die wichtigsten wiederkehrenden Rechnungen werden abgedeckt. |
| **Stufe 3 (Enterprise)** | **Desktop-Connector** (wie GetMyInvoices) + **Selbstlernende Portal-Erkennung**. | Maximale Sicherheit (Passwörter bleiben lokal) und Skalierbarkeit für hunderte Portale. |

## 3. Der monatliche Beleg-Check ("Digitaler Hausverstand")

Das System soll nicht nur sammeln, sondern auch mitdenken. Jeden 5. des Monats läuft ein automatischer Job, der die Vollständigkeit des Vormonats prüft.

**Funktionsweise:**

1.  **Lernphase:** Das System lernt aus den letzten 3-6 Monaten, welche Lieferanten regelmäßig Rechnungen senden (z.B. A1, Wien Energie, Miete).
2.  **Monats-Check:** Am 5. des Monats prüft das System: "Habe ich für den letzten Monat eine Rechnung von A1 erhalten? Ja/Nein. Habe ich eine von Wien Energie erhalten? Ja/Nein."
3.  **Dashboard-Widget:** Im Dashboard erscheint eine neue Kachel: "**Vollständigkeit für [Vormonat]**".
    *   **Grün:** "Alle erwarteten Belege vorhanden."
    *   **Gelb:** "Fehlende Belege: A1, Miete. Bitte prüfen Sie, ob diese Rechnungen eingegangen sind."

Dieses Feature verwandelt Ki2Go von einem passiven Sammler in einen proaktiven Assistenten und ist ein enormer Mehrwert.

---

## 4. Detaillierte Anweisungen für Claude Code

Hier sind die konkreten Implementierungsanweisungen. Bitte arbeite sie der Reihe nach ab.

### 4.1. DB-Schema-Erweiterungen

```sql
-- Tabelle für verbundene Konten (E-Mail, Portale, Cloud)
CREATE TABLE connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL CHECK (connector_type IN (
        'email_oauth_gmail', 
        'email_oauth_outlook', 
        'email_imap_password', 
        'portal_puppeteer', 
        'storage_onedrive'
    )),
    display_name VARCHAR(255) NOT NULL,
    credentials_encrypted TEXT NOT NULL, -- Verschlüsselte OAuth-Tokens oder User/Pass
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(50),
    last_sync_error TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle für erwartete, wiederkehrende Rechnungen
CREATE TABLE recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    issuer_name VARCHAR(255) NOT NULL, -- z.B. "A1 Telekom Austria"
    expected_day_of_month INTEGER, -- z.B. 15
    check_active BOOLEAN DEFAULT TRUE,
    last_found_date DATE,
    UNIQUE(company_id, issuer_name)
);
```

### 4.2. Backend-Architektur

1.  **Neues Modul `/connectors`:** Dieses Modul enthält die gesamte Logik für den Abruf.
    *   `connectors.service.ts`: Haupt-Service, der die `connectors`-Tabelle verwaltet.
    *   `providers/gmail.provider.ts`: Logik für Google Mail via OAuth2.
    *   `providers/outlook.provider.ts`: Logik für Microsoft 365 via OAuth2.
    *   `providers/puppeteer.provider.ts`: Basis-Klasse für Portal-Scraping.
    *   `scripts/a1.scraper.ts`: Konkretes Scraping-Skript für A1, das von `puppeteer.provider.ts` erbt.
2.  **Hintergrund-Jobs mit `bullmq`:** Der Abruf darf nicht den Haupt-Thread blockieren.
    *   Richte eine Job-Queue für `connector-sync` ein.
    *   Ein Cron-Job fügt alle 30 Minuten für jeden aktiven Connector einen Job zur Queue hinzu.
    *   Der Job-Worker führt dann den eigentlichen Abruf durch und aktualisiert `last_sync_status`.

### 4.3. E-Mail-Abruf (Stufe 1)

1.  **OAuth2-Flow implementieren:** Nutze `passport-google-oauth20` und `passport-microsoft`.
2.  **IMAP-Verbindung:** Nutze die `imapflow`-Bibliothek. Sie ist modern und unterstützt OAuth2.
3.  **Abruf-Logik:**
    *   Verbinde dich mit dem Postfach.
    *   Suche nach ungelesenen E-Mails mit Anhängen (PDF, JPG, PNG).
    *   Optional: Biete dem Nutzer an, Filterregeln zu definieren (z.B. "nur von `rechnung@...`" oder "Betreff enthält `Rechnung`").
    *   Lade die Anhänge herunter und leite sie an den normalen `/ingestion`-Workflow weiter.
    *   Markiere die E-Mail als gelesen.

### 4.4. Portal-Abruf (Stufe 2)

1.  **Credential Manager:** Baue eine sichere Methode, um die verschlüsselten Zugangsdaten in der `connectors`-Tabelle zu speichern (AES-256 mit einem geheimen Schlüssel aus den Umgebungsvariablen).
2.  **Puppeteer-Framework:** Nutze `puppeteer-core`.
    *   Login-Funktion.
    *   Navigations-Funktion.
    *   Download-Funktion, die auf den `download`-Event des Browsers wartet.
3.  **Erster Connector: A1 Telekom**
    *   Erstelle ein Skript `a1.scraper.ts`.
    *   Loggt sich auf `a1.net/mein-a1` ein.
    *   Navigiert zum Rechnungsarchiv.
    *   Lädt die neueste, noch nicht heruntergeladene Rechnung herunter.

### 4.5. Monatsabschluss-Job

1.  **Lern-Logik:** Erstelle einen Service, der die `documents`-Tabelle der letzten 3 Monate analysiert und Lieferanten identifiziert, die in jedem Monat vorkommen. Diese werden in `recurring_invoices` eingetragen.
2.  **Cron-Job:** Erstelle einen Cron-Job (mit `node-cron` oder `bullmq`), der am 5. jedes Monats um 03:00 Uhr läuft.
3.  **Prüf-Logik:**
    *   Der Job iteriert durch alle Einträge in `recurring_invoices`.
    *   Er prüft, ob in der `documents`-Tabelle ein Beleg von diesem `issuer_name` im Vormonat existiert.
    *   Das Ergebnis (Liste der fehlenden Belege) wird in einer neuen Tabelle `monthly_completeness_reports` gespeichert.
4.  **API & Frontend:**
    *   Neuer API-Endpunkt `/api/reports/monthly-completeness`.
    *   Neues Dashboard-Widget, das diesen Endpunkt abfragt und das Ergebnis anzeigt.

### 4.6. Frontend-UI

1.  **Neue Seite: `Einstellungen > Connectors`**
    *   Zeigt eine Liste der verbundenen Konten an (Logo, Name, Status, letzter Sync).
    *   Button "Neuen Connector hinzufügen".
    *   Dialog zur Auswahl: "Gmail", "Outlook", "A1", "Amazon Business", etc.
    *   Führt den Nutzer durch den OAuth-Flow oder fragt nach User/Passwort für Portale.
2.  **Dashboard-Widget `Monatsabschluss`**
    *   Zeigt den Status für den Vormonat an (Grün/Gelb) und listet fehlende Belege auf.
