import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Wallet, 
  ArrowDownRight, 
  ArrowUpRight, 
  Filter, 
  Download, 
  Printer, 
  Calendar, 
  PlusCircle, 
  MinusCircle, 
  AlertTriangle, 
  Share2, 
  User, 
  Phone, 
  FileText,
  Clock,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { StudentReport, Transaction, TransactionType } from '../types';
import { api } from '../lib/api';
import { formatRupiah, formatDateIndo, formatDateTimeIndo, downloadCSV, generateWhatsAppMessage } from '../lib/utils';
import { useToast } from '../context/ToastContext';

interface StudentDetailViewProps {
  studentId: string;
  onBack: () => void;
  onOpenDeposit: (studentId: string) => void;
  onOpenWithdraw: (studentId: string) => void;
}

export const StudentDetailView: React.FC<StudentDetailViewProps> = ({
  studentId,
  onBack,
  onOpenDeposit,
  onOpenWithdraw
}) => {
  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Void modal
  const [voidingTrx, setVoidingTrx] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isProcessingVoid, setIsProcessingVoid] = useState(false);

  const { success, error: toastError } = useToast();

  const loadReport = async (fresh = false) => {
    try {
      if (fresh) setIsRefreshing(true);
      const data = await api.getStudentReport(studentId, startDate, endDate, fresh);
      setReport(data);
    } catch (err: any) {
      toastError('Gagal Memuat Rekap', err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [studentId, startDate, endDate]);

  const handleVoid = async () => {
    if (!voidingTrx) return;
    setIsProcessingVoid(true);
    try {
      await api.voidTransaction(voidingTrx.transaction_id, voidReason);
      success('Transaksi Di-VOID', `Transaksi ${voidingTrx.transaction_id} berhasil dibatalkan.`);
      setVoidingTrx(null);
      setVoidReason('');
      await loadReport(true);
    } catch (err: any) {
      toastError('Gagal Membatalkan', err.message);
    } finally {
      setIsProcessingVoid(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!report?.transactions) return [];
    return report.transactions.filter((t) => {
      if (typeFilter !== 'ALL' && t.transaction_type !== typeFilter) {
        return false;
      }
      if (selectedMonth !== 'ALL') {
        const tMonth = t.transaction_date.slice(0, 7); // YYYY-MM
        if (tMonth !== selectedMonth) return false;
      }
      return true;
    });
  }, [report, typeFilter, selectedMonth]);

  // Export CSV
  const handleExportCSV = () => {
    if (!report) return;
    const header = ['No', 'ID Transaksi', 'Tanggal', 'Jenis', 'Nominal (Rp)', 'Keterangan', 'Pencatat (Wali Kelas)', 'Status'];
    const rows = filteredTransactions.map((t, idx) => [
      (idx + 1).toString(),
      t.transaction_id,
      t.transaction_date,
      t.transaction_type,
      t.amount.toString(),
      t.description,
      t.created_by,
      t.status
    ]);

    const titleRow = [`REKAP TABUNGAN SISWA: ${report.student.nama.toUpperCase()} (NISN: ${report.student.nisn || report.student.student_id})`];
    const summaryRow1 = [`Saldo Saat Ini: ${formatRupiah(report.summary.balance)}`];
    const summaryRow2 = [`Total Setoran: ${formatRupiah(report.summary.totalDeposit)} | Total Penarikan: ${formatRupiah(report.summary.totalWithdrawal)}`];
    const emptyRow = [''];

    downloadCSV(`Rekap_Tabungan_${report.student.nisn || report.student.student_id}_${report.student.nama.replace(/\s+/g, '_')}.csv`, [
      titleRow,
      summaryRow1,
      summaryRow2,
      emptyRow,
      header,
      ...rows
    ]);

    success('Berhasil Export CSV', 'File rekap tabungan telah diunduh.');
  };

  const handlePrintBukuTabungan = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse pb-10">
        <div className="h-8 w-24 bg-slate-200 rounded-lg" />
        <div className="h-44 bg-slate-200 rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-20 bg-slate-200 rounded-2xl" />
          <div className="h-20 bg-slate-200 rounded-2xl" />
          <div className="h-20 bg-slate-200 rounded-2xl" />
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
        <p className="text-slate-700">Data rekap siswa tidak ditemukan.</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
        >
          Kembali
        </button>
      </div>
    );
  }

  const { student, summary } = report;

  return (
    <div className="space-y-4 pb-12">
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          id="back-to-students-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadReport(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all"
            title="Segarkan data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            id="export-student-csv-btn"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            id="print-student-slip-btn"
            onClick={handlePrintBukuTabungan}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cetak Buku</span>
          </button>
        </div>
      </div>

      {/* Hero Student Balance Card */}
      <div className="bg-gradient-to-br from-emerald-800 via-teal-800 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-bold">
                  Kelas {student.kelas}
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  NISN: {student.nisn || student.student_id}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {student.nama}
              </h1>
              {student.no_hp_wali && (
                <p className="text-xs text-emerald-200/80 mt-0.5 flex items-center gap-1">
                  <span>No. HP / WA Wali: {student.no_hp_wali}</span>
                </p>
              )}
            </div>

            {/* Direct Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                id="hero-setor-student-btn"
                onClick={() => onOpenDeposit(student.student_id)}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ SETOR</span>
              </button>

              <button
                id="hero-tarik-student-btn"
                onClick={() => onOpenWithdraw(student.student_id)}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <MinusCircle className="w-4 h-4" />
                <span>- TARIK</span>
              </button>
            </div>
          </div>

          {/* Big Balance Number */}
          <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold text-emerald-200/90 uppercase tracking-wider block">
                Saldo Tabungan Saat Ini
              </span>
              <p className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-xs">
                {formatRupiah(summary.balance)}
              </p>
            </div>
            <div className="text-xs text-emerald-200/70 font-medium">
              Source of Truth: Berdasarkan {summary.transactionCount} transaksi aktif
            </div>
          </div>
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs text-center">
          <div className="flex items-center justify-center gap-1 text-emerald-600 mb-1">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Setoran</span>
          </div>
          <p className="text-sm sm:text-base font-black text-emerald-700">
            {formatRupiah(summary.totalDeposit)}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs text-center">
          <div className="flex items-center justify-center gap-1 text-amber-600 mb-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Penarikan</span>
          </div>
          <p className="text-sm sm:text-base font-black text-amber-700">
            {formatRupiah(summary.totalWithdrawal)}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs text-center">
          <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Transaksi</span>
          </div>
          <p className="text-sm sm:text-base font-black text-slate-800">
            {summary.transactionCount} kali
          </p>
        </div>
      </div>

      {/* Transaction History Filter Bar */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter Riwayat Transaksi</span>
          </h2>
          <span className="text-xs text-slate-700">
            Menampilkan <strong>{filteredTransactions.length}</strong> transaksi
          </span>
        </div>

        {/* Type pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(['ALL', 'SETORAN', 'PENARIKAN', 'VOID'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                typeFilter === t
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {t === 'ALL' ? 'Semua' : t}
            </button>
          ))}
        </div>
      </div>

      {/* RIWAYAT TRANSAKSI TIMELINE */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Histori Transaksi Tabungan
          </h2>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 text-xs text-slate-700">
            Belum ada histori transaksi untuk kriteria filter ini.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTransactions.map((trx) => {
              const isDeposit = trx.transaction_type === 'SETORAN';
              const isVoid = trx.status === 'VOID';

              return (
                <div
                  key={trx.transaction_id}
                  id={`detail-trx-item-${trx.transaction_id}`}
                  className={`p-4 bg-white rounded-2xl border transition-all ${
                    isVoid ? 'bg-slate-50/80 border-slate-200 opacity-60' : 'border-slate-200/90'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
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

                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-bold ${isVoid ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                            {formatDateIndo(trx.transaction_date)}
                          </p>
                          <span
                            className={`px-2 py-0.2 rounded text-[10px] font-extrabold uppercase ${
                              isVoid
                                ? 'bg-rose-100 text-rose-700'
                                : isDeposit
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isVoid ? 'VOID / BATAL' : trx.transaction_type}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700 mt-0.5">
                          {trx.description}
                        </p>
                        <p className="text-[10px] text-slate-600 font-mono mt-1">
                          Ref: {trx.transaction_id} • Dicatat: {trx.created_by}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p
                        className={`text-sm sm:text-base font-black ${
                          isVoid
                            ? 'text-slate-400 line-through'
                            : isDeposit
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {isDeposit ? '+' : '-'}{formatRupiah(trx.amount)}
                      </p>

                      {!isVoid && (
                        <button
                          onClick={() => setVoidingTrx(trx)}
                          className="mt-1 text-[10px] font-bold text-rose-600 hover:text-rose-800 underline underline-offset-2 block ml-auto"
                        >
                          Batalkan (VOID)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* VOID MODAL */}
      {voidingTrx && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-rose-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-600 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h4 className="font-bold text-sm text-slate-900">Batalkan Transaksi Ini?</h4>
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Anda akan membatalkan transaksi <strong>{voidingTrx.transaction_type}</strong> senilai{' '}
              <strong>{formatRupiah(voidingTrx.amount)}</strong> pada tanggal{' '}
              {formatDateIndo(voidingTrx.transaction_date)}. Saldo siswa akan dikalkulasi ulang secara otomatis.
            </p>

            <div className="mb-4">
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Alasan Pembatalan
              </label>
              <input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Contoh: Salah input nominal"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVoidingTrx(null)}
                disabled={isProcessingVoid}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={isProcessingVoid}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {isProcessingVoid ? 'Memproses...' : 'Ya, VOID'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
