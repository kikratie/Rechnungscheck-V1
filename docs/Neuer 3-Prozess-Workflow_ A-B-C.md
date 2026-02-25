# Neuer 3-Prozess-Workflow: A-B-C

**Version:** 1.0 | **Datum:** 25. Februar 2026

---

## 1. Analyse & Abgleich mit bisherigem Konzept

Dein neuer Vorschlag, den Prozess in A (Sammeln), B (Rechnungscheck) und C (Zahlungscheck) zu gliedern, ist eine **deutliche Verbesserung** gegenüber dem bisherigen, eher monolithischen Workflow. Er schafft klare, logische Trennungen und entspricht viel besser der realen Arbeitsweise.

**Wesentliche Änderungen & Verbesserungen:**

| Punkt | Bisheriges Konzept | **Neuer A-B-C Prozess** | Vorteil |
|---|---|---|---|
| **Struktur** | Ein durchgehender Workflow | **Drei getrennte, logische Stufen** | Klarheit, bessere UI, robustere Fehlerbehandlung |
| **Eingang** | E-Mails wurden direkt zu `documents` | **Prozess A: Eigener "Rechnungseingang" (`inbox_items`)** | Trennung von "potenziellen" und "echten" Rechnungen |
| **Prüfung** | OCR und Validierung liefen sofort | **Prozess B: OCR/Prüfung erst nach Nutzer-Klick** | Spart unnötige KI-Kosten für Nicht-Rechnungen |
| **Archivierung** | "Archiviert" war ein finaler Status | **Drei "Ordner": Eingang, Rechnungscheck, Rechnungsarchiv** | Logische Trennung, die der Nutzer versteht |
| **Export** | Ein BMD-Export am Ende | **Zwei Exporte: OCR-Prüfexport (NEU) + Konfigurierbarer Buchungs-Export** | Mehr Kontrolle und bessere Prüfmöglichkeiten |

**Neue Anforderungen aus deinem Vorschlag:**

1.  **OCR-Prüfexport:** Ein CSV-Export *nach* Prozess B, um alle von der KI ausgelesenen Rohdaten zu prüfen. **Das ist neu und sehr wichtig für die Qualitätssicherung.**
2.  **Konfigurierbarer Export-Builder:** Ein UI, in dem der Nutzer die Spalten, Reihenfolge und Formatierung für den finalen CSV-Export selbst zusammenstellen kann. **Das ist eine massive Aufwertung des Export-Moduls.**

---

## 2. Der neue A-B-C Workflow im Detail

### Prozess A: Rechnung Sammeln

- **Ziel:** Alle potenziellen Belege an einem Ort sammeln, ohne sie sofort zu verarbeiten.
- **UI:** Seite "Rechnungseingang" (`/inbox`)
- **DB-Tabelle:** `inbox_items`
- **Ablauf:**
  1.  Belege kommen per E-Mail-Weiterleitung oder manuellem Upload an.
  2.  Das System prüft, ob es sich wahrscheinlich um eine Rechnung handelt (Anhang, Keywords).
  3.  Jeder potenzielle Beleg wird als Karte im "Rechnungseingang" angezeigt.
  4.  **Nutzer-Aktion:**
      - Klick auf **"Als Rechnung verarbeiten"** → Beleg geht zu Prozess B.
      - Klick auf **"Ignorieren/Löschen"** → Beleg wird entfernt.

### Prozess B: Rechnungs-Check

- **Ziel:** Rechnungen auf ihre rechtliche Gültigkeit prüfen, Daten extrahieren und für die Buchhaltung vorbereiten.
- **UI:** Seite "Rechnungs-Check" (`/documents`)
- **DB-Tabelle:** `documents`, `extracted_data`, `validation_results`
- **Ablauf:**
  1.  Ein Beleg aus Prozess A wird hierher verschoben.
  2.  **Jetzt erst** läuft die KI-Analyse (OCR) und die Regel-Engine-Prüfung (§11 UStG).
  3.  Das Ergebnis wird als Ampel (Grün/Gelb/Rot) angezeigt.
  4.  **Nutzer-Aktion:**
      - **Genehmigen:** Beleg bekommt eine fortlaufende Nummer (`RE-JJJJ-MM-NNNN`) und einen eindeutigen Dateinamen. Er wird in den Ordner "Rechnungs-Check" verschoben.
      - **Parken:** Beleg wird auf "Wartend" gesetzt (z.B. wenn eine korrigierte Version angefordert wurde).
      - **Löschen:** Beleg wird als ungültig markiert.
  5.  **NEU – OCR-Prüfexport:** Ein Button "Alle extrahierten Daten als CSV exportieren" ermöglicht die Detailprüfung der KI-Leistung.

### Prozess C: Zahlungs-Check

