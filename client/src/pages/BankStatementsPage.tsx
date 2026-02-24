import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listBankStatementsApi, getBankStatementApi, uploadBankStatementApi, deleteBankStatementApi } from '../api/bankStatements';
import { getTenantApi } from '../api/tenant';
import {
  Building2, Upload, Loader2, ChevronDown, ChevronUp, ArrowDownLeft, ArrowUpRight,
  X, CheckCircle, AlertTriangle, Trash2, FileUp, ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

export function BankStatementsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['bank-statements'],
    queryFn: () => listBankStatementsApi(),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['bank-statement', expandedId],
    queryFn: () => getBankStatementApi(expandedId!),
    enabled: !!expandedId,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBankStatementApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-statements'] });
      queryClient.invalidateQueries({ queryKey: ['matchings'] });
      setExpandedId(null);
    },
  });

  const statements = (data?.data ?? []) as Array<Record<string, unknown>>;
  const detail = detailData?.data as Record<string, unknown> | undefined;
  const transactions = (detail?.transactions ?? []) as Array<Record<string, unknown>>;

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Kontoauszug "${name}" wirklich löschen? Alle zugehörigen Transaktionen und Matchings werden ebenfalls gelöscht.`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <div>
          <h1 className={isMobile ? 'text-lg font-bold text-gray-900' : 'text-2xl font-bold text-gray-900'}>Kontoauszüge</h1>
          {!isMobile && <p className="text-gray-500 mt-1">Bank-Kontoauszüge und Transaktionen</p>}
        </div>
        <button onClick={() => setShowUploadDialog(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Upload size={16} />
          {isMobile ? 'Import' : 'Importieren'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : statements.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Kontoauszüge vorhanden</h3>
          <p className="text-gray-500">Importiere einen CSV-Kontoauszug für den automatischen Bankabgleich.</p>
          <button onClick={() => setShowUploadDialog(true)} className="btn-primary mt-4">
            <Upload size={16} className="inline mr-1" />
            CSV importieren
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {statements.map((stmt) => {
            const isExpanded = expandedId === stmt.id;
            return (
              <div key={stmt.id as string} className="card overflow-hidden">
                {/* Statement header */}
                <div className="flex items-center justify-between">
                  <button
                    className={`flex-1 ${isMobile ? 'p-4' : 'p-5'} hover:bg-gray-50 transition-colors text-left`}
                    onClick={() => setExpandedId(isExpanded ? null : (stmt.id as string))}
                  >
                    {isMobile ? (
                      /* Mobile: stacked layout */
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="p-1.5 bg-blue-100 rounded-lg shrink-0">
                              <Building2 className="text-blue-600" size={16} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-medium text-gray-900 text-sm truncate">{(stmt.bankName as string) || (stmt.originalFileName as string) || 'Bank'}</h3>
                              {(stmt.iban as string) && <p className="text-xs text-gray-500 font-mono truncate">{stmt.iban as string}</p>}
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>{stmt.periodFrom ? formatDate(stmt.periodFrom as string) : '?'} — {stmt.periodTo ? formatDate(stmt.periodTo as string) : '?'}</span>
                          <span>{stmt.transactionCount as number} TX</span>
                          <span className="font-medium text-gray-700">{stmt.closingBalance ? formatCurrency(String(stmt.closingBalance)) : '—'}</span>
                        </div>
                      </div>
                    ) : (
                      /* Desktop: horizontal layout */
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Building2 className="text-blue-600" size={20} />
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">{(stmt.bankName as string) || (stmt.originalFileName as string) || 'Bank'}</h3>
                            <p className="text-sm text-gray-500">{(stmt.iban as string) || ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <p className="text-gray-500">Zeitraum</p>
                            <p className="font-medium">
                              {stmt.periodFrom ? formatDate(stmt.periodFrom as string) : '?'} — {stmt.periodTo ? formatDate(stmt.periodTo as string) : '?'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500">Transaktionen</p>
                            <p className="font-medium">{stmt.transactionCount as number}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500">Saldo</p>
                            <p className="font-medium">{stmt.closingBalance ? formatCurrency(String(stmt.closingBalance)) : '—'}</p>
                          </div>
                          {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                        </div>
                      </div>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(stmt.id as string, (stmt.originalFileName as string) || 'Kontoauszug'); }}
                    className="p-2 mr-3 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 touch-target"
                    title="Löschen"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Transactions */}
                {isExpanded && (
                  <div className="border-t">
                    {detailLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="animate-spin text-primary-600" size={24} />
                      </div>
                    ) : transactions.length > 0 ? (
                      isMobile ? (
                        /* Mobile: Transaction Cards */
                        <div className="p-3 space-y-2">
                          {transactions.map((tx) => {
                            const amount = parseFloat(tx.amount as string);
                            const isIncome = amount > 0;
                            return (
                              <div key={tx.id as string} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                                <div className="shrink-0">
                                  {isIncome ? (
                                    <ArrowDownLeft size={16} className="text-green-500" />
                                  ) : (
                                    <ArrowUpRight size={16} className="text-red-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-gray-900 text-sm truncate">{(tx.counterpartName as string) || '—'}</span>
                                    <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(tx.transactionDate as string)}</span>
                                  </div>
                                  <p className="text-xs text-gray-500 truncate">{(tx.bookingText as string) || (tx.reference as string) || '—'}</p>
                                  <div className="flex items-center justify-between mt-1">
                                    {tx.isMatched ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600"><CheckCircle size={10} /> Matched</span>
                                    ) : (
                                      <span className="text-[10px] text-gray-400">Offen</span>
                                    )}
                                    <span className={`text-sm font-semibold ${isIncome ? 'text-green-600' : 'text-gray-900'}`}>
                                      {formatCurrency(tx.amount as string)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Desktop: Table */
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Datum</th>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Empfänger / Absender</th>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Referenz</th>
                              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Buchungstext</th>
                              <th className="text-right px-5 py-2.5 font-medium text-gray-500">Betrag</th>
                              <th className="text-center px-5 py-2.5 font-medium text-gray-500">Match</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {transactions.map((tx) => {
                              const amount = parseFloat(tx.amount as string);
                              const isIncome = amount > 0;
                              return (
                                <tr key={tx.id as string} className="hover:bg-gray-50">
                                  <td className="px-5 py-2.5 text-gray-600">{formatDate(tx.transactionDate as string)}</td>
                                  <td className="px-5 py-2.5">
                                    <div className="flex items-center gap-2">
                                      {isIncome ? (
                                        <ArrowDownLeft size={14} className="text-green-500 shrink-0" />
                                      ) : (
                                        <ArrowUpRight size={14} className="text-red-500 shrink-0" />
                                      )}
                                      <span className="font-medium text-gray-900 truncate max-w-[200px]">{(tx.counterpartName as string) || '—'}</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5 text-gray-500 truncate max-w-[200px]">{(tx.reference as string) || '—'}</td>
                                  <td className="px-5 py-2.5 text-gray-500">{(tx.bookingText as string) || '—'}</td>
                                  <td className={`px-5 py-2.5 text-right font-medium ${isIncome ? 'text-green-600' : 'text-gray-900'}`}>
                                    {formatCurrency(tx.amount as string)}
                                  </td>
                                  <td className="px-5 py-2.5 text-center">
                                    {tx.isMatched ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Ja</span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Nein</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )
                    ) : (
                      <p className="text-center text-gray-400 py-6 text-sm">Keine Transaktionen</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showUploadDialog && (
        <UploadDialog
          onClose={() => setShowUploadDialog(false)}
          onSuccess={() => {
            setShowUploadDialog(false);
            queryClient.invalidateQueries({ queryKey: ['bank-statements'] });
            queryClient.invalidateQueries({ queryKey: ['matchings'] });
          }}
          onGoToMatching={() => {
            setShowUploadDialog(false);
            navigate('/matching');
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Upload Dialog
// ============================================================

function UploadDialog({ onClose, onSuccess, onGoToMatching }: {
  onClose: () => void;
  onSuccess: () => void;
  onGoToMatching: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ transactionsImported: number; matchingSuggestions: number } | null>(null);

  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: getTenantApi,
  });

  const bankAccounts = tenant?.bankAccounts ?? [];

  const uploadMutation = useMutation({
    mutationFn: () => uploadBankStatementApi(selectedFile!, bankAccountId || undefined),
    onSuccess: (data) => {
      setResult({
        transactionsImported: data.data?.transactionsImported ?? 0,
        matchingSuggestions: data.data?.matchingSuggestions ?? 0,
      });
    },
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileUp size={18} className="text-primary-600" />
            Kontoauszug importieren
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {result ? (
          /* Success state */
          <div className="py-4">
            <div className="flex flex-col items-center text-center mb-6">
              <CheckCircle size={48} className="text-green-500 mb-3" />
              <p className="font-semibold text-lg text-gray-900">Import erfolgreich!</p>
              <p className="text-sm text-gray-500 mt-1">
                {result.transactionsImported} Transaktionen importiert
              </p>
              {result.matchingSuggestions > 0 && (
                <p className="text-sm text-primary-600 font-medium mt-2">
                  {result.matchingSuggestions} neue Match-Vorschläge gefunden
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {result.matchingSuggestions > 0 && (
                <button onClick={onGoToMatching} className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm">
                  <ArrowRight size={14} />
                  Zum Abgleich
                </button>
              )}
              <button onClick={onSuccess} className="btn-secondary flex-1 text-sm">
                Schließen
              </button>
            </div>
          </div>
        ) : (
          /* Upload form */
          <div className="space-y-4">
            {/* Bank account selector */}
            {bankAccounts.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bankkonto (optional)</label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="">— Kein Konto zuordnen —</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label} {a.iban ? `(${a.iban})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-gray-400'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileSelect}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileUp size={24} className="text-primary-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">CSV-Datei hierher ziehen oder klicken</p>
                  <p className="text-xs text-gray-400 mt-1">Unterstützt: CSV (Semikolon/Komma-getrennt)</p>
                </>
              )}
            </div>

            {/* Error */}
            {uploadMutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle size={16} />
                {(uploadMutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
                  || (uploadMutation.error as Error).message
                  || 'Import fehlgeschlagen'}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || uploadMutation.isPending}
                className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center disabled:opacity-50"
              >
                {uploadMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {uploadMutation.isPending ? 'Wird importiert...' : 'Importieren'}
              </button>
              <button
                onClick={onClose}
                disabled={uploadMutation.isPending}
                className="btn-secondary text-sm flex-1"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
