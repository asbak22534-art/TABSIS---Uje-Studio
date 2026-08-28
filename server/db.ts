import crypto from 'crypto';
import type {
  Student,
  Transaction,
  TransactionType,
  AppSettings,
  User,
  UserRole,
  DashboardSummary,
  StudentReport,
  ClassReport,
  ApiResponse,
  AccessProfile,
  ClassSection,
  BootstrapData,
  TransactionMutationResult
} from '../src/types';
import {
  CONFIG,
  validateFinancialAmount,
  validateNisn,
  validateTransactionDate,
  sanitizeText,
  getJakartaToday,
  hashPassword,
  verifyPassword,
  createSignedSessionToken
} from './security';

interface AuthRecord {
  user_id: string;
  username: string;
  name: string;
  password_hash: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
  updated_at?: string;
}

interface ScopeBundle {
  settings: Record<string, any>;
  students: Student[];
  transactions: Transaction[];
  section: ClassSection;
}

interface CacheEntry<T> { value: T; expiresAt: number; }

export interface ResolvedScope {
  section: ClassSection | null;
  academicYear: string;
  classId: string;
}

function normalizeRole(_value?: unknown): UserRole {
  return 'GURU';
}

function normalizeRemoteDate(value: unknown): string {
  if (!value) return getJakartaToday();
  const clean = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const indo = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (indo) return `${indo[3]}-${indo[2]}-${indo[1]}`;
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
  }
  return getJakartaToday();
}

export class DatabaseService {
  private accessCache = new Map<string, CacheEntry<AccessProfile>>();
  private scopeCache = new Map<string, CacheEntry<ScopeBundle>>();
  private pendingAccessPromises = new Map<string, Promise<AccessProfile>>();
  private pendingScopePromises = new Map<string, Promise<ScopeBundle>>();

