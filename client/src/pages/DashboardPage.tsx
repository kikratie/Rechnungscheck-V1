import { useAuthStore } from '../store/authStore';
import { FileText, Building2, ArrowLeftRight, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Willkommen zurück, {user?.firstName}!
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileText className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Rechnungen</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Validiert</p>
              <p className="text-2xl font-bold text-green-600">0</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertTriangle className="text-yellow-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Warnungen</p>
              <p className="text-2xl font-bold text-yellow-600">0</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <XCircle className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Fehler</p>
              <p className="text-2xl font-bold text-red-600">0</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 hover:border-primary-300 transition-colors cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="text-primary-600" size={20} />
            <h3 className="font-semibold">Rechnung hochladen</h3>
          </div>
          <p className="text-sm text-gray-500">
            PDF oder Bild hochladen und automatisch per KI analysieren lassen.
          </p>
        </div>

        <div className="card p-6 hover:border-primary-300 transition-colors cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <Building2 className="text-primary-600" size={20} />
            <h3 className="font-semibold">Kontoauszug importieren</h3>
          </div>
          <p className="text-sm text-gray-500">
            CSV-Kontoauszug importieren für den automatischen Bankabgleich.
          </p>
        </div>

        <div className="card p-6 hover:border-primary-300 transition-colors cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <ArrowLeftRight className="text-primary-600" size={20} />
            <h3 className="font-semibold">Abgleich starten</h3>
          </div>
          <p className="text-sm text-gray-500">
            Rechnungen mit Banktransaktionen automatisch abgleichen.
          </p>
        </div>
      </div>
    </div>
  );
}
