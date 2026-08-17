import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileBarChart, 
  Download, 
  Printer, 
  Users, 
  Wallet, 
  ArrowDownRight, 
  ArrowUpRight, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  TrendingUp,
  RefreshCw,
  Clock
} from 'lucide-react';
import { ClassReport, Transaction } from '../types';
import { api } from '../lib/api';
import { formatRupiah, downloadCSV, formatDateIndo } from '../lib/utils';
import { ReportSkeleton } from './Skeleton';
import { useToast } from '../context/ToastContext';

interface ReportsViewProps {
  onSelectStudent: (studentId: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ onSelectStudent }) => {
  const [classReport, setClassReport] = useState<ClassReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const { success, error: toastError } = useToast();

  const loadReport = async (fresh = false) => {
    try {
      if (fresh) setIsRefreshing(true);
      const data = await api.getClassReport(fresh);
      setClassReport(data);
    } catch (err: any) {
      toastError('Gagal Memuat Laporan', err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  // Filter student rows
  const filteredStudents = useMemo(() => {
    if (!classReport) return [];
    if (!search.trim()) return classReport.students;
    const q = search.toLowerCase().trim();
    return classReport.students.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.nis && s.nis.toLowerCase().includes(q))
    );
  }, [classReport, search]);

  // Export Class Recap CSV
  const handleExportClassRecapCSV = () => {
    if (!classReport) return;
    const header = ['No', 'NISN', 'Nama Siswa', 'Jenis Kelamin', 'Total Setoran (Rp)', 'Total Penarikan (Rp)', 'Saldo Tabungan (Rp)', 'Jumlah Transaksi', 'Status Siswa'];
    const rows = classReport.students.map((s, idx) => [
      (idx + 1).toString(),
      s.nis,
      s.name,
      s.gender === 'L' ? 'Laki-laki' : 'Perempuan',
      s.totalDeposit.toString(),
      s.totalWithdrawal.toString(),
      s.balance.toString(),
      s.transactionCount.toString(),
      s.status
    ]);

    const titleRow = [`REKAPITULASI TABUNGAN KELAS`];
    const statRow = [
      `Total Siswa: ${classReport.totalStudents} | Total Saldo: ${formatRupiah(classReport.totalBalance)} | Total Setoran: ${formatRupiah(classReport.totalDeposit)} | Total Penarikan: ${formatRupiah(classReport.totalWithdrawal)}`
    ];
    const emptyRow = [''];

    downloadCSV(`Rekap_Tabungan_Kelas_${new Date().toISOString().split('T')[0]}.csv`, [
      titleRow,
      statRow,
      emptyRow,
      header,
      ...rows
    ]);

    success('Berhasil Export CSV', 'Rekapitulasi tabungan kelas telah diunduh.');
  };

  // Export All Transactions Log CSV
  const handleExportAllTransactionsCSV = async () => {
    try {
      const allTrx = await api.getTransactions({ limit: 1000 });
      const header = ['ID Transaksi', 'Tanggal', 'NISN', 'Nama Siswa', 'Kelas', 'Jenis', 'Nominal (Rp)', 'Keterangan', 'Wali Kelas', 'Status'];
      const rows = allTrx.map((t) => [
        t.transaction_id,
        t.transaction_date,
        t.student_nisn || '-',
        t.student_nama || '-',
        t.student_kelas || '-',
        t.transaction_type,
        t.amount.toString(),
        t.description,
        t.created_by,
        t.status
      ]);

      downloadCSV(`Jurnal_Semua_Transaksi_Tabungan_${new Date().toISOString().split('T')[0]}.csv`, [
        ['JURNAL LENGKAP TRANSAKSI TABUNGAN SISWA'],
        [''],
        header,
        ...rows
      ]);

      success('Jurnal Transaksi Diunduh', 'Seluruh riwayat transaksi berhasil di-export ke CSV.');
    } catch (err: any) {
      toastError('Gagal Export', err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <ReportSkeleton />;
  }

  if (!classReport) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
        <p className="text-slate-700">Data rekap kelas belum dapat dimuat.</p>
        <button
          onClick={() => loadReport(true)}
          className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Rekap Tabungan Kelas
          </h1>
          <p className="text-xs text-slate-700 font-medium">
            Laporan lengkap seluruh siswa dan rekapitulasi keuangan kelas
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => loadReport(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all"
            title="Segarkan data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            id="export-class-recap-btn"
            onClick={handleExportClassRecapCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Rekap CSV</span>
          </button>

          <button
            id="export-all-trx-btn"
            onClick={handleExportAllTransactionsCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Jurnal Transaksi</span>
          </button>

          <button
            onClick={handlePrint}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
            title="Cetak Laporan"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Class Financial Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Siswa</span>
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {classReport.totalStudents}
          </p>
          <span className="text-[10px] text-slate-700">Terdaftar di kelas</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Saldo</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-700">
            {formatRupiah(classReport.totalBalance)}
          </p>
          <span className="text-[10px] text-slate-700">Uang tersimpan</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Setoran</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-700">
            +{formatRupiah(classReport.totalDeposit)}
          </p>
          <span className="text-[10px] text-slate-700">Akumulasi masuk</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Penarikan</span>
            <ArrowUpRight className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-700">
            -{formatRupiah(classReport.totalWithdrawal)}
          </p>
          <span className="text-[10px] text-slate-700">Akumulasi keluar</span>
        </div>
      </div>

      {/* Search Input for Table */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter nama siswa atau NISN..."
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-900 focus:border-emerald-600 outline-none shadow-xs"
        />
      </div>

      {/* Breakdown per Siswa (Table on Desktop, Cards on Mobile) */}
      <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Rincian Tabungan Per Siswa ({filteredStudents.length})
          </h2>
          <span className="text-xs text-slate-700 font-medium">
            Klik baris siswa untuk membuka detail rekap
          </span>
        </div>

        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredStudents.map((s, idx) => (
            <div
              key={s.studentId}
              onClick={() => onSelectStudent(s.studentId)}
              className="p-4 hover:bg-slate-50 active:bg-emerald-50/50 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-slate-700">#{idx + 1}</span>
                    <h3 className="text-sm font-bold text-slate-900">{s.name}</h3>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-0.5">NISN: {s.nis} • {s.transactionCount} transaksi</p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-700 uppercase block font-bold">Saldo</span>
                  <span className="text-sm font-black text-emerald-700">{formatRupiah(s.balance)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-50 text-[11px]">
                <div className="text-emerald-700">
                  <span>Setoran: </span>
                  <strong className="font-bold">+{formatRupiah(s.totalDeposit)}</strong>
                </div>
                <div className="text-amber-700 text-right">
                  <span>Penarikan: </span>
                  <strong className="font-bold">-{formatRupiah(s.totalWithdrawal)}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View: Full Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-700 font-bold uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">NISN</th>
                <th className="py-3 px-4 text-right">Total Setoran</th>
                <th className="py-3 px-4 text-right">Total Penarikan</th>
                <th className="py-3 px-4 text-right">Saldo Saat Ini</th>
                <th className="py-3 px-4 text-center">Transaksi</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((s, idx) => (
                <tr
                  key={s.studentId}
                  onClick={() => onSelectStudent(s.studentId)}
                  className="hover:bg-emerald-50/40 cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-4 text-center text-slate-700 font-mono">{idx + 1}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">{s.name}</td>
                  <td className="py-3.5 px-4 text-slate-700 font-mono">{s.nis}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                    +{formatRupiah(s.totalDeposit)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-amber-700">
                    -{formatRupiah(s.totalWithdrawal)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm">
                    {formatRupiah(s.balance)}
                  </td>
                  <td className="py-3.5 px-4 text-center text-slate-700">
                    {s.transactionCount} kali
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStudent(s.studentId);
                      }}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <span>Buka Rekap</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
