import { Download } from 'lucide-react';

export function ExportPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Export</h1>
        <p className="text-gray-500 mt-1">Daten für Steuerberater exportieren (CSV, BMD)</p>
      </div>

      <div className="card p-12 text-center">
        <Download className="mx-auto text-gray-300 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Keine exportierbaren Daten</h3>
        <p className="text-gray-500">
          Verarbeite zuerst Rechnungen, um einen Export zu erstellen.
        </p>
      </div>
    </div>
  );
}
