# Steuerberater-Feedback: Implementierungsanweisungen

Unser Steuerberater hat das System geprüft und folgende Änderungen/Erweiterungen vorgeschlagen. Bitte implementiere alle Punkte der Reihe nach. Lies vorher die CONCEPT.md für den Gesamtkontext.

---

## 1. DB-Schema-Erweiterungen

Führe folgende Änderungen am Datenbankschema durch:

### 1.1. Tabelle `extracted_data` erweitern:

```sql
-- Neue Felder hinzufügen:
ALTER TABLE extracted_data ADD COLUMN service_type VARCHAR(50) CHECK (service_type IN ('delivery', 'service', 'both'));
ALTER TABLE extracted_data ADD COLUMN hospitality_guests TEXT;
ALTER TABLE extracted_data ADD COLUMN hospitality_reason TEXT;
ALTER TABLE extracted_data ADD COLUMN deductibility_percent INTEGER DEFAULT 100;
ALTER TABLE extracted_data ADD COLUMN deductibility_note TEXT;
```

- `service_type`: Ob es sich um eine Lieferung, sonstige Leistung oder beides handelt. Die KI soll das aus der Rechnung erkennen. Der Nutzer kann es per Dropdown überschreiben.
- `hospitality_guests`: Bewirtete Personen (Pflichtfeld bei Bewirtungsbelegen).
- `hospitality_reason`: Anlass der Bewirtung (Pflichtfeld bei Bewirtungsbelegen).
- `deductibility_percent`: Abzugsfähigkeit in Prozent (100, 50 oder 0). Standard ist 100.
- `deductibility_note`: Begründung für eingeschränkte Abzugsfähigkeit.

### 1.2. Neue Tabelle `substitute_documents` (Ersatzbelege):

```sql
CREATE TABLE substitute_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    payment_date DATE,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT NOT NULL,
    vat_deductible BOOLEAN DEFAULT FALSE,
    vat_note TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

Ein Ersatzbeleg wird mit dem Original-Dokument verknüpft. Wenn `vat_deductible = false`, wird die Vorsteuer auf 0 gesetzt.

### 1.3. Neue Tabelle `payment_differences` (Zahlungsdifferenzen):

```sql
CREATE TABLE payment_differences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_link_id UUID NOT NULL REFERENCES reconciliation_links(id) ON DELETE CASCADE,
    invoice_amount DECIMAL(12, 2) NOT NULL,
    paid_amount DECIMAL(12, 2) NOT NULL,
    difference_amount DECIMAL(12, 2) NOT NULL,
    difference_reason VARCHAR(50) NOT NULL CHECK (difference_reason IN ('skonto', 'currency_difference', 'tip', 'partial_payment', 'rounding', 'other')),
    notes TEXT,
    requires_vat_correction BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 1.4. Neue Tabelle `user_company_access` (Steuerberater-Zugang):

```sql
CREATE TABLE user_company_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    access_level VARCHAR(50) DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'admin')),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, company_id)
);
```

Ein Steuerberater (Rolle `accountant`) kann über diese Tabelle auf mehrere Mandanten zugreifen. Ein normaler User sieht nur seinen eigenen Mandanten.

### 1.5. Dokumenten-Status erweitern:

Ändere den CHECK-Constraint der `documents.status`-Spalte:

```sql
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check 
    CHECK (status IN ('pending_ocr', 'ocr_processing', 'pending_review', 'approved', 'archived', 'parked', 'reconciled', 'reconciled_with_difference', 'rejected', 'error'));
```

Neue Status:
- `parked`: Beleg ist geparkt (wartet z.B. auf korrigierte Rechnung vom Lieferanten).
- `reconciled`: Beleg wurde mit Bankbuchung abgeglichen, Betrag stimmt exakt.
- `reconciled_with_difference`: Beleg wurde abgeglichen, aber mit Differenz (Skonto, Kursdifferenz, etc.).

### 1.6. Nummerierung ändern:

