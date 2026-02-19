import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listInvoicesApi, getInvoiceApi } from '../api/invoices';
import type { InvoiceFilters } from '../api/invoices';
import { FileText, Upload, Search, X, ChevronLeft, ChevronRight, Loader2, AlertTriangle, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';

export function InvoicesPage() {
  const [filters, setFilters] = useState<InvoiceFilters>({ page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => listInvoicesApi(filters),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['invoice', selectedId],
    queryFn: () => getInvoiceApi(selectedId!),
    enabled: !!selectedId,
  });

  const invoices = data?.data ?? [];
  const pagination = data?.pagination;
  const detail = detailData?.data;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters((f) => ({ ...f, search: search || undefined, page: 1 }));
  }

  function handleFilterChange(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  }

  return (
    <div className="flex gap-6">
      {/* Main list */}
      <div className={selectedId ? 'flex-1 min-w-0' : 'w-full'}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rechnungen</h1>
            <p className="text-gray-500 mt-1">
              {pagination ? `${pagination.total} Rechnungen` : 'Rechnungen hochladen, prüfen und verwalten'}
            </p>
          </div>
          <button className="btn-primary flex items-center gap-2">
            <Upload size={18} />
            Hochladen
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap gap-3">
            <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Suche nach Lieferant, Rechnungsnr..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pl-9 !py-2 text-sm"
                />
              </div>
              <button type="submit" className="btn-secondary text-sm px-3">Suchen</button>
            </form>

            <select
              value={filters.processingStatus || ''}
              onChange={(e) => handleFilterChange('processingStatus', e.target.value)}
              className="input-field !w-auto !py-2 text-sm"
            >
              <option value="">Alle Status</option>
              <option value="UPLOADED">Hochgeladen</option>
              <option value="PROCESSING">In Verarbeitung</option>
              <option value="PROCESSED">Verarbeitet</option>
              <option value="REVIEW_REQUIRED">Review nötig</option>
              <option value="APPROVED">Genehmigt</option>
              <option value="EXPORTED">Exportiert</option>
              <option value="ERROR">Fehler</option>
            </select>

            <select
              value={filters.validationStatus || ''}
              onChange={(e) => handleFilterChange('validationStatus', e.target.value)}
              className="input-field !w-auto !py-2 text-sm"
            >
              <option value="">Alle Validierung</option>
              <option value="VALID">Gültig</option>
              <option value="WARNING">Warnung</option>
              <option value="INVALID">Ungültig</option>
              <option value="PENDING">Ausstehend</option>
            </select>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={32} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="card p-12 text-center">
            <FileText className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Rechnungen gefunden</h3>
            <p className="text-gray-500">Passe die Filter an oder lade eine neue Rechnung hoch.</p>
          </div>
        ) : (
          <>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Lieferant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rechnungsnr.</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Datum</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Betrag</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Validierung</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv: Record<string, unknown>) => (
                    <tr
                      key={inv.id as string}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedId === inv.id ? 'bg-primary-50' : ''}`}
                      onClick={() => setSelectedId(inv.id as string)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">
                          {(inv.vendorName as string) || (inv.originalFileName as string)}
                        </div>
                        {inv.vendorName && (
                          <div className="text-xs text-gray-400 truncate max-w-[200px]">{inv.originalFileName as string}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{(inv.invoiceNumber as string) || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.invoiceDate ? formatDate(inv.invoiceDate as string) : '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {inv.grossAmount ? formatCurrency(inv.grossAmount as string) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ValidationBadge status={inv.validationStatus as string} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ProcessingBadge status={inv.processingStatus as string} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button className="text-gray-400 hover:text-primary-600">
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-gray-500">
                  Seite {pagination.page} von {pagination.totalPages} ({pagination.total} Einträge)
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary px-3 py-1"
                    disabled={pagination.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="btn-secondary px-3 py-1"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div className="w-[420px] shrink-0">
          <div className="card p-6 sticky top-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Details</h2>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-primary-600" size={24} />
              </div>
            ) : detail ? (
              <div className="space-y-4 text-sm">
                {/* Vendor info */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Lieferant</h3>
                  <dl className="space-y-1">
                    <DetailRow label="Name" value={detail.vendorName} />
                    <DetailRow label="UID" value={detail.vendorUid} />
                    <DetailRow label="Kategorie" value={detail.category} />
                  </dl>
                </div>

                {/* Invoice info */}
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-2">Rechnung</h3>
                  <dl className="space-y-1">
                    <DetailRow label="Nummer" value={detail.invoiceNumber} />
                    <DetailRow label="Datum" value={detail.invoiceDate ? formatDate(detail.invoiceDate) : null} />
                    <DetailRow label="Fällig" value={detail.dueDate ? formatDate(detail.dueDate) : null} />
                    <DetailRow label="Datei" value={detail.originalFileName} />
                  </dl>
                </div>

                {/* Amounts */}
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-2">Beträge</h3>
                  <dl className="space-y-1">
                    <DetailRow label="Netto" value={detail.netAmount ? formatCurrency(detail.netAmount) : null} />
                    <DetailRow label={`USt (${detail.vatRate ?? '?'}%)`} value={detail.vatAmount ? formatCurrency(detail.vatAmount) : null} />
                    <div className="flex justify-between font-semibold pt-1">
                      <dt>Brutto</dt>
                      <dd>{detail.grossAmount ? formatCurrency(detail.grossAmount) : '—'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Status */}
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-2">Status</h3>
                  <div className="flex flex-wrap gap-2">
                    <ValidationBadge status={detail.validationStatus} />
                    <ProcessingBadge status={detail.processingStatus} />
                    {detail.isDuplicate && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Duplikat</span>
                    )}
                  </div>
                  {detail.aiConfidence && (
                    <p className="text-xs text-gray-400 mt-2">KI-Konfidenz: {(parseFloat(detail.aiConfidence) * 100).toFixed(1)}%</p>
                  )}
                </div>

                {/* Validation details */}
                {detail.validationDetails && (detail.validationDetails as unknown[]).length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-gray-900 mb-2">Validierungshinweise</h3>
                    <div className="space-y-2">
                      {(detail.validationDetails as Array<{ field?: string; message: string }>).map((v, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-yellow-50 border border-yellow-200 rounded p-2">
                          <AlertTriangle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
                          <span>{v.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line items */}
                {detail.lineItems && (detail.lineItems as unknown[]).length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-gray-900 mb-2">Positionen</h3>
                    <div className="space-y-2">
                      {(detail.lineItems as Array<{
                        id: string; position: number; description: string | null;
                        quantity: string | null; unit: string | null; grossAmount: string | null;
                      }>).map((item) => (
                        <div key={item.id} className="flex justify-between text-xs bg-gray-50 rounded p-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-gray-400 mr-1">{item.position}.</span>
                            <span className="truncate">{item.description || '—'}</span>
                            {item.quantity && <span className="text-gray-400 ml-1">({item.quantity} {item.unit})</span>}
                          </div>
                          <span className="font-medium ml-2 shrink-0">
                            {item.grossAmount ? formatCurrency(item.grossAmount) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Processing error */}
                {(detail as Record<string, unknown>).processingError && (
                  <div className="border-t pt-4">
                    <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                      <XCircle size={14} className="inline mr-1" />
                      {(detail as Record<string, unknown>).processingError as string}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 text-right max-w-[200px] truncate">{value || '—'}</dd>
    </div>
  );
}

function ValidationBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    VALID: { bg: 'bg-green-100', text: 'text-green-700', label: 'Gültig', icon: <CheckCircle size={12} /> },
    WARNING: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Warnung', icon: <AlertTriangle size={12} /> },
    INVALID: { bg: 'bg-red-100', text: 'text-red-700', label: 'Ungültig', icon: <XCircle size={12} /> },
    PENDING: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Ausstehend', icon: <Clock size={12} /> },
  };
  const c = config[status] || config.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.icon} {c.label}
    </span>
  );
}

function ProcessingBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    UPLOADED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Hochgeladen' },
    PROCESSING: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Verarbeitung...' },
    PROCESSED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Verarbeitet' },
    REVIEW_REQUIRED: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Review' },
    APPROVED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Genehmigt' },
    EXPORTED: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Exportiert' },
    ERROR: { bg: 'bg-red-100', text: 'text-red-700', label: 'Fehler' },
  };
  const c = config[status] || config.UPLOADED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}
