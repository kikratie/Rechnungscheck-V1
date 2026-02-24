import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FilePlus2, X, Loader2, CheckCircle } from 'lucide-react';
import { createErsatzbelegApi, createEigenbelegApi } from '../api/invoices';

// ============================================================
// Unified Beleg Dialog — Eigenbeleg (§132 BAO) + Ersatzbeleg
// ============================================================

const EIGENBELEG_REASONS = [
  'Automat / Parkautomat',
  'Beleg verloren',
  'Barauslage ohne Beleg',
  'Trinkgeld',
  'Online-Abo ohne Rechnung',
  'Sonstiges',
] as const;

const VAT_RATES = ['20', '13', '10', '0'] as const;

interface EigenbelegContext {
  mode: 'eigenbeleg';
  transactionId: string;
  transactionName?: string | null;
  transactionAmount?: string;
  transactionDate?: string;
}

interface ErsatzbelegContext {
  mode: 'ersatzbeleg';
  originalInvoiceId: string;
  originalBelegNr: number;
  originalVendorName?: string | null;
}

type BelegContext = EigenbelegContext | ErsatzbelegContext;

interface BelegFormDialogProps {
  context: BelegContext;
  onClose: () => void;
  onSuccess: (newInvoiceId?: string) => void;
}

export function BelegFormDialog({ context, onClose, onSuccess }: BelegFormDialogProps) {
  const isEigenbeleg = context.mode === 'eigenbeleg';
  const title = isEigenbeleg ? 'Eigenbeleg erstellen' : 'Ersatzbeleg erstellen';

  // Pre-fill defaults from context
  const defaultName = isEigenbeleg
    ? (context.transactionName || '')
    : ((context as ErsatzbelegContext).originalVendorName || '');

  const defaultDate = isEigenbeleg && context.transactionDate
    ? context.transactionDate.split('T')[0]
    : new Date().toISOString().slice(0, 10);

  const defaultAmount = isEigenbeleg && context.transactionAmount
    ? Math.abs(parseFloat(context.transactionAmount)).toFixed(2)
    : '';

  // Form state
  const [issuerName, setIssuerName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(defaultDate);
  const [grossAmount, setGrossAmount] = useState(defaultAmount);
  const [vatRate, setVatRate] = useState('20');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issuerUid, setIssuerUid] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [category, setCategory] = useState('');

  // Auto-calculated
  const grossNum = parseFloat(grossAmount) || 0;
  const rateNum = parseFloat(vatRate) || 0;
  const netAmount = grossNum > 0 ? Math.round((grossNum / (1 + rateNum / 100)) * 100) / 100 : 0;
  const vatAmount = grossNum > 0 ? Math.round((grossNum - netAmount) * 100) / 100 : 0;

  const effectiveReason = isEigenbeleg
    ? (reason === 'Sonstiges' ? customReason : reason)
    : reason;

  const isValid = issuerName.trim() && description.trim() && invoiceDate && grossNum > 0 && effectiveReason.trim();

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEigenbeleg) {
        return createEigenbelegApi({
          issuerName: issuerName.trim(),
          description: description.trim(),
          invoiceDate: new Date(invoiceDate).toISOString(),
          grossAmount: grossNum,
          vatRate: rateNum,
          reason: effectiveReason.trim(),
          direction: 'INCOMING',
          accountNumber: accountNumber || null,
          category: category || null,
          transactionId: context.transactionId,
        });
      } else {
        const ctx = context as ErsatzbelegContext;
        return createErsatzbelegApi(ctx.originalInvoiceId, {
          reason: effectiveReason.trim(),
          issuerName: issuerName.trim(),
          description: description.trim(),
          invoiceDate: new Date(invoiceDate).toISOString(),
          grossAmount: grossNum,
          netAmount: netAmount || null,
          vatAmount: vatAmount || null,
          vatRate: rateNum,
          invoiceNumber: invoiceNumber || null,
          issuerUid: issuerUid || null,
          accountNumber: accountNumber || null,
          category: category || null,
        });
      }
    },
    onSuccess: (resp) => {
      const id = (resp?.data as unknown as { id: string })?.id;
      onSuccess(id);
    },
  });

  const belegLabel = !isEigenbeleg
    ? `BEL-${String((context as ErsatzbelegContext).originalBelegNr).padStart(3, '0')}`
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FilePlus2 size={18} className="text-orange-600" />
            {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Context banner */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-700">
          {isEigenbeleg ? (
            <>
              <p className="font-medium">§132 BAO — Eigenbeleg für fehlende Rechnung</p>
              <p className="text-xs mt-1">
                Transaktion: {context.transactionName || 'Unbekannt'} — {context.transactionAmount ? fmtCur(context.transactionAmount) : '?'} — {context.transactionDate ? fmtDate(context.transactionDate) : '?'}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Ersatzbeleg für {belegLabel}</p>
              <p className="text-xs mt-1">
                Der Originalbeleg wird als "Ersetzt" markiert. Daten manuell eingeben — z.B. aus dem Kontoauszug.
              </p>
            </>
          )}
        </div>

        <div className="space-y-3">
          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {isEigenbeleg ? 'Grund für fehlenden Beleg *' : 'Grund *'}
            </label>
            {isEigenbeleg ? (
              <>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="">— Grund wählen —</option>
                  {EIGENBELEG_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {reason === 'Sonstiges' && (
                  <input
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="input-field text-sm mt-2"
                    placeholder="Grund beschreiben..."
                  />
                )}
              </>
            ) : (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z.B. Original-Rechnung unleserlich / Beleg nicht auffindbar"
                className="input-field min-h-[60px] text-sm"
              />
            )}
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Rechnungsdaten (soweit bekannt)</p>
          </div>

          {/* Issuer name */}
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Geschäftspartner / Lieferant *</label>
            <input
              value={issuerName}
              onChange={(e) => setIssuerName(e.target.value)}
              className="input-field text-sm"
              placeholder="z.B. Parkgarage Innsbruck"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Beschreibung / Leistung *</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field text-sm"
              placeholder="z.B. Parkgebühr, Telekommunikation, Büromaterial"
            />
          </div>

          {/* Date + Invoice number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Datum *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Rechnungsnr.</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Betrag brutto (EUR) *</label>
            <input
              type="number"
              step="0.01"
              value={grossAmount}
              onChange={(e) => setGrossAmount(e.target.value)}
              className="input-field text-sm"
            />
          </div>

          {/* VAT rate buttons */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">USt-Satz</label>
            <div className="flex gap-2">
              {VAT_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setVatRate(rate)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    vatRate === rate
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {rate}%
                </button>
              ))}
            </div>
            {grossNum > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Netto: {fmtCur(String(netAmount))} / USt: {fmtCur(String(vatAmount))}
              </p>
            )}
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">UID-Nummer</label>
              <input
                value={issuerUid}
                onChange={(e) => setIssuerUid(e.target.value)}
                placeholder="ATU..."
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Konto</label>
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Kategorie</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="z.B. Telekommunikation"
              className="input-field text-sm"
            />
          </div>

          {/* Error */}
          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
                || (mutation.error as Error).message
                || 'Fehler beim Erstellen'}
            </div>
          )}

          {/* Success */}
          {mutation.isSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle size={16} />
              {isEigenbeleg
                ? 'Eigenbeleg erstellt und automatisch zugeordnet!'
                : 'Ersatzbeleg erstellt — Originalbeleg wurde als "Ersetzt" markiert.'}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            {!mutation.isSuccess ? (
              <>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={!isValid || mutation.isPending}
                  className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center disabled:opacity-50 bg-orange-600 hover:bg-orange-700"
                >
                  {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
                  {title}
                </button>
                <button onClick={onClose} className="btn-secondary text-sm flex-1">
                  Abbrechen
                </button>
              </>
            ) : (
              <button onClick={onClose} className="btn-primary w-full text-sm">
                Schließen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Local helpers
function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCur(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}
