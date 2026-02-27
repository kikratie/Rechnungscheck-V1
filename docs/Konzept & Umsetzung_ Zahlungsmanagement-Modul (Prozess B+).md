# Konzept & Umsetzung: Zahlungsmanagement-Modul (Prozess B+)

**Version:** 1.0 | **Datum:** 25. Februar 2026

---

## 1. Analyse: Das fehlende Puzzlestück im Workflow

Der aktuelle Workflow (Sammeln → Prüfen → Abgleichen) ist logisch, aber es fehlt der entscheidende Schritt zwischen "Prüfen" und "Abgleichen": das **aktive Bezahlen** von Rechnungen. Ein reines Zahlungsmanagement-Modul schließt diese Lücke und macht Ki2Go von einem passiven Prüf-Tool zu einer aktiven Buchhaltungszentrale.

**Der neue, vollständige Workflow:**

```
Prozess A          Prozess B           Prozess B+            Prozess C
Sammeln     →      Prüfen       →     Zahlungsmanagement →  Abgleichen
(Inbox)            (Check)            (Fälligkeit, SEPA)    (Bankabgleich)
```

---

## 2. Das Erinnerungssystem: Ein Multi-Kanal-Ansatz

Statt uns für EINE Methode zu entscheiden, bieten wir dem Nutzer **vier Kanäle** an, die er in seinen Einstellungen frei kombinieren kann. Alle Kanäle werden von einem zentralen Cron-Job gesteuert, der täglich alle fälligen Rechnungen prüft.

| Kanal | Umsetzung | Vorteil |
|---|---|---|
| **1. In-App (Dashboard)** | Ein Widget auf dem Dashboard zeigt "3 Rechnungen diese Woche fällig". | Standard, kein Setup nötig, sofort sichtbar. |
| **2. E-Mail** | Eine tägliche/wöchentliche Zusammenfassungs-E-Mail mit allen fälligen Posten. | Zuverlässig, funktioniert auch wenn der Nutzer die App nicht öffnet. |
| **3. Kalender-Feed (iCal)** | Ki2Go generiert eine URL, die der Nutzer in seinem Google/Outlook/Apple Kalender abonniert. | Fälligkeiten erscheinen direkt im gewohnten Kalender des Nutzers. |
| **4. PWA Push Notification** | Eine Push-Nachricht direkt aufs Handy/Desktop, auch wenn die App geschlossen ist. | Höchste Aufmerksamkeit, ideal für dringende Zahlungen. |

**Standardeinstellung:** In-App und E-Mail sind standardmäßig aktiviert. Kalender und Push muss der Nutzer aktiv einschalten.

---

## 3. Stufenweise Implementierung

| Stufe | Features | Zweck |
|---|---|---|
| **Stufe 1 (MVP)** | **Zahlungsübersicht & passive Erinnerungen:** Fälligkeitsliste, Skonto-Hinweis, manuelles "bezahlt"-Flag, E-Mail-Erinnerungen, Kalender-Feed. | Dem Nutzer die Kontrolle geben und ihn an fällige Zahlungen erinnern. |
| **Stufe 2 (Game-Changer)** | **Aktive Zahlungen:** SEPA-XML-Export (pain.001) für Sammelüberweisungen. | Dem Nutzer die manuelle Eingabe von Überweisungen im Online-Banking abnehmen. |
| **Stufe 3 (Profi-Features)** | **Erweiterte Kontrolle:** PWA Push Notifications, Zahlungsfreigabe-Workflow (4-Augen-Prinzip). | Für größere Teams und mobile Nutzer. |

---

## 4. Claude-Code-Prompt

**Implementierung: Zahlungsmanagement-Modul (Stufe 1 & 2)**

### Teil 1: Datenbank & Backend (Stufe 1)

**1. Cron-Job für Erinnerungen:**

-   Implementiere einen Cron-Job mit `node-cron`, der einmal täglich um 08:00 Uhr läuft.
-   Der Job holt alle `documents` mit `status = 'archived'` (genehmigt, aber noch nicht bezahlt).
-   Er prüft das `due_date` und die `user_settings` für Erinnerungen.
-   Wenn eine Rechnung fällig ist (z.B. in 3 Tagen), wird eine E-Mail via `nodemailer` an den Nutzer gesendet.

**2. Kalender-Feed (iCal):**

-   Erstelle einen neuen API-Endpunkt `GET /api/payments/calendar.ics`.
-   Dieser Endpunkt muss pro Mandant eine einzigartige, geheime URL haben (z.B. mit einem Token).
-   Verwende die `ical-generator` npm-Bibliothek.
-   Der Endpunkt holt alle offenen Rechnungen und generiert einen Kalendereintrag pro Rechnung mit Fälligkeitsdatum, Empfänger und Betrag.

### Teil 2: Frontend (Stufe 1)

**1. Neuer Menüpunkt & Seite "Zahlungen":**

-   Füge einen neuen Hauptmenüpunkt "Zahlungen" hinzu.
-   Die Seite `/payments` zeigt eine Liste aller genehmigten, aber noch nicht bezahlten Eingangsrechnungen.
-   Implementiere Tabs: "Überfällig", "Diese Woche fällig", "Zukünftig".
-   Jeder Eintrag zeigt: Empfänger, Betrag, Fälligkeitsdatum, Skonto-Hinweis (z.B. "-3% / 12,50 € sparen bis 28.02.").
-   Füge einen Button "Als bezahlt markieren" hinzu, der den Status manuell auf `paid_manual` setzt.

**2. Dashboard-Widget:**

-   Erstelle ein neues Widget "Fällige Zahlungen" auf dem Haupt-Dashboard, das die 3 dringendsten Zahlungen anzeigt.

**3. Einstellungen:**

-   Erweitere die Benutzer-Einstellungen um einen Bereich "Benachrichtigungen", wo der Nutzer E-Mail-Erinnerungen (an/aus, Tage vorher) und den Kalender-Feed (URL anzeigen/neu generieren) konfigurieren kann.

### Teil 3: SEPA-XML Export (Stufe 2)

**1. Backend: SEPA-Generierung:**

-   Erstelle einen neuen API-Endpunkt `POST /api/payments/sepa`.
-   Der Endpunkt erwartet eine Liste von `document_ids`.
-   Verwende die `kewisch/sepa.js` oder eine ähnliche Bibliothek, um eine `pain.001.001.03` XML-Datei zu generieren.
-   Die nötigen Daten (Empfänger-IBAN, Betrag, Verwendungszweck) kommen aus den `extracted_data` der jeweiligen Dokumente.
-   Die Auftraggeber-IBAN kommt aus den `company_settings`.
-   Der Endpunkt liefert die XML-Datei als Download zurück.

**2. Frontend: SEPA-Export-Button:**

-   Füge auf der `/payments`-Seite Checkboxen zu jeder Rechnungszeile hinzu.
-   Ein Button "SEPA-Datei erstellen" wird aktiv, wenn mindestens eine Rechnung ausgewählt ist.
-   Bei Klick wird der `POST /api/payments/sepa`-Endpunkt aufgerufen und der Download der XML-Datei gestartet.
-   Die ausgewählten Rechnungen bekommen den Status `payment_initiated`.
