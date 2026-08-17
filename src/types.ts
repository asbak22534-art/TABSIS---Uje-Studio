export type TransactionType = 'SETORAN' | 'PENARIKAN' | 'KOREKSI' | 'VOID';
export type TransactionStatus = 'ACTIVE' | 'VOID';
export type StudentStatus = 'ACTIVE' | 'INACTIVE';
export type Gender = 'L' | 'P';

export interface User {
  user_id: string;
  username: string;
  name: string;
  password_hash?: string;
  class_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

export interface Student {
  student_id: string; // Same as nisn for unique identification
  nisn: string;
  nama: string;
  jenis_kelamin: Gender;
  kelas: string;
  no_hp_wali: string;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
  // Calculated financial metrics (Source of truth: Transactions)
  balance?: number;
  totalDeposit?: number;
  totalWithdrawal?: number;
  transactionCount?: number;
}

export interface Transaction {
  transaction_id: string;
  student_id: string;
  nisn?: string;
  nama?: string;
  transaction_type: TransactionType;
  amount: number;
  transaction_date: string; // YYYY-MM-DD
  description: string;
  created_by: string; // Nama Wali Kelas
  created_at: string; // ISO String
  updated_at: string;
  status: TransactionStatus;
  void_reason?: string;
  // Virtual joins for UI display
  student_nama?: string;
  student_nisn?: string;
  student_kelas?: string;
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
}

export interface ClassReport {
  totalStudents: number;
  totalBalance: number;
  totalDeposit: number;
  totalWithdrawal: number;
  transactionCount: number;
  students: ClassReportItem[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface AuthSession {
  token: string;
  user: {
    user_id: string;
    username: string;
    name: string;
    class_id: string;
  };
  expires_at: string;
}

export type NavTab = 'dashboard' | 'students' | 'transaction' | 'reports' | 'settings';
