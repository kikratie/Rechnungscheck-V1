# Implementierung: Automatischer E-Mail-Abruf (Stufe 1)

**Ziel:** Implementiere den vollautomatischen Abruf von Rechnungs-Anhängen aus Gmail- und Microsoft-365-Postfächern unter Verwendung des sicheren OAuth-2.0-Protokolls. Das System soll sich alle 30 Minuten mit den verbundenen Postfächern synchronisieren und neue Rechnungen automatisch in den bestehenden `ingestion`-Workflow einspeisen.

---

### 1. Datenbank-Schema-Erweiterung

Erstelle die folgende neue Tabelle in der PostgreSQL-Datenbank mit Drizzle ORM. Diese Tabelle speichert die Informationen zu allen verbundenen Konten.

```sql
-- Tabelle für verbundene Konten (E-Mail, Portale, Cloud)
CREATE TABLE connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id), -- Welcher Nutzer hat den Connector autorisiert
    connector_type VARCHAR(50) NOT NULL CHECK (connector_type IN (
        'email_oauth_gmail',
        'email_oauth_outlook'
        -- Weitere Typen kommen in Stufe 2
    )),
    display_name VARCHAR(255) NOT NULL, -- z.B. "beruflich (max.mustermann@gmail.com)"
    account_email VARCHAR(255) NOT NULL, -- E-Mail-Adresse des verbundenen Kontos
    credentials_encrypted TEXT NOT NULL, -- Verschlüsselte OAuth Refresh-Tokens
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(50) CHECK (last_sync_status IN ('success', 'running', 'error')),
    last_sync_error TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, account_email) -- Pro Mandant kann jedes E-Mail-Konto nur einmal verbunden werden
);
```

### 2. Backend-Architektur

1.  **Neues Modul `/connectors`:** Erstelle im Backend unter `/src/modules` ein neues Verzeichnis `connectors`. Dieses Modul ist für die gesamte Logik des Belegabrufs zuständig.
    *   `connectors.routes.ts`: API-Endpunkte für das Frontend (CRUD für Connectors, Start des OAuth-Flows).
    *   `connectors.service.ts`: Service-Logik zur Verwaltung der Connectors in der DB.
    *   `connectors.controller.ts`: Controller für die API-Routen.
    *   `providers/base.provider.ts`: Eine abstrakte Klasse `BaseProvider` mit einer Methode `sync()`, die alle konkreten Provider implementieren müssen.
    *   `providers/gmail.provider.ts`: Implementierung für Gmail. Erbt von `BaseProvider`.
    *   `providers/outlook.provider.ts`: Implementierung für Outlook. Erbt von `BaseProvider`.

2.  **Hintergrund-Jobs mit `bullmq`:**
    *   Erstelle eine neue Job-Queue namens `connector-sync`.
    *   Erstelle einen wiederkehrenden Job (Cron), der alle 30 Minuten läuft.
    *   Dieser Job holt alle aktiven Connectors aus der DB und fügt für jeden einen einzelnen `sync-connector` Job zur Queue hinzu.
    *   Erstelle einen Worker für die `connector-sync` Queue. Dieser Worker ruft den entsprechenden Provider (z.B. `gmail.provider.ts`) auf und führt die `sync()`-Methode aus.

### 3. OAuth-2.0-Flow (Backend)

1.  **Bibliotheken installieren:** `npm install passport passport-google-oauth20 passport-microsoft`.
2.  **Passport-Konfiguration:** Konfiguriere die Google- und Microsoft-Strategien. Die `clientID`, `clientSecret` und `callbackURL` müssen aus den Umgebungsvariablen geladen werden.
3.  **API-Routen für Authentifizierung:**
    *   `GET /api/connectors/auth/google`: Leitet den Nutzer zur Google-Anmeldeseite weiter. Die `state`-Variable muss die `company_id` und `user_id` enthalten.
    *   `GET /api/connectors/auth/google/callback`: Empfängt den Code von Google, tauscht ihn gegen Access- und Refresh-Tokens. Speichert den Refresh-Token verschlüsselt in der `connectors`-Tabelle.
    *   `GET /api/connectors/auth/microsoft`: Analog für Microsoft.
    *   `GET /api/connectors/auth/microsoft/callback`: Analog für Microsoft.
