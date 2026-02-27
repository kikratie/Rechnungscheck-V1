import { Loader2, CheckCircle, AlertTriangle, XCircle, ArrowRight, Trash2 } from 'lucide-react';
import type { InvoiceDetailExtended, ValidationCheck } from '@buchungsai/shared';
import { ValidatedField } from './ValidatedField';

interface InboxTriagePanelProps {
  detail: InvoiceDetailExtended | null;
  detailLoading: boolean;
  onTriage: () => void;
  onDelete: () => void;
  triaging: boolean;
  deleting: boolean;
}

const TRIAGEABLE_STATUSES = ['PROCESSED', 'REVIEW_REQUIRED', 'ERROR', 'PENDING_CORRECTION'];

export function InboxTriagePanel({
  detail,
  detailLoading,
  onTriage,
  onDelete,
  triaging,
  deleting,
}: InboxTriagePanelProps) {
  if (detailLoading || !detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary-600 mx-auto mb-2" size={32} />
          <p className="text-sm text-gray-500">Beleg wird geladen…</p>
        </div>
      </div>
    );
  }

  const isTriageable = TRIAGEABLE_STATUSES.includes(detail.processingStatus);
  const isProcessing = detail.processingStatus === 'UPLOADED' || detail.processingStatus === 'PROCESSING';

  const checks: ValidationCheck[] = detail.validationResult?.checks ?? [];
  const issues = checks.filter(c => c.status === 'RED' || c.status === 'YELLOW');

  // Validation traffic light
  const validationBadge = () => {
    switch (detail.validationStatus) {
      case 'VALID':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700"><CheckCircle size={12} /> Gültig</span>;
      case 'WARNING':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-yellow-100 text-yellow-700"><AlertTriangle size={12} /> Warnung</span>;
      case 'INVALID':
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700"><XCircle size={12} /> Ungültig</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">Ausstehend</span>;
    }
  };

  // Format address
  const formatAddress = (addr: Record<string, string> | null | undefined): string | null => {
    if (!addr || typeof addr !== 'object') return null;
    return [
      addr.street,
      `${addr.zip ?? ''} ${addr.city ?? ''}`.trim(),
      addr.country,
    ].filter(Boolean).join(', ');
  };

  const formatCurrency = (amount: string | null) => {
    if (!amount) return '—';
    return parseFloat(amount).toLocaleString('de-AT', {
      style: 'currency',
      currency: detail.currency || 'EUR',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Header badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
            BEL-{detail.belegNr}
          </span>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            detail.direction === 'OUTGOING' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {detail.direction === 'OUTGOING' ? 'Ausgangsrechnung' : 'Eingangsrechnung'}
          </span>
          {validationBadge()}
        </div>

        {/* Processing indicator */}
        {isProcessing && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
            <Loader2 size={16} className="text-yellow-600 animate-spin" />
            <span className="text-sm text-yellow-700">Wird noch verarbeitet — Daten erscheinen automatisch…</span>
          </div>
        )}

        {/* Vendor/Issuer Info */}
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {detail.direction === 'OUTGOING' ? 'Kunde' : 'Lieferant'}
          </h3>
          <dl>
            <ValidatedField
              label="Name"
              value={detail.direction === 'OUTGOING' ? detail.customerName : detail.vendorName}
              fieldName="issuerName"
              checks={checks}
            />
            {detail.extractedData?.issuerUid && (
              <ValidatedField
                label="UID"
                value={detail.extractedData.issuerUid}
                fieldName="issuerUid"
                checks={checks}
              />
            )}
            {detail.extractedData?.issuerAddress && (
              <ValidatedField
                label="Adresse"
                value={formatAddress(detail.extractedData.issuerAddress)}
                fieldName="issuerAddress"
                checks={checks}
              />
            )}
          </dl>
        </div>

        {/* Invoice basics */}
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Rechnungsdaten</h3>
          <dl>
            <ValidatedField
              label="Rechnungsnr."
              value={detail.invoiceNumber}
              fieldName="invoiceNumber"
              checks={checks}
            />
            <ValidatedField
              label="Datum"
              value={detail.invoiceDate ? new Date(detail.invoiceDate).toLocaleDateString('de-AT') : null}
              fieldName="invoiceDate"
              checks={checks}
            />
            {detail.deliveryDate && (
              <ValidatedField
                label="Lieferdatum"
                value={new Date(detail.deliveryDate).toLocaleDateString('de-AT')}
                fieldName="deliveryDate"
                checks={checks}
              />
            )}
          </dl>
        </div>

        {/* Amounts */}
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Beträge</h3>
          <dl>
            <ValidatedField
              label="Netto"
              value={formatCurrency(detail.netAmount)}
              fieldName="netAmount"
              checks={checks}
            />
            <ValidatedField
              label="MwSt."
              value={detail.vatRate ? `${parseFloat(detail.vatRate)}%` : null}
              fieldName="vatRate"
              checks={checks}
            />
            <ValidatedField
              label="MwSt.-Betrag"
              value={formatCurrency(detail.vatAmount)}
              fieldName="vatAmount"
              checks={checks}
            />
            <ValidatedField
              label="Brutto"
              value={formatCurrency(detail.grossAmount)}
              fieldName="grossAmount"
              checks={checks}
            />
          </dl>
        </div>

        {/* Issues summary */}
        {issues.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Probleme ({issues.length})
            </h3>
            <div className="space-y-1">
              {issues.slice(0, 5).map((issue, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded ${
                  issue.status === 'RED' ? 'bg-red-50' : 'bg-yellow-50'
                }`}>
                  {issue.status === 'RED'
                    ? <XCircle size={12} className="text-red-600 shrink-0 mt-0.5" />
                    : <AlertTriangle size={12} className="text-yellow-600 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-700">{issue.message}</span>
                    {issue.legalBasis && (
                      <span className="text-gray-400 ml-1">({issue.legalBasis})</span>
                    )}
                  </div>
                </div>
              ))}
              {issues.length > 5 && (
                <p className="text-xs text-gray-400">+ {issues.length - 5} weitere</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky action buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 pt-4 pb-2 mt-4 space-y-2 shrink-0">
        {isProcessing ? (
          <p className="text-sm text-center text-gray-500 py-2">
            Bitte warten, bis die Verarbeitung abgeschlossen ist…
          </p>
        ) : (
          <button
            onClick={onTriage}
            disabled={triaging || !isTriageable}
            className="btn-primary w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {triaging ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {triaging ? 'Wird weitergeleitet…' : 'Zur Prüfung senden'}
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={deleting}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          {deleting ? 'Wird gelöscht…' : 'Kein Beleg / Löschen'}
        </button>
      </div>
    </div>
  );
}
