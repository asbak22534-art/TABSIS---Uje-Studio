import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Users, 
  PlusCircle, 
  MinusCircle, 
  UserPlus, 
  ChevronRight, 
  Wallet,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Transaction, NavTab } from '../types';
import { formatRupiah, formatDateIndo, formatDateTimeIndo } from '../lib/utils';
import { DashboardSkeleton, DelayedRender } from './Skeleton';
import { useToast } from '../context/ToastContext';
import { useDashboardQuery, useTransactionMutations, useStudentsQuery } from '../hooks/useQueries';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
  onOpenDeposit: (studentId?: string) => void;
  onOpenWithdraw: (studentId?: string) => void;
  onSelectStudent: (studentId: string) => void;
  onOpenAddStudent: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenDeposit,
  onOpenWithdraw,
  onSelectStudent,
  onOpenAddStudent
}) => {
  const { data, isLoading, isFetching, refetch } = useDashboardQuery();
  const { data: studentsData } = useStudentsQuery();
  const { voidMutation } = useTransactionMutations();

  const studentsMap = React.useMemo(() => {
    const map = new Map<string, string>();
    if (studentsData && Array.isArray(studentsData)) {
      for (const s of studentsData) {
        if (s.nisn && s.nama) map.set(s.nisn, s.nama);
        if (s.student_id && s.nama) map.set(s.student_id, s.nama);
      }
    }
    return map;
  }, [studentsData]);

  const getStudentDisplayName = (trx?: Transaction | null) => {
    if (!trx) return 'Siswa';
    return (
      trx.student_nama ||
      trx.nama ||
      (trx.nisn ? studentsMap.get(trx.nisn) : undefined) ||
      (trx.student_id ? studentsMap.get(trx.student_id) : undefined) ||
      'Siswa'
    );
  };

  const getStudentNisn = (trx?: Transaction | null) => {
    if (!trx) return '-';
    return trx.student_nisn || trx.nisn || trx.student_id || '-';
  };

  const [selectedTrxForDetail, setSelectedTrxForDetail] = useState<Transaction | null>(null);
  const [voidModalTrx, setVoidModalTrx] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const { success, error: toastError } = useToast();

  const handleVoidTransaction = async () => {
    if (!voidModalTrx) return;
    try {
      const res = await voidMutation.mutateAsync({
        transaction_id: voidModalTrx.transaction_id,
        void_reason: voidReason,
      });
      if (res.warning) {
        success('Transaksi Di-VOID di Aplikasi', `Transaksi ${voidModalTrx.transaction_id} berhasil dibatalkan. Catatan: ${res.warning}`);
      } else {
        success('Transaksi Dibatalkan', `Transaksi ${voidModalTrx.transaction_id} berhasil di-VOID.`);
      }
      setVoidModalTrx(null);
      setSelectedTrxForDetail(null);
      setVoidReason('');
    } catch (err: any) {
      toastError('Gagal Membatalkan', err.message || 'Tidak dapat membatalkan transaksi.');
    }
  };

  if (isLoading && !data) {
    return (
      <DelayedRender delay={150}>
        <DashboardSkeleton />
      </DelayedRender>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
        <p className="text-slate-700">Data dashboard tidak tersedia.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Teacher Welcome Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-0.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Wali Kelas</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Selamat datang, {data.teacherName}
          </h1>
          <p className="text-xs text-slate-700 mt-0.5 font-medium">
            Pengelolaan Tabungan • <span className="font-semibold text-slate-700">{data.className}</span> • TA {data.academicYear}
          </p>
        </div>

        <button
          id="refresh-dashboard-btn"
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-all active:scale-95 disabled:opacity-50"
          title="Segarkan data"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {/* Main Hero Card: Total Saldo Kelas */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-emerald-900 text-white p-5 sm:p-6 shadow-xl shadow-emerald-900/10">
        {/* Abstract decorative shapes */}
        <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-12 top-0 w-24 h-24 bg-teal-400/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between min-h-[140px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-semibold tracking-wide text-emerald-100 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" />
                Total Saldo Kelas
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur-md">
                {data.className}
              </span>
            </div>

            <div className="mt-2.5">
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white drop-shadow-xs">
                {formatRupiah(data.totalClassBalance)}
              </h2>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-white/15 flex items-center justify-between text-xs text-emerald-100 font-medium">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-200" />
              <span>
                <strong className="text-white font-bold">{data.totalStudents}</strong> Siswa
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              <span>
                <strong className="text-white font-bold">{data.activeSavers}</strong> Aktif Menabung
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Today Activity Cards: Setoran & Penarikan Hari Ini */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Aktivitas Hari Ini
          </h3>
          <span className="text-xs font-medium text-slate-700">
            {formatDateIndo(new Date().toISOString())}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-emerald-700 mb-1.5">
              <span className="text-xs font-bold">Setoran</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-base sm:text-xl font-black text-emerald-700">
              +{formatRupiah(data.todayDeposit)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-amber-700 mb-1.5">
              <span className="text-xs font-bold">Penarikan</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-amber-600" />
              </div>
            </div>
            <p className="text-base sm:text-xl font-black text-amber-700">
              -{formatRupiah(data.todayWithdrawal)}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div>
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
          Aksi Cepat
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            id="quick-action-setoran"
            onClick={() => onOpenDeposit()}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white transition-all shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold leading-tight">+ Setoran</p>
              <p className="text-[11px] text-emerald-100/90 font-medium">Catat tabungan</p>
            </div>
          </button>

          <button
            id="quick-action-penarikan"
            onClick={() => onOpenWithdraw()}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white transition-all shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <MinusCircle className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold leading-tight">- Penarikan</p>
              <p className="text-[11px] text-amber-100/90 font-medium">Tarik saldo</p>
            </div>
          </button>

          <button
            id="quick-action-tambah-siswa"
            onClick={onOpenAddStudent}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 active:scale-[0.98] text-slate-800 transition-all shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <UserPlus className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-900 leading-tight">+ Tambah Siswa</p>
              <p className="text-[11px] text-slate-700 font-medium">Daftar siswa baru</p>
            </div>
          </button>

          <button
            id="quick-action-lihat-siswa"
            onClick={() => onNavigate('students')}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 active:scale-[0.98] text-slate-800 transition-all shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-900 leading-tight">Lihat Siswa</p>
              <p className="text-[11px] text-slate-700 font-medium">Semua ({data.totalStudents})</p>
            </div>
          </button>
        </div>
      </div>

      {/* Recent Transactions List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Transaksi Terbaru
          </h3>
          <button
            onClick={() => onNavigate('reports')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            <span>Semua Laporan</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {data.recentTransactions.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-200 text-slate-700 text-xs">
            Belum ada transaksi tercatat. Mulai dengan tombol <strong className="text-emerald-700 font-semibold">+ Setoran</strong> di atas.
          </div>
        ) : (
          <div className="space-y-2">
            {data.recentTransactions.slice(0, 7).map((trx, idx) => {
              const isDeposit = trx.transaction_type === 'SETORAN';
              const isVoid = trx.status === 'VOID';

              return (
                <div
                  key={trx.transaction_id ? `${trx.transaction_id}-${idx}` : `recent-trx-${idx}`}
                  id={`trx-card-${trx.transaction_id || idx}`}
                  onClick={() => setSelectedTrxForDetail(trx)}
                  className={`p-3.5 bg-white rounded-2xl border transition-all cursor-pointer hover:border-slate-300 hover:shadow-xs active:scale-[0.99] flex items-center justify-between gap-3 ${
                    isVoid ? 'opacity-60 bg-slate-50 border-slate-200' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isVoid
                          ? 'bg-slate-100 text-slate-400'
                          : isDeposit
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {isVoid ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : isDeposit ? (
                        <ArrowDownRight className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold truncate ${isVoid ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                          {getStudentDisplayName(trx)}
                        </p>
                        {isVoid && (
                          <span className="px-1.5 py-0.5 text-[10px] font-extrabold uppercase bg-rose-100 text-rose-700 rounded">
                            VOID
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-700 truncate">
                        {trx.description} • {formatDateTimeIndo(trx.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p
                      className={`text-sm font-black ${
                        isVoid
                          ? 'line-through text-slate-400'
                          : isDeposit
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {isDeposit ? '+' : '-'}{formatRupiah(trx.amount)}
                    </p>
                    <span className="text-[10px] text-slate-600 font-mono">
                      {trx.transaction_id.slice(-6)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTrxForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 max-h-[calc(100dvh-1.5rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Detail Transaksi
              </span>
              <button
                type="button"
                onClick={() => setSelectedTrxForDetail(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-0.5 space-y-3.5 custom-scrollbar min-h-0">
              <div className="text-center py-2 bg-slate-50/70 rounded-2xl p-3 border border-slate-100">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase mb-1.5 ${
                    selectedTrxForDetail.status === 'VOID'
                      ? 'bg-rose-100 text-rose-700'
                      : selectedTrxForDetail.transaction_type === 'SETORAN'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedTrxForDetail.status === 'VOID'
                    ? 'TRANSAKSI DIBATALKAN (VOID)'
                    : selectedTrxForDetail.transaction_type}
                </span>
                <h3 className={`text-xl sm:text-2xl font-black ${
                  selectedTrxForDetail.status === 'VOID' ? 'text-slate-400 line-through' : 'text-slate-900'
                }`}>
                  {formatRupiah(selectedTrxForDetail.amount)}
                </h3>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">
                  {getStudentDisplayName(selectedTrxForDetail)} (NISN: {getStudentNisn(selectedTrxForDetail)})
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 text-xs border border-slate-200/60">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">ID Transaksi</span>
                  <span className="font-mono font-bold text-slate-800 text-[11px]">{selectedTrxForDetail.transaction_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Tanggal Transaksi</span>
                  <span className="font-semibold text-slate-800">{formatDateIndo(selectedTrxForDetail.transaction_date)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Waktu Simpan</span>
                  <span className="font-semibold text-slate-800">{formatDateTimeIndo(selectedTrxForDetail.created_at)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Wali Kelas</span>
                  <span className="font-semibold text-slate-800">{selectedTrxForDetail.created_by}</span>
                </div>
                <div className="flex justify-between items-start border-t border-slate-200/60 pt-2">
                  <span className="text-slate-500 shrink-0">Keterangan</span>
                  <span className="font-semibold text-slate-800 text-right max-w-[180px] break-words">{selectedTrxForDetail.description || '-'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-3.5 border-t border-slate-100 shrink-0 mt-3">
              <button
                type="button"
                onClick={() => {
                  const sId = selectedTrxForDetail.student_id;
                  setSelectedTrxForDetail(null);
                  onSelectStudent(sId);
                }}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-600/20 cursor-pointer"
              >
                Buka Rekap Siswa Ini
              </button>

              {selectedTrxForDetail.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => {
                    setVoidModalTrx(selectedTrxForDetail);
                  }}
                  className="w-full py-2 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Batalkan Transaksi Ini (VOID)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Void Modal */}
      {voidModalTrx && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-rose-100 max-h-[calc(100dvh-1.5rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-600 mb-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Batalkan Transaksi (VOID)?</h4>
            </div>

            <div className="flex-1 overflow-y-auto pr-0.5 space-y-3 custom-scrollbar min-h-0">
              <p className="text-xs text-slate-600 leading-relaxed">
                Membatalkan transaksi <strong>{voidModalTrx.transaction_id}</strong> senilai{' '}
                <strong>{formatRupiah(voidModalTrx.amount)}</strong> untuk siswa{' '}
                <strong>{getStudentDisplayName(voidModalTrx)}</strong>. Transaksi tidak akan dihapus permanen agar histori pembukuan tetap aman, namun saldo siswa akan disesuaikan otomatis.
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Alasan Pembatalan (Opsional)
                </label>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Contoh: Salah ketik nominal siswa"
                  className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-rose-500 outline-none font-medium text-slate-900"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3.5 border-t border-slate-100 shrink-0 mt-3">
              <button
                type="button"
                onClick={() => setVoidModalTrx(null)}
                disabled={voidMutation.isPending}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVoidTransaction}
                disabled={voidMutation.isPending}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-rose-600/20 cursor-pointer"
              >
                {voidMutation.isPending ? 'Memproses...' : 'Ya, VOID Transaksi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
