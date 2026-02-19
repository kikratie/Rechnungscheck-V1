import { FileText, Upload } from 'lucide-react';

export function InvoicesPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rechnungen</h1>
          <p className="text-gray-500 mt-1">Rechnungen hochladen, prüfen und verwalten</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Upload size={18} />
          Rechnung hochladen
        </button>
      </div>

      {/* Empty State */}
      <div className="card p-12 text-center">
        <FileText className="mx-auto text-gray-300 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Rechnungen vorhanden</h3>
        <p className="text-gray-500 mb-6">
          Lade deine erste Rechnung hoch, um die KI-Analyse zu starten.
        </p>
        <button className="btn-primary">Erste Rechnung hochladen</button>
      </div>
    </div>
  );
}
