import { Student, Transaction, DashboardSummary, StudentReport, ClassReport, AppSettings, AccessProfile, User, BootstrapData, TransactionMutationResult } from '../types';

interface CacheEntry<T> { data: T; expiry: number; }
export type TransactionResult = TransactionMutationResult;

const DEFAULT_CACHE_TTL = 60_000; // 60 seconds client cache

class ApiService {
  private cache = new Map<string, CacheEntry<any>>();
  private activeAcademicYear: string | null = null;
  private activeClassId: string | null = null;
  private token: string | null = null;

  constructor() {
    try {
      if (typeof window !== 'undefined') {
        this.activeAcademicYear = window.localStorage.getItem('tabungan_active_academic_year');
        this.activeClassId = window.localStorage.getItem('tabungan_active_class');
        this.token = window.localStorage.getItem('tabungan_session_token');
        this.restoreSessionCache();
      }
    } catch {}
  }

  private restoreSessionCache(): void {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.sessionStorage.getItem('tabungan_client_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        const now = Date.now();
        for (const [k, v] of Object.entries(parsed)) {
          const entry = v as CacheEntry<any>;
          if (entry && entry.expiry > now) {
            this.cache.set(k, entry);
          }
        }
      }
    } catch {}
  }

  private persistSessionCache(): void {
    try {
      if (typeof window === 'undefined') return;
      const obj: Record<string, any> = {};
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (v.expiry > now) {
          obj[k] = v;
        }
      }
      window.sessionStorage.setItem('tabungan_client_cache', JSON.stringify(obj));
    } catch {}
  }

  public clearCache(): void {
    this.cache.clear();
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('tabungan_client_cache');
      }
    } catch {}
  }

  public getActiveAcademicYear(): string | null { return this.activeAcademicYear; }
  public getActiveClassId(): string | null { return this.activeClassId; }
  public getToken(): string | null { return this.token; }

  public setToken(token: string | null): void {
    this.token = token;
    try {
      if (typeof window !== 'undefined') {
        if (token) {
          window.localStorage.setItem('tabungan_session_token', token);
        } else {
          window.localStorage.removeItem('tabungan_session_token');
        }
      }
    } catch {}
  }

  public setActiveAcademicYear(year: string | null): void {
    const clean = year ? String(year).trim() : null;
    if (clean === this.activeAcademicYear) return;
    this.activeAcademicYear = clean;
    this.activeClassId = null;
    this.clearCache();
    try {
      if (typeof window !== 'undefined') {
        if (clean) window.localStorage.setItem('tabungan_active_academic_year', clean);
        else window.localStorage.removeItem('tabungan_active_academic_year');
        window.localStorage.removeItem('tabungan_active_class');
      }
    } catch {}
  }

  public setActiveClassId(classId: string | null): void {
    const clean = classId ? String(classId).trim() : null;
    if (clean === this.activeClassId) return;
    this.activeClassId = clean;
    this.clearCache();
    try {
      if (typeof window !== 'undefined') {
        if (clean) window.localStorage.setItem('tabungan_active_class', clean);
        else window.localStorage.removeItem('tabungan_active_class');
      }
    } catch {}
  }

  private cacheKey(key: string): string {
    return `${this.activeAcademicYear || 'year'}:${this.activeClassId || 'class'}:${key}`;
  }

  private getCached<T>(key: string): T | null {
    const k = this.cacheKey(key);
    const e = this.cache.get(k);
    if (!e) return null;
    if (Date.now() > e.expiry) {
      this.cache.delete(k);
      return null;
    }
    return e.data;
  }

  private setCached<T>(key: string, data: T, ttl = DEFAULT_CACHE_TTL): void {
    this.cache.set(this.cacheKey(key), { data, expiry: Date.now() + ttl });
    this.persistSessionCache();
  }

  // Synchronous getters for instant view rendering without skeleton
  public getCachedSummary(): DashboardSummary | null { return this.getCached<DashboardSummary>('summary'); }
  public getCachedStudents(): Student[] | null { return this.getCached<Student[]>('students'); }
  public getCachedClassReport(): ClassReport | null { return this.getCached<ClassReport>('class_report'); }
  public getCachedSettings(): AppSettings | null { return this.getCached<AppSettings>('settings'); }
  public getCachedAccessProfile(): AccessProfile | null { return this.getCached<AccessProfile>('access_profile'); }
  public getCachedGasScript(): string | null { return this.getCached<string>('gas_script'); }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) || {}) };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (endpoint !== '/api/auth/login') {
      if (this.activeAcademicYear) headers['X-Academic-Year'] = this.activeAcademicYear;
      if (this.activeClassId) headers['X-Class-Id'] = this.activeClassId;
    }
    let response: Response;
    try { response = await fetch(endpoint, { ...options, headers, credentials: 'include' }); }
    catch (err: any) { throw new Error(`Koneksi ke server gagal: ${err?.message || 'Periksa koneksi internet.'}`); }
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error((await response.text()) || `HTTP ${response.status}`);
    const result = await response.json();
    if (!response.ok || !result.success) {
      const err = new Error(result?.error?.message || `Server error (HTTP ${response.status})`); (err as any).code = result?.error?.code || 'API_ERROR'; (err as any).status = response.status;
      if (response.status === 401 && endpoint !== '/api/auth/login') {
        this.setToken(null);
        this.clearCache();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tabungan:session_expired', { detail: { message: err.message } }));
      }
      throw err;
    }
    return result.data as T;
  }

  private applyUserScope(user: User): void {
    const years = Array.isArray(user?.academic_years) ? user.academic_years.map(String) : [];
    const preferredYear = this.activeAcademicYear && years.includes(this.activeAcademicYear) ? this.activeAcademicYear : String(user?.active_academic_year || years[0] || '');
    if (preferredYear && preferredYear !== this.activeAcademicYear) this.setActiveAcademicYear(preferredYear);
    const classes = Array.isArray(user?.class_ids) ? user.class_ids.map(String) : [];
    const preferredClass = this.activeClassId && classes.includes(this.activeClassId) ? this.activeClassId : String(user?.active_class_id || classes[0] || '');
    if (preferredClass !== (this.activeClassId || '')) this.setActiveClassId(preferredClass || null);
  }

  public async login(username: string, password: string): Promise<{ user: User; token?: string }> {
    const data = await this.request<{ user: User; token?: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.token) {
      this.setToken(data.token);
    }
    this.applyUserScope(data.user);
    return data;
  }

  public async logout(): Promise<void> {
    try { await this.request('/api/auth/logout', { method: 'POST' }); }
    finally {
      this.setToken(null);
      this.clearCache();
      this.setActiveAcademicYear(null);
      this.setActiveClassId(null);
    }
  }

  public async validateSession(): Promise<{ user: User }> {
    const data = await this.request<{ user: User }>('/api/auth/session');
    this.applyUserScope(data.user);
    return data;
  }

  public async getBootstrap(): Promise<BootstrapData> {
    const data = await this.request<BootstrapData>('/api/bootstrap');
    if (data.user) {
      this.applyUserScope(data.user);
    }
    if (data.settings) {
      this.setCached('settings', data.settings);
    }
    if (data.dashboard) {
      this.setCached('summary', data.dashboard);
    }
    if (data.students) {
      this.setCached('students', data.students);
    }
    return data;
  }

  public async changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    });
  }

  public async getAccessProfile(fresh = false): Promise<AccessProfile> {
    if (!fresh) {
      const c = this.getCached<AccessProfile>('access_profile');
      if (c) return c;
    }
    const d = await this.request<AccessProfile>('/api/access/profile');
    this.setCached('access_profile', d);
    return d;
  }

  public async getSummary(freshOrOptions?: boolean | { fresh?: boolean }): Promise<DashboardSummary> {
    const fresh = typeof freshOrOptions === 'boolean' ? freshOrOptions : Boolean(freshOrOptions?.fresh);
    if (!fresh) {
      const c = this.getCached<DashboardSummary>('summary');
      if (c) return c;
    }
    const d = await this.request<DashboardSummary>('/api/summary');
    this.setCached('summary', d);
    return d;
  }

  public async getDashboard(freshOrOptions?: boolean | { fresh?: boolean }): Promise<DashboardSummary> {
    return this.getSummary(freshOrOptions);
  }

  public async getStudents(freshOrFilter?: any): Promise<Student[]> {
    const fresh = freshOrFilter === true || (typeof freshOrFilter === 'object' && freshOrFilter?.fresh === true);
    if (!fresh) {
      const c = this.getCached<Student[]>('students');
      if (c) return c;
    }
    const d = await this.request<Student[]>('/api/students');
    this.setCached('students', d);
    return d;
  }

  public async getStudentById(id: string): Promise<Student> {
    return this.request<Student>(`/api/students/${encodeURIComponent(id)}`);
  }

  public async createStudent(student: Partial<Student>): Promise<Student> {
    const d = await this.request<Student>('/api/students', { method: 'POST', body: JSON.stringify(student) });
    this.clearCache();
    return d;
  }

  public async updateStudent(id: string, student: Partial<Student>): Promise<Student> {
    const d = await this.request<Student>(`/api/students/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(student) });
    this.clearCache();
    return d;
  }

  public async deleteStudent(id: string): Promise<{ message: string; mode: 'ENROLLMENT_DEACTIVATED' }> {
    const d = await this.request<{ message: string; mode: 'ENROLLMENT_DEACTIVATED' }>(`/api/students/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.clearCache();
    return d;
  }

  public async getTransactions(filter?: string | { limit?: number; student_id?: string; studentId?: string; fresh?: boolean }, fresh?: boolean): Promise<Transaction[]> {
    const isFresh = fresh === true || (typeof filter === 'object' && filter?.fresh === true);
    const sid = typeof filter === 'string' ? filter : (filter?.student_id || filter?.studentId || '');
    const key = `transactions:${sid || 'all'}`;
    if (!isFresh) {
      const c = this.getCached<Transaction[]>(key);
      if (c) return c;
    }
    const url = sid ? `/api/transactions?student_id=${encodeURIComponent(sid)}` : '/api/transactions';
    let d = await this.request<Transaction[]>(url);
    if (typeof filter === 'object' && filter?.limit) d = d.slice(0, filter.limit);
    this.setCached(key, d);
    return d;
  }

  public async deposit(params: { student_id: string; amount: number; transaction_date?: string; description?: string }): Promise<TransactionResult> {
    const d = await this.request<TransactionResult>('/api/transactions/deposit', { method: 'POST', body: JSON.stringify(params) });
    this.updateCacheAfterTransaction(d);
    return d;
  }

  public async createDeposit(params: { student_id: string; amount: number; transaction_date?: string; description?: string }): Promise<TransactionResult> {
    return this.deposit(params);
  }

  public async withdraw(params: { student_id: string; amount: number; transaction_date?: string; description?: string }): Promise<TransactionResult> {
    const d = await this.request<TransactionResult>('/api/transactions/withdraw', { method: 'POST', body: JSON.stringify(params) });
    this.updateCacheAfterTransaction(d);
    return d;
  }

  public async createWithdrawal(params: { student_id: string; amount: number; transaction_date?: string; description?: string }): Promise<TransactionResult> {
    return this.withdraw(params);
  }

  public async voidTransaction(transaction_id: string, void_reason?: string): Promise<TransactionResult> {
    const d = await this.request<TransactionResult>('/api/transactions/void', { method: 'POST', body: JSON.stringify({ transaction_id, void_reason }) });
    this.updateCacheAfterTransaction(d);
    return d;
  }

  private updateCacheAfterTransaction(result: TransactionResult) {
    if (result.student) {
      const students = this.getCached<Student[]>('students');
      if (students) {
        const next = students.map((s) => (s.nisn === result.student?.nisn || s.student_id === result.student?.nisn) ? { ...s, ...result.student } : s);
        this.setCached('students', next);
      }
    }
    if (result.dashboardDelta) {
      const summary = this.getCached<DashboardSummary>('summary');
      if (summary) {
        const next = { ...summary };
        if (result.dashboardDelta.totalBalanceDelta) next.totalClassBalance = (next.totalClassBalance || 0) + result.dashboardDelta.totalBalanceDelta;
        if (result.dashboardDelta.todayDepositDelta) next.todayDeposit = (next.todayDeposit || 0) + result.dashboardDelta.todayDepositDelta;
        if (result.dashboardDelta.todayWithdrawalDelta) next.todayWithdrawal = (next.todayWithdrawal || 0) + result.dashboardDelta.todayWithdrawalDelta;
        if (result.transaction) {
          next.recentTransactions = [result.transaction, ...(next.recentTransactions || [])].slice(0, 10);
        }
        this.setCached('summary', next);
      }
    }
  }

  public async getStudentReport(studentId: string, startDate?: string, endDate?: string): Promise<StudentReport> {
    const p = new URLSearchParams();
    if (startDate) p.set('startDate', startDate);
    if (endDate) p.set('endDate', endDate);
    return this.request<StudentReport>(`/api/reports/student/${encodeURIComponent(studentId)}${p.toString() ? `?${p}` : ''}`);
  }

  public async prefetchStudentReport(studentId: string): Promise<void> {
    try { await this.getStudentReport(studentId); } catch {}
  }

  public async getClassReport(fresh = false): Promise<ClassReport> {
    if (!fresh) {
      const c = this.getCached<ClassReport>('class_report');
      if (c) return c;
    }
    const d = await this.request<ClassReport>('/api/reports/class');
    this.setCached('class_report', d);
    return d;
  }

  public async getSettings(fresh = false): Promise<AppSettings> {
    if (!fresh) {
      const c = this.getCached<AppSettings>('settings');
      if (c) return c;
    }
    const d = await this.request<AppSettings>('/api/settings');
    this.setCached('settings', d);
    return d;
  }

  public async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const d = await this.request<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    this.clearCache();
    return d;
  }

  public async getGasScript(fresh = false): Promise<string> {
    if (!fresh) {
      const c = this.getCached<string>('gas_script');
      if (c) return c;
    }
    const code = (await this.request<{ code: string }>('/api/settings/gas-script')).code;
    this.setCached('gas_script', code, 3600_000);
    return code;
  }

  public async syncFromGas(): Promise<{ message: string; studentCount: number; transactionCount: number }> {
    const d = await this.request<any>('/api/sync/gas', { method: 'POST' });
    this.clearCache();
    return d;
  }

  public async refreshCache(): Promise<{ message: string; studentCount?: number; transactionCount?: number }> {
    const d = await this.request<any>('/api/sync/refresh-cache', { method: 'POST' });
    this.clearCache();
    return d;
  }
}

export const api = new ApiService();
