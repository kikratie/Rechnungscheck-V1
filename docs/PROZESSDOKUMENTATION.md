# Ki2Go Accounting — Prozessdokumentation

**Version:** 1.0 | **Stand:** 24.02.2026
**Zweck:** Übersicht aller Geschäftsprozesse für Abstimmung mit Steuerberater

---

## Inhaltsverzeichnis

1. [Gesamtübersicht](#1-gesamtübersicht)
2. [Prozess 1: Rechnungseingang](#2-prozess-1-rechnungseingang)
3. [Prozess 2: KI-Extraktion (OCR-Pipeline)](#3-prozess-2-ki-extraktion-ocr-pipeline)
4. [Prozess 3: Automatische Rechnungsprüfung (§11 UStG)](#4-prozess-3-automatische-rechnungsprüfung-11-ustg)
5. [Prozess 4: Bankabgleich (Matching)](#5-prozess-4-bankabgleich-matching)
6. [Prozess 5: Genehmigung & Archivierung](#6-prozess-5-genehmigung--archivierung)
7. [Prozess 6: BMD-Export](#7-prozess-6-bmd-export)
8. [Prozess 7: Sonderfälle](#8-prozess-7-sonderfälle)
9. [Benutzerrollen & Berechtigungen](#9-benutzerrollen--berechtigungen)
10. [Prüfregeln-Katalog (Vollständig)](#10-prüfregeln-katalog-vollständig)

---

## 1. Gesamtübersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                    Ki2Go Accounting — Gesamtprozess             │
└─────────────────────────────────────────────────────────────────┘

  EINGANG              VERARBEITUNG            PRÜFUNG & ABGLEICH         AUSGANG
  ───────              ────────────            ──────────────────         ───────

  ┌──────────┐     ┌──────────────────┐     ┌───────────────────┐     ┌───────────┐
  │ Rechnung │     │   KI-Extraktion  │     │  §11 UStG Prüfung │     │   BMD     │
  │ eingeht  │────▶│   (OCR/GPT-4)    │────▶│  Ampel-Bewertung  │────▶│  Export   │
  │          │     │                  │     │  🟢 🟡 🔴          │     │           │
  └──────────┘     └──────────────────┘     └───────┬───────────┘     └───────────┘
       │                                            │
       │           ┌──────────────────┐             │
       │           │   Bankabgleich   │             │
       │           │   (3-Stufen-     │◀────────────┘
       │           │    Matching)     │
       │           └────────┬─────────┘
       │                    │
       │           ┌────────▼─────────┐
       │           │   Genehmigung    │
       │           │   & Archivierung │
       │           │   (Nummerierung) │
       │           └──────────────────┘
       │
  ┌────▼─────┐
  │ Kanäle:  │
  │ • Upload │
  │ • Kamera │
  │ • E-Mail │
  │ • Teilen │
  └──────────┘
```

**Kernprinzip:** Der Unternehmer sieht nur die Ampel (Grün/Gelb/Rot).
Die gesamte Komplexität (18+ Prüfregeln, OCR, Matching) läuft automatisch im Hintergrund.

---

## 2. Prozess 1: Rechnungseingang

### Prozessschaubild

```
                        ┌─────────────────────┐
                        │   Rechnung kommt an  │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
              │  Desktop   │ │   Handy   │ │  E-Mail   │
              │  Upload    │ │  Kamera   │ │Weiterltg. │
              │ (Drag&Drop)│ │  (PWA)    │ │ (geplant) │
              └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                    │             │              │
                    └──────┬──────┘              │
                           │                    │
                    ┌──────▼──────────────────────▼──┐
                    │       Upload-API Endpunkt       │
                    │     POST /api/v1/invoices       │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    Duplikat-Prüfung         │
                    │    (SHA-256 Hash-Check)     │
                    └──────────┬──────────────────┘
                               │
                  ┌────────────┼────────────┐
                  │ DUPLIKAT   │             │ NEU
                  │            │             │
           ┌──────▼──────┐    │    ┌────────▼────────┐
           │   Fehler:   │    │    │ Speicherung in  │
           │  "Rechnung  │    │    │ S3/MinIO unter  │
           │   bereits   │    │    │ /temp/{id}.pdf  │
           │   vorhanden"│    │    └────────┬────────┘
           └─────────────┘    │             │
                              │    ┌────────▼────────┐
                              │    │  DB-Eintrag:    │
                              │    │  Status =       │
                              │    │  UPLOADED       │
                              │    │  belegNr = auto │
                              │    └────────┬────────┘
                              │             │
                              │    ┌────────▼────────┐
                              │    │  Job in Queue   │
                              │    │  → OCR-Pipeline │
                              │    │     startet     │
                              │    └─────────────────┘
```

### Beschreibung

| Schritt | Was passiert | Details |
|---------|-------------|---------|
| 1. Datei empfangen | System nimmt PDF, JPG, PNG, TIFF oder WebP entgegen | Max. 20 MB pro Datei, mehrere gleichzeitig möglich |
| 2. Hash-Berechnung | SHA-256 Fingerabdruck der Datei | Identifiziert exakte Duplikate |
| 3. Duplikat-Check | Vergleich mit allen bisherigen Rechnungen des Mandanten | Verhindert doppelte Verbuchung |
| 4. Speicherung | Datei wird in S3-kompatiblem Speicher abgelegt | Pfad: `{mandant}/temp/{id}.{ext}` |
| 5. DB-Eintrag | Rechnung wird in Datenbank angelegt | Status: `UPLOADED`, laufende interne Nummer |
| 6. Queue | Verarbeitungsauftrag wird erstellt | OCR-Pipeline startet asynchron im Hintergrund |

### Eingangskanäle

| Kanal | Beschreibung | Status |
|-------|-------------|--------|
| **Desktop Upload** | Drag & Drop oder Dateiauswahl im Browser | Fertig |
| **Mobile Kamera** | Foto direkt aus der App (PWA, Rückkamera) | Fertig |
| **Share/Teilen** | PDF/Bild aus anderer App an Ki2Go teilen | Fertig |
| **E-Mail-Weiterleitung** | Dedizierte E-Mail-Adresse pro Mandant | Geplant |

---

## 3. Prozess 2: KI-Extraktion (OCR-Pipeline)

### Prozessschaubild

```
                    ┌─────────────────────┐
                    │  Datei aus Queue     │
                    │  empfangen           │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Dateityp erkennen  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐  ┌─────▼──────┐  ┌──────▼──────┐
       │    PDF       │  │   Bild     │  │   TIFF      │
       │ (digital?)   │  │ JPG/PNG    │  │   → PNG     │
       └──────┬──────┘  └─────┬──────┘  └──────┬──────┘
              │               │                │
     ┌────────▼────────┐     │                │
     │ STUFE 1:        │     │                │
     │ Text-Extraktion │     │                │
     │ (pdf-parse)     │     │                │
     └────────┬────────┘     │                │
              │               │                │
     ┌────────▼────────┐     │                │
     │ ≥ 50 Zeichen    │     │                │
     │ Text gefunden?  │     │                │
     └───┬────────┬────┘     │                │
         │ JA     │ NEIN     │                │
         │        │ (Scan)   │                │
         │   ┌────▼──────┐   │                │
         │   │ PDF → PNG  │  │                │
         │   │ (144 DPI)  │  │                │
         │   └────┬───────┘  │                │
         │        │          │                │
    ┌────▼──┐     └────┬─────┘────────────────┘
    │ LLM   │          │
    │ Text- │   ┌──────▼───────┐
    │ Analyse│  │ STUFE 2:     │
    │(GPT-4) │  │ Vision-OCR   │
    └───┬───┘   │ (GPT-4 Vis.) │
        │       └──────┬───────┘
        │              │
        │       ┌──────▼───────┐
        │       │ Konfidenz    │
        │       │ < 60% ?      │
        │       └──┬───────┬───┘
        │          │ JA    │ NEIN
        │   ┌──────▼──────┐│
        │   │ STUFE 3:    ││
        │   │ Bildverbes- ││
        │   │ serung +    ││
        │   │ erneute OCR ││
        │   └──────┬──────┘│
        │          │       │
        └──────────┼───────┘
                   │
        ┌──────────▼──────────┐
        │  IBAN Cross-Check   │
        │  (Regex vs. LLM)   │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Extrahierte Daten  │
        │  + Konfidenz-Scores │
        │  in DB speichern    │
        │                     │
        │  Status → PROCESSED │
        │  oder REVIEW_REQ.   │
        └─────────────────────┘
```

### Beschreibung der 3 Stufen

| Stufe | Name | Wann | Methode | Typische Konfidenz |
|-------|------|------|---------|-------------------|
| **1** | Text-Extraktion | Digitale PDFs (mit Textebene) | `pdf-parse` extrahiert eingebetteten Text, GPT-4 analysiert strukturiert | 90-99% |
| **2** | Vision-OCR | Scans, Fotos, Bilder | GPT-4 Vision analysiert das Bild direkt | 70-95% |
| **3** | Bildverbesserung + Retry | Nur bei Konfidenz < 60% | Graustufen + Kontrast + Schärfe, dann erneut Vision-OCR | 60-85% |

### Extrahierte Felder

| Feld | Beispiel | Konfidenz-Anzeige |
|------|---------|-------------------|
| Ausstellername | "Firma Müller GmbH" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| UID-Nummer | "ATU12345678" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| IBAN | "AT42 1234 5678 9012 3456" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| Rechnungsnummer | "RE-2026/0042" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| Rechnungsdatum | "24.02.2026" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| Bruttobetrag | "1.250,50 €" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| Nettobetrag | "1.042,08 €" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| USt-Betrag | "208,42 €" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| USt-Satz | "20%" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| Leistungsbeschreibung | "IT-Dienstleistung Feb 2026" | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |
| Reverse Charge | Ja/Nein | 🟢 > 95%, 🟡 70-95%, 🔴 < 70% |

### IBAN Cross-Check

Besondere Sicherheitsmaßnahme: Die IBAN wird doppelt geprüft:
1. **LLM-Extraktion:** GPT-4 liest die IBAN aus dem Dokument
2. **Regex-Extraktion:** Paralleler Abgleich aller IBAN-Muster im Text
3. **Mod-97 Prüfung:** Mathematische Validierung nach ISO 13616
4. **Abgleich:** Falls LLM-IBAN ungültig aber Regex-IBAN gültig → Regex wird verwendet

---

## 4. Prozess 3: Automatische Rechnungsprüfung (§11 UStG)

### Prozessschaubild

```
                    ┌─────────────────────┐
                    │  Extrahierte Daten   │
                    │  aus OCR-Pipeline    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Betragsklasse       │
                    │  bestimmen           │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌───────▼──────┐
     │  KLEINBETRAGS- │ │  STANDARD- │ │   GROSS-     │
     │  RECHNUNG      │ │  RECHNUNG  │ │   RECHNUNG   │
     │  ≤ 400€ brutto │ │ 401-9.999€ │ │  ≥ 10.000€   │
     │                │ │            │ │              │
     │  6 Pflicht-    │ │ 11 Pflicht-│ │ 12 Pflicht-  │
     │  merkmale      │ │ merkmale   │ │ merkmale     │
     └────────┬───────┘ └─────┬──────┘ └───────┬──────┘
              │               │                │
              └───────────────┼────────────────┘
                              │
                   ┌──────────▼──────────┐
                   │                     │
                   │  18+ automatische   │
                   │  Prüfregeln         │
                   │  durchlaufen        │
                   │                     │
                   │  (siehe Katalog     │
                   │   in Abschnitt 10)  │
                   │                     │
                   └──────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼──────┐ ┌─────▼─────┐ ┌───────▼──────┐
     │   🟢 GÜLTIG   │ │ 🟡 WARNUNG│ │  🔴 UNGÜLTIG │
     │               │ │           │ │              │
     │ Alle Pflicht- │ │ Kleinere  │ │ Pflichtfeld  │
     │ felder OK,    │ │ Mängel,   │ │ fehlt ODER   │
     │ Mathe stimmt, │ │ niedrige  │ │ Mathe falsch │
     │ keine Fehler  │ │ Konfidenz │ │ ODER schwerer│
     │               │ │           │ │ Verstoß      │
     └───────────────┘ └───────────┘ └──────────────┘
```

### Betragsklassen nach §11 UStG

| Klasse | Betrag (brutto) | Pflichtmerkmale | Gesetzliche Basis |
|--------|----------------|-----------------|-------------------|
| **Kleinbetragsrechnung** | ≤ 400 € | 6 Felder | §11 Abs 6 UStG |
| **Standardrechnung** | 401 – 9.999 € | 11 Felder | §11 Abs 1 UStG |
| **Großbetragsrechnung** | ≥ 10.000 € | 12 Felder | §11 Abs 1 Z 3a UStG |

### Pflichtmerkmale je Klasse

| Merkmal | Klein (≤400€) | Standard | Groß (≥10k€) |
|---------|:---:|:---:|:---:|
| Name des Ausstellers | **Pflicht** | **Pflicht** | **Pflicht** |
| Anschrift des Ausstellers | — | **Pflicht** | **Pflicht** |
| UID-Nummer Aussteller | — | **Pflicht** | **Pflicht** |
| Name des Empfängers | — | — | **Pflicht** |
| UID-Nummer Empfänger | — | — | **Pflicht** |
| Rechnungsnummer | — | **Pflicht** | **Pflicht** |
| Rechnungsdatum | **Pflicht** | **Pflicht** | **Pflicht** |
| Liefer-/Leistungsdatum | — | **Pflicht** | **Pflicht** |
| Leistungsbeschreibung | **Pflicht** | **Pflicht** | **Pflicht** |
| Nettobetrag | — | **Pflicht** | **Pflicht** |
| Steuersatz | **Pflicht** | **Pflicht** | **Pflicht** |
| Steuerbetrag | — | **Pflicht** | **Pflicht** |
| Bruttobetrag | **Pflicht** | **Pflicht** | **Pflicht** |

### Ampel-Logik (Traffic Light)

| Farbe | Bedeutung | Wann | Aktion erforderlich |
|-------|-----------|------|---------------------|
| 🟢 **GÜLTIG** | Rechnung vollständig und korrekt | Alle Pflichtfelder vorhanden, Berechnung stimmt | Kann archiviert werden |
| 🟡 **WARNUNG** | Kleine Mängel oder unsichere Erkennung | Fehlende optionale Felder, Konfidenz 70-95%, behebbare Probleme | Prüfung empfohlen |
| 🔴 **UNGÜLTIG** | Schwere Mängel | Pflichtfeld fehlt, Berechnung falsch, kritischer Verstoß | Korrekturmaßnahme nötig |
| ⬜ **GRAU** | Informativ, nicht bewertungsrelevant | IBAN-Check, Fremdwährung, optionale Prüfungen | Keine Aktion nötig |

---

## 5. Prozess 4: Bankabgleich (Matching)

### Prozessschaubild

```
  ┌──────────────────┐          ┌──────────────────┐
  │  Kontoauszug     │          │  Geprüfte        │
  │  (CSV-Import)    │          │  Rechnungen      │
  │                  │          │                  │
  │  Transaktionen:  │          │  Offene Belege:  │
  │  • Datum         │          │  • Bruttobetrag  │
  │  • Betrag        │          │  • Rechnungsnr.  │
  │  • Empfänger     │          │  • Lieferant     │
  │  • Verwendung    │          │  • Datum         │
  └────────┬─────────┘          └────────┬─────────┘
           │                             │
           └──────────┬──────────────────┘
                      │
           ┌──────────▼──────────┐
           │  STUFE 1: EXAKT     │
           │  Konfidenz: 97%     │
           │                     │
           │  Betrag identisch   │
           │  UND                │
           │  Rechnungsnummer    │
           │  im Verwendungs-   │
           │  zweck gefunden     │
           └──────────┬──────────┘
                      │
                      │ Nicht zugeordnet?
                      ▼
           ┌──────────────────────┐
           │  STUFE 2: NAME      │
           │  Konfidenz: 85%     │
           │                     │
           │  Betrag identisch   │
           │  UND                │
           │  Lieferant/Kunde    │
           │  im Empfänger-      │
           │  namen gefunden     │
           └──────────┬──────────┘
                      │
                      │ Nicht zugeordnet?
                      ▼
           ┌──────────────────────┐
           │  STUFE 3: FUZZY     │
           │  Konfidenz: 65-75%  │
           │                     │
           │  Betrag ±2%         │
           │  UND                │
           │  Datum ±5 Tage      │
           └──────────┬──────────┘
                      │
           ┌──────────▼──────────┐
           │  Ergebnis:          │
           │                     │
           │  VORSCHLAG erstellt │
           │  Status: SUGGESTED  │
           │                     │
           │  User entscheidet:  │
           │  ✅ Bestätigen      │
           │  ❌ Ablehnen        │
           └─────────────────────┘
```

### Die 3 Matching-Stufen im Detail

| Stufe | Name | Konfidenz | Bedingungen | Beispiel |
|-------|------|-----------|-------------|---------|
| **1** | Exakt | 97% | Betrag auf den Cent genau + Rechnungsnr. im Verwendungszweck | TX: -1.250,50€ "RE-2026/0042 Firma Müller" → RE mit 1.250,50€ und Nr. RE-2026/0042 |
| **2** | Name | 85% | Betrag auf den Cent genau + Lieferantenname im Empfänger | TX: -500,00€ an "Mueller GmbH" → RE von "Firma Müller GmbH" über 500,00€ |
| **3** | Fuzzy | 65-75% | Betrag ±2% + Datum ±5 Tage | TX: -1.240,00€ am 25.02. → RE über 1.250,50€ vom 24.02. |

### Benutzer-Aktionen nach Matching

| Aktion | Was passiert | Wann sinnvoll |
|--------|-------------|---------------|
| **Bestätigen** | Zuordnung wird fix, Transaktion als "abgeglichen" markiert | Vorschlag ist korrekt |
| **Ablehnen** | Zuordnung wird gelöscht, Transaktion wird wieder frei für neuen Abgleich | Vorschlag ist falsch |
| **Manuell zuordnen** | User wählt selbst Rechnung + Transaktion | Kein automatischer Vorschlag gefunden |

### Monatsabstimmung — Übersicht

```
  ┌─────────────────────────────────────────────────────┐
  │                 Monatsabstimmung                     │
  ├─────────────┬─────────────────┬─────────────────────┤
  │  Zugeordnet │  Ohne Beleg     │  Offene Rechnungen  │
  │  (Matched)  │  (Unmatched TX) │  (Unmatched INV)    │
  │             │                 │                     │
  │  TX ↔ RE   │  TX ohne RE     │  RE ohne TX         │
  │  bestätigt │  (Upload nötig) │  (Zahlung fehlt)    │
  │  oder       │                 │                     │
  │  vorgeschl. │                 │                     │
  └─────────────┴─────────────────┴─────────────────────┘
```

---

## 6. Prozess 5: Genehmigung & Archivierung

### Prozessschaubild

```
                    ┌──────────────────────┐
                    │  Rechnung anzeigen   │
                    │  mit Ampel-Status    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Benutzer prüft:     │
                    │  • Ampel-Farbe       │
                    │  • Einzelne Checks   │
                    │  • Extrahierte Daten │
                    │  • Original-PDF      │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼──────┐ ┌───────▼──────┐
     │ GENEHMIGEN &  │ │  ABLEHNEN   │ │ ERSATZBELEG  │
     │ ARCHIVIEREN   │ │             │ │  erstellen   │
     └────────┬──────┘ └──────┬──────┘ └───────┬──────┘
              │               │                │
              │          Status →          Neues Dokument
              │          REJECTED          mit korrigierten
              │                            Daten anlegen
              ▼
     ┌────────────────────────────────────────────┐
     │           ARCHIVIERUNGSPROZESS              │
     │                                            │
     │  1. Fortlaufende Nummer vergeben           │
     │     ER-2026-00001 (Eingangsrechnung)       │
     │     AR-2026-00001 (Ausgangsrechnung)       │
     │     GS-2026-00001 (Gutschrift)             │
     │                                            │
     │  2. Falls Bild → automatisch in PDF        │
     │     umwandeln (A4-Format)                  │
     │                                            │
     │  3. Digitalen Eingangsstempel auf PDF      │
     │     ┌─────────────────────────────┐        │
     │     │ ER-2026-00001              │        │
     │     │ GÜLTIG ✓                   │        │
     │     │ Eingang: 24.02.2026        │        │
     │     │ Max Mustermann | 24.02.2026│        │
     │     │ Anm: Geprüft und korrekt  │        │
     │     └─────────────────────────────┘        │
     │                                            │
     │  4. PDF im Archiv ablegen                  │
     │     /archiv/2026/ER-2026-00001.pdf         │
     │                                            │
     │  5. Rechnung SPERREN                       │
     │     (keine Änderung mehr möglich)          │
     │                                            │
     │  6. Audit-Log Eintrag schreiben            │
     └────────────────────────────────────────────┘
```

### Fortlaufende Nummernvergabe

| Präfix | Belegart | Beispiel | Nummerierung |
|--------|----------|---------|--------------|
| **ER** | Eingangsrechnung | ER-2026-00001 | Fortlaufend pro Jahr, keine Lücken |
| **AR** | Ausgangsrechnung | AR-2026-00001 | Fortlaufend pro Jahr, keine Lücken |
| **GS** | Gutschrift | GS-2026-00001 | Fortlaufend pro Jahr, keine Lücken |

**Wichtig für den Steuerberater:**
- Nummern werden **nie wiederverwendet** (auch bei Storno nicht)
- Vergabe atomar (Datenbanksperre) — keine Duplikate möglich
- Lückenlose Nummerierung gemäß BAO

### Eingangsstempel auf PDF

Jede archivierte Rechnung erhält einen digitalen Stempel (oben rechts):
- Archivnummer (ER-2026-00001)
- Prüfstatus (GÜLTIG / WARNUNG / GEPRÜFT)
- Eingangsdatum
- Name des genehmigenden Benutzers + Zeitstempel
- Optionale Anmerkung

### Sperrung (Immutability)

Nach Archivierung ist die Rechnung **gesperrt**:
- Keine Datenänderung möglich
- Keine erneute Genehmigung
- Keine Löschung
- Nur über **Ersatzbeleg** (neues Dokument) korrigierbar
- API gibt HTTP 409 bei Änderungsversuchen

---

## 7. Prozess 6: BMD-Export

### Prozessschaubild

```
                    ┌──────────────────────┐
                    │  Benutzer wählt:     │
                    │  • Zeitraum          │
                    │  • Belegart          │
                    │  • Status-Filter     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  System sammelt:     │
                    │  Alle archivierten   │
                    │  Rechnungen im       │
                    │  gewählten Zeitraum  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  CSV-Datei erzeugen  │
                    │                     │
                    │  Format:            │
                    │  • Trennzeichen: ;  │
                    │  • Dezimal: ,       │
                    │  • Datum: dd.MM.yyyy│
                    │  • Encoding:        │
                    │    ISO-8859-1       │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  BMD-Steuercodes     │
                    │  zuordnen:           │
                    │                     │
                    │  20% → V20          │
                    │  13% → V13          │
                    │  10% → V10          │
                    │   0% → V00          │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Download als        │
                    │  CSV-Datei           │
                    │                     │
                    │  → Import in BMD     │
                    │     Buchhaltung      │
                    └──────────────────────┘
```

### Exportierte Felder pro Rechnung

| Feld | Beispiel | Quelle |
|------|---------|--------|
| Archivnummer | ER-2026-00001 | System (fortlaufend) |
| Rechnungsnummer | RE-2026/0042 | Extrahiert (OCR) |
| Rechnungsdatum | 24.02.2026 | Extrahiert (OCR) |
| Lieferant/Kunde | Firma Müller GmbH | Extrahiert (OCR) |
| UID-Nummer | ATU12345678 | Extrahiert (OCR) |
| Leistungsbeschreibung | IT-Dienstleistung | Extrahiert (OCR) |
| Nettobetrag | 1042,08 | Extrahiert (OCR) |
| Steuersatz / BMD-Code | V20 | Zugeordnet |
| Steuerbetrag | 208,42 | Extrahiert (OCR) |
| Bruttobetrag | 1250,50 | Extrahiert (OCR) |
| Währung | EUR | Extrahiert (OCR) |
| Prüfstatus | GÜLTIG | System (Ampel) |
| Archivierungsdatum | 24.02.2026 | System |
| Bankabgleich | ABGEGLICHEN | System (Matching) |

---

## 8. Prozess 7: Sonderfälle

### 7a. Reverse Charge (§19 UStG)

```
  Rechnung erkannt als Reverse Charge
         │
         ▼
  ┌────────────────────────────────┐
  │  Prüfungen:                    │
  │  • Kein USt-Betrag ausgewiesen │
  │  • Hinweis "Übergang der       │
  │    Steuerschuld" vorhanden     │
  │  • Ausländischer Aussteller    │
  └────────────────┬───────────────┘
                   │
         Automatisch korrekt behandelt
         → Keine USt im Export
         → Hinweis für Steuerberater
```

### 7b. Ersatzbeleg (§132 BAO)

```
  Original-Rechnung fehlerhaft oder verloren
         │
         ▼
  ┌────────────────────────────────┐
  │  Ersatzbeleg erstellen:        │
  │  • Begründung eingeben         │
  │  • Korrekte Daten erfassen     │
  │  • System generiert PDF        │
  │  • Original wird als           │
  │    "ERSETZT" markiert          │
  │  • Neuer Beleg durchläuft      │
  │    normalen Prozess            │
  └────────────────────────────────┘
```

### 7c. Eigenbeleg (§132 BAO)

```
  Kein Beleg vorhanden (z.B. Parkgebühr, Trinkgeld)
         │
         ▼
  ┌────────────────────────────────┐
  │  Eigenbeleg erstellen:         │
  │  • Grund auswählen:            │
  │    - Beleg verloren            │
  │    - Automat ohne Beleg        │
  │    - Trinkgeld                 │
  │    - Parkgebühr                │
  │    - Kleinbetrag ohne Beleg    │
  │  • Betrag + Datum eingeben     │
  │  • Beschreibung hinzufügen     │
  │  • System generiert PDF        │
  │  • Normaler Archivierungsweg   │
  └────────────────────────────────┘
```

### 7d. Korrektur-E-Mail an Lieferant

```
  Rechnung hat Mängel (🔴 oder 🟡)
         │
         ▼
  ┌────────────────────────────────┐
  │  Korrektur-Mail senden:        │
  │  • Empfänger = Lieferant       │
  │  • Betreff vorgefertigt        │
  │  • Text mit Mängel-Details     │
  │  • Via SMTP versandt           │
  │  • Audit-Log Eintrag           │
  └────────────────────────────────┘
```

---

## 9. Benutzerrollen & Berechtigungen

| Funktion | Admin | Buchhalter | Steuerberater |
|----------|:-----:|:----------:|:-------------:|
| Rechnungen hochladen | ✅ | ✅ | — |
| Rechnungen einsehen | ✅ | ✅ | ✅ |
| Rechnungen genehmigen | ✅ | ✅ | — |
| Rechnungen ablehnen | ✅ | ✅ | — |
| Bankabgleich durchführen | ✅ | ✅ | — |
| BMD-Export erstellen | ✅ | ✅ | ✅ |
| Audit-Log einsehen | ✅ | ✅ | ✅ |
| Benutzer verwalten | ✅ | — | — |
| Einstellungen ändern | ✅ | — | — |
| Mandant konfigurieren | ✅ | — | — |

---

## 10. Prüfregeln-Katalog (Vollständig)

### Pflichtprüfungen nach §11 UStG

| Nr. | Prüfregel | Gesetzliche Basis | Beschreibung | Ampel bei Verstoß |
|-----|-----------|-------------------|-------------|-------------------|
| 1 | Name des Ausstellers | §11 Abs 1 Z 1 UStG | Vollständiger Firmenname muss vorhanden sein | 🔴 |
| 2 | Anschrift des Ausstellers | §11 Abs 1 Z 1 UStG | Straße + PLZ + Ort (ab Standardrechnung) | 🔴 |
| 3 | UID-Nummer Aussteller | §11 Abs 1 Z 2 UStG | Format ATU + 8 Ziffern (ab Standardrechnung) | 🔴 |
| 4 | Name des Empfängers | §11 Abs 1 Z 3 UStG | Unser Firmenname (ab Großbetragsrechnung) | 🔴 |
| 5 | UID-Nummer Empfänger | §11 Abs 1 Z 3a UStG | Unsere UID (ab Großbetragsrechnung) | 🔴 |
| 6 | Rechnungsnummer | §11 Abs 1 Z 5 UStG | Fortlaufende Nummer des Ausstellers | 🔴 |
| 7 | Rechnungsdatum | §11 Abs 1 Z 4 UStG | Ausstellungsdatum der Rechnung | 🔴 |
| 8 | Liefer-/Leistungsdatum | §11 Abs 1 Z 4 UStG | Wann wurde geliefert/geleistet | 🟡 |
| 9 | Leistungsbeschreibung | §11 Abs 1 Z 3 UStG | Was wurde geliefert/geleistet | 🔴 |
| 10 | Nettobetrag | §11 Abs 1 Z 5 UStG | Entgelt ohne USt | 🔴 |
| 11 | Steuersatz | §11 Abs 1 Z 5 UStG | 20%, 13%, 10% oder 0% | 🔴 |
| 12 | Steuerbetrag | §11 Abs 1 Z 5 UStG | USt in Euro | 🔴 |
| 13 | Bruttobetrag | §11 Abs 1 Z 5 UStG | Gesamtbetrag inkl. USt | 🔴 |

### Berechnungsprüfungen

| Nr. | Prüfregel | Beschreibung | Ampel bei Verstoß |
|-----|-----------|-------------|-------------------|
| 14 | Rechnerische Richtigkeit | Netto + USt = Brutto (±1 Cent Toleranz) | 🔴 |
| 15 | Gültiger Steuersatz | Nur 20%, 13%, 10%, 0% zulässig (AT) | 🔴 |
| 16 | Multi-USt-Aufschlüsselung | Bei mehreren Steuersätzen: Summe der Teilbeträge muss Gesamtbetrag ergeben | 🟡 |

### Plausibilitätsprüfungen

| Nr. | Prüfregel | Beschreibung | Ampel bei Verstoß |
|-----|-----------|-------------|-------------------|
| 17 | UID-Syntax | ATU + 8 Ziffern (Regex-Prüfung) | 🟡 |
| 18 | IBAN-Syntax | ISO 13616, Mod-97 Prüfziffer | ⬜ (Info) |
| 19 | IBAN-Abgleich | IBAN auf Rechnung vs. hinterlegte Bankkonten | 🟡 |
| 20 | Duplikat-Erkennung | Gleiche Rechnungsnr. + gleicher Lieferant | 🟡 |
| 21 | Reverse Charge | §19: kein USt-Betrag + Hinweistext vorhanden | 🟡 |
| 22 | Ausländische USt | EU-Lieferant ohne AT-UID → Sonderregeln | 🟡 |
| 23 | Selbstrechnung | Aussteller = Empfänger → Warnung | 🟡 |
| 24 | PLZ-UID Plausibilität | PLZ passt zum UID-Länderkürzel | 🟡 |
| 25 | Fremdwährung | Nicht-EUR Rechnung → Info für Umrechnung | ⬜ (Info) |

---

## Glossar

| Begriff | Erklärung |
|---------|-----------|
| **OCR** | Optical Character Recognition — Texterkennung aus Bildern |
| **GPT-4 Vision** | KI-Modell von OpenAI, das Bilder analysieren und strukturierte Daten extrahieren kann |
| **PWA** | Progressive Web App — Website die sich wie eine native App auf dem Handy installieren lässt |
| **Matching** | Automatischer Abgleich zwischen Bankbewegungen und Rechnungen |
| **Konfidenz** | Wie sicher sich die KI bei der Erkennung eines Feldes ist (0-100%) |
| **BMD** | Österreichisches Buchhaltungssoftware-System |
| **S3/MinIO** | Cloud-Speicher für Dateien (S3-kompatibel) |
| **Audit-Log** | Lückenlose Protokollierung aller Aktionen für Nachvollziehbarkeit |
| **Eigenbeleg** | Selbst erstellter Beleg nach §132 BAO, wenn kein Original vorhanden |
| **Ersatzbeleg** | Korrigierte Version eines fehlerhaften Originals |

---

*Erstellt am 24.02.2026 | Ki2Go Accounting v1.0 | Automatisch generiert*
