# Überarbeitete Strategie: Zweistufiger E-Mail-Abruf

**Feedback:** Der bisherige Workflow war zu direkt. E-Mails sollten nicht sofort als Rechnungen verarbeitet werden. Es braucht einen Zwischenschritt ("Rechnungseingang") und eine Lösung für E-Mails, die selbst die Rechnung sind (ohne PDF-Anhang).

**Neue Strategie:** Wir führen einen zweistufigen Prozess ein. Das System sammelt erst alle potenziellen Rechnungs-E-Mails in einem separaten Posteingang. Der Nutzer entscheidet dann per Klick, was davon tatsächlich eine Rechnung ist und in den Prüfprozess geladen wird.

---

## 1. Der neue zweistufige Workflow

| Schritt | Was passiert | Status/Ort |
|---|---|---|
| **1. E-Mail-Sync** | Der Hintergrund-Job holt alle neuen E-Mails aus den verbundenen Konten (Gmail, Outlook) ab. | Job-Queue |
| **2. Triage & Ablage** | Das System analysiert jede E-Mail und legt sie als "Posteingangs-Element" ab. Es unterscheidet 3 Fälle. | **Neue Tabelle: `inbox_items`** |
| **3. UI: Rechnungseingang** | Der Nutzer sieht eine neue Seite "Rechnungseingang" mit allen neuen Elementen. Jedes Element ist eine Karte mit Vorschau und Aktionen. | **Neue UI-Seite: `/inbox`** |
| **4. Nutzer-Entscheidung** | Der Nutzer klickt auf "Als Rechnung verarbeiten" oder "Ignorieren". | UI-Aktion |
| **5. Prüfprozess** | **Erst jetzt** wird ein `document`-Eintrag erstellt und die Rechnung in die bekannte OCR- und Prüf-Pipeline geladen. | Bestehender Workflow |

## 2. Die Lösung für "E-Mail ist die Rechnung"

Das Kernproblem – eine E-Mail ohne Anhang, deren Textkörper die Rechnung ist – wird durch eine **HTML-zu-PDF-Konvertierung** gelöst.

**So funktioniert die Triage (Schritt 2) im Detail:**

| Fall | Bedingung | Aktion des Systems |
|---|---|---|
| **1. PDF/Bild-Anhang** | E-Mail hat einen `.pdf`, `.jpg` oder `.png` Anhang. | System speichert den Anhang und die Original-E-Mail (`.eml`). Erstellt ein `inbox_item` vom Typ `attachment`. |
| **2. E-Mail-Body** | E-Mail hat **keinen** Anhang, aber der Text enthält Schlüsselwörter wie "Rechnung", "Betrag", "EUR", "zahlbar bis". | System **rendert den HTML-Body der E-Mail in eine saubere PDF-Datei**. Speichert diese neue PDF *und* die Original-E-Mail. Erstellt ein `inbox_item` vom Typ `generated_pdf`. |
| **3. Ignorieren** | E-Mail hat keinen Anhang und keine Rechnungs-Schlüsselwörter. | E-Mail wird ignoriert. Es wird kein `inbox_item` erstellt. |

Durch diesen Prozess wird **jede** Rechnung, egal ob Anhang oder E-Mail-Body, in ein einheitliches PDF-Format gebracht, *bevor* sie die OCR-Pipeline erreicht. Das macht den restlichen Prozess extrem robust und standardisiert.

---

## 3. Überarbeiteter Claude-Code-Prompt

Hier ist der neue, detaillierte Prompt. Er ersetzt den vorherigen E-Mail-Prompt vollständig.

**Implementierung: Zweistufiger E-Mail-Abruf mit Rechnungseingang**

**Ziel:** Implementiere einen zweistufigen Workflow für den E-Mail-Abruf. E-Mails werden zuerst in einem "Rechnungseingang" gesammelt. Der Nutzer entscheidet per Klick, was verarbeitet wird. E-Mails ohne Anhang, deren Body eine Rechnung ist, werden automatisch in ein PDF umgewandelt.

### Schritt 1: DB-Schema-Änderungen

1.  **Bestehende `connectors`-Tabelle anpassen:** Füge eine Spalte `last_processed_uid` hinzu, um zu speichern, welche E-Mail zuletzt verarbeitet wurde.

2.  **Neue Tabelle `inbox_items` erstellen:** Dies ist die zentrale Tabelle für den neuen Rechnungseingang.

