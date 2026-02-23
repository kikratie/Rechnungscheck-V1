import { useQuery } from '@tanstack/react-query';
import { listInvoicesApi } from '../api/invoices';
import type { InvoiceListItem } from '@buchungsai/shared';
import { Download, FileText, CheckCircle } from 'lucide-react';

export function ExportPage() {
  const { data } = useQuery({
    queryKey: ['invoices-exportable'],
    queryFn: () => listInvoicesApi({ processingStatus: 'ARCHIVED', limit: 100 }),
  });

  const exportable = (data?.data ?? []) as InvoiceListItem[];
  const exportedQuery = useQuery({
    queryKey: ['invoices-exported'],
    queryFn: () => listInvoicesApi({ processingStatus: 'EXPORTED', limit: 100 }),
  });
  const exported = (exportedQuery.data?.data ?? []) as InvoiceListItem[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Export</h1>
        <p className="text-gray-500 mt-1">Daten für Steuerberater exportieren (CSV, BMD)</p>
      </div>

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

      {/* Export format options */}
      <h2 className="text-lg font-semibold mb-4">Exportformat wählen</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-5 hover:border-primary-300 transition-colors cursor-pointer">
          <h3 className="font-medium mb-1">BMD CSV</h3>
          <p className="text-sm text-gray-500 mb-3">Semikolon-getrennt, ISO-8859-1, dd.MM.yyyy</p>
          <button className="btn-primary text-sm w-full" disabled={exportable.length === 0}>
            BMD-Export starten
          </button>
        </div>

        <div className="card p-5 hover:border-primary-300 transition-colors cursor-pointer">
          <h3 className="font-medium mb-1">BMD XML</h3>
          <p className="text-sm text-gray-500 mb-3">BMD-kompatibles XML-Format</p>
          <button className="btn-secondary text-sm w-full" disabled>
            Demnächst verfügbar
          </button>
        </div>

        <div className="card p-5 hover:border-primary-300 transition-colors cursor-pointer">
          <h3 className="font-medium mb-1">CSV Generisch</h3>
          <p className="text-sm text-gray-500 mb-3">Universelles CSV für andere Systeme</p>
          <button className="btn-secondary text-sm w-full" disabled>
            Demnächst verfügbar
          </button>
        </div>
      </div>

      {/* Exportable invoices list */}
      {exportable.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-4">Exportbereite Rechnungen</h2>
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
        </>
      )}
    </div>
  );
}
