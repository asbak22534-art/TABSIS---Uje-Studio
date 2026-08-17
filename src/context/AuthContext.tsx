import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface AuthUser {
  user_id: string;
  username: string;
  name: string;
  class_id: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  isLogoutModalOpen: boolean;
  login: (username: string, password: string) => Promise<void>;
  requestLogout: () => void;
  cancelLogout: () => void;
  confirmLogout: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  useEffect(() => {
    const initAuth = async () => {
      const token = api.getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await api.validateSession();
        setUser(res.user);
      } catch (err) {
        api.setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    const authSession = await api.login(username, password);
    setUser(authSession.user);
  };

  const requestLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const cancelLogout = () => {
    if (!isLoggingOut) {
      setIsLogoutModalOpen(false);
    }
  };

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Small graceful pause for smooth UI exit animation
      await new Promise((resolve) => setTimeout(resolve, 450));
      await api.logout();
      setUser(null);
      setIsLogoutModalOpen(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const logout = async () => {
    // Direct or fallback logout
    requestLogout();
  };

  const refreshUser = async () => {
    try {
      const res = await api.validateSession();
      setUser(res.user);
    } catch {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isLoggingOut,
        isLogoutModalOpen,
        login,
        requestLogout,
        cancelLogout,
        confirmLogout,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