4.  **Token-Verschlüsselung:** Speichere die Refresh-Tokens **niemals** im Klartext. Nutze `crypto` aus Node.js mit AES-256-GCM, um die Tokens vor dem Speichern zu verschlüsseln. Der Encryption-Key muss sicher als Umgebungsvariable hinterlegt sein.

### 4. IMAP-Abruf-Logik (Backend)

1.  **Bibliotheken installieren:** `npm install imapflow mailparser`.
2.  **`gmail.provider.ts` Implementierung:**
    *   Die `sync()`-Methode muss:
        1.  Den verschlüsselten Refresh-Token aus der DB holen und entschlüsseln.
        2.  Einen neuen Access-Token von Google anfordern.
        3.  Eine IMAP-Verbindung mit `imapflow` und den OAuth2-Credentials herstellen.
        4.  Den Posteingang öffnen und nach E-Mails suchen, die folgende Kriterien erfüllen: `UNSEEN` (ungelesen) UND `HAS "attachment"`.
        5.  Für jede gefundene E-Mail:
            *   Die Anhänge herunterladen (als Buffer).
            *   Den `mailparser` verwenden, um Absender, Betreff etc. zu extrahieren.
            *   Für jeden Anhang (PDF, JPG, PNG) den `ingestion.service.ts` aufrufen und den Buffer übergeben. Als `ingestion_channel` wird `email` verwendet.
            *   Nach erfolgreicher Verarbeitung aller Anhänge die E-Mail als `SEEN` markieren.
        6.  Den `last_sync_status` in der `connectors`-Tabelle auf `success` oder `error` aktualisieren.
3.  **`outlook.provider.ts` Implementierung:** Die Logik ist identisch zu Gmail, nur die OAuth2-Endpunkte für den Token-Refresh sind anders.

### 5. Frontend-Implementierung (React)

1.  **Neue Seite: `Einstellungen > Connectors`** (`/settings/connectors`):
    *   Nutze `useEffect`, um via `GET /api/connectors` alle verbundenen Konten für den Mandanten zu laden.
    *   Zeige eine Tabelle oder Liste der Connectors an: Icon (Gmail/Outlook), `display_name`, `account_email`, `last_sync_status`.
    *   Ein Button "Konto verbinden" öffnet einen Dialog.
2.  **"Konto verbinden"-Dialog:**
    *   Buttons: "Mit Google verbinden", "Mit Microsoft verbinden".
    *   Ein Klick auf einen Button öffnet ein neues Fenster (via `window.open`) mit der entsprechenden Auth-Route (z.B. `/api/connectors/auth/google`).
    *   Nach erfolgreicher Authentifizierung schließt sich das Fenster und die Connector-Liste im Hauptfenster wird neu geladen.

---

**Zusammenfassende Schritt-für-Schritt-Anleitung:**

1.  Führe die DB-Migration für die `connectors`-Tabelle durch.
2.  Erstelle das neue Backend-Modul `/connectors` mit der grundlegenden Ordnerstruktur.
3.  Implementiere die `bullmq`-Queue und den Worker für den Hintergrund-Sync.
4.  Implementiere den kompletten OAuth2-Flow für Google und Microsoft im Backend.
5.  Implementiere die `sync()`-Methode im `gmail.provider.ts` mit `imapflow` und `mailparser`.
6.  Erstelle die neue Frontend-Seite unter `Einstellungen > Connectors`.
7.  Verbinde das Frontend mit den neuen API-Endpunkten, um den OAuth-Flow zu starten und die Liste der Connectors anzuzeigen.

Beginne mit dem Backend (Schritte 1-5), bevor du das Frontend (Schritt 6-7) erstellst. Konzentriere dich zuerst vollständig auf den Gmail-Flow, bevor du ihn für Outlook duplizierst.