Ändere die `sequential_numbers`-Tabelle, damit der Zähler pro Monat läuft:

```sql
ALTER TABLE sequential_numbers ADD COLUMN month INTEGER;
ALTER TABLE sequential_numbers DROP CONSTRAINT IF EXISTS sequential_numbers_company_id_prefix_year_key;
ALTER TABLE sequential_numbers ADD CONSTRAINT sequential_numbers_unique UNIQUE(company_id, prefix, year, month);
```

Das neue Nummernschema ist: `RE-JJJJ-MM-NNNN` (z.B. `RE-2026-02-0001`). Der Vorteil: Man kann Rechnungen für einen bestimmten Monat nachreichen, und die Nummerierung bleibt innerhalb des Monats fortlaufend.

---

## 2. Bankabgleich: Matching-Logik ändern

Ändere die Priorität des automatischen Matching-Algorithmus im Modul `reconciliation`:

**Neue Reihenfolge:**

1. **Exakt-Match (höchste Priorität):** Rechnungsnummer im Verwendungszweck der Bankbuchung gefunden UND Betrag stimmt exakt überein. → Confidence: 99%
2. **Rechnungsnummer-Match:** Rechnungsnummer im Verwendungszweck gefunden, aber Betrag weicht ab (Toleranz: ±10%). → Confidence: 80%. Differenz wird automatisch als `payment_difference` angelegt. Nutzer muss den Grund wählen (Skonto, Kursdifferenz, Trinkgeld, Teilzahlung, Sonstiges).
3. **Betrags-Match:** Betrag stimmt exakt + Lieferantenname im Verwendungszweck oder IBAN stimmt überein. → Confidence: 70%
4. **Fuzzy-Match:** Betrag ±2% + Datum ±5 Tage + Lieferantenname ähnlich. → Confidence: 50%

**Wichtig:** Die Rechnungsnummer ist jetzt das primäre Matching-Kriterium, nicht der Betrag. Der überwiesene Betrag kann sich durch Skonto, Trinkgeld oder Kursdifferenz ändern – die Rechnungsnummer bleibt immer gleich.

**Differenzen-Workflow:**
- Wenn ein Match mit Betragsdifferenz gefunden wird, zeige dem Nutzer in der Bankabgleich-UI die Differenz an.
- Biete ein Dropdown: "Skonto", "Kursdifferenz", "Trinkgeld", "Teilzahlung", "Rundungsdifferenz", "Sonstiges".
- Bei "Skonto": Setze `requires_vat_correction = true` in `payment_differences`. Vermerke im BMD-Export, dass eine Vorsteuerkorrektur nötig ist.
- Bei "Kursdifferenz": Berechne die Differenz zwischen dem EUR-Betrag auf der Rechnung und dem tatsächlich überwiesenen EUR-Betrag. Vermerke als Kursgewinn oder Kursverlust.

---

## 3. Ersatzbeleg-Workflow

Implementiere folgenden Workflow im Frontend und Backend:

1. In der Dokumenten-Detailansicht: Button "Ersatzbeleg erstellen".
2. Es öffnet sich ein Formular mit:
   - Datum der Ausgabe (Pflicht)
   - Betrag (Pflicht)
   - Grund der Zahlung (Pflicht)
   - Art und Menge der Leistung (Pflicht)
   - Checkbox: "Vorsteuerabzug NICHT möglich" (Standard: nicht angehakt)
   - Wenn angehakt: Dropdown mit Grund ("Kein ordnungsgemäßer Beleg", "Privatanteil", "Repräsentationsaufwand", "Sonstiges")
3. Der Ersatzbeleg wird als PDF generiert und mit dem Original-Dokument (z.B. dem Foto des unleserlichen Belegs) zu einem einzigen PDF zusammengefügt.
4. Das zusammengefügte PDF wird als neue Version archiviert.
5. Im Prüfprotokoll wird vermerkt: "Ersatzbeleg erstellt am [Datum] von [User]. Vorsteuerabzug: [Ja/Nein]. Grund: [...]"