  private getCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
    const hit = map.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) { map.delete(key); return null; }
    return hit.value;
  }

  private setCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): T {
    map.set(key, { value, expiresAt: Date.now() + CONFIG.CACHE_TTL_MS });
    return value;
  }

  private clearUserCache(userId?: string): void {
    if (!userId) {
      this.accessCache.clear();
      this.scopeCache.clear();
      this.pendingAccessPromises.clear();
      this.pendingScopePromises.clear();
      return;
    }
    this.accessCache.delete(userId);
    this.pendingAccessPromises.delete(userId);
    for (const key of Array.from(this.scopeCache.keys())) {
      if (key.startsWith(`${userId}|`)) {
        this.scopeCache.delete(key);
        this.pendingScopePromises.delete(key);
      }
    }
  }

  public async callGasApi<T = any>(
    action: string,
    data: any = {},
    context?: { user_id?: string; role?: UserRole; active_class_section_id?: string }
  ): Promise<T> {
    const gasUrl = CONFIG.GAS_SCRIPT_URL;
    if (!gasUrl || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(gasUrl)) {
      const err = new Error('GAS_SCRIPT_URL belum dikonfigurasi atau tidak berakhiran /exec di environment variables.');
      (err as any).code = 'SERVER_MISCONFIGURED';
      (err as any).status = 503;
      throw err;
    }
    if (!CONFIG.GAS_API_SECRET || CONFIG.GAS_API_SECRET.length < 32 || CONFIG.GAS_API_SECRET.includes('CHANGE_ME')) {
      const err = new Error('GAS_API_SECRET belum dikonfigurasi (minimal 32 karakter) di environment variables.');
      (err as any).code = 'SERVER_MISCONFIGURED';
      (err as any).status = 503;
      throw err;
    }

    const payload = {
      action,
      secret: CONFIG.GAS_API_SECRET,
      context: {
        user_id: context?.user_id || '',
        role: context?.role || '',
        active_class_section_id: context?.active_class_section_id || '',
        max_transaction_amount: CONFIG.MAX_TRANSACTION_AMOUNT
      },
      data
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28_000);
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'follow'
      });
      if (!response.ok) {
        const err = new Error(`Layanan Google Apps Script merespons status ${response.status}: ${response.statusText}`);
        (err as any).code = 'GAS_HTTP_ERROR';
        (err as any).status = 502;
        throw err;
      }
      const text = await response.text();
      let json: ApiResponse<T>;
      try {
        json = JSON.parse(text);
      } catch {
        const err = new Error('Respons Google Apps Script bukan format JSON valid.');
        (err as any).code = 'GAS_INVALID_RESPONSE';
        (err as any).status = 502;
        throw err;
      }
      if (!json.success) {
        const err = new Error(json.error?.message || 'Permintaan Google Apps Script gagal diproses.');
        (err as any).code = json.error?.code || 'GAS_ERROR';
        (err as any).status = 502;
        throw err;
      }
      return json.data as T;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error('Koneksi Google Apps Script timeout (>28 detik).');
        (timeoutErr as any).code = 'GAS_TIMEOUT';
        (timeoutErr as any).status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async getAuthRecordByUsername(usernameInput: string): Promise<AuthRecord> {
    const username = sanitizeText(usernameInput, 100);
    if (!username) throw new Error('Username wajib diisi.');
    return this.callGasApi<AuthRecord>('getAuthUser', { username });
  }

  public async getAccessProfile(userId: string, role: UserRole, force = false): Promise<AccessProfile> {
    if (!force) {
      const cached = this.getCache(this.accessCache, userId);
      if (cached) return cached;
      const inFlight = this.pendingAccessPromises.get(userId);
      if (inFlight) return inFlight;
    }

    const fetchPromise = (async () => {
      try {
        const profile = await this.callGasApi<AccessProfile>('getAccessProfile', {}, { user_id: userId, role });
        const normalized: AccessProfile = {
          user_id: String(profile.user_id || userId),
          username: sanitizeText(profile.username, 100),
          user_name: sanitizeText(profile.user_name, 100),
          role: normalizeRole(profile.role || role),
          academic_years: Array.isArray(profile.academic_years) ? Array.from(new Set(profile.academic_years.map(String).filter(Boolean))) : [],
          classes_by_year: profile.classes_by_year && typeof profile.classes_by_year === 'object' ? profile.classes_by_year : {},
          class_sections: Array.isArray(profile.class_sections) ? profile.class_sections.map((s: any): ClassSection => ({
            class_section_id: String(s.class_section_id || ''),
            academic_year_id: String(s.academic_year_id || ''),
            academic_year: String(s.academic_year || ''),
            class_name: String(s.class_name || ''),
            status: String(s.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            academic_year_is_active: Boolean(s.academic_year_is_active),
            created_at: s.created_at || '',
            updated_at: s.updated_at || ''
          })).filter((s: ClassSection) => !!s.class_section_id && !!s.academic_year && !!s.class_name) : [],
          assignments: Array.isArray(profile.assignments) ? profile.assignments : []
        };
        return this.setCache(this.accessCache, userId, normalized);
      } finally {
        this.pendingAccessPromises.delete(userId);
      }
    })();

    this.pendingAccessPromises.set(userId, fetchPromise);
    return fetchPromise;
  }

  public resolveScope(profile: AccessProfile, requestedYear?: string, requestedClass?: string): ResolvedScope {
    const sections = profile.class_sections.filter((s) => s.status === 'ACTIVE');
    if (!sections.length) return { section: null, academicYear: '', classId: '' };
    const year = String(requestedYear || '').trim();
    const cls = String(requestedClass || '').trim();
    let section = sections.find((s) => (!year || s.academic_year === year) && (!cls || s.class_name === cls));
    if (!section && year) section = sections.find((s) => s.academic_year === year);
    if (!section) section = sections[0];
    return { section, academicYear: section.academic_year, classId: section.class_name };
  }

  private buildUser(record: AuthRecord, profile: AccessProfile, scope?: ResolvedScope): User {
    const selected = scope || this.resolveScope(profile);
    const years = profile.academic_years.length ? profile.academic_years : Array.from(new Set(profile.class_sections.map((s) => s.academic_year)));
    const classes = selected.academicYear ? profile.class_sections.filter((s) => s.academic_year === selected.academicYear && s.status === 'ACTIVE').map((s) => s.class_name) : [];
    return {
      user_id: record.user_id,
      username: record.username,
      name: record.name,
      role: record.role,
      academic_years: years,
      class_sections: profile.class_sections,
      active_academic_year: selected.academicYear,
      class_ids: Array.from(new Set(classes)),
      active_class_id: selected.classId,
      active_class_section_id: selected.section?.class_section_id || '',
      class_id: selected.classId,
      status: record.status,
      created_at: record.created_at || '',
      updated_at: record.updated_at || ''
    };
  }

  public async loginUser(usernameInput: string, passwordInput: string): Promise<{ user: User; signedToken: string; expiresAt: number }> {
    const username = sanitizeText(usernameInput, 100);
    const password = String(passwordInput || '');
    if (!username || !password) throw new Error('Username dan password wajib diisi.');
    const record = await this.getAuthRecordByUsername(username);
    if (!record || record.status !== 'ACTIVE' || !verifyPassword(password, record.password_hash)) throw new Error('Username atau password salah.');
    const role = normalizeRole(record.role);
    const profile = await this.getAccessProfile(record.user_id, role, true);
    const user = this.buildUser({ ...record, role }, profile);
    const signedToken = createSignedSessionToken(record.user_id, record.username, role);
    return { user, signedToken, expiresAt: Date.now() + CONFIG.SESSION_TTL_SECONDS * 1000 };
  }

  public async getSessionUser(
    decoded: { userId: string; username: string; role: UserRole },
    requestedYear?: string,
    requestedClass?: string
  ): Promise<User> {
    const profile = await this.getAccessProfile(decoded.userId, decoded.role);
    if (profile.role !== decoded.role) throw new Error('SESSION_ROLE_CHANGED: Role akun berubah. Silakan login kembali.');
    const record: AuthRecord = {
      user_id: decoded.userId,
      username: profile.username || decoded.username,
      name: profile.user_name || decoded.username,
      password_hash: '',
      role: profile.role,
      status: 'ACTIVE'
    };
    return this.buildUser(record, profile, this.resolveScope(profile, requestedYear, requestedClass));
  }

  private async getScopeBundle(user: User, force = false): Promise<ScopeBundle> {
    if (!user.active_class_section_id) throw new Error('NO_CLASS_ASSIGNMENT: Akun belum memiliki kelas yang dapat diakses.');
    const key = `${user.user_id}|${user.active_class_section_id}`;
    if (!force) {
      const cached = this.getCache(this.scopeCache, key);
      if (cached) return cached;
      const inFlight = this.pendingScopePromises.get(key);
      if (inFlight) return inFlight;
    }

    const fetchPromise = (async () => {
      try {
        const remote = await this.callGasApi<any>('getScopeData', {}, {
          user_id: user.user_id,
          role: user.role,
          active_class_section_id: user.active_class_section_id
        });
        const section: ClassSection = {
          class_section_id: String(remote?.section?.class_section_id || user.active_class_section_id),
          academic_year_id: String(remote?.section?.academic_year_id || ''),
          academic_year: String(remote?.section?.academic_year || user.active_academic_year),
          class_name: String(remote?.section?.class_name || user.active_class_id),
          status: 'ACTIVE'
        };
        const students: Student[] = Array.isArray(remote?.students) ? remote.students.map((s: any) => ({
          student_id: String(s.nisn || s.student_id || '').replace(/^'/, '').trim(),
          enrollment_id: String(s.enrollment_id || ''),
          class_section_id: section.class_section_id,
          nisn: String(s.nisn || '').replace(/^'/, '').trim(),
          nama: sanitizeText(s.nama, 100),
          jenis_kelamin: s.jenis_kelamin === 'P' ? 'P' : 'L',
          academic_year: section.academic_year,
          kelas: section.class_name,
          no_hp_wali: sanitizeText(s.no_hp_wali, 30),
          status: String(s.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          enrollment_status: String(s.enrollment_status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          created_at: s.created_at || '',
          updated_at: s.updated_at || '',
          balance: Number(s.balance) || 0,
          totalDeposit: Number(s.totalDeposit) || 0,
          totalWithdrawal: Number(s.totalWithdrawal) || 0,
          transactionCount: Number(s.transactionCount) || 0,
          ledgerError: Number(s.balance) < 0
        })) : [];
        const transactions: Transaction[] = Array.isArray(remote?.transactions) ? remote.transactions.map((t: any) => ({
          transaction_id: String(t.transaction_id || ''),
          enrollment_id: String(t.enrollment_id || ''),
          student_id: String(t.nisn || '').replace(/^'/, '').trim(),
          nisn: String(t.nisn || '').replace(/^'/, '').trim(),
          nama: sanitizeText(t.nama, 100),
          class_section_id: String(t.class_section_id || section.class_section_id),
          academic_year: String(t.academic_year || section.academic_year),
          kelas: String(t.class_name || t.kelas || section.class_name),
          transaction_type: String(t.transaction_type || '').toUpperCase() === 'PENARIKAN' ? 'PENARIKAN' : 'SETORAN',
          amount: Number(t.amount) || 0,
          transaction_date: normalizeRemoteDate(t.transaction_date),
          description: sanitizeText(t.description, 200),
          created_by_user_id: String(t.created_by_user_id || ''),
          created_by: sanitizeText(t.created_by_name || t.created_by, 100),
          created_at: t.created_at || '',
          updated_at: t.updated_at || '',
          status: String(t.status || 'ACTIVE').toUpperCase() === 'VOID' ? 'VOID' : 'ACTIVE',
          void_reason: sanitizeText(t.void_reason, 250),
          voided_by_user_id: String(t.voided_by_user_id || ''),
          voided_by: sanitizeText(t.voided_by_name || '', 100),
          voided_at: t.voided_at || ''
        })) : [];
        const bundle: ScopeBundle = { settings: remote?.settings || {}, students, transactions, section };
        return this.setCache(this.scopeCache, key, bundle);
      } finally {
        this.pendingScopePromises.delete(key);
      }
    })();

    this.pendingScopePromises.set(key, fetchPromise);
    return fetchPromise;
  }

  public async getStudents(user: User): Promise<Student[]> {
    return (await this.getScopeBundle(user)).students.map((s) => ({ ...s }));
  }

  public async getStudentById(id: string, user: User): Promise<Student | null> {
    const clean = String(id || '').replace(/^'/, '').trim();
    return (await this.getScopeBundle(user)).students.find((s) => s.student_id === clean || s.nisn === clean) || null;
  }

  public async createStudent(studentData: Partial<Student>, user: User): Promise<Student> {
    const n = validateNisn(studentData.nisn); if (!n.valid) throw new Error(n.error);
    if (!user.active_class_section_id) throw new Error('NO_CLASS_ASSIGNMENT: Pilih kelas terlebih dahulu.');
    const payload = {
      nisn: n.cleanNisn,
      nama: sanitizeText(studentData.nama, 100),
      jenis_kelamin: studentData.jenis_kelamin === 'P' ? 'P' : 'L',
      no_hp_wali: sanitizeText(studentData.no_hp_wali, 30)
    };
    if (!payload.nama) throw new Error('Nama siswa wajib diisi.');
    const saved = await this.callGasApi<Student>('createStudentEnrollment', payload, { user_id: user.user_id, role: user.role, active_class_section_id: user.active_class_section_id });
    this.clearUserCache(user.user_id);
    return { ...saved, student_id: saved.nisn || n.cleanNisn };
  }

  public async updateStudent(id: string, updates: Partial<Student>, user: User): Promise<Student> {
    const current = await this.getStudentById(id, user);
    if (!current) throw new Error('STUDENT_NOT_FOUND: Siswa tidak ditemukan pada kelas aktif.');
    if (updates.nisn && String(updates.nisn).trim() !== current.nisn) throw new Error('NISN_IMMUTABLE: NISN tidak dapat diubah.');
    const payload = {
      nisn: current.nisn,
      nama: updates.nama !== undefined ? sanitizeText(updates.nama, 100) : current.nama,
      jenis_kelamin: updates.jenis_kelamin === 'P' ? 'P' : updates.jenis_kelamin === 'L' ? 'L' : current.jenis_kelamin,
      no_hp_wali: updates.no_hp_wali !== undefined ? sanitizeText(updates.no_hp_wali, 30) : current.no_hp_wali
    };
    const saved = await this.callGasApi<Student>('updateStudentMaster', payload, { user_id: user.user_id, role: user.role, active_class_section_id: user.active_class_section_id });
    this.clearUserCache(user.user_id);
    return { ...current, ...saved, student_id: current.nisn, nisn: current.nisn };
  }

  public async deleteStudent(id: string, user: User): Promise<void> {
    const current = await this.getStudentById(id, user);
    if (!current) throw new Error('STUDENT_NOT_FOUND: Siswa tidak ditemukan pada kelas aktif.');
    await this.callGasApi('deactivateEnrollment', { enrollment_id: current.enrollment_id, nisn: current.nisn }, { user_id: user.user_id, role: user.role, active_class_section_id: user.active_class_section_id });
    this.clearUserCache(user.user_id);
  }

  public async getTransactions(user: User, filter?: string | { studentId?: string; limit?: number; cursor?: string }): Promise<Transaction[]> {
    const studentId = typeof filter === 'string' ? filter : filter?.studentId;
    const limit = typeof filter === 'object' && filter?.limit ? filter.limit : undefined;
    const cursor = typeof filter === 'object' && filter?.cursor ? filter.cursor : undefined;

    let rows = (await this.getScopeBundle(user)).transactions;
    if (studentId) {
      const clean = String(studentId).replace(/^'/, '').trim();
      const cleanNoZero = clean.replace(/^0+/, '');
      rows = rows.filter((t) => {
        const tSid = String(t.student_id || '').replace(/^'/, '').trim();
        const tNisn = String(t.nisn || '').replace(/^'/, '').trim();
        const tEnroll = String(t.enrollment_id || '').replace(/^'/, '').trim();
        return (
          tSid === clean ||
          tNisn === clean ||
          tEnroll === clean ||
          (cleanNoZero && tSid.replace(/^0+/, '') === cleanNoZero) ||
          (cleanNoZero && tNisn.replace(/^0+/, '') === cleanNoZero)
        );
      });
    }
    const sorted = rows.map((t) => ({ ...t })).sort((a, b) => `${b.transaction_date}|${b.created_at}`.localeCompare(`${a.transaction_date}|${a.created_at}`));
    if (cursor) {
      const idx = sorted.findIndex((t) => t.transaction_id === cursor || `${t.transaction_date}|${t.created_at}` < cursor);
      if (idx !== -1) {
        return sorted.slice(idx, limit ? idx + limit : undefined);
      }
    }
    if (limit && limit > 0) {
      return sorted.slice(0, limit);
    }
    return sorted;
  }

  private async createTransaction(type: TransactionType, params: { student_id: string; amount: number; transaction_date?: string; description?: string }, user: User): Promise<TransactionMutationResult> {
    const student = await this.getStudentById(params.student_id, user);
    if (!student || student.status !== 'ACTIVE' || student.enrollment_status === 'INACTIVE') throw new Error('STUDENT_NOT_ACTIVE: Siswa tidak aktif pada kelas ini.');
    const amountCheck = validateFinancialAmount(params.amount, 1000, CONFIG.MAX_TRANSACTION_AMOUNT); if (!amountCheck.valid) throw new Error(amountCheck.error);
    const dateCheck = validateTransactionDate(params.transaction_date); if (!dateCheck.valid) throw new Error(dateCheck.error);
    const data = {
      transaction_id: crypto.randomUUID(),
      enrollment_id: student.enrollment_id,
      nisn: student.nisn,
      transaction_type: type,
      amount: amountCheck.numAmount,
      transaction_date: dateCheck.cleanDate,
      description: sanitizeText(params.description || (type === 'SETORAN' ? 'Setoran Tabungan' : 'Penarikan Tabungan'), 200)
    };
    const result = await this.callGasApi<any>('processTransaction', data, { user_id: user.user_id, role: user.role, active_class_section_id: user.active_class_section_id });
    this.clearUserCache(user.user_id);

    const today = getJakartaToday();
    const isToday = dateCheck.cleanDate === today;
    const amount = amountCheck.numAmount;
    const totalBalanceDelta = type === 'SETORAN' ? amount : -amount;
    const todayDepositDelta = type === 'SETORAN' && isToday ? amount : 0;
    const todayWithdrawalDelta = type === 'PENARIKAN' && isToday ? amount : 0;

    const newBalance = typeof result?.newBalance === 'number' ? result.newBalance : (student.balance || 0) + totalBalanceDelta;

    return {
      transaction: result.transaction,
      currentBalance: newBalance,
      student: {
        nisn: student.nisn,
        balance: newBalance,
        totalDeposit: type === 'SETORAN' ? (student.totalDeposit || 0) + amount : student.totalDeposit,
        totalWithdrawal: type === 'PENARIKAN' ? (student.totalWithdrawal || 0) + amount : student.totalWithdrawal,
        transactionCount: (student.transactionCount || 0) + 1
      },
      dashboardDelta: {
        totalBalanceDelta,
        todayDepositDelta,
        todayWithdrawalDelta
      },
      warning: result.warning,
      idempotent: result.idempotent
    };
  }

  public createDeposit(params: { student_id: string; amount: number; transaction_date?: string; description?: string }, user: User) { return this.createTransaction('SETORAN', params, user); }
  public createWithdrawal(params: { student_id: string; amount: number; transaction_date?: string; description?: string }, user: User) { return this.createTransaction('PENARIKAN', params, user); }

  public async voidTransaction(transactionId: string, voidReason: string | undefined, user: User): Promise<TransactionMutationResult> {
    const result = await this.callGasApi<any>('voidTransaction', {
      transaction_id: String(transactionId || '').trim(),
      void_reason: sanitizeText(voidReason || 'Dibatalkan', 250)
    }, { user_id: user.user_id, role: user.role, active_class_section_id: user.active_class_section_id });
    this.clearUserCache(user.user_id);

    const trx = result.transaction as Transaction;
    const today = getJakartaToday();
    const isToday = trx?.transaction_date === today;
    const amount = Number(trx?.amount || 0);
    const wasDeposit = trx?.transaction_type === 'SETORAN';

    const totalBalanceDelta = wasDeposit ? -amount : amount;
    const todayDepositDelta = wasDeposit && isToday ? -amount : 0;
    const todayWithdrawalDelta = !wasDeposit && isToday ? -amount : 0;

    return {
      transaction: trx,
      currentBalance: Number(result?.newBalance ?? 0),
      student: trx?.nisn ? {
        nisn: trx.nisn,
        balance: Number(result?.newBalance ?? 0)
      } : undefined,
      dashboardDelta: {
        totalBalanceDelta,
        todayDepositDelta,
        todayWithdrawalDelta
      },
      warning: result.warning
    };
  }

  public async getBootstrapData(user: User): Promise<BootstrapData> {
    const profile = await this.getAccessProfile(user.user_id, user.role);
    const settings = await this.getSettings(user);
    let dashboard: DashboardSummary | null = null;
    let students: Student[] = [];
    let recentTransactions: Transaction[] = [];
    let activeSection: ClassSection | null = null;

    if (user.active_class_section_id) {
      try {
        const bundle = await this.getScopeBundle(user);
        activeSection = bundle.section;
        students = bundle.students.map((s) => ({ ...s }));
        recentTransactions = [...bundle.transactions]
          .sort((a, b) => `${b.transaction_date}|${b.created_at}`.localeCompare(`${a.transaction_date}|${a.created_at}`))
          .slice(0, 30);
        dashboard = await this.getDashboardSummary(user);
      } catch (err: any) {
        console.warn('Bootstrap scope bundle failed:', err.message);
      }
    }

    return {
      user,
      academicYears: profile.academic_years,
      assignments: profile.assignments,
      classSections: profile.class_sections,
      activeSection,
      dashboard,
      students,
      recentTransactions,
      settings
    };
  }

  public async getDashboardSummary(user: User): Promise<DashboardSummary> {
    const bundle = await this.getScopeBundle(user);
    const today = getJakartaToday();
    const activeTrx = bundle.transactions.filter((t) => t.status === 'ACTIVE');
    let todayDeposit = 0, todayWithdrawal = 0;
    for (const t of activeTrx) {
      if (t.transaction_date !== today) continue;
      if (t.transaction_type === 'SETORAN') todayDeposit += t.amount;
      if (t.transaction_type === 'PENARIKAN') todayWithdrawal += t.amount;
    }
    const totalClassBalance = bundle.students.reduce((a, s) => a + Number(s.balance || 0), 0);
    const totalDepositAllTime = bundle.students.reduce((a, s) => a + Number(s.totalDeposit || 0), 0);
    const totalWithdrawalAllTime = bundle.students.reduce((a, s) => a + Number(s.totalWithdrawal || 0), 0);
    return {
      teacherName: user.name,
      className: bundle.section.class_name,
      academicYear: bundle.section.academic_year,
      totalStudents: bundle.students.filter((s) => s.enrollment_status !== 'INACTIVE').length,
      activeSavers: bundle.students.filter((s) => Number(s.transactionCount || 0) > 0 && s.enrollment_status !== 'INACTIVE').length,
      totalClassBalance,
      todayDeposit,
      todayWithdrawal,
      totalDepositAllTime,
      totalWithdrawalAllTime,
      recentTransactions: [...bundle.transactions].sort((a, b) => `${b.transaction_date}|${b.created_at}`.localeCompare(`${a.transaction_date}|${a.created_at}`)).slice(0, 8)
    };
  }

  public async getStudentReport(studentId: string, user: User, period?: { startDate?: string; endDate?: string }): Promise<StudentReport | null> {
    const student = await this.getStudentById(studentId, user);
    if (!student) return null;
    let transactions = (await this.getTransactions(user, student.nisn));
    if (period?.startDate) transactions = transactions.filter((t) => t.transaction_date >= period.startDate!);
    if (period?.endDate) transactions = transactions.filter((t) => t.transaction_date <= period.endDate!);
    let periodDeposit = 0, periodWithdrawal = 0;
    for (const t of transactions.filter((t) => t.status === 'ACTIVE')) {
      if (t.transaction_type === 'SETORAN') periodDeposit += t.amount;
      if (t.transaction_type === 'PENARIKAN') periodWithdrawal += t.amount;
    }
    return {
      student,
      summary: {
        balance: Number(student.balance || 0),
        totalDeposit: Number(student.totalDeposit || 0),
        totalWithdrawal: Number(student.totalWithdrawal || 0),
        transactionCount: Number(student.transactionCount || 0),
        periodDeposit,
        periodWithdrawal,
        periodNet: periodDeposit - periodWithdrawal,
        currentBalance: Number(student.balance || 0)
      },
      transactions
    };
  }

  public async getClassReport(user: User): Promise<ClassReport> {
    const students = await this.getStudents(user);
    let totalBalance = 0, totalDeposit = 0, totalWithdrawal = 0, transactionCount = 0;
    const list = students.map((s) => {
      const balance = Number(s.balance || 0), deposit = Number(s.totalDeposit || 0), withdrawal = Number(s.totalWithdrawal || 0), count = Number(s.transactionCount || 0);
      totalBalance += balance; totalDeposit += deposit; totalWithdrawal += withdrawal; transactionCount += count;
      return { studentId: s.student_id, nisn: s.nisn, name: s.nama, gender: s.jenis_kelamin, totalDeposit: deposit, totalWithdrawal: withdrawal, balance, transactionCount: count, status: s.status, ledgerError: balance < 0 };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { totalStudents: students.length, totalBalance, totalDeposit, totalWithdrawal, transactionCount, students: list };
  }

  public async getSettings(user: User): Promise<AppSettings> {
    const bundle = user.active_class_section_id ? await this.getScopeBundle(user) : { settings: await this.callGasApi<Record<string, any>>('getSettings', {}, { user_id: user.user_id, role: user.role }), section: null } as any;
    const s = bundle.settings || {};
    return {
      school_name: sanitizeText(s.school_name || 'MI Islam Terpadu Al-Uswah Pasirian', 100),
      school_logo: '',
      academic_year: user.active_academic_year,
      currency: 'IDR',
      minimum_deposit: Number(s.minimum_deposit) > 0 ? Number(s.minimum_deposit) : 1000,
      maximum_deposit: Number(s.maximum_deposit) > 0 ? Math.min(Number(s.maximum_deposit), CONFIG.MAX_TRANSACTION_AMOUNT) : Math.min(5000000, CONFIG.MAX_TRANSACTION_AMOUNT),
      maximum_withdrawal: Number(s.maximum_withdrawal) > 0 ? Math.min(Number(s.maximum_withdrawal), CONFIG.MAX_TRANSACTION_AMOUNT) : Math.min(5000000, CONFIG.MAX_TRANSACTION_AMOUNT),
      class_id: user.active_class_id,
      class_name: user.active_class_id,
      teacher_name: user.name,
      gas_script_url: 'https://script.google.com/... (Configured in Server ENV)',
      gas_configured: true,
      allowed_classes: user.class_ids,
      allowed_academic_years: user.academic_years
    };
  }

  public async updateSettings(updates: Partial<AppSettings>, user: User): Promise<AppSettings> {
    const safe = {
      school_name: updates.school_name ? sanitizeText(updates.school_name, 100) : undefined,
      minimum_deposit: updates.minimum_deposit,
      maximum_deposit: updates.maximum_deposit,
      maximum_withdrawal: updates.maximum_withdrawal
    };
    await this.callGasApi('saveSettings', safe, { user_id: user.user_id, role: user.role });
    this.clearUserCache();
    return this.getSettings(user);
  }

  public async changePassword(userId: string, oldPasswordInput: string, newPasswordInput: string): Promise<{ message: string }> {
    const oldPassword = String(oldPasswordInput || '');
    const newPassword = String(newPasswordInput || '');
    if (!oldPassword) throw new Error('Kata sandi saat ini wajib diisi.');
    if (!newPassword || newPassword.length < 8) throw new Error('Kata sandi baru minimal 8 karakter.');
    if (newPassword.length > 128) throw new Error('Kata sandi baru maksimal 128 karakter.');
    if (oldPassword === newPassword) throw new Error('Kata sandi baru tidak boleh sama dengan kata sandi saat ini.');

    const authRecord = await this.callGasApi<AuthRecord>('getAuthUser', { user_id: userId });
    if (!authRecord || !verifyPassword(oldPassword, authRecord.password_hash)) {
      throw new Error('Kata sandi saat ini tidak sesuai.');
    }

    const newHash = hashPassword(newPassword);
    await this.callGasApi('updateUserPasswordHash', { user_id: userId, password_hash: newHash }, { user_id: userId });
    this.clearUserCache(userId);
    return { message: 'Kata sandi berhasil diubah.' };
  }

  public async syncFromGas(user: User): Promise<{ message: string; studentCount: number; transactionCount: number }> {
    this.clearUserCache(user.user_id);
    await this.getAccessProfile(user.user_id, user.role, true);
    if (!user.active_class_section_id) return { message: 'Profil akses diperbarui. Akun belum memiliki kelas aktif.', studentCount: 0, transactionCount: 0 };
    const bundle = await this.getScopeBundle(user, true);
    return { message: 'Data Google Sheets berhasil diperbarui.', studentCount: bundle.students.length, transactionCount: bundle.transactions.length };
  }
}

export const db = new DatabaseService();
