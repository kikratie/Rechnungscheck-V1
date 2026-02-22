import OpenAI from 'openai';
import { env } from '../config/env.js';

interface LlmRequest {
  task: string;
  systemPrompt: string;
  userContent: string | OpenAI.Chat.Completions.ChatCompletionContentPart[];
  temperature?: number;
  maxTokens?: number;
}

interface LlmResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY ist nicht konfiguriert');
    }
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export async function callLlm(request: LlmRequest): Promise<LlmResponse> {
  const client = getClient();
  const model = env.OPENAI_MODEL;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: request.systemPrompt },
    {
      role: 'user',
      content: request.userContent,
    },
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: request.temperature ?? 0.1,
    max_tokens: request.maxTokens ?? 4096,
    response_format: { type: 'json_object' },
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error('Keine Antwort vom LLM erhalten');
  }

  return {
    content: choice.message.content,
    model: response.model,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `Du bist ein Spezialist für die Extraktion von Rechnungsdaten aus österreichischen Belegen.

WICHTIG — Aussteller vs. Empfänger korrekt zuordnen:
- Der AUSSTELLER (issuer) ist das Unternehmen, das die Rechnung STELLT (= der Lieferant/Dienstleister).
  Er steht typisch im Briefkopf (Logo oben), im Impressum oder in der FUSSZEILE (Bankverbindung, UID, Firmenbuch).
- Der EMPFÄNGER (recipient) ist das Unternehmen, das die Rechnung ERHÄLT (= der Kunde).
  Er steht typisch im Adressfeld ("Rechnung an", "Bill to", "Kunde", "Rechnungsadresse").
- ACHTUNG: Wenn ein großes Unternehmen (z.B. A1, Telekom, Energie, Versicherung) und ein kleines Unternehmen
  auf der Rechnung stehen, ist das große Unternehmen fast immer der AUSSTELLER.
- Die UID in der Fußzeile/im Impressum gehört zum AUSSTELLER, nicht zum Empfänger.
- Die IBAN/Bankverbindung gehört zum AUSSTELLER (dort soll bezahlt werden).

Extrahiere die folgenden Felder:

AUSSTELLER (wer stellt die Rechnung):
- issuerName: Name/Firma des Rechnungsausstellers
- issuerUid: UID-Nummer des Ausstellers (oft in Fußzeile/Impressum, Format ATU + 8 Ziffern für AT)
- issuerAddress: { street, zip, city, country } des Ausstellers
- issuerEmail: E-Mail des Ausstellers (falls vorhanden)
- issuerIban: IBAN des Ausstellers (= Zahlungsempfänger, oft in Fußzeile oder Zahlungsinformation)
  IBAN GENAU transkribieren! Jede einzelne Ziffer zählt. Lies die IBAN Zeichen für Zeichen ab.
  Typisches Format: AT## #### #### #### #### (AT + 2 Prüfziffern + 16 Ziffern). Gib die IBAN OHNE Leerzeichen zurück.

EMPFÄNGER (wer erhält die Rechnung):
- recipientName: Name/Firma des Empfängers (Adressfeld)
- recipientUid: UID-Nummer des Empfängers (falls im Adressfeld angegeben)
- recipientAddress: { street, zip, city, country } des Empfängers

RECHNUNGSDATEN:
- invoiceNumber: Rechnungsnummer
- sequentialNumber: Fortlaufende Nummer (falls anders als Rechnungsnummer)
- invoiceDate: Ausstellungsdatum (ISO 8601)
- deliveryDate: Liefer-/Leistungsdatum oder Leistungszeitraum (ISO 8601, falls vorhanden)
- dueDate: Fälligkeitsdatum (ISO 8601, falls vorhanden)
- description: Kurze Leistungsbeschreibung

BETRÄGE (WICHTIG — immer als JSON-Number, NIEMALS als String!):
- netAmount: Gesamter Nettobetrag als JSON-Number (z.B. 1234.56, NICHT "1234.56")
- vatAmount: Gesamter USt-Betrag als JSON-Number (z.B. 246.91, NICHT "246.91")
- grossAmount: Bruttobetrag als JSON-Number (z.B. 1481.47, NICHT "1481.47")
- vatRate: Steuersatz als JSON-Number (z.B. 20). NUR setzen wenn die gesamte Rechnung EINEN einzigen USt-Satz hat. Auf null setzen bei gemischten Sätzen.
- vatBreakdown: NUR bei MEHREREN USt-Sätzen auf einer Rechnung (z.B. Gastronomie: 10% Speisen + 20% Getränke).
  Array von Objekten: [{"rate": 10, "netAmount": 45.00, "vatAmount": 4.50}, {"rate": 20, "netAmount": 20.00, "vatAmount": 4.00}]
  Jeder Eintrag enthält: rate (Steuersatz), netAmount (Netto dieses Satzes), vatAmount (USt dieses Satzes).
  Die Summe aller netAmount + vatAmount muss den grossAmount ergeben.
  Bei NUR einem USt-Satz: vatBreakdown WEGLASSEN und stattdessen vatRate als Einzelwert setzen.
- currency: Währung (ISO 4217, Default EUR)
Dezimaltrennzeichen ist PUNKT (1234.56), nicht Komma. Alle Beträge als reine Zahlen ohne Währungszeichen.

SONSTIGES:
- isReverseCharge: true wenn Reverse Charge Vermerk
- accountNumber: Sachkonto/Aufwandskonto (falls angegeben)
- category: Kategorie der Leistung (z.B. "Telekommunikation", "Büromaterial", "Miete")
- lineItems: Array von { position, description, quantity, unit, unitPrice, netAmount, vatRate, vatAmount, grossAmount }

Für jedes Feld, gib zusätzlich einen Konfidenzwert (0.0-1.0) im Objekt "confidence" an.
Felder die nicht erkennbar sind, setze auf null mit Konfidenz 0.0.

Antworte ausschließlich als JSON-Objekt in folgendem Format:
{
  "fields": { ...extrahierte Felder... },
  "confidence": { ...Konfidenzwerte pro Feld... },
  "notes": "optionale Anmerkungen zur Zuordnung"
}`;
