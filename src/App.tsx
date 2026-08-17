import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { StudentsView } from './components/StudentsView';
import { TransactionView } from './components/TransactionView';
import { StudentDetailView } from './components/StudentDetailView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { NavTab, AppSettings } from './types';
import { api } from './lib/api';
import { AnimatePresence, motion } from 'motion/react';

const MainAppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Quick transaction trigger states
  const [transactionInitialStudentId, setTransactionInitialStudentId] = useState<string | undefined>(undefined);
  const [transactionInitialType, setTransactionInitialType] = useState<'SETORAN' | 'PENARIKAN'>('SETORAN');

  // Add student modal trigger from dashboard
  const [openAddStudentDirectly, setOpenAddStudentDirectly] = useState(false);

  // Settings metadata for navbar
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    // Register PWA Service Worker if supported
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    }

    if (isAuthenticated) {
      api.getSettings().then(setSettings).catch(() => {});
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
          <p className="text-xs font-bold text-emerald-200/80">Memuat Tabungan Siswa...</p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!isAuthenticated ? (
        <motion.div
          key="auth-login-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <LoginView />
        </motion.div>
      ) : (
        <motion.div
          key="auth-workspace-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-emerald-500 selection:text-white"
        >
          {/* Top and Bottom Navigation Bars */}
          <Navbar
            currentTab={currentTab}
            onSelectTab={(tab) => {
              setSelectedStudentId(null);
              setOpenAddStudentDirectly(false);
              setCurrentTab(tab);
            }}
            classNameTitle={settings?.class_name || 'Kelas 5A'}
            schoolName={settings?.school_name || 'SD Negeri 01 Teladan'}
          />

          {/* Main Container */}
          <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-5 pb-20 md:pb-10">
            <AnimatePresence mode="wait">
              {selectedStudentId ? (
                <motion.div
                  key={`student-detail-${selectedStudentId}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <StudentDetailView
                    studentId={selectedStudentId}
                    onBack={() => setSelectedStudentId(null)}
                    onOpenDeposit={(stId) => {
                      setSelectedStudentId(null);
                      setTransactionInitialStudentId(stId);
                      setTransactionInitialType('SETORAN');
                      setCurrentTab('transaction');
                    }}
                    onOpenWithdraw={(stId) => {
                      setSelectedStudentId(null);
                      setTransactionInitialStudentId(stId);
                      setTransactionInitialType('PENARIKAN');
                      setCurrentTab('transaction');
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={currentTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {currentTab === 'dashboard' && (
                    <DashboardView
                      onNavigate={(tab) => {
                        setSelectedStudentId(null);
                        setOpenAddStudentDirectly(false);
                        setCurrentTab(tab);
                      }}
                      onOpenDeposit={(stId) => {
                        setSelectedStudentId(null);
                        setTransactionInitialStudentId(stId);
                        setTransactionInitialType('SETORAN');
                        setCurrentTab('transaction');
                      }}
                      onOpenWithdraw={(stId) => {
                        setSelectedStudentId(null);
                        setTransactionInitialStudentId(stId);
                        setTransactionInitialType('PENARIKAN');
                        setCurrentTab('transaction');
                      }}
                      onSelectStudent={(stId) => setSelectedStudentId(stId)}
                      onOpenAddStudent={() => {
                        setOpenAddStudentDirectly(true);
                        setCurrentTab('students');
                      }}
                    />
                  )}

                  {currentTab === 'students' && (
                    <StudentsView
                      onSelectStudent={(stId) => setSelectedStudentId(stId)}
                      onOpenDeposit={(stId) => {
                        setSelectedStudentId(null);
                        setTransactionInitialStudentId(stId);
                        setTransactionInitialType('SETORAN');
                        setCurrentTab('transaction');
                      }}
                      onOpenWithdraw={(stId) => {
                        setSelectedStudentId(null);
                        setTransactionInitialStudentId(stId);
                        setTransactionInitialType('PENARIKAN');
                      }}
                      initialAddModalOpen={openAddStudentDirectly}
                      onCloseAddModal={() => setOpenAddStudentDirectly(false)}
                    />
                  )}

                  {currentTab === 'transaction' && (
                    <TransactionView
                      initialStudentId={transactionInitialStudentId}
                      initialType={transactionInitialType}
                      onGoToStudentDetail={(stId) => setSelectedStudentId(stId)}
                    />
                  )}

                  {currentTab === 'reports' && (
                    <ReportsView onSelectStudent={(stId) => setSelectedStudentId(stId)} />
                  )}

                  {currentTab === 'settings' && <SettingsView />}
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Global Animated Logout Confirmation Modal */}
          <LogoutConfirmModal />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainAppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
