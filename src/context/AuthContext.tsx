import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { ClassSection, UserRole } from '../types';

interface AuthUser {
  user_id: string;
  username: string;
  name: string;
  role: UserRole;
  academic_years: string[];
  class_sections: ClassSection[];
  active_academic_year: string;
  class_ids: string[];
  active_class_id: string;
  active_class_section_id: string;
  class_id: string;
}

interface AuthContextType {
  user: AuthUser | null;
  activeAcademicYear: string | null;
  allowedAcademicYears: string[];
  activeClassId: string | null;
  allowedClassIds: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  isLogoutModalOpen: boolean;
  login: (username: string, password: string) => Promise<void>;
  setActiveAcademicYear: (year: string) => Promise<void>;
  setActiveClass: (classId: string) => Promise<void>;
  requestLogout: () => void;
  cancelLogout: () => void;
  confirmLogout: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(raw: any): AuthUser {
  const years = Array.isArray(raw?.academic_years) ? raw.academic_years.map(String).filter(Boolean) : [];
  const activeYear = String(raw?.active_academic_year || years[0] || '');
  const classes = Array.isArray(raw?.class_ids) ? raw.class_ids.map(String).filter(Boolean) : [];
  const activeClass = String(raw?.active_class_id || raw?.class_id || classes[0] || '');
  return {
    user_id: String(raw?.user_id || ''),
    username: String(raw?.username || ''),
    name: String(raw?.name || 'Guru'),
    role: 'GURU',
    academic_years: years,
    class_sections: Array.isArray(raw?.class_sections) ? raw.class_sections : [],
    active_academic_year: activeYear,
    class_ids: classes,
    active_class_id: activeClass,
    active_class_section_id: String(raw?.active_class_section_id || ''),
    class_id: activeClass
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const applyUser = (raw: any) => {
    const next = normalizeUser(raw);
    setUser(next);
    api.setActiveAcademicYear(next.active_academic_year || null);
    api.setActiveClassId(next.active_class_id || null);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const bootstrap = await api.getBootstrap();
        applyUser(bootstrap.user);
      } catch {
        try {
          applyUser((await api.validateSession()).user);
        } catch {
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
    const expired = () => { setUser(null); setIsLogoutModalOpen(false); };
    window.addEventListener('tabungan:session_expired', expired);
    return () => window.removeEventListener('tabungan:session_expired', expired);
  }, []);

  const login = async (username: string, password: string) => {
    const authData = await api.login(username, password);
    try {
      const bootstrap = await api.getBootstrap();
      applyUser(bootstrap.user);
    } catch {
      applyUser(authData.user);
    }
  };

  const setActiveAcademicYear = async (year: string) => {
    if (!user || !user.academic_years.includes(year)) throw new Error('Tahun pelajaran tidak termasuk akses akun ini.');
    api.setActiveAcademicYear(year); api.setActiveClassId(null);
    try {
      const bootstrap = await api.getBootstrap();
      applyUser(bootstrap.user);
    } catch {
      applyUser((await api.validateSession()).user);
    }
  };

  const setActiveClass = async (classId: string) => {
    if (!user || !user.class_ids.includes(classId)) throw new Error('Kelas tidak termasuk akses akun pada tahun pelajaran aktif.');
    api.setActiveClassId(classId);
    try {
      const bootstrap = await api.getBootstrap();
      applyUser(bootstrap.user);
    } catch {
      applyUser((await api.validateSession()).user);
    }
  };

  const requestLogout = () => setIsLogoutModalOpen(true);
  const cancelLogout = () => { if (!isLoggingOut) setIsLogoutModalOpen(false); };
  const confirmLogout = async () => { setIsLoggingOut(true); try { await api.logout(); setUser(null); setIsLogoutModalOpen(false); } finally { setIsLoggingOut(false); } };
  const logout = async () => requestLogout();
  const refreshUser = async () => {
    try {
      const bootstrap = await api.getBootstrap();
      applyUser(bootstrap.user);
    } catch {
      try { applyUser((await api.validateSession()).user); } catch { setUser(null); }
    }
  };

  return <AuthContext.Provider value={{
    user,
    activeAcademicYear: user?.active_academic_year || null,
    allowedAcademicYears: user?.academic_years || [],
    activeClassId: user?.active_class_id || null,
    allowedClassIds: user?.class_ids || [],
    isAuthenticated: !!user, isLoading, isLoggingOut, isLogoutModalOpen,
    login, setActiveAcademicYear, setActiveClass, requestLogout, cancelLogout, confirmLogout, logout, refreshUser
  }}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => { const c = useContext(AuthContext); if (!c) throw new Error('useAuth must be used within an AuthProvider'); return c; };
