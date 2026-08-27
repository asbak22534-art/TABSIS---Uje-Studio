import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  bootstrap: (year?: string | null, classId?: string | null) => ['bootstrap', year || '', classId || ''] as const,
  accessProfile: () => ['access_profile'] as const,
  settings: () => ['settings'] as const,
  dashboard: (year?: string | null, classId?: string | null) => ['dashboard', year || '', classId || ''] as const,
  students: (year?: string | null, classId?: string | null) => ['students', year || '', classId || ''] as const,
  studentDetail: (year?: string | null, classId?: string | null, studentId?: string | null) => ['student', year || '', classId || '', studentId || ''] as const,
  studentReport: (year?: string | null, classId?: string | null, studentId?: string | null, startDate?: string, endDate?: string) =>
    ['student_report', year || '', classId || '', studentId || '', startDate || '', endDate || ''] as const,
  transactions: (year?: string | null, classId?: string | null, studentId?: string | null, limit?: number) =>
    ['transactions', year || '', classId || '', studentId || '', limit || 0] as const,
  classReport: (year?: string | null, classId?: string | null) => ['class_report', year || '', classId || ''] as const,
  gasScript: () => ['gas_script'] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000, // 15 seconds default for financial safety + swift navigation
      gcTime: 10 * 60 * 1000, // 10 minutes cache retention
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403 || error?.status === 404 || error?.status === 409) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false, // Financial mutations must never blindly auto-retry
    },
  },
});