---

## 4. Bewirtungsbeleg-Erkennung

Wenn die KI bei der Datenextraktion erkennt, dass es sich um einen Bewirtungsbeleg handelt (Restaurant, Gastronomie, Catering), dann:

1. Setze automatisch `service_type = 'service'`.
2. Zeige in der Detailansicht zwei zusätzliche Pflichtfelder an:
   - "Bewirtete Personen" (Textfeld, Pflicht)
   - "Anlass der Bewirtung" (Textfeld, Pflicht)
3. Biete ein Dropdown "Abzugsfähigkeit":
   - "100% – Bewirtung ist Leistungsinhalt" (z.B. Schulung, Verkostung)
   - "50% – Geschäftliche Bewirtung zu Werbezwecken" (z.B. Arbeitsessen vor Geschäftsabschluss)
   - "0% – Nicht abzugsfähig" (z.B. Kontaktpflege, privater Anlass)
4. Wenn die Felder "Bewirtete Personen" oder "Anlass" leer sind, setze die Ampel auf GELB mit dem Kommentar: "Bewirtungsbeleg: Bitte bewirtete Personen und Anlass ergänzen (§20 Abs 1 Z 3 EStG)."
5. Speichere die Abzugsfähigkeit in `deductibility_percent` und den Grund in `deductibility_note`.
6. Im BMD-Export: Exportiere den Betrag entsprechend der Abzugsfähigkeit (z.B. bei 50%: nur die Hälfte als Betriebsausgabe).

---

## 5. Beleg-Parken-Funktion

1. Füge in der Detailansicht einen "Parken"-Button hinzu.
2. Beim Klick: Dialog mit Textfeld "Grund fürs Parken" (z.B. "Warte auf korrigierte Rechnung").
3. Status wird auf `parked` gesetzt, Grund wird in `documents.notes` (neues Feld, TEXT) gespeichert.
4. Im Dashboard: Eigener Tab/Filter "Geparkte Belege" mit Anzahl-Badge.
5. **Warnung beim Bankabgleich:** Wenn eine Zahlung für einen geparkten Beleg eingeht (Matching über Rechnungsnummer oder Betrag+Lieferant), zeige eine orange Warnung: "⚠ Beleg RE-2026-02-0003 ist geparkt (Grund: [...]). Zahlung eingegangen. Bitte prüfen!"

---

## 6. Korrektur-Mail verbessern

Wenn der Nutzer auf "Korrektur-Mail an Lieferant senden" klickt:

1. Lade automatisch die Fehler-Kommentare aus `validation_results.comments` und die konkreten Mängel aus `validation_results.checks`.
2. Generiere per LLM (GPT-4.1-nano) einen professionellen E-Mail-Text, der die konkreten Fehler beschreibt. Beispiel:
   > "Sehr geehrte Damen und Herren, bei der Prüfung Ihrer Rechnung Nr. [Rechnungsnummer] vom [Datum] haben wir folgende Mängel festgestellt: 1. Die UID-Nummer fehlt (Pflicht bei Rechnungen über 400 EUR gemäß §11 UStG). 2. Das Lieferdatum ist nicht angegeben. Bitte senden Sie uns eine korrigierte Rechnung zu."
3. Der Nutzer kann den Text vor dem Senden bearbeiten.
4. Die E-Mail wird an die aus der Rechnung extrahierte `issuer_email` gesendet.

---

## 7. Nummerierung: Neues Schema

Ändere das Nummernschema überall im System:

- **Alt:** `ER-JJJJ-NNNNN` (z.B. ER-2026-00001)
- **Neu:** `RE-JJJJ-MM-NNNN` (z.B. RE-2026-02-0001)

Betroffene Stellen:
- Tabelle `sequential_numbers` (neues Feld `month`, neuer Unique-Constraint)
- Workflow-Modul: Nummernvergabe bei Genehmigung
- Dateinamen bei Archivierung: `RE-2026-02-0001_Lieferantenname_2026-02-15.pdf`
- Dashboard: Anzeige der Nummer
- BMD-Export: Belegnummer-Feld
- Nummernlücken-Warnung: Pro Monat prüfen

