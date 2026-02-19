/**
 * EU VIES (VAT Information Exchange System) UID-Validation
 * Free REST API — no API key needed
 * https://ec.europa.eu/taxation_customs/vies/
 */

interface ViesResult {
  valid: boolean;
  countryCode: string;
  vatNumber: string;
  name: string | null;
  address: string | null;
  requestDate: string;
  error?: string;
}

export async function validateUid(uid: string): Promise<ViesResult> {
  // Extract country code and number
  const countryCode = uid.substring(0, 2).toUpperCase();
  const vatNumber = uid.substring(2).replace(/\s/g, '');

  try {
    const response = await fetch(
      'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode, vatNumber }),
        signal: AbortSignal.timeout(10_000), // 10s timeout
      },
    );

    if (!response.ok) {
      return {
        valid: false,
        countryCode,
        vatNumber,
        name: null,
        address: null,
        requestDate: new Date().toISOString(),
        error: `VIES API HTTP ${response.status}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;

    return {
      valid: data.valid === true,
      countryCode: (data.countryCode as string) || countryCode,
      vatNumber: (data.vatNumber as string) || vatNumber,
      name: data.name && data.name !== '---' ? String(data.name).trim() : null,
      address: data.address && data.address !== '---' ? String(data.address).trim() : null,
      requestDate: (data.requestDate as string) || new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      valid: false,
      countryCode,
      vatNumber,
      name: null,
      address: null,
      requestDate: new Date().toISOString(),
      error: message.includes('abort') ? 'VIES Timeout (Service nicht erreichbar)' : `VIES Fehler: ${message}`,
    };
  }
}

/**
 * Compare issuer name from invoice with VIES registered name (fuzzy)
 */
export function compareCompanyNames(invoiceName: string, viesName: string): { match: boolean; similarity: number } {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/gmbh|kg|og|e\.u\.|ag|co\.kg|ges\.m\.b\.h\.|gesellschaft|m\.b\.h\./gi, '')
      .replace(/[^a-zäöüß0-9]/g, '')
      .trim();

  const a = normalize(invoiceName);
  const b = normalize(viesName);

  if (!a || !b) return { match: false, similarity: 0 };

  // Exact match after normalization
  if (a === b) return { match: true, similarity: 1.0 };

  // One contains the other
  if (a.includes(b) || b.includes(a)) return { match: true, similarity: 0.85 };

  // Simple character overlap (Jaccard-like)
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = [...setA].filter((c) => setB.has(c)).length;
  const union = new Set([...setA, ...setB]).size;
  const similarity = intersection / union;

  return { match: similarity > 0.6, similarity };
}
