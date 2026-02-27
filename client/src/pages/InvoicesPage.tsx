import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listInvoicesApi,
  getInvoiceApi,

  updateInvoiceApi,
  approveInvoiceApi,
  rejectInvoiceApi,
  deleteInvoiceApi,

  getInvoiceDownloadUrl,
  batchApproveInvoicesApi,
  parkInvoiceApi,
  unparkInvoiceApi,
  markCashPaymentApi,
  undoCashPaymentApi,
  requestCorrectionApi,
  setRecurringApi,
} from '../api/invoices';
import { generateCorrectionEmailApi } from '../api/mail';
import { exportOcrCheckApi, downloadBlob } from '../api/exports';
import type { InvoiceFilters } from '../api/invoices';
import type { ValidationCheck, TrafficLightStatus, RecurringIntervalType } from '@buchungsai/shared';
import { RECURRING_INTERVALS } from '@buchungsai/shared';
import {
  FileText, Upload, Search, ChevronLeft, ChevronRight, Loader2,
  AlertTriangle, CheckCircle, XCircle, Clock, Eye, Download, Edit3,
  ThumbsUp, ThumbsDown, Scale, Trash2, FilePlus2, ArrowRight, MinusCircle,
  ArrowUp, ArrowDown, ArrowUpDown, Lock, Archive, Mail, SlidersHorizontal,
  PauseCircle, Play, Banknote, Repeat,
} from 'lucide-react';
import { AccountSelector } from '../components/AccountSelector';
import { SendEmailDialog } from '../components/SendEmailDialog';
import { InvoiceUploadDialog } from '../components/InvoiceUploadDialog';
import { BelegFormDialog } from '../components/BelegFormDialog';
import { useIsMobile } from '../hooks/useIsMobile';
import { FullScreenPanel } from '../components/mobile/FullScreenPanel';
import { BottomSheet } from '../components/mobile/BottomSheet';
import { InvoiceSplitView } from '../components/InvoiceSplitView';
import { DocumentViewer } from '../components/DocumentViewer';
import { ValidatedField } from '../components/ValidatedField';

