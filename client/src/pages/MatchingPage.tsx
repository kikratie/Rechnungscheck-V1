import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMonthlyReconciliationApi, runMatchingApi, confirmMatchingApi, rejectMatchingApi,
  deleteMatchingApi, createManualMatchingApi, listMatchingsApi,
} from '../api/matchings';
import { listBankStatementsApi, getBankStatementApi } from '../api/bankStatements';
import { apiClient } from '../api/client';
import type {
  ReconciliationMatchedItem, ReconciliationUnmatchedTransaction,
  ReconciliationUnmatchedInvoice,
} from '@buchungsai/shared';
import {
  ArrowLeftRight, Loader2, CheckCircle, Clock, FileText, Building2,
  Check, X, RefreshCw, Plus, Trash2, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, AlertTriangle, Receipt, ChevronDown, Upload, FilePlus2,
} from 'lucide-react';
import { InvoiceUploadDialog } from '../components/InvoiceUploadDialog';
import { BelegFormDialog } from '../components/BelegFormDialog';

// ============================================================
// Main Page
// ============================================================

export function MatchingPage() {
  const queryClient = useQueryClient();
  const [activeMonth, setActiveMonth] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatched_tx' | 'unmatched_inv'>('unmatched_tx');
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualMatchContext, setManualMatchContext] = useState<{
    transactionId?: string;
    transactionName?: string;
    transactionAmount?: string;
    invoiceId?: string;
    invoiceName?: string;
    invoiceAmount?: string;
  } | undefined>(undefined);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showUploadHint, setShowUploadHint] = useState(false);
  const [showEigenbelegDialog, setShowEigenbelegDialog] = useState(false);
  const [eigenbelegTx, setEigenbelegTx] = useState<ReconciliationUnmatchedTransaction | null>(null);
  const [showVorsteuer, setShowVorsteuer] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['matching-monthly', activeMonth],
    queryFn: () => getMonthlyReconciliationApi(activeMonth),
    staleTime: 30_000,
  });

  const reconciliation = data?.data;
  const summary = reconciliation?.summary;
  const availableMonths = reconciliation?.availableMonths ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['matching-monthly'] });
    queryClient.invalidateQueries({ queryKey: ['bank-statements'] });
  };

  const runMutation = useMutation({
    mutationFn: () => runMatchingApi(),
    onSuccess: invalidate,
  });

  const confirmMutation = useMutation({
    mutationFn: confirmMatchingApi,
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: rejectMatchingApi,
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMatchingApi,
    onSuccess: invalidate,
  });

  const suggestedCount = reconciliation?.matched.filter((m) => m.matchStatus === 'SUGGESTED').length ?? 0;

  const handleConfirmAll = async () => {
    const suggested = reconciliation?.matched.filter((m) => m.matchStatus === 'SUGGESTED') ?? [];
    for (const m of suggested) {
      await confirmMatchingApi(m.matchingId);
    }
    invalidate();
  };

  // Month navigation
  const currentIdx = activeMonth ? availableMonths.indexOf(activeMonth) : 0;
  const goPrev = () => {
    if (currentIdx < availableMonths.length - 1) setActiveMonth(availableMonths[currentIdx + 1]);
  };
  const goNext = () => {
    if (currentIdx > 0) setActiveMonth(availableMonths[currentIdx - 1]);
  };

  const matchedCount = reconciliation?.matched.length ?? 0;
  const unmatchedTxCount = reconciliation?.unmatchedTransactions.length ?? 0;
  const unmatchedInvCount = reconciliation?.unmatchedInvoices.length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monatsabstimmung</h1>
          <p className="text-gray-500 mt-1">Bankabgleich, offene Belege und Vorsteuer im Blick</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setManualMatchContext(undefined); setShowManualDialog(true); }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Plus size={14} />
            Manuell zuordnen
          </button>
          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            {runMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Matching starten
          </button>
        </div>
      </div>

      {/* Matching run result banner */}
      {runMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle size={16} />
          {(runMutation.data?.data as { created: number })?.created ?? 0} neue Vorschläge erstellt
        </div>
      )}

      {/* Upload hint banner */}
      {showUploadHint && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload size={16} />
            Rechnung wird verarbeitet. Starten Sie danach das Matching, um die Zuordnung vorzunehmen.
          </div>
          <button onClick={() => setShowUploadHint(false)} className="text-blue-400 hover:text-blue-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Month Picker */}
      {availableMonths.length > 0 && (
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={goPrev}
            disabled={currentIdx >= availableMonths.length - 1}
            className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <select
            value={activeMonth ?? availableMonths[0] ?? ''}
            onChange={(e) => setActiveMonth(e.target.value || undefined)}
            className="input-field !w-auto !py-2 text-sm font-medium"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{formatMonthDE(m)}</option>
            ))}
          </select>
          <button
            onClick={goNext}
            disabled={currentIdx <= 0}
            className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : !reconciliation || (reconciliation.matched.length === 0 && reconciliation.unmatchedTransactions.length === 0 && availableMonths.length === 0) ? (
        <div className="card p-12 text-center">
          <ArrowLeftRight className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Daten vorhanden</h3>
          <p className="text-gray-500">Lade Rechnungen und Kontoauszüge hoch, um die Monatsabstimmung zu starten.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <SummaryCard
                label="Einnahmen"
                value={`+${formatCurrency(summary.totalIncome)}`}
                icon={<TrendingUp size={20} />}
                color="green"
              />
              <SummaryCard
                label="Ausgaben"
                value={`-${formatCurrency(summary.totalExpenses)}`}
                icon={<TrendingDown size={20} />}
                color="red"
              />
              <SummaryCard
                label="Abgeglichen"
                value={`${summary.matchedPercent}%`}
                subtitle={`${summary.matchedTransactions} / ${summary.totalTransactions} TX`}
                icon={<CheckCircle size={20} />}
                color="blue"
              />
              <SummaryCard
                label="Offen"
                value={String(summary.unmatchedTransactions)}
                subtitle="Transaktionen ohne Beleg"
                icon={<AlertTriangle size={20} />}
                color={summary.unmatchedTransactions > 0 ? 'red' : 'green'}
                highlight={summary.unmatchedTransactions > 0}
              />
            </div>
          )}

          {/* Vorsteuer Bar */}
          {summary && parseFloat(summary.vorsteuerTotal) > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-5">
              <button
                onClick={() => setShowVorsteuer(!showVorsteuer)}
                className="flex items-center gap-2 w-full text-left"
              >
                <Receipt size={16} className="text-indigo-600" />
                <span className="text-sm font-medium text-indigo-800">
                  Vorsteuer: {formatCurrency(summary.vorsteuerTotal)}
                </span>
                {summary.vorsteuerByRate.length > 0 && (
                  <span className="text-xs text-indigo-500 ml-2">
                    {summary.vorsteuerByRate.map((v) => `${v.rate}%: ${formatCurrency(v.vatAmount)}`).join(' | ')}
                  </span>
                )}
                <ChevronDown size={14} className={`ml-auto text-indigo-400 transition-transform ${showVorsteuer ? 'rotate-180' : ''}`} />
              </button>
              {showVorsteuer && summary.vorsteuerByRate.length > 0 && (
                <div className="mt-3 pt-3 border-t border-indigo-200 space-y-1">
                  {summary.vorsteuerByRate.map((v) => (
                    <div key={v.rate} className="flex items-center justify-between text-sm">
                      <span className="text-indigo-700">{v.rate}% USt</span>
                      <span className="text-indigo-600">Netto: {formatCurrency(v.netAmount)} / Vorsteuer: {formatCurrency(v.vatAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="border-b mb-4">
            <div className="flex gap-0">
              <TabButton
                active={activeTab === 'matched'}
                onClick={() => setActiveTab('matched')}
                label="Abgeglichen"
                count={matchedCount}
                color="green"
              />
              <TabButton
                active={activeTab === 'unmatched_tx'}
                onClick={() => setActiveTab('unmatched_tx')}
                label="Ohne Beleg"
                count={unmatchedTxCount}
                color="red"
                highlight={unmatchedTxCount > 0}
              />
              <TabButton
                active={activeTab === 'unmatched_inv'}
                onClick={() => setActiveTab('unmatched_inv')}
                label="Offene Rechnungen"
                count={unmatchedInvCount}
                color="yellow"
              />
            </div>
          </div>

          {/* Bulk confirm bar */}
          {activeTab === 'matched' && suggestedCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-yellow-800">{suggestedCount} offene Vorschläge</span>
              <button onClick={handleConfirmAll} className="btn-primary text-xs py-1 px-3 flex items-center gap-1">
                <Check size={12} />
                Alle bestätigen
              </button>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'matched' && (
            <MatchedTab
              items={reconciliation?.matched ?? []}
              onConfirm={(id) => confirmMutation.mutate(id)}
              onReject={(id) => rejectMutation.mutate(id)}
              onDelete={(id) => { if (confirm('Matching löschen?')) deleteMutation.mutate(id); }}
            />
          )}
          {activeTab === 'unmatched_tx' && (
            <UnmatchedTxTab
              items={reconciliation?.unmatchedTransactions ?? []}
              onConfirmSuggested={(id) => confirmMutation.mutate(id)}
              onManualMatch={(tx) => {
                setManualMatchContext({
                  transactionId: tx.id,
                  transactionName: tx.counterpartName ?? undefined,
                  transactionAmount: tx.amount,
                });
                setShowManualDialog(true);
              }}
              onUpload={() => setShowUploadDialog(true)}
              onEigenbeleg={(tx) => { setEigenbelegTx(tx); setShowEigenbelegDialog(true); }}
            />
          )}
          {activeTab === 'unmatched_inv' && (
            <UnmatchedInvTab
              items={reconciliation?.unmatchedInvoices ?? []}
              onConfirmSuggested={(id) => confirmMutation.mutate(id)}
              onManualMatch={(inv) => {
                setManualMatchContext({
                  invoiceId: inv.id,
                  invoiceName: inv.vendorName || inv.customerName || undefined,
                  invoiceAmount: inv.grossAmount ?? undefined,
                });
                setShowManualDialog(true);
              }}
            />
          )}
        </>
      )}

      {showManualDialog && (
        <ManualMatchDialog
          context={manualMatchContext}
          onClose={() => setShowManualDialog(false)}
          onSuccess={() => {
            setShowManualDialog(false);
            invalidate();
          }}
        />
      )}

      {showUploadDialog && (
        <InvoiceUploadDialog
          onClose={() => setShowUploadDialog(false)}
          onSuccess={() => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            setShowUploadHint(true);
          }}
          defaultDirection="INCOMING"
          showDirectionPicker={false}
          title="Beleg hochladen"
        />
      )}

      {showEigenbelegDialog && eigenbelegTx && (
        <BelegFormDialog
          context={{
            mode: 'eigenbeleg',
            transactionId: eigenbelegTx.id,
            transactionName: eigenbelegTx.counterpartName,
            transactionAmount: eigenbelegTx.amount,
            transactionDate: eigenbelegTx.transactionDate,
          }}
          onClose={() => { setShowEigenbelegDialog(false); setEigenbelegTx(null); }}
          onSuccess={() => {
            setShowEigenbelegDialog(false);
            setEigenbelegTx(null);
            invalidate();
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Summary Card
// ============================================================

function SummaryCard({ label, value, subtitle, icon, color, highlight }: {
  label: string; value: string; subtitle?: string;
  icon: React.ReactNode; color: 'green' | 'red' | 'blue' | 'yellow';
  highlight?: boolean;
}) {
  const colors = {
    green: 'bg-green-50 text-green-600 border-green-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]} ${highlight ? 'ring-2 ring-red-300' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase opacity-70">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs mt-0.5 opacity-60">{subtitle}</p>}
    </div>
  );
}

// ============================================================
// Tab Button
// ============================================================

function TabButton({ active, onClick, label, count, color, highlight }: {
  active: boolean; onClick: () => void; label: string; count: number;
  color: 'green' | 'red' | 'yellow'; highlight?: boolean;
}) {
  const badgeColors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
        active
          ? 'border-primary-500 text-primary-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
        highlight && !active ? 'bg-red-500 text-white animate-pulse' : badgeColors[color]
      }`}>
        {count}
      </span>
    </button>
  );
}

// ============================================================
// Matched Tab
// ============================================================

function MatchedTab({ items, onConfirm, onReject, onDelete }: {
  items: ReconciliationMatchedItem[];
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <CheckCircle className="mx-auto mb-2" size={32} />
        <p>Noch keine Zuordnungen in diesem Monat</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((m) => {
        const { invoice, transaction } = m;
        const confidence = m.confidence ? (parseFloat(m.confidence) * 100).toFixed(0) : null;
        const confidenceNum = m.confidence ? parseFloat(m.confidence) * 100 : 0;

        return (
          <div key={m.matchingId} className="card overflow-hidden">
            <div className="flex items-center gap-1 p-1">
              {/* Invoice side */}
              <div className="flex-1 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-blue-600" />
                  <span className="text-xs font-medium text-blue-600 uppercase">Rechnung</span>
                  <ValidationDot status={invoice.validationStatus} />
                </div>
                <p className="font-medium text-gray-900 truncate">{invoice.vendorName || invoice.customerName || invoice.invoiceNumber || '—'}</p>
                <p className="text-sm text-gray-500">{invoice.invoiceNumber || '—'}</p>
                <p className="text-lg font-bold mt-1">
                  {invoice.grossAmount ? formatCurrency(invoice.grossAmount) : '—'}
                </p>
                {invoice.invoiceDate && <p className="text-xs text-gray-400 mt-1">{formatDate(invoice.invoiceDate)}</p>}
              </div>

              {/* Match indicator */}
              <div className="flex flex-col items-center px-4 py-2 shrink-0">
                <MatchStatusIcon status={m.matchStatus} />
                <ArrowLeftRight size={20} className="text-gray-300 my-1" />
                <MatchTypeBadge type={m.matchType} />
                {confidence && (
                  <span className={`text-xs mt-1 font-medium ${confidenceNum >= 80 ? 'text-green-600' : confidenceNum >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {confidence}%
                  </span>
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
                <p className="text-lg font-bold mt-1">{formatCurrency(transaction.amount)}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(transaction.transactionDate)}</p>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="px-5 py-2.5 bg-gray-50 border-t flex items-center justify-between gap-4">
              <span className="text-xs text-gray-500 truncate flex-1">{m.matchReason || ''}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {m.matchStatus === 'SUGGESTED' && (
                  <>
                    <button
                      onClick={() => onConfirm(m.matchingId)}
                      className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                      title="Bestätigen"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => onReject(m.matchingId)}
                      className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                      title="Ablehnen"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => onDelete(m.matchingId)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-red-500 transition-colors"
                  title="Löschen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Unmatched Transactions Tab
// ============================================================

function UnmatchedTxTab({ items, onConfirmSuggested, onManualMatch, onUpload, onEigenbeleg }: {
  items: ReconciliationUnmatchedTransaction[];
  onConfirmSuggested: (id: string) => void;
  onManualMatch: (tx: ReconciliationUnmatchedTransaction) => void;
  onUpload: () => void;
  onEigenbeleg: (tx: ReconciliationUnmatchedTransaction) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-green-500">
        <CheckCircle className="mx-auto mb-2" size={32} />
        <p className="font-medium">Alle Transaktionen haben einen Beleg!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Prominent upload button above list */}
      <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3 mb-1">
        <span className="text-sm text-red-700">
          {items.length} {items.length === 1 ? 'Transaktion' : 'Transaktionen'} ohne Beleg
        </span>
        <button
          onClick={onUpload}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <Upload size={12} />
          Beleg hochladen
        </button>
      </div>

      {items.map((tx) => {
        const amount = parseFloat(tx.amount);
        const isIncome = amount > 0;

        return (
          <div
            key={tx.id}
            className="card border-l-4 border-l-red-400 p-4 flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400">{formatDate(tx.transactionDate)}</span>
                {tx.hasSuggestedMatching && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">
                    Vorschlag vorhanden
                  </span>
                )}
              </div>
              <p className="font-medium text-gray-900 truncate">{tx.counterpartName || 'Unbekannt'}</p>
              <p className="text-sm text-gray-500 truncate">{tx.reference || tx.bookingText || '—'}</p>
              {tx.hasSuggestedMatching && tx.suggestedInvoiceName && (
                <p className="text-xs text-yellow-600 mt-1">Vorschlag: {tx.suggestedInvoiceName}</p>
              )}
            </div>

            <div className="text-right shrink-0">
              <p className={`text-lg font-bold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(tx.amount)}
              </p>
              <p className="text-xs text-gray-400">{tx.currency}</p>
            </div>

            <div className="flex flex-col gap-1 shrink-0">
              {tx.hasSuggestedMatching && tx.suggestedMatchingId && (
                <button
                  onClick={() => onConfirmSuggested(tx.suggestedMatchingId!)}
                  className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                  title="Vorschlag bestätigen"
                >
                  <Check size={14} />
                </button>
              )}
              <button
                onClick={onUpload}
                className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                title="Beleg hochladen"
              >
                <Upload size={14} />
              </button>
              <button
                onClick={() => onEigenbeleg(tx)}
                className="p-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                title="Eigenbeleg erstellen"
              >
                <FilePlus2 size={14} />
              </button>
              <button
                onClick={() => onManualMatch(tx)}
                className="p-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                title="Manuell zuordnen"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Unmatched Invoices Tab
// ============================================================

function UnmatchedInvTab({ items, onConfirmSuggested, onManualMatch }: {
  items: ReconciliationUnmatchedInvoice[];
  onConfirmSuggested: (id: string) => void;
  onManualMatch: (inv: ReconciliationUnmatchedInvoice) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-green-500">
        <CheckCircle className="mx-auto mb-2" size={32} />
        <p className="font-medium">Alle Rechnungen sind zugeordnet!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((inv) => (
        <div
          key={inv.id}
          className="card border-l-4 border-l-yellow-400 p-4 flex items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ValidationDot status={inv.validationStatus} />
              <span className="text-xs text-gray-400">
                {inv.invoiceDate ? formatDate(inv.invoiceDate) : '—'}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                inv.direction === 'INCOMING'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {inv.direction === 'INCOMING' ? 'Eingang' : 'Ausgang'}
              </span>
              {inv.hasSuggestedMatching && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">
                  Vorschlag vorhanden
                </span>
              )}
            </div>
            <p className="font-medium text-gray-900 truncate">
              {inv.vendorName || inv.customerName || 'Unbekannt'}
            </p>
            <p className="text-sm text-gray-500">{inv.invoiceNumber || `Beleg #${inv.belegNr}`}</p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-gray-900">
              {inv.grossAmount ? formatCurrency(inv.grossAmount) : '—'}
            </p>
            <p className="text-xs text-gray-400">{inv.currency}</p>
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            {inv.hasSuggestedMatching && inv.suggestedMatchingId && (
              <button
                onClick={() => onConfirmSuggested(inv.suggestedMatchingId!)}
                className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                title="Vorschlag bestätigen"
              >
                <Check size={14} />
              </button>
            )}
            <button
              onClick={() => onManualMatch(inv)}
              className="p-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
              title="Manuell zuordnen"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Manual Match Dialog
// ============================================================

function ManualMatchDialog({ context, onClose, onSuccess }: {
  context?: {
    transactionId?: string;
    transactionName?: string;
    transactionAmount?: string;
    invoiceId?: string;
    invoiceName?: string;
    invoiceAmount?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(context?.invoiceId ?? '');
  const [selectedTxId, setSelectedTxId] = useState(context?.transactionId ?? '');
  const [selectedStatementId, setSelectedStatementId] = useState('');

  const hasTxContext = !!context?.transactionId;
  const hasInvContext = !!context?.invoiceId;

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-for-matching'],
    queryFn: async () => {
      const res = await apiClient.get('/invoices', { params: { limit: 100, sortBy: 'createdAt', sortOrder: 'desc' } });
      return res.data;
    },
  });

  const { data: statementsData } = useQuery({
    queryKey: ['bank-statements'],
    queryFn: () => listBankStatementsApi({ limit: 50 }),
    enabled: !hasTxContext,
  });

  const { data: statementDetail } = useQuery({
    queryKey: ['bank-statement', selectedStatementId],
    queryFn: () => getBankStatementApi(selectedStatementId),
    enabled: !!selectedStatementId && !hasTxContext,
  });

  const rawInvoices = ((invoicesData as Record<string, unknown>)?.data ?? []) as Array<Record<string, unknown>>;
  const statements = (statementsData?.data ?? []) as Array<Record<string, unknown>>;
  const transactions = ((statementDetail?.data as Record<string, unknown>)?.transactions ?? []) as Array<Record<string, unknown>>;

  // Sort invoices by relevance when context is provided
  const invoices = (() => {
    if (!context?.transactionName && !context?.transactionAmount) return rawInvoices;

    const txName = (context.transactionName || '').toLowerCase();
    const txAmount = context.transactionAmount ? Math.abs(parseFloat(context.transactionAmount)) : null;

    return [...rawInvoices].sort((a, b) => {
      const scoreA = invoiceRelevanceScore(a, txName, txAmount);
      const scoreB = invoiceRelevanceScore(b, txName, txAmount);
      return scoreB - scoreA;
    });
  })();

  const createMutation = useMutation({
    mutationFn: () => createManualMatchingApi(selectedInvoiceId, selectedTxId),
    onSuccess,
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus size={18} className="text-primary-600" />
            Manuell zuordnen
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Context info banner */}
        {(hasTxContext || hasInvContext) && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-700">
            {hasTxContext && (
              <p>Transaktion: <strong>{context.transactionName || 'Unbekannt'}</strong> — {context.transactionAmount ? formatCurrency(context.transactionAmount) : '?'}</p>
            )}
            {hasInvContext && (
              <p>Rechnung: <strong>{context.invoiceName || 'Unbekannt'}</strong> — {context.invoiceAmount ? formatCurrency(context.invoiceAmount) : '?'}</p>
            )}
          </div>
        )}

        <div className="space-y-4">
          {/* Invoice selector — show unless invoice is pre-selected from context */}
          {!hasInvContext && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Rechnung * {hasTxContext && <span className="text-blue-500 ml-1">(sortiert nach Relevanz)</span>}
              </label>
              <select value={selectedInvoiceId} onChange={(e) => setSelectedInvoiceId(e.target.value)} className="input-field text-sm">
                <option value="">— Rechnung wählen —</option>
                {invoices.map((inv) => {
                  const name = String(inv.vendorName || inv.customerName || inv.originalFileName || '');
                  const nr = String(inv.invoiceNumber || `#${inv.belegNr}`);
                  const amount = inv.grossAmount ? formatCurrency(String(inv.grossAmount)) : '?';
                  // Highlight matching entries
                  const isRelevant = hasTxContext && context.transactionName &&
                    nameOverlap(name.toLowerCase(), (context.transactionName || '').toLowerCase()) > 0;
                  return (
                    <option key={String(inv.id)} value={String(inv.id)}>
                      {isRelevant ? '\u2605 ' : ''}{name} — {nr} — {amount}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Transaction selector — show unless transaction is pre-selected from context */}
          {!hasTxContext && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Kontoauszug *</label>
                <select value={selectedStatementId} onChange={(e) => { setSelectedStatementId(e.target.value); setSelectedTxId(''); }} className="input-field text-sm">
                  <option value="">— Kontoauszug wählen —</option>
                  {statements.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>
                      {String(s.bankName || s.originalFileName || '')} ({s.periodFrom ? formatDate(String(s.periodFrom)) : '?'} — {s.periodTo ? formatDate(String(s.periodTo)) : '?'})
                    </option>
                  ))}
                </select>
              </div>

              {selectedStatementId && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Transaktion *</label>
                  <select value={selectedTxId} onChange={(e) => setSelectedTxId(e.target.value)} className="input-field text-sm">
                    <option value="">— Transaktion wählen —</option>
                    {transactions.map((tx) => (
                      <option key={tx.id as string} value={tx.id as string}>
                        {formatDate(tx.transactionDate as string)} — {(tx.counterpartName as string) || '?'} — {formatCurrency(tx.amount as string)}
                        {tx.isMatched ? ' (bereits gematcht)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {(createMutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
                || (createMutation.error as Error).message
                || 'Fehler beim Zuordnen'}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!selectedInvoiceId || !selectedTxId || createMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Zuordnen
            </button>
            <button onClick={onClose} className="btn-secondary text-sm flex-1">
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Relevance Scoring for Smart Matching
// ============================================================

/** Count overlapping words between two lowercased strings */
function nameOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = a.split(/[\s,.\-/]+/).filter((w) => w.length > 2);
  const wordsB = new Set(b.split(/[\s,.\-/]+/).filter((w) => w.length > 2));
  return wordsA.filter((w) => wordsB.has(w)).length;
}

/** Score an invoice's relevance to a transaction (higher = more relevant) */
function invoiceRelevanceScore(
  inv: Record<string, unknown>,
  txNameLower: string,
  txAmount: number | null,
): number {
  let score = 0;

  // Name match: vendor/customer name overlaps with transaction counterpart
  const invName = String(inv.vendorName || inv.customerName || '').toLowerCase();
  const overlap = nameOverlap(invName, txNameLower);
  if (overlap > 0) score += 50 + overlap * 20;

  // Amount match: similar gross amount
  if (txAmount && inv.grossAmount) {
    const invAmount = Math.abs(parseFloat(String(inv.grossAmount)));
    const diff = Math.abs(invAmount - txAmount);
    if (diff < 0.01) score += 40;        // exact match
    else if (diff < 1) score += 30;       // very close
    else if (diff / txAmount < 0.05) score += 20; // within 5%
  }

  return score;
}

// ============================================================
// Helpers
// ============================================================

function ValidationDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    VALID: 'bg-traffic-green',
    WARNING: 'bg-traffic-yellow',
    INVALID: 'bg-traffic-red',
    PENDING: 'bg-traffic-gray',
  };
  return <span className={`w-2.5 h-2.5 rounded-full ${colors[status] || colors.PENDING}`} title={status} />;
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

function formatMonthDE(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
}
