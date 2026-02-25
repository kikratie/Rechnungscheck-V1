import { Receipt } from 'lucide-react';

export function UvaReportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">UVA-Bericht</h1>
        <p className="text-gray-500 mt-1">Umsatzsteuervoranmeldung</p>
      </div>

      <div className="card p-12 text-center">
        <Receipt size={48} className="mx-auto mb-4 text-gray-300" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Kommt bald</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          Die automatische UVA-Berechnung wird in einer zukünftigen Version verfügbar sein.
          Die Vorsteuer-Übersicht finden Sie aktuell im Monatsreport unter Export.
        </p>
      </div>
    </div>
  );
}