export function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<InvoiceFilters>({ page: 1, limit: 20, sortBy: 'belegNr', sortOrder: 'desc', inboxCleared: true });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showErsatzbelegDialog, setShowErsatzbelegDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchApproveDialog, setShowBatchApproveDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailPrefill, setEmailPrefill] = useState<{ to?: string; subject?: string; body?: string } | undefined>(undefined);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [cashDate, setCashDate] = useState('');
  const [ocrExportLoading, setOcrExportLoading] = useState(false);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [correctionNote, setCorrectionNote] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'split'>('list');
  const [mobileTab, setMobileTab] = useState<'data' | 'doc'>('data');
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open invoice from URL ?id=...
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl && idFromUrl !== selectedId) {
      setSelectedId(idFromUrl);
      setViewMode('split');
      // Clean up URL param
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, selectedId, setSearchParams]);

  const cashPaymentMutation = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => markCashPaymentApi(id, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
      setShowCashDialog(false);
    },
  });

  const undoCashMutation = useMutation({
    mutationFn: (id: string) => undoCashPaymentApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
    },
  });

  const correctionMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => requestCorrectionApi(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
      setShowCorrectionDialog(false);
      setCorrectionNote('');
    },
  });

  const batchApproveMutation = useMutation({
    mutationFn: ({ ids, comment }: { ids: string[]; comment?: string | null }) => batchApproveInvoicesApi(ids, comment),
    onSuccess: () => {
      setSelectedIds(new Set());
      setShowBatchApproveDialog(false);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
    },
  });

  const setRecurringMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isRecurring: boolean; recurringInterval?: RecurringIntervalType | null; recurringNote?: string | null } }) => setRecurringApi(id, data),
    onSuccess: () => {
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
      privatePercent: detail.privatePercent ?? null,
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

  // Desktop: switch to split view when selecting an invoice
  function handleSelectInvoice(id: string) {
    setSelectedId(id);
    setEditMode(false);
    if (!isMobile) {
      setViewMode('split');
    }
  }

  function handleBackToList() {
    setViewMode('list');
    setSelectedId(null);
    setEditMode(false);
  }

  // Desktop split view mode
  if (!isMobile && viewMode === 'split' && selectedId) {
    return (
      <>
        {/* Dialogs still need to render */}
        {showUpload && (
          <InvoiceUploadDialog
            onClose={() => {
              setShowUpload(false);
              queryClient.invalidateQueries({ queryKey: ['invoices'] });
            }}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['invoices'] });
            }}
          />
        )}
        {showErsatzbelegDialog && detail && (
          <BelegFormDialog
            context={{
              mode: 'ersatzbeleg',
              originalInvoiceId: selectedId,
              originalBelegNr: detail.belegNr,
              originalVendorName: detail.vendorName,
            }}
            onClose={() => setShowErsatzbelegDialog(false)}
            onSuccess={(newInvoiceId) => {
              setShowErsatzbelegDialog(false);
              queryClient.invalidateQueries({ queryKey: ['invoices'] });
              queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
              if (newInvoiceId) {
                setSelectedId(newInvoiceId);
              }
            }}
          />
        )}
        {showRejectDialog && (
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
        {showEmailDialog && detail && (() => {
          const isOutgoing = detail.direction === 'OUTGOING';
          const recipientEmail = isOutgoing
            ? (detail as unknown as { customer?: { email?: string } }).customer?.email || ''
            : (detail as unknown as { vendor?: { email?: string } }).vendor?.email || '';
          const invNr = detail.invoiceNumber || `BEL-${String(detail.belegNr).padStart(3, '0')}`;
          const invDate = detail.invoiceDate ? new Date(detail.invoiceDate).toLocaleDateString('de-AT') : '';
          const amount = detail.grossAmount ? `${parseFloat(detail.grossAmount).toLocaleString('de-AT', { style: 'currency', currency: detail.currency || 'EUR' })}` : '';
          const dueDate = detail.dueDate ? new Date(detail.dueDate).toLocaleDateString('de-AT') : '';
          const defaultSubject = isOutgoing
            ? `Zahlungserinnerung — Rechnung ${invNr}`
            : `Rückfrage zu Rechnung ${invNr}`;
          const defaultBody = isOutgoing
            ? `Sehr geehrte Damen und Herren,\n\nwir erlauben uns, Sie an die offene Rechnung ${invNr} vom ${invDate} über ${amount} hinzuweisen.${dueDate ? `\n\nZahlungsziel war der ${dueDate}. Wir bitten um umgehende Überweisung.` : ''}\n\nMit freundlichen Grüßen`
            : `Sehr geehrte Damen und Herren,\n\nbezüglich Ihrer Rechnung ${invNr} vom ${invDate} über ${amount} möchten wir folgende Punkte klären:\n\n[Hier Ihre Anmerkungen einfügen]\n\nMit freundlichen Grüßen`;
          return (
            <SendEmailDialog
              onClose={() => { setShowEmailDialog(false); setEmailPrefill(undefined); }}
              onSuccess={() => { setShowEmailDialog(false); setEmailPrefill(undefined); }}
              defaultTo={emailPrefill?.to || recipientEmail}
              defaultSubject={emailPrefill?.subject || defaultSubject}
              defaultBody={emailPrefill?.body || defaultBody}
              entityType="Invoice"
              entityId={selectedId}
            />
          );
        })()}

        <InvoiceSplitView
          invoiceId={selectedId}
          mimeType={detail?.mimeType}
          originalFileName={detail?.originalFileName}
          onBack={handleBackToList}
          headerContent={detail && (
            <>
              {detail.archivalNumber ? (
                <span className="font-mono text-sm font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                  <Lock size={12} />
                  {detail.archivalNumber}
                </span>
              ) : (
                <span className="font-mono text-sm font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                  BEL-{String(detail.belegNr).padStart(3, '0')}
                </span>
              )}
              <ValidationBadge status={detail.validationStatus} />
              <ProcessingBadge status={detail.processingStatus} />
            </>
          )}
        >
          <InvoiceDetailContent
            selectedId={selectedId}
            detail={detail}
            detailLoading={detailLoading}
            detailError={detailError}
            editMode={editMode}
            editFields={editFields}
            setEditFields={setEditFields}
            setEditMode={setEditMode}
            setSelectedId={(id) => {
              if (!id) handleBackToList();
              else setSelectedId(id);
            }}
            setShowRejectDialog={setShowRejectDialog}
            setRejectReason={setRejectReason}
            setShowErsatzbelegDialog={setShowErsatzbelegDialog}
            setShowEmailDialog={setShowEmailDialog}
            setEmailPrefill={setEmailPrefill}
            startEdit={startEdit}
            navigate={navigate}
            queryClient={queryClient}
            showCashDialog={showCashDialog}
            setShowCashDialog={setShowCashDialog}
            cashDate={cashDate}
            setCashDate={setCashDate}
            cashPaymentMutation={cashPaymentMutation}
            undoCashMutation={undoCashMutation}
            showCorrectionDialog={showCorrectionDialog}
            setShowCorrectionDialog={setShowCorrectionDialog}
            correctionNote={correctionNote}
            setCorrectionNote={setCorrectionNote}
            correctionMutation={correctionMutation}
            setRecurringMutation={setRecurringMutation}
            useSplitView
          />
        </InvoiceSplitView>
      </>
    );
  }

  return (
    <div className={isMobile ? '' : 'flex gap-6'}>
      {/* Upload dialog */}
      {showUpload && (
        <InvoiceUploadDialog
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
        <BelegFormDialog
          context={{
            mode: 'ersatzbeleg',
            originalInvoiceId: selectedId,
            originalBelegNr: detail.belegNr,
            originalVendorName: detail.vendorName,
          }}
          onClose={() => setShowErsatzbelegDialog(false)}
          onSuccess={(newInvoiceId) => {
            setShowErsatzbelegDialog(false);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
            if (newInvoiceId) setSelectedId(newInvoiceId);
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

      {/* Email dialog */}
      {showEmailDialog && selectedId && detail && (() => {
        const isOutgoing = detail.direction === 'OUTGOING';
        const recipientEmail = isOutgoing
          ? (detail as unknown as { customer?: { email?: string } }).customer?.email || ''
          : (detail as unknown as { vendor?: { email?: string } }).vendor?.email || '';
        const invNr = detail.invoiceNumber || `BEL-${String(detail.belegNr).padStart(3, '0')}`;
        const invDate = detail.invoiceDate ? new Date(detail.invoiceDate).toLocaleDateString('de-AT') : '';
        const amount = detail.grossAmount ? `${parseFloat(detail.grossAmount).toLocaleString('de-AT', { style: 'currency', currency: detail.currency || 'EUR' })}` : '';
        const dueDate = detail.dueDate ? new Date(detail.dueDate).toLocaleDateString('de-AT') : '';

        const defaultSubject = isOutgoing
          ? `Zahlungserinnerung — Rechnung ${invNr}`
          : `Rückfrage zu Rechnung ${invNr}`;

        const defaultBody = isOutgoing
          ? `Sehr geehrte Damen und Herren,

wir erlauben uns, Sie an die offene Rechnung ${invNr} vom ${invDate} über ${amount} hinzuweisen.${dueDate ? `\n\nZahlungsziel war der ${dueDate}. Wir bitten um umgehende Überweisung.` : ''}

Mit freundlichen Grüßen`
          : `Sehr geehrte Damen und Herren,

bezüglich Ihrer Rechnung ${invNr} vom ${invDate} über ${amount} möchten wir folgende Punkte klären:

[Hier Ihre Anmerkungen einfügen]

Mit freundlichen Grüßen`;

        return (
          <SendEmailDialog
            onClose={() => { setShowEmailDialog(false); setEmailPrefill(undefined); }}
            onSuccess={() => { setShowEmailDialog(false); setEmailPrefill(undefined); }}
            defaultTo={emailPrefill?.to || recipientEmail}
            defaultSubject={emailPrefill?.subject || defaultSubject}
            defaultBody={emailPrefill?.body || defaultBody}
            entityType="Invoice"
            entityId={selectedId}
          />
        );
      })()}

      {/* Main list */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-4 lg:mb-6">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Rechnungen</h1>
            <p className="text-gray-500 text-sm mt-1">
              {pagination ? `${pagination.total} Rechnungen` : 'Rechnungen hochladen, prüfen und verwalten'}
            </p>
          </div>
          {!isMobile && (
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary flex items-center gap-2 text-sm"
                disabled={ocrExportLoading}
                onClick={async () => {
                  setOcrExportLoading(true);
                  try {
                    const blob = await exportOcrCheckApi();
                    const dateStr = new Date().toISOString().split('T')[0];
                    downloadBlob(blob, `ocr-pruefexport-${dateStr}.csv`);
                  } catch {
                    alert('OCR-Export fehlgeschlagen');
                  } finally {
                    setOcrExportLoading(false);
                  }
                }}
              >
                {ocrExportLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                OCR-Export
              </button>
              <button className="btn-primary flex items-center gap-2" onClick={() => setShowUpload(true)}>
                <Upload size={18} />
                Hochladen
              </button>
            </div>
          )}
        </div>

        {/* Direction tabs + Filters */}
        <div className="card p-3 lg:p-4 mb-4">
          <div className="flex items-center gap-1 mb-3 border-b border-gray-200 pb-3 overflow-x-auto">
            {([
              { value: undefined, label: 'Alle' },
              { value: 'INCOMING' as const, label: 'Eingang' },
              { value: 'OUTGOING' as const, label: 'Ausgang' },
            ]).map((tab) => (
              <button
                key={tab.label}
                onClick={() => setFilters((f) => ({ ...f, direction: tab.value, overdue: undefined, recurring: undefined, page: 1 }))}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  !filters.overdue && !filters.recurring && filters.direction === tab.value
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => setFilters((f) => ({ ...f, overdue: true, recurring: undefined, direction: undefined, sortBy: 'dueDate', sortOrder: 'asc', page: 1 }))}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                filters.overdue
                  ? 'bg-red-100 text-red-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Clock size={14} />
              Überfällig
            </button>
            <button
              onClick={() => setFilters((f) => ({ ...f, recurring: true, overdue: undefined, direction: undefined, page: 1 }))}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                filters.recurring
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Repeat size={14} />
              Laufend
            </button>
          </div>

          {/* Mobile: search + filter icon */}
          {isMobile ? (
            <div className="flex gap-2">
              <form onSubmit={handleSearch} className="flex gap-2 flex-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Suche..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-field pl-9 !py-2.5 text-sm"
                    onBlur={() => { if (search) handleSearch(new Event('submit') as unknown as React.FormEvent); }}
                  />
                </div>
                <button type="submit" className="btn-secondary px-3">
                  <Search size={18} />
                </button>
              </form>
              <button
                onClick={() => setShowFilterSheet(true)}
                className={`btn-secondary px-3 ${filters.validationStatus || filters.processingStatus ? 'border-primary-300 text-primary-600' : ''}`}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
          ) : (
            /* Desktop: inline filters */
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
                <option value="REJECTED">Abgelehnt</option>
                <option value="ARCHIVED">Archiviert</option>
                <option value="RECONCILED">Abgeglichen</option>
                <option value="EXPORTED">Exportiert</option>
                <option value="ERROR">Fehler</option>
              </select>
            </div>
          )}
        </div>

        {/* Mobile filter bottom sheet */}
        {isMobile && (
          <BottomSheet isOpen={showFilterSheet} onClose={() => setShowFilterSheet(false)} title="Filter">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Validierung</label>
                <select
                  value={filters.validationStatus || ''}
                  onChange={(e) => { handleFilterChange('validationStatus', e.target.value); }}
                  className="input-field text-base"
                >
                  <option value="">Alle</option>
                  <option value="VALID">Gültig</option>
                  <option value="WARNING">Warnung</option>
                  <option value="INVALID">Ungültig</option>
                  <option value="PENDING">Ausstehend</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.processingStatus || ''}
                  onChange={(e) => { handleFilterChange('processingStatus', e.target.value); }}
                  className="input-field text-base"
                >
                  <option value="">Alle</option>
                  <option value="UPLOADED">Hochgeladen</option>
                  <option value="PROCESSING">In Verarbeitung</option>
                  <option value="PROCESSED">Verarbeitet</option>
                  <option value="REVIEW_REQUIRED">Review nötig</option>
                  <option value="REJECTED">Abgelehnt</option>
                  <option value="ARCHIVED">Archiviert</option>
                  <option value="RECONCILED">Abgeglichen</option>
                  <option value="EXPORTED">Exportiert</option>
                  <option value="ERROR">Fehler</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setFilters((f) => ({ ...f, validationStatus: undefined, processingStatus: undefined, page: 1 }));
                  setShowFilterSheet(false);
                }}
                className="btn-secondary w-full"
              >
                Filter zurücksetzen
              </button>
            </div>
          </BottomSheet>
        )}

        {/* Batch selection toolbar */}
        {selectedIds.size > 0 && (
          <div className="card p-3 mb-4 flex items-center gap-4 bg-primary-50 border-primary-200">
            <span className="text-sm font-medium text-primary-800">
              {selectedIds.size} ausgewählt
            </span>
            {(() => {
              const hasWarnings = invoices.some((inv) => selectedIds.has(inv.id) && (inv.validationStatus === 'WARNING' || inv.validationStatus === 'INVALID'));
              return (
                <button
                  onClick={() => hasWarnings ? setShowBatchApproveDialog(true) : batchApproveMutation.mutate({ ids: Array.from(selectedIds) })}
                  disabled={batchApproveMutation.isPending}
                  className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-4 bg-green-600 hover:bg-green-700"
                >
                  {batchApproveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                  Genehmigen & Archivieren
                  {hasWarnings && <AlertTriangle size={12} className="text-yellow-200" />}
                </button>
              );
            })()}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              Auswahl aufheben
            </button>
            {batchApproveMutation.isSuccess && batchApproveMutation.data?.data && (
              <span className="text-xs text-green-700">
                {batchApproveMutation.data.data.archived} archiviert
                {batchApproveMutation.data.data.skipped?.length > 0 && `, ${batchApproveMutation.data.data.skipped.length} übersprungen`}
              </span>
            )}
          </div>
        )}
        {showBatchApproveDialog && (
          <BatchApproveDialog
            count={selectedIds.size}
            hasWarnings={invoices.some((inv) => selectedIds.has(inv.id) && inv.validationStatus === 'WARNING')}
            hasInvalid={invoices.some((inv) => selectedIds.has(inv.id) && inv.validationStatus === 'INVALID')}
            isPending={batchApproveMutation.isPending}
            onConfirm={(comment) => batchApproveMutation.mutate({ ids: Array.from(selectedIds), comment })}
            onClose={() => setShowBatchApproveDialog(false)}
          />
        )}

        {/* Table / Card List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={32} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="card p-8 lg:p-12 text-center">
            <FileText className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Rechnungen gefunden</h3>
            <p className="text-gray-500 text-sm">Passe die Filter an oder lade eine neue Rechnung hoch.</p>
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            {isMobile ? (
              <div className="space-y-3">
                {invoices.map((inv) => {
                  const shadowColor =
                    inv.validationStatus === 'VALID' ? '#22c55e' :
                    inv.validationStatus === 'WARNING' ? '#f59e0b' :
                    inv.validationStatus === 'INVALID' ? '#ef4444' :
                    '#d1d5db';
                  return (
                    <div
                      key={inv.id}
                      className={`mobile-card ${selectedId === inv.id ? 'ring-2 ring-primary-300' : ''}`}
                      style={{ borderLeft: `4px solid ${shadowColor}` }}
                      onClick={() => { setSelectedId(inv.id); setEditMode(false); }}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <span className="font-mono text-xs font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                          {inv.archivalNumber || `BEL-${String(inv.belegNr).padStart(3, '0')}`}
                        </span>
                        <ValidationBadge status={inv.validationStatus} />
                      </div>
                      <div className="font-medium text-gray-900 truncate">
                        {inv.vendorName || <span className="text-gray-400 italic text-sm">Wird erkannt...</span>}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{inv.invoiceNumber || '—'}</span>
                          {inv.invoiceDate && <span>· {formatDate(inv.invoiceDate)}</span>}
                        </div>
                        <span className="font-semibold text-gray-900">
                          {inv.grossAmount ? formatCurrency(String(inv.grossAmount), inv.currency) : '—'}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        <ProcessingBadge status={inv.processingStatus} />
                        {inv.dueDate && (() => {
                          const due = new Date(inv.dueDate);
                          const now = new Date(); now.setHours(0,0,0,0);
                          const diff = Math.floor((now.getTime() - due.getTime()) / 86400000);
                          if (diff > 0 && !CLOSED_STATUSES.has(inv.processingStatus)) {
                            return <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1 py-0.5 rounded">{diff}d überfällig</span>;
                          }
                          return null;
                        })()}
                        {inv.direction === 'OUTGOING' && (
                          <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">Ausgang</span>
                        )}
                        <DocumentTypeBadge type={inv.documentType} />
                        {inv.isRecurring && (
                          <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1 py-0.5 rounded flex items-center gap-0.5">
                            <Repeat size={9} />
                            {RECURRING_INTERVALS[inv.recurringInterval as keyof typeof RECURRING_INTERVALS]?.label ?? 'Laufend'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
            /* Desktop table view */
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
                    <SortHeader label="Fällig" column="dueDate" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} />
                    <SortHeader label="Betrag" column="grossAmount" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} align="right" />
                    <SortHeader label="Validierung" column="validationStatus" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} align="center" />
                    <SortHeader label="Status" column="processingStatus" currentSort={filters.sortBy} currentOrder={filters.sortOrder} onSort={handleSort} align="center" />
                    <th className="px-4 py-3 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => {
                    const shadowColor =
                      inv.validationStatus === 'VALID' ? '#22c55e' :
                      inv.validationStatus === 'WARNING' ? '#f59e0b' :
                      inv.validationStatus === 'INVALID' ? '#ef4444' :
                      '#d1d5db';
                    return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedId === inv.id ? 'bg-primary-50' : ''} ${selectedIds.has(inv.id) ? 'bg-green-50' : ''}`}
                      style={{ boxShadow: `inset 4px 0 0 ${shadowColor}` }}
                      onClick={() => handleSelectInvoice(inv.id)}
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
                        {inv.archivalNumber ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                              <Lock size={10} />
                              {inv.archivalNumber}
                            </span>
                            <span className="font-mono text-[10px] text-gray-400">
                              BEL-{String(inv.belegNr).padStart(3, '0')}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                            BEL-{String(inv.belegNr).padStart(3, '0')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.vendorName ? (
                          <>
                            <div className="font-medium text-gray-900 truncate max-w-[200px]">{inv.vendorName}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs text-gray-400 truncate max-w-[160px]">{inv.originalFileName}</span>
                              {inv.direction === 'OUTGOING' && (
                                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">Ausgang</span>
                              )}
                              <DocumentTypeBadge type={inv.documentType} />
                              {inv.isRecurring && <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1 py-0.5 rounded">Laufend</span>}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-gray-400 truncate max-w-[200px] italic text-xs">{inv.originalFileName}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-gray-300">Lieferant wird erkannt...</span>
                              {inv.direction === 'OUTGOING' && (
                                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">Ausgang</span>
                              )}
                              <DocumentTypeBadge type={inv.documentType} />
                              {inv.isRecurring && <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1 py-0.5 rounded">Laufend</span>}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inv.invoiceNumber || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.invoiceDate ? formatDate(inv.invoiceDate) : '—'}</td>
                      <td className="px-4 py-3">
                        <DueDateCell dueDate={inv.dueDate} processingStatus={inv.processingStatus} />
                      </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

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

      {/* Detail panel — FullScreenPanel on mobile (with document/data tabs) */}
      {isMobile && (
        <FullScreenPanel
          isOpen={!!selectedId}
          onClose={() => { setSelectedId(null); setEditMode(false); setMobileTab('data'); }}
          title="Rechnungsdetails"
        >
          <div className="p-4">
            {/* Tab toggle: Daten | Dokument */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                onClick={() => setMobileTab('data')}
                className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
                  mobileTab === 'data'
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Daten
              </button>
              <button
                onClick={() => setMobileTab('doc')}
                className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
                  mobileTab === 'doc'
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Dokument
              </button>
            </div>

            {mobileTab === 'data' ? (
              selectedId && <InvoiceDetailContent
                selectedId={selectedId}
                detail={detail}
                detailLoading={detailLoading}
                detailError={detailError}
                editMode={editMode}
                editFields={editFields}
                setEditFields={setEditFields}
                setEditMode={setEditMode}
                setSelectedId={setSelectedId}
                setShowRejectDialog={setShowRejectDialog}
                setRejectReason={setRejectReason}
                setShowErsatzbelegDialog={setShowErsatzbelegDialog}
                setShowEmailDialog={setShowEmailDialog}
                setEmailPrefill={setEmailPrefill}
                startEdit={startEdit}
                navigate={navigate}
                queryClient={queryClient}
                showCashDialog={showCashDialog}
                setShowCashDialog={setShowCashDialog}
                cashDate={cashDate}
                setCashDate={setCashDate}
                cashPaymentMutation={cashPaymentMutation}
                undoCashMutation={undoCashMutation}
                showCorrectionDialog={showCorrectionDialog}
                setShowCorrectionDialog={setShowCorrectionDialog}
                correctionNote={correctionNote}
                setCorrectionNote={setCorrectionNote}
                correctionMutation={correctionMutation}
                setRecurringMutation={setRecurringMutation}
              />
            ) : (
              selectedId && (
                <DocumentViewer
                  invoiceId={selectedId}
                  mimeType={detail?.mimeType}
                  originalFileName={detail?.originalFileName}
                  className="h-[calc(100vh-180px)] rounded-lg"
                />
              )
            )}
          </div>
        </FullScreenPanel>
      )}

      {/* Mobile FAB for upload */}
      {isMobile && (
        <button
          onClick={() => setShowUpload(true)}
          className="fixed bottom-[88px] right-4 z-30 w-14 h-14 rounded-full bg-primary-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Rechnung hochladen"
        >
          <Upload size={24} />
        </button>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

/** Shared detail content — used by both inline desktop panel and mobile FullScreenPanel */
function InvoiceDetailContent({
  selectedId, detail, detailLoading, detailError,
  editMode, editFields, setEditFields, setEditMode, setSelectedId,
  setShowRejectDialog, setRejectReason, setShowErsatzbelegDialog, setShowEmailDialog,
  setEmailPrefill,
  startEdit, navigate, queryClient,
  showCashDialog, setShowCashDialog, cashDate, setCashDate, cashPaymentMutation, undoCashMutation,
  showCorrectionDialog, setShowCorrectionDialog, correctionNote, setCorrectionNote, correctionMutation,
  setRecurringMutation,
  useSplitView = false,
}: {
  selectedId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any;
  detailLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detailError: any;
  editMode: boolean;
  editFields: Record<string, unknown>;
  setEditFields: (f: Record<string, unknown>) => void;
  setEditMode: (v: boolean) => void;
  setSelectedId: (v: string | null) => void;
  setShowRejectDialog: (v: boolean) => void;
  setRejectReason: (v: string) => void;
  setShowErsatzbelegDialog: (v: boolean) => void;
  setShowEmailDialog: (v: boolean) => void;
  setEmailPrefill: (v: { to?: string; subject?: string; body?: string } | undefined) => void;
  startEdit: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: any;
  showCashDialog: boolean;
  setShowCashDialog: (v: boolean) => void;
  cashDate: string;
  setCashDate: (v: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cashPaymentMutation: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  undoCashMutation: any;
  showCorrectionDialog: boolean;
  setShowCorrectionDialog: (v: boolean) => void;
  correctionNote: string;
  setCorrectionNote: (v: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  correctionMutation: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRecurringMutation: any;
  useSplitView?: boolean;
}) {
  if (detailLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-primary-600" size={24} />
      </div>
    );
  }
  if (detailError) {
    return (
      <div className="text-center py-8">
        <XCircle size={24} className="mx-auto text-red-400 mb-2" />
        <p className="text-red-600 text-sm">Fehler beim Laden</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p>Keine Details verfügbar</p>
      </div>
    );
  }

  // Validation checks for per-field coloring in split view
  const checks: ValidationCheck[] = detail.validationResult?.checks ?? [];

  return (
    <div className="space-y-4 text-sm">
      {/* Header badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {detail.archivalNumber ? (
          <span className="font-mono text-sm font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded inline-flex items-center gap-1">
            <Lock size={12} />
            {detail.archivalNumber}
          </span>
        ) : (
          <span className="font-mono text-sm font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
            BEL-{String(detail.belegNr).padStart(3, '0')}
          </span>
        )}
        <ValidationBadge status={detail.validationStatus} />
        <ProcessingBadge status={detail.processingStatus} />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2">
        {!editMode && detail.extractedData && !detail.isLocked && (
          <button onClick={startEdit} className="btn-secondary text-sm flex items-center gap-1.5 py-2 px-3">
            <Edit3 size={14} />
            Bearbeiten
          </button>
        )}
        <DownloadButton invoiceId={selectedId} replacesInvoiceId={detail.replacesInvoiceId} />
      </div>

      {/* Processing progress bar */}
      {(detail.processingStatus === 'UPLOADED' || detail.processingStatus === 'PROCESSING' || detail.processingStatus === 'ERROR') && (
        <ProcessingProgress status={detail.processingStatus} error={(detail as unknown as { processingError?: string }).processingError} />
      )}

      {/* Ersatzbeleg reference */}
      {detail.documentType === 'CREDIT_NOTE' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-purple-800">
            <MinusCircle size={16} />
            Gutschrift / Stornorechnung
          </div>
          <p className="text-xs text-purple-600 mt-1">
            Wird als GS archiviert. Betrag wird bei Matching als Rückerstattung behandelt.
          </p>
        </div>
      )}
      {detail.documentType === 'ADVANCE_PAYMENT' && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-teal-800">
            <Banknote size={16} />
            Anzahlungsrechnung
          </div>
          <p className="text-xs text-teal-600 mt-1">
            Wird als AZ archiviert. Teilzahlung — Restbetrag folgt mit Schlussrechnung.
          </p>
        </div>
      )}
      {detail.documentType === 'ERSATZBELEG' && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-orange-800">
            <FilePlus2 size={16} />
            Ersatzbeleg
          </div>
          {detail.replacesBelegNr && (
            <p className="text-xs text-orange-600 mt-1">
              Ersetzt Original: <span className="font-mono font-bold">BEL-{String(detail.replacesBelegNr).padStart(3, '0')}</span>
            </p>
          )}
          {detail.ersatzReason && (
            <p className="text-xs text-orange-600 mt-1">Grund: {detail.ersatzReason}</p>
          )}
        </div>
      )}

      {/* Replaced by notice */}
      {detail.processingStatus === 'REPLACED' && (
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <ArrowRight size={16} />
            Ersetzt durch Ersatzbeleg
          </div>
          {detail.replacedByBelegNr && (
            <p className="text-xs text-gray-500 mt-1">
              Ersatzbeleg: <span className="font-mono font-bold">BEL-{String(detail.replacedByBelegNr).padStart(3, '0')}</span>
            </p>
          )}
        </div>
      )}

      {/* Direction info */}
      {detail.direction === 'OUTGOING' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
            <Upload size={16} />
            Ausgangsrechnung
          </div>
          <p className="text-xs text-blue-600 mt-1">Ihr Unternehmen ist der Rechnungsaussteller</p>
        </div>
      )}

      {/* Archival info */}
      {detail.archivalNumber && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-green-800">
            <Archive size={16} />
            Archiviert
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-green-700">
            <p className="font-mono font-bold">{detail.archivalNumber}</p>
            {detail.archivedAt && (
              <p>Archiviert am: {new Date(detail.archivedAt).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            )}
          </div>
          {detail.approvalComment && (
            <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
              <span className="font-medium">Anmerkung:</span> {detail.approvalComment}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ArchiveDownloadBtn invoiceId={selectedId} variant="archived" />
            <ArchiveDownloadBtn invoiceId={selectedId} variant="original" />
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editMode ? (
        <EditForm
          fields={editFields}
          setFields={setEditFields}
          invoiceId={selectedId}
          replacesInvoiceId={detail.replacesInvoiceId}
          onCancel={() => setEditMode(false)}
          onSaved={() => {
            setEditMode(false);
            queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      ) : (
        <>
          {/* Vendor/Customer */}
          <div>
            <h3 className="font-medium text-gray-900 mb-2">{detail.direction === 'OUTGOING' ? 'Kunde' : 'Lieferant'}</h3>
            <dl className="space-y-1">
              {useSplitView && checks.length > 0 ? (
                <>
                  <ValidatedField
                    label="Name"
                    value={detail.direction === 'OUTGOING' ? detail.customerName : detail.vendorName}
                    fieldName={detail.direction === 'OUTGOING' ? 'recipientName' : 'issuerName'}
                    checks={checks}
                  />
                  <ValidatedField
                    label="UID"
                    value={detail.direction === 'OUTGOING' ? detail.recipientUid : detail.vendorUid}
                    fieldName={detail.direction === 'OUTGOING' ? 'recipientUid' : 'issuerUid'}
                    checks={checks}
                  />
                  {detail.extractedData?.issuerAddress && (
                    <ValidatedField
                      label="Adresse"
                      value={
                        typeof detail.extractedData.issuerAddress === 'object'
                          ? [
                              (detail.extractedData.issuerAddress as Record<string, string>).street,
                              `${(detail.extractedData.issuerAddress as Record<string, string>).zip ?? ''} ${(detail.extractedData.issuerAddress as Record<string, string>).city ?? ''}`.trim(),
                              (detail.extractedData.issuerAddress as Record<string, string>).country,
                            ].filter(Boolean).join(', ')
                          : String(detail.extractedData.issuerAddress)
                      }
                      fieldName="issuerAddress"
                      checks={checks}
                    />
                  )}
                  {detail.extractedData?.issuerIban && (
                    <ValidatedField
                      label="IBAN"
                      value={detail.extractedData.issuerIban}
                      fieldName="issuerIban"
                      checks={checks}
                    />
                  )}
                  <DetailRow label="Kategorie" value={detail.category} />
                  {detail.vendorId && (
                    <div className="flex justify-between text-sm py-1.5 px-2">
                      <dt className="text-gray-500">Lieferant</dt>
                      <dd>
                        <button
                          onClick={() => navigate(`/vendors?selected=${detail.vendorId}`)}
                          className="text-primary-600 hover:underline text-xs"
                        >
                          Details &rarr;
                        </button>
                      </dd>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {detail.direction === 'OUTGOING' && detail.customerName ? (
                    <div className="flex justify-between text-sm">
                      <dt className="text-gray-500">Name</dt>
                      <dd className="text-right">
                        {detail.customerId ? (
                          <button
                            onClick={() => navigate(`/customers?selected=${detail.customerId}`)}
                            className="text-primary-600 hover:underline font-medium"
                          >
                            {detail.customerName}
                          </button>
                        ) : (
                          <span>{detail.customerName}</span>
                        )}
                      </dd>
                    </div>
                  ) : (
                    <DetailRow label="Name" value={detail.vendorName} />
                  )}
                  <DetailRow label="UID" value={detail.direction === 'OUTGOING' ? detail.recipientUid : detail.vendorUid} />
                  <DetailRow label="Kategorie" value={detail.category} />
                </>
              )}
            </dl>
          </div>

          {/* Invoice info */}
          <div className="border-t pt-4">
            <h3 className="font-medium text-gray-900 mb-2">Rechnung</h3>
            <dl className="space-y-1">
              {useSplitView && checks.length > 0 ? (
                <>
                  <ValidatedField label="Nummer" value={detail.invoiceNumber} fieldName="invoiceNumber" checks={checks} />
                  <ValidatedField label="Datum" value={detail.invoiceDate ? formatDate(detail.invoiceDate) : null} fieldName="invoiceDate" checks={checks} />
                  <ValidatedField label="Lieferdatum" value={detail.deliveryDate ? formatDate(detail.deliveryDate) : null} fieldName="deliveryDate" checks={checks} />
                  <DetailRow label="Fällig" value={detail.dueDate ? formatDate(detail.dueDate) : null} />
                  <DetailRow label="Datei" value={detail.originalFileName} />
                </>
              ) : (
                <>
                  <DetailRow label="Nummer" value={detail.invoiceNumber} />
                  <DetailRow label="Datum" value={detail.invoiceDate ? formatDate(detail.invoiceDate) : null} />
                  <DetailRow label="Fällig" value={detail.dueDate ? formatDate(detail.dueDate) : null} />
                  <DetailRow label="Datei" value={detail.originalFileName} />
                </>
              )}
            </dl>
            {!useSplitView && <ViewOriginalButton invoiceId={selectedId} replacesInvoiceId={detail.replacesInvoiceId} />}
          </div>

          {/* Description — only in split view (validated field) */}
          {useSplitView && checks.length > 0 && detail.extractedData?.description && (
            <div className="border-t pt-4">
              <h3 className="font-medium text-gray-900 mb-2">Leistung</h3>
              <ValidatedField
                label="Beschreibung"
                value={detail.extractedData.description}
                fieldName="description"
                checks={checks}
              />
            </div>
          )}

          {/* Amounts */}
          <div className="border-t pt-4">
            <h3 className="font-medium text-gray-900 mb-2">Beträge</h3>
            <dl className="space-y-1">
              {useSplitView && checks.length > 0 ? (
                <>
                  {Array.isArray(detail.vatBreakdown) && detail.vatBreakdown.length > 1 ? (
                    <>
                      {(detail.vatBreakdown as Array<{ rate: number; netAmount: number; vatAmount: number }>).map((line, i) => (
                        <div key={i} className="flex justify-between text-sm py-1.5 px-2">
                          <dt className="text-gray-500">Netto ({line.rate}%)</dt>
                          <dd className="flex gap-4">
                            <span>{formatCurrency(line.netAmount, detail.currency)}</span>
                            <span className="text-gray-400">USt {formatCurrency(line.vatAmount, detail.currency)}</span>
                          </dd>
                        </div>
                      ))}
                      <div className="border-t border-dashed my-1" />
                    </>
                  ) : null}
                  <ValidatedField label="Netto" value={detail.netAmount ? formatCurrency(detail.netAmount, detail.currency) : null} fieldName="netAmount" checks={checks} />
                  <ValidatedField label={`USt-Satz`} value={detail.vatRate != null ? `${detail.vatRate}%` : null} fieldName="vatRate" checks={checks} />
                  <ValidatedField label="USt-Betrag" value={detail.vatAmount ? formatCurrency(detail.vatAmount, detail.currency) : null} fieldName="vatAmount" checks={checks} />
                  <ValidatedField label="Brutto" value={detail.grossAmount ? formatCurrency(detail.grossAmount, detail.currency) : null} fieldName="grossAmount" checks={checks} className="font-semibold" />
                  {detail.privatePercent != null && detail.privatePercent > 0 && detail.grossAmount && (
                    <div className="flex justify-between text-sm py-1.5 px-2 bg-gray-50 rounded-r border-l-2 border-gray-300">
                      <dt className="text-gray-500">Betrieblich ({100 - detail.privatePercent}%)</dt>
                      <dd className="font-medium text-gray-900">
                        {formatCurrency((1 - detail.privatePercent / 100) * parseFloat(detail.grossAmount), detail.currency)}
                      </dd>
                    </div>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </dl>
          </div>

          {/* Validation */}
          {detail.validationResult && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Scale size={16} className="text-gray-500" />
                <h3 className="font-medium text-gray-900">Prüfprotokoll</h3>
                <TrafficLight status={detail.validationResult.overallStatus as TrafficLightStatus} />
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
                      {check.legalBasis && <span className="text-gray-400 ml-1">({check.legalBasis})</span>}
                    </div>
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

          {/* Action buttons */}
          {detail.processingStatus !== 'ARCHIVED' && detail.processingStatus !== 'RECONCILED' && detail.processingStatus !== 'EXPORTED' && detail.processingStatus !== 'UPLOADED' && detail.processingStatus !== 'PROCESSING' && detail.processingStatus !== 'REPLACED' && detail.processingStatus !== 'REJECTED' && detail.processingStatus !== 'PARKED' && detail.processingStatus !== 'PENDING_CORRECTION' && (
            <div className="border-t pt-4 flex gap-2">
              <ApproveButton
                invoiceId={selectedId}
                validationStatus={detail.validationStatus}
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

          {/* Correction request button (PROCESSED / REVIEW_REQUIRED) */}
          {(detail.processingStatus === 'PROCESSED' || detail.processingStatus === 'REVIEW_REQUIRED') && (
            <div className="border-t pt-4">
              <button
                onClick={() => { setCorrectionNote(''); setShowCorrectionDialog(true); }}
                className="btn-secondary flex items-center gap-2 text-sm w-full justify-center text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <Edit3 size={16} />
                Korrektur anfordern
              </button>
            </div>
          )}

          {/* Correction request dialog */}
          {showCorrectionDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
                <h3 className="text-lg font-semibold mb-2">Korrektur anfordern</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Die Rechnung wird auf &quot;Wartet auf Korrektur&quot; gesetzt. Beschreiben Sie, was korrigiert werden soll.
                </p>
                <textarea
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  placeholder="z.B. UID-Nummer fehlt, Rechnungsdatum falsch..."
                  className="input-field w-full mb-4 h-24 resize-none"
                  maxLength={2000}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCorrectionDialog(false)} className="btn-secondary text-sm">Abbrechen</button>
                  <button
                    onClick={() => correctionMutation.mutate({ id: selectedId!, note: correctionNote })}
                    disabled={!correctionNote.trim() || correctionMutation.isPending}
                    className="btn-primary text-sm"
                  >
                    {correctionMutation.isPending ? 'Wird gespeichert...' : 'Korrektur anfordern'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PENDING_CORRECTION info */}
          {detail.processingStatus === 'PENDING_CORRECTION' && (
            <div className="border-t pt-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">Wartet auf korrigierte Rechnung</span>
                </div>
                {detail.correctionNote && (
                  <p className="text-xs text-amber-700 mt-1">{detail.correctionNote}</p>
                )}
                {detail.correctionRequestedAt && (
                  <p className="text-xs text-amber-500 mt-1">
                    Angefordert am {new Date(detail.correctionRequestedAt).toLocaleDateString('de-AT')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cash payment section */}
          <div className="border-t pt-4">
            {detail.paymentMethod === 'CASH' ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                <Banknote size={16} className="text-green-600" />
                <span className="text-sm text-green-700 font-medium">
                  Bar bezahlt {detail.cashPaymentDate ? `am ${formatDate(detail.cashPaymentDate)}` : ''}
                </span>
                <button
                  onClick={() => undoCashMutation.mutate(detail.id)}
                  className="ml-auto text-xs text-gray-500 hover:text-red-600 underline"
                  disabled={undoCashMutation.isPending}
                >
                  {undoCashMutation.isPending ? 'Wird rückgängig...' : 'Rückgängig'}
                </button>
              </div>
            ) : (['PROCESSED', 'REVIEW_REQUIRED', 'ARCHIVED'].includes(detail.processingStatus)) && (
              <button
                onClick={() => { setCashDate(new Date().toISOString().slice(0, 10)); setShowCashDialog(true); }}
                className="btn-secondary flex items-center gap-2 text-sm w-full justify-center"
              >
                <Banknote size={16} />
                Bar bezahlt
              </button>
            )}
          </div>

          {/* Cash payment dialog */}
          {showCashDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
                <h3 className="text-lg font-semibold mb-4">Barzahlung bestätigen</h3>
                <label className="block text-sm text-gray-600 mb-1">Zahlungsdatum</label>
                <input
                  type="date"
                  value={cashDate}
                  onChange={(e) => setCashDate(e.target.value)}
                  className="input-field w-full mb-4"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCashDialog(false)} className="btn-secondary text-sm">Abbrechen</button>
                  <button
                    onClick={() => cashPaymentMutation.mutate({ id: selectedId!, date: cashDate })}
                    disabled={!cashDate || cashPaymentMutation.isPending}
                    className="btn-primary text-sm"
                  >
                    {cashPaymentMutation.isPending ? 'Speichere...' : 'Bestätigen'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recurring toggle */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat size={16} className={detail.isRecurring ? 'text-purple-600' : 'text-gray-400'} />
                <span className="text-sm font-medium">Laufende Kosten</span>
              </div>
              <button
                onClick={() => setRecurringMutation.mutate({
                  id: detail.id,
                  data: {
                    isRecurring: !detail.isRecurring,
                    recurringInterval: !detail.isRecurring ? 'MONTHLY' : null,
                  },
                })}
                disabled={setRecurringMutation.isPending}
                className={`relative w-11 h-6 rounded-full transition-colors ${detail.isRecurring ? 'bg-purple-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${detail.isRecurring ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {detail.isRecurring && (
              <div className="mt-3 space-y-2">
                <select
                  value={detail.recurringInterval ?? 'MONTHLY'}
                  onChange={(e) => setRecurringMutation.mutate({
                    id: detail.id,
                    data: {
                      isRecurring: true,
                      recurringInterval: e.target.value as RecurringIntervalType,
                      recurringNote: detail.recurringNote,
                    },
                  })}
                  className="input-field text-sm w-full"
                >
                  {Object.entries(RECURRING_INTERVALS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Notiz (z.B. Monatliche Miete)"
                  defaultValue={detail.recurringNote ?? ''}
                  onBlur={(e) => {
                    if (e.target.value !== (detail.recurringNote ?? '')) {
                      setRecurringMutation.mutate({
                        id: detail.id,
                        data: {
                          isRecurring: true,
                          recurringInterval: detail.recurringInterval as RecurringIntervalType,
                          recurringNote: e.target.value || null,
                        },
                      });
                    }
                  }}
                  className="input-field text-sm w-full"
                />
              </div>
            )}
          </div>

          {/* Park / Unpark */}
          {detail.processingStatus !== 'ARCHIVED' && detail.processingStatus !== 'EXPORTED' && detail.processingStatus !== 'UPLOADED' && detail.processingStatus !== 'PROCESSING' && detail.processingStatus !== 'REPLACED' && (
            <div className="border-t pt-4">
              {detail.processingStatus === 'PARKED' ? (
                <UnparkButton
                  invoiceId={selectedId}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['invoices'] });
                    queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
                  }}
                />
              ) : (
                <ParkButton
                  invoiceId={selectedId}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['invoices'] });
                    queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] });
                  }}
                />
              )}
            </div>
          )}

          {/* Correction Mail */}
          {detail.validationStatus !== 'VALID' && detail.processingStatus !== 'UPLOADED' && detail.processingStatus !== 'PROCESSING' && (
            <div className="border-t pt-4">
              <CorrectionMailButton
                invoiceId={selectedId}
                vendorEmail={(detail as unknown as { vendor?: { email?: string } }).vendor?.email}
                onOpenEmailDialog={(prefill) => {
                  setEmailPrefill(prefill);
                  setShowEmailDialog(true);
                }}
              />
            </div>
          )}

          {/* Ersatzbeleg */}
          {(detail.processingStatus === 'ERROR' || detail.processingStatus === 'REVIEW_REQUIRED' || detail.processingStatus === 'PROCESSED' || detail.processingStatus === 'REJECTED') &&
           !detail.replacedByInvoiceId && (
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

          {/* E-Mail */}
          {detail.processingStatus !== 'UPLOADED' && detail.processingStatus !== 'PROCESSING' && (
            <div className="border-t pt-4">
              <button
                onClick={() => setShowEmailDialog(true)}
                className="btn-secondary flex items-center gap-1.5 text-sm w-full justify-center"
              >
                <Mail size={14} />
                E-Mail senden
              </button>
            </div>
          )}

          {/* Delete — allowed for all non-archived/reconciled/exported invoices */}
          {!['ARCHIVED', 'RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'EXPORTED'].includes(detail.processingStatus) && (
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
  );
}


function EditForm({
  fields, setFields, invoiceId, replacesInvoiceId, onCancel, onSaved,
}: {
  fields: Record<string, unknown>;
  setFields: (f: Record<string, unknown>) => void;
  invoiceId: string;
  replacesInvoiceId?: string | null;
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
      <ViewOriginalButton invoiceId={invoiceId} replacesInvoiceId={replacesInvoiceId} />
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
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Konto</label>
          <AccountSelector
            value={(fields.accountNumber as string) || null}
            onChange={(val) => setFields({ ...fields, accountNumber: val || '' })}
          />
        </div>
      </div>
      {field('Kategorie', 'category')}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Privatanteil %</label>
        <input
          type="number"
          min="0"
          max="100"
          value={(fields.privatePercent as number) ?? ''}
          onChange={(e) => setFields({ ...fields, privatePercent: e.target.value ? parseInt(e.target.value) : null })}
          placeholder="0"
          className="input-field !py-1.5 text-sm w-full"
        />
        {(fields.privatePercent as number) != null && (fields.privatePercent as number) > 0 && (fields.grossAmount as string) && (
          <p className="text-xs text-gray-500 mt-1">
            Betrieblich: {((1 - (fields.privatePercent as number) / 100) * parseFloat(fields.grossAmount as string)).toFixed(2)} EUR
            ({100 - (fields.privatePercent as number)}% von {parseFloat(fields.grossAmount as string).toFixed(2)} EUR)
          </p>
        )}
      </div>

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

function ApproveButton({ invoiceId, validationStatus, onSuccess }: { invoiceId: string; validationStatus: string; onSuccess: () => void }) {
  const [done, setDone] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const needsComment = validationStatus === 'WARNING' || validationStatus === 'INVALID';

  const mutation = useMutation({
    mutationFn: (comment?: string | null) => approveInvoiceApi(invoiceId, comment),
    onSuccess: () => {
      setDone(true);
      setShowDialog(false);
      onSuccess();
      setTimeout(() => setDone(false), 2000);
    },
  });

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-sm flex-1 justify-center py-2 bg-green-100 text-green-700 rounded-lg font-medium">
        <CheckCircle size={14} />
        Archiviert!
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => needsComment ? setShowDialog(true) : mutation.mutate(undefined)}
        disabled={mutation.isPending}
        className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center bg-green-600 hover:bg-green-700"
      >
        {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
        Genehmigen & Archivieren
      </button>
      {showDialog && (
        <ApproveDialog
          validationStatus={validationStatus}
          isPending={mutation.isPending}
          error={mutation.isError ? 'Fehler beim Archivieren' : null}
          onConfirm={(comment) => mutation.mutate(comment)}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}

function ApproveDialog({
  validationStatus, isPending, error, onConfirm, onClose,
}: {
  validationStatus: string; isPending: boolean; error: string | null;
  onConfirm: (comment?: string | null) => void; onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const isInvalid = validationStatus === 'INVALID';
  const canConfirm = isInvalid ? comment.trim().length > 0 : true;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className={isInvalid ? 'text-red-500' : 'text-yellow-500'} />
          <h2 className="text-lg font-semibold">
            {isInvalid ? 'Ungültige Rechnung genehmigen?' : 'Rechnung mit Warnung genehmigen?'}
          </h2>
        </div>

        <div className={`rounded-lg p-3 mb-4 text-sm ${isInvalid ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
          {isInvalid
            ? 'Diese Rechnung hat Validierungsfehler. Bitte begründen Sie, warum sie trotzdem genehmigt werden soll.'
            : 'Diese Rechnung hat Warnungen. Sie können optional eine Anmerkung hinzufügen.'}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Anmerkung {isInvalid ? '*' : '(optional)'}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={isInvalid ? 'Begründung eingeben...' : 'z.B. Betrag geringfügig abweichend, manuell geprüft'}
            className="input-field min-h-[80px] text-sm"
            maxLength={2000}
          />
          {comment.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{comment.length}/2000</p>
          )}
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(comment.trim() || null)}
            disabled={!canConfirm || isPending}
            className={`btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center ${isInvalid ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
            Trotzdem genehmigen
          </button>
          <button onClick={onClose} className="btn-secondary text-sm px-4">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

function BatchApproveDialog({
  count, hasWarnings, hasInvalid, isPending, onConfirm, onClose,
}: {
  count: number; hasWarnings: boolean; hasInvalid: boolean; isPending: boolean;
  onConfirm: (comment?: string | null) => void; onClose: () => void;
}) {
  const [comment, setComment] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className={hasInvalid ? 'text-red-500' : 'text-yellow-500'} />
          <h2 className="text-lg font-semibold">{count} Rechnungen genehmigen</h2>
        </div>

        <div className={`rounded-lg p-3 mb-4 text-sm ${hasInvalid ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
          Einige der ausgewählten Rechnungen haben {hasInvalid ? 'Validierungsfehler' : 'Warnungen'}.
          {hasInvalid
            ? ' Bitte begründen Sie die Sammelgenehmigung.'
            : ' Sie können optional eine Anmerkung hinzufügen.'}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Anmerkung {hasInvalid ? '*' : '(optional)'}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Begründung für die Sammelgenehmigung..."
            className="input-field min-h-[80px] text-sm"
            maxLength={2000}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(comment.trim() || null)}
            disabled={isPending || (hasInvalid && !comment.trim())}
            className={`btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center ${hasInvalid ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
            {count} Rechnungen genehmigen
          </button>
          <button onClick={onClose} className="btn-secondary text-sm px-4">Abbrechen</button>
        </div>
      </div>
    </div>
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

function ArchiveDownloadBtn({ invoiceId, variant }: { invoiceId: string; variant: 'archived' | 'original' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isOriginal = variant === 'original';
  async function handleClick() {
    setLoading(true);
    setError(false);
    try {
      const resp = await getInvoiceDownloadUrl(invoiceId, isOriginal);
      if (resp.data?.url) window.open(resp.data.url, '_blank');
    } catch {
      setError(true);
    }
    setLoading(false);
  }
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded border transition-colors ${
        error
          ? 'border-red-200 text-red-500 bg-red-50'
          : isOriginal
            ? 'border-green-300 text-green-700 hover:bg-green-100'
            : 'border-green-400 text-green-800 bg-green-100 hover:bg-green-200 font-medium'
      }`}
      title={error ? 'Datei nicht verfügbar' : undefined}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : isOriginal ? <Eye size={12} /> : <Download size={12} />}
      {error ? 'Nicht verfügbar' : isOriginal ? 'Original' : 'Archiv-PDF'}
    </button>
  );
}

function ViewOriginalButton({ invoiceId, replacesInvoiceId }: { invoiceId: string; replacesInvoiceId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // For Ersatzbelege: download the original invoice's file
  const fileInvoiceId = replacesInvoiceId || invoiceId;
  async function handleView() {
    setLoading(true);
    setError(null);
    try {
      // Always request the original (unstamped) version
      const resp = await getInvoiceDownloadUrl(fileInvoiceId, true);
      if (resp.data?.url) window.open(resp.data.url, '_blank');
    } catch {
      setError('Datei nicht verfügbar');
    }
    setLoading(false);
  }
  return (
    <div>
      <button
        onClick={handleView}
        disabled={loading}
        className="mt-3 w-full btn-secondary flex items-center justify-center gap-2 text-sm py-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
        Original anzeigen
      </button>
      {error && <p className="text-xs text-red-500 mt-1 text-center">{error}</p>}
    </div>
  );
}

function DownloadButton({ invoiceId, replacesInvoiceId }: { invoiceId: string; replacesInvoiceId?: string | null }) {
  const [loading, setLoading] = useState(false);
  // For Ersatzbelege: download the original invoice's file
  const fileInvoiceId = replacesInvoiceId || invoiceId;
  async function handleDownload() {
    setLoading(true);
    try {
      // Default: returns archived (stamped) version if available, otherwise original
      const resp = await getInvoiceDownloadUrl(fileInvoiceId);
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
    REJECTED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Abgelehnt' },
    INBOX: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Eingang' },
    PENDING_CORRECTION: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Wartet auf Korrektur' },
    PARKED: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Geparkt' },
    ARCHIVED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Archiviert' },
    RECONCILED: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Abgeglichen' },
    RECONCILED_WITH_DIFFERENCE: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Abgeglichen (Differenz)' },
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

const CLOSED_STATUSES = new Set(['RECONCILED', 'RECONCILED_WITH_DIFFERENCE', 'ARCHIVED', 'EXPORTED', 'REJECTED', 'ERROR', 'REPLACED']);

function DocumentTypeBadge({ type }: { type: string }) {
  switch (type) {
    case 'CREDIT_NOTE':
      return <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1 py-0.5 rounded">Gutschrift</span>;
    case 'ADVANCE_PAYMENT':
      return <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-1 py-0.5 rounded">Anzahlung</span>;
    case 'ERSATZBELEG':
      return <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1 py-0.5 rounded">Ersatzbeleg</span>;
    default:
      return null;
  }
}

function DueDateCell({ dueDate, processingStatus }: { dueDate: string | null; processingStatus: string }) {
  if (!dueDate) return <span className="text-gray-300">—</span>;
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  const isClosed = CLOSED_STATUSES.has(processingStatus);

  if (diffDays > 0 && !isClosed) {
    return (
      <div>
        <div className="text-gray-600 text-sm">{formatDate(dueDate)}</div>
        <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
          {diffDays}d überfällig
        </span>
      </div>
    );
  }

  if (diffDays <= 0 && diffDays >= -3 && !isClosed) {
    return (
      <div>
        <div className="text-gray-600 text-sm">{formatDate(dueDate)}</div>
        <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
          {diffDays === 0 ? 'Heute fällig' : `in ${Math.abs(diffDays)}d`}
        </span>
      </div>
    );
  }

  return <span className="text-gray-600 text-sm">{formatDate(dueDate)}</span>;
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

function ParkButton({ invoiceId, onSuccess }: { invoiceId: string; onSuccess: () => void }) {
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePark = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await parkInvoiceApi(invoiceId, reason);
      setShowDialog(false);
      onSuccess();
    } catch {
      alert('Parken fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  if (!showDialog) {
    return (
      <button
        className="btn-secondary flex items-center gap-1.5 text-sm w-full justify-center text-gray-600"
        onClick={() => setShowDialog(true)}
      >
        <PauseCircle size={14} />
        Parken
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Rechnung parken</p>
      <textarea
        className="input-field text-sm"
        rows={2}
        placeholder="Grund für das Parken..."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2">
        <button className="btn-primary text-sm flex-1" onClick={handlePark} disabled={!reason.trim() || loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Parken'}
        </button>
        <button className="btn-secondary text-sm" onClick={() => setShowDialog(false)}>Abbrechen</button>
      </div>
    </div>
  );
}

function UnparkButton({ invoiceId, onSuccess }: { invoiceId: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleUnpark = async () => {
    setLoading(true);
    try {
      await unparkInvoiceApi(invoiceId);
      onSuccess();
    } catch {
      alert('Fortsetzen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="btn-primary flex items-center gap-1.5 text-sm w-full justify-center"
      onClick={handleUnpark}
      disabled={loading}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      Fortsetzen (Entparken)
    </button>
  );
}

function CorrectionMailButton({
  invoiceId,
  vendorEmail,
  onOpenEmailDialog,
}: {
  invoiceId: string;
  vendorEmail?: string;
  onOpenEmailDialog: (prefill: { to?: string; subject?: string; body?: string }) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await generateCorrectionEmailApi(invoiceId);
      onOpenEmailDialog({
        to: result.data?.to || vendorEmail || '',
        subject: result.data?.subject || '',
        body: result.data?.body || '',
      });
    } catch {
      // Fallback: open email dialog with default values
      onOpenEmailDialog({ to: vendorEmail || '' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="btn-secondary flex items-center gap-1.5 text-sm w-full justify-center text-orange-600 hover:text-orange-700 hover:border-orange-300"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
      Korrektur-Mail
    </button>
  );
}
