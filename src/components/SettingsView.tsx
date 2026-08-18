import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  School, 
  Key, 
  FileCode, 
  Copy, 
  Check, 
  RotateCcw, 
  DownloadCloud, 
  ShieldCheck, 
  HelpCircle,
  ExternalLink,
  Sparkles,
  Save,
  CheckCircle2,
  RefreshCw,
  TableProperties
} from 'lucide-react';
import { AppSettings } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const SettingsView: React.FC = () => {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Edit fields
  const [schoolName, setSchoolName] = useState('');
  const [classNameVal, setClassNameVal] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [gasUrl, setGasUrl] = useState('');

  // GAS Script Code Modal / Viewer
  const [gasScript, setGasScript] = useState('');
  const [copied, setCopied] = useState(false);
  const [showGasModal, setShowGasModal] = useState(false);

  // Install PWA Prompt deferred
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const { success, error: toastError } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getSettings();
        setSettings(data);
        setSchoolName(data.school_name);
        setClassNameVal(data.class_name);
        setTeacherName(data.teacher_name);
        setAcademicYear(data.academic_year);
        setGasUrl(data.gas_script_url || '');

        const gasCode = await api.getGasScript();
        setGasScript(gasCode);
      } catch (err: any) {
        toastError('Gagal Memuat Pengaturan', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();

    // Check PWA install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        school_name: schoolName.trim(),
        class_name: classNameVal.trim(),
        teacher_name: teacherName.trim(),
        academic_year: academicYear.trim(),
        gas_script_url: gasUrl.trim()
      });
      setSettings(updated);
      success('Pengaturan Disimpan', 'Identitas sekolah & wali kelas berhasil diperbarui.');
    } catch (err: any) {
      toastError('Gagal Menyimpan', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyGasCode = () => {
    navigator.clipboard.writeText(gasScript);
    setCopied(true);
    success('Kode Disalin!', 'Script Google Apps Script siap ditempel di script.google.com');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSyncGasNow = async () => {
    if (!gasUrl) {
      toastError('URL Belum Diisi', 'Silakan masukkan URL Web App Google Apps Script terlebih dahulu.');
      return;
    }
    setSyncing(true);
    try {
      const res = await api.syncFromGas();
      success('Sinkronisasi Sukses!', res?.message || 'Data pengguna & transaksi dari Google Sheets berhasil diperbarui.');
      // Refresh local view
      const fresh = await api.getSettings();
      setSettings(fresh);
      setSchoolName(fresh.school_name);
      setClassNameVal(fresh.class_name);
      setTeacherName(fresh.teacher_name);
      setAcademicYear(fresh.academic_year);
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.message || 'Periksa apakah URL Web App sudah dideploy versi terbaru.');
      toastError('Gagal Sinkronisasi', errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  const handleResetData = async () => {
    if (window.confirm('Apakah Anda ingin membersihkan cache lokal dan menyinkronkan ulang seluruh data langsung dari Google Spreadsheet?')) {
      try {
        setSyncing(true);
        const res = await api.resetDemoData();
        success('Sinkronisasi Sukses', res?.message || 'Data berhasil disinkronkan ulang dari Google Sheets.');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err: any) {
        toastError('Gagal Sinkronisasi', err.message);
      } finally {
        setSyncing(false);
      }
    }
  };

  const handleInstallPWA = async () => {
    if (!installPrompt) {
      success('Info PWA', 'Untuk memasang di HP: buka menu browser > Tambahkan ke Layar Utama (Add to Home Screen).');
      return;
    }
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
      success('Berhasil Terpasang', 'Aplikasi Tabungan Siswa terpasang di perangkat Anda.');
    }
    setInstallPrompt(null);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse pb-10">
        <div className="h-28 bg-slate-200 rounded-3xl" />
        <div className="h-64 bg-slate-200 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-14">
      {/* Title */}
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          Pengaturan & Profil
        </h1>
        <p className="text-xs text-slate-700 font-medium">
          Kelola profil wali kelas, sekolah, integrasi Google Sheets & PWA
        </p>
      </div>

      {/* PWA Install Banner */}
      {!isInstalled && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-4 sm:p-5 shadow-lg shadow-emerald-700/15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <DownloadCloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">Pasang Aplikasi di HP (PWA)</p>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                Buka lebih cepat & responsif seperti aplikasi native tanpa instalasi Play Store.
              </p>
            </div>
          </div>
          <button
            onClick={handleInstallPWA}
            className="px-4 py-2 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-black flex-shrink-0 shadow-sm active:scale-95 transition-all"
          >
            Pasang Sekarang
          </button>
        </div>
      )}

      {/* Profile & School Settings Form */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
          <School className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">Identitas Sekolah & Wali Kelas</h2>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
              Nama Sekolah
            </label>
            <input
              type="text"
              required
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Contoh: SD Negeri 01 Teladan"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none font-medium text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
                Nama Kelas
              </label>
              <input
                type="text"
                required
                value={classNameVal}
                onChange={(e) => setClassNameVal(e.target.value)}
                placeholder="Kelas 5A"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none font-medium text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
                Tahun Ajaran
              </label>
              <input
                type="text"
                required
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026/2027"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none font-medium text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1 text-[10px]">
              Nama Wali Kelas (Guru)
            </label>
            <input
              type="text"
              required
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="Contoh: Ibu Siti Rahmawati, S.Pd."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none font-medium text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
          </button>
        </form>
      </div>

      {/* Google Apps Script & Google Sheets Integration Hub */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">Integrasi Google Sheets & Apps Script</h2>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
            gasUrl 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            {gasUrl ? '● Terhubung ke Cloud' : '○ Belum Diisi'}
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Tempelkan <strong>URL Web App</strong> hasil deploy Google Apps Script (berakhiran <code>/exec</code>) di bawah ini agar data tabungan siswa tersinkronisasi ke Google Spreadsheet Anda.
        </p>

        {/* Web App URL Input */}
        <div>
          <label className="block font-bold text-slate-700 uppercase mb-1.5 text-[10px]">
            URL Web App Google Apps Script (/exec)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={gasUrl}
              onChange={(e) => setGasUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none font-mono text-xs text-slate-900 truncate"
            />
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all flex-shrink-0 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Link GAS'}</span>
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleSyncGasNow}
            disabled={syncing || !gasUrl}
            className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Menyinkronkan Data...' : 'Sinkronkan Data Sekarang'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGasModal(true)}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span>Kode Apps Script Terbaru (Code.gs)</span>
          </button>

          <button
            type="button"
            onClick={handleCopyGasCode}
            className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Kode Tersalin!' : 'Salin Kode'}</span>
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs space-y-3">
          <p className="font-bold text-slate-900 flex items-center gap-1.5">
            <TableProperties className="w-4 h-4 text-emerald-600" />
            Struktur Kolom Sheet di Google Spreadsheet:
          </p>
          <div className="space-y-2 text-[11px] font-mono text-slate-700">
            <div className="p-2 bg-white rounded-xl border border-slate-200">
              <span className="font-bold text-emerald-700 font-sans">1. Sheet TRANSACTIONS:</span>
              <p className="text-slate-600 mt-0.5 break-all">
                transaction_id, nisn, nama, transaction_type, amount, transaction_date, description, created_by, created_at, updated_at, status, void_reason
              </p>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200">
              <span className="font-bold text-emerald-700 font-sans">2. Sheet STUDENTS:</span>
              <p className="text-slate-600 mt-0.5 break-all">
                nisn, nama, jenis_kelamin, kelas, no_hp_wali, status, created_at, updated_at
              </p>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200">
              <span className="font-bold text-emerald-700 font-sans">3. Sheet USERS:</span>
              <p className="text-slate-600 mt-0.5 break-all">
                user_id, username, name, password_hash, class_id, status, created_at, updated_at
              </p>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200">
              <span className="font-bold text-emerald-700 font-sans">4. Sheet SETTINGS:</span>
              <p className="text-slate-600 mt-0.5 break-all">
                setting_key, setting_value
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50/80 border border-amber-200/70 rounded-2xl p-3.5 text-xs text-amber-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-amber-950">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Tips Pembaruan Script di Google Spreadsheet:
          </p>
          <p className="text-[11px] text-amber-800/90 leading-relaxed">
            Buka <em>Ekstensi &gt; Apps Script</em> di spreadsheet Anda &gt; paste kode <strong>Code.gs</strong> terbaru &gt; klik <strong>Deploy &gt; Manage deployments &gt; Edit (ikon pensil) &gt; Version: New version &gt; Deploy</strong>.
          </p>
        </div>
      </div>

      {/* Security & System Info */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">Sistem & Keamanan Data</h2>
        </div>

        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Source of Truth:</strong> Saldo dihitung dinamis dari total setoran dikurangi penarikan aktif. Transaksi tidak dihapus permanen untuk mencegah manipulasi.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Pessimistic Locking:</strong> Transaksi divalidasi langsung di backend sebelum konfirmasi. Double-click dicegah secara ketat.</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={handleResetData}
            disabled={syncing}
            className="text-xs text-slate-500 hover:text-emerald-700 flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Menyinkronkan...' : 'Bersihkan Cache & Sinkronkan Ulang dari Google Sheets'}</span>
          </button>

          <button
            onClick={logout}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors"
          >
            Keluar (Logout)
          </button>
        </div>
      </div>

      {/* Google Apps Script Modal Viewer */}
      {showGasModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Kode Google Apps Script (Code.gs)</h3>
                <p className="text-[11px] text-slate-700">Paste kode ini di script.google.com untuk menghubungkan ke Google Sheets</p>
              </div>
              <button
                onClick={() => setShowGasModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-950 text-emerald-400 p-4 rounded-2xl font-mono text-xs leading-relaxed my-2 select-all border border-slate-800">
              <pre>{gasScript}</pre>
            </div>

            <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-100">
              <p className="text-[11px] text-slate-700 font-medium">
                Tersedia fungsi otomatis <code>initDatabase()</code> untuk membuat sheet.
              </p>
              <button
                onClick={handleCopyGasCode}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Tersalin!' : 'Salin Semua Kode'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