---

## 8. Monatsreport für Steuerberater

Erstelle einen neuen API-Endpunkt und eine Frontend-Seite:

**API:** `POST /api/export/monthly-report`
**Parameter:** `{ year: number, month: number }`
**Output:** PDF-Datei

**Inhalt des Reports:**

1. **Kopf:** Mandantenname, Zeitraum (z.B. "Februar 2026"), Erstellungsdatum
2. **Zusammenfassung:** Anzahl Belege gesamt, davon Grün/Gelb/Rot, davon bezahlt/offen/geparkt, Gesamtbetrag Netto, Gesamtbetrag USt
3. **Belege-Tabelle (pro Beleg eine Zeile):**

| Nr. | Datum | Lieferant | Netto | USt | Brutto | Ampel | Status | Handlungsvorschlag |
|---|---|---|---|---|---|---|---|---|
| RE-2026-02-0001 | 15.02.2026 | Büro GmbH | 500,00 | 100,00 | 600,00 | Grün | Bezahlt | OK – kann gebucht werden |
| RE-2026-02-0002 | 18.02.2026 | Restaurant XY | 80,00 | 16,00 | 96,00 | Gelb | Bezahlt | Bewirtung 50% abzugsfähig. Vorsteuer: 8,00 EUR |
| RE-2026-02-0003 | 20.02.2026 | Lieferant Z | 1.200,00 | 240,00 | 1.440,00 | Rot | Geparkt | UID fehlt. Warte auf korrigierte Rechnung. |

4. **Offene Posten:** Liste aller unbezahlten Rechnungen mit Fälligkeitsdatum
5. **Geparkte Belege:** Liste mit Grund
6. **Zahlungsdifferenzen:** Liste aller Belege mit Skonto, Kursdifferenz etc.

Nutze `@react-pdf/renderer` oder `pdfkit` für die PDF-Generierung.

---

## 9. Steuerberater-Rolle (accountant)

Ziehe die Rolle `accountant` ins MVP:

1. Ein Nutzer mit Rolle `accountant` kann über die Tabelle `user_company_access` auf mehrere Mandanten zugreifen.
2. Im Frontend: Dropdown "Mandant wechseln" in der Navigationsleiste (nur für accountant sichtbar).
3. Berechtigungen: Ein accountant hat standardmäßig `read`-Zugang. Der Admin des jeweiligen Mandanten kann `write`-Zugang gewähren.
4. Middleware anpassen: Bei jeder API-Anfrage prüfen, ob der User entweder `company_id` direkt hat (normaler User) ODER einen Eintrag in `user_company_access` für die angefragte `company_id` hat (accountant).

---

## 10. Lieferung vs. Leistung erkennen

1. Erweitere den GPT-4 Vision Prompt um die Anweisung: "Erkenne ob es sich bei der Rechnung um eine Lieferung (Verschaffung der Verfügungsmacht über einen Gegenstand, z.B. Warenkauf), eine sonstige Leistung (z.B. Beratung, Reparatur, Miete) oder beides handelt. Gib das Ergebnis im Feld service_type zurück: 'delivery', 'service' oder 'both'."
2. Zeige das Ergebnis in der Detailansicht als Dropdown an (editierbar).
3. Im BMD-Export: Exportiere den `service_type` als eigenes Feld.

---

## 11. Digitaler Eingangsstempel: Notizen statt Warnungen

Ändere das Layout des digitalen Eingangsstempels auf dem archivierten PDF:

**Alt (nicht gewünscht):**
```
⚠ WARNUNG: UID-Nummer fehlt
⚠ WARNUNG: Lieferdatum fehlt
```

