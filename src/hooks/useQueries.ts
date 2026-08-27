import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, TransactionResult } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useAuth } from '../context/AuthContext';
import type { Student, DashboardSummary, StudentReport, ClassReport, AppSettings, AccessProfile, Transaction, BootstrapData } from '../types';

export function useBootstrapQuery(enabled = true) {
  const { activeAcademicYear, activeClassId } = useAuth();
  return useQuery<BootstrapData, Error>({
    queryKey: queryKeys.bootstrap(activeAcademicYear, activeClassId),
    queryFn: () => api.getBootstrap(),
    enabled,
    staleTime: 20_000,
  });
}

export function useDashboardQuery(options?: { enabled?: boolean }) {
  const { activeAcademicYear, activeClassId, isAuthenticated } = useAuth();
  return useQuery<DashboardSummary, Error>({
    queryKey: queryKeys.dashboard(activeAcademicYear, activeClassId),
    queryFn: () => api.getSummary({ fresh: true }),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 10_000, // 10 seconds for financial dashboard
    initialData: () => api.getCachedSummary() ?? undefined,
  });
}

export function useStudentsQuery(options?: { enabled?: boolean }) {
  const { activeAcademicYear, activeClassId, isAuthenticated } = useAuth();
  return useQuery<Student[], Error>({
    queryKey: queryKeys.students(activeAcademicYear, activeClassId),
    queryFn: () => api.getStudents({ fresh: true }),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 15_000,
    initialData: () => api.getCachedStudents() ?? undefined,
  });
}

export function useTransactionsQuery(filter?: { studentId?: string; limit?: number }, options?: { enabled?: boolean }) {
  const { activeAcademicYear, activeClassId, isAuthenticated } = useAuth();
  const studentId = filter?.studentId;
  const limit = filter?.limit;

  return useQuery<Transaction[], Error>({
    queryKey: queryKeys.transactions(activeAcademicYear, activeClassId, studentId, limit),
    queryFn: () => api.getTransactions({ student_id: studentId, limit, fresh: true }),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 10_000,
  });
}

export function useStudentDetailQuery(studentId: string | null, options?: { enabled?: boolean }) {
  const { activeAcademicYear, activeClassId, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  return useQuery<Student, Error>({
    queryKey: queryKeys.studentDetail(activeAcademicYear, activeClassId, studentId),
    queryFn: () => api.getStudentById(studentId!),
    enabled: isAuthenticated && !!studentId && (options?.enabled ?? true),
    staleTime: 15_000,
    initialData: () => {
      if (!studentId) return undefined;
      const students = queryClient.getQueryData<Student[]>(queryKeys.students(activeAcademicYear, activeClassId));
      return students?.find(
        (s) => s.student_id === studentId || s.nisn === studentId || s.enrollment_id === studentId
      );
    },
  });
}

export function useStudentReportQuery(
  studentId: string | null,
  period?: { startDate?: string; endDate?: string },
  options?: { enabled?: boolean }
) {
  const { activeAcademicYear, activeClassId, isAuthenticated } = useAuth();
  return useQuery<StudentReport, Error>({
    queryKey: queryKeys.studentReport(activeAcademicYear, activeClassId, studentId, period?.startDate, period?.endDate),
    queryFn: () => api.getStudentReport(studentId!, period?.startDate, period?.endDate),
    enabled: isAuthenticated && !!studentId && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useClassReportQuery(options?: { enabled?: boolean }) {
  const { activeAcademicYear, activeClassId, isAuthenticated } = useAuth();
  return useQuery<ClassReport, Error>({
    queryKey: queryKeys.classReport(activeAcademicYear, activeClassId),
    queryFn: () => api.getClassReport(true),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 15_000,
    initialData: () => api.getCachedClassReport() ?? undefined,
  });
}

export function useSettingsQuery(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();
  return useQuery<AppSettings, Error>({
    queryKey: queryKeys.settings(),
    queryFn: () => api.getSettings(true),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000, // 5 minutes for settings
    initialData: () => api.getCachedSettings() ?? undefined,
  });
}

export function useAccessProfileQuery(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();
  return useQuery<AccessProfile, Error>({
    queryKey: queryKeys.accessProfile(),
    queryFn: () => api.getAccessProfile(true),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
    initialData: () => api.getCachedAccessProfile() ?? undefined,
  });
}

export function useGasScriptQuery(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();
  return useQuery<string, Error>({
    queryKey: queryKeys.gasScript(),
    queryFn: () => api.getGasScript(true),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 60 * 60 * 1000, // 1 hour for GAS script code
    initialData: () => api.getCachedGasScript() ?? undefined,
  });
}

/**
 * Mutation hooks with precise cache updates (GAS-first, ledger verified)
 */
export function useTransactionMutations() {
  const queryClient = useQueryClient();
  const { activeAcademicYear, activeClassId } = useAuth();

  const handleMutationSuccess = (result: TransactionResult) => {
    // Invalidate financial queries for the current active scope
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(activeAcademicYear, activeClassId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.students(activeAcademicYear, activeClassId) });
    queryClient.invalidateQueries({ queryKey: ['transactions', activeAcademicYear || '', activeClassId || ''] });
    queryClient.invalidateQueries({ queryKey: ['student_report', activeAcademicYear || '', activeClassId || ''] });
    queryClient.invalidateQueries({ queryKey: queryKeys.classReport(activeAcademicYear, activeClassId) });
    if (result.student?.nisn) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.studentDetail(activeAcademicYear, activeClassId, result.student.nisn),
      });
    }
  };

  const depositMutation = useMutation({
    mutationFn: (params: { student_id: string; amount: number; transaction_date?: string; description?: string }) =>
      api.deposit(params),
    onSuccess: handleMutationSuccess,
  });

  const withdrawalMutation = useMutation({
    mutationFn: (params: { student_id: string; amount: number; transaction_date?: string; description?: string }) =>
      api.withdraw(params),
    onSuccess: handleMutationSuccess,
  });

  const voidMutation = useMutation({
    mutationFn: (params: { transaction_id: string; void_reason?: string }) =>
      api.voidTransaction(params.transaction_id, params.void_reason),
    onSuccess: handleMutationSuccess,
  });

  return { depositMutation, withdrawalMutation, voidMutation };
}

export function useStudentMutations() {
  const queryClient = useQueryClient();
  const { activeAcademicYear, activeClassId } = useAuth();

  const handleStudentMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.students(activeAcademicYear, activeClassId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(activeAcademicYear, activeClassId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.classReport(activeAcademicYear, activeClassId) });
  };

  const createStudentMutation = useMutation({
    mutationFn: (student: Partial<Student>) => api.createStudent(student),
    onSuccess: handleStudentMutationSuccess,
  });

  const updateStudentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Student> }) => api.updateStudent(id, data),
    onSuccess: handleStudentMutationSuccess,
  });

  const deleteStudentMutation = useMutation({
    mutationFn: (id: string) => api.deleteStudent(id),
    onSuccess: handleStudentMutationSuccess,
  });

  return { createStudentMutation, updateStudentMutation, deleteStudentMutation };
}
