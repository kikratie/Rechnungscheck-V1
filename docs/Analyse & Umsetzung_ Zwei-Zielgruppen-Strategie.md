# Analyse & Umsetzung: Zwei-Zielgruppen-Strategie

**Version:** 1.0 | **Datum:** 25. Februar 2026

---

## 1. Analyse: Die zwei Welten der Buchhaltung

Dein Hinweis war goldrichtig. Wir müssen Ki2Go von Anfang an auf zwei fundamental unterschiedliche Zielgruppen ausrichten, die verschiedene Bedürfnisse und Endprodukte haben.

| | **Zielgruppe 1: Einzelunternehmer (E/A-Rechner)** | **Zielgruppe 2: GmbH / Bilanzierer** |
|---|---|---|
| **Ziel** | **Fertige Lösung** – Buchhaltung selbst machen | **Vorbereitungs-Lösung** – Perfekte Daten für den Steuerberater |
| **Endprodukt** | **UVA-Bericht & Steuererklärungs-Daten (E1, E1a)** | **BMD-Export & Monatsreport** |
| **Steuerberater** | Optional (für Kontrolle) | Pflicht (für Bilanzierung) |
| **Ki2Go-Rolle** | Aktiver Buchhalter | Effizienter Assistent |

Diese Trennung muss sich durch die gesamte Anwendung ziehen – vom Onboarding bis zum Export.

---

## 2. Umsetzung im Detail

### 2.1. Onboarding: Die Weiche stellen

-   **Neue Frage im Onboarding-Prozess:** "Welche Gewinnermittlungsart verwenden Sie?"
    -   Option A: "Einnahmen-Ausgaben-Rechnung (z.B. als Einzelunternehmer, Freiberufler)"
    -   Option B: "Doppelte Buchführung / Bilanzierung (z.B. als GmbH)"
-   Diese Auswahl wird in der `companies`-Tabelle im neuen Feld `accounting_type` (`'ea_invoice'` oder `'accrual'`) gespeichert.
-   Die gesamte Benutzeroberfläche passt sich basierend auf dieser Einstellung an.

### 2.2. Angepasste Workflows & UI

**Für E/A-Rechner (`accounting_type = 'ea_invoice'`):**

-   **Neues Dashboard-Widget:** "UVA-Vorschau" – zeigt die geschätzte Umsatzsteuer-Zahllast für das aktuelle Quartal/Monat.
-   **Neuer Menüpunkt:** "Steuer & Export"
    -   **UVA-Bericht:** Eine detaillierte Aufschlüsselung aller umsatzsteuerrelevanten Einnahmen und Ausgaben für den ausgewählten Zeitraum.
    -   **Einkommensteuer-Export:** Ein CSV-Export mit den Summen, die für die Formulare E1 und E1a benötigt werden (Betriebseinnahmen, Betriebsausgaben nach Kategorien).
-   Der "BMD-Export" ist hier ausgeblendet oder deaktiviert.

**Für Bilanzierer (`accounting_type = 'accrual'`):**

-   Die Oberfläche bleibt wie im A-B-C-Prozess definiert.
-   Der Fokus liegt auf dem **konfigurierbaren Export-Builder**.
-   **BMD-Export als Standard-Profil:** Der Export-Builder wird mit einem vordefinierten, fixen "BMD NTCS"-Profil ausgeliefert, das nicht verändert werden kann. Dieses Profil erzeugt eine CSV-Datei, die exakt der BMD-Spezifikation entspricht.
-   Der "UVA-Bericht" ist hier ausgeblendet, da die UVA aus der Buchhaltungssoftware des Steuerberaters kommt.

### 2.3. BMD-Upload-Funktion

-   **Wichtige Klarstellung:** Wir exportieren Daten FÜR BMD, wir laden keine Daten VON BMD hoch. Der Steuerberater importiert unsere CSV-Datei in sein BMD-System.
-   Der **konfigurierbare Export-Builder** ist die Lösung. Wir liefern ein fixes "BMD NTCS"-Profil mit, das die Spalten in der richtigen Reihenfolge und Formatierung enthält (z.B. `Konto`, `Gegenkonto`, `Belegdatum`, `Betrag`, `Steuercode`).

---

## 3. Claude-Code-Prompt

Hier ist der zusammengefasste Prompt, um diese Zwei-Zielgruppen-Strategie zu implementieren.

**Implementierung: Zwei-Zielgruppen-Strategie (E/A vs. Bilanz)**

**Ziel:** Passe die Anwendung so an, dass sie zwei unterschiedliche Workflows für Einnahmen-Ausgaben-Rechner und Bilanzierer bietet. Die Weiche wird beim Onboarding gestellt.

### 1. Datenbank-Erweiterung

-   Füge zur Tabelle `companies` eine neue Spalte hinzu:
    ```sql
    ALTER TABLE companies ADD COLUMN accounting_type VARCHAR(20) CHECK (accounting_type IN (
'ea_invoice
', 
'accrual
'));
    ```

### 2. Onboarding-Anpassung

-   Erweitere das User-Onboarding um einen Schritt, der den `accounting_type` abfragt.
-   Speichere die Auswahl des Nutzers in der neuen Spalte der `companies`-Tabelle.

### 3. UI-Anpassung (Conditional Rendering)

-   Die gesamte UI muss nun auf den `accounting_type` des Mandanten reagieren.

-   **Wenn `accounting_type = 'ea_invoice'`:**
    -   Zeige einen neuen Menüpunkt "Steuer & Export" an.
    -   Implementiere darunter zwei neue Seiten:
        1.  **UVA-Bericht:** Eine Ansicht, die alle `documents` und `extracted_data` für einen Zeitraum (Monat/Quartal) aggregiert und die Summe der Vorsteuer und Umsatzsteuer anzeigt.
        2.  **Einkommensteuer-Export:** Eine Seite, die die Summe aller Betriebseinnahmen und -ausgaben (gruppiert nach Kategorien, die noch zu definieren sind) für ein Jahr anzeigt und als CSV exportiert.
    -   Blende Funktionen aus, die für den Steuerberater-Workflow gedacht sind (z.B. den konfigurierbaren Export-Builder).

-   **Wenn `accounting_type = 'accrual'`:**
    -   Die UI bleibt wie im A-B-C-Prozess definiert.
    -   Blende die neuen E/A-spezifischen Seiten (UVA-Bericht, ESt-Export) aus.

### 4. BMD-Export als Standard-Profil

-   Im **konfigurierbaren Export-Builder** (aus dem A-B-C-Prozess) implementiere ein **Standard-Profil** namens "BMD NTCS".
-   Dieses Profil ist **nicht editierbar**.
-   Es muss eine CSV-Datei mit Semikolon-Trennung und den folgenden Spalten in exakt dieser Reihenfolge generieren (basierend auf der Recherche):
    1.  `Satzart` (z.B. "B" für Buchungssatz)
    2.  `Konto` (Sachkonto des Lieferanten/Kunden)
    3.  `Gegenkonto` (z.B. Bankkonto)
    4.  `Buchungsdatum` (Format `DDMMYYYY`)
    5.  `Belegdatum` (Format `DDMMYYYY`)
    6.  `Belegnummer` (Unsere fortlaufende Nummer)
    7.  `Buchungstext` (z.B. "Rechnung von [Lieferant]")
    8.  `BetragSoll`
    9.  `BetragHaben`
    10. `Steuercode` (z.B. "V20" für 20% Vorsteuer)
-   Stelle sicher, dass der Export den Spezifikationen von BMD entspricht. Dies ist der primäre Exportweg für die Zielgruppe der Bilanzierer.
