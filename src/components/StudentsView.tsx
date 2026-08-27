import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  UserPlus, 
  User, 
  Edit3, 
  Trash2, 
  ArrowLeftRight, 
  ChevronRight, 
  Sparkles, 
  Phone, 
  Wallet,
  Calendar,
  X,
  AlertCircle,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { Student, StudentStatus, Gender } from '../types';
import { api } from '../lib/api';
import { formatRupiah, formatDateIndo, formatNumber, terbilangRupiah, getJakartaToday } from '../lib/utils';
import { StudentListSkeleton, DelayedRender } from './Skeleton';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useStudentsQuery, useStudentMutations, useTransactionMutations } from '../hooks/useQueries';

interface StudentsViewProps {
  onSelectStudent: (studentId: string) => void;
  onOpenDeposit: (studentId: string) => void;
  onOpenWithdraw: (studentId: string) => void;
  initialAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  onSelectStudent,
  onOpenDeposit,
  onOpenWithdraw,
  initialAddModalOpen = false,
  onCloseAddModal
}) => {
  const { data: students = [], isLoading, isFetching, refetch } = useStudentsQuery();
  const { createStudentMutation, updateStudentMutation, deleteStudentMutation } = useStudentMutations();
  const { withdrawalMutation } = useTransactionMutations();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(initialAddModalOpen);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Form Fields
  const [nisn, setNisn] = useState('');
  const [nama, setNama] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<Gender>('L');
  const [noHpWali, setNoHpWali] = useState('');

  // Withdrawal Modal states
  const [withdrawingStudent, setWithdrawingStudent] = useState<Student | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');
  const [withdrawDescription, setWithdrawDescription] = useState('');
  const [withdrawDate, setWithdrawDate] = useState<string>(getJakartaToday());
  const [withdrawError, setWithdrawError] = useState('');
  const [isProcessingWithdraw, setIsProcessingWithdraw] = useState(false);

  const { success, error: toastError } = useToast();
  const { activeAcademicYear, activeClassId } = useAuth();

  useEffect(() => {
    if (initialAddModalOpen) {
      openAddModal();
    }
  }, [initialAddModalOpen]);

  const openAddModal = () => {
    setEditingStudent(null);
    setNisn('');
    setNama('');
    setJenisKelamin('L');
    setNoHpWali('');
    setFormError('');
    setIsFormModalOpen(true);
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setNisn(student.nisn || student.student_id || '');
    setNama(student.nama);
    setJenisKelamin(student.jenis_kelamin || 'L');
    setNoHpWali(student.no_hp_wali || '');
    setFormError('');
    setIsFormModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFormModalOpen(false);
    setEditingStudent(null);
    if (onCloseAddModal) onCloseAddModal();
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim() || !nisn.trim()) {
      setFormError('Nama siswa dan NISN wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      if (editingStudent) {
        // Update
        await updateStudentMutation.mutateAsync({
          id: editingStudent.student_id,
          data: {
            nisn: nisn.trim(),
            nama: nama.trim(),
            jenis_kelamin: jenisKelamin,
            no_hp_wali: noHpWali.trim(),
          },
        });
        success('Siswa Diperbarui', `Data ${nama} berhasil disimpan.`);
      } else {
        // Create
        await createStudentMutation.mutateAsync({
          nisn: nisn.trim(),
          nama: nama.trim(),
          jenis_kelamin: jenisKelamin,
          no_hp_wali: noHpWali.trim(),
          status: 'ACTIVE',
        });
        success('Siswa Ditambahkan', `${nama} berhasil didaftarkan ke ${activeAcademicYear || 'tahun aktif'} • kelas ${activeClassId || 'aktif'}.`);
      }

      handleCloseModal();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data siswa.');
      toastError('Gagal Menyimpan', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOrDeactivate = async () => {
    if (!deletingStudent) return;
    setIsSubmitting(true);
    try {
      const res = await deleteStudentMutation.mutateAsync(deletingStudent.student_id);
      success(
        'Enrollment Dinonaktifkan',
        res.message || 'Siswa berhasil dinonaktifkan dari kelas aktif.'
      );
      setDeletingStudent(null);
    } catch (err: any) {
      toastError('Gagal Memproses', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openWithdrawModal = (student: Student) => {
    setWithdrawingStudent(student);
    setWithdrawAmount('');
    setWithdrawDescription('Penarikan Tabungan');
    setWithdrawDate(getJakartaToday());
    setWithdrawError('');
  };

  const handleCloseWithdrawModal = () => {
    setWithdrawingStudent(null);
    setWithdrawAmount('');
    setWithdrawDescription('');
    setWithdrawError('');
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawingStudent) return;

    const numAmount = Number(withdrawAmount);
    const curBalance = withdrawingStudent.balance || 0;

    if (!numAmount || numAmount <= 0) {
      setWithdrawError('Nominal penarikan harus lebih dari Rp 0.');
      return;
    }

    if (numAmount > curBalance) {
      setWithdrawError(
        `Nominal penarikan (${formatRupiah(numAmount)}) melebihi saldo tabungan siswa (${formatRupiah(curBalance)})!`
      );
      return;
    }

    setIsProcessingWithdraw(true);
    setWithdrawError('');

    try {
      const result = await withdrawalMutation.mutateAsync({
        student_id: withdrawingStudent.student_id,
        amount: numAmount,
        description: withdrawDescription.trim() || 'Penarikan Tabungan',
        transaction_date: withdrawDate
      });

      success(
        'Penarikan Berhasil!',
        `Penarikan ${formatRupiah(numAmount)} untuk ${withdrawingStudent.nama} berhasil dicatat. Saldo baru: ${formatRupiah(result.currentBalance)}.`
      );

      handleCloseWithdrawModal();
    } catch (err: any) {
      setWithdrawError(err.message || 'Gagal memproses penarikan tabungan.');
      toastError('Penarikan Gagal', err.message);
    } finally {
      setIsProcessingWithdraw(false);
    }
  };

  const handleToggleStatus = async (student: Student) => {
    const newStatus: StudentStatus = student.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateStudentMutation.mutateAsync({
        id: student.student_id,
        data: { status: newStatus },
      });
      success('Status Diperbarui', `${student.nama} sekarang status: ${newStatus}`);
    } catch (err: any) {
      toastError('Gagal Mengubah Status', err.message);
    }
  };

  // Local fast filtering using search query and status filter
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Status match
      if (statusFilter !== 'ALL' && s.status !== statusFilter) {
        return false;
      }
      // Search query match
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.nama.toLowerCase().includes(q) ||
        (s.nisn && s.nisn.toLowerCase().includes(q)) ||
        (s.no_hp_wali && s.no_hp_wali.toLowerCase().includes(q))
      );
    });
  }, [students, searchQuery, statusFilter]);

  if (isLoading && (!students || students.length === 0)) {
    return (
      <DelayedRender delay={150}>
        <StudentListSkeleton />
      </DelayedRender>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header & Add Button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Daftar Siswa
          </h1>
          <p className="text-xs text-slate-700 font-medium">
            Total {students.length} siswa terdaftar • {students.filter(s => s.status === 'ACTIVE').length} aktif
          </p>
        </div>

        <button
          id="add-student-header-btn"
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-xs shadow-emerald-600/20 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Tambah Siswa</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="student-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama siswa, NISN, atau No HP wali..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(['ACTIVE', 'ALL', 'INACTIVE'] as const).map((st) => {
            const active = statusFilter === st;
            const label = st === 'ACTIVE' ? 'Siswa Aktif' : st === 'INACTIVE' ? 'Nonaktif' : 'Semua';
            const count = st === 'ALL' ? students.length : students.filter(s => s.status === st).length;

            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${active ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Student List View */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-xs">
          <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">Tidak ada siswa ditemukan</h3>
          <p className="text-xs text-slate-700 mt-1 max-w-xs mx-auto">
            {searchQuery
              ? `Tidak ada hasil pencarian untuk "${searchQuery}". Coba kata kunci lain.`
              : 'Belum ada siswa dalam kategori ini.'}
          </p>
          <button
            onClick={openAddModal}
            className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Siswa Sekarang</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredStudents.map((student) => {
            const isInactive = student.status === 'INACTIVE';
            return (
              <div
                key={student.student_id}
                id={`student-card-${student.student_id}`}
                onMouseEnter={() => api.prefetchStudentReport(student.student_id)}
                className={`bg-white rounded-2xl p-3.5 sm:p-4 border transition-all hover:border-emerald-300 hover:shadow-xs group ${
                  isInactive ? 'border-slate-200 bg-slate-50/70 opacity-75' : 'border-slate-200/90'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                  {/* Left info */}
                  <div
                    onClick={() => onSelectStudent(student.student_id)}
                    className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0 cursor-pointer"
                  >
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        student.jenis_kelamin === 'P'
                          ? 'bg-rose-50 text-rose-700 border border-rose-100'
                          : 'bg-teal-50 text-teal-700 border border-teal-100'
                      }`}
                    >
                      {student.nama.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                          {student.nama}
                        </h2>
                        {isInactive && (
                          <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-slate-200 text-slate-600 rounded-md">
                            Nonaktif
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] sm:text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5">
                        <span>NISN: <strong className="font-semibold text-slate-800">{student.nisn || student.student_id}</strong></span>
                        <span className="text-slate-300">•</span>
                        <span>{student.academic_year} • Kelas {student.kelas}</span>
                        {student.no_hp_wali && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="truncate max-w-[130px] sm:max-w-none text-slate-500">WA: {student.no_hp_wali}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right balance */}
                  <div
                    onClick={() => onSelectStudent(student.student_id)}
                    className="text-right shrink-0 cursor-pointer pl-1.5"
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                      Saldo
                    </span>
                    <span className="text-xs sm:text-base font-black text-emerald-700 whitespace-nowrap">
                      {formatRupiah(student.balance || 0)}
                    </span>
                  </div>
                </div>

                {/* Card Action Bar - strictly 1 single row */}
                <div className="mt-3 pt-2.5 sm:pt-3 border-t border-slate-100/90 flex flex-row items-center justify-between gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <button
                      id={`student-setor-btn-${student.student_id}`}
                      type="button"
                      onClick={() => onOpenDeposit(student.student_id)}
                      className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-700 text-[11px] sm:text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                      title="Setor Cepat"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Setor</span>
                    </button>

                    <button
                      id={`student-tarik-btn-${student.student_id}`}
                      type="button"
                      onClick={() => openWithdrawModal(student)}
                      className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-700 text-[11px] sm:text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                      title="Tarik Saldo Siswa"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>Tarik</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(student)}
                      className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 rounded-lg sm:rounded-xl transition-all cursor-pointer"
                      title="Edit Siswa"
                    >
                      <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingStudent(student)}
                      className="p-1 sm:p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 rounded-lg sm:rounded-xl transition-all cursor-pointer"
                      title="Hapus / Nonaktifkan"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectStudent(student.student_id)}
                      className="ml-0.5 px-2 sm:px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-0.5 sm:gap-1 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                    >
                      <span>Tabungan</span>
                      <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100/90 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <UserPlus className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingStudent ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-3.5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Scrollable Form Body */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto pr-0.5 space-y-3.5 custom-scrollbar min-h-0 flex flex-col">
              <div className="space-y-3.5 flex-1">
                {/* NISN & Kelas */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                      NISN (Nomor Induk Siswa Nasional) *
                    </label>
                    <input
                      type="text"
                      required
                      value={nisn}
                      onChange={(e) => setNisn(e.target.value)}
                      readOnly={!!editingStudent}
                      aria-readonly={!!editingStudent}
                      placeholder="Contoh: 0123456789"
                      className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-200 outline-none font-mono text-xs sm:text-sm text-slate-900 transition-colors ${editingStudent ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50 focus:bg-white focus:border-emerald-600'}`}
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">Tahun Pelajaran</label>
                    <input type="text" value={activeAcademicYear || editingStudent?.academic_year || ''} readOnly aria-readonly="true" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 outline-none font-medium text-xs sm:text-sm text-slate-700 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                      Kelas *
                    </label>
                    <input
                      type="text"
                      required
                      value={activeClassId || editingStudent?.kelas || ''}
                      readOnly
                      aria-readonly="true"
                      placeholder="Kelas aktif"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 outline-none font-medium text-xs sm:text-sm text-slate-700 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Nama Lengkap Siswa */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                    Nama Lengkap Siswa *
                  </label>
                  <input
                    type="text"
                    required
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    placeholder="Nama lengkap siswa"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none font-medium text-xs sm:text-sm text-slate-900 transition-colors"
                  />
                </div>

                {/* Jenis Kelamin Button Group */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                    Jenis Kelamin *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setJenisKelamin('L')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                        jenisKelamin === 'L'
                          ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-2xs ring-1 ring-teal-500/20'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>Laki-laki (L)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setJenisKelamin('P')}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                        jenisKelamin === 'P'
                          ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-2xs ring-1 ring-rose-500/20'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>Perempuan (P)</span>
                    </button>
                  </div>
                </div>

                {/* No HP Wali */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">
                    Nomor HP / WhatsApp Wali (Opsional)
                  </label>
                  <input
                    type="tel"
                    value={noHpWali}
                    onChange={(e) => setNoHpWali(e.target.value)}
                    placeholder="Contoh: 08123456789"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 outline-none font-medium text-xs sm:text-sm text-slate-900 transition-colors"
                  />
                </div>
              </div>

              {/* Modal Fixed Footer */}
              <div className="pt-3.5 flex gap-2.5 border-t border-slate-100 shrink-0 mt-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? 'Menyimpan...' : editingStudent ? 'Simpan Perubahan' : 'Daftarkan Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Deactivate Confirmation Modal */}
      {deletingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 max-h-[calc(100dvh-1.5rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-600 mb-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Hapus / Nonaktifkan Siswa?</h4>
            </div>

            <div className="flex-1 overflow-y-auto pr-0.5 custom-scrollbar min-h-0">
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Apakah Anda yakin ingin menghapus atau menonaktifkan data <strong>{deletingStudent.nama}</strong> (NISN: {deletingStudent.nisn || deletingStudent.student_id})?
              </p>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 text-[11px] text-slate-600 leading-relaxed">
                💡 <em>Catatan: Jika siswa memiliki riwayat transaksi, sistem akan otomatis melakukan soft-delete (menonaktifkan) agar riwayat pembukuan tabungan tetap akurat.</em>
              </div>
            </div>

            <div className="flex gap-2 pt-3.5 border-t border-slate-100 shrink-0 mt-3">
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteOrDeactivate}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-rose-600/20 cursor-pointer"
              >
                {isSubmitting ? 'Memproses...' : 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Validation Modal */}
      {withdrawingStudent && (
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
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
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
                        {withdrawingStudent.nama}
                      </p>
                      <p className="text-[11px] text-slate-600">
                        NISN: {withdrawingStudent.nisn || withdrawingStudent.student_id} • {withdrawingStudent.academic_year} • Kelas {withdrawingStudent.kelas}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Total Saldo
                      </span>
                      <p className="text-base font-black text-emerald-700">
                        {formatRupiah(withdrawingStudent.balance || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                      Nominal yang Ingin Ditarik (Rp) *
                    </label>
                    {(withdrawingStudent.balance || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawAmount(withdrawingStudent.balance || 0);
                          setWithdrawError('');
                        }}
                        className="text-[10px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      >
                        Tarik Semua ({formatRupiah(withdrawingStudent.balance || 0)})
                      </button>
                    )}
                  </div>

                  <div className="relative flex items-center">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center font-black text-slate-400 text-sm select-none pointer-events-none">
                      Rp
                    </span>
                    <input
                      id="modal-withdraw-amount-input"
                      type="text"
                      inputMode="numeric"
                      required
                      autoFocus
                      value={withdrawAmount !== '' && Number(withdrawAmount) > 0 ? formatNumber(Number(withdrawAmount)) : ''}
                      onChange={(e) => {
                        const rawDigits = e.target.value.replace(/\D/g, '');
                        const val = rawDigits === '' ? '' : Number(rawDigits);
                        setWithdrawAmount(val);
                        
                        const curBal = withdrawingStudent.balance || 0;
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
                        (withdrawingStudent.balance || 0) - Number(withdrawAmount) < 0 
                          ? 'text-rose-600' 
                          : 'text-emerald-700'
                      }`}>
                        {formatRupiah((withdrawingStudent.balance || 0) - Number(withdrawAmount))}
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
                    id="modal-withdraw-desc-input"
                    type="text"
                    value={withdrawDescription}
                    onChange={(e) => setWithdrawDescription(e.target.value)}
                    placeholder="Contoh: Beli buku pelajaran / uang saku lomba"
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
                    Number(withdrawAmount) > (withdrawingStudent.balance || 0)
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
