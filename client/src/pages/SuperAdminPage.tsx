import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Shield, Building2, Users, FileText, Search, Plus, X,
  Loader2, CheckCircle2, XCircle, Eye, ToggleLeft, ToggleRight,
  Activity, Brain, Key, RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { FullScreenPanel } from '../components/mobile/FullScreenPanel';
import {
  getAdminTenantsApi,
  getAdminTenantDetailApi,
  createAdminTenantApi,
  updateAdminTenantApi,
  getAdminStatsApi,
  getAdminMetricsApi,
  getAdminLlmConfigApi,
} from '../api/admin';
import type { AdminTenantListItem, ServerMetrics, LlmConfig } from '../api/admin';

type ViewMode = 'list' | 'create';
type StatusFilter = 'all' | 'active' | 'inactive';

export function SuperAdminPage() {
  const { user, setActiveTenant, setAccessibleTenants } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Form state for creating a new tenant
  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    adminPassword: '',
    accountingType: 'EA' as 'EA' | 'ACCRUAL',
  });

  // Guard: only super-admins
  if (!user?.isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  // Queries
  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: getAdminTenantsApi,
  });

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getAdminStatsApi,
  });

  const { data: tenantDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'tenant', selectedId],
    queryFn: () => getAdminTenantDetailApi(selectedId!),
    enabled: !!selectedId,
  });

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: getAdminMetricsApi,
    staleTime: 30_000,
  });

  const { data: llmConfig } = useQuery({
    queryKey: ['admin', 'llm-config'],
    queryFn: getAdminLlmConfigApi,
    staleTime: 120_000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createAdminTenantApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setViewMode('list');
      setForm({ tenantName: '', tenantSlug: '', adminEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '', accountingType: 'EA' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean } }) =>
      updateAdminTenantApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  // Filter tenants
  const filteredTenants = tenants.filter((t: AdminTenantListItem) => {
    if (statusFilter === 'active' && !t.isActive) return false;
    if (statusFilter === 'inactive' && t.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
    }
    return true;
  });

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] || c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, tenantName: name, tenantSlug: slug }));
  };

  const handleCreate = () => {
    createMutation.mutate(form);
  };

  const handleToggleActive = (tenant: AdminTenantListItem) => {
    updateMutation.mutate({ id: tenant.id, data: { isActive: !tenant.isActive } });
  };

  const handleViewAsTenant = (tenantId: string) => {
    // Set active tenant and update accessible tenants list for the banner
    setActiveTenant(tenantId);
    const tenant = tenants.find((t: AdminTenantListItem) => t.id === tenantId);
    if (tenant) {
      setAccessibleTenants([{ tenantId: tenant.id, name: tenant.name, slug: tenant.slug, accessLevel: 'ADMIN' }]);
    }
    navigate('/');
    window.location.reload();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // ── Detail Panel ──
  const DetailPanel = () => {
    if (viewMode === 'create') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Neuer Mandant</h3>
            <button onClick={() => setViewMode('list')} className="p-1 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firmenname *</label>
              <input
                className="input-field"
                value={form.tenantName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Muster GmbH"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                className="input-field"
                value={form.tenantSlug}
                onChange={(e) => setForm((f) => ({ ...f, tenantSlug: e.target.value }))}
                placeholder="muster-gmbh"
              />
              <p className="text-xs text-gray-400 mt-0.5">Automatisch generiert, kann angepasst werden</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buchhaltungsart</label>
              <select
                className="input-field"
                value={form.accountingType}
                onChange={(e) => setForm((f) => ({ ...f, accountingType: e.target.value as 'EA' | 'ACCRUAL' }))}
              >
                <option value="EA">Einnahmen-Ausgaben-Rechnung</option>
                <option value="ACCRUAL">Doppelte Buchhaltung</option>
              </select>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-sm font-medium text-gray-600 mb-2">Admin-Benutzer</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
                <input
                  className="input-field"
                  value={form.adminFirstName}
                  onChange={(e) => setForm((f) => ({ ...f, adminFirstName: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nachname *</label>
                <input
                  className="input-field"
                  value={form.adminLastName}
                  onChange={(e) => setForm((f) => ({ ...f, adminLastName: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail *</label>
              <input
                className="input-field"
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                placeholder="admin@firma.at"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort *</label>
              <input
                className="input-field"
                type="password"
                value={form.adminPassword}
                onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                placeholder="Min. 8 Zeichen"
              />
            </div>
          </div>

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {(createMutation.error as Error)?.message || 'Fehler beim Erstellen'}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={createMutation.isPending || !form.tenantName || !form.adminEmail || !form.adminPassword}
            className="btn-primary w-full"
          >
            {createMutation.isPending ? (
              <Loader2 className="animate-spin mx-auto" size={18} />
            ) : (
              'Mandant erstellen'
            )}
          </button>
        </div>
      );
    }

    if (!selectedId || !tenantDetail) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <Building2 size={48} className="mb-3" />
          <p>Mandant auswählen oder neuen erstellen</p>
        </div>
      );
    }

    if (detailLoading) {
      return (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{tenantDetail.name}</h3>
          <button onClick={() => setSelectedId(null)} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Tenant Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Slug</span>
            <p className="font-medium">{tenantDetail.slug}</p>
          </div>
          <div>
            <span className="text-gray-500">Buchhaltung</span>
            <p className="font-medium">{tenantDetail.accountingType === 'EA' ? 'E/A-Rechnung' : 'Doppik'}</p>
          </div>
          <div>
            <span className="text-gray-500">Erstellt</span>
            <p className="font-medium">{formatDate(tenantDetail.createdAt)}</p>
          </div>
          <div>
            <span className="text-gray-500">Onboarding</span>
            <p className="font-medium">{tenantDetail.onboardingComplete ? 'Abgeschlossen' : 'Offen'}</p>
          </div>
          <div>
            <span className="text-gray-500">Rechnungen</span>
            <p className="font-medium">{tenantDetail._count.invoices}</p>
          </div>
          <div>
            <span className="text-gray-500">Status</span>
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${tenantDetail.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">{tenantDetail.isActive ? 'Aktiv' : 'Inaktiv'}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleViewAsTenant(tenantDetail.id)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Eye size={16} />
            Als Mandant anzeigen
          </button>
          <button
            onClick={() => handleToggleActive(tenantDetail)}
            disabled={updateMutation.isPending}
            className={`btn-secondary flex items-center gap-2 text-sm ${
              tenantDetail.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
            }`}
          >
            {tenantDetail.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {tenantDetail.isActive ? 'Deaktivieren' : 'Aktivieren'}
          </button>
        </div>

        {/* Users */}
        <div>
          <h4 className="text-sm font-semibold text-gray-600 mb-2">
            Benutzer ({tenantDetail.users.length})
          </h4>
          <div className="space-y-1.5">
            {tenantDetail.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{u.firstName} {u.lastName}</p>
                  <p className="text-gray-500 text-xs">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                    u.role === 'TAX_ADVISOR' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {u.role}
                  </span>
                  {!u.isActive && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Inaktiv</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bank Accounts */}
        {tenantDetail.bankAccounts.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-600 mb-2">
              Bankkonten ({tenantDetail.bankAccounts.length})
            </h4>
            <div className="space-y-1.5">
              {tenantDetail.bankAccounts.map((ba) => (
                <div key={ba.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{ba.label}</p>
                    {ba.iban && <p className="text-gray-500 text-xs">{ba.iban}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{ba.accountType}</span>
                    {ba.isPrimary && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">Primär</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Main Render ──
  return (
    <div>
      {/* Stats Cards */}
      <div className="flex items-center gap-3 mb-6">
        {!isMobile && <Shield className="text-primary-600" size={28} />}
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Super-Admin</h1>
          <p className="text-sm text-gray-500">Mandanten-Verwaltung</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card p-4 text-center">
            <Building2 className="mx-auto text-primary-500 mb-1" size={24} />
            <p className="text-2xl font-bold">{stats.tenantCount}</p>
            <p className="text-xs text-gray-500">Mandanten</p>
          </div>
          <div className="card p-4 text-center">
            <Users className="mx-auto text-blue-500 mb-1" size={24} />
            <p className="text-2xl font-bold">{stats.userCount}</p>
            <p className="text-xs text-gray-500">Benutzer</p>
          </div>
          <div className="card p-4 text-center">
            <FileText className="mx-auto text-green-500 mb-1" size={24} />
            <p className="text-2xl font-bold">{stats.invoiceCount}</p>
            <p className="text-xs text-gray-500">Rechnungen</p>
          </div>
        </div>
      )}

      {/* Server Metrics + LLM Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Performance Metrics */}
        {metrics && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-green-600" />
                <h3 className="font-semibold text-sm">Server-Performance</h3>
              </div>
              <button
                onClick={() => refetchMetrics()}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Aktualisieren"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-800">{metrics.requests.total.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Requests</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-800">{metrics.requests.errorRate}</p>
                <p className="text-xs text-gray-500">Fehlerrate</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-gray-800">{metrics.uptime.human}</p>
                <p className="text-xs text-gray-500">Uptime</p>
              </div>
            </div>
            {metrics.topRoutes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Top-Routen</p>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {metrics.topRoutes.slice(0, 5).map((route) => (
                    <div key={route.path} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-mono truncate max-w-[180px]">{route.path}</span>
                      <div className="flex items-center gap-3 text-gray-500 shrink-0">
                        <span>{route.count}x</span>
                        <span>{route.avgMs.toFixed(0)}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LLM Configuration */}
        {llmConfig && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={18} className="text-purple-600" />
              <h3 className="font-semibold text-sm">KI-Konfiguration</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs text-gray-500">Provider</p>
                  <p className="font-medium text-sm">{llmConfig.provider}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Modell</p>
                  <p className="font-medium text-sm">{llmConfig.model}</p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Key size={14} className="text-gray-400" />
                  <span className="text-sm">API-Key</span>
                </div>
                <div className="flex items-center gap-2">
                  {llmConfig.apiKeyConfigured ? (
                    <>
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span className="text-sm text-green-700 font-mono">{llmConfig.apiKeyPreview}</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={14} className="text-red-400" />
                      <span className="text-sm text-red-600">Nicht konfiguriert</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: FullScreenPanel for detail */}
      {isMobile && (
        <FullScreenPanel
          isOpen={!!selectedId || viewMode === 'create'}
          onClose={() => { setSelectedId(null); setViewMode('list'); }}
          title={viewMode === 'create' ? 'Neuer Mandant' : 'Mandant'}
        >
          <div className="p-4">
            <DetailPanel />
          </div>
        </FullScreenPanel>
      )}

      {/* Main Content: List + Detail */}
      <div className={isMobile ? '' : 'flex gap-6 h-[calc(100vh-20rem)]'}>
        {/* Tenant List */}
        <div className={isMobile ? '' : `flex flex-col ${selectedId || viewMode === 'create' ? 'w-1/2' : 'w-full'} transition-all`}>
          {/* Search + Actions */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                className="input-field pl-9"
                placeholder="Mandant suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input-field w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Alle</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
            <button
              onClick={() => { setViewMode('create'); setSelectedId(null); }}
              className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus size={16} />
              {!isMobile && 'Neuer Mandant'}
            </button>
          </div>

          {/* Table / Cards */}
          {tenantsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin text-primary-600" size={32} />
            </div>
          ) : (
            <div className={isMobile ? 'space-y-2' : 'overflow-auto'}>
              {isMobile ? (
                // Mobile: Cards
                filteredTenants.map((t: AdminTenantListItem) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedId(t.id); setViewMode('list'); }}
                    className={`card p-3 w-full text-left transition-colors ${
                      selectedId === t.id ? 'ring-2 ring-primary-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-xs text-gray-400">{t.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.isActive ? (
                          <CheckCircle2 size={16} className="text-green-500" />
                        ) : (
                          <XCircle size={16} className="text-red-400" />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                      <span>{t._count.users} User</span>
                      <span>{t._count.invoices} Rechnungen</span>
                      <span>{t.accountingType}</span>
                    </div>
                  </button>
                ))
              ) : (
                // Desktop: Table
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Mandant</th>
                      <th className="pb-2 font-medium">Slug</th>
                      <th className="pb-2 font-medium text-center">Status</th>
                      <th className="pb-2 font-medium text-center">Typ</th>
                      <th className="pb-2 font-medium text-center">User</th>
                      <th className="pb-2 font-medium text-center">Rechnungen</th>
                      <th className="pb-2 font-medium">Erstellt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((t: AdminTenantListItem) => (
                      <tr
                        key={t.id}
                        onClick={() => { setSelectedId(t.id); setViewMode('list'); }}
                        className={`border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 ${
                          selectedId === t.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <td className="py-2.5 font-medium">{t.name}</td>
                        <td className="py-2.5 text-gray-500">{t.slug}</td>
                        <td className="py-2.5 text-center">
                          {t.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle2 size={12} /> Aktiv
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                              <XCircle size={12} /> Inaktiv
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-center text-gray-500">{t.accountingType}</td>
                        <td className="py-2.5 text-center">{t._count.users}</td>
                        <td className="py-2.5 text-center">{t._count.invoices}</td>
                        <td className="py-2.5 text-gray-500">{formatDate(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {filteredTenants.length === 0 && (
                <div className="text-center text-gray-400 py-12">
                  {search ? 'Keine Mandanten gefunden' : 'Noch keine Mandanten vorhanden'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop: Detail Panel */}
        {!isMobile && (selectedId || viewMode === 'create') && (
          <div className="w-1/2 card p-6 overflow-auto">
            <DetailPanel />
          </div>
        )}
      </div>
    </div>
  );
}
