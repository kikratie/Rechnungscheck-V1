import { ScrollText } from 'lucide-react';

export function AuditLogPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Audit-Log</h1>
        <p className="text-gray-500 mt-1">Revisionssichere Protokollierung aller Aktionen</p>
      </div>

      <div className="card p-12 text-center">
        <ScrollText className="mx-auto text-gray-300 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Noch keine Einträge</h3>
        <p className="text-gray-500">
          Alle Aktionen werden automatisch protokolliert und hier angezeigt.
        </p>
      </div>
    </div>
  );
}
