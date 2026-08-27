export type TransactionType = 'SETORAN' | 'PENARIKAN' | 'KOREKSI' | 'VOID';
export type TransactionStatus = 'ACTIVE' | 'VOID';
export type StudentStatus = 'ACTIVE' | 'INACTIVE';
export type EnrollmentStatus = 'ACTIVE' | 'INACTIVE';
export type Gender = 'L' | 'P';
export type UserRole = 'ADMIN' | 'GURU';

export interface AcademicYear {
  academic_year_id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ClassSection {
  class_section_id: string;
  academic_year_id: string;
  academic_year: string;
  class_name: string;
  status: 'ACTIVE' | 'INACTIVE';
  academic_year_is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TeacherAssignment {
  assignment_id: string;
  user_id: string;
  class_section_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
  updated_at?: string;
}

export interface AccessProfile {
  user_id: string;
  username?: string;
  user_name?: string;
  role: UserRole;
  academic_years: string[];
  classes_by_year: Record<string, string[]>;
  class_sections: ClassSection[];
  assignments: TeacherAssignment[];
}

export interface User {
  user_id: string;
  username: string;
  name: string;
  role: UserRole;
  academic_years: string[];
  class_sections: ClassSection[];
  active_academic_year: string;
  class_ids: string[];
  active_class_id: string;
  active_class_section_id: string;
  class_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

export interface Student {
  student_id: string; // canonical master id = NISN
  enrollment_id: string;
  class_section_id: string;
  nisn: string;
  nama: string;
  jenis_kelamin: Gender;
  academic_year: string;
  kelas: string;
  no_hp_wali: string;
  status: StudentStatus;
  enrollment_status?: EnrollmentStatus;
  created_at: string;
  updated_at: string;
  balance?: number;
  totalDeposit?: number;
  totalWithdrawal?: number;
  transactionCount?: number;
  ledgerError?: boolean;
}

export interface Transaction {
  transaction_id: string;
  enrollment_id?: string;
  student_id: string;
  nisn?: string;
  nama?: string;
  class_section_id: string;
  academic_year: string;
  kelas?: string;
  transaction_type: TransactionType;
  amount: number;
  transaction_date: string;
  description: string;
  created_by_user_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: TransactionStatus;
  void_reason?: string;
  voided_by_user_id?: string;
  voided_by?: string;
  voided_at?: string;
  student_nama?: string;
  student_nisn?: string;
  student_kelas?: string;
  student_academic_year?: string;
}

export interface AppSettings {
  school_name: string;
  school_logo?: string;
  academic_year: string;
  currency: string;
  minimum_deposit: number;
  maximum_deposit: number;
  maximum_withdrawal: number;
  class_id: string;
  class_name: string;
  teacher_name: string;
  gas_script_url?: string;
  gas_configured?: boolean;
  allowed_classes?: string[];
  allowed_academic_years?: string[];
}

export interface DashboardSummary {
  teacherName: string;
  className: string;
  academicYear: string;
  totalStudents: number;
  activeSavers: number;
  totalClassBalance: number;
  todayDeposit: number;
  todayWithdrawal: number;
  totalDepositAllTime: number;
  totalWithdrawalAllTime: number;
  recentTransactions: Transaction[];
}

export interface StudentReportSummary {
  balance: number;
  totalDeposit: number;
  totalWithdrawal: number;
  transactionCount: number;
  periodDeposit?: number;
  periodWithdrawal?: number;
  periodNet?: number;
  currentBalance?: number;
}

export interface StudentReport {
  student: Student;
  summary: StudentReportSummary;
  transactions: Transaction[];
}

export interface ClassReportItem {
  studentId: string;
  nisn: string;
  name: string;
  gender: Gender;
  totalDeposit: number;
  totalWithdrawal: number;
  balance: number;
  transactionCount: number;
  status: StudentStatus;
  ledgerError?: boolean;
}

export interface ClassReport {
  totalStudents: number;
  totalBalance: number;
  totalDeposit: number;
  totalWithdrawal: number;
  transactionCount: number;
  students: ClassReportItem[];
}

export interface DashboardDelta {
  totalBalanceDelta: number;
  todayDepositDelta: number;
  todayWithdrawalDelta: number;
}

export interface TransactionMutationResult {
  transaction: Transaction;
  currentBalance: number;
  student?: {
    nisn: string;
    balance: number;
    totalDeposit?: number;
    totalWithdrawal?: number;
    transactionCount?: number;
  };
  dashboardDelta?: DashboardDelta;
  warning?: string;
  idempotent?: boolean;
}

export interface BootstrapData {
  user: User;
  academicYears: string[];
  assignments: TeacherAssignment[];
  classSections: ClassSection[];
  activeSection: ClassSection | null;
  dashboard: DashboardSummary | null;
  students: Student[];
  recentTransactions: Transaction[];
  settings: AppSettings;
  serverTimingMs?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface AuthSession {
  user: User;
  expires_at?: string;
}

export type NavTab = 'dashboard' | 'students' | 'transaction' | 'reports' | 'settings';
