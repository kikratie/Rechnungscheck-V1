import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useIsMobile } from '../../hooks/useIsMobile';
import { logoutApi } from '../../api/auth';
import { BottomTabBar } from '../mobile/BottomTabBar';
import {
  LayoutDashboard,
  FileText,
  Users,
  UserCheck,
  Building2,
  ArrowLeftRight,
  Download,
  ScrollText,
  Settings,
  LogOut,
  Camera,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/scan', label: 'Scannen', icon: Camera },
  { to: '/invoices', label: 'Rechnungen', icon: FileText },
  { to: '/vendors', label: 'Lieferanten', icon: Users },
  { to: '/customers', label: 'Kunden', icon: UserCheck },
  { to: '/bank-statements', label: 'Kontoauszüge', icon: Building2 },
  { to: '/matching', label: 'Abgleich', icon: ArrowLeftRight },
  { to: '/export', label: 'Export', icon: Download },
  { to: '/audit-log', label: 'Audit-Log', icon: ScrollText },
  { to: '/settings', label: 'Einstellungen', icon: Settings },
];

export function AppLayout() {
  const { user, refreshToken, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const isMobile = useIsMobile();

  // Get current page title for mobile header
  const currentPage = navItems.find((item) =>
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
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
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
