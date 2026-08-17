import React from 'react';
import { Home, Users, ArrowLeftRight, FileBarChart, Settings, LogOut, Wallet } from 'lucide-react';
import { NavTab } from '../types';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  classNameTitle?: string;
  schoolName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  classNameTitle = 'Kelas 5A',
  schoolName = 'SD Negeri 01 Teladan'
}) => {
  const { user, logout } = useAuth();

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Beranda', icon: <Home className="w-5 h-5" /> },
    { id: 'students', label: 'Siswa', icon: <Users className="w-5 h-5" /> },
    { id: 'transaction', label: 'Tabungan', icon: <ArrowLeftRight className="w-5 h-5" /> },
    { id: 'reports', label: 'Laporan', icon: <FileBarChart className="w-5 h-5" /> },
    { id: 'settings', label: 'Pengaturan', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* Top Header for Mobile and Desktop */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 md:h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 flex items-center justify-center text-white shadow-xs shrink-0 ring-1 ring-emerald-900/10">
              <Wallet className="w-5 h-5 md:w-5.5 md:h-5.5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 tracking-tight text-base md:text-lg block leading-none">
                TABUNGAN SISWA
              </span>
              <span className="text-[11px] font-medium text-emerald-800/80 hidden sm:inline-block mt-0.5">
                {classNameTitle} • {schoolName}
              </span>
            </div>
          </div>

          {/* Mobile Header Logout Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              id="logout-btn-mobile-header"
              onClick={logout}
              title="Keluar dari Akun"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => {
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-desktop-${item.id}`}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <button
              id="logout-btn-desktop"
              onClick={logout}
              title="Keluar"
              className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-xs font-semibold">Keluar</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 safe-area-pb shadow-lg">
        <div className="grid grid-cols-5 gap-1 max-w-lg mx-auto items-center">
          {navItems.map((item) => {
            const active = currentTab === item.id;
            const isSpecialTrx = item.id === 'transaction';

            if (isSpecialTrx) {
              return (
                <button
                  key={item.id}
                  id={`nav-mobile-${item.id}`}
                  onClick={() => onSelectTab(item.id)}
                  className="flex flex-col items-center justify-center -mt-5 relative group"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform duration-150 active:scale-95 ${
                      active
                        ? 'bg-emerald-700 text-white ring-4 ring-emerald-100'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    <ArrowLeftRight className="w-6 h-6" />
                  </div>
                  <span
                    className={`text-[10px] font-bold mt-1 tracking-tight ${
                      active ? 'text-emerald-700' : 'text-slate-600'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                id={`nav-mobile-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
                  active ? 'text-emerald-700' : 'text-slate-700 hover:text-slate-700'
                }`}
              >
                <div className={`p-1 rounded-lg ${active ? 'bg-emerald-50 text-emerald-700' : ''}`}>
                  {item.icon}
                </div>
                <span className={`text-[10px] font-medium tracking-tight mt-0.5 ${active ? 'font-bold text-emerald-700' : ''}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