**Neu (gewünscht):**
```
┌─────────────────────────────────┐
│ RE-2026-02-0001                 │
│ Eingang: 15.02.2026             │
│ Geprüft: 15.02.2026 14:30      │
│ Freigabe: Josef N.              │
│                                 │
│ Notizen:                        │
│ • UID-Nummer nicht vorhanden    │
│ • Lieferdatum nicht angegeben   │
│ • Bewirtung 50% abzugsfähig    │
└─────────────────────────────────┘
```

Keine Ampelfarben, keine Warnsymbole auf dem Stempel. Nur sachliche Notizen.

---

## 12. Aufbewahrungspflicht & Export-Hinweis

1. Erstelle im Frontend eine `/terms`-Seite mit folgendem Text (als Platzhalter, wird später vom Anwalt finalisiert):
   > "Gemäß § 132 BAO sind Sie als Unternehmer verpflichtet, Ihre Geschäftsunterlagen mindestens 7 Jahre revisionssicher aufzubewahren. Ki2Go Accounting unterstützt Sie bei der Organisation und Prüfung Ihrer Belege, übernimmt jedoch keine Verantwortung für die langfristige Archivierung. Wir empfehlen Ihnen, regelmäßig einen vollständigen Export Ihrer Daten und Belege durchzuführen und diese eigenständig zu sichern."

2. Zeige beim ersten Login nach Registrierung einen Hinweis-Dialog mit diesem Text und einer Checkbox "Ich habe verstanden".

3. Implementiere einen "Vollständiger Export"-Button im Export-Bereich, der ALLE Belege eines Zeitraums als ZIP herunterlädt (PDFs + CSV mit allen Daten).

---

## 13. DSGVO-Konformität (Checkliste)

Stelle sicher, dass folgende Punkte implementiert sind:

- Verschlüsselung aller Daten in Transit (HTTPS/TLS) und at Rest (Datenbank-Verschlüsselung, R2 Server-Side Encryption).
- Strikte Mandantentrennung auf Datenbankebene (WHERE company_id = ?).
- API-Keys und Passwörter verschlüsselt in der DB (AES-256).
- Audit-Log für alle Datenzugriffe (wer hat wann was gesehen/geändert).
- Löschfunktion: Nutzer kann seinen Account und alle Daten löschen lassen (Recht auf Löschung, Art. 17 DSGVO).
- Datenexport: Nutzer kann alle seine Daten in maschinenlesbarem Format exportieren (Recht auf Datenportabilität, Art. 20 DSGVO).
- Cookie-Banner mit Opt-In für nicht-essentielle Cookies.
- Datenschutzerklärung auf `/privacy`-Seite.
- Auftragsverarbeitungsvertrag (AVV) als Template für Steuerberater bereitstellen.

---

## Zusammenfassung der neuen/geänderten Dateien

| Bereich | Änderung |
|---|---|
| DB-Schema | 3 neue Tabellen (substitute_documents, payment_differences, user_company_access), 5 neue Felder in extracted_data, 1 neues Feld in documents (notes), Status-Erweiterung, Nummerierung auf Monat erweitert |
| Reconciliation-Modul | Matching-Logik umgebaut (Rechnungsnummer first), Differenzen-Workflow |
| Validation-Modul | Bewirtungsbeleg-Erkennung, Abzugsfähigkeit, Ersatzbeleg-Prüfung |
| Workflow-Modul | Parken-Funktion, neues Nummernschema RE-JJJJ-MM-NNNN |
| Export-Modul | Monatsreport PDF, Vollständiger ZIP-Export |
| Communication-Modul | Korrektur-Mail mit automatischen Fehlerbeschreibungen |
| Core-Modul | Steuerberater-Rolle (accountant), user_company_access |
| Frontend | Ersatzbeleg-Formular, Bewirtungs-Felder, Parken-Button, Differenzen-Dropdown, Mandanten-Switcher, Terms/Privacy-Seiten |
| OCR/LLM | Prompt erweitert um service_type und Bewirtungs-Erkennung |
| Eingangsstempel | Notizen statt Warnungen |
