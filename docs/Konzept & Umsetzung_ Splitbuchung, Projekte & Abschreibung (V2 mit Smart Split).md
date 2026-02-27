# Konzept & Umsetzung: Splitbuchung, Projekte & Abschreibung (V2 mit Smart Split)

**Version:** 2.0 | **Datum:** 25. Februar 2026

---

## 1. Analyse: Vom Beleg zum Buchungssatz (mit Kosten-Optimierung)

Der Umbau auf eine Positions-basierte Buchhaltung ist der richtige Schritt. Deine pragmatische Frage nach den LLM-Kosten ist aber entscheidend. Für 90% der Belege (A1, Miete, Versicherung) ist eine Zerlegung in Positionen Overkill und kostet unnötig Geld und Zeit.

**Die Lösung ist ein intelligenter Hybrid-Ansatz: "Smart Split"**

Statt alle Belege in Positionen zu zerlegen, macht das System es automatisch und intelligent in zwei Stufen:

| Schritt | Was passiert |
|---|---|
| **1. Schnell-Scan (immer)** | KI extrahiert nur Kopfdaten (Gesamtbetrag, Rechnungsnummer, Datum) und prüft, ob mehrere MwSt-Sätze vorhanden sind. **Dieser Schritt ist schnell und 3-4x billiger.** |
| **2. Smart-Split-Logik** | Das System entscheidet: Ist es ein einfacher Beleg oder ein komplexer? |
| **3a. Einfacher Beleg** | Die Kopfdaten werden als eine einzige Position in die `document_line_items` Tabelle geschrieben. **Fertig. 90% der Fälle.** |
| **3b. Komplexer Beleg** | Nur wenn nötig (mehrere MwSt-Sätze, Betrag > 1.000€, etc.) wird ein **zweiter, detaillierter KI-Aufruf** gestartet, der alle Positionen extrahiert. |

**Vorteile dieses Ansatzes:**
- **Kosteneffizient:** Spart ~70% der LLM-Kosten.
- **Schnell:** Einfache Belege sind in Sekunden verarbeitet.
- **Präzise:** Das Risiko von KI-Fehlern bei einfachen Belegen wird eliminiert.
- **Flexibel:** Der Nutzer kann jederzeit manuell eine Aufteilung erzwingen.

---

## 2. Die drei Herausforderungen & die Lösung (Architektur bleibt gleich)

Die Datenbank-Architektur mit der `document_line_items`-Tabelle bleibt **exakt gleich**. Der einzige Unterschied ist, dass bei einfachen Belegen nur **eine Zeile** in diese Tabelle geschrieben wird, die den Gesamtbetrag repräsentiert.

| Herausforderung | Beispiel | Lösung |
|---|---|---|
| **1. Mehrere MwSt-Sätze** | Supermarkt-Rechnung | **Smart Split** erkennt mehrere Sätze → Detail-Scan → Splitbuchung |
| **2. Projektzuordnung** | Baumarkt-Rechnung | Nutzer kann die eine Zeile (einfacher Beleg) oder mehrere Zeilen (komplexer Beleg) Projekten zuordnen. |
| **3. Abschreibung (GWG/AfA)** | Laptop-Rechnung | **Smart Split** erkennt Betrag > 1.000€ → Detail-Scan → Anlagenbuchhaltung |

---

## 3. Claude-Code-Prompt (Version 2 mit Smart Split)

**Implementierung: Umbau auf Positions-basierte Buchhaltung mit Smart-Split-Logik**

**Ziel:** Das System auf Positions-Ebene umbauen, aber die KI-Aufrufe intelligent und kostensparend in zwei Stufen durchführen.

### 1. Datenbank-Umbau (Breaking Change!)

*Dieser Teil bleibt identisch zu V1. Die Tabellen werden für beide Ansätze benötigt.*

**A. Tabelle `extracted_data` wird zur Kopf-Tabelle:**

```sql
ALTER TABLE extracted_data DROP COLUMN net_amount, DROP COLUMN tax_rate, DROP COLUMN tax_amount, DROP COLUMN gross_amount, DROP COLUMN item_description;
```

