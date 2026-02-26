import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useIsMobile } from '../../hooks/useIsMobile';
import { logoutApi } from '../../api/auth';
import { getAccessibleTenantsApi } from '../../api/tenant';
import { getAdminTenantsApi } from '../../api/admin';
import { BottomTabBar } from '../mobile/BottomTabBar';
import { useAccountingType } from '../../hooks/useAccountingType';
import { useFeatureFilter } from '../../hooks/useFeatureVisible';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileSearch,
  Inbox,
  Users,
  UserCheck,
  Building2,
  ArrowLeftRight,
  Download,
  ScrollText,
  Settings,
  LogOut,
  BookOpen,
  Receipt,
  Shield,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  featureKey?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function AppLayout() {
  const { user, refreshToken, logout, activeTenantId, accessibleTenants, setActiveTenant, setAccessibleTenants } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const isMobile = useIsMobile();
  const accountingType = useAccountingType();

  const isTaxAdvisor = user?.role === 'TAX_ADVISOR';
  const isSuperAdmin = !!user?.isSuperAdmin;
  const isFeatureVisible = useFeatureFilter();

  // Build navigation groups based on accountingType, filtered by feature visibility
  const navGroups: NavGroup[] = [
    {
      label: 'Hauptprozess',
      items: [
        { to: '/inbox', label: 'A: Rechnungseingang', icon: Inbox, featureKey: 'inbox' },
        { to: '/invoices', label: 'B: Rechnungs-Check', icon: FileSearch, featureKey: 'invoiceCheck' },
        { to: '/matching', label: 'C: Zahlungs-Check', icon: ArrowLeftRight, featureKey: 'paymentCheck' },
      ],
    },
    {
      label: 'Stammdaten',
      items: [
        { to: '/vendors', label: 'Lieferanten', icon: Users, featureKey: 'vendors' },
        { to: '/customers', label: 'Kunden', icon: UserCheck, featureKey: 'customers' },
        { to: '/bank-statements', label: 'Kontoauszüge', icon: Building2 },
        { to: '/accounts', label: 'Kontenplan', icon: BookOpen, featureKey: 'accounts' },
      ],
    },
    {
      label: 'Berichte & Export',
      items: [
        { to: '/export', label: 'Export', icon: Download, featureKey: 'export' },
        ...(accountingType === 'EA'
          ? [{ to: '/tax/uva', label: 'UVA-Bericht', icon: Receipt, featureKey: 'uvaReport' }]
          : []),
      ],
    },
    {
      label: 'System',
      items: [
        { to: '/audit-log', label: 'Audit-Log', icon: ScrollText, featureKey: 'auditLog' },
        { to: '/settings', label: 'Einstellungen', icon: Settings },
      ],
    },
    ...(isSuperAdmin ? [{
      label: 'Super-Admin',
      items: [
        { to: '/admin', label: 'Mandanten', icon: Shield },
      ],
    }] : []),
  ].map(group => ({
    ...group,
    items: group.items.filter(item => isFeatureVisible(item.featureKey)),
  })).filter(group => group.items.length > 0);

  const allNavItems = navGroups.flatMap((g) => g.items);

  // Load accessible tenants for Super-Admin or TAX_ADVISOR
  useEffect(() => {
    if (isSuperAdmin) {
      getAdminTenantsApi().then((tenants) => {
        setAccessibleTenants(tenants.map((t) => ({
          tenantId: t.id,
          name: t.name,
          slug: t.slug,
          accessLevel: 'ADMIN',
        })));
      }).catch(() => {});
    } else if (isTaxAdvisor) {
      getAccessibleTenantsApi().then(setAccessibleTenants).catch(() => {});
    }
  }, [isSuperAdmin, isTaxAdvisor, setAccessibleTenants]);

  // Get current page title for mobile header
  const currentPage = allNavItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  );

  const handleLogout = async () => {
    if (refreshToken) {
      try {
        await logoutApi(refreshToken);
      } catch {
        // Logout trotzdem fortsetzen
      }
    }
    logout();
    navigate('/login');
  };

  const handleTenantSwitch = (tenantId: string) => {
    setActiveTenant(tenantId === 'own' ? null : tenantId);
    // Reload data by navigating to dashboard
    navigate('/');
    window.location.reload();
  };

  // Reset scroll on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar — only rendered on desktop */}
      {!isMobile && (
        <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
          {/* Logo */}
          <div className="p-6 border-b border-gray-800">
            <h1 className="text-xl font-bold">Ki2Go</h1>
            <p className="text-xs text-gray-400 mt-1">{user?.tenantName}</p>
            {/* Tenant switcher for Super-Admin or TAX_ADVISOR */}
            {(isSuperAdmin || isTaxAdvisor) && accessibleTenants.length > 0 && (
              <select
                value={activeTenantId || 'own'}
                onChange={(e) => handleTenantSwitch(e.target.value)}
                className="mt-2 w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-700 focus:border-primary-500 focus:outline-none"
              >
                <option value="own">Eigener Mandant</option>
                {accessibleTenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.name}{!isSuperAdmin ? ` (${t.accessLevel === 'READ' ? 'Lesen' : 'Schreiben'})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Dashboard link */}
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <LayoutDashboard size={18} />
              Dashboard
            </NavLink>

            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`
                      }
                    >
                      <item.icon size={18} />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* User Info + Logout */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
                title="Abmelden"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top header — simple title bar */}
        {isMobile && (
          <header
            className="flex items-center px-4 bg-white border-b border-gray-200 sticky top-0 z-30"
            style={{ minHeight: '56px', paddingTop: 'var(--safe-area-top)' }}
          >
            <h1 className="text-lg font-bold text-primary-600">Ki2Go</h1>
            {currentPage && currentPage.to !== '/' && (
              <span className="ml-2 text-sm text-gray-400 font-medium">
                {currentPage.label}
              </span>
            )}
          </header>
        )}

        {/* Offline banner */}
        {!isOnline && (
          <div className="bg-yellow-100 border-b border-yellow-300 text-yellow-800 text-center text-sm py-2 px-4">
            Keine Internetverbindung
          </div>
        )}

        {/* Tenant context banner when viewing another tenant */}
        {activeTenantId && (
          <div className="bg-blue-100 border-b border-blue-300 text-blue-800 text-center text-sm py-2 px-4">
            Sie sehen Daten von: <strong>{accessibleTenants.find((t) => t.tenantId === activeTenantId)?.name || 'Anderer Mandant'}</strong>
            <button
              onClick={() => handleTenantSwitch('own')}
              className="ml-2 underline hover:text-blue-600"
            >
              Zurück
            </button>
          </div>
        )}

        {/* Page content — bottom padding for BottomTabBar on mobile */}
        <main className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
          <div className={isMobile ? 'p-4' : 'p-4 sm:p-6 lg:p-8'}>
            <Outlet />
          </div>
        </main>

        {/* Bottom tab bar on mobile */}
        {isMobile && <BottomTabBar />}
      </div>
    </div>
  );
}