- **Ziel:** Genehmigte Rechnungen mit Banktransaktionen abgleichen und für den Steuerberater-Export finalisieren.
- **UI:** Seite "Zahlungs-Check / Bankabgleich" (`/reconciliation`)
- **DB-Tabelle:** `bank_transactions`, `reconciliation_links`, `payment_differences`
- **Ablauf:**
  1.  Nutzer lädt Kontoauszugs-CSV hoch.
  2.  Das System gleicht die Transaktionen mit den genehmigten Rechnungen aus Prozess B ab.
  3.  **Prüfung:**
      - Wurde die Rechnung bezahlt?
      - Stimmt der Betrag? Wenn nein → **Differenz vermerken** (Skonto, Trinkgeld, etc.).
  4.  Alle abgeglichenen und geprüften Belege werden in den finalen Ordner **"Rechnungsarchiv"** verschoben.
  5.  **NEU – Konfigurierbarer Export:**
      - Ein Export-Builder (UI) ermöglicht es dem Nutzer, sein eigenes CSV-Format zu definieren:
        - Spalten auswählen (z.B. Rechnungsdatum, Betrag, Lieferant, Differenzgrund)
        - Reihenfolge per Drag-and-Drop ändern
        - Datums- und Zahlenformate einstellen (z.B. `DD.MM.YYYY`, Komma als Dezimaltrennzeichen).
      - Dieses Template kann gespeichert und wiederverwendet werden.

---

## 3. Claude-Code-Prompt

Hier ist der zusammengefasste Prompt, um diesen neuen A-B-C-Workflow zu implementieren.

**Implementierung: Neuer 3-Prozess-Workflow (A-B-C)**

**Ziel:** Strukturiere die gesamte Anwendung nach dem neuen 3-Prozess-Modell: A (Sammeln), B (Rechnungs-Check), C (Zahlungs-Check). Dies erfordert Änderungen an der UI-Navigation, den Statusmodellen und den Export-Funktionen.

### 1. UI & Prozess-Trennung

-   **Hauptnavigation anpassen:** Erstelle drei Haupt-Navigationspunkte:
    1.  `Rechnungseingang` (Prozess A)
    2.  `Rechnungs-Check` (Prozess B)
    3.  `Zahlungs-Check` (Prozess C)
-   **Prozess A (Rechnungseingang):** Implementiere die `inbox_items`-Logik wie im Dokument `strategie_email_abruf_v2.md` beschrieben. Dies ist der erste Schritt.
-   **Prozess B (Rechnungs-Check):** Das bisherige "Dashboard" wird zu dieser Seite. Sie zeigt nur Dokumente an, die aus dem Rechnungseingang übernommen wurden (`documents`-Tabelle). Hier finden OCR, Validierung und Genehmigung statt.
-   **Prozess C (Zahlungs-Check):** Das bisherige "Bankabgleich"-Modul wird zu dieser Seite. Es zeigt nur genehmigte Rechnungen aus Prozess B und gleicht sie mit den Bankdaten ab.

### 2. Neue Export-Funktionen

1.  **OCR-Prüfexport (in Prozess B):**
    -   Füge auf der Seite `Rechnungs-Check` einen Button "OCR-Daten exportieren (CSV)" hinzu.
    -   Dieser Export soll **alle Felder** aus der `extracted_data`-Tabelle als Rohdaten ausgeben, mit einer Zeile pro Rechnungsversion. Wichtige Spalten sind `document_id`, `version`, `issuer_name`, `invoice_date`, `net_amount`, `tax_amount`, `gross_amount` und die jeweiligen `confidence_scores`.
    -   **Zweck:** Detaillierte Analyse der KI-Leistung und Qualitätssicherung.

2.  **Konfigurierbarer Export-Builder (in Prozess C):**
    -   Erstelle eine neue UI-Seite `Einstellungen > Export-Profile`.
    -   Hier kann der Nutzer neue Export-Profile anlegen.
    -   **Im Profil-Editor:**
        -   **Spaltenauswahl:** Eine Liste aller verfügbaren Felder aus `documents`, `extracted_data`, `bank_transactions` und `payment_differences` mit Checkboxen.
        -   **Reihenfolge:** Die ausgewählten Spalten können per Drag-and-Drop sortiert werden.
        -   **Formatierung:** Pro Spalte können Formatierungsregeln definiert werden (z.B. Datumsformat `YYYY-MM-DD`, Dezimaltrennzeichen `.`, Tausendertrennzeichen `,`).
    -   Speichere diese Profile in der `export_templates`-Tabelle.
    -   Auf der `Zahlungs-Check`-Seite kann der Nutzer dann ein Profil aus einem Dropdown auswählen, um den finalen CSV-Export zu generieren.

### 3. Status-Modell und Ordner-Logik

-   Passe das `status`-Feld in der `documents`-Tabelle an, um die neuen Zustände abzubilden. Füge Status wie `pending_approval` (in Prozess B), `approved` (nach B), `reconciled` (nach C) hinzu.
-   Die "Ordner" (`Rechnungseingang`, `Rechnungs-Check`, `Rechnungsarchiv`) sind keine echten Datei-Ordner, sondern logische Ansichten, die durch den Status der Dokumente in der Datenbank gefiltert werden. Die physische Datei wird nur einmal bei der Genehmigung in den finalen Archiv-Pfad verschoben.
