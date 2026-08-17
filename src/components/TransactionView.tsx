import React, { useState, useEffect } from 'react';
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
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student, Transaction, AppSettings } from '../types';
import { api } from '../lib/api';
import { formatRupiah, formatDateIndo, generateWhatsAppMessage } from '../lib/utils';
import { useToast } from '../context/ToastContext';

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
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Form states
  const [type, setType] = useState<'SETORAN' | 'PENARIKAN'>(initialType);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [studentSearch, setStudentSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Submission state (Pessimistic transaction model)
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successReceipt, setSuccessReceipt] = useState<{
    transaction: Transaction;
    newBalance: number;
    student: Student;
  } | null>(null);

  const { success: toastSuccess, error: toastError } = useToast();

  const loadInitialData = async () => {
    try {
      const [stdList, sett] = await Promise.all([
        api.getStudents('ACTIVE'),
        api.getSettings()
      ]);
      setStudents(stdList);
      setSettings(sett);

      if (initialStudentId && !selectedStudentId) {
        setSelectedStudentId(initialStudentId);
      }
    } catch (err: any) {
      toastError('Gagal Memuat Data', err.message);
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
    if (initialType) {
      setType(initialType);
    }
  }, [initialStudentId, initialType]);

  const selectedStudent = students.find((s) => s.student_id === selectedStudentId);

  // Quick Amount Chips
  const quickAmounts = [10000, 20000, 50000, 100000, 200000, 500000];

  const handleSelectQuickAmount = (val: number) => {
    setAmount(val);
    setErrorMessage('');
  };

  const handleAddQuickAmount = (val: number) => {
    const current = Number(amount) || 0;
    setAmount(current + val);
    setErrorMessage('');
  };

  const handleProcessTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      setErrorMessage('Pilih siswa terlebih dahulu.');
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setErrorMessage('Masukkan nominal transaksi yang valid.');
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
      let result: { transaction: Transaction; newBalance: number };

      if (type === 'SETORAN') {
        result = await api.createDeposit({
          student_id: selectedStudent.student_id,
          amount: numAmount,
          description: description.trim() || 'Setoran Tabungan',
          transaction_date: transactionDate
        });
      } else {
        result = await api.createWithdrawal({
          student_id: selectedStudent.student_id,
          amount: numAmount,
          description: description.trim() || 'Penarikan Tabungan',
          transaction_date: transactionDate
        });
      }

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch {}

      // Update local student balance in student list
      setStudents((prev) =>
        prev.map((s) =>
          s.student_id === selectedStudent.student_id
            ? { ...s, balance: result.newBalance }
            : s
        )
      );

      setSuccessReceipt({
        transaction: result.transaction,
        newBalance: result.newBalance,
        student: { ...selectedStudent, balance: result.newBalance }
      });

      toastSuccess(
        type === 'SETORAN' ? 'Setoran Berhasil!' : 'Penarikan Berhasil!',
        `${formatRupiah(numAmount)} untuk ${selectedStudent.nama}`
      );
    } catch (err: any) {
      const msg = err.message || 'Gagal memproses transaksi keuangan.';
      setErrorMessage(msg);
      toastError('Transaksi Gagal', msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetForNextTransaction = () => {
    setSuccessReceipt(null);
    setAmount('');
    setDescription('');
    setErrorMessage('');
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

  const filteredStudentList = students.filter((s) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase().trim();
    return s.nama.toLowerCase().includes(q) || (s.nisn && s.nisn.toLowerCase().includes(q));
  });

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
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-5">
            <button
              type="button"
              id="type-toggle-setoran"
              onClick={() => {
                setType('SETORAN');
                setErrorMessage('');
              }}
              className={`flex-1 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-150 ${
                type === 'SETORAN'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>+ SETORAN TABUNGAN</span>
            </button>

            <button
              type="button"
              id="type-toggle-penarikan"
              onClick={() => {
                setType('PENARIKAN');
                setErrorMessage('');
              }}
              className={`flex-1 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-150 ${
                type === 'PENARIKAN'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>- PENARIKAN TABUNGAN</span>
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
                  <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 max-h-60 overflow-y-auto">
                    <div className="p-1 mb-1">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          placeholder="Ketik nama atau NISN..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      {filteredStudentList.length === 0 ? (
                        <p className="p-3 text-center text-xs text-slate-700">Siswa tidak ditemukan.</p>
                      ) : (
                        filteredStudentList.map((st) => (
                          <div
                            key={st.student_id}
                            onClick={() => {
                              setSelectedStudentId(st.student_id);
                              setIsDropdownOpen(false);
                              setStudentSearch('');
                              setErrorMessage('');
                            }}
                            className={`p-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                              selectedStudentId === st.student_id
                                ? 'bg-emerald-50 text-emerald-900 font-bold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div>
                              <p className="font-bold text-slate-900">{st.nama}</p>
                              <p className="text-[10px] text-slate-700">NISN: {st.nisn || st.student_id}</p>
                            </div>
                            <span className="font-extrabold text-emerald-700">
                              {formatRupiah(st.balance || 0)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Current Balance Display Banner (Crucial for Penarikan) */}
            {selectedStudent && (
              <div
                className={`p-3 rounded-2xl flex items-center justify-between text-xs border ${
                  type === 'PENARIKAN'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">Saldo Saat Ini ({selectedStudent.nama}):</span>
                </div>
                <span className="font-black text-sm text-slate-900">
                  {formatRupiah(selectedStudent.balance || 0)}
                </span>
              </div>
            )}

            {/* Step 2: Input Amount */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                2. Nominal Transaksi (Rp) *
              </label>

              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center font-bold text-slate-400 text-base">
                  Rp
                </span>
                <input
                  id="transaction-amount-input"
                  type="number"
                  required
                  min={1}
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setAmount(val);
                    setErrorMessage('');
                  }}
                  placeholder="0"
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-xl font-black text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none transition-all"
                />
              </div>

              {/* Quick Amount Chips */}
              <div className="mt-2.5">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                  Pilihan Nominal Cepat:
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {quickAmounts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSelectQuickAmount(q)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                        amount === q
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {q >= 1000 ? `${q / 1000}K` : q}
                    </button>
                  ))}
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

            {/* Pessimistic Confirmation Submit Button */}
            <button
              id="submit-transaction-btn"
              type="submit"
              disabled={isProcessing || !selectedStudent || !amount || Number(amount) <= 0}
              className={`w-full mt-3 py-4 px-5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                type === 'SETORAN'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                  : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memproses Transaksi...</span>
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
          </form>
        </div>
      )}
    </div>
  );
};
