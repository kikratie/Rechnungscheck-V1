import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { getDashboardStatsApi } from '../api/dashboard';
import { FileText, Building2, ArrowLeftRight, AlertTriangle, CheckCircle, XCircle, Clock, TrendingUp, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from '@buchungsai/shared';

export function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStatsApi,
  });

  const stats: DashboardStats | undefined = data?.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Willkommen zurück, {user?.firstName}!
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : stats ? (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
            <div className="card p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <FileText className="text-blue-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Rechnungen</p>
                  <p className="text-2xl font-bold">{stats.totalInvoices}</p>
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
                  <p className="text-2xl font-bold text-green-600">{stats.validationSummary.valid}</p>
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
                  <p className="text-2xl font-bold text-yellow-600">{stats.validationSummary.warning}</p>
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
                  <p className="text-2xl font-bold text-red-600">{stats.validationSummary.invalid}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Second row: matching + amount */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
            <div className="card p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <ArrowLeftRight className="text-purple-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Gematcht</p>
                  <p className="text-2xl font-bold">{stats.matchedInvoices} <span className="text-sm font-normal text-gray-400">/ {stats.totalInvoices}</span></p>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Clock className="text-orange-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Review nötig</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.pendingReview}</p>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <TrendingUp className="text-emerald-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Gesamtbetrag</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
                  {stats.foreignCurrencyCount > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">inkl. {stats.foreignCurrencyCount} Fremdwährungsrechnung{stats.foreignCurrencyCount > 1 ? 'en' : ''} (geschätzt)</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Recent Activity */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Letzte Aktivitäten</h2>
              {stats.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5">
                        <ActivityIcon type={activity.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-700 truncate">{activity.description}</p>
                        <p className="text-gray-400 text-xs">{formatTimeAgo(activity.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Noch keine Aktivitäten.</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Schnellzugriff</h2>
              <Link to="/invoices" className="card p-5 flex items-center gap-4 hover:border-primary-300 transition-colors">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="text-blue-600" size={20} />
                </div>
                <div>
                  <h3 className="font-medium">Rechnungen</h3>
                  <p className="text-sm text-gray-500">{stats.totalInvoices} Rechnungen, {stats.pendingReview} zur Prüfung</p>
                </div>
              </Link>

              <Link to="/bank-statements" className="card p-5 flex items-center gap-4 hover:border-primary-300 transition-colors">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Building2 className="text-green-600" size={20} />
                </div>
                <div>
                  <h3 className="font-medium">Kontoauszüge</h3>
                  <p className="text-sm text-gray-500">Banktransaktionen einsehen</p>
                </div>
              </Link>

              <Link to="/matching" className="card p-5 flex items-center gap-4 hover:border-primary-300 transition-colors">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ArrowLeftRight className="text-purple-600" size={20} />
                </div>
                <div>
                  <h3 className="font-medium">Abgleich</h3>
                  <p className="text-sm text-gray-500">{stats.matchedInvoices} gematcht, {stats.unmatchedInvoices} offen</p>
                </div>
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '0,00 €';
  return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `vor ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return `vor ${days}d`;
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'UPLOAD':
      return <FileText size={14} className="text-blue-500" />;
    case 'APPROVE':
    case 'CONFIRM':
      return <CheckCircle size={14} className="text-green-500" />;
    case 'UID_VALIDATION_FAILED':
      return <XCircle size={14} className="text-red-500" />;
    default:
      return <Clock size={14} className="text-gray-400" />;
  }
}
