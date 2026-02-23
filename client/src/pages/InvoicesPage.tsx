import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listInvoicesApi,
  getInvoiceApi,
  uploadInvoiceApi,
  updateInvoiceApi,
  approveInvoiceApi,
  rejectInvoiceApi,
  deleteInvoiceApi,
  createErsatzbelegApi,
  getInvoiceDownloadUrl,
  batchApproveInvoicesApi,
} from '../api/invoices';
import type { InvoiceFilters } from '../api/invoices';
import type { ValidationCheck, TrafficLightStatus } from '@buchungsai/shared';
import {
  FileText, Upload, Search, X, ChevronLeft, ChevronRight, Loader2,
  AlertTriangle, CheckCircle, XCircle, Clock, Eye, Download, Edit3,
  ThumbsUp, ThumbsDown, Scale, FileCheck, Trash2, FilePlus2, ArrowRight, MinusCircle,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';

export function InvoicesPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<InvoiceFilters>({ page: 1, limit: 20, sortBy: 'belegNr', sortOrder: 'desc' });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showErsatzbelegDialog, setShowErsatzbelegDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const batchApproveMutation = useMutation({
    mutationFn: (ids: string[]) => batchApproveInvoicesApi(ids),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => listInvoicesApi(filters),
    // Auto-refresh list when any invoice is still processing
    refetchInterval: (query) => {
      const items = query.state.data?.data;
      if (!items) return false;
      const hasProcessing = items.some(
        (inv: { processingStatus: string }) =>
          inv.processingStatus === 'UPLOADED' || inv.processingStatus === 'PROCESSING',
      );
      return hasProcessing ? 4000 : false;
    },
  });

  const { data: detailData, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['invoice', selectedId],
    queryFn: () => getInvoiceApi(selectedId!),
    enabled: !!selectedId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.processingStatus;
      return status === 'UPLOADED' || status === 'PROCESSING' ? 3000 : false;
    },
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

  function handleSort(column: string) {
    setFilters((f) => {
      if (f.sortBy === column) {
        // Toggle direction, or reset if already desc→asc
        return { ...f, sortOrder: f.sortOrder === 'desc' ? 'asc' : 'desc', page: 1 };
      }
      // New column: default desc for numeric/date, asc for text
      const textColumns = ['vendorName', 'invoiceNumber'];
      return { ...f, sortBy: column, sortOrder: textColumns.includes(column) ? 'asc' : 'desc', page: 1 };
    });
  }

  function startEdit() {
    if (!detail?.extractedData) return;
    const ed = detail.extractedData;
    setEditFields({
      issuerName: ed.issuerName || '',
      issuerUid: ed.issuerUid || '',
      invoiceNumber: ed.invoiceNumber || '',
      invoiceDate: ed.invoiceDate ? ed.invoiceDate.slice(0, 10) : '',
      deliveryDate: ed.deliveryDate ? ed.deliveryDate.slice(0, 10) : '',
      dueDate: ed.dueDate ? ed.dueDate.slice(0, 10) : '',
      description: ed.description || '',
      netAmount: ed.netAmount || '',
      vatAmount: ed.vatAmount || '',
      grossAmount: ed.grossAmount || '',
      vatRate: ed.vatRate || '',
      accountNumber: ed.accountNumber || '',
      category: ed.category || '',
    });
    setEditMode(true);
  }

  // Batch selection helpers
  const approvableStatuses = new Set(['PROCESSED', 'REVIEW_REQUIRED']);
  const approvableInvoices = invoices.filter((inv) => approvableStatuses.has(inv.processingStatus));
  const allApprovableSelected = approvableInvoices.length > 0 && approvableInvoices.every((inv) => selectedIds.has(inv.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allApprovableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvableInvoices.map((inv) => inv.id)));
    }
  }

  return (
    <div className="flex gap-6">
      {/* Upload dialog */}
      {showUpload && (
        <UploadDialog
          onClose={() => {
            setShowUpload(false);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
          }}
          onSuccess={() => {
            // Don't close dialog — show summary. List refreshes via refetchInterval.
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}

      {/* Ersatzbeleg dialog */}
      {showErsatzbelegDialog && selectedId && detail && (
        <ErsatzbelegDialog
          originalInvoiceId={selectedId}
          originalBelegNr={detail.belegNr}
          originalVendorName={detail.vendorName}
          onClose={() => setShowErsatzbelegDialog(false)}
          onSuccess={(newInvoiceId: string) => {
            setShowErsatzbelegDialog(false);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
            setSelectedId(newInvoiceId);
          }}
        />
      )}

      {/* Reject dialog */}
      {showRejectDialog && selectedId && (
        <RejectDialog
          invoiceId={selectedId}
          onClose={() => setShowRejectDialog(false)}
          onSuccess={() => {
            setShowRejectDialog(false);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
          }}
          reason={rejectReason}
          setReason={setRejectReason}
        />
      )}

      {/* Main list */}
      <div className={selectedId ? 'flex-1 min-w-0' : 'w-full'}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rechnungen</h1>
            <p className="text-gray-500 mt-1">
              {pagination ? `${pagination.total} Rechnungen` : 'Rechnungen hochladen, prüfen und verwalten'}
            </p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowUpload(true)}>
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
                  placeholder="Suche: Lieferant, Rechnungsnr., BEL-001..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pl-9 !py-2 text-sm"
                />
              </div>
              <button type="submit" className="btn-secondary text-sm px-3">Suchen</button>
            </form>

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
          </div>
        </div>

        {/* Batch selection toolbar */}
        {selectedIds.size > 0 && (
          <div className="card p-3 mb-4 flex items-center gap-4 bg-primary-50 border-primary-200">
            <span className="text-sm font-medium text-primary-800">
              {selectedIds.size} ausgewählt
            </span>
            <button
              onClick={() => batchApproveMutation.mutate(Array.from(selectedIds))}
              disabled={batchApproveMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-4 bg-green-600 hover:bg-green-700"
            >
              {batchApproveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
              Genehmigen
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              Auswahl aufheben
            </button>
            {batchApproveMutation.isSuccess && batchApproveMutation.data?.data && (
              <span className="text-xs text-green-700">
                {batchApproveMutation.data.data.approved} genehmigt
                {batchApproveMutation.data.data.skipped.length > 0 && `, ${batchApproveMutation.data.data.skipped.length} übersprungen`}
              </span>
            )}
          </div>
        )}

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
                    <th className="px-3 py-3 w-[40px]">
                      <input
                        type="checkbox"
                        checked={allApprovableSelected && approvableInvoices.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        title="Alle genehmigbaren auswählen"
                      />
                    </th>
                    <SortHeader label="Beleg-Nr." column="belegNr" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} />
                    <SortHeader label="Lieferant" column="vendorName" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} />
                    <SortHeader label="Rechnungsnr." column="invoiceNumber" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} />
                    <SortHeader label="Datum" column="invoiceDate" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} />
                    <SortHeader label="Betrag" column="grossAmount" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} align="right" />
                    <SortHeader label="Validierung" column="validationStatus" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} align="center" />
                    <SortHeader label="Status" column="processingStatus" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} align="center" />
                    <th className="px-4 py-3 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedId === inv.id ? 'bg-primary-50' : ''} ${selectedIds.has(inv.id) ? 'bg-green-50' : ''}`}
                      onClick={() => { setSelectedId(inv.id); setEditMode(false); }}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {approvableStatuses.has(inv.processingStatus) ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(inv.id)}
                            onChange={() => toggleSelect(inv.id)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        ) : (
                          <span className="block w-4" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                          BEL-{String(inv.belegNr).padStart(3, '0')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.vendorName ? (
                          <>
                            <div className="font-medium text-gray-900 truncate max-w-[200px]">{inv.vendorName}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs text-gray-400 truncate max-w-[160px]">{inv.originalFileName}</span>
                              {(inv as unknown as { documentType?: string }).documentType === 'ERSATZBELEG' && (
                                <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1 py-0.5 rounded">Ersatzbeleg</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-gray-400 truncate max-w-[200px] italic text-xs">{inv.originalFileName}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-gray-300">Lieferant wird erkannt...</span>
                              {(inv as unknown as { documentType?: string }).documentType === 'ERSATZBELEG' && (
                                <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1 py-0.5 rounded">Ersatzbeleg</span>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inv.invoiceNumber || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.invoiceDate ? formatDate(inv.invoiceDate) : '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {inv.grossAmount ? (
                          inv.currency !== 'EUR' ? (
                            <div>
                              <div>{formatCurrency(String(inv.grossAmount), inv.currency)}</div>
                              {inv.estimatedEurGross && (
                                <div className="text-xs text-gray-400 font-normal">≈ {formatCurrency(inv.estimatedEurGross)}</div>
                              )}
                            </div>
                          ) : formatCurrency(String(inv.grossAmount))
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ValidationBadge status={inv.validationStatus} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ProcessingBadge status={inv.processingStatus} />
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
        <div className="w-[480px] shrink-0">
          <div className="card p-6 sticky top-0 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {detail && (
                  <span className="font-mono text-sm font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                    BEL-{String(detail.belegNr).padStart(3, '0')}
                  </span>
                )}
                <h2 className="text-lg font-semibold">Details</h2>
              </div>
              <div className="flex items-center gap-2">
                {detail && !editMode && detail.extractedData && (
                  <button onClick={startEdit} className="text-gray-400 hover:text-primary-600" title="Bearbeiten">
                    <Edit3 size={16} />
                  </button>
                )}
                {detail && (
                  <DownloadButton invoiceId={selectedId} />
                )}
                <button onClick={() => { setSelectedId(null); setEditMode(false); }} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-primary-600" size={24} />
              </div>
            ) : detailError ? (
              <div className="text-center py-8">
                <XCircle size={24} className="mx-auto text-red-400 mb-2" />
                <p className="text-red-600 text-sm">Fehler beim Laden</p>
                <p className="text-xs text-gray-400 mt-1">{(detailError as Error).message}</p>
              </div>
            ) : !detail ? (
              <div className="text-center text-gray-400 py-8">
                <p>Keine Details verfügbar</p>
                <p className="text-xs mt-1">Rechnung wird möglicherweise noch verarbeitet</p>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                {/* Processing progress bar */}
                {(detail.processingStatus === 'UPLOADED' || detail.processingStatus === 'PROCESSING' || detail.processingStatus === 'ERROR') && (
                  <ProcessingProgress status={detail.processingStatus} error={(detail as unknown as { processingError?: string }).processingError} />
                )}

                {/* Ersatzbeleg reference box */}
                {(detail as unknown as { documentType?: string }).documentType === 'ERSATZBELEG' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-orange-800">
                      <FilePlus2 size={16} />
                      Ersatzbeleg
                    </div>
                    {(detail as unknown as { replacesBelegNr?: number }).replacesBelegNr && (
                      <p className="text-xs text-orange-600 mt-1">
                        Ersetzt Original: <span className="font-mono font-bold">BEL-{String((detail as unknown as { replacesBelegNr: number }).replacesBelegNr).padStart(3, '0')}</span>
                      </p>
                    )}
                    {(detail as unknown as { ersatzReason?: string }).ersatzReason && (
                      <p className="text-xs text-orange-600 mt-1">
                        Grund: {(detail as unknown as { ersatzReason: string }).ersatzReason}
                      </p>
                    )}
                  </div>
                )}

                {/* Replaced by Ersatzbeleg notice */}
                {detail.processingStatus === 'REPLACED' && (
                  <div className="bg-gray-100 border border-gray-300 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <ArrowRight size={16} />
                      Ersetzt durch Ersatzbeleg
                    </div>
                    {(detail as unknown as { replacedByBelegNr?: number }).replacedByBelegNr && (
                      <p className="text-xs text-gray-500 mt-1">
                        Ersatzbeleg: <span className="font-mono font-bold">BEL-{String((detail as unknown as { replacedByBelegNr: number }).replacedByBelegNr).padStart(3, '0')}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Edit mode */}
                {editMode ? (
                  <EditForm
                    fields={editFields}
                    setFields={setEditFields}
                    invoiceId={selectedId}
                    onCancel={() => setEditMode(false)}
                    onSaved={() => {
                      setEditMode(false);
                      queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
                      queryClient.invalidateQueries({ queryKey: ['invoices'] });
                    }}
                  />
                ) : (
                  <>
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
                      <ViewOriginalButton invoiceId={selectedId} />
                    </div>

                    {/* Amounts */}
                    <div className="border-t pt-4">
                      <h3 className="font-medium text-gray-900 mb-2">Beträge</h3>
                      <dl className="space-y-1">
                        {Array.isArray(detail.vatBreakdown) && detail.vatBreakdown.length > 1 ? (
                          <>
                            {(detail.vatBreakdown as Array<{ rate: number; netAmount: number; vatAmount: number }>).map((line, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <dt className="text-gray-500">Netto ({line.rate}%)</dt>
                                <dd className="flex gap-4">
                                  <span>{formatCurrency(line.netAmount, detail.currency)}</span>
                                  <span className="text-gray-400">USt {formatCurrency(line.vatAmount, detail.currency)}</span>
                                </dd>
                              </div>
                            ))}
                            <div className="border-t border-dashed my-1" />
                            <DetailRow label="Netto gesamt" value={detail.netAmount ? formatCurrency(detail.netAmount, detail.currency) : null} />
                            <DetailRow label="USt gesamt" value={detail.vatAmount ? formatCurrency(detail.vatAmount, detail.currency) : null} />
                          </>
                        ) : (
                          <>
                            <DetailRow label="Netto" value={detail.netAmount ? formatCurrency(detail.netAmount, detail.currency) : null} />
                            <DetailRow label={`USt (${detail.vatRate ?? '?'}%)`} value={detail.vatAmount ? formatCurrency(detail.vatAmount, detail.currency) : null} />
                          </>
                        )}
                        <div className="flex justify-between font-semibold pt-1">
                          <dt>Brutto</dt>
                          <dd>{detail.grossAmount ? formatCurrency(detail.grossAmount, detail.currency) : '—'}</dd>
                        </div>
                        {detail.currency !== 'EUR' && detail.estimatedEurGross && (
                          <div className="flex justify-between text-xs text-gray-400 pt-0.5">
                            <dt>≈ EUR</dt>
                            <dd>{formatCurrency(detail.estimatedEurGross)} (EZB-Kurs{detail.exchangeRateDate ? ` vom ${formatDate(detail.exchangeRateDate)}` : ''})</dd>
                          </div>
                        )}
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

                    {/* Validation result with structured checks */}
                    {detail.validationResult && (
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Scale size={16} className="text-gray-500" />
                          <h3 className="font-medium text-gray-900">Prüfprotokoll</h3>
                          <TrafficLight status={detail.validationResult.overallStatus as TrafficLightStatus} />
                          <span className="text-xs text-gray-400 ml-auto">
                            {detail.validationResult.amountClass === 'SMALL' ? 'Kleinbetrag' :
                             detail.validationResult.amountClass === 'LARGE' ? 'Großbetrag' : 'Standard'}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {[...(detail.validationResult.checks as ValidationCheck[])]
                            .sort((a, b) => {
                              const order = { RED: 0, YELLOW: 1, GREEN: 2, GRAY: 3 };
                              return (order[a.status] ?? 2) - (order[b.status] ?? 2);
                            })
                            .map((check, i) => (
                            <div
                              key={i}
                              className={`flex items-start gap-2 text-xs rounded p-2 ${
                                check.status === 'GRAY' ? 'bg-gray-50 border border-gray-100 opacity-60' :
                                check.status === 'GREEN' ? 'bg-green-50 border border-green-100' :
                                check.status === 'YELLOW' ? 'bg-yellow-50 border border-yellow-200' :
                                'bg-red-50 border border-red-200'
                              }`}
                            >
                              {check.status === 'GRAY' ? <MinusCircle size={13} className="text-gray-400 shrink-0 mt-0.5" /> :
                               check.status === 'GREEN' ? <CheckCircle size={13} className="text-green-600 shrink-0 mt-0.5" /> :
                               check.status === 'YELLOW' ? <AlertTriangle size={13} className="text-yellow-600 shrink-0 mt-0.5" /> :
                               <XCircle size={13} className="text-red-600 shrink-0 mt-0.5" />}
                              <div className="flex-1 min-w-0">
                                <span>{check.message}</span>
                                {check.legalBasis && (
                                  <span className="text-gray-400 ml-1">({check.legalBasis})</span>
                                )}
                                {check.details && (check.details as Record<string, unknown>).actions ? (
                                  <div className="mt-1.5 pl-2 border-l-2 border-red-300 space-y-0.5">
                                    <span className="font-medium text-red-700 block">Empfohlene Maßnahmen:</span>
                                    {((check.details as { actions: string[] }).actions).map((action, j) => (
                                      <div key={j} className="flex items-start gap-1 text-red-600">
                                        <span className="shrink-0">→</span>
                                        <span>{action}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Legacy validation details (old format) */}
                    {!detail.validationResult && detail.validationDetails && (detail.validationDetails as unknown[]).length > 0 && (
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
                                {item.grossAmount ? formatCurrency(item.grossAmount, detail.currency) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rejection note */}
                    {(detail as unknown as { notes?: string }).notes && (
                      <div className="border-t pt-4">
                        <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-700">
                          <ThumbsDown size={14} className="inline mr-1" />
                          <span className="font-medium">Abgelehnt:</span> {(detail as unknown as { notes?: string }).notes}
                        </div>
                      </div>
                    )}

                    {/* Processing error */}
                    {(detail as unknown as { processingError?: string }).processingError && (
                      <div className="border-t pt-4">
                        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                          <XCircle size={14} className="inline mr-1" />
                          {(detail as unknown as { processingError?: string }).processingError}
                        </div>
                      </div>
                    )}

                    {/* Extracted data version info */}
                    {detail.extractedData && (
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <FileCheck size={13} />
                          <span>
                            Version {detail.extractedData.version} — {detail.extractedData.source === 'AI' ? 'KI-Extraktion' : 'Manuelle Korrektur'}
                            {detail.extractedData.pipelineStage && ` (${detail.extractedData.pipelineStage})`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {detail.processingStatus !== 'APPROVED' && detail.processingStatus !== 'EXPORTED' && detail.processingStatus !== 'UPLOADED' && detail.processingStatus !== 'PROCESSING' && detail.processingStatus !== 'REPLACED' && (
                      <div className="border-t pt-4 flex gap-2">
                        <ApproveButton
                          invoiceId={selectedId}
                          onSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ['invoices'] });
                            queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
                          }}
                        />
                        <button
                          className="btn-secondary flex items-center gap-1.5 text-sm flex-1 justify-center"
                          onClick={() => { setRejectReason(''); setShowRejectDialog(true); }}
                        >
                          <ThumbsDown size={14} />
                          Ablehnen
                        </button>
                      </div>
                    )}

                    {/* Ersatzbeleg erstellen button — for ERROR, REVIEW_REQUIRED and similar problematic invoices */}
                    {(detail.processingStatus === 'ERROR' || detail.processingStatus === 'REVIEW_REQUIRED' || detail.processingStatus === 'PROCESSED') &&
                     !(detail as unknown as { replacedByInvoiceId?: string }).replacedByInvoiceId && (
                      <div className="border-t pt-4">
                        <button
                          onClick={() => setShowErsatzbelegDialog(true)}
                          className="btn-secondary flex items-center gap-1.5 text-sm w-full justify-center text-orange-600 hover:text-orange-700 hover:border-orange-300"
                        >
                          <FilePlus2 size={14} />
                          Ersatzbeleg erstellen
                        </button>
                      </div>
                    )}

                    {/* Delete button for ERROR/UPLOADED */}
                    {(detail.processingStatus === 'ERROR' || detail.processingStatus === 'UPLOADED') && (
                      <div className="border-t pt-4">
                        <DeleteButton
                          invoiceId={selectedId}
                          onSuccess={() => {
                            setSelectedId(null);
                            queryClient.invalidateQueries({ queryKey: ['invoices'] });
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

interface FileUploadState {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

function UploadDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasStarted = fileStates.length > 0;
  const allDone = hasStarted && fileStates.every((f) => f.status === 'done' || f.status === 'error');
  const successCount = fileStates.filter((f) => f.status === 'done').length;
  const errorCount = fileStates.filter((f) => f.status === 'error').length;

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);

    // Initialize all files as pending
    const initialStates: FileUploadState[] = fileArray.map((file) => ({
      file,
      status: 'pending' as const,
    }));
    setFileStates(initialStates);

    // Upload in batches of 5 to avoid rate limiting
    const CONCURRENCY = 5;
    for (let start = 0; start < fileArray.length; start += CONCURRENCY) {
      const batch = fileArray.slice(start, start + CONCURRENCY);
      const uploads = batch.map(async (file, batchIdx) => {
        const index = start + batchIdx;
        setFileStates((prev) =>
          prev.map((f, i) => (i === index ? { ...f, status: 'uploading' as const } : f)),
        );

        try {
          await uploadInvoiceApi(file);
          setFileStates((prev) =>
            prev.map((f, i) => (i === index ? { ...f, status: 'done' as const } : f)),
          );
        } catch (err: unknown) {
          const msg =
            (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
              ?.error?.message || 'Upload fehlgeschlagen';
          setFileStates((prev) =>
            prev.map((f, i) => (i === index ? { ...f, status: 'error' as const, error: msg } : f)),
          );
        }
      });
      await Promise.all(uploads);
    }

    onSuccess();
  }, [onSuccess]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Rechnungen hochladen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Drop zone — hide when uploads are in progress */}
        {!hasStarted && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Upload className="mx-auto text-gray-400 mb-3" size={36} />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Dateien hierher ziehen oder klicken
            </p>
            <p className="text-xs text-gray-400">PDF, JPEG, PNG, TIFF, WebP — max. 20 MB pro Datei — mehrere gleichzeitig möglich</p>
          </div>
        )}

        {/* File list with status */}
        {hasStarted && (
          <div className="space-y-2">
            {/* Summary */}
            {allDone && (
              <div className={`rounded-lg p-3 text-sm font-medium ${
                errorCount === 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
              }`}>
                {errorCount === 0
                  ? `${successCount} ${successCount === 1 ? 'Rechnung' : 'Rechnungen'} erfolgreich hochgeladen`
                  : `${successCount} erfolgreich, ${errorCount} fehlgeschlagen`}
              </div>
            )}

            {/* Individual files */}
            <div className="max-h-[300px] overflow-y-auto space-y-1.5">
              {fileStates.map((fs, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                    fs.status === 'done' ? 'border-green-200 bg-green-50' :
                    fs.status === 'error' ? 'border-red-200 bg-red-50' :
                    fs.status === 'uploading' ? 'border-blue-200 bg-blue-50' :
                    'border-gray-200 bg-gray-50'
                  }`}
                >
                  {fs.status === 'uploading' && <Loader2 size={14} className="animate-spin text-blue-600 shrink-0" />}
                  {fs.status === 'done' && <CheckCircle size={14} className="text-green-600 shrink-0" />}
                  {fs.status === 'error' && <XCircle size={14} className="text-red-600 shrink-0" />}
                  {fs.status === 'pending' && <Clock size={14} className="text-gray-400 shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-gray-900">{fs.file.name}</p>
                    {fs.status === 'uploading' && <p className="text-xs text-blue-600">Wird hochgeladen...</p>}
                    {fs.status === 'done' && <p className="text-xs text-green-600">Erfolgreich — wird verarbeitet</p>}
                    {fs.status === 'error' && <p className="text-xs text-red-600">{fs.error}</p>}
                    {fs.status === 'pending' && <p className="text-xs text-gray-400">Wartet...</p>}
                  </div>

                  <span className="text-xs text-gray-400 shrink-0">
                    {(fs.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ))}
            </div>

            {/* Close button when done */}
            {allDone && (
              <button onClick={onClose} className="btn-primary w-full text-sm mt-2">
                Schließen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditForm({
  fields, setFields, invoiceId, onCancel, onSaved,
}: {
  fields: Record<string, unknown>;
  setFields: (f: Record<string, unknown>) => void;
  invoiceId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(fields)) {
        if (val === '' || val === null) {
          payload[key] = null;
        } else if (['netAmount', 'vatAmount', 'grossAmount', 'vatRate'].includes(key)) {
          payload[key] = parseFloat(val as string) || null;
        } else if (['invoiceDate', 'deliveryDate', 'dueDate'].includes(key) && val) {
          payload[key] = new Date(val as string).toISOString();
        } else {
          payload[key] = val;
        }
      }
      await updateInvoiceApi(invoiceId, payload);
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Speichern fehlgeschlagen';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, key: string, type = 'text') {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
        <input
          type={type}
          value={(fields[key] as string) ?? ''}
          onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          className="input-field !py-1.5 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-gray-900 flex items-center gap-2">
        <Edit3 size={14} />
        Daten korrigieren
      </h3>
      <ViewOriginalButton invoiceId={invoiceId} />
      {field('Aussteller', 'issuerName')}
      {field('UID-Nummer', 'issuerUid')}
      {field('Rechnungsnummer', 'invoiceNumber')}
      <div className="grid grid-cols-2 gap-2">
        {field('Rechnungsdatum', 'invoiceDate', 'date')}
        {field('Fälligkeitsdatum', 'dueDate', 'date')}
      </div>
      {field('Lieferdatum', 'deliveryDate', 'date')}
      {field('Beschreibung', 'description')}
      <div className="grid grid-cols-3 gap-2">
        {field('Netto', 'netAmount', 'number')}
        {field('USt', 'vatAmount', 'number')}
        {field('Brutto', 'grossAmount', 'number')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field('USt-Satz %', 'vatRate', 'number')}
        {field('Konto', 'accountNumber')}
      </div>
      {field('Kategorie', 'category')}

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          Speichern & Prüfen
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm px-4">Abbrechen</button>
      </div>
    </div>
  );
}

function ApproveButton({ invoiceId, onSuccess }: { invoiceId: string; onSuccess: () => void }) {
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    mutationFn: () => approveInvoiceApi(invoiceId),
    onSuccess: () => {
      setDone(true);
      onSuccess();
      setTimeout(() => setDone(false), 2000);
    },
  });

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-sm flex-1 justify-center py-2 bg-green-100 text-green-700 rounded-lg font-medium">
        <CheckCircle size={14} />
        Genehmigt!
      </div>
    );
  }

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center bg-green-600 hover:bg-green-700"
    >
      {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
      Genehmigen
    </button>
  );
}

function RejectDialog({
  invoiceId, onClose, onSuccess, reason, setReason,
}: {
  invoiceId: string; onClose: () => void; onSuccess: () => void;
  reason: string; setReason: (r: string) => void;
}) {
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    mutationFn: () => rejectInvoiceApi(invoiceId, reason),
    onSuccess: () => {
      setDone(true);
      onSuccess();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={done ? onClose : undefined}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <XCircle size={40} className="mx-auto text-red-500 mb-3" />
            <h2 className="text-lg font-semibold mb-2">Rechnung abgelehnt</h2>
            <p className="text-sm text-gray-600 mb-4">Begründung: {reason}</p>
            <button onClick={onClose} className="btn-primary text-sm px-6">Schließen</button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-4">Rechnung ablehnen</h2>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Begründung eingeben..."
              className="input-field min-h-[80px] text-sm"
            />
            {mutation.isError && (
              <p className="text-xs text-red-600 mt-2">Fehler beim Ablehnen</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => mutation.mutate()}
                disabled={!reason.trim() || mutation.isPending}
                className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center bg-red-600 hover:bg-red-700"
              >
                {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
                Ablehnen
              </button>
              <button onClick={onClose} className="btn-secondary text-sm px-4">Abbrechen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeleteButton({ invoiceId, onSuccess }: { invoiceId: string; onSuccess: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteInvoiceApi(invoiceId),
    onSuccess,
  });

  if (confirming) {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center bg-red-600 hover:bg-red-700"
        >
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Wirklich löschen
        </button>
        <button onClick={() => setConfirming(false)} className="btn-secondary text-sm px-4">Abbrechen</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="btn-secondary flex items-center gap-1.5 text-sm w-full justify-center text-red-600 hover:text-red-700 hover:border-red-300"
    >
      <Trash2 size={14} />
      Löschen
    </button>
  );
}

function ErsatzbelegDialog({
  originalInvoiceId, originalBelegNr, originalVendorName, onClose, onSuccess,
}: {
  originalInvoiceId: string;
  originalBelegNr: number;
  originalVendorName: string | null;
  onClose: () => void;
  onSuccess: (newInvoiceId: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({
    reason: '',
    issuerName: originalVendorName || '',
    description: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    grossAmount: '',
    netAmount: '',
    vatAmount: '',
    vatRate: '20',
    invoiceNumber: '',
    issuerUid: '',
    accountNumber: '',
    category: '',
  });

  function updateField(key: string, value: string) {
    const updated = { ...fields, [key]: value };

    // Auto-calculate: when grossAmount + vatRate → netAmount + vatAmount
    if ((key === 'grossAmount' || key === 'vatRate') && updated.grossAmount) {
      const gross = parseFloat(updated.grossAmount);
      const rate = parseFloat(updated.vatRate) || 20;
      if (!isNaN(gross) && gross > 0) {
        const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
        const vat = Math.round((gross - net) * 100) / 100;
        updated.netAmount = net.toFixed(2);
        updated.vatAmount = vat.toFixed(2);
      }
    }

    setFields(updated);
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        reason: fields.reason,
        issuerName: fields.issuerName,
        description: fields.description,
        invoiceDate: new Date(fields.invoiceDate).toISOString(),
        grossAmount: parseFloat(fields.grossAmount),
        netAmount: fields.netAmount ? parseFloat(fields.netAmount) : null,
        vatAmount: fields.vatAmount ? parseFloat(fields.vatAmount) : null,
        vatRate: fields.vatRate ? parseFloat(fields.vatRate) : 20,
        invoiceNumber: fields.invoiceNumber || null,
        issuerUid: fields.issuerUid || null,
        accountNumber: fields.accountNumber || null,
        category: fields.category || null,
      };
      const resp = await createErsatzbelegApi(originalInvoiceId, payload);
      onSuccess((resp.data as unknown as { id: string }).id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Ersatzbeleg konnte nicht erstellt werden';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const belegLabel = `BEL-${String(originalBelegNr).padStart(3, '0')}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FilePlus2 size={20} className="text-orange-600" />
            <h2 className="text-lg font-semibold">Ersatzbeleg erstellen</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-700">
          <p className="font-medium">Ersatzbeleg für {belegLabel}</p>
          <p className="text-xs mt-1">
            Der Originalbeleg wird als "Ersetzt" markiert. Sie können die Daten manuell eingeben —
            z.B. aus dem Kontoauszug (Lieferant, Betrag, Datum).
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Grund *</label>
            <textarea
              value={fields.reason}
              onChange={(e) => updateField('reason', e.target.value)}
              placeholder="z.B. Original-Rechnung unleserlich / Beleg nicht auffindbar"
              className="input-field min-h-[60px] text-sm"
            />
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Rechnungsdaten (soweit bekannt)</p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Lieferant *</label>
            <input type="text" value={fields.issuerName} onChange={(e) => updateField('issuerName', e.target.value)} className="input-field !py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Beschreibung / Leistung *</label>
            <input type="text" value={fields.description} onChange={(e) => updateField('description', e.target.value)} placeholder="z.B. Telekommunikation, Büromaterial" className="input-field !py-1.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Datum *</label>
              <input type="date" value={fields.invoiceDate} onChange={(e) => updateField('invoiceDate', e.target.value)} className="input-field !py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Rechnungsnr.</label>
              <input type="text" value={fields.invoiceNumber} onChange={(e) => updateField('invoiceNumber', e.target.value)} className="input-field !py-1.5 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Brutto * (€)</label>
              <input type="number" step="0.01" value={fields.grossAmount} onChange={(e) => updateField('grossAmount', e.target.value)} className="input-field !py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">USt-Satz %</label>
              <input type="number" value={fields.vatRate} onChange={(e) => updateField('vatRate', e.target.value)} className="input-field !py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Netto (€)</label>
              <input type="number" step="0.01" value={fields.netAmount} readOnly className="input-field !py-1.5 text-sm bg-gray-50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">UID-Nummer</label>
              <input type="text" value={fields.issuerUid} onChange={(e) => updateField('issuerUid', e.target.value)} placeholder="ATU..." className="input-field !py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Konto</label>
              <input type="text" value={fields.accountNumber} onChange={(e) => updateField('accountNumber', e.target.value)} className="input-field !py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Kategorie</label>
            <input type="text" value={fields.category} onChange={(e) => updateField('category', e.target.value)} placeholder="z.B. Telekommunikation" className="input-field !py-1.5 text-sm" />
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreate}
              disabled={saving || !fields.reason.trim() || !fields.issuerName.trim() || !fields.description.trim() || !fields.grossAmount}
              className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center bg-orange-600 hover:bg-orange-700"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
              Ersatzbeleg erstellen
            </button>
            <button onClick={onClose} className="btn-secondary text-sm px-4">Abbrechen</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessingProgress({ status, error }: { status: string; error?: string }) {
  const steps = [
    { label: 'Hochgeladen', key: 'upload' },
    { label: 'Text erkennen', key: 'ocr' },
    { label: 'KI analysiert', key: 'llm' },
    { label: 'Validierung', key: 'validate' },
  ];

  let activeStep = 0;
  if (status === 'UPLOADED') activeStep = 0;
  else if (status === 'PROCESSING') activeStep = 1;
  else if (status === 'ERROR') activeStep = -1;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        {status === 'ERROR' ? (
          <XCircle size={16} className="text-red-500" />
        ) : (
          <Loader2 size={16} className="animate-spin text-primary-600" />
        )}
        <span className="text-sm font-medium text-gray-900">
          {status === 'ERROR' ? 'Verarbeitung fehlgeschlagen' :
           status === 'UPLOADED' ? 'Warte auf Verarbeitung...' :
           'Wird verarbeitet...'}
        </span>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isComplete = status !== 'ERROR' && i < activeStep;
          const isActive = status !== 'ERROR' && i === activeStep;
          const isError = status === 'ERROR';

          return (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-center">
                <div
                  className={`h-2 w-full rounded-full transition-all ${
                    isComplete ? 'bg-green-500' :
                    isActive ? 'bg-primary-500 animate-pulse' :
                    isError && i === 0 ? 'bg-red-500' :
                    isError ? 'bg-gray-200' :
                    'bg-gray-200'
                  }`}
                />
              </div>
              <span className={`text-[10px] leading-tight text-center ${
                isComplete ? 'text-green-600 font-medium' :
                isActive ? 'text-primary-600 font-medium' :
                isError && i === 0 ? 'text-red-600 font-medium' :
                'text-gray-400'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {status === 'ERROR' && error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function ViewOriginalButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  async function handleView() {
    setLoading(true);
    try {
      const resp = await getInvoiceDownloadUrl(invoiceId);
      if (resp.data?.url) window.open(resp.data.url, '_blank');
    } catch { /* ignore */ }
    setLoading(false);
  }
  return (
    <button
      onClick={handleView}
      disabled={loading}
      className="mt-3 w-full btn-secondary flex items-center justify-center gap-2 text-sm py-2"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
      Original anzeigen
    </button>
  );
}

function DownloadButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  async function handleDownload() {
    setLoading(true);
    try {
      const resp = await getInvoiceDownloadUrl(invoiceId);
      if (resp.data?.url) window.open(resp.data.url, '_blank');
    } catch { /* ignore */ }
    setLoading(false);
  }
  return (
    <button onClick={handleDownload} className="text-gray-400 hover:text-primary-600" title="Herunterladen">
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
    </button>
  );
}

function TrafficLight({ status }: { status: TrafficLightStatus }) {
  const config: Record<string, { bg: string; ring: string }> = {
    GREEN: { bg: 'bg-green-500', ring: 'ring-green-200' },
    YELLOW: { bg: 'bg-yellow-400', ring: 'ring-yellow-200' },
    RED: { bg: 'bg-red-500', ring: 'ring-red-200' },
    GRAY: { bg: 'bg-gray-400', ring: 'ring-gray-200' },
  };
  const c = config[status] || config.RED;
  return <span className={`inline-block w-3 h-3 rounded-full ${c.bg} ring-2 ${c.ring}`} />;
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
  const config: Record<string, { bg: string; text: string; label: string; animate?: boolean }> = {
    UPLOADED: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Warteschlange', animate: true },
    PROCESSING: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Verarbeitung...', animate: true },
    PROCESSED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Verarbeitet' },
    REVIEW_REQUIRED: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Review nötig' },
    APPROVED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Genehmigt' },
    EXPORTED: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Exportiert' },
    ERROR: { bg: 'bg-red-100', text: 'text-red-700', label: 'Fehler' },
    REPLACED: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Ersetzt' },
  };
  const c = config[status] || config.UPLOADED;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.animate && <Loader2 size={10} className="animate-spin" />}
      {c.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(value: string | number, cur: string = 'EUR'): string {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '—';
  try {
    return num.toLocaleString('de-AT', { style: 'currency', currency: cur });
  } catch {
    // Fallback for unknown currency codes
    return `${num.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
  }
}

function SortHeader({
  label, column, currentSort, currentOrder, onSort, align = 'left',
}: {
  label: string; column: string; currentSort?: string; currentOrder?: string;
  onSort: (column: string) => void; align?: 'left' | 'right' | 'center';
}) {
  const isActive = currentSort === column;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      className={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100 transition-colors group`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        {isActive ? (
          currentOrder === 'asc' ? <ArrowUp size={14} className="text-primary-600" /> : <ArrowDown size={14} className="text-primary-600" />
        ) : (
          <ArrowUpDown size={14} className="text-gray-300 group-hover:text-gray-400" />
        )}
      </div>
    </th>
  );
}
