import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { AMOUNT_CLASS_THRESHOLDS, VAT_RATE_VALUES, VALIDATION_RULES, LEGAL_FORMS } from '@buchungsai/shared';
import type { TrafficLightStatus, AmountClass, ValidationCheck, ViesValidationInfo } from '@buchungsai/shared';
import { validateUid, compareCompanyNames } from './vies.service.js';

interface ExtractedFields {
  issuerName: string | null;
  issuerUid: string | null;
  issuerAddress: Record<string, string> | null;
  recipientName: string | null;
  recipientUid: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | string | null;
  deliveryDate: Date | string | null;
  description: string | null;
  netAmount: number | Prisma.Decimal | null;
  vatAmount: number | Prisma.Decimal | null;
  grossAmount: number | Prisma.Decimal | null;
  vatRate: number | Prisma.Decimal | null;
  vatBreakdown?: Array<{ rate: number; netAmount: number; vatAmount: number }> | null;
  isReverseCharge: boolean;
  issuerIban: string | null;
  issuerEmail?: string | null;
  currency?: string;
}

interface ValidationInput {
  extractedFields: ExtractedFields;
  tenantId: string;
  invoiceId: string;
  direction?: 'INCOMING' | 'OUTGOING';
  documentType?: string;
  estimatedEurGross?: number | null;
  exchangeRate?: number | null;
  exchangeRateDate?: string | null;
  hospitalityGuests?: string | null;
  hospitalityReason?: string | null;
  isHospitality?: boolean;
}

export interface ValidationOutput {
  overallStatus: TrafficLightStatus;
  amountClass: AmountClass;
  checks: ValidationCheck[];
  viesInfo?: ViesValidationInfo;
}

function toNum(v: number | Prisma.Decimal | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'number' ? v : parseFloat(v.toString());
}

function determineAmountClass(grossAmount: number | null, currency?: string, estimatedEurGross?: number | null): AmountClass {
  if (grossAmount === null) return 'STANDARD';
  // For non-EUR: use estimated EUR gross for threshold comparison
  const eurAmount = (currency && currency !== 'EUR' && estimatedEurGross != null) ? estimatedEurGross : grossAmount;
  if (eurAmount <= AMOUNT_CLASS_THRESHOLDS.SMALL_MAX) return 'SMALL';
  if (eurAmount > AMOUNT_CLASS_THRESHOLDS.LARGE_MIN) return 'LARGE';
  return 'STANDARD';
}

function isRequiredFor(ruleId: string, amountClass: AmountClass): boolean {
  const rule = Object.values(VALIDATION_RULES).find((r) => r.id === ruleId);
  if (!rule) return false;
  return (rule.requiredFor as readonly string[]).includes(amountClass);
}

// EU-Länderkürzel für UID-Nummern
const EU_UID_PREFIXES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
  'EU', // EU OSS (One Stop Shop) — Unternehmen mit EU-weiter Umsatzsteuerregistrierung
  'FI', 'FR', 'GR', // GR = ISO-Code für Griechenland (UID-Präfix ist EL, aber GR kommt aus OCR/Adressen)
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'XI', // Nordirland (NI Protocol, post-Brexit)
];
const EU_COUNTRY_CODES = new Set(EU_UID_PREFIXES);

// ============================================================
// Vendor location detection (Inland / EU / Drittland)
// ============================================================

interface VendorLocation {
  region: 'INLAND' | 'EU' | 'DRITTLAND' | 'UNKNOWN';
  country: string | null;  // ISO-2
  label: string;           // z.B. "1020 Wien, AT" für Anzeige
}

function getAddressField(addr: Record<string, string> | null, ...keys: string[]): string | null {
  if (!addr) return null;
  for (const key of keys) {
    if (addr[key]?.trim()) return addr[key].trim();
  }
  return null;
}

function resolveCountryName(raw: string): string | null {
  const c = raw.trim().toUpperCase();
  const map: Record<string, string> = {
    'ÖSTERREICH': 'AT', 'AUSTRIA': 'AT', 'AT': 'AT', 'AUT': 'AT',
    'DEUTSCHLAND': 'DE', 'GERMANY': 'DE', 'DE': 'DE', 'DEU': 'DE', 'BRD': 'DE',
    'SCHWEIZ': 'CH', 'SWITZERLAND': 'CH', 'CH': 'CH', 'CHE': 'CH',
    'ITALIEN': 'IT', 'ITALY': 'IT', 'IT': 'IT', 'ITA': 'IT',
    'TSCHECHIEN': 'CZ', 'CZECH REPUBLIC': 'CZ', 'CZECHIA': 'CZ', 'CZ': 'CZ',
    'SLOWAKEI': 'SK', 'SLOVAKIA': 'SK', 'SK': 'SK',
    'UNGARN': 'HU', 'HUNGARY': 'HU', 'HU': 'HU',
    'SLOWENIEN': 'SI', 'SLOVENIA': 'SI', 'SI': 'SI',
    'KROATIEN': 'HR', 'CROATIA': 'HR', 'HR': 'HR',
    'POLEN': 'PL', 'POLAND': 'PL', 'PL': 'PL',
    'FRANKREICH': 'FR', 'FRANCE': 'FR', 'FR': 'FR',
    'NIEDERLANDE': 'NL', 'NETHERLANDS': 'NL', 'NL': 'NL',
    'BELGIEN': 'BE', 'BELGIUM': 'BE', 'BE': 'BE',
    'LUXEMBURG': 'LU', 'LUXEMBOURG': 'LU', 'LU': 'LU',
    'SPANIEN': 'ES', 'SPAIN': 'ES', 'ES': 'ES',
    'PORTUGAL': 'PT', 'PT': 'PT',
    'RUMÄNIEN': 'RO', 'ROMANIA': 'RO', 'RO': 'RO',
    'BULGARIEN': 'BG', 'BULGARIA': 'BG', 'BG': 'BG',
    'IRLAND': 'IE', 'IRELAND': 'IE', 'IE': 'IE',
    'GRIECHENLAND': 'EL', 'GREECE': 'EL', 'GR': 'EL', 'HELLAS': 'EL', 'EL': 'EL',
    'ZYPERN': 'CY', 'CYPRUS': 'CY', 'CY': 'CY',
    'ESTLAND': 'EE', 'ESTONIA': 'EE', 'EE': 'EE',
    'LETTLAND': 'LV', 'LATVIA': 'LV', 'LV': 'LV',
    'LITAUEN': 'LT', 'LITHUANIA': 'LT', 'LT': 'LT',
    'MALTA': 'MT', 'MT': 'MT',
    'FINNLAND': 'FI', 'FINLAND': 'FI', 'FI': 'FI',
    'SCHWEDEN': 'SE', 'SWEDEN': 'SE', 'SE': 'SE',
    'DÄNEMARK': 'DK', 'DENMARK': 'DK', 'DK': 'DK',
    'NORDIRLAND': 'XI', 'NORTHERN IRELAND': 'XI',
    'SINGAPUR': 'SG', 'SINGAPORE': 'SG', 'SG': 'SG',
    'USA': 'US', 'VEREINIGTE STAATEN': 'US', 'UNITED STATES': 'US', 'US': 'US',
    'GROSSBRITANNIEN': 'GB', 'VEREINIGTES KÖNIGREICH': 'GB', 'UNITED KINGDOM': 'GB', 'UK': 'GB', 'GB': 'GB',
    'NORWEGEN': 'NO', 'NORWAY': 'NO', 'NO': 'NO',
    'CHINA': 'CN', 'CN': 'CN',
    'JAPAN': 'JP', 'JP': 'JP',
    'INDIEN': 'IN', 'INDIA': 'IN', 'IN': 'IN',
    'TÜRKEI': 'TR', 'TURKEY': 'TR', 'TÜRKIYE': 'TR', 'TR': 'TR',
  };
  return map[c] || null;
}

/**
 * Bestimmt die Region des Lieferanten anhand aller verfügbaren Signale:
 * 1. UID-Prefix (stärkstes Signal)
 * 2. Explizites Land in der Adresse
 * 3. PLZ-Muster (nur als Plausibilitätshinweis, ersetzt keine UID)
 */
