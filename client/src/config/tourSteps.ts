import type { Step } from 'react-joyride';

// ============================================================
// Dashboard Tour — First thing users see after login
// ============================================================
export const dashboardTourSteps: Step[] = [
  {
    target: 'body',
    placement: 'center',
    title: 'Willkommen bei Ki2Go!',
    content:
      'Ihre KI-gestützte Buchhaltung. In 30 Sekunden zeigen wir Ihnen die wichtigsten Funktionen.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="nav-inbox"]',
    title: 'A: Rechnungseingang',
    content:
      'Hier landen alle neuen Belege — per Upload, E-Mail oder Scan. Die KI erkennt automatisch Rechnungsdaten.',
  },
  {
    target: '[data-tour="nav-check"]',
    title: 'B: Rechnungs-Check',
    content:
      'Ampel-System: Grün = OK, Gelb = prüfen, Rot = Problem. Die KI prüft nach §11 UStG (18 Regeln).',
  },
  {
    target: '[data-tour="nav-matching"]',
    title: 'C: Zahlungs-Check',
    content:
      'Automatischer Bankabgleich: Rechnungen werden Kontobewegungen zugeordnet. Sie bestätigen nur noch.',
  },
  {
    target: '[data-tour="nav-export"]',
    title: 'Export',
    content:
      'BMD-Export, Monatsreport PDF und vollständiges Archiv-ZIP — alles mit einem Klick.',
  },
  {
    target: '[data-tour="nav-settings"]',
    title: 'Einstellungen',
    content:
      'Firma, Bankkonten, E-Mail-Abruf, Team-Mitglieder und Genehmigungsregeln konfigurieren.',
  },
];

// ============================================================
// Inbox Tour — When user first visits inbox
// ============================================================
export const inboxTourSteps: Step[] = [
  {
    target: '[data-tour="inbox-upload"]',
    title: 'Belege hochladen',
    content:
      'PDF oder Foto hierher ziehen, oder klicken zum Auswählen. Die KI startet sofort mit der Erkennung.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="inbox-list"]',
    title: 'Belegliste',
    content:
      'Neue Belege erscheinen hier. Klicken Sie einen Beleg an, um die erkannten Daten zu sehen.',
  },
  {
    target: '[data-tour="inbox-triage"]',
    title: 'Zur Prüfung senden',
    content:
      'Bestätigen Sie, dass es sich um eine Rechnung handelt, und senden Sie sie zur detaillierten Prüfung.',
  },
];

// ============================================================
// Invoices (Check) Tour
// ============================================================
export const invoicesTourSteps: Step[] = [
  {
    target: '[data-tour="invoices-filters"]',
    title: 'Filter & Status',
    content:
      'Filtern Sie nach Status: Neu, Geprüft, Genehmigt, Archiviert. Rot = überfällig.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="invoices-table"]',
    title: 'Belegtabelle',
    content:
      'Klicken Sie auf einen Beleg für Details. Die Ampel zeigt den Prüfstatus auf einen Blick.',
  },
  {
    target: '[data-tour="invoices-approve"]',
    title: 'Genehmigen & Archivieren',
    content:
      'Geprüfte Belege genehmigen Sie mit einer Absetzbarkeitsregel. Dann archivieren für den Export.',
  },
];

// ============================================================
// Matching Tour
// ============================================================
export const matchingTourSteps: Step[] = [
  {
    target: '[data-tour="matching-upload"]',
    title: 'Kontoauszug importieren',
    content:
      'Laden Sie Ihren Kontoauszug als CSV hoch. Die Bank-Transaktionen werden automatisch eingelesen.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="matching-list"]',
    title: 'Offene Transaktionen',
    content:
      'Transaktionen ohne zugeordnete Rechnung erscheinen hier. Ki2Go schlägt Matches vor.',
  },
  {
    target: '[data-tour="matching-confirm"]',
    title: 'Match bestätigen',
    content:
      'Stimmt der Vorschlag? Ein Klick genügt. Bei Abweichungen können Sie den Grund angeben (Skonto etc.).',
  },
];
