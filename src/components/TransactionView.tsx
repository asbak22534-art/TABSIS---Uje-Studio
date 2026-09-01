import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowDownRight, 
  ArrowUpRight, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Wallet, 
  Share2, 
  Printer, 
  User, 
  Sparkles,
  ArrowRight,
  RefreshCw,
  Plus,
  RotateCcw,
  X,
  FastForward,
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student, Transaction, TransactionMutationResult } from '../types';
import { formatRupiah, formatDateIndo, generateWhatsAppMessage, formatNumber, terbilangRupiah, getJakartaToday } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import { useStudentsQuery, useSettingsQuery, useTransactionMutations } from '../hooks/useQueries';
import { TransactionSkeleton, DelayedRender } from './Skeleton';

interface TransactionViewProps {
  initialStudentId?: string;
  initialType?: 'SETORAN' | 'PENARIKAN';
  onGoToStudentDetail: (studentId: string) => void;
}

export const TransactionView: React.FC<TransactionViewProps> = ({
  initialStudentId,
  initialType = 'SETORAN',
  onGoToStudentDetail
}) => {
  const { data: students = [], isLoading: loadingStudents } = useStudentsQuery();
  const { data: settings } = useSettingsQuery();
  const { depositMutation, withdrawalMutation } = useTransactionMutations();

  // Form states
  const [type, setType] = useState<'SETORAN' | 'PENARIKAN'>(initialType);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [studentSearch, setStudentSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState<string>(
    getJakartaToday()
  );

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Submission state (Pessimistic transaction model)
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successReceipt, setSuccessReceipt] = useState<{
    transaction: Transaction;
    newBalance: number;
    student: Student;
  } | null>(null);

  const { success: toastSuccess, error: toastError } = useToast();

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
    if (initialType) {
      setType(initialType);
    }
  }, [initialStudentId, initialType]);

  const activeStudents = students.filter((s) => s.enrollment_status !== 'INACTIVE' && s.status !== 'INACTIVE');
  const selectedStudent = activeStudents.find((s) => s.student_id === selectedStudentId) || students.find((s) => s.student_id === selectedStudentId);

  // Quick Amount Presets (Langsung ganti nominal)
  const directPresets = [2000, 5000, 10000, 20000, 50000, 100000];

  // Quick Amount Chips (Additive / Penambah)
  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

  const handleSelectDirectAmount = (val: number) => {
    setAmount(val);
    setErrorMessage('');
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  const handleAddQuickAmount = (val: number) => {
    const current = Number(amount) || 0;
    setAmount(current + val);
    setErrorMessage('');
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  const handleClearAmount = () => {
    setAmount('');
    setErrorMessage('');
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setIsDropdownOpen(false);
    setStudentSearch('');
    setErrorMessage('');
    // Auto focus amount input for instant typing
    setTimeout(() => {
      if (amountInputRef.current) {
        amountInputRef.current.focus();
      }
    }, 50);
  };

  const executeTransaction = async (goToNextAfter = false) => {
    if (!selectedStudent) {
      setErrorMessage('Pilih siswa terlebih dahulu.');
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setErrorMessage('Masukkan nominal transaksi yang valid.');
      if (amountInputRef.current) amountInputRef.current.focus();
      return;
    }

    // Strict validation for withdrawal
    if (type === 'PENARIKAN') {
      const curBalance = selectedStudent.balance || 0;
      if (numAmount > curBalance) {
        setErrorMessage(
          `Saldo siswa tidak cukup! Saldo saat ini: ${formatRupiah(curBalance)}, penarikan: ${formatRupiah(numAmount)}.`
        );
        return;
      }
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      let result: TransactionMutationResult;

      if (type === 'SETORAN') {
        result = await depositMutation.mutateAsync({
          student_id: selectedStudent.student_id,
          amount: numAmount,
          description: description.trim() || 'Setoran Tabungan',
          transaction_date: transactionDate
        });
      } else {
        result = await withdrawalMutation.mutateAsync({
          student_id: selectedStudent.student_id,
          amount: numAmount,
          description: description.trim() || 'Penarikan Tabungan',
          transaction_date: transactionDate
        });
      }

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch {}

      const finalBal = result.currentBalance;

      toastSuccess(
        `${type === 'SETORAN' ? 'Setoran' : 'Penarikan'} Berhasil!`,
        `${formatRupiah(numAmount)} untuk ${selectedStudent.nama} berhasil dicatat (Saldo: ${formatRupiah(finalBal)}).`
      );

      if (goToNextAfter) {
        // Find next student in list
        const currentIndex = activeStudents.findIndex((s) => s.student_id === selectedStudent.student_id);
        const nextStudent = activeStudents[(currentIndex + 1) % activeStudents.length];
        if (nextStudent) {
          setSelectedStudentId(nextStudent.student_id);
          setAmount('');
          setDescription('');
          setErrorMessage('');
          setTimeout(() => {
            if (amountInputRef.current) amountInputRef.current.focus();
          }, 100);
        }
      } else {
        setSuccessReceipt({
          transaction: result.transaction,
          newBalance: finalBal,
          student: { ...selectedStudent, balance: finalBal }
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses transaksi.');
      toastError('Transaksi Gagal', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeTransaction(false);
  };

  const handleResetForNextTransaction = () => {
    setSuccessReceipt(null);
    setAmount('');
    setDescription('');
    setErrorMessage('');
    setTimeout(() => {
      if (amountInputRef.current) amountInputRef.current.focus();
    }, 100);
  };

  const handleShareWhatsApp = () => {
    if (!successReceipt) return;
    const msg = generateWhatsAppMessage(
      successReceipt.student.nama,
      successReceipt.transaction.transaction_type as any,
      successReceipt.transaction.amount,
      successReceipt.newBalance,
      successReceipt.transaction.transaction_date,
      settings?.school_name || 'SD Negeri 01 Teladan',
      settings?.teacher_name || 'Wali Kelas',
      successReceipt.transaction.transaction_id
    );

    const phone = successReceipt.student.no_hp_wali?.replace(/[^0-9]/g, '') || '';
    const waUrl = phone
      ? `https://api.whatsapp.com/send?phone=${phone.startsWith('0') ? '62' + phone.slice(1) : phone}&text=${msg}`
      : `https://api.whatsapp.com/send?text=${msg}`;

    window.open(waUrl, '_blank');
  };

  const handlePrintSlip = () => {
    window.print();
  };

  const filteredStudentList = activeStudents.filter((s) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase().trim();
    return s.nama.toLowerCase().includes(q) || (s.nisn && s.nisn.toLowerCase().includes(q));
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredStudentList.length > 0) {
        handleSelectStudent(filteredStudentList[0].student_id);
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto pb-10">
      {/* Title */}
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          Catat Tabungan Siswa
        </h1>
        <p className="text-xs text-slate-700 font-medium">
          Setoran & penarikan instan dengan validasi saldo real-time
        </p>
      </div>

      {/* SUCCESS RECEIPT / BUKTI TRANSAKSI */}
      {successReceipt ? (
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-emerald-200 shadow-xl shadow-emerald-900/5 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3.5 ring-8 ring-emerald-50">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2">
            TRANSAKSI BERHASIL DICATAT
          </span>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
            {successReceipt.transaction.transaction_type === 'SETORAN' ? '+' : '-'}
            {formatRupiah(successReceipt.transaction.amount)}
          </h2>

          <p className="text-sm font-bold text-slate-800 mt-1">
            {successReceipt.student.nama}
          </p>
          <p className="text-xs text-slate-700">
            NISN: {successReceipt.student.nisn || successReceipt.student.student_id} • Kelas {successReceipt.student.kelas}
          </p>

          {/* Receipt Info Box */}
          <div className="bg-slate-50 rounded-2xl p-4 my-5 text-left text-xs space-y-2.5 border border-slate-200/70">
            <div className="flex justify-between">
              <span className="text-slate-700">No. Referensi</span>
              <span className="font-mono font-bold text-slate-800">{successReceipt.transaction.transaction_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700">Jenis Transaksi</span>
              <span className="font-bold text-slate-800">{successReceipt.transaction.transaction_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700">Tanggal</span>
              <span className="font-semibold text-slate-800">{formatDateIndo(successReceipt.transaction.transaction_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700">Keterangan</span>
              <span className="font-semibold text-slate-800">{successReceipt.transaction.description}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2.5 text-emerald-800 font-bold text-sm">
              <span>Saldo Tabungan Terkini</span>
              <span>{formatRupiah(successReceipt.newBalance)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            <div className="flex gap-2">
              <button
                id="share-wa-btn"
                onClick={handleShareWhatsApp}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>Kirim Bukti ke Wali Murid</span>
              </button>

              <button
                id="print-slip-btn"
                onClick={handlePrintSlip}
                className="py-3 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                title="Cetak Struk"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleResetForNextTransaction}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Catat Transaksi Berikutnya</span>
              </button>

              <button
                onClick={() => onGoToStudentDetail(successReceipt.student.student_id)}
                className="py-3 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-colors"
              >
                Rekap Siswa
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* TRANSACTION FORM */
        <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-sm">
          {/* Type Toggle: SETORAN vs PENARIKAN */}
          <div className="grid grid-cols-2 bg-slate-100/90 p-1.5 rounded-2xl mb-5 border border-slate-200/70 gap-1.5">
            <button
              type="button"
              id="type-toggle-setoran"
              onClick={() => {
                setType('SETORAN');
                setErrorMessage('');
              }}
              className={`py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2.5 transition-all duration-150 cursor-pointer active:scale-[0.98] select-none ${
                type === 'SETORAN'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-700/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <div
                className={`w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  type === 'SETORAN'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100/80 text-emerald-700'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </div>
              <span className="truncate whitespace-nowrap">
                Setoran <span className="hidden sm:inline">Tabungan</span>
              </span>
            </button>

            <button
              type="button"
              id="type-toggle-penarikan"
              onClick={() => {
                setType('PENARIKAN');
                setErrorMessage('');
              }}
              className={`py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2.5 transition-all duration-150 cursor-pointer active:scale-[0.98] select-none ${
                type === 'PENARIKAN'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25 ring-1 ring-amber-700/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <div
                className={`w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  type === 'PENARIKAN'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100/80 text-amber-700'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </div>
              <span className="truncate whitespace-nowrap">
                Penarikan <span className="hidden sm:inline">Tabungan</span>
              </span>
            </button>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleProcessTransaction} className="space-y-4">
            {/* Step 1: Select Student */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                1. Pilih Siswa
              </label>

              {/* Student search & dropdown selector */}
              <div className="relative">
                <div
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between transition-colors"
                >
                  {selectedStudent ? (
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          selectedStudent.jenis_kelamin === 'P'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}
                      >
                        {selectedStudent.nama.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{selectedStudent.nama}</p>
                        <p className="text-[11px] text-slate-700">NISN: {selectedStudent.nisn || selectedStudent.student_id} • Kelas {selectedStudent.kelas}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <User className="w-4 h-4" />
                      <span>Klik untuk memilih siswa...</span>
                    </div>
                  )}

                  <div className="text-right">
                    {selectedStudent && (
                      <span className="text-xs font-black text-emerald-700 block">
                        Saldo: {formatRupiah(selectedStudent.balance || 0)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Dropdown list */}
                {isDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 max-h-64 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                      <div className="p-1 mb-1 shrink-0">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Ketik nama atau NISN (Tekan Enter)..."
                            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="space-y-1 overflow-y-auto custom-scrollbar flex-1 pr-0.5 min-h-0">
                        {filteredStudentList.length === 0 ? (
                          <p className="p-3 text-center text-xs text-slate-500">Siswa tidak ditemukan.</p>
                        ) : (
                          filteredStudentList.map((st) => (
                            <div
                              key={st.student_id}
                              onClick={() => handleSelectStudent(st.student_id)}
                              className={`p-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                selectedStudentId === st.student_id
                                  ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200/60'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <p className="font-bold text-slate-900 truncate">{st.nama}</p>
                                <p className="text-[10px] text-slate-500">NISN: {st.nisn || st.student_id} • Kls {st.kelas}</p>
                              </div>
                              <span className="font-extrabold text-emerald-700 shrink-0">
                                {formatRupiah(st.balance || 0)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Current Balance Display Banner (Crucial for Penarikan) */}
            {selectedStudent && (
              <div
                className={`p-3 rounded-2xl flex items-center justify-between gap-2 text-xs border ${
                  type === 'PENARIKAN'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold truncate">Saldo Saat Ini ({selectedStudent.nama}):</span>
                </div>
                <span className="font-black text-sm text-slate-900 shrink-0">
                  {formatRupiah(selectedStudent.balance || 0)}
                </span>
              </div>
            )}

            {/* Step 2: Input Amount */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  2. Nominal Transaksi (Rp) *
                </label>
                {amount !== '' && Number(amount) > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAmount}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset (0)</span>
                  </button>
                )}
              </div>

              <div className="relative flex items-center">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center font-black text-slate-400 text-base select-none pointer-events-none">
                  Rp
                </span>
                <input
                  ref={amountInputRef}
                  id="transaction-amount-input"
                  type="text"
                  inputMode="numeric"
                  required
                  value={amount !== '' && Number(amount) > 0 ? formatNumber(Number(amount)) : ''}
                  onChange={(e) => {
                    const rawDigits = e.target.value.replace(/\D/g, '');
                    if (rawDigits === '') {
                      setAmount('');
                    } else {
                      setAmount(Number(rawDigits));
                    }
                    setErrorMessage('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      executeTransaction(false);
                    }
                  }}
                  placeholder="0"
                  className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-xl font-black text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none transition-all placeholder:text-slate-300"
                />
                {amount !== '' && Number(amount) > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAmount}
                    aria-label="Hapus nominal"
                    className="absolute right-3.5 p-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Spelled-out Terbilang Helper */}
              {amount !== '' && Number(amount) > 0 && (
                <div className="mt-1.5 px-3 py-1.5 bg-slate-100/90 rounded-xl text-[11px] font-medium text-slate-700 flex items-center gap-1.5 border border-slate-200/60">
                  <span className="font-bold text-slate-500 shrink-0">Terbilang:</span>
                  <span className="italic font-semibold text-emerald-800">{terbilangRupiah(Number(amount))}</span>
                </div>
              )}

              {/* Quick Nominal Presets & Additive Buttons */}
              <div className="mt-3 space-y-2">
                {/* 1-Click Exact Presets */}
                <div>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Preset Langsung (1x Klik):
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {directPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleSelectDirectAmount(preset)}
                        className={`py-2 px-1.5 rounded-xl text-xs font-bold border transition-all duration-100 active:scale-95 cursor-pointer ${
                          Number(amount) === preset
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-600/30'
                            : 'bg-white hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 text-slate-700 border-slate-200'
                        }`}
                      >
                        {formatRupiah(preset).replace('Rp ', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cumulative (+) Additive buttons */}
                <div>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Tambah Nominal (+):
                  </span>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {quickAmounts.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleAddQuickAmount(q)}
                        className="py-1.5 px-1 rounded-xl text-[11px] font-black border bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 text-slate-700 border-slate-200/90 shadow-2xs transition-all duration-100 active:scale-95 flex items-center justify-center gap-0.5 cursor-pointer"
                      >
                        <span className="text-emerald-600 font-extrabold text-[10px]">+</span>
                        <span>{q >= 1000 ? `${q / 1000}K` : q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Description & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Keterangan (Opsional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={type === 'SETORAN' ? 'Contoh: Tabungan mingguan' : 'Contoh: Beli buku sekolah'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Tanggal Transaksi
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs outline-none"
                />
              </div>
            </div>

            {/* Dual Action Buttons for Rapid Class Recording */}
            <div className="space-y-2 pt-2">
              <button
                id="submit-transaction-btn"
                type="submit"
                disabled={isProcessing || !selectedStudent || !amount || Number(amount) <= 0}
                className={`w-full py-3.5 sm:py-4 px-5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                  type === 'SETORAN'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menyimpan ke Buku Kas...</span>
                  </>
                ) : (
                  <>
                    <span>
                      Simpan {type === 'SETORAN' ? 'Setoran' : 'Penarikan'} (
                      {formatRupiah(Number(amount) || 0)})
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {type === 'SETORAN' && (
                <button
                  type="button"
                  onClick={() => executeTransaction(true)}
                  disabled={isProcessing || !selectedStudent || !amount || Number(amount) <= 0}
                  className="w-full py-2.5 px-4 rounded-xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FastForward className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Simpan & Lanjut Siswa Berikutnya (Mode Cepat Kelas)</span>
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