function detectVendorLocation(fields: ExtractedFields): VendorLocation {
  const uid = fields.issuerUid?.trim();
  const addr = fields.issuerAddress;
  const zip = getAddressField(addr, 'zip', 'plz', 'postalCode', 'postleitzahl');
  const city = getAddressField(addr, 'city', 'ort', 'stadt');
  const countryRaw = getAddressField(addr, 'country', 'land');

  const buildLabel = (country: string | null) => {
    const parts: string[] = [];
    if (zip) parts.push(zip);
    if (city) parts.push(city);
    if (country) parts.push(country);
    else if (countryRaw) parts.push(countryRaw);
    return parts.join(' ') || 'unbekannt';
  };

  // Signal 1: UID-Prefix → stärkstes Signal für das Land
  if (uid && uid.length >= 2) {
    const uidCountry = uid.substring(0, 2);
    if (uidCountry === 'AT') return { region: 'INLAND', country: 'AT', label: buildLabel('AT') };
    if (EU_UID_PREFIXES.includes(uidCountry)) return { region: 'EU', country: uidCountry, label: buildLabel(uidCountry) };
    // UID mit nicht-EU-Prefix → Drittland
    return { region: 'DRITTLAND', country: uidCountry, label: buildLabel(uidCountry) };
  }

  // Signal 2: Explizites Land in der Adresse
  if (countryRaw) {
    const country = resolveCountryName(countryRaw);
    if (country === 'AT') return { region: 'INLAND', country: 'AT', label: buildLabel('AT') };
    if (country && EU_UID_PREFIXES.includes(country)) return { region: 'EU', country, label: buildLabel(country) };
    if (country) return { region: 'DRITTLAND', country, label: buildLabel(country) };
  }

  // Signal 3: PLZ-Muster (nur Plausibilität — PLZ ersetzt keine UID!)
  if (zip) {
    const plzCountry = detectCountryFromPlz(zip, city);
    if (plzCountry === 'AT') return { region: 'INLAND', country: 'AT', label: buildLabel('AT') };
    if (plzCountry && EU_UID_PREFIXES.includes(plzCountry)) return { region: 'EU', country: plzCountry, label: buildLabel(plzCountry) };
    if (plzCountry) return { region: 'DRITTLAND', country: plzCountry, label: buildLabel(plzCountry) };
  }

  return { region: 'UNKNOWN', country: null, label: buildLabel(null) };
}

// ============================================================
// Individual validation rules
// ============================================================

function checkIssuerName(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.ISSUER_NAME;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für diese Betragsklasse`, legalBasis: rule.legalBasis };
  }
  if (!fields.issuerName?.trim()) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden: ${fields.issuerName}`, legalBasis: rule.legalBasis };
}

function checkIssuerAddress(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.ISSUER_ADDRESS;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }
  const addr = fields.issuerAddress;
  if (!addr || !addr.street || !addr.zip || !addr.city) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt oder unvollständig`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden`, legalBasis: rule.legalBasis };
}

function checkIssuerUid(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.ISSUER_UID;
  const uid = fields.issuerUid?.trim();
  const vendorLocation = detectVendorLocation(fields);
  const vatCharged = toNum(fields.vatAmount) !== null && toNum(fields.vatAmount)! > 0;

  // EU-B2B: UID IMMER zwingend, unabhängig von Betragsklasse
  const isEuB2B = vendorLocation.region === 'EU';

  if (!isRequiredFor(rule.id, amountClass) && !isEuB2B) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }

  if (uid) {
    return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden: ${uid}`, legalBasis: rule.legalBasis };
  }

  // UID fehlt — Bewertung hängt vom Kontext ab:

  // Drittland (nicht EU): UID nicht erforderlich
  if (vendorLocation.region === 'DRITTLAND') {
    return {
      rule: rule.id, status: 'GREEN',
      message: `${rule.label} nicht vorhanden — Drittland-Lieferant (${vendorLocation.label}), keine EU-UID erforderlich`,
      legalBasis: rule.legalBasis,
    };
  }

  // EU-Ausland (nicht AT): UID bei B2B zwingend
  if (vendorLocation.region === 'EU') {
    return {
      rule: rule.id, status: 'RED',
      message: `${rule.label} fehlt — EU-Lieferant (${vendorLocation.label}): UID bei B2B-Geschäften zwingend erforderlich`,
      legalBasis: rule.legalBasis,
      details: {
        actions: [
          `UID-Nummer des ${vendorLocation.country}-Lieferanten anfordern`,
          'Ohne UID: innergemeinschaftliche Leistung steuerlich nicht korrekt abwickelbar',
          'Vorsteuerabzug ohne gültige UID nicht möglich',
        ],
      },
    };
  }

  // Inland (AT): UID abhängig von USt-Pflicht
  if (vendorLocation.region === 'INLAND') {
    if (vatCharged) {
      // USt wird ausgewiesen → Unternehmer ist umsatzsteuerpflichtig → UID sollte vorhanden sein
      return {
        rule: rule.id, status: 'RED',
        message: `${rule.label} fehlt — Rechnung mit USt aber ohne UID des umsatzsteuerpflichtigen Ausstellers`,
        legalBasis: rule.legalBasis,
        details: {
          actions: [
            'UID-Nummer beim Lieferanten nachfragen',
            'Rechnung ist ohne UID nicht §11-konform',
          ],
        },
      };
    }
    // Keine USt ausgewiesen → wahrscheinlich Kleinunternehmer (§6 Abs 1 Z 27 UStG)
    return {
      rule: rule.id, status: 'YELLOW',
      message: `${rule.label} nicht vorhanden — Inländischer Lieferant ohne USt-Ausweis: vermutlich Kleinunternehmer (§6 Abs 1 Z 27 UStG), UID nicht erforderlich`,
      legalBasis: rule.legalBasis,
    };
  }

  // Herkunft unbekannt
  if (vatCharged) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt — bei Rechnung mit USt-Ausweis ist die UID erforderlich`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'YELLOW', message: `${rule.label} fehlt — Herkunft des Lieferanten nicht bestimmbar`, legalBasis: rule.legalBasis };
}

function checkRecipientName(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.RECIPIENT_NAME;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für diese Betragsklasse`, legalBasis: rule.legalBasis };
  }
  if (!fields.recipientName?.trim()) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt (erforderlich ab €10.000)`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden: ${fields.recipientName}`, legalBasis: rule.legalBasis };
}

function checkRecipientUid(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.RECIPIENT_UID;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für diese Betragsklasse`, legalBasis: rule.legalBasis };
  }
  if (!fields.recipientUid?.trim()) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt (erforderlich ab €10.000)`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden: ${fields.recipientUid}`, legalBasis: rule.legalBasis };
}

function checkInvoiceNumber(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.INVOICE_NUMBER;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }
  if (!fields.invoiceNumber?.trim()) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden: ${fields.invoiceNumber}`, legalBasis: rule.legalBasis };
}

function checkInvoiceDate(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.INVOICE_DATE;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich`, legalBasis: rule.legalBasis };
  }
  if (!fields.invoiceDate) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden`, legalBasis: rule.legalBasis };
}

function checkDeliveryDate(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.DELIVERY_DATE;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }
  if (!fields.deliveryDate) {
    return { rule: rule.id, status: 'YELLOW', message: `${rule.label} fehlt — kann das Rechnungsdatum sein`, legalBasis: rule.legalBasis };
  }
  // Check if deliveryDate equals invoiceDate (= automatic fallback)
  if (fields.invoiceDate && new Date(fields.deliveryDate).getTime() === new Date(fields.invoiceDate).getTime()) {
    return { rule: rule.id, status: 'YELLOW', message: `${rule.label}: Rechnungsdatum als Leistungsdatum übernommen`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden`, legalBasis: rule.legalBasis };
}

function checkDescription(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.DESCRIPTION;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich`, legalBasis: rule.legalBasis };
  }
  if (!fields.description?.trim()) {
    return { rule: rule.id, status: 'YELLOW', message: `${rule.label} fehlt oder unklar`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden`, legalBasis: rule.legalBasis };
}

