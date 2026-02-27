import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { getDashboardStatsApi } from '../api/dashboard';
import { getRecurringSummaryApi } from '../api/invoices';
import {
  TrendingUp, TrendingDown, Wallet, Landmark,
  FileText, Building2, ArrowLeftRight,
  CheckCircle, XCircle, Clock, Loader2, Repeat, AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { DashboardStats, DashboardPeriod, OpenInvoiceItem, RecurringCostsSummary } from '@buchungsai/shared';
import { RECURRING_INTERVALS } from '@buchungsai/shared';
import { useAccountingType } from '../hooks/useAccountingType';
import { getShareholderBalanceApi } from '../api/shareholderTransactions';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'currentMonth', label: 'Aktueller Monat' },
  { value: 'last30', label: 'Letzte 30 Tage' },
  { value: 'last60', label: 'Letzte 60 Tage' },
  { value: 'last90', label: 'Letzte 90 Tage' },
  { value: 'currentYear', label: 'Aktuelles Jahr' },
];

export function DashboardPage() {
  const { user } = useAuthStore();
  const accountingType = useAccountingType();
  const [period, setPeriod] = useState<DashboardPeriod>('currentMonth');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats', period],
    queryFn: () => getDashboardStatsApi(period),
  });

  const stats: DashboardStats | undefined = data?.data;

  const { data: recurringData } = useQuery({
    queryKey: ['recurring-summary'],
    queryFn: () => getRecurringSummaryApi(),
  });
  const recurringSummary: RecurringCostsSummary | undefined = recurringData?.data;

  // Shareholder balance (only for GmbH / ACCRUAL)
  const { data: shareholderBalance } = useQuery({
    queryKey: ['shareholder-balance'],
    queryFn: () => getShareholderBalanceApi(),
    enabled: accountingType === 'ACCRUAL',
    staleTime: 60_000,
  });

  return (
    <div>
      {/* Header with period filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 md:mb-8 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Willkommen zurück, {user?.firstName}!</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
          className="input-field w-auto"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : stats ? (
        <>
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
            <KpiCard
              label="Umsatz"
              value={formatCurrency(stats.revenue ?? '0')}
              icon={<TrendingUp size={24} />}
              accentClass="bg-green-100 text-green-600"
            />
            <KpiCard
              label="Kosten"
              value={formatCurrency(stats.costs ?? '0')}
              icon={<TrendingDown size={24} />}
              accentClass="bg-red-100 text-red-600"
            />
            <KpiCard
              label="Gewinn"
              value={formatCurrency(stats.profit ?? '0')}
              icon={<Wallet size={24} />}
              accentClass="bg-primary-100 text-primary-600"
              valueClass={Number(stats.profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}
            />
            <KpiCard
              label="Kontostand"
              value={stats.currentBalance != null ? formatCurrency(stats.currentBalance) : 'Kein Kontoauszug'}
              icon={<Landmark size={24} />}
              accentClass="bg-purple-100 text-purple-600"
              valueClass={stats.currentBalance == null ? 'text-gray-400 text-base' : undefined}
            />
          </div>

          {/* Cashflow Forecast Chart */}
          {stats.cashflowForecast && stats.cashflowForecast.length > 0 && (
            <div className="card p-4 md:p-6 mb-6 md:mb-8">
              <h2 className="text-lg font-semibold mb-4">Liquiditäts-Vorschau (30 Tage)</h2>
              <div className="h-56 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.cashflowForecast.map(p => ({
                    date: formatDateShort(p.date),
                    balance: Number(p.projectedBalance),
                  }))}>
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatCompactCurrency}
                      width={50}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(String(value)), 'Saldo']}
                      labelFormatter={(label) => `Datum: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="#2563eb"
                      strokeWidth={2}
                      fill="url(#balanceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top 5 Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
            <Top5Table
              title="Offene Forderungen"
              items={stats.topReceivables ?? []}
              emptyMessage="Keine offenen Forderungen"
            />
            <Top5Table
              title="Offene Verbindlichkeiten"
              items={stats.topPayables ?? []}
              emptyMessage="Keine offenen Verbindlichkeiten"
            />
          </div>

          {/* Shareholder Balance Widget (GmbH only) */}
          {accountingType === 'ACCRUAL' && shareholderBalance && (
            <div className="card p-4 md:p-6 mb-6 md:mb-8">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Building2 size={20} className="text-orange-600" />
                  Gesellschafter-Verrechnungskonto
                </h2>
                <Link to="/shareholder-account" className="text-sm text-primary-600 hover:underline">
                  Details
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <div>
                  <p className="text-xs text-gray-500">Offene Forderungen</p>
                  <p className={`text-lg font-bold ${parseFloat(shareholderBalance.totalReceivable) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(shareholderBalance.totalReceivable)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Offene Verbindlichkeiten</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(shareholderBalance.totalPayable)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Netto-Saldo</p>
                  <p className={`text-lg font-bold ${parseFloat(shareholderBalance.netBalance) > 0 ? 'text-red-600' : parseFloat(shareholderBalance.netBalance) < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                    {formatCurrency(shareholderBalance.netBalance)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Recurring Costs Widget (Laufende Kosten) */}
          {recurringSummary && recurringSummary.items.length > 0 && (
            <div className="card p-4 md:p-6 mb-6 md:mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Repeat size={20} className="text-purple-600" />
                  <h2 className="text-lg font-semibold">Laufende Kosten</h2>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Monatlich gesamt</p>
                  <p className="text-lg font-bold text-purple-600">{formatCurrency(recurringSummary.monthlyTotal)}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="pb-2 font-medium">Lieferant</th>
                      <th className="pb-2 font-medium text-right">Betrag</th>
                      <th className="pb-2 font-medium text-center hidden sm:table-cell">Intervall</th>
                      <th className="pb-2 font-medium text-right hidden md:table-cell">Nächste Fälligkeit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringSummary.items.map((item) => (
                      <tr key={item.recurringGroupId} className="border-b border-gray-50">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="truncate max-w-[180px] font-medium">{item.vendorName}</div>
                            {item.isOverdue && (
                              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                            )}
                          </div>
                          {item.recurringNote && (
                            <div className="text-xs text-gray-400 truncate max-w-[200px]">{item.recurringNote}</div>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-medium whitespace-nowrap">
                          {formatCurrency(item.lastGrossAmount)}
                        </td>
                        <td className="py-2.5 text-center hidden sm:table-cell">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                            {RECURRING_INTERVALS[item.recurringInterval as keyof typeof RECURRING_INTERVALS]?.label ?? item.recurringInterval}
                          </span>
                        </td>
                        <td className="py-2.5 text-right hidden md:table-cell">
                          {item.nextExpectedDate ? (
                            <span className={item.isOverdue ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                              {formatDateDE(item.nextExpectedDate)}
                              {item.isOverdue && ' (überfällig)'}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-center">
                <Link
                  to="/invoices?recurring=true"
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  Alle laufenden Kosten anzeigen
                </Link>
              </div>
            </div>
          )}

          {/* Secondary Stats (compact) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <MiniStat label="Rechnungen" value={stats.totalInvoices} />
            <MiniStat
              label="Gematcht"
              value={`${stats.matchedInvoices}/${stats.totalInvoices}`}
            />
            <MiniStat
              label="Review nötig"
              value={stats.pendingReview}
              highlight={stats.pendingReview > 0}
            />
            <MiniStat label="Geparkt" value={stats.parkedInvoices} />
          </div>

          {/* Validation Summary */}
          <div className="grid grid-cols-4 gap-2 md:gap-4 mb-6 md:mb-8">
            <div className="card p-3 text-center">
              <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-green-600">{stats.validationSummary.valid}</p>
              <p className="text-xs text-gray-500">Gültig</p>
            </div>
            <div className="card p-3 text-center">
              <div className="w-3 h-3 rounded-full bg-yellow-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-yellow-600">{stats.validationSummary.warning}</p>
              <p className="text-xs text-gray-500">Warnung</p>
            </div>
            <div className="card p-3 text-center">
              <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-red-600">{stats.validationSummary.invalid}</p>
              <p className="text-xs text-gray-500">Fehler</p>
            </div>
            <div className="card p-3 text-center">
              <div className="w-3 h-3 rounded-full bg-gray-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-600">{stats.validationSummary.pending}</p>
              <p className="text-xs text-gray-500">Offen</p>
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

// ========== Sub-Components ==========

function KpiCard({ label, value, icon, accentClass, valueClass }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accentClass: string;
  valueClass?: string;
}) {
  return (
    <div className="card p-5 md:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-lg ${accentClass}`}>{icon}</div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
      <p className={`text-xl md:text-2xl font-bold ${valueClass ?? 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function Top5Table({ title, items, emptyMessage }: {
  title: string;
  items: OpenInvoiceItem[];
  emptyMessage: string;
}) {
  return (
    <div className="card p-4 md:p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm py-4 text-center">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Partner</th>
                <th className="pb-2 font-medium text-right">Betrag</th>
                <th className="pb-2 font-medium text-right hidden sm:table-cell">Fällig</th>
                <th className="pb-2 font-medium text-right hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="py-2.5 pr-3">
                    <div className="truncate max-w-[160px]">{item.partnerName}</div>
                    {item.invoiceNumber && (
                      <div className="text-xs text-gray-400">{item.invoiceNumber}</div>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-medium whitespace-nowrap">
                    {formatCurrency(item.grossAmount)}
                  </td>
                  <td className="py-2.5 text-right hidden sm:table-cell text-gray-500 whitespace-nowrap">
                    {item.dueDate ? formatDateDE(item.dueDate) : '-'}
                  </td>
                  <td className="py-2.5 text-right hidden md:table-cell">
                    {item.daysOverdue > 0 ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        {item.daysOverdue}d überfällig
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">offen</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, highlight }: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-orange-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
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

// ========== Formatters ==========

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '0,00 €';
  return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(0)}k`;
  }
  return value.toFixed(0);
}

function formatDateShort(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function formatDateDE(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
