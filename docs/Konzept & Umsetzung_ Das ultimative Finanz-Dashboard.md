# Konzept & Umsetzung: Das ultimative Finanz-Dashboard

**Version:** 2.0 | **Datum:** 25. Februar 2026

---

## 1. Zusammenfassung: Das Dashboard als Herzstück

Das Dashboard ist die **zentrale Anlaufstelle** nach dem Login. Es muss dem Nutzer in **weniger als 5 Sekunden** die Antwort auf die Frage "Wie steht mein Unternehmen da?" geben. Es ist kein reines Reporting-Tool, sondern ein **aktives Kontrollzentrum**.

**Bisheriges Konzept (Zusammenfassung):**

-   **5 KPI-Karten:** Umsatz, Kosten, Offene Forderungen, Offene Verbindlichkeiten, Kontostand (Platzhalter).
-   **2 Diagramme:** Umsatz vs. Kosten (letzte 6 Monate), Offene Posten (Kuchen).
-   **2 Tabellen:** Top 5 offene Ausgangsrechnungen, Top 5 offene Eingangsrechnungen.

Das ist eine solide Basis. Jetzt erweitern wir sie.

---

## 2. Zusätzliche Ideen: Vom Dashboard zum Cockpit

| Idee | Beschreibung | Nutzen |
|---|---|---|
| **1. Liquiditäts-Vorschau (Cashflow-Prognose)** | Ein Liniendiagramm, das den **erwarteten Kontostand für die nächsten 30 Tage** anzeigt. Es berechnet: `Aktueller Kontostand + erwartete Zahlungseingänge (fällige AR) - erwartete Zahlungsausgänge (fällige ER)`. | **Liquiditätsengpässe frühzeitig erkennen.** Der Nutzer sieht sofort, ob er in 2 Wochen ins Minus rutscht. |
| **2. Interaktive Diagramme** | Alle Diagramme sind klickbar. Klick auf den "Umsatz"-Balken im Juni → Tabelle darunter filtert und zeigt alle Ausgangsrechnungen vom Juni. | **Von der Übersicht ins Detail mit einem Klick.** Macht die Datenanalyse intuitiv. |
| **3. "Was wäre wenn?"-Szenarien** | Ein kleiner Rechner im Dashboard: "Was passiert, wenn ich eine Investition von 5.000€ tätige?" → Die Liquiditäts-Vorschau passt sich sofort an. | **Schnelle Entscheidungsfindung.** Der Nutzer kann die Auswirkungen von Ausgaben simulieren. |
| **4. Top 5 Kunden & Lieferanten** | Zwei kleine Ranglisten: "Top 5 Kunden nach Umsatz" und "Top 5 Lieferanten nach Ausgaben". | **Wichtige Geschäftsbeziehungen im Blick behalten.** |
| **5. KI-gestützte "Insights"** | Eine kleine Box, in der die KI proaktiv Handlungsempfehlungen gibt. Z.B.: "Ihre Kosten für Büromaterial sind diesen Monat um 30% gestiegen." oder "Kunde X ist seit 10 Tagen überfällig. Jetzt mahnen?" | **Macht den Nutzer auf wichtige Entwicklungen aufmerksam.** Das ist der Schritt vom reinen Anzeigen zum Mitdenken. |
| **6. Konfigurierbares Dashboard** | Der Nutzer kann per Drag-and-Drop selbst entscheiden, welche Widgets er wo sehen möchte. | **Personalisierung.** Jeder Nutzer hat andere Prioritäten. |

---

## 3. Das erweiterte Dashboard-Layout (V2)

```
────────────────────────────────────────────────────────────────────────────────
| Dashboard                                       Zeitraum: [Letzte 30 Tage ▼] |
────────────────────────────────────────────────────────────────────────────────
| [KPI-Karte]      | [KPI-Karte]         | [KPI-Karte]          | [KPI-Karte]      |
| Umsatz           | Kosten              | Gewinn (Umsatz-Kosten) | Kontostand       |
| 34.500 €         | 12.800 €            | 21.700 €             | 45.100 € (live)  |
────────────────────────────────────────────────────────────────────────────────
| Liquiditäts-Vorschau (nächste 30 Tage)                                       |
| [Liniendiagramm mit prognostiziertem Kontostand]                             |
|                                                                              |
────────────────────────────────────────────────────────────────────────────────
| [Bereich 1: 50% Breite]                | [Bereich 2: 50% Breite]              |
|----------------------------------------|--------------------------------------|
| **Umsatz vs. Kosten (6 Monate)**       | **KI-Insights**                      |
| [Interaktives Balkendiagramm]          | - Kosten für X sind gestiegen        |
|                                        | - Kunde Y ist überfällig             |
|                                        | - Nächste UVA-Zahlung am...          |
|----------------------------------------|--------------------------------------|
| **Offene Forderungen (Top 5)**         | **Offene Verbindlichkeiten (Top 5)** |
| [Tabelle mit Kunden, Betrag, Fälligk.] | [Tabelle mit Lieferant, Betrag, Fäl.]|
────────────────────────────────────────────────────────────────────────────────
```

---

## 4. Claude-Code-Prompt (Erweiterung)

**Erweiterung: Dashboard V2 – Vom Reporting zum Cockpit**

**Ziel:** Erweitere das bestehende Dashboard um interaktive und vorausschauende Funktionen.

### 1. Backend-Erweiterung (`/api/dashboard/summary`)

-   Erweitere den Endpunkt um die Berechnung der **Liquiditäts-Vorschau** für die nächsten 30 Tage. Gib ein Array von `{date, expectedBalance}` zurück.
-   Füge die Berechnung für **Gewinn** (`totalRevenue - totalCosts`) hinzu.
-   Implementiere einen neuen Endpunkt `POST /api/llm/dashboard-insights`, der die aktuellen Dashboard-Daten analysiert und 2-3 prägnante Text-Insights zurückgibt.

### 2. Frontend-Anpassung (`/dashboard`)

-   **Ersetze** das "Umsatz vs. Kosten"-Diagramm durch die **Liquiditäts-Vorschau** als Haupt-Chart.
-   **Füge Interaktivität hinzu:** Bei Klick auf einen Datenpunkt in einem Diagramm, filtere die Tabellen darunter entsprechend.
-   **Implementiere die KI-Insights-Box:** Rufe den `/api/llm/dashboard-insights` Endpunkt auf und zeige die zurückgegebenen Text-Snippets an.
-   **Füge die Gewinn-KPI-Karte hinzu.**
-   (Optional für spätere Stufe) Implementiere die Drag-and-Drop-Funktionalität für die Widgets.
