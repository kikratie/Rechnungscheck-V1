import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listInvoicesApi } from '../api/invoices';
import {
  exportBmdCsvApi, exportMonthlyReportApi, exportFullApi, downloadBlob,
  getExportConfigsApi, createExportConfigApi, updateExportConfigApi, deleteExportConfigApi,
} from '../api/exports';
import type { InvoiceListItem, ExportConfigItem, ExportFormatType } from '@buchungsai/shared';
import {
  Download, FileText, CheckCircle, Loader2, FileArchive, BarChart3,
  Settings2, Plus, Pencil, Trash2, X, Star,
} from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAccountingType } from '../hooks/useAccountingType';

const FORMAT_LABELS: Record<ExportFormatType, string> = {
  CSV_GENERIC: 'CSV (Allgemein)',
  BMD_CSV: 'BMD CSV',
  BMD_XML: 'BMD XML',
};

const DELIMITER_OPTIONS = [
  { value: ';', label: 'Semikolon (;)' },
  { value: ',', label: 'Komma (,)' },
  { value: '\t', label: 'Tab' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'dd.MM.yyyy', label: 'dd.MM.yyyy' },
  { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd (ISO)' },
  { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' },
];

const ENCODING_OPTIONS = ['UTF-8', 'ISO-8859-1'];
const DECIMAL_OPTIONS = [
  { value: ',', label: 'Komma (,)' },
  { value: '.', label: 'Punkt (.)' },
];

export function ExportPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['invoices-exportable'],
    queryFn: () => listInvoicesApi({ processingStatus: 'ARCHIVED', limit: 100 }),
  });

  const isMobile = useIsMobile();
  const accountingType = useAccountingType();
  const exportable = (data?.data ?? []) as InvoiceListItem[];
  const exportedQuery = useQuery({
    queryKey: ['invoices-exported'],
    queryFn: () => listInvoicesApi({ processingStatus: 'EXPORTED', limit: 100 }),
  });
  const exported = (exportedQuery.data?.data ?? []) as InvoiceListItem[];

  // Export configs
  const configsQuery = useQuery({
    queryKey: ['export-configs'],
    queryFn: () => getExportConfigsApi(),
  });
  const configs = (configsQuery.data?.data ?? []) as ExportConfigItem[];

  // BMD CSV state
  const [bmdFrom, setBmdFrom] = useState('');
  const [bmdTo, setBmdTo] = useState('');
  const [bmdLoading, setBmdLoading] = useState(false);

  // Monthly report state
  const now = new Date();
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportLoading, setReportLoading] = useState(false);

  // Full export state
  const [fullYear, setFullYear] = useState(now.getFullYear());
  const [fullLoading, setFullLoading] = useState(false);

  // Config dialog state
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ExportConfigItem | null>(null);

  const handleBmdExport = async () => {
    if (!bmdFrom || !bmdTo) return;
    setBmdLoading(true);
    try {
      const blob = await exportBmdCsvApi(bmdFrom, bmdTo);
      downloadBlob(blob, `bmd-export-${bmdFrom}-${bmdTo}.csv`);
    } catch (err) {
      alert('Export fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler'));
    } finally {
      setBmdLoading(false);
    }
  };

  const handleMonthlyReport = async () => {
    setReportLoading(true);
    try {
      const blob = await exportMonthlyReportApi(reportYear, reportMonth);
      const monthStr = `${reportYear}-${String(reportMonth).padStart(2, '0')}`;
      downloadBlob(blob, `monatsreport-${monthStr}.pdf`);
    } catch (err) {
      alert('Report fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler'));
    } finally {
      setReportLoading(false);
    }
  };

  const handleFullExport = async () => {
    setFullLoading(true);
    try {
      const blob = await exportFullApi(fullYear);
      downloadBlob(blob, `vollexport-${fullYear}.zip`);
    } catch (err) {
      alert('Export fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler'));
    } finally {
      setFullLoading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExportConfigApi(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['export-configs'] }),
  });

  const months = [
    'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Export</h1>
        <p className="text-gray-500 mt-1">Daten für Steuerberater exportieren</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600" size={20} />
            </div>
            <div>
              <h3 className="font-semibold">Exportbereit</h3>
              <p className="text-2xl font-bold text-green-600">{exportable.length}</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">Genehmigte Rechnungen, bereit zum Export.</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Download className="text-purple-600" size={20} />
            </div>
            <div>
              <h3 className="font-semibold">Bereits exportiert</h3>
              <p className="text-2xl font-bold text-purple-600">{exported.length}</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">Rechnungen, die bereits exportiert wurden.</p>
        </div>
      </div>

      {/* Export Sections */}
      <div className={`grid grid-cols-1 ${accountingType === 'ACCRUAL' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6 mb-8`}>
        {/* BMD CSV Export — only for ACCRUAL */}
        {accountingType === 'ACCRUAL' && <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="text-blue-600" size={20} />
            <h3 className="font-semibold">BMD CSV-Export</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">Semikolon-getrennt, dd.MM.yyyy, UTF-8 mit BOM. Rechnungen werden als &quot;exportiert&quot; markiert.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Von</label>
              <input
                type="date"
                value={bmdFrom}
                onChange={(e) => setBmdFrom(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bis</label>
              <input
                type="date"
                value={bmdTo}
                onChange={(e) => setBmdTo(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <button
              className="btn-primary text-sm w-full flex items-center justify-center gap-2"
              disabled={!bmdFrom || !bmdTo || bmdLoading}
              onClick={handleBmdExport}
            >
              {bmdLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              BMD-Export starten
            </button>
          </div>
        </div>}

        {/* Monthly Report PDF */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-emerald-600" size={20} />
            <h3 className="font-semibold">Monatsreport</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">PDF-Zusammenfassung eines Monats: Belegübersicht, Ampel-Verteilung, Summen.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Monat</label>
                <select
                  value={reportMonth}
                  onChange={(e) => setReportMonth(Number(e.target.value))}
                  className="input-field text-sm"
                >
                  {months.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Jahr</label>
                <input
                  type="number"
                  value={reportYear}
                  onChange={(e) => setReportYear(Number(e.target.value))}
                  className="input-field text-sm"
                  min={2020}
                  max={2099}
                />
              </div>
            </div>
            <button
              className="btn-primary text-sm w-full flex items-center justify-center gap-2"
              disabled={reportLoading}
              onClick={handleMonthlyReport}
            >
              {reportLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Report herunterladen
            </button>
          </div>
        </div>

        {/* Full ZIP Export */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileArchive className="text-orange-600" size={20} />
            <h3 className="font-semibold">Vollständiger Export</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">ZIP mit allen archivierten PDFs (nach Monat sortiert) + Zusammenfassung als CSV.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jahr</label>
              <input
                type="number"
                value={fullYear}
                onChange={(e) => setFullYear(Number(e.target.value))}
                className="input-field text-sm"
                min={2020}
                max={2099}
              />
            </div>
            <button
              className="btn-primary text-sm w-full flex items-center justify-center gap-2"
              disabled={fullLoading}
              onClick={handleFullExport}
            >
              {fullLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              ZIP herunterladen
            </button>
          </div>
        </div>
      </div>

      {/* Export Profiles */}
      <div className="card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="text-gray-600" size={20} />
            <h2 className="text-lg font-semibold">Exportprofile</h2>
          </div>
          <button
            className="btn-secondary text-sm flex items-center gap-1"
            onClick={() => { setEditingConfig(null); setConfigDialogOpen(true); }}
          >
            <Plus size={14} />
            Neues Profil
          </button>
        </div>

        {configsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : configs.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">Noch keine Exportprofile erstellt.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Format</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Trennzeichen</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Encoding</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Datumsformat</th>
                  <th className="pb-2 font-medium text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((cfg) => (
                  <tr key={cfg.id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        {cfg.isDefault && <Star size={12} className="text-yellow-500 fill-yellow-500" />}
                        <span className={cfg.isSystem ? 'text-gray-400' : ''}>{cfg.name}</span>
                        {cfg.isSystem && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">System</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                        {FORMAT_LABELS[cfg.format] ?? cfg.format}
                      </span>
                    </td>
                    <td className="py-2.5 hidden sm:table-cell text-gray-500">
                      {cfg.delimiter === '\t' ? 'Tab' : cfg.delimiter === ';' ? 'Semikolon' : cfg.delimiter === ',' ? 'Komma' : cfg.delimiter}
                    </td>
                    <td className="py-2.5 hidden md:table-cell text-gray-500">{cfg.encoding}</td>
                    <td className="py-2.5 hidden md:table-cell text-gray-500">{cfg.dateFormat}</td>
                    <td className="py-2.5 text-right">
                      {!cfg.isSystem ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Bearbeiten"
                            onClick={() => { setEditingConfig(cfg); setConfigDialogOpen(true); }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Löschen"
                            onClick={() => {
                              if (confirm(`Profil "${cfg.name}" wirklich löschen?`)) {
                                deleteMutation.mutate(cfg.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">Nicht editierbar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Config Dialog */}
      {configDialogOpen && (
        <ExportConfigDialog
          config={editingConfig}
          onClose={() => { setConfigDialogOpen(false); setEditingConfig(null); }}
          onSaved={() => {
            setConfigDialogOpen(false);
            setEditingConfig(null);
            queryClient.invalidateQueries({ queryKey: ['export-configs'] });
          }}
        />
      )}

      {/* Exportable invoices list */}
      {exportable.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-4">Exportbereite Rechnungen</h2>
          {isMobile ? (
            <div className="space-y-2">
              {exportable.map((inv) => (
                <div key={inv.id as string} className="card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText size={14} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{(inv.vendorName as string) || (inv.originalFileName as string)}</p>
                        <p className="text-xs text-gray-500">{(inv.invoiceNumber as string) || '\u2014'} · {inv.invoiceDate ? new Date(inv.invoiceDate as string).toLocaleDateString('de-AT') : '\u2014'}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-sm shrink-0 ml-2">
                      {inv.grossAmount ? parseFloat(inv.grossAmount as string).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' }) : '\u2014'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Lieferant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rechnungsnr.</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Datum</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Betrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {exportable.map((inv) => (
                    <tr key={inv.id as string} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-gray-400" />
                          <span className="font-medium">{(inv.vendorName as string) || (inv.originalFileName as string)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{(inv.invoiceNumber as string) || '\u2014'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {inv.invoiceDate ? new Date(inv.invoiceDate as string).toLocaleDateString('de-AT') : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {inv.grossAmount ? parseFloat(inv.grossAmount as string).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' }) : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Export Config Dialog
// ============================================================

function ExportConfigDialog({ config, onClose, onSaved }: {
  config: ExportConfigItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!config;
  const [name, setName] = useState(config?.name ?? '');
  const [format, setFormat] = useState<ExportFormatType>(config?.format ?? 'CSV_GENERIC');
  const [delimiter, setDelimiter] = useState(config?.delimiter ?? ';');
  const [dateFormat, setDateFormat] = useState(config?.dateFormat ?? 'dd.MM.yyyy');
  const [decimalSeparator, setDecimalSeparator] = useState(config?.decimalSeparator ?? ',');
  const [encoding, setEncoding] = useState(config?.encoding ?? 'UTF-8');
  const [includeHeader, setIncludeHeader] = useState(config?.includeHeader ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name ist erforderlich'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEditing) {
        await updateExportConfigApi(config!.id, {
          name, format, delimiter, dateFormat, decimalSeparator, encoding, includeHeader,
        });
      } else {
        await createExportConfigApi({
          name, format, delimiter, dateFormat, decimalSeparator, encoding, includeHeader,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">
            {isEditing ? 'Exportprofil bearbeiten' : 'Neues Exportprofil'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="z.B. Mein BMD Profil"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormatType)}
              className="input-field"
            >
              <option value="CSV_GENERIC">CSV (Allgemein)</option>
              <option value="BMD_CSV">BMD CSV</option>
              <option value="BMD_XML">BMD XML</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trennzeichen</label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                className="input-field"
              >
                {DELIMITER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dezimaltrennzeichen</label>
              <select
                value={decimalSeparator}
                onChange={(e) => setDecimalSeparator(e.target.value)}
                className="input-field"
              >
                {DECIMAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datumsformat</label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="input-field"
              >
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Encoding</label>
              <select
                value={encoding}
                onChange={(e) => setEncoding(e.target.value)}
                className="input-field"
              >
                {ENCODING_OPTIONS.map((enc) => (
                  <option key={enc} value={enc}>{enc}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeHeader}
              onChange={(e) => setIncludeHeader(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Kopfzeile einschließen</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Abbrechen
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-1">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEditing ? 'Speichern' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
