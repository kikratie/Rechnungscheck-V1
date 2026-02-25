import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Camera,
  Inbox,
  FileSearch,
  ArrowLeftRight,
  MoreHorizontal,
  Users,
  UserCheck,
  Landmark,
  Download,
  BookOpen,
  ClipboardList,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { BottomSheet } from './BottomSheet';

interface TabItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end?: boolean;
  isCenter?: boolean;
}

const mainTabs: TabItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/inbox', icon: Inbox, label: 'Eingang' },
  { to: '/scan', icon: Camera, label: 'Scannen', isCenter: true },
  { to: '/invoices', icon: FileSearch, label: 'Prüfung' },
  { to: '__more__', icon: MoreHorizontal, label: 'Mehr' },
];

const moreItems = [
  { to: '/matching', icon: ArrowLeftRight, label: 'Zahlungs-Check' },
  { to: '/vendors', icon: Users, label: 'Lieferanten' },
  { to: '/customers', icon: UserCheck, label: 'Kunden' },
  { to: '/bank-statements', icon: Landmark, label: 'Kontoauszüge' },
  { to: '/accounts', icon: BookOpen, label: 'Kontenplan' },
  { to: '/export', icon: Download, label: 'Export' },
  { to: '/audit-log', icon: ClipboardList, label: 'Audit-Log' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
];

export function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-end justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {mainTabs.map((tab) => {
          if (tab.to === '__more__') {
            return (
              <button
                key="more"
                onClick={() => setMoreOpen(true)}
                className="flex flex-col items-center justify-center py-2 px-1 min-w-[64px] text-gray-400"
              >
                <tab.icon size={22} />
                <span className="text-[10px] mt-0.5">{tab.label}</span>
              </button>
            );
          }

          if (tab.isCenter) {
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className="flex flex-col items-center justify-center -mt-4 px-1"
              >
                <div className="w-14 h-14 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                  <tab.icon size={26} />
                </div>
                <span className="text-[10px] mt-0.5 text-primary-600 font-medium">{tab.label}</span>
              </NavLink>
            );
          }

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 px-1 min-w-[64px] ${
                  isActive ? 'text-primary-600' : 'text-gray-400'
                }`
              }
            >
              <tab.icon size={22} />
              <span className="text-[10px] mt-0.5">{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* "Mehr" Bottom Sheet */}
      <BottomSheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="Mehr">
        <div className="space-y-1">
          {moreItems.map((item) => (
            <button
              key={item.to}
              onClick={() => {
                setMoreOpen(false);
                navigate(item.to);
              }}
              className="flex items-center gap-4 w-full px-3 py-3.5 rounded-xl text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <item.icon size={22} className="text-gray-500" />
              <span className="text-base font-medium">{item.label}</span>
            </button>
          ))}

          <div className="border-t border-gray-100 mt-2 pt-2">
            <button
              onClick={() => {
                setMoreOpen(false);
                logout();
                navigate('/login');
              }}
              className="flex items-center gap-4 w-full px-3 py-3.5 rounded-xl text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
            >
              <LogOut size={22} />
              <span className="text-base font-medium">Abmelden</span>
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