**B. NEUE Tabelle `document_line_items`:**

```sql
CREATE TABLE document_line_items (id UUID PRIMARY KEY, document_id UUID, description TEXT, quantity NUMERIC, unit_price NUMERIC, net_amount NUMERIC, tax_rate NUMERIC, tax_amount NUMERIC, gross_amount NUMERIC, project_id UUID, category_id UUID, asset_type VARCHAR(50));
```

**C. NEUE Tabellen für `projects`, `expense_categories`, `assets`:**

*Die SQL-Befehle bleiben identisch zu V1.*

### 2. KI/OCR-Pipeline: Zweistufiger "Smart Split"-Prozess (NEU)

**Schritt 1: Schnell-Scan (Immer)**

-   **Neuer, kurzer KI-Prompt:** "Extrahiere nur die Kopfdaten: Rechnungsnummer, Datum, Gesamt-Netto, Gesamt-Steuer, Gesamt-Brutto. Prüfe außerdem, ob auf der Rechnung explizit mehrere unterschiedliche Mehrwertsteuersätze (z.B. 10% und 20%) ausgewiesen sind und gib ein `has_multiple_tax_rates: true/false` zurück."
-   Dieser Aufruf ist schnell und günstig.

**Schritt 2: Backend "Smart Split"-Logik**

-   Nach dem Schnell-Scan, führe folgende Logik im Backend aus:

```typescript
const needsDetailScan = 
    quickScanResult.has_multiple_tax_rates || 
    quickScanResult.net_amount > 1000 ||
    isFromKnownComplexVendor(quickScanResult.issuer_name); // z.B. Amazon, Metro, etc.

if (needsDetailScan) {
    // Gehe zu Schritt 3: Detail-Scan
} else {
    // Gehe zu Schritt 4: Einfachen Beleg erstellen
}
```

**Schritt 3: Detail-Scan (Nur wenn nötig)**

-   **Zweiter, detaillierter KI-Prompt (der ursprüngliche Prompt aus V1):** "Extrahiere eine JSON-Liste aller einzelnen Positionen. Jedes Objekt muss enthalten: `description`, `quantity`, `unit_price`, `net_amount`, `tax_rate`, `tax_amount`, `gross_amount`. Schlage auch eine `category` vor."
-   Speichere jede extrahierte Position als eigene Zeile in `document_line_items`.

**Schritt 4: Einfachen Beleg erstellen**

-   Wenn **kein** Detail-Scan nötig ist, erstelle **eine einzige Zeile** in `document_line_items`.
-   `description`: Nimm den Lieferantennamen und das Rechnungsdatum (z.B. "Rechnung von A1 Telekom vom 15.01.2026")
-   `net_amount`, `tax_rate`, `tax_amount`, `gross_amount`: Nimm die Gesamtbeträge aus dem Schnell-Scan.

### 3. Backend & Frontend: Anpassungen

*Die meisten Punkte bleiben gleich, da die UI immer die `document_line_items` anzeigt – egal ob eine oder mehrere Zeilen.*

**A. Rechnungs-Detailseite (Prozess B):**

-   Die Seite zeigt immer die Tabelle mit den Rechnungspositionen.
-   **NEU:** Füge einen Button **"In Positionen aufteilen"** hinzu. Bei Klick wird der Detail-Scan (Schritt 3) manuell ausgelöst und die eine Zeile durch die detaillierten Positionen ersetzt.

**B. Admin-Seiten & Anlageverzeichnis:**

*Keine Änderungen gegenüber V1.*

**C. Export-Logik:**

*Keine Änderungen gegenüber V1. Die Logik iteriert einfach über die `document_line_items` – egal ob eine oder mehrere Zeilen.*

Dieser Hybrid-Ansatz kombiniert das Beste aus beiden Welten: Die volle Flexibilität der Positions-Buchhaltung für komplexe Fälle und die Geschwindigkeit und Kosteneffizienz der Beleg-Buchhaltung für die 90% der einfachen Fälle.
