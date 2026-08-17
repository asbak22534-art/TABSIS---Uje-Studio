import React, { useState } from 'react';
import { Wallet, Lock, User, AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { success, error: toastError } = useToast();

  const [username, setUsername] = useState('walikelas');
  const [password, setPassword] = useState('guru123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Silakan masukkan username dan kata sandi.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      await login(username, password);
      success('Selamat Datang!', 'Berhasil masuk ke sistem Tabungan Siswa.');
    } catch (err: any) {
      const msg = err.message || 'Gagal login. Periksa username dan password Anda.';
      setErrorMessage(msg);
      toastError('Login Gagal', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-teal-900 to-slate-900 flex flex-col justify-center items-center px-4 py-8 relative overflow-y-auto">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-xl shadow-emerald-500/20 mb-4 ring-4 ring-emerald-500/20">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            TABUNGAN SISWA
          </h1>
          <p className="text-sm text-emerald-200/80 mt-1 font-medium">
            Portal Khusus Wali Kelas • Pengelolaan Tabungan Mandiri
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100/10">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">Masuk sebagai Wali Kelas</h2>
            <p className="text-xs text-slate-700 mt-0.5">
              Gunakan akun wali kelas default atau data dari sheet <strong>USERS</strong> Google Spreadsheet.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-900">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs font-semibold leading-relaxed block">{errorMessage}</span>
                <p className="text-[11px] text-rose-800">
                  Tip: Pastikan username &amp; kata sandi sesuai dengan kolom <code>username</code> dan <code>password_hash</code> di sheet USERS.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Username Wali Kelas
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: walikelas"
                  required
                  className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi Akun...</span>
                </>
              ) : (
                <>
                  <span>Buka Tabungan Siswa</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Helper */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Akun Default &amp; Cloud Sheets
                </span>
                <button
                  type="button"
                  onClick={() => fillDemo('walikelas', 'guru123')}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold underline underline-offset-2 cursor-pointer"
                >
                  Isi Default
                </button>
              </div>
              <p className="text-[11px] text-slate-700">
                Username: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-800 font-semibold">walikelas</code> • Kata sandi: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-800 font-semibold">guru123</code> (atau akun kustom Anda di sheet USERS)
              </p>
            </div>
          </div>
        </div>

        {/* Security & Footer Info */}
        <div className="mt-6 text-center text-xs text-emerald-200/60 font-medium space-y-1">
          <p>Dirancang khusus untuk guru sekolah • Mobile First PWA</p>
          <p>Data tersinkronisasi aman dengan Google Sheets &amp; Database</p>
        </div>
      </div>
    </div>
  );
};
