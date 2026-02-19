import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMatchingsApi } from '../api/matchings';
import type { MatchingItem } from '@buchungsai/shared';
import { ArrowLeftRight, Loader2, CheckCircle, Clock, FileText, Building2 } from 'lucide-react';

export function MatchingPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['matchings', statusFilter],
    queryFn: () => listMatchingsApi({ status: statusFilter || undefined }),
  });

  const matchings = (data?.data ?? []) as MatchingItem[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Abgleich</h1>
          <p className="text-gray-500 mt-1">Rechnungen mit Banktransaktionen abgleichen</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field !w-auto !py-2 text-sm"
        >
          <option value="">Alle</option>
          <option value="SUGGESTED">Vorgeschlagen</option>
          <option value="CONFIRMED">Bestätigt</option>
          <option value="REJECTED">Abgelehnt</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : matchings.length === 0 ? (
        <div className="card p-12 text-center">
          <ArrowLeftRight className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Matchings gefunden</h3>
          <p className="text-gray-500">Lade Rechnungen und Kontoauszüge hoch, um den Abgleich zu starten.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matchings.map((m) => {
            const invoice = m.invoice;
            const transaction = m.transaction;
            const confidence = m.confidence ? (parseFloat(m.confidence) * 100).toFixed(0) : null;

            return (
              <div key={m.id} className="card overflow-hidden">
                <div className="flex items-center gap-1 p-1">
                  {/* Invoice side */}
                  <div className="flex-1 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={16} className="text-blue-600" />
                      <span className="text-xs font-medium text-blue-600 uppercase">Rechnung</span>
                    </div>
                    <p className="font-medium text-gray-900 truncate">{invoice.vendorName || invoice.originalFileName}</p>
                    <p className="text-sm text-gray-500">{invoice.invoiceNumber || '—'}</p>
                    <p className="text-lg font-bold mt-1">
                      {invoice.grossAmount ? formatCurrency(String(invoice.grossAmount)) : '—'}
                    </p>
                    {invoice.invoiceDate ? (
                      <p className="text-xs text-gray-400 mt-1">{formatDate(invoice.invoiceDate)}</p>
                    ) : null}
                  </div>

                  {/* Match indicator */}
                  <div className="flex flex-col items-center px-4 py-2 shrink-0">
                    <MatchStatusIcon status={m.status} />
                    <ArrowLeftRight size={20} className="text-gray-300 my-1" />
                    <MatchTypeBadge type={m.matchType} />
                    {confidence && (
                      <span className="text-xs text-gray-400 mt-1">{confidence}%</span>
                    )}
                  </div>

                  {/* Transaction side */}
                  <div className="flex-1 p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 size={16} className="text-green-600" />
                      <span className="text-xs font-medium text-green-600 uppercase">Transaktion</span>
                    </div>
                    <p className="font-medium text-gray-900 truncate">{transaction.counterpartName || '—'}</p>
                    <p className="text-sm text-gray-500 truncate">{transaction.reference || '—'}</p>
                    <p className="text-lg font-bold mt-1">
                      {formatCurrency(String(transaction.amount))}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(transaction.transactionDate)}</p>
                  </div>
                </div>

                {/* Reason */}
                {m.matchReason ? (
                  <div className="px-5 py-2 bg-gray-50 border-t text-xs text-gray-500">
                    {m.matchReason}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'CONFIRMED':
      return <CheckCircle size={24} className="text-green-500" />;
    case 'REJECTED':
      return <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-500 text-xs font-bold">X</div>;
    default:
      return <Clock size={24} className="text-yellow-500" />;
  }
}

function MatchTypeBadge({ type }: { type: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    AUTO: { label: 'Auto', color: 'bg-blue-100 text-blue-700' },
    AI_SUGGESTED: { label: 'KI', color: 'bg-purple-100 text-purple-700' },
    MANUAL: { label: 'Manuell', color: 'bg-gray-100 text-gray-700' },
  };
  const c = labels[type] || labels.MANUAL;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.color}`}>{c.label}</span>;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}
