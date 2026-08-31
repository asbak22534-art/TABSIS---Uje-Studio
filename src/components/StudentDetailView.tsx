import React, { useState, useMemo } from 'react';
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
import { Transaction, TransactionType } from '../types';
import { formatRupiah, formatDateIndo, formatDateTimeIndo, downloadCSV, generateWhatsAppMessage, formatNumber, terbilangRupiah, getJakartaToday } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import { useStudentReportQuery, useTransactionMutations } from '../hooks/useQueries';
import { DelayedRender } from './Skeleton';

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
  // Filters
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'SETORAN' | 'PENARIKAN' | 'VOID'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  const { data: report, isLoading, isFetching, refetch } = useStudentReportQuery(
    studentId,
    { startDate: startDate || undefined, endDate: endDate || undefined }
  );
  const { voidMutation, withdrawalMutation } = useTransactionMutations();

  // Void modal
  const [voidingTrx, setVoidingTrx] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isProcessingVoid, setIsProcessingVoid] = useState(false);

  // Direct Withdraw modal
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');
  const [withdrawDescription, setWithdrawDescription] = useState('Penarikan Tabungan');
  const [withdrawDate, setWithdrawDate] = useState<string>(getJakartaToday());
  const [withdrawError, setWithdrawError] = useState('');
  const [isProcessingWithdraw, setIsProcessingWithdraw] = useState(false);

  const { success, error: toastError } = useToast();

  const handleVoid = async () => {
    if (!voidingTrx) return;
    setIsProcessingVoid(true);
    try {
      const res = await voidMutation.mutateAsync({
        transaction_id: voidingTrx.transaction_id,
        void_reason: voidReason,
      });
      if (res.warning) {
        success('Transaksi Di-VOID di Aplikasi', `Transaksi ${voidingTrx.transaction_id} berhasil dibatalkan. Catatan: ${res.warning}`);
      } else {
        success('Transaksi Di-VOID', `Transaksi ${voidingTrx.transaction_id} berhasil dibatalkan.`);
      }
      setVoidingTrx(null);
      setVoidReason('');
    } catch (err: any) {
      toastError('Gagal Membatalkan', err.message);
    } finally {
      setIsProcessingVoid(false);
    }
  };

  const openWithdrawModal = () => {
    if (!report) return;
    setWithdrawAmount('');
    setWithdrawDescription('Penarikan Tabungan');
    setWithdrawDate(getJakartaToday());
    setWithdrawError('');
    setIsWithdrawModalOpen(true);
  };

  const handleCloseWithdrawModal = () => {
    setIsWithdrawModalOpen(false);
    setWithdrawAmount('');
    setWithdrawDescription('');
    setWithdrawError('');
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report) return;

    const numAmount = Number(withdrawAmount);
    const curBalance = report.summary.balance || 0;

    if (!numAmount || numAmount <= 0) {
      setWithdrawError('Nominal penarikan harus lebih dari Rp 0.');
      return;
    }

    if (numAmount > curBalance) {
      setWithdrawError(
        `Nominal penarikan (${formatRupiah(numAmount)}) melebihi total saldo siswa (${formatRupiah(curBalance)})!`
      );
      return;
    }

    setIsProcessingWithdraw(true);
    setWithdrawError('');

    try {
      const result = await withdrawalMutation.mutateAsync({
        student_id: report.student.student_id,
        amount: numAmount,
        description: withdrawDescription.trim() || 'Penarikan Tabungan',
        transaction_date: withdrawDate
      });

      success(
        'Penarikan Berhasil!',
        `Penarikan ${formatRupiah(numAmount)} untuk ${report.student.nama} berhasil dicatat. Saldo baru: ${formatRupiah(result.currentBalance)}.`
      );

      handleCloseWithdrawModal();
    } catch (err: any) {
      setWithdrawError(err.message || 'Gagal memproses penarikan tabungan.');
      toastError('Penarikan Gagal', err.message);
    } finally {
      setIsProcessingWithdraw(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!report?.transactions) return [];
    return report.transactions.filter((t) => {
      if (typeFilter === 'VOID') {
        if (t.status !== 'VOID') return false;
      } else if (typeFilter === 'SETORAN') {
        if (t.transaction_type !== 'SETORAN' || t.status === 'VOID') return false;
      } else if (typeFilter === 'PENARIKAN') {
        if (t.transaction_type !== 'PENARIKAN' || t.status === 'VOID') return false;
      }
      if (selectedMonth !== 'ALL') {
        const tMonth = (t.transaction_date || '').slice(0, 7); // YYYY-MM
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

  if (isLoading && !report) {
    return (
      <DelayedRender delay={150}>
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
      </DelayedRender>
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
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all"
            title="Segarkan data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-emerald-600' : ''}`} />
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
      <div className="bg-gradient-to-br from-emerald-800 via-teal-800 to-slate-900 text-white rounded-3xl p-4.5 sm:p-6 shadow-xl relative overflow-hidden max-w-full">
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-bold shrink-0">
                  Kelas {student.kelas}
                </span>
                <span className="text-xs text-slate-300 font-mono truncate">
                  NISN: {student.nisn || student.student_id}
                </span>
              </div>
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight truncate">
                {student.nama}
              </h1>
              {student.no_hp_wali && (
                <p className="text-xs text-emerald-200/80 mt-0.5 flex items-center gap-1 truncate">
                  <span>No. HP / WA Wali: {student.no_hp_wali}</span>
                </p>
              )}
            </div>

            {/* Direct Quick Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="hero-setor-student-btn"
                onClick={() => onOpenDeposit(student.student_id)}
                className="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/20 active:scale-95 transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-white" />
                <span>SETOR</span>
              </button>

              <button
                id="hero-tarik-student-btn"
                onClick={openWithdrawModal}
                className="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/20 active:scale-95 transition-all cursor-pointer"
              >
                <MinusCircle className="w-4 h-4 text-white" />
                <span>TARIK</span>
              </button>
            </div>
          </div>

          {/* Big Balance Number */}
          <div className="mt-4 sm:mt-5 pt-3.5 sm:pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-1.5 sm:gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-emerald-200/90 uppercase tracking-wider block">
                Saldo Tabungan Saat Ini
              </span>
              <p className="text-2xl xs:text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-xs truncate max-w-full">
                {formatRupiah(summary.balance)}
              </p>
            </div>
            <div className="text-[11px] sm:text-xs text-emerald-200/70 font-medium truncate">
              Source of Truth: Berdasarkan {summary.transactionCount} transaksi aktif
            </div>
          </div>
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-200/90 shadow-xs text-center min-w-0">
          <div className="flex items-center justify-center gap-1 text-emerald-600 mb-1">
            <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider truncate">Setoran</span>
          </div>
          <p className="text-xs xs:text-sm sm:text-base font-black text-emerald-700 truncate">
            {formatRupiah(summary.totalDeposit)}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-200/90 shadow-xs text-center min-w-0">
          <div className="flex items-center justify-center gap-1 text-amber-600 mb-1">
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider truncate">Penarikan</span>
          </div>
          <p className="text-xs xs:text-sm sm:text-base font-black text-amber-700 truncate">
            {formatRupiah(summary.totalWithdrawal)}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-200/90 shadow-xs text-center min-w-0">
          <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider truncate">Transaksi</span>
          </div>
          <p className="text-xs xs:text-sm sm:text-base font-black text-slate-800 truncate">
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
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 text-xs text-slate-600 space-y-3">
            <p className="font-medium">
              {report?.transactions?.length === 0
                ? 'Siswa ini belum memiliki transaksi tabungan yang tercatat.'
                : 'Tidak ada transaksi yang cocok dengan filter yang dipilih.'}
            </p>
            {report?.transactions?.length === 0 ? (
              <button
                type="button"
                onClick={() => onOpenDeposit(student.student_id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Buat Setoran Pertama</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setTypeFilter('ALL'); setSelectedMonth('ALL'); setStartDate(''); setEndDate(''); }}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTransactions.map((trx, idx) => {
              const isDeposit = trx.transaction_type === 'SETORAN';
              const isVoid = trx.status === 'VOID';

              return (
                <div
                  key={trx.transaction_id ? `${trx.transaction_id}-${idx}` : `detail-trx-${idx}`}
                  id={`detail-trx-item-${trx.transaction_id || idx}`}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-rose-100 max-h-[calc(100dvh-1.5rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-600 mb-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Batalkan Transaksi Ini?</h4>
            </div>

            <div className="flex-1 overflow-y-auto pr-0.5 space-y-3 custom-scrollbar min-h-0">
              <p className="text-xs text-slate-600 leading-relaxed">
                Anda akan membatalkan transaksi <strong>{voidingTrx.transaction_type}</strong> senilai{' '}
                <strong>{formatRupiah(voidingTrx.amount)}</strong> pada tanggal{' '}
                {formatDateIndo(voidingTrx.transaction_date)}. Saldo siswa akan dikalkulasi ulang secara otomatis.
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Alasan Pembatalan
                </label>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Contoh: Salah input nominal"
                  className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-rose-500 outline-none font-medium text-slate-900"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3.5 border-t border-slate-100 shrink-0 mt-3">
              <button
                type="button"
                onClick={() => setVoidingTrx(null)}
                disabled={isProcessingVoid}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={isProcessingVoid}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white text-xs font-bold shadow-sm shadow-rose-600/20 cursor-pointer"
              >
                {isProcessingVoid ? 'Memproses...' : 'Ya, VOID'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAWAL VALIDATION MODAL */}
      {isWithdrawModalOpen && report && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 shrink-0">
              <div className="flex items-center gap-2 text-amber-700">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <MinusCircle className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    Validasi Penarikan Saldo
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Konfirmasi penarikan tabungan siswa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseWithdrawModal}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {withdrawError && (
              <div className="mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2.5 shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{withdrawError}</span>
              </div>
            )}

            {/* Scrollable Form Body */}
            <form onSubmit={handleWithdrawSubmit} className="flex-1 overflow-y-auto pr-0.5 space-y-3.5 custom-scrollbar min-h-0 flex flex-col">
              <div className="space-y-3.5 flex-1">
                {/* Student Info & Balance Card */}
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Nama Siswa
                      </span>
                      <p className="text-sm font-black text-slate-900 truncate">
                        {report.student.nama}
                      </p>
                      <p className="text-[11px] text-slate-600">
                        NISN: {report.student.nisn || report.student.student_id} • Kelas {report.student.kelas}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Total Saldo
                      </span>
                      <p className="text-base font-black text-emerald-700">
                        {formatRupiah(report.summary.balance)}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                      Nominal yang Ingin Ditarik (Rp) *
                    </label>
                    {report.summary.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawAmount(report.summary.balance);
                          setWithdrawError('');
                        }}
                        className="text-[10px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      >
                        Tarik Semua ({formatRupiah(report.summary.balance)})
                      </button>
                    )}
                  </div>

                  <div className="relative flex items-center">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center font-black text-slate-400 text-sm select-none pointer-events-none">
                      Rp
                    </span>
                    <input
                      id="modal-student-detail-withdraw-amount"
                      type="text"
                      inputMode="numeric"
                      required
                      autoFocus
                      value={withdrawAmount !== '' && Number(withdrawAmount) > 0 ? formatNumber(Number(withdrawAmount)) : ''}
                      onChange={(e) => {
                        const rawDigits = e.target.value.replace(/\D/g, '');
                        const val = rawDigits === '' ? '' : Number(rawDigits);
                        setWithdrawAmount(val);
                        
                        const curBal = report.summary.balance || 0;
                        if (val !== '' && Number(val) > curBal) {
                          setWithdrawError(`Nominal penarikan melebihi total saldo siswa (${formatRupiah(curBal)})!`);
                        } else {
                          setWithdrawError('');
                        }
                      }}
                      placeholder="0"
                      className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 bg-white text-lg font-black text-slate-900 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 outline-none transition-all placeholder:text-slate-300"
                    />
                    {withdrawAmount !== '' && Number(withdrawAmount) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawAmount('');
                          setWithdrawError('');
                        }}
                        className="absolute right-3 p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Terbilang */}
                  {withdrawAmount !== '' && Number(withdrawAmount) > 0 && (
                    <div className="mt-1.5 px-3 py-1.5 bg-slate-50 rounded-xl text-[11px] font-medium text-slate-700 flex items-center gap-1.5 border border-slate-200/70">
                      <span className="font-bold text-slate-500 shrink-0">Terbilang:</span>
                      <span className="italic font-semibold text-amber-800">{terbilangRupiah(Number(withdrawAmount))}</span>
                    </div>
                  )}

                  {/* Sisa Saldo Preview */}
                  {withdrawAmount !== '' && Number(withdrawAmount) > 0 && (
                    <div className="mt-2 flex items-center justify-between text-[11px] px-2 text-slate-600">
                      <span>Sisa Saldo Setelah Ditarik:</span>
                      <strong className={`font-black ${
                        report.summary.balance - Number(withdrawAmount) < 0 
                          ? 'text-rose-600' 
                          : 'text-emerald-700'
                      }`}>
                        {formatRupiah(report.summary.balance - Number(withdrawAmount))}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Keterangan */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                    Keterangan Penarikan
                  </label>
                  <input
                    id="modal-student-detail-withdraw-desc"
                    type="text"
                    value={withdrawDescription}
                    onChange={(e) => setWithdrawDescription(e.target.value)}
                    placeholder="Contoh: Beli buku pelajaran / keperluan sekolah"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-600 outline-none font-medium text-xs text-slate-900"
                  />
                </div>

                {/* Tanggal Transaksi */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                    Tanggal Penarikan
                  </label>
                  <input
                    type="date"
                    value={withdrawDate}
                    onChange={(e) => setWithdrawDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-600 outline-none font-medium text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3.5 flex gap-2.5 border-t border-slate-100 shrink-0 mt-3">
                <button
                  type="button"
                  onClick={handleCloseWithdrawModal}
                  disabled={isProcessingWithdraw}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    isProcessingWithdraw || 
                    !withdrawAmount || 
                    Number(withdrawAmount) <= 0 || 
                    Number(withdrawAmount) > (report.summary.balance || 0)
                  }
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isProcessingWithdraw ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <MinusCircle className="w-4 h-4" />
                      <span>Konfirmasi Tarik</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
