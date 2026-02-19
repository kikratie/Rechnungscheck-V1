import { Building2, Upload } from 'lucide-react';

export function BankStatementsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontoauszüge</h1>
          <p className="text-gray-500 mt-1">Bank-Kontoauszüge importieren und verwalten</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Upload size={18} />
          Kontoauszug importieren
        </button>
      </div>

      <div className="card p-12 text-center">
        <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Kontoauszüge vorhanden</h3>
        <p className="text-gray-500 mb-6">
          Importiere einen CSV-Kontoauszug für den automatischen Bankabgleich.
        </p>
        <button className="btn-primary">Ersten Kontoauszug importieren</button>
      </div>
    </div>
  );
}
