# Konzept & Umsetzung: Dynamische Genehmigungs-Regeln

**Version:** 1.0 | **Datum:** 25. Februar 2026

---

## 1. Analyse: Vom statischen Dialog zum flexiblen Regelwerk

Deine Idee, das System mit einem erweiterbaren Dropdown und prozentualer Auswirkung auszustatten, ist genau richtig. Es löst drei Probleme auf einmal:

1.  **Flexibilität:** Jeder Steuerberater oder jedes Unternehmen kann eigene, spezifische Regeln definieren.
2.  **Datenqualität:** Statt fehleranfälligem Freitext haben wir standardisierte, auswertbare Gründe.
3.  **Automatisierung:** Die steuerliche Auswirkung wird direkt an die Regel gekoppelt und automatisch berechnet. Das verhindert Fehler.

Wir bauen also ein **Regel-Modul**, das im Hintergrund die Berechnungen steuert.

---

## 2. Die wichtigsten österreichischen Vorsteuer-Fälle (als Standard-Regeln)

Meine Recherche hat die folgenden, wichtigsten Fälle ergeben, die wir als **nicht-editierbare Standard-Regeln** im System hinterlegen. Der Nutzer kann dann eigene, zusätzliche Regeln erstellen.

| Regel-Name (im Dropdown) | VSt-Abzug | BA-Abzug | Beispiel / Rechtsgrundlage |
|---|---|---|---|
| **Voll abzugsfähig** | 100% | 100% | Standardfall |
| **Bewirtung (Werbezweck)** | 100% | 50% | Geschäftsessen mit Kunden (§20 EStG) |
| **PKW / Kombi / Motorrad** | 0% | 100% | Tankrechnung für einen normalen Firmen-PKW (§12 UStG) |
| **E-Fahrzeug (bis 40k €)** | 100% | 100% | Volle Abzugsfähigkeit für E-Autos ohne Luxustangente |
| **E-Fahrzeug (Luxustangente)** | anteilig | 100% | E-Auto zwischen 40.000 und 80.000 € |
| **Privatanteil (z.B. 30%)** | 70% | 70% | Gemischt genutztes Handy, Internetanschluss |
| **Repräsentation / Geschenk** | 0% | 0% | Geschenk an einen Kunden ohne Werbewert |
| **Nicht betrieblich (privat)** | 0% | 0% | Private Ausgabe irrtümlich mit Firmenkarte bezahlt |
| **Beleg mangelhaft** | 0% (geparkt) | 100% (geparkt) | Fehlende UID-Nummer, Rechnung wird neu angefordert |
| **Sonstiger Grund** | 100% | 100% | Nur Freitext, keine automatische Auswirkung |

---

## 3. Claude-Code-Prompt

**Implementierung: Dynamisches Regelwerk für Genehmigungen**

**Ziel:** Ersetze den statischen "Trotzdem genehmigen"-Dialog durch ein dynamisches, vom Admin verwaltbares Regelwerk, das die steuerliche Berechnung automatisch anpasst.

### 1. Datenbank-Erweiterung

**A. Neue Tabelle `deductibility_rules`:**

Erstelle eine neue Tabelle, in der die Regeln gespeichert werden.

```sql
CREATE TABLE deductibility_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,                -- z.B. "Bewirtung (Werbezweck)"
    description TEXT,                           -- Erklärung, was die Regel bewirkt
    input_tax_percentage NUMERIC(5, 2) NOT NULL, -- z.B. 100.00, 50.00, 0.00
    expense_percentage NUMERIC(5, 2) NOT NULL,   -- z.B. 100.00, 50.00, 0.00
    is_default BOOLEAN DEFAULT FALSE,           -- Ist das eine fixe System-Regel?
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**B. Tabelle `documents` erweitern:**

Füge zur `documents`-Tabelle eine Verknüpfung zur neuen Regel-Tabelle und ein Feld für die Anmerkung hinzu.

```sql
ALTER TABLE documents
ADD COLUMN approval_rule_id UUID REFERENCES deductibility_rules(id),
ADD COLUMN approval_note TEXT;
```

### 2. Backend: Regel-Verwaltung & Berechnungs-Logik

**A. CRUD-API für Regeln:**

-   Erstelle ein neues Backend-Modul `/deductibility-rules`.
-   Implementiere Standard-CRUD-Endpunkte (`GET`, `POST`, `PUT`, `DELETE`) für die `deductibility_rules`.
-   `DELETE` und `PUT` dürfen nur für Regeln mit `is_default = FALSE` funktionieren.

**B. Seed-Skript für Standard-Regeln:**

-   Erstelle ein Seed-Skript, das beim Anlegen eines neuen Mandanten (`company_id`) die 10 Standard-Regeln aus der Tabelle oben automatisch in die `deductibility_rules`-Tabelle einfügt.

**C. Genehmigungs-Logik anpassen:**

-   Wenn eine Rechnung genehmigt wird (egal ob normal oder mit Einschränkung), speichere die `approval_rule_id` und die `approval_note` im `documents`-Datensatz.
-   **WICHTIG:** Die eigentliche Berechnung der abzugsfähigen Vorsteuer und der Betriebsausgabe passiert **dynamisch** bei der Abfrage für Reports (UVA, ESt-Export). Die Rohdaten (`total_net`, `total_tax`) bleiben in der `extracted_data`-Tabelle unverändert. Die Abfrage multipliziert diese Rohdaten dann mit den Prozentwerten aus der verknüpften `deductibility_rule`.

### 3. Frontend: Neuer Dialog & Admin-UI

**A. Neuer Genehmigungs-Dialog:**

-   Baue den Dialog wie im vorherigen Vorschlag um:
    -   Dropdown "Grund", befüllt mit den `name`-Feldern aus der `deductibility_rules`-Tabelle.
    -   Wenn ein Grund gewählt wird, zeige das `description`-Feld der Regel als Info-Text an.
    -   Ein optionales Freitextfeld für die `approval_note`.

**B. Neue Admin-Seite "Genehmigungs-Regeln":**

-   Erstelle eine neue Seite unter `Einstellungen > Buchhaltung > Genehmigungs-Regeln`.
-   Zeige alle Regeln in einer Tabelle an.
-   Ermögliche das Erstellen, Bearbeiten und Deaktivieren von eigenen Regeln (wo `is_default = FALSE`).
-   Beim Erstellen/Bearbeiten gibt es Felder für: Name, Beschreibung, Vorsteuer-Prozentsatz, Betriebsausgaben-Prozentsatz.

Mit diesem System ist die Funktion nicht nur extrem mächtig, sondern auch zukunftssicher und an die Bedürfnisse jedes Steuerberaters anpassbar.
