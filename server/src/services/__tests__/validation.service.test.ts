/**
 * Unit-Tests für validation.service.ts
 *
 * Testet die Validierungslogik für österreichische Eingangsrechnungen (§11 UStG).
 * Alle Tests sind pure-function Tests (kein Netzwerk, keine DB) außer
 * checkUidVies/checkDuplicate/checkIssuerIsNotSelf die gemockt werden.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma BEFORE importing module under test
vi.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    invoice: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

// Mock VIES service
vi.mock('../vies.service.js', () => ({
  validateUid: vi.fn().mockResolvedValue({ valid: true, name: 'Test GmbH', address: null, countryCode: 'AT', vatNumber: '12345678', requestDate: '2026-01-01' }),
  compareCompanyNames: vi.fn().mockReturnValue({ match: true, similarity: 1.0 }),
}));

import { validateInvoice, _testing } from '../validation.service.js';

const {
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
  checkUidVies,
  EU_UID_PREFIXES,
} = _testing;

// ---------------------------------------------------------------------------
// Helper: ExtractedFields factory
// ---------------------------------------------------------------------------
interface TestFields {
  issuerName?: string | null;
  issuerUid?: string | null;
  issuerAddress?: Record<string, string> | null;
  recipientName?: string | null;
  recipientUid?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  description?: string | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  grossAmount?: number | null;
  vatRate?: number | null;
  vatBreakdown?: Array<{ rate: number; netAmount: number; vatAmount: number }> | null;
  isReverseCharge?: boolean;
  issuerIban?: string | null;
  issuerEmail?: string | null;
}

function makeFields(overrides: TestFields = {}) {
  return {
    issuerName: 'Test GmbH',
    issuerUid: 'ATU12345678',
    issuerAddress: { street: 'Testgasse 1', zip: '1010', city: 'Wien', country: 'Österreich' },
    recipientName: 'Empfänger GmbH',
    recipientUid: 'ATU87654321',
    invoiceNumber: 'RE-2026-001',
    invoiceDate: '2026-01-15T00:00:00.000Z',
    deliveryDate: '2026-01-10T00:00:00.000Z',
    description: 'Beratungsleistung Jänner 2026',
    netAmount: 1000,
    vatAmount: 200,
    grossAmount: 1200,
    vatRate: 20,
    vatBreakdown: null,
    isReverseCharge: false,
    issuerIban: 'AT611904300234573201',
    issuerEmail: 'test@example.at',
    ...overrides,
  };
}

// ============================================================
// A. determineAmountClass — Betragsklassen §11 UStG
// ============================================================
describe('determineAmountClass — Betragsklassen', () => {
  it('0€ → SMALL', () => {
    expect(determineAmountClass(0)).toBe('SMALL');
  });

  it('399.99€ → SMALL', () => {
    expect(determineAmountClass(399.99)).toBe('SMALL');
  });

  it('exakt 400€ → SMALL (<=)', () => {
    expect(determineAmountClass(400)).toBe('SMALL');
  });

  it('400.01€ → STANDARD', () => {
    expect(determineAmountClass(400.01)).toBe('STANDARD');
  });

  it('5000€ → STANDARD', () => {
    expect(determineAmountClass(5000)).toBe('STANDARD');
  });

  it('exakt 10000€ → STANDARD (Grenze ist >)', () => {
    expect(determineAmountClass(10000)).toBe('STANDARD');
  });

  it('10000.01€ → LARGE', () => {
    expect(determineAmountClass(10000.01)).toBe('LARGE');
  });

  it('null → STANDARD (Fallback)', () => {
    expect(determineAmountClass(null)).toBe('STANDARD');
  });
});

// ============================================================
// B. detectVendorLocation — Lieferanten-Standort Erkennung
// ============================================================
describe('detectVendorLocation — Standort-Erkennung', () => {
  describe('Signal 1: UID-Prefix', () => {
    it('ATU-UID → INLAND', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'ATU12345678' }));
      expect(result.region).toBe('INLAND');
      expect(result.country).toBe('AT');
    });

    it('DE-UID → EU', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'DE123456789' }));
      expect(result.region).toBe('EU');
      expect(result.country).toBe('DE');
    });

    it('EU-UID (OSS, z.B. Midjourney) → EU', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'EU372045196' }));
      expect(result.region).toBe('EU');
      expect(result.country).toBe('EU');
    });

    it('EL-UID (Griechenland) → EU', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'EL123456789' }));
      expect(result.region).toBe('EU');
      expect(result.country).toBe('EL');
    });

    it('GR-UID (Griechenland ISO) → EU', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'GR123456789' }));
      expect(result.region).toBe('EU');
      expect(result.country).toBe('GR');
    });

    it('XI-UID (Nordirland, NI Protocol) → EU', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'XI123456789012' }));
      expect(result.region).toBe('EU');
      expect(result.country).toBe('XI');
    });

    it('GB-UID → DRITTLAND (post-Brexit)', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'GB123456789' }));
      expect(result.region).toBe('DRITTLAND');
    });

    it('CH-UID → DRITTLAND', () => {
      const result = detectVendorLocation(makeFields({ issuerUid: 'CHE123456789' }));
      expect(result.region).toBe('DRITTLAND');
    });

    // Alle EU-Länderprefixe parametrisiert
    it.each([
      ['AT', 'INLAND'], ['BE', 'EU'], ['BG', 'EU'], ['CY', 'EU'],
      ['CZ', 'EU'], ['DE', 'EU'], ['DK', 'EU'], ['EE', 'EU'],
      ['EL', 'EU'], ['ES', 'EU'], ['EU', 'EU'], ['FI', 'EU'],
      ['FR', 'EU'], ['GR', 'EU'], ['HR', 'EU'], ['HU', 'EU'],
      ['IE', 'EU'], ['IT', 'EU'], ['LT', 'EU'], ['LU', 'EU'],
      ['LV', 'EU'], ['MT', 'EU'], ['NL', 'EU'], ['PL', 'EU'],
      ['PT', 'EU'], ['RO', 'EU'], ['SE', 'EU'], ['SI', 'EU'],
      ['SK', 'EU'], ['XI', 'EU'],
    ] as const)('UID-Prefix %s → %s', (prefix, expectedRegion) => {
      const uid = prefix === 'AT' ? `${prefix}U12345678` : `${prefix}123456789`;
      const result = detectVendorLocation(makeFields({ issuerUid: uid }));
      expect(result.region).toBe(expectedRegion);
    });
  });

  describe('Signal 2: Adress-Land (ohne UID)', () => {
    it('country "Österreich" → INLAND', () => {
      const result = detectVendorLocation(makeFields({
        issuerUid: null,
        issuerAddress: { country: 'Österreich', zip: '1010', city: 'Wien' },
      }));
      expect(result.region).toBe('INLAND');
    });

    it('country "Germany" → EU', () => {
      const result = detectVendorLocation(makeFields({
        issuerUid: null,
        issuerAddress: { country: 'Germany', zip: '80331', city: 'München' },
      }));
      expect(result.region).toBe('EU');
    });

    it('country "Greece" → EU', () => {
      const result = detectVendorLocation(makeFields({
        issuerUid: null,
        issuerAddress: { country: 'Greece', zip: '10431', city: 'Athen' },
      }));
      expect(result.region).toBe('EU');
    });

    it('country "United States" → DRITTLAND', () => {
      const result = detectVendorLocation(makeFields({
        issuerUid: null,
        issuerAddress: { country: 'United States', zip: '94080', city: 'San Francisco' },
      }));
      expect(result.region).toBe('DRITTLAND');
    });
  });

  describe('Signal 3: PLZ-Muster (ohne UID, ohne Land)', () => {
    it('PLZ 1010 → INLAND', () => {
      const result = detectVendorLocation(makeFields({
        issuerUid: null,
        issuerAddress: { zip: '1010', city: 'Wien' },
      }));
      expect(result.region).toBe('INLAND');
    });

    it('PLZ A-1020 → INLAND', () => {
      const result = detectVendorLocation(makeFields({
        issuerUid: null,
        issuerAddress: { zip: 'A-1020', city: 'Wien' },
      }));
      expect(result.region).toBe('INLAND');
    });

    it('keine Daten → UNKNOWN', () => {
      const result = detectVendorLocation(makeFields({
        issuerUid: null,
        issuerAddress: null,
      }));
      expect(result.region).toBe('UNKNOWN');
    });
  });
});

// ============================================================
// C. checkIssuerUid — UID-Pflicht nach Region
// ============================================================
describe('checkIssuerUid — UID-Pflicht', () => {
  it('AT-UID vorhanden → GREEN', () => {
    const result = checkIssuerUid(makeFields(), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('keine UID + Inland + USt verrechnet → RED', () => {
    const result = checkIssuerUid(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'Österreich', zip: '1010', city: 'Wien' },
      vatAmount: 200,
    }), 'STANDARD');
    expect(result.status).toBe('RED');
  });

  it('keine UID + Inland + keine USt → YELLOW (Kleinunternehmer)', () => {
    const result = checkIssuerUid(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'Österreich', zip: '1010', city: 'Wien' },
      vatAmount: 0,
    }), 'STANDARD');
    expect(result.status).toBe('YELLOW');
  });

  it('keine UID + EU-Lieferant → RED (B2B zwingend)', () => {
    const result = checkIssuerUid(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'Germany', zip: '80331', city: 'München' },
    }), 'STANDARD');
    expect(result.status).toBe('RED');
  });

  it('EU-UID erzwingt Prüfung auch bei SMALL amountClass', () => {
    // EU-B2B: UID immer zwingend, auch bei Kleinbetragsrechnungen
    const result = checkIssuerUid(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'Germany' },
    }), 'SMALL');
    expect(result.status).toBe('RED');
  });

  it('keine UID + Drittland → GREEN', () => {
    const result = checkIssuerUid(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'United States' },
    }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('SMALL + nicht-EU → GRAY', () => {
    const result = checkIssuerUid(makeFields({
      issuerUid: 'ATU12345678',
      issuerAddress: { country: 'Österreich' },
    }), 'SMALL');
    expect(result.status).toBe('GRAY');
  });
});

// ============================================================
// D. checkUidSyntax — UID-Format Prüfung
// ============================================================
describe('checkUidSyntax — UID-Format', () => {
  it('ATU12345678 → GREEN', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'ATU12345678' }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('ATU1234567 (zu kurz) → YELLOW', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'ATU1234567' }), 'STANDARD');
    expect(result.status).toBe('YELLOW');
  });

  it('DE123456789 → GREEN', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'DE123456789' }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('EU372045196 (EU OSS) → GREEN', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'EU372045196' }), 'STANDARD');
    expect(result.status).toBe('GREEN');
    expect(result.message).toContain('EU');
  });

  it('EL123456789 (Griechenland) → GREEN', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'EL123456789' }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('XI123456789 (Nordirland 9 Ziffern) → GREEN', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'XI123456789' }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('XI123456789012 (Nordirland 12 Ziffern) → GREEN', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'XI123456789012' }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('keine UID → YELLOW', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: null }), 'STANDARD');
    expect(result.status).toBe('YELLOW');
  });

  it('unbekanntes Prefix "XX123" → YELLOW', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'XX12345678' }), 'STANDARD');
    expect(result.status).toBe('YELLOW');
    expect(result.message).toContain('nicht erkannt');
  });

  it('SMALL + nicht-EU → GRAY', () => {
    const result = checkUidSyntax(makeFields({ issuerUid: 'ATU12345678' }), 'SMALL');
    expect(result.status).toBe('GRAY');
  });

  // Parametrisierte gültige EU-UIDs
  it.each([
    ['BE0123456789', 'BE'],
    ['BG123456789', 'BG'],
    ['CZ12345678', 'CZ'],
    ['DK12345678', 'DK'],
    ['EE123456789', 'EE'],
    ['EL123456789', 'EL'],
    ['ESA1234567B', 'ES'],
    ['EU123456789', 'EU'],
    ['FI12345678', 'FI'],
    ['FRAB123456789', 'FR'],
    ['HR12345678901', 'HR'],
    ['HU12345678', 'HU'],
    ['IE1A23456B', 'IE'],
    ['IT12345678901', 'IT'],
    ['LT123456789', 'LT'],
    ['LU12345678', 'LU'],
    ['LV12345678901', 'LV'],
    ['MT12345678', 'MT'],
    ['NL123456789B01', 'NL'],
    ['PL1234567890', 'PL'],
    ['PT123456789', 'PT'],
    ['RO1234567890', 'RO'],
    ['SE123456789012', 'SE'],
    ['SI12345678', 'SI'],
    ['SK1234567890', 'SK'],
    ['XI123456789', 'XI'],
  ] as const)('gültige UID %s (%s) → GREEN', (uid, _country) => {
    const result = checkUidSyntax(makeFields({ issuerUid: uid }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });
});

// ============================================================
// E. checkMath — Rechnerische Richtigkeit
// ============================================================
describe('checkMath — Rechnung', () => {
  it('1000 + 200 = 1200 (exakt) → GREEN', () => {
    const result = checkMath(makeFields({ netAmount: 1000, vatAmount: 200, grossAmount: 1200 }));
    expect(result.status).toBe('GREEN');
  });

  it('innerhalb Toleranz (0.01€ Differenz) → GREEN', () => {
    const result = checkMath(makeFields({ netAmount: 1000, vatAmount: 200, grossAmount: 1200.01 }));
    expect(result.status).toBe('GREEN');
  });

  it('über Toleranz → RED', () => {
    const result = checkMath(makeFields({ netAmount: 1000, vatAmount: 200, grossAmount: 1210 }));
    expect(result.status).toBe('RED');
  });

  it('13% Steuersatz: 100 + 13 = 113 → GREEN', () => {
    const result = checkMath(makeFields({ netAmount: 100, vatAmount: 13, grossAmount: 113, vatRate: 13 }));
    expect(result.status).toBe('GREEN');
  });

  it('0% Steuersatz: 100 + 0 = 100 → GREEN', () => {
    const result = checkMath(makeFields({ netAmount: 100, vatAmount: 0, grossAmount: 100, vatRate: 0 }));
    expect(result.status).toBe('GREEN');
  });

  it('alle Beträge null → YELLOW', () => {
    const result = checkMath(makeFields({ netAmount: null, vatAmount: null, grossAmount: null }));
    expect(result.status).toBe('YELLOW');
  });

  it('nur gross vorhanden → YELLOW', () => {
    const result = checkMath(makeFields({ netAmount: null, vatAmount: null, grossAmount: 1200, vatRate: null }));
    expect(result.status).toBe('YELLOW');
  });

  it('vatBreakdown korrekt: 20% + 10% → GREEN', () => {
    const result = checkMath(makeFields({
      netAmount: 200,
      vatAmount: 30,
      grossAmount: 230,
      vatRate: null,
      vatBreakdown: [
        { rate: 20, netAmount: 100, vatAmount: 20 },
        { rate: 10, netAmount: 100, vatAmount: 10 },
      ],
    }));
    expect(result.status).toBe('GREEN');
  });
});

// ============================================================
// F. checkVatRateValid — Gültige AT-Steuersätze
// ============================================================
describe('checkVatRateValid — Steuersatz-Prüfung', () => {
  it('20% → GREEN', () => {
    expect(checkVatRateValid(makeFields({ vatRate: 20 })).status).toBe('GREEN');
  });

  it('13% → GREEN', () => {
    expect(checkVatRateValid(makeFields({ vatRate: 13 })).status).toBe('GREEN');
  });

  it('10% → GREEN', () => {
    expect(checkVatRateValid(makeFields({ vatRate: 10 })).status).toBe('GREEN');
  });

  it('0% → GREEN', () => {
    expect(checkVatRateValid(makeFields({ vatRate: 0 })).status).toBe('GREEN');
  });

  it('19% (deutscher Satz) → RED', () => {
    expect(checkVatRateValid(makeFields({ vatRate: 19 })).status).toBe('RED');
  });

  it('7% → RED', () => {
    expect(checkVatRateValid(makeFields({ vatRate: 7 })).status).toBe('RED');
  });

  it('null → YELLOW', () => {
    expect(checkVatRateValid(makeFields({ vatRate: null })).status).toBe('YELLOW');
  });

  it('vatBreakdown mit 20% + 10% → GREEN', () => {
    const result = checkVatRateValid(makeFields({
      vatRate: null,
      vatBreakdown: [
        { rate: 20, netAmount: 100, vatAmount: 20 },
        { rate: 10, netAmount: 100, vatAmount: 10 },
      ],
    }));
    expect(result.status).toBe('GREEN');
  });
});

// ============================================================
// G. IBAN-Validierung
// ============================================================
describe('validateIbanCheckDigit — Mod-97', () => {
  it('gültige AT-IBAN → true', () => {
    expect(validateIbanCheckDigit('AT611904300234573201')).toBe(true);
  });

  it('gültige DE-IBAN → true', () => {
    expect(validateIbanCheckDigit('DE89370400440532013000')).toBe(true);
  });

  it('ungültige Prüfziffer → false', () => {
    expect(validateIbanCheckDigit('AT621904300234573201')).toBe(false);
  });

  it('komplett falsch → false', () => {
    expect(validateIbanCheckDigit('XXXX')).toBe(false);
  });
});

describe('checkIbanSyntax — IBAN-Prüfung', () => {
  it('keine IBAN → YELLOW', () => {
    const result = checkIbanSyntax(makeFields({ issuerIban: null }));
    expect(result.status).toBe('YELLOW');
  });

  it('gültige AT-IBAN → GREEN', () => {
    const result = checkIbanSyntax(makeFields({ issuerIban: 'AT611904300234573201' }));
    expect(result.status).toBe('GREEN');
  });

  it('gültige DE-IBAN → GREEN', () => {
    const result = checkIbanSyntax(makeFields({ issuerIban: 'DE89370400440532013000' }));
    expect(result.status).toBe('GREEN');
  });

  it('falsche Prüfziffer → RED', () => {
    const result = checkIbanSyntax(makeFields({ issuerIban: 'AT621904300234573201' }));
    expect(result.status).toBe('RED');
  });

  it('IBAN = eigene Firmen-IBAN → YELLOW', () => {
    const result = checkIbanSyntax(
      makeFields({ issuerIban: 'AT611904300234573201' }),
      ['AT611904300234573201'],
    );
    expect(result.status).toBe('YELLOW');
    expect(result.message).toContain('eigene');
  });

  it('IBAN ≠ Firmen-IBAN → GREEN', () => {
    const result = checkIbanSyntax(
      makeFields({ issuerIban: 'AT611904300234573201' }),
      ['DE89370400440532013000'],
    );
    expect(result.status).toBe('GREEN');
  });
});

// ============================================================
// H. checkForeignVat — Auslands-USt Prüfung
// ============================================================
describe('checkForeignVat — Auslands-USt', () => {
  it('AT-Lieferant + USt → GREEN', () => {
    const result = checkForeignVat(makeFields());
    expect(result.status).toBe('GREEN');
  });

  it('AT-Lieferant ohne USt → GREEN (Kleinunternehmer)', () => {
    const result = checkForeignVat(makeFields({ vatAmount: 0, vatRate: 0 }));
    expect(result.status).toBe('GREEN');
  });

  it('EU-Lieferant ohne USt → GREEN (Reverse Charge)', () => {
    const result = checkForeignVat(makeFields({
      issuerUid: 'DE123456789',
      vatAmount: 0,
      vatRate: 0,
    }));
    expect(result.status).toBe('GREEN');
  });

  it('EU-Lieferant + USt verrechnet → RED', () => {
    const result = checkForeignVat(makeFields({
      issuerUid: 'DE123456789',
      vatAmount: 200,
      vatRate: 20,
    }));
    expect(result.status).toBe('RED');
    expect(result.message).toContain('Reverse Charge');
  });

  it('EU OSS (EU-Prefix) ohne USt → GREEN', () => {
    const result = checkForeignVat(makeFields({
      issuerUid: 'EU372045196',
      vatAmount: 0,
      vatRate: 0,
    }));
    expect(result.status).toBe('GREEN');
  });

  it('Drittland (US) ohne USt → GREEN', () => {
    const result = checkForeignVat(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'United States' },
      vatAmount: 0,
      vatRate: 0,
    }));
    expect(result.status).toBe('GREEN');
  });

  it('Drittland + USt verrechnet → RED', () => {
    const result = checkForeignVat(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'United States' },
      vatAmount: 200,
      vatRate: 20,
    }));
    expect(result.status).toBe('RED');
  });

  it('GB (post-Brexit) + USt → RED', () => {
    const result = checkForeignVat(makeFields({
      issuerUid: 'GB123456789',
      vatAmount: 200,
      vatRate: 20,
    }));
    expect(result.status).toBe('RED');
  });

  it('UNKNOWN Region + USt + keine UID → YELLOW', () => {
    const result = checkForeignVat(makeFields({
      issuerUid: null,
      issuerAddress: null,
      vatAmount: 200,
      vatRate: 20,
    }));
    expect(result.status).toBe('YELLOW');
  });
});

// ============================================================
// I. checkReverseCharge — RC-Prüfung
// ============================================================
describe('checkReverseCharge — Reverse Charge', () => {
  it('kein RC → GREEN', () => {
    const result = checkReverseCharge(makeFields({ isReverseCharge: false }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('RC + vatAmount = 0 → GREEN', () => {
    const result = checkReverseCharge(makeFields({ isReverseCharge: true, vatAmount: 0 }), 'STANDARD');
    expect(result.status).toBe('GREEN');
  });

  it('RC + vatAmount > 0 → RED', () => {
    const result = checkReverseCharge(makeFields({ isReverseCharge: true, vatAmount: 200 }), 'STANDARD');
    expect(result.status).toBe('RED');
  });

  it('SMALL + nicht-EU → GRAY', () => {
    const result = checkReverseCharge(makeFields(), 'SMALL');
    expect(result.status).toBe('GRAY');
  });

  it('SMALL + EU-Lieferant → wird geprüft', () => {
    const result = checkReverseCharge(makeFields({
      issuerUid: 'DE123456789',
      isReverseCharge: true,
      vatAmount: 0,
    }), 'SMALL');
    expect(result.status).toBe('GREEN');
  });
});

// ============================================================
// J. resolveCountryName — Ländername-Auflösung
// ============================================================
describe('resolveCountryName', () => {
  it('Österreich → AT', () => expect(resolveCountryName('Österreich')).toBe('AT'));
  it('Austria → AT', () => expect(resolveCountryName('Austria')).toBe('AT'));
  it('AT → AT', () => expect(resolveCountryName('AT')).toBe('AT'));
  it('Deutschland → DE', () => expect(resolveCountryName('Deutschland')).toBe('DE'));
  it('Germany → DE', () => expect(resolveCountryName('Germany')).toBe('DE'));
  it('Schweiz → CH', () => expect(resolveCountryName('Schweiz')).toBe('CH'));
  it('USA → US', () => expect(resolveCountryName('USA')).toBe('US'));
  it('United Kingdom → GB', () => expect(resolveCountryName('United Kingdom')).toBe('GB'));

  // Bugfixes: Fehlende Länder
  it('Griechenland → EL', () => expect(resolveCountryName('Griechenland')).toBe('EL'));
  it('Greece → EL', () => expect(resolveCountryName('Greece')).toBe('EL'));
  it('GR → EL', () => expect(resolveCountryName('GR')).toBe('EL'));
  it('Zypern → CY', () => expect(resolveCountryName('Zypern')).toBe('CY'));
  it('Finnland → FI', () => expect(resolveCountryName('Finnland')).toBe('FI'));
  it('Schweden → SE', () => expect(resolveCountryName('Schweden')).toBe('SE'));
  it('Dänemark → DK', () => expect(resolveCountryName('Dänemark')).toBe('DK'));
  it('Norwegen → NO', () => expect(resolveCountryName('Norwegen')).toBe('NO'));
  it('Nordirland → XI', () => expect(resolveCountryName('Nordirland')).toBe('XI'));

  it('case-insensitive', () => expect(resolveCountryName('ÖSTERREICH')).toBe('AT'));
  it('unbekanntes Land → null', () => expect(resolveCountryName('Atlantis')).toBeNull());
});

// ============================================================
// K. checkUidVies — VIES-Prüfung (gemockt)
// ============================================================
describe('checkUidVies — VIES', () => {
  it('EU OSS Prefix "EU" → GREEN (VIES nicht verfügbar)', async () => {
    const { check } = await checkUidVies(makeFields({ issuerUid: 'EU372045196' }), 'STANDARD');
    expect(check.status).toBe('GREEN');
    expect(check.message).toContain('EU OSS');
  });

  it('keine UID + EU-Lieferant → YELLOW', async () => {
    const { check } = await checkUidVies(makeFields({
      issuerUid: null,
      issuerAddress: { country: 'Germany' },
    }), 'STANDARD');
    expect(check.status).toBe('YELLOW');
  });

  it('nicht-EU UID → YELLOW', async () => {
    const { check } = await checkUidVies(makeFields({ issuerUid: 'GB123456789' }), 'STANDARD');
    expect(check.status).toBe('YELLOW');
    expect(check.message).toContain('keine EU-UID');
  });

  it('SMALL + nicht-EU → GRAY', async () => {
    const { check } = await checkUidVies(makeFields({ issuerUid: 'ATU12345678' }), 'SMALL');
    expect(check.status).toBe('GRAY');
  });
});

// ============================================================
// L. Pflichtfeld-Checks (parametrisiert)
// ============================================================
describe('Pflichtfeld-Checks', () => {
  it('issuerName vorhanden → GREEN', () => {
    expect(checkIssuerName(makeFields(), 'STANDARD').status).toBe('GREEN');
  });

  it('issuerName fehlt → RED', () => {
    expect(checkIssuerName(makeFields({ issuerName: null }), 'STANDARD').status).toBe('RED');
  });

  it('invoiceDate vorhanden → GREEN', () => {
    expect(checkInvoiceDate(makeFields(), 'STANDARD').status).toBe('GREEN');
  });

  it('invoiceDate fehlt → RED', () => {
    expect(checkInvoiceDate(makeFields({ invoiceDate: null }), 'STANDARD').status).toBe('RED');
  });

  it('description vorhanden → GREEN', () => {
    expect(checkDescription(makeFields(), 'STANDARD').status).toBe('GREEN');
  });

  it('description fehlt → YELLOW', () => {
    expect(checkDescription(makeFields({ description: null }), 'STANDARD').status).toBe('YELLOW');
  });

  it('grossAmount vorhanden → GREEN', () => {
    expect(checkGrossAmount(makeFields(), 'STANDARD').status).toBe('GREEN');
  });

  it('grossAmount fehlt → RED', () => {
    expect(checkGrossAmount(makeFields({ grossAmount: null }), 'STANDARD').status).toBe('RED');
  });

  it('SMALL → nicht-erforderliche Felder GRAY', () => {
    expect(checkIssuerAddress(makeFields(), 'SMALL').status).toBe('GRAY');
    expect(checkInvoiceNumber(makeFields(), 'SMALL').status).toBe('GRAY');
    expect(checkDeliveryDate(makeFields(), 'SMALL').status).toBe('GRAY');
    expect(checkNetAmount(makeFields(), 'SMALL').status).toBe('GRAY');
    expect(checkVatAmount(makeFields(), 'SMALL').status).toBe('GRAY');
  });

  it('LARGE → Empfänger-UID erforderlich', () => {
    expect(checkRecipientUid(makeFields(), 'LARGE').status).toBe('GREEN');
    expect(checkRecipientUid(makeFields({ recipientUid: null }), 'LARGE').status).toBe('RED');
  });
});

// ============================================================
// M. validateInvoice — Gesamtvalidierung (Integration)
// ============================================================
describe('validateInvoice — Gesamtvalidierung', () => {
  it('vollständige AT-Rechnung → overallStatus GREEN', async () => {
    const result = await validateInvoice({
      extractedFields: makeFields(),
      tenantId: 'test-tenant',
      invoiceId: 'test-invoice',
    });
    expect(result.overallStatus).toBe('GREEN');
    expect(result.amountClass).toBe('STANDARD');
    expect(result.checks.length).toBeGreaterThan(20);
  });

  it('Kleinbetrag (≤400€) → SMALL amountClass', async () => {
    const result = await validateInvoice({
      extractedFields: makeFields({ netAmount: 100, vatAmount: 20, grossAmount: 120 }),
      tenantId: 'test-tenant',
      invoiceId: 'test-invoice',
    });
    expect(result.amountClass).toBe('SMALL');
  });

  it('Großbetrag (>10000€) → LARGE amountClass', async () => {
    const result = await validateInvoice({
      extractedFields: makeFields({ netAmount: 10000, vatAmount: 2000, grossAmount: 12000 }),
      tenantId: 'test-tenant',
      invoiceId: 'test-invoice',
    });
    expect(result.amountClass).toBe('LARGE');
  });

  it('Rechenfehler → mindestens YELLOW/RED', async () => {
    const result = await validateInvoice({
      extractedFields: makeFields({ netAmount: 1000, vatAmount: 200, grossAmount: 9999 }),
      tenantId: 'test-tenant',
      invoiceId: 'test-invoice',
    });
    expect(['YELLOW', 'RED']).toContain(result.overallStatus);
  });

  it('Ampel: 1x RED → overallStatus RED', async () => {
    // EU-Lieferant mit USt verrechnet → RED (Foreign VAT Check)
    const result = await validateInvoice({
      extractedFields: makeFields({
        issuerUid: 'DE123456789',
        issuerAddress: { country: 'Germany' },
        vatAmount: 200,
        vatRate: 20,
      }),
      tenantId: 'test-tenant',
      invoiceId: 'test-invoice',
    });
    expect(result.overallStatus).toBe('RED');
  });
});
