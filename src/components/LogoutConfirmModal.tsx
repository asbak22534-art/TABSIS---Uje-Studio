import React from 'react';
import { LogOut, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const LogoutConfirmModal: React.FC = () => {
  const { user, isLogoutModalOpen, isLoggingOut, cancelLogout, confirmLogout } = useAuth();
  const { success } = useToast();

  const handleConfirm = async () => {
    await confirmLogout();
    success('Sampai Jumpa!', 'Anda telah berhasil keluar dari sesi akun.');
  };

  return (
    <AnimatePresence>
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isLoggingOut ? undefined : cancelLogout}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 z-10 max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden"
          >
            {/* Header Icon */}
            <div className="flex flex-col items-center text-center shrink-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mb-3 shadow-xs">
                <LogOut className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>

              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Konfirmasi Keluar
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar my-2 text-center">
              <p className="text-xs text-slate-600 leading-relaxed px-1">
                Apakah Anda yakin ingin keluar dari sesi <strong>{user?.name || 'Wali Kelas'}</strong>? Anda perlu memasukkan username &amp; kata sandi kembali untuk masuk.
              </p>
            </div>

            {/* Status indicator during logout */}
            {isLoggingOut ? (
              <div className="mt-3 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-center gap-2.5 text-xs text-slate-700 font-medium shrink-0">
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                <span>Mengakhiri sesi dan menyimpan status...</span>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2.5 shrink-0 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  id="cancel-logout-btn"
                  onClick={cancelLogout}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  id="confirm-logout-btn"
                  onClick={handleConfirm}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Ya, Keluar</span>
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
