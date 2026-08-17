import { 
  Student, 
  Transaction, 
  DashboardSummary, 
  StudentReport, 
  ClassReport, 
  AppSettings,
  AuthSession,
  ApiResponse
} from '../types';

// In-Memory Cache with TTL
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class ApiService {
  private cache = new Map<string, CacheEntry<any>>();
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('tabungan_token');
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem('tabungan_token', token);
    } else {
      localStorage.removeItem('tabungan_token');
      this.clearCache();
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public invalidate(prefix?: string): void {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCached<T>(key: string, data: T, ttlMs: number = 30000): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers
    });

    let resData: ApiResponse<T>;
    try {
      resData = await response.json();
    } catch (err) {
      throw new Error('Gagal memproses respon server.');
    }

    if (!response.ok || !resData.success) {
      const errMsg = resData.error?.message || 'Terjadi kesalahan sistem.';
      const err = new Error(errMsg);
      (err as any).code = resData.error?.code || 'SERVER_ERROR';
      throw err;
    }

    if (resData.data !== undefined) {
      return resData.data as T;
    }
    return (resData as unknown) as T;
  }

  // ============================
  // AUTH
  // ============================
  public async login(username: string, password: string): Promise<AuthSession> {
    const res = await this.request<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(res.token);
    return res;
  }

  public async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    } finally {
      this.setToken(null);
    }
  }

  public async validateSession(): Promise<{ user: any }> {
    return this.request<{ user: any }>('/api/auth/validate-session');
  }

  // ============================
  // DASHBOARD
  // ============================
  public async getDashboard(forceFresh = false): Promise<DashboardSummary> {
    const cacheKey = 'dashboard';
    if (!forceFresh) {
      const cached = this.getCached<DashboardSummary>(cacheKey);
      if (cached) return cached;
    }

    const data = await this.request<DashboardSummary>('/api/dashboard');
    this.setCached(cacheKey, data, 20000); // 20s TTL
    return data;
  }

  // ============================
  // STUDENTS
  // ============================
  public async getStudents(status: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL', search = '', forceFresh = false): Promise<Student[]> {
    const cacheKey = `students_${status}_${search}`;
    if (!forceFresh && !search) {
      const cached = this.getCached<Student[]>(cacheKey);
      if (cached) return cached;
    }

    const params = new URLSearchParams();
    if (status !== 'ALL') params.append('status', status);
    if (search) params.append('search', search);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await this.request<Student[]>(`/api/students${qs}`);
    
    if (!search) {
      this.setCached(cacheKey, data, 30000); // 30s TTL
    }
    return data;
  }

  public async getStudent(id: string): Promise<Student> {
    const cacheKey = `student_${id}`;
    const cached = this.getCached<Student>(cacheKey);
    if (cached) return cached;

    const data = await this.request<Student>(`/api/students/${id}`);
    this.setCached(cacheKey, data, 30000);
    return data;
  }

  public async createStudent(payload: Partial<Student>): Promise<Student> {
    const res = await this.request<Student>('/api/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    this.invalidate('students');
    this.invalidate('dashboard');
    this.invalidate('class_report');
    return res;
  }

  public async updateStudent(id: string, payload: Partial<Student>): Promise<Student> {
    const res = await this.request<Student>(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.invalidate('students');
    this.invalidate(`student_${id}`);
    this.invalidate(`report_${id}`);
    this.invalidate('class_report');
    this.invalidate('dashboard');
    return res;
  }

  public async deleteStudent(id: string): Promise<{ mode: 'DELETED' | 'DEACTIVATED'; message: string }> {
    const res = await this.request<{ mode: 'DELETED' | 'DEACTIVATED'; message: string }>(`/api/students/${id}`, {
      method: 'DELETE'
    });
    this.invalidate('students');
    this.invalidate(`student_${id}`);
    this.invalidate('dashboard');
    this.invalidate('class_report');
    return res;
  }

  // ============================
  // TRANSACTIONS (Pessimistic)
  // ============================
  public async createDeposit(payload: {
    student_id: string;
    amount: number;
    description?: string;
    transaction_date?: string;
  }): Promise<{ transaction: Transaction; newBalance: number }> {
    const res = await this.request<{ transaction: Transaction; newBalance: number }>('/api/transactions/deposit', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Invalidate financial caches
    this.invalidate('dashboard');
    this.invalidate('students');
    this.invalidate(`student_${payload.student_id}`);
    this.invalidate(`report_${payload.student_id}`);
    this.invalidate('class_report');
    this.invalidate('transactions');

    return res;
  }

  public async createWithdrawal(payload: {
    student_id: string;
    amount: number;
    description?: string;
    transaction_date?: string;
  }): Promise<{ transaction: Transaction; newBalance: number }> {
    const res = await this.request<{ transaction: Transaction; newBalance: number }>('/api/transactions/withdraw', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Invalidate financial caches
    this.invalidate('dashboard');
    this.invalidate('students');
    this.invalidate(`student_${payload.student_id}`);
    this.invalidate(`report_${payload.student_id}`);
    this.invalidate('class_report');
    this.invalidate('transactions');

    return res;
  }

  public async voidTransaction(transactionId: string, reason?: string): Promise<{ transaction: Transaction; newBalance: number }> {
    const res = await this.request<{ transaction: Transaction; newBalance: number }>('/api/transactions/void', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: transactionId, reason })
    });

    // Invalidate financial caches
    this.invalidate('dashboard');
    this.invalidate('students');
    this.invalidate('report_');
    this.invalidate('class_report');
    this.invalidate('transactions');

    return res;
  }

  public async getTransactions(filters?: {
    student_id?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    limit?: number;
  }): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (filters?.student_id) params.append('student_id', filters.student_id);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', String(filters.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<Transaction[]>(`/api/transactions${qs}`);
  }

  // ============================
  // REPORTS
  // ============================
  public async getStudentReport(studentId: string, startDate?: string, endDate?: string, forceFresh = false): Promise<StudentReport> {
    const cacheKey = `report_${studentId}_${startDate || ''}_${endDate || ''}`;
    if (!forceFresh) {
      const cached = this.getCached<StudentReport>(cacheKey);
      if (cached) return cached;
    }

    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await this.request<StudentReport>(`/api/students/${studentId}/report${qs}`);
    this.setCached(cacheKey, data, 20000);
    return data;
  }

  public async getClassReport(forceFresh = false): Promise<ClassReport> {
    const cacheKey = 'class_report';
    if (!forceFresh) {
      const cached = this.getCached<ClassReport>(cacheKey);
      if (cached) return cached;
    }

    const data = await this.request<ClassReport>('/api/reports/class');
    this.setCached(cacheKey, data, 20000);
    return data;
  }

  // ============================
  // PREFETCH HELPER
  // ============================
  public prefetchStudentReport(studentId: string): void {
    if (!studentId) return;
    const cacheKey = `report_${studentId}__`;
    if (this.cache.has(cacheKey)) return;

    // Fetch silently in background
    this.request<StudentReport>(`/api/students/${studentId}/report`)
      .then((data) => this.setCached(cacheKey, data, 30000))
      .catch(() => {});
  }

  // ============================
  // SETTINGS & GAS
  // ============================
  public async getSettings(): Promise<AppSettings> {
    return this.request<AppSettings>('/api/settings');
  }

  public async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const res = await this.request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    this.invalidate('dashboard');
    return res;
  }

  public async syncFromGas(): Promise<{ message: string }> {
    const res = await this.request<{ message?: string } | any>('/api/sync/gas', { method: 'POST' });
    this.clearCache();
    const msg = (res && typeof res === 'object' && 'message' in res && typeof res.message === 'string')
      ? res.message
      : 'Sinkronisasi berhasil diselesaikan.';
    return { message: msg };
  }

  public async resetDemoData(): Promise<void> {
    await this.request('/api/database/reset', { method: 'POST' });
    this.clearCache();
  }

  public async getGasScript(): Promise<string> {
    const res = await this.request<{ script: string }>('/api/gas/script-export');
    return res.script;
  }
}

export const api = new ApiService();
