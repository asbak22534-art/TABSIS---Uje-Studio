import fs from 'fs';
import path from 'path';
import { 
  User, 
  Student, 
  Transaction, 
  AppSettings, 
  DashboardSummary, 
  ClassReport, 
  StudentReport 
} from '../src/types.js';

interface SessionData {
  session_id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  status: 'ACTIVE' | 'EXPIRED';
}

interface DatabaseSchema {
  users: User[];
  students: Student[];
  transactions: Transaction[];
  settings: AppSettings;
  sessions: SessionData[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'tabungan_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial default settings
const defaultSettings: AppSettings = {
  school_name: 'MI Islam Terpadu Al-Uswah Pasirian',
  school_logo: '',
  academic_year: '2026/2027',
  currency: 'IDR',
  minimum_deposit: 1000,
  maximum_deposit: 5000000,
  maximum_withdrawal: 5000000,
  class_id: '5C',
  class_name: '5C',
  teacher_name: 'Jefri Eka Anggara Putra, S.Pd',
  gas_script_url: 'https://script.google.com/macros/s/AKfycbw098797ZSZS8NTg_Ksez8CGBNwDbsq2uody9RBJTN9pIorj4kAFrJ7-HIc8ccMDxEstw/exec'
};

// Initial default user (Wali Kelas)
const defaultUsers: User[] = [
  {
    user_id: 'USR-001',
    username: 'uje',
    name: 'Jefri Eka Anggara Putra, S.Pd',
    password_hash: 'uje321',
    class_id: '5C',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Clean empty initial state (no mock data, 100% sourced from Google Sheets)
const initialStudents: Student[] = [];
const initialTransactions: Transaction[] = [];

class DatabaseManager {
  private memoryData: DatabaseSchema;
  private isWriting = false;
  private lockQueue: Array<() => void> = [];
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.memoryData = this.loadData();
    // Automatically perform initial sync with Google Sheets on startup
    this.initRealtimeSync();
  }

  private initRealtimeSync(): void {
    if (this.memoryData.settings.gas_script_url) {
      setTimeout(() => {
        this.syncFromGas().catch((err) => {
          console.warn('Initial background sync from Google Sheets notice:', err.message);
        });
      }, 1000);

      // Periodic background polling (every 45s) to guarantee real-time sync with Google Sheets
      if (!this.syncTimer) {
        this.syncTimer = setInterval(() => {
          if (this.memoryData.settings.gas_script_url && !this.isWriting) {
            this.syncFromGas().catch(() => {});
          }
        }, 45000);
      }
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error loading data file, initializing defaults:', err);
    }
    const defaultData: DatabaseSchema = {
      users: defaultUsers,
      students: initialStudents,
      transactions: initialTransactions,
      settings: defaultSettings,
      sessions: []
    };
    this.saveDataDirect(defaultData);
    return defaultData;
  }

  private saveDataDirect(data: DatabaseSchema): void {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save data file:', err);
    }
  }

  // Mutex Lock for concurrency safety on financial operations
  public async acquireLock(): Promise<() => void> {
    return new Promise((resolve) => {
      const run = () => {
        this.isWriting = true;
        resolve(() => {
          this.isWriting = false;
          this.persist();
          const next = this.lockQueue.shift();
          if (next) {
            next();
          }
        });
      };

      if (!this.isWriting) {
        run();
      } else {
        this.lockQueue.push(run);
      }
    });
  }

  public persist(): void {
    this.saveDataDirect(this.memoryData);
  }

  // Reset to demo data
  public resetToDefault(): void {
    this.memoryData = {
      users: defaultUsers,
      students: initialStudents,
      transactions: initialTransactions,
      settings: defaultSettings,
      sessions: []
    };
    this.persist();
  }

  // ==========================
  // SOURCE OF TRUTH: CALCULATE BALANCE
  // ==========================
  public calculateStudentBalance(studentId: string): {
    balance: number;
    totalDeposit: number;
    totalWithdrawal: number;
    transactionCount: number;
  } {
    const studentTrx = this.memoryData.transactions.filter(
      (t) => t.student_id === studentId && t.status === 'ACTIVE'
    );

    let totalDeposit = 0;
    let totalWithdrawal = 0;

    for (const trx of studentTrx) {
      if (trx.transaction_type === 'SETORAN') {
        totalDeposit += trx.amount;
      } else if (trx.transaction_type === 'PENARIKAN') {
        totalWithdrawal += trx.amount;
      } else if (trx.transaction_type === 'KOREKSI') {
        if (trx.amount >= 0) {
          totalDeposit += trx.amount;
        } else {
          totalWithdrawal += Math.abs(trx.amount);
        }
      }
    }

    const balance = totalDeposit - totalWithdrawal;
    return {
      balance,
      totalDeposit,
      totalWithdrawal,
      transactionCount: studentTrx.length
    };
  }

  // ==========================
  // AUTH & SESSIONS
  // ==========================
  private createSession(user: User): { session: SessionData; user: User } {
    const sessionId = `SES-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const session: SessionData = {
      session_id: sessionId,
      user_id: user.user_id,
      token_hash: sessionId,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      status: 'ACTIVE'
    };

    this.memoryData.sessions.push(session);
    this.persist();

    return { session, user };
  }

  public async loginUser(username: string, passwordPlain: string): Promise<{ session: SessionData; user: User } | null> {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = passwordPlain.trim();
    const gasUrl = this.memoryData.settings.gas_script_url;

    // 1. If Google Apps Script is configured, trigger a real-time sync first
    // so credentials & student/transaction records are guaranteed to be from Google Sheets
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        await this.syncFromGas().catch(() => {});
      } catch (err) {
        console.warn('Real-time sync on login notice:', err);
      }
    }

    // 2. Try local memory match (which has been synced from Google Sheets)
    const localUser = this.memoryData.users.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.status === 'ACTIVE'
    );

    if (localUser && localUser.password_hash === cleanPassword) {
      return this.createSession(localUser);
    }

    // 3. Direct Google Apps Script login action fallback
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const gasLoginRes = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            username: username.trim(),
            password: cleanPassword
          }),
          redirect: 'follow'
        });

        if (gasLoginRes.ok) {
          const json = (await gasLoginRes.json()) as any;
          if (json && json.success && json.data && json.data.user) {
            const gasUser = json.data.user;
            const syncedUser: User = {
              user_id: gasUser.user_id || `USR-${Date.now()}`,
              username: gasUser.username || username.trim(),
              name: gasUser.name || 'Jefri Eka Anggara Putra, S.Pd',
              password_hash: cleanPassword,
              class_id: gasUser.class_id || '5C',
              status: 'ACTIVE',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            const existingIdx = this.memoryData.users.findIndex(
              (u) => u.username.toLowerCase() === cleanUsername
            );
            if (existingIdx >= 0) {
              this.memoryData.users[existingIdx] = syncedUser;
            } else {
              this.memoryData.users.push(syncedUser);
            }
            this.persist();

            // Run full sync to populate students and transactions immediately
            await this.syncFromGas().catch(() => {});

            return this.createSession(syncedUser);
          }
        }
      } catch (err) {
        console.error('GAS direct login error:', err);
      }
    }

    return null;
  }

  public validateSession(sessionId: string): User | null {
    const session = this.memoryData.sessions.find(
      (s) => s.session_id === sessionId && s.status === 'ACTIVE'
    );
    if (!session) return null;

    if (new Date(session.expires_at) < new Date()) {
      session.status = 'EXPIRED';
      this.persist();
      return null;
    }

    const user = this.memoryData.users.find((u) => u.user_id === session.user_id && u.status === 'ACTIVE');
    return user || null;
  }

  public logoutSession(sessionId: string): void {
    const session = this.memoryData.sessions.find((s) => s.session_id === sessionId);
    if (session) {
      session.status = 'EXPIRED';
      this.persist();
    }
  }

  // ==========================
  // GAS PUSH HELPER
  // ==========================
  public async pushToGas(action: string, data: any): Promise<any> {
    const gasUrl = this.memoryData.settings.gas_script_url;
    if (!gasUrl || !gasUrl.startsWith('http')) return null;

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data }),
        redirect: 'follow'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn(`[pushToGas] Failed to push action '${action}' to Google Apps Script:`, err);
    }
    return null;
  }

  // ==========================
  // STUDENTS CRUD
  // ==========================
  public getStudents(filterStatus?: 'ALL' | 'ACTIVE' | 'INACTIVE', search?: string): Student[] {
    let result = this.memoryData.students;

    if (filterStatus && filterStatus !== 'ALL') {
      result = result.filter((s) => s.status === filterStatus);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.nama.toLowerCase().includes(q) ||
          s.nisn.toLowerCase().includes(q) ||
          (s.no_hp_wali && s.no_hp_wali.toLowerCase().includes(q))
      );
    }

    // Attach calculated financial fields
    return result.map((student) => {
      const metrics = this.calculateStudentBalance(student.student_id);
      return {
        ...student,
        balance: metrics.balance,
        totalDeposit: metrics.totalDeposit,
        totalWithdrawal: metrics.totalWithdrawal,
        transactionCount: metrics.transactionCount
      };
    });
  }

  public getStudentById(studentId: string): Student | null {
    const student = this.memoryData.students.find((s) => s.student_id === studentId || s.nisn === studentId);
    if (!student) return null;

    const metrics = this.calculateStudentBalance(student.student_id);
    return {
      ...student,
      balance: metrics.balance,
      totalDeposit: metrics.totalDeposit,
      totalWithdrawal: metrics.totalWithdrawal,
      transactionCount: metrics.transactionCount
    };
  }

  public createStudent(data: Omit<Student, 'student_id' | 'created_at' | 'updated_at'>): Student {
    const nisnId = String(data.nisn || `NISN-${Date.now().toString().slice(-6)}`).trim();
    const now = new Date().toISOString();

    const newStudent: Student = {
      ...data,
      student_id: nisnId,
      nisn: nisnId,
      status: data.status || 'ACTIVE',
      created_at: now,
      updated_at: now
    };

    this.memoryData.students.push(newStudent);
    this.persist();

    // Push to Google Sheets
    if (this.memoryData.settings.gas_script_url) {
      this.pushToGas('createStudent', newStudent).catch((e) => console.warn('Push createStudent to GAS error:', e));
    }

    return this.getStudentById(nisnId)!;
  }

  public updateStudent(studentId: string, updates: Partial<Student>): Student | null {
    const idx = this.memoryData.students.findIndex((s) => s.student_id === studentId || s.nisn === studentId);
    if (idx === -1) return null;

    const current = this.memoryData.students[idx];
    const updated: Student = {
      ...current,
      ...updates,
      student_id: current.student_id, // Immutable
      updated_at: new Date().toISOString()
    };

    this.memoryData.students[idx] = updated;
    this.persist();

    // Push to Google Sheets
    if (this.memoryData.settings.gas_script_url) {
      this.pushToGas('updateStudent', updated).catch((e) => console.warn('Push updateStudent to GAS error:', e));
    }

    return this.getStudentById(current.student_id);
  }

  public deleteOrDeactivateStudent(studentId: string): { mode: 'DELETED' | 'DEACTIVATED'; student: Student | null } {
    const idx = this.memoryData.students.findIndex((s) => s.student_id === studentId || s.nisn === studentId);
    if (idx === -1) return { mode: 'DEACTIVATED', student: null };

    const targetStudentId = this.memoryData.students[idx].student_id;

    // Check if student has transactions
    const hasTransactions = this.memoryData.transactions.some((t) => t.student_id === targetStudentId || t.student_id === studentId);

    // Push to Google Sheets
    if (this.memoryData.settings.gas_script_url) {
      this.pushToGas('deleteStudent', { student_id: targetStudentId }).catch((e) => console.warn('Push deleteStudent to GAS error:', e));
    }

    if (hasTransactions) {
      // Soft delete / Deactivate to protect financial integrity
      this.memoryData.students[idx].status = 'INACTIVE';
      this.memoryData.students[idx].updated_at = new Date().toISOString();
      this.persist();
      return { mode: 'DEACTIVATED', student: this.getStudentById(targetStudentId) };
    } else {
      // Hard delete allowed only if completely untouched
      const removed = this.memoryData.students.splice(idx, 1)[0];
      this.persist();
      return { mode: 'DELETED', student: removed };
    }
  }

  // ==========================
  // TRANSACTIONS
  // ==========================
  public getTransactions(filters?: {
    student_id?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    limit?: number;
  }): Transaction[] {
    let result = [...this.memoryData.transactions];

    if (filters?.student_id) {
      result = result.filter((t) => t.student_id === filters.student_id);
    }
    if (filters?.type && filters.type !== 'ALL') {
      result = result.filter((t) => t.transaction_type === filters.type);
    }
    if (filters?.status && filters.status !== 'ALL') {
      result = result.filter((t) => t.status === filters.status);
    }
    if (filters?.startDate) {
      result = result.filter((t) => t.transaction_date >= filters.startDate!);
    }
    if (filters?.endDate) {
      result = result.filter((t) => t.transaction_date <= filters.endDate!);
    }

    // Sort newest first
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (filters?.limit && filters.limit > 0) {
      result = result.slice(0, filters.limit);
    }

    // Populate student virtual fields
    return result.map((trx) => {
      const student = this.memoryData.students.find((s) => s.student_id === trx.student_id || s.nisn === trx.student_id);
      return {
        ...trx,
        student_nama: student?.nama || 'Siswa Dihapus',
        student_nisn: student?.nisn || '-',
        student_kelas: student?.kelas || '-'
      };
    });
  }

  public async createDeposit(params: {
    student_id: string;
    amount: number;
    description?: string;
    created_by?: string;
    transaction_date?: string;
  }): Promise<{ transaction: Transaction; newBalance: number }> {
    const release = await this.acquireLock();
    try {
      const student = this.memoryData.students.find((s) => s.student_id === params.student_id || s.nisn === params.student_id);
      if (!student) {
        throw new Error('STUDENT_NOT_FOUND');
      }

      if (!params.amount || params.amount <= 0) {
        throw new Error('INVALID_AMOUNT');
      }

      const today = params.transaction_date || new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();
      const dateCompact = today.replace(/-/g, '');
      const countToday = this.memoryData.transactions.filter((t) => t.transaction_date === today).length + 1;
      const trxId = `TRX-${dateCompact}-${String(countToday).padStart(3, '0')}`;

      const newTrx: Transaction = {
        transaction_id: trxId,
        student_id: student.student_id,
        nisn: student.nisn,
        nama: student.nama,
        transaction_type: 'SETORAN',
        amount: Math.round(params.amount),
        transaction_date: today,
        description: params.description?.trim() || 'Setoran Tabungan',
        created_by: params.created_by || this.memoryData.settings.teacher_name,
        created_at: now,
        updated_at: now,
        status: 'ACTIVE'
      };

      this.memoryData.transactions.push(newTrx);
      this.persist();

      // Push to Google Sheets
      if (this.memoryData.settings.gas_script_url) {
        this.pushToGas('createDeposit', {
          transaction_id: newTrx.transaction_id,
          student_id: student.student_id,
          nisn: student.nisn,
          nama: student.nama,
          amount: newTrx.amount,
          description: newTrx.description,
          created_by: newTrx.created_by,
          transaction_date: newTrx.transaction_date
        }).catch((e) => console.warn('Push createDeposit to GAS error:', e));
      }

      const metrics = this.calculateStudentBalance(student.student_id);

      return {
        transaction: {
          ...newTrx,
          student_nama: student.nama,
          student_nisn: student.nisn,
          student_kelas: student.kelas
        },
        newBalance: metrics.balance
      };
    } finally {
      release();
    }
  }

  public async createWithdrawal(params: {
    student_id: string;
    amount: number;
    description?: string;
    created_by?: string;
    transaction_date?: string;
  }): Promise<{ transaction: Transaction; newBalance: number }> {
    const release = await this.acquireLock();
    try {
      const student = this.memoryData.students.find((s) => s.student_id === params.student_id || s.nisn === params.student_id);
      if (!student) {
        throw new Error('STUDENT_NOT_FOUND');
      }

      if (!params.amount || params.amount <= 0) {
        throw new Error('INVALID_AMOUNT');
      }

      const currentMetrics = this.calculateStudentBalance(student.student_id);
      if (params.amount > currentMetrics.balance) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const today = params.transaction_date || new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();
      const dateCompact = today.replace(/-/g, '');
      const countToday = this.memoryData.transactions.filter((t) => t.transaction_date === today).length + 1;
      const trxId = `TRX-${dateCompact}-${String(countToday).padStart(3, '0')}`;

      const newTrx: Transaction = {
        transaction_id: trxId,
        student_id: student.student_id,
        nisn: student.nisn,
        nama: student.nama,
        transaction_type: 'PENARIKAN',
        amount: Math.round(params.amount),
        transaction_date: today,
        description: params.description?.trim() || 'Penarikan Tabungan',
        created_by: params.created_by || this.memoryData.settings.teacher_name,
        created_at: now,
        updated_at: now,
        status: 'ACTIVE'
      };

      this.memoryData.transactions.push(newTrx);
      this.persist();

      // Push to Google Sheets
      if (this.memoryData.settings.gas_script_url) {
        this.pushToGas('createWithdrawal', {
          transaction_id: newTrx.transaction_id,
          student_id: student.student_id,
          nisn: student.nisn,
          nama: student.nama,
          amount: newTrx.amount,
          description: newTrx.description,
          created_by: newTrx.created_by,
          transaction_date: newTrx.transaction_date
        }).catch((e) => console.warn('Push createWithdrawal to GAS error:', e));
      }

      const metrics = this.calculateStudentBalance(student.student_id);

      return {
        transaction: {
          ...newTrx,
          student_nama: student.nama,
          student_nisn: student.nisn,
          student_kelas: student.kelas
        },
        newBalance: metrics.balance
      };
    } finally {
      release();
    }
  }

  public async voidTransaction(transactionId: string, reason?: string): Promise<{ transaction: Transaction; newBalance: number }> {
    const release = await this.acquireLock();
    try {
      const trx = this.memoryData.transactions.find((t) => t.transaction_id === transactionId);
      if (!trx) {
        throw new Error('TRANSACTION_NOT_FOUND');
      }
      if (trx.status === 'VOID') {
        throw new Error('ALREADY_VOID');
      }

      trx.status = 'VOID';
      trx.description = reason ? `[DIBATALKAN/VOID]: ${reason} (Semula: ${trx.description})` : `[DIBATALKAN/VOID] ${trx.description}`;
      trx.updated_at = new Date().toISOString();
      this.persist();

      // Push to Google Sheets
      if (this.memoryData.settings.gas_script_url) {
        this.pushToGas('voidTransaction', {
          transaction_id: transactionId,
          reason
        }).catch((e) => console.warn('Push voidTransaction to GAS error:', e));
      }

      const metrics = this.calculateStudentBalance(trx.student_id);
      const student = this.memoryData.students.find((s) => s.student_id === trx.student_id || s.nisn === trx.student_id);

      return {
        transaction: {
          ...trx,
          student_nama: student?.nama || '',
          student_nisn: student?.nisn || '',
          student_kelas: student?.kelas || ''
        },
        newBalance: metrics.balance
      };
    } finally {
      release();
    }
  }

  // ==========================
  // DASHBOARD SUMMARY
  // ==========================
  public getDashboard(): DashboardSummary {
    const students = this.memoryData.students.filter((s) => s.status === 'ACTIVE');
    const today = new Date().toISOString().split('T')[0];

    let totalClassBalance = 0;
    let activeSavers = 0;
    let totalDepositAllTime = 0;
    let totalWithdrawalAllTime = 0;

    for (const student of students) {
      const m = this.calculateStudentBalance(student.student_id);
      totalClassBalance += m.balance;
      if (m.balance > 0) {
        activeSavers++;
      }
      totalDepositAllTime += m.totalDeposit;
      totalWithdrawalAllTime += m.totalWithdrawal;
    }

    const todayTrx = this.memoryData.transactions.filter(
      (t) => t.transaction_date === today && t.status === 'ACTIVE'
    );

    let todayDeposit = 0;
    let todayWithdrawal = 0;

    for (const t of todayTrx) {
      if (t.transaction_type === 'SETORAN') {
        todayDeposit += t.amount;
      } else if (t.transaction_type === 'PENARIKAN') {
        todayWithdrawal += t.amount;
      }
    }

    const recentTransactions = this.getTransactions({ limit: 10 });

    return {
      teacherName: this.memoryData.settings.teacher_name,
      className: this.memoryData.settings.class_name,
      academicYear: this.memoryData.settings.academic_year,
      totalStudents: students.length,
      activeSavers,
      totalClassBalance,
      todayDeposit,
      todayWithdrawal,
      totalDepositAllTime,
      totalWithdrawalAllTime,
      recentTransactions
    };
  }

  // ==========================
  // REPORTS
  // ==========================
  public getStudentReport(studentId: string, period?: { startDate?: string; endDate?: string }): StudentReport | null {
    const student = this.getStudentById(studentId);
    if (!student) return null;

    let transactions = this.memoryData.transactions.filter((t) => t.student_id === studentId || t.student_id === student.student_id);

    if (period?.startDate) {
      transactions = transactions.filter((t) => t.transaction_date >= period.startDate!);
    }
    if (period?.endDate) {
      transactions = transactions.filter((t) => t.transaction_date <= period.endDate!);
    }

    // Sort newest first
    transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const activeTrx = transactions.filter((t) => t.status === 'ACTIVE');
    let totalDeposit = 0;
    let totalWithdrawal = 0;

    for (const t of activeTrx) {
      if (t.transaction_type === 'SETORAN') totalDeposit += t.amount;
      if (t.transaction_type === 'PENARIKAN') totalWithdrawal += t.amount;
      if (t.transaction_type === 'KOREKSI') {
        if (t.amount >= 0) totalDeposit += t.amount;
        else totalWithdrawal += Math.abs(t.amount);
      }
    }

    const balance = totalDeposit - totalWithdrawal;

    const populatedTrx = transactions.map((t) => ({
      ...t,
      student_nama: student.nama,
      student_nisn: student.nisn,
      student_kelas: student.kelas
    }));

    return {
      student,
      summary: {
        balance,
        totalDeposit,
        totalWithdrawal,
        transactionCount: activeTrx.length
      },
      transactions: populatedTrx
    };
  }

  public getClassReport(): ClassReport {
    const students = this.memoryData.students;
    let totalBalance = 0;
    let totalDeposit = 0;
    let totalWithdrawal = 0;
    let totalTransactions = 0;

    const studentList = students.map((s) => {
      const m = this.calculateStudentBalance(s.student_id);
      totalBalance += m.balance;
      totalDeposit += m.totalDeposit;
      totalWithdrawal += m.totalWithdrawal;
      totalTransactions += m.transactionCount;

      return {
        studentId: s.student_id,
        nisn: s.nisn,
        name: s.nama,
        gender: s.jenis_kelamin,
        totalDeposit: m.totalDeposit,
        totalWithdrawal: m.totalWithdrawal,
        balance: m.balance,
        transactionCount: m.transactionCount,
        status: s.status
      };
    });

    // Sort by name
    studentList.sort((a, b) => a.name.localeCompare(b.name));

    return {
      totalStudents: students.length,
      totalBalance,
      totalDeposit,
      totalWithdrawal,
      transactionCount: totalTransactions,
      students: studentList
    };
  }

  // ==========================
  // SETTINGS & GAS SYNC
  // ==========================
  public getSettings(): AppSettings {
    return this.memoryData.settings;
  }

  public updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.memoryData.settings = {
      ...this.memoryData.settings,
      ...updates
    };
    this.persist();

    // Push to Google Sheets SETTINGS table
    if (this.memoryData.settings.gas_script_url) {
      this.pushToGas('updateSettings', {
        school_name: this.memoryData.settings.school_name,
        class_name: this.memoryData.settings.class_name,
        teacher_name: this.memoryData.settings.teacher_name,
        academic_year: this.memoryData.settings.academic_year,
        minimum_deposit: this.memoryData.settings.minimum_deposit
      }).catch((e) => console.warn('Push updateSettings to GAS error:', e));
    }

    return this.memoryData.settings;
  }

  public async syncFromGas(): Promise<{ success: boolean; message: string; data?: any }> {
    const gasUrl = this.memoryData.settings.gas_script_url;
    if (!gasUrl || !gasUrl.startsWith('http')) {
      return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
    }

    try {
      const res = await fetch(`${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=syncAll`, {
        redirect: 'follow'
      });

      if (!res.ok) {
        throw new Error(`Google Apps Script merespons dengan status ${res.status}`);
      }

      const json = (await res.json()) as any;
      if (!json.success || !json.data) {
        throw new Error(json.error?.message || 'Format data dari Google Apps Script tidak valid.');
      }

      const { users, students, transactions, settings } = json.data;

      // Sync Users (Replace if provided)
      if (Array.isArray(users) && users.length > 0) {
        this.memoryData.users = users.map((u: any, idx: number) => ({
          user_id: String(u.user_id || `USR-00${idx + 1}`),
          username: String(u.username || '').trim(),
          name: String(u.name || 'Jefri Eka Anggara Putra, S.Pd'),
          password_hash: String(u.password_hash || ''),
          class_id: String(u.class_id || '5C'),
          status: (String(u.status || 'ACTIVE').toUpperCase() as any),
          created_at: u.created_at || new Date().toISOString(),
          updated_at: u.updated_at || new Date().toISOString()
        }));
      }

      // Sync Students (Completely replace with actual Google Sheets records: NISN, Nama, Jenis Kelamin, Kelas, No HP Wali)
      if (Array.isArray(students)) {
        this.memoryData.students = students.map((st: any) => {
          const nisnVal = String(st.nisn || st.student_id || '').trim();
          return {
            student_id: nisnVal,
            nisn: nisnVal,
            nama: String(st.nama || '').trim(),
            jenis_kelamin: (String(st.jenis_kelamin || 'L').toUpperCase() === 'P' ? 'P' : 'L') as any,
            kelas: String(st.kelas || '5C').trim(),
            no_hp_wali: String(st.no_hp_wali || '').trim(),
            status: (String(st.status || 'ACTIVE').toUpperCase() as any),
            created_at: st.created_at || new Date().toISOString(),
            updated_at: st.updated_at || new Date().toISOString()
          };
        });
      }

      // Sync Transactions (Completely replace with actual Google Sheets records)
      if (Array.isArray(transactions)) {
        this.memoryData.transactions = transactions.map((t: any) => {
          const nisnVal = String(t.nisn || t.student_id || '').trim();
          const namaVal = String(t.nama || t.student_nama || '').trim();
          return {
            transaction_id: String(t.transaction_id),
            student_id: nisnVal,
            nisn: nisnVal,
            nama: namaVal,
            transaction_type: (String(t.transaction_type || 'SETORAN').toUpperCase() as any),
            amount: Number(t.amount) || 0,
            transaction_date: String(t.transaction_date || ''),
            description: String(t.description || ''),
            created_by: String(t.created_by || 'Wali Kelas'),
            created_at: t.created_at || new Date().toISOString(),
            updated_at: t.updated_at || new Date().toISOString(),
            status: (String(t.status || 'ACTIVE').toUpperCase() as any),
            void_reason: t.void_reason ? String(t.void_reason) : undefined
          };
        });
      }

      // Sync Settings
      if (settings && typeof settings === 'object') {
        if (settings.school_name) this.memoryData.settings.school_name = String(settings.school_name);
        if (settings.class_name) this.memoryData.settings.class_name = String(settings.class_name);
        if (settings.teacher_name) this.memoryData.settings.teacher_name = String(settings.teacher_name);
        if (settings.academic_year) this.memoryData.settings.academic_year = String(settings.academic_year);
        if (settings.minimum_deposit !== undefined) this.memoryData.settings.minimum_deposit = Number(settings.minimum_deposit) || 1000;
      }

      this.persist();
      return {
        success: true,
        message: `Sinkronisasi berhasil! Terhubung dengan Google Sheets: ${this.memoryData.students.length} siswa, ${this.memoryData.transactions.length} transaksi dimuat.`
      };
    } catch (err: any) {
      console.error('syncFromGas error:', err);
      return { success: false, message: err.message || 'Gagal sinkronisasi dengan Google Apps Script.' };
    }
  }
}

export const db = new DatabaseManager();