```sql
-- Neue Tabelle für den Rechnungseingang
CREATE TABLE inbox_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    source_email_address VARCHAR(255) NOT NULL,
    source_subject VARCHAR(500),
    source_received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Der primäre Beleg, der verarbeitet wird (entweder der Original-Anhang oder das generierte PDF)
    primary_file_path VARCHAR(1024) NOT NULL, 
    primary_file_mime_type VARCHAR(100) NOT NULL,

    -- Die Original-E-Mail, immer als .eml für die Revisionssicherheit gespeichert
    original_email_path VARCHAR(1024) NOT NULL,

    item_type VARCHAR(50) NOT NULL CHECK (item_type IN (
        'attachment', -- E-Mail hatte einen PDF/Bild-Anhang
        'generated_pdf' -- E-Mail-Body wurde zu PDF konvertiert
    )),

    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',  -- Wartet auf Nutzer-Aktion
        'processing', -- Wird gerade in ein Dokument umgewandelt
        'processed',-- Erfolgreich als Dokument importiert
        'ignored'   -- Vom Nutzer ignoriert
    )),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Schritt 2: Backend-Logik anpassen

1.  **Connector-Sync-Logik (`gmail.provider.ts` / `outlook.provider.ts`):**
    *   Die `sync()`-Methode wird komplett umgebaut.
    *   Sie sucht nicht mehr nur nach E-Mails mit Anhängen, sondern holt **alle ungelesenen E-Mails** ab.
    *   Für jede E-Mail wird eine **Triage-Funktion** aufgerufen:
        *   **`triage(email)`:**
            1.  **Prüfe auf Anhänge (PDF/JPG/PNG):**
                *   Wenn ja: Speichere den ersten relevanten Anhang in `temp/inbox/`. Speichere die komplette E-Mail als `.eml`-Datei ebenfalls. Erstelle ein `inbox_item` mit `item_type = 'attachment'`.
            2.  **Wenn keine Anhänge, prüfe Body:**
                *   Nutze eine Heuristik (RegEx auf den Text-Body) nach den Keywords `Rechnung`, `Betrag`, `zahlbar bis`, `EUR`, `invoice`.
                *   Wenn Keywords gefunden werden: Nutze **Puppeteer**, um den HTML-Body der E-Mail in eine PDF-Datei zu rendern (`page.pdf({format: 'A4'})`). Speichere das generierte PDF in `temp/inbox/`. Speichere die `.eml`-Datei. Erstelle ein `inbox_item` mit `item_type = 'generated_pdf'`.
            3.  **Sonst:** Ignoriere die E-Mail.
    *   Nach der Verarbeitung wird die E-Mail im Postfach als `SEEN` markiert.

2.  **Neues Modul `/inbox`:**
    *   `inbox.service.ts`: Service zur Verwaltung der `inbox_items`.
        *   `processItem(inboxItemId, userId)`: Diese Funktion wird aufgerufen, wenn der Nutzer "Als Rechnung verarbeiten" klickt. Sie:
            1.  Setzt den Status des `inbox_item` auf `processing`.
            2.  Kopiert die Datei aus `primary_file_path` in den regulären Upload-Pfad.
            3.  Erstellt einen neuen Eintrag in der `documents`-Tabelle.
            4.  Startet den bekannten OCR-Workflow (`ocr.service.ts`).
            5.  Setzt den Status des `inbox_item` auf `processed`.
    *   `inbox.controller.ts` & `inbox.routes.ts`: API-Endpunkte für das Frontend:
        *   `GET /api/inbox`: Liste aller `inbox_items` mit Status `pending`.
        *   `POST /api/inbox/:id/process`: Startet die Verarbeitung für ein Item.
        *   `POST /api/inbox/:id/ignore`: Setzt den Status auf `ignored`.

### Schritt 3: Frontend-Implementierung

1.  **Neue Seite "Rechnungseingang" (`/inbox`):**
    *   Diese Seite ersetzt die Notwendigkeit, E-Mails direkt im Dashboard anzuzeigen.
    *   Sie ruft `GET /api/inbox` auf und zeigt für jedes Item eine Karte an.
    *   **Jede Karte enthält:**
        *   Absender, Betreff, Eingangsdatum.
        *   Eine kleine iFrame-Vorschau der `primary_file_path` (des PDFs).
        *   Zwei Buttons: **"Als Rechnung verarbeiten"** (grün) und **"Ignorieren"** (grau).
    *   Ein Klick auf "Als Rechnung verarbeiten" ruft `POST /api/inbox/:id/process` auf und die Karte verschwindet aus der Liste.
    *   Ein Klick auf "Ignorieren" ruft `POST /api/inbox/:id/ignore` auf und die Karte verschwindet.

Dieser überarbeitete Workflow ist deutlich robuster, flexibler und löst das Problem der verschiedenen E-Mail-Rechnungstypen auf elegante Weise. Die `strategie_email_abruf.md` ist veraltet damit und `claude_code_prompt_email_abruf.md` sind veraltet und werden durch dieses Dokument ersetzt.
