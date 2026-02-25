import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listInvoicesApi } from '../api/invoices';
import { exportBmdCsvApi, exportMonthlyReportApi, exportFullApi, downloadBlob } from '../api/exports';
import type { InvoiceListItem } from '@buchungsai/shared';
import { Download, FileText, CheckCircle, Loader2, FileArchive, BarChart3 } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAccountingType } from '../hooks/useAccountingType';

export function ExportPage() {
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
                        <p className="text-xs text-gray-500">{(inv.invoiceNumber as string) || '—'} · {inv.invoiceDate ? new Date(inv.invoiceDate as string).toLocaleDateString('de-AT') : '—'}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-sm shrink-0 ml-2">
                      {inv.grossAmount ? parseFloat(inv.grossAmount as string).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' }) : '—'}
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
                      <td className="px-4 py-3 text-gray-600">{(inv.invoiceNumber as string) || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {inv.invoiceDate ? new Date(inv.invoiceDate as string).toLocaleDateString('de-AT') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {inv.grossAmount ? parseFloat(inv.grossAmount as string).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' }) : '—'}
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
