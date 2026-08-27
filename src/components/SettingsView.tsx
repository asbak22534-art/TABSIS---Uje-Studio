import React, { useState, useEffect } from 'react';
import { School, Key, FileCode, Copy, Check, RefreshCw, Save, X, DownloadCloud, ShieldCheck, Lock, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSettingsQuery, useAccessProfileQuery, useGasScriptQuery } from '../hooks/useQueries';
import { SettingsSkeleton, DelayedRender } from './Skeleton';

export const SettingsView: React.FC = () => {
  const { user, refreshUser, activeAcademicYear, allowedAcademicYears, activeClassId } = useAuth();

  const { data: settings, isLoading: loadingSettings, refetch: refetchSettings } = useSettingsQuery();
  const { data: profile, isLoading: loadingProfile, refetch: refetchProfile } = useAccessProfileQuery();
  const { data: gasScript = '', isLoading: loadingGas } = useGasScriptQuery();

  const [schoolName, setSchoolName] = useState(() => settings?.school_name || '');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGasModal, setShowGasModal] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Sync initial schoolName when settings loaded
  useEffect(() => {
    if (settings?.school_name) {
      setSchoolName(settings.school_name);
    }
  }, [settings?.school_name]);

  // Ganti Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const { success, error: toastError } = useToast();

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;
    setSaving(true);
    try {
      await api.updateSettings({ school_name: schoolName.trim() });
      await refetchSettings();
      await refreshUser();
      success('Pengaturan Disimpan', 'Identitas sekolah berhasil diperbarui.');
    } catch (err: any) {
      toastError('Gagal Menyimpan', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      toastError('Form Belum Lengkap', 'Masukkan kata sandi saat ini.');
      return;
    }
    if (newPassword.length < 8) {
      toastError('Kata Sandi Terlalu Pendek', 'Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError('Konfirmasi Tidak Sesuai', 'Konfirmasi kata sandi baru tidak cocok.');
      return;
    }
    if (oldPassword === newPassword) {
      toastError('Kata Sandi Sama', 'Kata sandi baru tidak boleh sama dengan kata sandi saat ini.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.changePassword(oldPassword, newPassword);
      success('Kata Sandi Diperbarui', res.message || 'Kata sandi berhasil diubah.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toastError('Gagal Mengubah Kata Sandi', err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.syncFromGas();
      await refreshUser();
      await Promise.all([refetchSettings(), refetchProfile()]);
      success('Sinkronisasi Sukses', r.message || 'Data diperbarui dari Google Sheets.');
    } catch (err: any) {
      toastError('Gagal Sinkronisasi', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const copyGas = async () => {
    await navigator.clipboard.writeText(gasScript);
    setCopied(true);
    success('Kode Disalin', 'Tempel Code.gs terbaru ke Google Apps Script.');
    setTimeout(() => setCopied(false), 2500);
  };

  const installPwa = async () => {
    if (!installPrompt) {
      success('Info PWA', 'Gunakan menu browser > Tambahkan ke Layar Utama.');
      return;
    }
    installPrompt.prompt();
    const r = await installPrompt.userChoice;
    if (r.outcome === 'accepted') setIsInstalled(true);
    setInstallPrompt(null);
  };

  const isInitialLoading = (loadingSettings || loadingProfile) && (!settings || !profile);

  if (isInitialLoading) {
    return (
      <DelayedRender delay={150}>
        <SettingsSkeleton />
      </DelayedRender>
    );
  }

  const classesThisYear = profile?.classes_by_year?.[activeAcademicYear || ''] || [];

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-14">
      <div>
        <h1 className="text-xl font-black text-slate-900">Pengaturan & Akun</h1>
        <p className="text-xs text-slate-600">
          Kelola profil akun, ganti kata sandi, dan sinkronisasi data dari Google Sheets.
        </p>
      </div>

      {!isInstalled && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DownloadCloud className="w-5 h-5" />
            <div>
              <p className="text-sm font-bold">Pasang Aplikasi di HP</p>
              <p className="text-xs text-emerald-100">Gunakan sebagai PWA untuk akses cepat dan offline cache.</p>
            </div>
          </div>
          <button
            onClick={installPwa}
            className="px-4 py-2 bg-white text-emerald-800 rounded-xl text-xs font-black hover:bg-emerald-50 transition-colors"
          >
            Pasang
          </button>
        </div>
      )}

      {/* Akun & Lingkup Akses */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">Akun & Lingkup Tugas Guru</h2>
        </div>
        <div className="text-xs bg-slate-50 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between gap-3">
            <span className="text-slate-600">Nama Guru</span>
            <strong className="text-right text-slate-900">{user?.name || '-'}</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-600">Username</span>
            <strong className="text-slate-900 font-mono">{user?.username || '-'}</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-600">Role</span>
            <strong className="text-emerald-700 uppercase">{user?.role || 'GURU'}</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-600">Tahun Pelajaran yang Ditugaskan</span>
            <strong className="text-right text-slate-900">{allowedAcademicYears.join(', ') || 'Belum ada tugas'}</strong>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-600 mb-2">
            Kelas Aktif pada {activeAcademicYear || '-'}
          </p>
          <div className="flex flex-wrap gap-2">
            {classesThisYear.length ? (
              classesThisYear.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"
                >
                  Kelas {c}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">Belum ada kelas yang ditugaskan pada tahun ini.</span>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-[11px] text-blue-950 leading-relaxed">
          Struktur data tersimpan di Google Sheets (<b>USERS</b>, <b>ACADEMIC_YEARS</b>, <b>CLASS_SECTIONS</b>, <b>TEACHER_ASSIGNMENTS</b>, dan <b>STUDENT_ENROLLMENTS</b>). Setiap guru hanya dapat melihat dan mengelola kelas yang ditugaskan kepadanya.
        </div>
      </section>

      {/* Ganti Password */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <Key className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">Ganti Kata Sandi</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
              Kata Sandi Saat Ini
            </label>
            <div className="relative">
              <input
                type={showOldPassword ? 'text' : 'password'}
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Masukkan kata sandi saat ini"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500 text-xs"
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
                Kata Sandi Baru
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  maxLength={128}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 karakter"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
                Ulangi Kata Sandi Baru
              </label>
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang kata sandi baru"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={changingPassword}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            {changingPassword ? 'Memperbarui Kata Sandi...' : 'Perbarui Kata Sandi'}
          </button>
        </form>
      </section>

      {/* Identitas Sekolah */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
          <School className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">Identitas Sekolah</h2>
        </div>
        <form onSubmit={handleSaveSchool} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">Nama Sekolah</label>
            <input
              required
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">Tahun Pelajaran Aktif</label>
              <input
                readOnly
                value={activeAcademicYear || 'Belum dipilih'}
                className="w-full px-3.5 py-2.5 rounded-xl border bg-slate-100 font-bold text-emerald-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">Kelas Aktif</label>
              <input
                readOnly
                value={activeClassId || 'Belum dipilih'}
                className="w-full px-3.5 py-2.5 rounded-xl border bg-slate-100 font-bold text-emerald-800"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan Nama Sekolah'}
          </button>
        </form>
      </section>

      {/* Google Sheets & Apps Script */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">Google Sheets & Apps Script</h2>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${settings?.gas_configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {settings?.gas_configured ? '● Terkonfigurasi' : '○ Belum'}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Menyinkronkan...' : 'Sinkronkan Data'}
          </button>
          <button
            onClick={() => setShowGasModal(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <FileCode className="w-4 h-4" />
            Lihat Code.gs
          </button>
          <button
            onClick={copyGas}
            className="px-4 py-2.5 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Tersalin' : 'Salin Kode'}
          </button>
        </div>
      </section>

      {/* GAS Code Modal */}
      {showGasModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900">Code.gs — Google Apps Script Backend</h3>
                <p className="text-[11px] text-slate-500">Salin kode ini ke Apps Script Spreadsheet Anda.</p>
              </div>
              <button
                onClick={() => setShowGasModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[11px] bg-slate-950 text-emerald-200 whitespace-pre font-mono">
              {gasScript}
            </pre>
            <div className="p-4 border-t border-slate-100">
              <button
                onClick={copyGas}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Salin Seluruh Kode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
