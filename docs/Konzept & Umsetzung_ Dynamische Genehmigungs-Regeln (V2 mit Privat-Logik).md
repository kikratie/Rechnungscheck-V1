# Konzept & Umsetzung: Dynamische Genehmigungs-Regeln (V2 mit Privat-Logik)

**Version:** 2.0 | **Datum:** 25. Februar 2026

---

## 1. Analyse: Vom statischen Dialog zum flexiblen Regelwerk

*Dieser Teil bleibt identisch zu V1.*

---

## 2. Die wichtigsten österreichischen Vorsteuer-Fälle (V2 - erweitert)

Meine Recherche hat ergeben, dass wir die Liste der Standard-Regeln erweitern und die Logik für Privatausgaben verfeinern müssen, um zwischen E/A-Rechnern und GmbHs zu unterscheiden.

| Regel-Name (im Dropdown) | VSt-% | BA-% | Logik / Rechtsgrundlage |
|---|---|---|---|
| **Voll abzugsfähig** | 100% | 100% | Standardfall |
| **Bewirtung (Werbezweck)** | 100% | 50% | §20 EStG |
| **PKW / Kombi / Motorrad** | 0% | 100% | §12 UStG |
| ... *(alle anderen Regeln aus V1)* ... | | |
| **NEU: Privatentnahme (E/A)** | 0% | 0% | Für E/A-Rechner: Private Ausgabe über Firmenkonto |
| **NEU: Forderung Gesellschafter (GmbH)** | 0% | 0% | Für GmbH: Private Ausgabe über Firmenkonto → erzeugt Forderung |
| **NEU: Privateinlage (Betriebsausgabe)** | 100% | 100% | Unternehmer bezahlt betriebliche Rechnung von privatem Konto |

---

## 3. Claude-Code-Prompt (Version 2 mit Privat-Logik)

**Implementierung: Dynamisches Regelwerk für Genehmigungen mit Privat-Logik**

**Ziel:** Das Regelwerk erweitern, um private Ausgaben korrekt zu verbuchen, abhängig von der Rechtsform des Unternehmens (E/A-Rechner vs. GmbH).

### 1. Datenbank-Erweiterung

**A. Tabelle `deductibility_rules` erweitern:**

Füge zwei neue Spalten hinzu, um die spezielle Logik für Privatausgaben zu steuern.

```sql
ALTER TABLE deductibility_rules
ADD COLUMN rule_type VARCHAR(50) DEFAULT 'standard', -- 'standard', 'private_withdrawal', 'private_deposit'
ADD COLUMN creates_receivable BOOLEAN DEFAULT FALSE; -- TRUE für GmbH-Privatausgaben
```

**B. NEUE Tabelle `shareholder_transactions` (nur für GmbHs):**

Diese Tabelle trackt alle Forderungen und Verbindlichkeiten gegenüber Gesellschaftern.

```sql
CREATE TABLE shareholder_transactions (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id),
    user_id UUID NOT NULL REFERENCES users(id), -- Welcher Gesellschafter?
    document_id UUID REFERENCES documents(id), -- Verknüpfte Rechnung
    transaction_type VARCHAR(50) NOT NULL, -- 'receivable' (Forderung), 'payable' (Verbindlichkeit)
    amount NUMERIC NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'paid'
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Backend: Erweiterte Regel-Logik

**A. Seed-Skript für Standard-Regeln anpassen:**

-   Aktualisiere das Seed-Skript, um die neuen Regeln zu erstellen und die neuen Felder `rule_type` und `creates_receivable` zu befüllen:
    -   **Regel "Privatentnahme (E/A)":** `rule_type = 'private_withdrawal'`, `creates_receivable = false`
    -   **Regel "Forderung Gesellschafter (GmbH)":** `rule_type = 'private_withdrawal'`, `creates_receivable = true`
    -   **Regel "Privateinlage":** `rule_type = 'private_deposit'`

**B. Genehmigungs-Logik (Prozess B) fundamental erweitern:**

-   Wenn eine Rechnung genehmigt wird, lies die gewählte `deductibility_rule` aus.
-   **Fall 1: `rule.rule_type = 'private_withdrawal'`**
    -   Prüfe den `accounting_type` des Unternehmens.
    -   **Wenn `accrual` (GmbH) UND `rule.creates_receivable = true`:**
        -   Erstelle einen neuen Eintrag in `shareholder_transactions` mit `transaction_type = 'receivable'`.
        -   Setze den Status der Rechnung auf `archived_private`.
    -   **Wenn `ea_invoice` (E/A-Rechner):**
        -   Setze den Status der Rechnung auf `archived_private`.
        -   Es passiert nichts weiter (ist eine Privatentnahme).
-   **Fall 2: `rule.rule_type = 'private_deposit'`**
    -   Dieser Fall ist komplexer. Hier wird eine betriebliche Ausgabe von einem privaten Konto bezahlt. Das Dokument ist eine normale Betriebsausgabe (100% VSt, 100% BA).
    -   **Wenn `accrual` (GmbH):** Erstelle einen Eintrag in `shareholder_transactions` mit `transaction_type = 'payable'` (die GmbH schuldet dem Gesellschafter Geld).
    -   **Wenn `ea_invoice` (E/A-Rechner):** Verbuchen als Privateinlage.

### 3. Frontend: Angepasste UI

**A. Genehmigungs-Dialog:**

-   Das Dropdown zeigt jetzt die neuen Regeln.
-   Wenn eine Regel mit `rule_type = 'private_withdrawal'` gewählt wird, zeige einen dynamischen Info-Text:
    -   Für E/A-Rechner: "Diese Ausgabe wird als Privatentnahme verbucht und hat keinen Einfluss auf Ihren Gewinn."
    -   Für GmbHs: "Diese Ausgabe erzeugt eine Forderung an Sie, die zurückgezahlt werden muss. Andernfalls droht eine verdeckte Gewinnausschüttung."

**B. NEUE UI-Seite "Verrechnungskonto" (nur für GmbHs):**

-   Erstelle eine neue Seite unter `Buchhaltung > Verrechnungskonto`.
-   Zeige eine Tabelle aller offenen und bezahlten Transaktionen aus `shareholder_transactions`.
-   Ermögliche das manuelle Markieren einer Forderung als "bezahlt".

**C. Dashboard-Widget (nur für GmbHs):**

-   Füge eine neue KPI-Karte hinzu: "Offene Forderungen an Gesellschafter" mit der Summe aller offenen `receivables`.