function checkNetAmount(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.NET_AMOUNT;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }
  if (toNum(fields.netAmount) === null) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden`, legalBasis: rule.legalBasis };
}

function checkVatRate(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.VAT_RATE;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich`, legalBasis: rule.legalBasis };
  }
  // Multi-rate: show all rates
  if (fields.vatBreakdown && fields.vatBreakdown.length > 1) {
    const rates = fields.vatBreakdown.map(b => b.rate);
    return { rule: rule.id, status: 'GREEN', message: `${rule.label}: ${rates.join('% + ')}% (aufgeteilt)`, legalBasis: rule.legalBasis };
  }
  const rate = toNum(fields.vatRate);
  if (rate === null) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label}: ${rate}%`, legalBasis: rule.legalBasis };
}

function checkVatAmount(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.VAT_AMOUNT;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }
  if (toNum(fields.vatAmount) === null) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden`, legalBasis: rule.legalBasis };
}

function checkGrossAmount(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.GROSS_AMOUNT;
  if (!isRequiredFor(rule.id, amountClass)) {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich`, legalBasis: rule.legalBasis };
  }
  if (toNum(fields.grossAmount) === null) {
    return { rule: rule.id, status: 'RED', message: `${rule.label} fehlt`, legalBasis: rule.legalBasis };
  }
  return { rule: rule.id, status: 'GREEN', message: `${rule.label} vorhanden`, legalBasis: rule.legalBasis };
}

function checkMath(fields: ExtractedFields): ValidationCheck {
  const rule = VALIDATION_RULES.MATH_CHECK;
  const TOLERANCE = 0.02;

  // Multi-rate breakdown: validate each line and totals
  if (fields.vatBreakdown && fields.vatBreakdown.length > 1) {
    const gross = toNum(fields.grossAmount);
    if (gross === null) {
      return { rule: rule.id, status: 'YELLOW', message: 'Rechnerische Prüfung nicht möglich (Bruttobetrag fehlt)', legalBasis: rule.legalBasis };
    }

    let totalNet = 0;
    let totalVat = 0;
    const lineDetails: string[] = [];

    for (const item of fields.vatBreakdown) {
      const lineNet = item.netAmount;
      const lineVat = item.vatAmount;
      totalNet += lineNet;
      totalVat += lineVat;

      // Check per-line math: net * rate/100 ≈ vat
      const expectedVat = Math.round((lineNet * item.rate / 100) * 100) / 100;
      const lineDiff = Math.abs(expectedVat - lineVat);
      if (lineDiff > TOLERANCE) {
        return {
          rule: rule.id, status: 'RED',
          message: `USt-Rechenfehler bei ${item.rate}%: ${lineNet} × ${item.rate}% = ${expectedVat}, aber USt ist ${lineVat}`,
          legalBasis: rule.legalBasis,
          details: { breakdown: fields.vatBreakdown, gross },
        };
      }
      lineDetails.push(`${item.rate}%: ${lineNet} + ${lineVat}`);
    }

    totalNet = Math.round(totalNet * 100) / 100;
    totalVat = Math.round(totalVat * 100) / 100;
    const calculated = Math.round((totalNet + totalVat) * 100) / 100;
    const diff = Math.abs(calculated - gross);

    if (diff <= TOLERANCE) {
      return {
        rule: rule.id, status: 'GREEN',
        message: `USt-Aufschlüsselung korrekt: ${lineDetails.join(' | ')} = ${gross} ✓`,
        legalBasis: rule.legalBasis,
      };
    }

    return {
      rule: rule.id, status: 'RED',
      message: `Rechenfehler bei USt-Aufschlüsselung: Summe ${calculated} ≠ Brutto ${gross} (Differenz: ${diff.toFixed(2)}€)`,
      legalBasis: rule.legalBasis,
      details: { breakdown: fields.vatBreakdown, totalNet, totalVat, gross, calculated, diff },
    };
  }

  // Single-rate: existing logic
  let net = toNum(fields.netAmount);
  let vat = toNum(fields.vatAmount);
  let gross = toNum(fields.grossAmount);
  const rate = toNum(fields.vatRate);

  // Try to derive missing amounts from available data
  if (gross !== null && rate !== null) {
    if (net === null) net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
    if (vat === null) vat = Math.round((gross - net) * 100) / 100;
  } else if (net !== null && vat !== null && gross === null) {
    gross = Math.round((net + vat) * 100) / 100;
  } else if (gross !== null && net !== null && vat === null) {
    vat = Math.round((gross - net) * 100) / 100;
  } else if (gross !== null && vat !== null && net === null) {
    net = Math.round((gross - vat) * 100) / 100;
  }

  if (net === null || vat === null || gross === null) {
    return { rule: rule.id, status: 'YELLOW', message: 'Rechnerische Prüfung nicht möglich (Beträge fehlen)', legalBasis: rule.legalBasis };
  }

  const calculated = Math.round((net + vat) * 100) / 100;
  const diff = Math.abs(calculated - gross);

  if (diff <= TOLERANCE) {
    return { rule: rule.id, status: 'GREEN', message: `Netto (${net}) + USt (${vat}) = Brutto (${gross}) ✓`, legalBasis: rule.legalBasis };
  }

  return {
    rule: rule.id,
    status: 'RED',
    message: `Rechenfehler: ${net} + ${vat} = ${calculated}, aber Brutto ist ${gross} (Differenz: ${diff.toFixed(2)}€)`,
    legalBasis: rule.legalBasis,
    details: { net, vat, gross, calculated, diff },
  };
}

function checkVatRateValid(fields: ExtractedFields): ValidationCheck {
  const rule = VALIDATION_RULES.VAT_RATE_VALID;

  // Multi-rate: validate each rate in the breakdown
  if (fields.vatBreakdown && fields.vatBreakdown.length > 1) {
    const invalidRates = fields.vatBreakdown
      .filter(b => !(VAT_RATE_VALUES as readonly number[]).includes(b.rate))
      .map(b => b.rate);
    if (invalidRates.length > 0) {
      return {
        rule: rule.id, status: 'RED',
        message: `Ungültige Steuersätze: ${invalidRates.join('%, ')}% (erlaubt: 20%, 13%, 10%, 0%)`,
        legalBasis: rule.legalBasis,
      };
    }
    const rates = fields.vatBreakdown.map(b => b.rate);
    return { rule: rule.id, status: 'GREEN', message: `Steuersätze ${rates.join('% + ')}% sind gültig`, legalBasis: rule.legalBasis };
  }

  const rate = toNum(fields.vatRate);

  if (rate === null) {
    return { rule: rule.id, status: 'YELLOW', message: 'Steuersatz nicht vorhanden', legalBasis: rule.legalBasis };
  }

  if ((VAT_RATE_VALUES as readonly number[]).includes(rate)) {
    return { rule: rule.id, status: 'GREEN', message: `Steuersatz ${rate}% ist gültig`, legalBasis: rule.legalBasis };
  }

  return {
    rule: rule.id,
    status: 'RED',
    message: `Steuersatz ${rate}% ist in Österreich nicht gültig (erlaubt: 20%, 13%, 10%, 0%)`,
    legalBasis: rule.legalBasis,
  };
}

function checkUidSyntax(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.UID_SYNTAX;
  const uid = fields.issuerUid?.trim();

  // Bei EU-Lieferanten immer prüfen (UID bei EU-B2B zwingend)
  const vendorLocation = detectVendorLocation(fields);
  if (!isRequiredFor(rule.id, amountClass) && vendorLocation.region !== 'EU') {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }
  if (!uid) {
    return { rule: rule.id, status: 'YELLOW', message: 'Keine UID-Nummer vorhanden', legalBasis: rule.legalBasis };
  }

  // AT-UID: ATU + 8 Ziffern
  if (/^ATU\d{8}$/.test(uid)) {
    return { rule: rule.id, status: 'GREEN', message: `UID-Syntax korrekt: ${uid} (AT)`, legalBasis: rule.legalBasis };
  }

  // Andere EU-UIDs: Länderkürzel + länderspezifisches Format
  const euPatterns: Record<string, RegExp> = {
    DE: /^DE\d{9}$/,
    BE: /^BE[01]\d{9}$/,
    BG: /^BG\d{9,10}$/,
    CZ: /^CZ\d{8,10}$/,
    DK: /^DK\d{8}$/,
    EE: /^EE\d{9}$/,
    EL: /^EL\d{9}$/,
    ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
    EU: /^EU\d{9}$/, // EU OSS (One Stop Shop) — z.B. Midjourney, Paddle
    FI: /^FI\d{8}$/,
    FR: /^FR[A-Z0-9]{2}\d{9}$/,
    HR: /^HR\d{11}$/,
    HU: /^HU\d{8}$/,
    IE: /^IE\d[A-Z0-9+*]\d{5}[A-Z]$/,
    IT: /^IT\d{11}$/,
    LT: /^LT(\d{9}|\d{12})$/,
    LU: /^LU\d{8}$/,
    LV: /^LV\d{11}$/,
    MT: /^MT\d{8}$/,
    NL: /^NL\d{9}B\d{2}$/,
    PL: /^PL\d{10}$/,
    PT: /^PT\d{9}$/,
    RO: /^RO\d{2,10}$/,
    SE: /^SE\d{12}$/,
    SI: /^SI\d{8}$/,
    SK: /^SK\d{10}$/,
    XI: /^XI(\d{9}|\d{12})$/, // Nordirland (NI Protocol, post-Brexit — Format wie GB)
  };

  const prefix = uid.substring(0, 2);
  if (euPatterns[prefix]) {
    if (euPatterns[prefix].test(uid)) {
      return { rule: rule.id, status: 'GREEN', message: `UID-Syntax korrekt: ${uid} (${prefix})`, legalBasis: rule.legalBasis };
    }
    return { rule: rule.id, status: 'YELLOW', message: `UID-Syntax für ${prefix} möglicherweise ungültig: ${uid}`, legalBasis: rule.legalBasis };
  }

  // Unbekanntes Format
  return { rule: rule.id, status: 'YELLOW', message: `UID-Format nicht erkannt: ${uid} — manuelle Prüfung empfohlen`, legalBasis: rule.legalBasis };
}

// ISO 13616 IBAN country-specific lengths
const IBAN_LENGTHS: Record<string, number> = {
  AT: 20, DE: 22, CH: 21, BE: 16, BG: 22, CZ: 24, DK: 18, EE: 20,
  ES: 24, FI: 18, FR: 27, GB: 22, HR: 21, HU: 28, IE: 22, IT: 27,
  LT: 20, LU: 20, LV: 21, MT: 31, NL: 18, PL: 28, PT: 25, RO: 24,
  SE: 24, SI: 19, SK: 24,
};

/**
 * ISO 13616 Mod-97 Prüfziffern-Validierung
 * Buchstaben → Ziffern (A=10..Z=35), erste 4 Zeichen ans Ende, BigInt mod 97 === 1
 */
function validateIbanCheckDigit(ibanClean: string): boolean {
  // Move first 4 chars (country + check digits) to end
  const rearranged = ibanClean.substring(4) + ibanClean.substring(0, 4);
  // Convert letters to numbers (A=10, B=11, ..., Z=35)
  let numericStr = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numericStr += (code - 55).toString();
    } else {
      numericStr += ch;
    }
  }
  // BigInt mod 97
  try {
    return BigInt(numericStr) % 97n === 1n;
  } catch {
    return false;
  }
}

function checkIbanSyntax(fields: ExtractedFields, tenantIbans: string[] = [], direction: 'INCOMING' | 'OUTGOING' = 'INCOMING'): ValidationCheck {
  const rule = VALIDATION_RULES.IBAN_SYNTAX;
  const iban = fields.issuerIban;

  if (!iban) {
    // For outgoing: no IBAN is less critical (customer doesn't need our IBAN for payment to us)
    const status = direction === 'OUTGOING' ? 'GRAY' : 'YELLOW';
    const message = direction === 'OUTGOING' ? 'Keine IBAN auf Ausgangsrechnung (optional)' : 'Keine IBAN vorhanden';
    return { rule: rule.id, status, message, legalBasis: rule.legalBasis };
  }

  const ibanClean = iban.replace(/\s/g, '').toUpperCase();

  // Step 1: Basic regex
  const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
  if (!ibanRegex.test(ibanClean)) {
    return { rule: rule.id, status: 'YELLOW', message: `IBAN-Syntax möglicherweise ungültig: ${iban}`, legalBasis: rule.legalBasis };
  }

  // Step 2: Country-specific length
  const country = ibanClean.substring(0, 2);
  const expectedLength = IBAN_LENGTHS[country];
  if (expectedLength && ibanClean.length !== expectedLength) {
    return {
      rule: rule.id, status: 'RED',
      message: `IBAN-Länge ungültig: ${ibanClean.length} Zeichen, erwartet ${expectedLength} für ${country}`,
      legalBasis: rule.legalBasis,
    };
  }

  // Step 3: Mod-97 check digit validation
  if (!validateIbanCheckDigit(ibanClean)) {
    return {
      rule: rule.id, status: 'RED',
      message: `IBAN-Prüfziffer ungültig: ${iban} — die IBAN ist rechnerisch falsch`,
      legalBasis: rule.legalBasis,
    };
  }

  // Step 4: Compare against ALL tenant IBANs
  for (const tenantIban of tenantIbans) {
    const tenantIbanClean = tenantIban.replace(/\s/g, '').toUpperCase();
    if (ibanClean === tenantIbanClean) {
      // For OUTGOING: own IBAN is EXPECTED (we're the issuer)
      if (direction === 'OUTGOING') {
        return { rule: rule.id, status: 'GREEN', message: `Eigene Firmen-IBAN korrekt: ${iban}`, legalBasis: rule.legalBasis };
      }
      return {
        rule: rule.id, status: 'YELLOW',
        message: `Dies ist Ihre eigene Firmen-IBAN (${iban}) — bei Eingangsrechnungen wird die IBAN des Lieferanten erwartet`,
        legalBasis: rule.legalBasis,
      };
    }
  }

  return { rule: rule.id, status: 'GREEN', message: `IBAN-Syntax und Prüfziffer korrekt: ${iban}`, legalBasis: rule.legalBasis };
}

function checkReverseCharge(fields: ExtractedFields, amountClass: AmountClass, direction: 'INCOMING' | 'OUTGOING' = 'INCOMING'): ValidationCheck {
  const rule = VALIDATION_RULES.REVERSE_CHARGE;

  // For outgoing invoices: RC responsibility lies with recipient, not us
  if (direction === 'OUTGOING') {
    return { rule: rule.id, status: 'GRAY', message: 'Reverse Charge Prüfung: bei Ausgangsrechnungen nicht anwendbar', legalBasis: rule.legalBasis };
  }

  const vendorLoc = detectVendorLocation(fields);
  if (!isRequiredFor(rule.id, amountClass) && vendorLoc.region !== 'EU') {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }

  if (!fields.isReverseCharge) {
    return { rule: rule.id, status: 'GREEN', message: 'Kein Reverse Charge — Standard-Rechnung', legalBasis: rule.legalBasis };
  }

  // RC: vatAmount should be 0
  const vatAmount = toNum(fields.vatAmount);
  if (vatAmount !== null && vatAmount !== 0) {
    return {
      rule: rule.id,
      status: 'RED',
      message: `Reverse Charge markiert, aber USt-Betrag ist ${vatAmount}€ (sollte 0 sein)`,
      legalBasis: rule.legalBasis,
    };
  }

  return { rule: rule.id, status: 'GREEN', message: 'Reverse Charge korrekt (USt = 0)', legalBasis: rule.legalBasis };
}


function checkForeignVat(fields: ExtractedFields, direction: 'INCOMING' | 'OUTGOING' = 'INCOMING'): ValidationCheck {
  const rule = VALIDATION_RULES.FOREIGN_VAT_CHECK;
  const vatAmount = toNum(fields.vatAmount);
  const vatRate = toNum(fields.vatRate);
  const vatCharged = (vatAmount !== null && vatAmount > 0) || (vatRate !== null && vatRate > 0);

  // For OUTGOING: check customer location (recipient) instead of vendor location (issuer)
  if (direction === 'OUTGOING') {
    // Detect customer location from recipient UID
    const customerUid = fields.recipientUid?.trim();
    if (!customerUid) {
      return { rule: rule.id, status: 'GREEN', message: 'USt-Verrechnung plausibel für Ausgangsrechnung', legalBasis: rule.legalBasis };
    }
    const customerCountry = customerUid.substring(0, 2).toUpperCase();
    if (customerCountry === 'AT') {
      return { rule: rule.id, status: 'GREEN', message: 'Inländischer Kunde — USt-Ausweis korrekt', legalBasis: rule.legalBasis };
    }
    // EU customer with VAT charged → hint about reverse charge
    const isEu = EU_COUNTRY_CODES.has(customerCountry);
    if (isEu && vatCharged) {
      return {
        rule: rule.id, status: 'YELLOW',
        message: `EU-Kunde (${customerCountry}) — bei B2B evtl. Reverse Charge anwenden (USt nicht verrechnen)`,
        legalBasis: rule.legalBasis,
      };
    }
    return { rule: rule.id, status: 'GREEN', message: 'USt-Verrechnung plausibel für Ausgangsrechnung', legalBasis: rule.legalBasis };
  }

  const location = detectVendorLocation(fields);

  // Inland: USt-Ausweis ist normal
  if (location.region === 'INLAND') {
    if (!vatCharged) {
      return { rule: rule.id, status: 'GREEN', message: `Inländischer Lieferant (${location.label}) ohne USt — Kleinunternehmer oder steuerbefreit`, legalBasis: rule.legalBasis };
    }
    return { rule: rule.id, status: 'GREEN', message: `Inländischer Lieferant (${location.label}) — USt-Ausweis korrekt`, legalBasis: rule.legalBasis };
  }

  // EU-Ausland (B2B): Reverse Charge, keine USt auf der Rechnung
  if (location.region === 'EU') {
    if (!vatCharged) {
      return { rule: rule.id, status: 'GREEN', message: `EU-Lieferant (${location.label}) ohne USt — Reverse Charge oder B2C-Leistungsortregelung`, legalBasis: rule.legalBasis };
    }
    return {
      rule: rule.id,
      status: 'RED',
      message: `EU-Lieferant (${location.label}) verrechnet USt (${vatRate ?? '?'}%, ${vatAmount ?? '?'}€) — bei B2B muss Reverse Charge angewendet werden`,
      legalBasis: rule.legalBasis,
      details: {
        actions: [
          'Korrigierte Rechnung ohne USt anfordern (Reverse Charge)',
          'Vorsteuerabzug aus dieser Rechnung ist NICHT zulässig',
          'Reverse Charge: Sie schulden die USt selbst (§19 Abs 1 UStG)',
          'Beide Parteien müssen eine gültige UID besitzen',
        ],
      },
    };
  }

  // Drittland: eigene Export-/Leistungsortregelungen
  if (location.region === 'DRITTLAND') {
    if (!vatCharged) {
      return { rule: rule.id, status: 'GREEN', message: `Drittland-Lieferant (${location.label}) ohne USt — steuerlich korrekt`, legalBasis: rule.legalBasis };
    }
    return {
      rule: rule.id,
      status: 'RED',
      message: `Drittland-Lieferant (${location.label}) verrechnet USt (${vatRate ?? '?'}%, ${vatAmount ?? '?'}€) — Drittland-Unternehmen dürfen keine österreichische USt verrechnen`,
      legalBasis: rule.legalBasis,
      details: {
        actions: [
          'Korrigierte Rechnung ohne USt anfordern',
          'Zu viel bezahlte USt vom Lieferanten zurückfordern',
          'Vorsteuerabzug aus dieser Rechnung ist NICHT zulässig',
          'Einfuhrumsatzsteuer prüfen (§26 UStG)',
          'Nachweise für Steuerfreiheit/Leistungsort dokumentieren',
        ],
      },
    };
  }

  // Herkunft unbekannt: wenn keine UID und USt verrechnet → Warnung
  if (vatCharged) {
    const uid = fields.issuerUid?.trim();
    if (!uid) {
      return {
        rule: rule.id,
        status: 'YELLOW',
        message: `USt verrechnet (${vatRate ?? '?'}%, ${vatAmount ?? '?'}€), aber Herkunft des Lieferanten nicht bestimmbar — Inland oder Ausland?`,
        legalBasis: rule.legalBasis,
        details: {
          actions: [
            'Adresse und UID des Lieferanten prüfen',
            'Bei Inlands-Lieferant: USt-Ausweis korrekt',
            'Bei EU-Lieferant: Reverse Charge erforderlich',
            'Bei Drittland: keine österreichische USt zulässig',
          ],
        },
      };
    }
  }

  return { rule: rule.id, status: 'GREEN', message: 'USt-Verrechnung plausibel', legalBasis: rule.legalBasis };
}

// Länder-Erkennung anhand PLZ-Muster
// Gibt ISO-2 Ländercode zurück oder null
function detectCountryFromPlz(zip: string, city?: string | null): string | null {
  const clean = zip.replace(/\s/g, '');

  // Explizite Länderpräfixe: "A-1020", "D-80331", "CH-8001"
  const prefixMatch = clean.match(/^(A|AT|D|DE|CH|IT|CZ|SK|HU|SI|HR|PL|FR|NL|BE|LU)-?(.+)$/i);
  if (prefixMatch) {
    const p = prefixMatch[1].toUpperCase();
    const map: Record<string, string> = {
      'A': 'AT', 'AT': 'AT', 'D': 'DE', 'DE': 'DE', 'CH': 'CH',
      'IT': 'IT', 'CZ': 'CZ', 'SK': 'SK', 'HU': 'HU', 'SI': 'SI',
      'HR': 'HR', 'PL': 'PL', 'FR': 'FR', 'NL': 'NL', 'BE': 'BE', 'LU': 'LU',
    };
    return map[p] || null;
  }

  // Numerische PLZ: Muster-basierte Erkennung
  const digits = clean.replace(/\D/g, '');
  if (!digits) return null;

  // 4-stellig: Österreich (1010–9992), Schweiz, Belgien, Luxemburg, etc.
  // → Ohne weiteren Kontext gehen wir von AT aus (Zielgruppe ist AT)
  if (digits.length === 4) {
    const num = parseInt(digits);
    if (num >= 1010 && num <= 9992) return 'AT'; // Annahme: österreichisch
    return null;
  }

  // 5-stellig: Deutschland (01001–99998), Frankreich, Italien
  if (digits.length === 5) {
    const num = parseInt(digits);
    // Deutsche PLZ: 01001 bis 99998
    if (num >= 1001 && num <= 99998) return 'DE';
    return null;
  }

  // 6-stellig: Rumänien, China, etc.
  if (digits.length === 6) return null; // zu unspezifisch

  return null;
}

/**
 * PLZ-UID Plausibilitätsprüfung
 *
 * WICHTIG: Die PLZ ersetzt KEINE UID. Sie dient ausschließlich als
 * Plausibilitätshinweis zur Adressprüfung und Einordnung Inland/EU/Drittland.
 * Für steuerliche Zwecke zählt ausschließlich die gültige UID.
 */
function checkPlzUidConsistency(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.PLZ_UID_CHECK;

  const location = detectVendorLocation(fields);
  const uid = fields.issuerUid?.trim();

  // Bei EU-Lieferanten immer prüfen
  if (!isRequiredFor(rule.id, amountClass) && location.region !== 'EU') {
    return { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis };
  }
  const uidCountry = uid && uid.length >= 2 ? uid.substring(0, 2) : null;

  // Keine Adressdaten → Anschrift fehlt (separate Regel prüft das)
  if (location.region === 'UNKNOWN') {
    if (!uid) {
      return {
        rule: rule.id, status: 'YELLOW',
        message: 'Keine Adressdaten und keine UID — Herkunft des Lieferanten nicht bestimmbar',
        legalBasis: rule.legalBasis,
      };
    }
    return { rule: rule.id, status: 'GREEN', message: `Adress-Plausibilität nicht prüfbar (keine PLZ/Land), UID vorhanden (${uid})`, legalBasis: rule.legalBasis };
  }

  // UID vorhanden → Plausibilitätsvergleich UID-Land vs. Adress-Land
  if (uidCountry && location.country) {
    if (uidCountry !== location.country) {
      return {
        rule: rule.id, status: 'YELLOW',
        message: `Adresse deutet auf ${location.label}, aber UID ist ${uidCountry}-registriert — Betriebsstätte in anderem Land? Bitte prüfen.`,
        legalBasis: rule.legalBasis,
      };
    }
    return { rule: rule.id, status: 'GREEN', message: `Adresse (${location.label}) und UID-Land (${uidCountry}) stimmen überein`, legalBasis: rule.legalBasis };
  }

  // Keine UID → PLZ gibt Plausibilitätshinweis zur Einordnung
  // (Die eigentliche UID-Pflicht wird in checkIssuerUid / checkForeignVat geprüft)
  if (location.region === 'INLAND') {
    return { rule: rule.id, status: 'GREEN', message: `Adresse deutet auf Inland (${location.label}) — korrekte Anschrift ist Pflichtmerkmal der Rechnung`, legalBasis: rule.legalBasis };
  }

  if (location.region === 'EU') {
    return {
      rule: rule.id, status: 'YELLOW',
      message: `Adresse deutet auf EU-Ausland (${location.label}) — bei B2B sind UIDs beider Parteien zwingend erforderlich`,
      legalBasis: rule.legalBasis,
    };
  }

  if (location.region === 'DRITTLAND') {
    return {
      rule: rule.id, status: 'GREEN',
      message: `Adresse deutet auf Drittland (${location.label}) — keine EU-UID erforderlich, Nachweise für Leistungsort/Steuerfreiheit dokumentieren`,
      legalBasis: rule.legalBasis,
    };
  }

  return { rule: rule.id, status: 'GREEN', message: `Adress-Plausibilität: ${location.label}`, legalBasis: rule.legalBasis };
}

interface TenantInfo {
  name: string;
  uidNumber: string | null;
  ibans: string[];
}

async function checkIssuerIsNotSelf(tenantId: string, fields: ExtractedFields, tenantInfo?: TenantInfo | null, direction: 'INCOMING' | 'OUTGOING' = 'INCOMING'): Promise<ValidationCheck> {
  const rule = VALIDATION_RULES.ISSUER_SELF_CHECK;

  let tenant: TenantInfo | null = tenantInfo ?? null;
  if (!tenant) {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, uidNumber: true, bankAccounts: { where: { isActive: true }, select: { iban: true } } },
    });
    if (t) {
      tenant = {
        name: t.name,
        uidNumber: t.uidNumber,
        ibans: t.bankAccounts.map((a: { iban: string | null }) => a.iban).filter((i): i is string => !!i),
      };
    }
  }

  if (!tenant) {
    return { rule: rule.id, status: 'GREEN', message: 'Mandant nicht gefunden — Prüfung übersprungen', legalBasis: rule.legalBasis };
  }

  // OUTGOING: issuer SHOULD be our company
  if (direction === 'OUTGOING') {
    let selfMatch = false;
    if (tenant.uidNumber && fields.issuerUid) {
      const tenantUid = tenant.uidNumber.replace(/\s/g, '').toUpperCase();
      const issuerUid = fields.issuerUid.replace(/\s/g, '').toUpperCase();
      if (tenantUid === issuerUid) selfMatch = true;
    }
    if (!selfMatch && tenant.name && fields.issuerName) {
      const tenantNameLower = tenant.name.toLowerCase();
      const issuerNameLower = fields.issuerName.toLowerCase();
      if (issuerNameLower.includes(tenantNameLower) || tenantNameLower.includes(issuerNameLower)) selfMatch = true;
    }
    if (selfMatch) {
      return { rule: rule.id, status: 'GREEN', message: 'Aussteller ist die eigene Firma (korrekt für Ausgangsrechnung)', legalBasis: rule.legalBasis };
    }
    return {
      rule: rule.id, status: 'YELLOW',
      message: 'Aussteller konnte nicht als eigene Firma bestätigt werden — bei Ausgangsrechnungen sollte Ihr Unternehmen der Aussteller sein',
      legalBasis: rule.legalBasis,
    };
  }

  // INCOMING: issuer should NOT be our company
  // Check if issuer UID matches tenant UID (= own company listed as issuer = wrong)
  if (tenant.uidNumber && fields.issuerUid) {
    const tenantUid = tenant.uidNumber.replace(/\s/g, '').toUpperCase();
    const issuerUid = fields.issuerUid.replace(/\s/g, '').toUpperCase();
    if (tenantUid === issuerUid) {
      return {
        rule: rule.id,
        status: 'RED',
        message: `VERWECHSLUNG: Die eigene UID (${tenantUid}) wurde als Aussteller erkannt. Der Aussteller und Empfänger sind wahrscheinlich vertauscht — bitte manuell korrigieren.`,
        legalBasis: rule.legalBasis,
        details: {
          actions: [
            'Aussteller und Empfänger manuell tauschen',
            'Prüfen Sie den Briefkopf/Logo und die Fußzeile der Rechnung',
            'Die UID in der Fußzeile gehört normalerweise zum Aussteller',
          ],
        },
      };
    }
  }

  // Check if issuer IBAN matches ANY tenant IBAN
  if (fields.issuerIban && tenant.ibans.length > 0) {
    const issuerIbanClean = fields.issuerIban.replace(/\s/g, '').toUpperCase();
    for (const tenantIban of tenant.ibans) {
      const tenantIbanClean = tenantIban.replace(/\s/g, '').toUpperCase();
      if (tenantIbanClean === issuerIbanClean) {
        return {
          rule: rule.id,
          status: 'RED',
          message: `VERWECHSLUNG: Die Aussteller-IBAN (${fields.issuerIban}) ist Ihre eigene Firmen-IBAN. Aussteller und Empfänger sind wahrscheinlich vertauscht.`,
          legalBasis: rule.legalBasis,
          details: {
            actions: [
              'Aussteller und Empfänger manuell tauschen',
              'Prüfen Sie den Briefkopf/Logo und die Fußzeile der Rechnung',
            ],
          },
        };
      }
    }
  }

  // Check if issuer name matches tenant name (fuzzy)
  if (tenant.name && fields.issuerName) {
    const tenantNameLower = tenant.name.toLowerCase();
    const issuerNameLower = fields.issuerName.toLowerCase();
    if (issuerNameLower.includes(tenantNameLower) || tenantNameLower.includes(issuerNameLower)) {
      return {
        rule: rule.id,
        status: 'RED',
        message: `VERWECHSLUNG: "${fields.issuerName}" ähnelt dem eigenen Firmennamen "${tenant.name}". Aussteller und Empfänger sind wahrscheinlich vertauscht.`,
        legalBasis: rule.legalBasis,
        details: {
          actions: [
            'Aussteller und Empfänger manuell tauschen',
            'Prüfen Sie den Briefkopf/Logo und die Fußzeile der Rechnung',
          ],
        },
      };
    }
  }

  return { rule: rule.id, status: 'GREEN', message: 'Aussteller ist nicht die eigene Firma', legalBasis: rule.legalBasis };
}

async function checkDuplicate(tenantId: string, invoiceId: string, fields: ExtractedFields): Promise<ValidationCheck> {
  const rule = VALIDATION_RULES.DUPLICATE_CHECK;

  if (!fields.invoiceNumber || !fields.issuerName) {
    return { rule: rule.id, status: 'YELLOW', message: 'Duplikat-Prüfung nicht möglich (Rechnungsnr. oder Lieferant fehlt)', legalBasis: rule.legalBasis };
  }

  const duplicate = await prisma.invoice.findFirst({
    where: {
      tenantId,
      invoiceNumber: fields.invoiceNumber,
      vendorName: fields.issuerName,
      id: { not: invoiceId },
    },
    select: { id: true, invoiceNumber: true },
  });

  if (duplicate) {
    return {
      rule: rule.id,
      status: 'RED',
      message: `Mögliches Duplikat: Rechnungsnr. ${fields.invoiceNumber} von ${fields.issuerName} existiert bereits`,
      legalBasis: rule.legalBasis,
      details: { duplicateInvoiceId: duplicate.id },
    };
  }

  return { rule: rule.id, status: 'GREEN', message: 'Kein Duplikat gefunden', legalBasis: rule.legalBasis };
}

async function checkUidVies(
  fields: ExtractedFields,
  amountClass: AmountClass,
): Promise<{ check: ValidationCheck; viesInfo: ViesValidationInfo }> {
  const rule = VALIDATION_RULES.UID_VIES_CHECK;
  const uid = fields.issuerUid?.trim();

  const noCheckInfo: ViesValidationInfo = {
    checked: false, valid: false, registeredName: null,
    registeredAddress: null, nameMatch: false, nameSimilarity: 0,
  };

  // Bei EU-Lieferanten immer VIES prüfen (UID bei EU-B2B zwingend)
  const vendorLocation = detectVendorLocation(fields);
  if (!isRequiredFor(rule.id, amountClass) && vendorLocation.region !== 'EU') {
    return {
      check: { rule: rule.id, status: 'GRAY', message: `${rule.label}: nicht erforderlich für Kleinbetragsrechnung`, legalBasis: rule.legalBasis },
      viesInfo: noCheckInfo,
    };
  }

  if (!uid) {
    return {
      check: { rule: rule.id, status: 'YELLOW', message: 'Keine UID-Nummer vorhanden — VIES-Prüfung nicht möglich', legalBasis: rule.legalBasis },
      viesInfo: noCheckInfo,
    };
  }

  // Only check EU UIDs (non-EU can't be validated via VIES)
  const prefix = uid.substring(0, 2);
  if (!EU_UID_PREFIXES.includes(prefix)) {
    return {
      check: { rule: rule.id, status: 'YELLOW', message: `UID ${uid} ist keine EU-UID — VIES-Prüfung nicht möglich`, legalBasis: rule.legalBasis },
      viesInfo: noCheckInfo,
    };
  }

  // EU OSS Non-Union-Scheme (Präfix "EU"): kann nicht über VIES validiert werden
  // Diese Nummern werden von Drittland-Unternehmen (z.B. US) für EU-B2C-Verkäufe genutzt
  if (prefix === 'EU') {
    return {
      check: { rule: rule.id, status: 'GREEN', message: `EU OSS Registrierung ${uid} — VIES-Prüfung für Non-Union-Scheme nicht verfügbar`, legalBasis: rule.legalBasis },
      viesInfo: { ...noCheckInfo, checked: false },
    };
  }

  try {
    const viesResult = await validateUid(uid);

    if (viesResult.error) {
      return {
        check: { rule: rule.id, status: 'YELLOW', message: `VIES-Dienst nicht erreichbar: ${viesResult.error}`, legalBasis: rule.legalBasis },
        viesInfo: { ...noCheckInfo, error: viesResult.error },
      };
    }

    if (!viesResult.valid) {
      return {
        check: {
          rule: rule.id,
          status: 'RED',
          message: `UID ${uid} ist laut VIES UNGÜLTIG — kein Vorsteuerabzug möglich`,
          legalBasis: rule.legalBasis,
          details: { viesResult },
        },
        viesInfo: {
          checked: true, valid: false, registeredName: viesResult.name,
          registeredAddress: viesResult.address, nameMatch: false, nameSimilarity: 0,
        },
      };
    }

    // UID is valid — now compare company names
    let nameMatch = false;
    let nameSimilarity = 0;

    if (viesResult.name && fields.issuerName) {
      const comparison = compareCompanyNames(fields.issuerName, viesResult.name);
      nameMatch = comparison.match;
      nameSimilarity = comparison.similarity;
    }

    const viesInfo: ViesValidationInfo = {
      checked: true, valid: true,
      registeredName: viesResult.name,
      registeredAddress: viesResult.address,
      nameMatch, nameSimilarity,
    };

    if (viesResult.name && fields.issuerName && !nameMatch) {
      return {
        check: {
          rule: rule.id,
          status: 'YELLOW',
          message: `UID ${uid} ist gültig, aber der Firmenname weicht ab: "${fields.issuerName}" vs. VIES: "${viesResult.name}" (Ähnlichkeit: ${Math.round(nameSimilarity * 100)}%)`,
          legalBasis: rule.legalBasis,
          details: { registeredName: viesResult.name, registeredAddress: viesResult.address, nameSimilarity },
        },
        viesInfo,
      };
    }

    return {
      check: {
        rule: rule.id,
        status: 'GREEN',
        message: `UID ${uid} ist gültig${viesResult.name ? ` — ${viesResult.name}` : ''}`,
        legalBasis: rule.legalBasis,
        details: { registeredName: viesResult.name, registeredAddress: viesResult.address },
      },
      viesInfo,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return {
      check: { rule: rule.id, status: 'YELLOW', message: `VIES-Prüfung fehlgeschlagen: ${msg}`, legalBasis: rule.legalBasis },
      viesInfo: { ...noCheckInfo, error: msg },
    };
  }
}

// ============================================================
// Currency info check
// ============================================================

function checkCurrencyInfo(
  fields: ExtractedFields,
  estimatedEurGross: number | null | undefined,
  exchangeRate: number | null | undefined,
  exchangeRateDate: string | null | undefined,
): ValidationCheck {
  const rule = VALIDATION_RULES.CURRENCY_INFO;
  const currency = fields.currency || 'EUR';

  if (currency === 'EUR') {
    return { rule: rule.id, status: 'GRAY', message: 'Rechnung in EUR — keine Umrechnung nötig', legalBasis: rule.legalBasis };
  }

  const gross = toNum(fields.grossAmount);

  if (estimatedEurGross != null && exchangeRate != null && exchangeRateDate) {
    const formattedDate = new Date(exchangeRateDate).toLocaleDateString('de-AT');
    const grossStr = gross != null ? `${gross.toFixed(2)} ${currency}` : currency;
    return {
      rule: rule.id,
      status: 'GREEN',
      message: `Fremdwährungsrechnung: ${grossStr} ≈ ${estimatedEurGross.toFixed(2)} € (EZB-Kurs vom ${formattedDate}, 1 EUR = ${exchangeRate} ${currency})`,
      legalBasis: rule.legalBasis,
    };
  }

  return {
    rule: rule.id,
    status: 'YELLOW',
    message: `Fremdwährungsrechnung in ${currency} — EUR-Schätzwert nicht verfügbar (EZB nicht erreichbar)`,
    legalBasis: rule.legalBasis,
  };
}

// ============================================================
// Main validation function
// ============================================================

// ============================================================
// Bewirtungsbeleg-Prüfung (§20 Abs 1 Z 3 EStG)
// ============================================================

function checkHospitality(
  fields: ExtractedFields,
  hospitalityGuests?: string | null,
  hospitalityReason?: string | null,
  isHospitality?: boolean,
): ValidationCheck {
  const rule = VALIDATION_RULES.HOSPITALITY_CHECK;

  // Auto-detect hospitality from issuer name or category
  const hospKeywords = ['restaurant', 'gasthaus', 'café', 'cafe', 'catering', 'wirtshaus', 'pizzeria', 'bistro', 'trattoria', 'gasthof', 'hotel'];
  const nameMatch = fields.issuerName && hospKeywords.some(k => fields.issuerName!.toLowerCase().includes(k));

  // Mixed VAT rates (10% + 20%) is a strong indicator for Austrian restaurants
  const hasMixedGastroRates = fields.vatBreakdown && fields.vatBreakdown.length >= 2 &&
    fields.vatBreakdown.some(b => b.rate === 10) && fields.vatBreakdown.some(b => b.rate === 20);

  const detected = isHospitality || nameMatch || hasMixedGastroRates;

  if (!detected) {
    return {
      rule: rule.id,
      status: 'GRAY',
      message: 'Kein Bewirtungsbeleg erkannt',
      legalBasis: rule.legalBasis,
    };
  }

  // Hospitality detected → check required fields
  const missing: string[] = [];
  if (!hospitalityGuests) missing.push('Bewirtete Personen');
  if (!hospitalityReason) missing.push('Anlass der Bewirtung');

  if (missing.length > 0) {
    return {
      rule: rule.id,
      status: 'YELLOW',
      message: `Bewirtungsbeleg erkannt — fehlende Angaben: ${missing.join(', ')}. Bitte ergänzen für Vorsteuerabzug.`,
      legalBasis: rule.legalBasis,
    };
  }

  return {
    rule: rule.id,
    status: 'GREEN',
    message: 'Bewirtungsbeleg: Alle Pflichtangaben vorhanden',
    legalBasis: rule.legalBasis,
  };
}

function checkCreditNote(fields: ExtractedFields, documentType: string): ValidationCheck {
  const rule = VALIDATION_RULES.CREDIT_NOTE_CHECK;

  if (documentType !== 'CREDIT_NOTE' && documentType !== 'ADVANCE_PAYMENT') {
    return {
      rule: rule.id,
      status: 'GREEN',
      message: 'Standardrechnung — Gutschrift-Prüfung nicht erforderlich',
      legalBasis: rule.legalBasis,
    };
  }

  if (documentType === 'CREDIT_NOTE') {
    const gross = toNum(fields.grossAmount);
    const warnings: string[] = [];

    if (gross !== null && gross > 0) {
      warnings.push('Bruttobetrag ist positiv — bei einer Gutschrift ist der Betrag üblicherweise negativ');
    }

    if (warnings.length > 0) {
      return {
        rule: rule.id,
        status: 'YELLOW',
        message: `Gutschrift erkannt: ${warnings.join('. ')}. Bitte prüfen.`,
        legalBasis: rule.legalBasis,
      };
    }

    return {
      rule: rule.id,
      status: 'GREEN',
      message: 'Gutschrift erkannt — Betrag korrekt als negativ/Gutschrift',
      legalBasis: rule.legalBasis,
    };
  }

  // ADVANCE_PAYMENT
  return {
    rule: rule.id,
    status: 'GREEN',
    message: 'Anzahlungsrechnung erkannt — wird als AZ archiviert',
    legalBasis: rule.legalBasis,
  };
}

function checkLegalForm(fields: ExtractedFields, amountClass: AmountClass): ValidationCheck {
  const rule = VALIDATION_RULES.LEGAL_FORM_CHECK;
  const required = isRequiredFor(rule.id, amountClass);

  const issuerName = fields.issuerName?.trim();
  if (!issuerName) {
    return {
      rule: rule.id,
      status: required ? 'YELLOW' : 'GREEN',
      message: required
        ? 'Rechtsform nicht prüfbar — Ausstellername fehlt'
        : 'Rechtsform-Prüfung übersprungen (Kleinbetrag)',
      legalBasis: rule.legalBasis,
    };
  }

  // Detect legal form from issuer name
  let detectedForm: { label: string; uidRequired: boolean } | null = null;
  for (const form of Object.values(LEGAL_FORMS)) {
    if (form.pattern.test(issuerName)) {
      detectedForm = { label: form.label, uidRequired: form.uidRequired };
      break;
    }
  }

  if (!detectedForm) {
    // No legal form detected — INFO only, no penalty
    return {
      rule: rule.id,
      status: 'GREEN',
      message: `Keine explizite Rechtsform im Firmennamen erkannt ("${issuerName}"). Möglicherweise Einzelunternehmer ohne Firmenbuch-Eintrag.`,
      legalBasis: rule.legalBasis,
    };
  }

  // Legal form detected — check if UID is required and present
  if (detectedForm.uidRequired && !fields.issuerUid) {
    return {
      rule: rule.id,
      status: 'YELLOW',
      message: `Rechtsform "${detectedForm.label}" erkannt — juristische Person, aber UID-Nummer fehlt auf der Rechnung. Gemäß §14 UGB sollte die UID angegeben sein.`,
      legalBasis: rule.legalBasis,
    };
  }

  return {
    rule: rule.id,
    status: 'GREEN',
    message: detectedForm.uidRequired
      ? `Rechtsform "${detectedForm.label}" erkannt — UID vorhanden ✓`
      : `Rechtsform "${detectedForm.label}" erkannt — UID-Nummer nicht zwingend erforderlich`,
    legalBasis: rule.legalBasis,
  };
}

export async function validateInvoice(input: ValidationInput): Promise<ValidationOutput> {
  const { extractedFields: fields, tenantId, invoiceId, direction = 'INCOMING', documentType = 'INVOICE', estimatedEurGross, exchangeRate, exchangeRateDate } = input;
  const gross = toNum(fields.grossAmount);
  const currency = fields.currency || 'EUR';
  const amountClass = determineAmountClass(gross, currency, estimatedEurGross);

  // Load tenant info once for IBAN comparison and self-check
  const tenantRaw = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, uidNumber: true, bankAccounts: { where: { isActive: true }, select: { iban: true } } },
  });

  const tenantIbans = tenantRaw?.bankAccounts
    .map((a: { iban: string | null }) => a.iban)
    .filter((i): i is string => !!i) ?? [];

  const tenantInfo: TenantInfo | null = tenantRaw ? {
    name: tenantRaw.name,
    uidNumber: tenantRaw.uidNumber,
    ibans: tenantIbans,
  } : null;

  const checks: ValidationCheck[] = [
    // Pflichtfelder
    checkIssuerName(fields, amountClass),
    checkIssuerAddress(fields, amountClass),
    checkIssuerUid(fields, amountClass),
    checkRecipientName(fields, amountClass),
    checkRecipientUid(fields, amountClass),
    checkInvoiceNumber(fields, amountClass),
    checkInvoiceDate(fields, amountClass),
    checkDeliveryDate(fields, amountClass),
    checkDescription(fields, amountClass),
    checkNetAmount(fields, amountClass),
    checkVatRate(fields, amountClass),
    checkVatAmount(fields, amountClass),
    checkGrossAmount(fields, amountClass),
    // Rechnerische & Logik-Prüfungen
    checkMath(fields),
    checkVatRateValid(fields),
    checkUidSyntax(fields, amountClass),
    checkIbanSyntax(fields, tenantIbans, direction),
    checkReverseCharge(fields, amountClass, direction),
    checkForeignVat(fields, direction),
    checkPlzUidConsistency(fields, amountClass),
    checkCurrencyInfo(fields, estimatedEurGross, exchangeRate, exchangeRateDate),
    checkHospitality(fields, input.hospitalityGuests, input.hospitalityReason, input.isHospitality),
    checkLegalForm(fields, amountClass),
    checkCreditNote(fields, documentType),
  ];

  // Async checks
  const duplicateCheck = await checkDuplicate(tenantId, invoiceId, fields);
  checks.push(duplicateCheck);

  const selfCheck = await checkIssuerIsNotSelf(tenantId, fields, tenantInfo, direction);
  checks.push(selfCheck);

  // VIES UID validation (live EU API call)
  const { check: viesCheck, viesInfo } = await checkUidVies(fields, amountClass);
  checks.push(viesCheck);

  // Ampel: 1x RED → RED, only YELLOW → YELLOW, all GREEN → GREEN
  let overallStatus: TrafficLightStatus = 'GREEN';
  for (const check of checks) {
    if (check.status === 'RED') {
      overallStatus = 'RED';
      break;
    }
    if (check.status === 'YELLOW') {
      overallStatus = 'YELLOW';
    }
  }

  return { overallStatus, amountClass, checks, viesInfo };
}

// Exported for unit testing — NOT part of the public API
export const _testing = {
  toNum,
  determineAmountClass,
  isRequiredFor,
  resolveCountryName,
  detectCountryFromPlz,
  detectVendorLocation,
  checkIssuerName,
  checkIssuerAddress,
  checkIssuerUid,
  checkRecipientName,
  checkRecipientUid,
  checkInvoiceNumber,
  checkInvoiceDate,
  checkDeliveryDate,
  checkDescription,
  checkNetAmount,
  checkVatRate,
  checkVatAmount,
  checkGrossAmount,
  checkMath,
  checkVatRateValid,
  checkUidSyntax,
  validateIbanCheckDigit,
  checkIbanSyntax,
  checkReverseCharge,
  checkForeignVat,
  checkPlzUidConsistency,
  checkIssuerIsNotSelf,
  checkDuplicate,
  checkUidVies,
  checkCurrencyInfo,
  checkHospitality,
  checkLegalForm,
  checkCreditNote,
  EU_UID_PREFIXES,
};
