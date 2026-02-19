import { ArrowLeftRight } from 'lucide-react';

export function MatchingPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Abgleich</h1>
        <p className="text-gray-500 mt-1">Rechnungen mit Banktransaktionen abgleichen</p>
      </div>

      <div className="card p-12 text-center">
        <ArrowLeftRight className="mx-auto text-gray-300 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Kein Abgleich möglich</h3>
        <p className="text-gray-500">
          Lade zuerst Rechnungen und Kontoauszüge hoch, um den Abgleich zu starten.
        </p>
      </div>
    </div>
  );
}
