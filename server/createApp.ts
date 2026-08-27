import express, { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { GAS_SCRIPT_CODE } from './gasTemplate';
import type { User } from '../src/types';
import {
  CONFIG,
  parseCookies,
  verifySignedSessionToken,
  getSessionCookieOptions,
  securityHeadersMiddleware,
  sameOriginProtection,
  loginRateLimiter,
  mutationRateLimiter,
  syncRateLimiter
} from './security';

declare global {
  namespace Express {
    interface Request { user?: User; }
  }
}

export function createApp() {
  const app = express();
  app.set('trust proxy', CONFIG.TRUST_PROXY ? 1 : false);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(securityHeadersMiddleware);
  app.use(sameOriginProtection);

  const clearSessionCookie = (req: Request, res: Response) => {
    const opts = getSessionCookieOptions(req);
    res.setHeader('Set-Cookie', `tabungan_session=; HttpOnly; Path=/; SameSite=${opts.sameSite}; Max-Age=0${opts.secure ? '; Secure' : ''}${opts.partitioned ? '; Partitioned' : ''}`);
  };

  const getAuthTokenFromReq = (req: Request): string | null => {
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match && match[1]) return decodeURIComponent(match[1].trim());
    }
    const cookieToken = parseCookies(req.headers.cookie)['tabungan_session'];
    if (cookieToken) return cookieToken;
    return null;
  };

  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = getAuthTokenFromReq(req);
      if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sesi login tidak ditemukan. Silakan login kembali.' } });
      const decoded = verifySignedSessionToken(token);
      if (!decoded) {
        clearSessionCookie(req, res);
        return res.status(401).json({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Sesi login tidak valid atau telah berakhir.' } });
      }
      const requestedYear = typeof req.headers['x-academic-year'] === 'string' ? req.headers['x-academic-year'].trim() : '';
      const requestedClass = typeof req.headers['x-class-id'] === 'string' ? req.headers['x-class-id'].trim() : '';
      req.user = await db.getSessionUser(decoded, requestedYear, requestedClass);
      next();
    } catch (err: any) {
      const code = String(err?.message || '').startsWith('SESSION_') ? 'SESSION_CHANGED' : 'AUTH_SCOPE_ERROR';
      if (code === 'SESSION_CHANGED') clearSessionCookie(req, res);
      return res.status(code === 'SESSION_CHANGED' ? 401 : 503).json({ success: false, error: { code, message: err.message || 'Gagal memuat lingkup akses.' } });
    }
  };

  const requireActiveClass = (req: Request, res: Response): boolean => {
    if (!req.user?.active_class_section_id) {
      res.status(409).json({ success: false, error: { code: 'NO_CLASS_ASSIGNMENT', message: 'Akun guru belum ditugaskan ke kelas atau belum ada kelas aktif. Hubungi penanggung jawab spreadsheet untuk mengisi TEACHER_ASSIGNMENTS.' } });
      return false;
    }
    return true;
  };

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Tabungan Siswa Backend API', version: '5.0.0-multirole', environment: CONFIG.NODE_ENV, timestamp: new Date().toISOString() }));

  app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const { user, signedToken } = await db.loginUser(username, password);
      const opts = getSessionCookieOptions(req);
      const parts = [`tabungan_session=${encodeURIComponent(signedToken)}`, 'HttpOnly', 'Path=/', `SameSite=${opts.sameSite}`, `Max-Age=${CONFIG.SESSION_TTL_SECONDS}`];
      if (opts.secure) parts.push('Secure');
      if (opts.partitioned) parts.push('Partitioned');
      res.setHeader('Set-Cookie', parts.join('; '));
      return res.json({ success: true, data: { user, token: signedToken } });
    } catch (err: any) {
      const message = CONFIG.NODE_ENV === 'production' ? 'Username atau password salah.' : (err.message || 'Username atau password salah.');
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message } });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    return res.json({ success: true, data: { message: 'Berhasil logout.' } });
  });

  app.post('/api/auth/change-password', requireAuth, mutationRateLimiter, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body || {};
      const result = await db.changePassword(req.user!.user_id, oldPassword, newPassword);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: { code: 'CHANGE_PASSWORD_ERROR', message: err.message } });
    }
  });

  app.get('/api/bootstrap', requireAuth, async (req, res) => {
    const start = performance.now();
    try {
      const data = await db.getBootstrapData(req.user!);
      const duration = Math.round(performance.now() - start);
      res.setHeader('Server-Timing', `bootstrap;dur=${duration}`);
      return res.json({ success: true, data: { ...data, serverTimingMs: duration } });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: { code: 'BOOTSTRAP_ERROR', message: err.message || 'Gagal memuat bootstrap aplikasi.' } });
    }
  });

  app.get('/api/auth/session', requireAuth, (req, res) => res.json({ success: true, data: { user: req.user } }));
  app.get('/api/access/profile', requireAuth, async (req, res) => {
    try { return res.json({ success: true, data: await db.getAccessProfile(req.user!.user_id, req.user!.role) }); }
    catch (err: any) { return res.status(503).json({ success: false, error: { code: 'ACCESS_PROFILE_ERROR', message: err.message } }); }
  });

  app.get('/api/summary', requireAuth, async (req, res) => {
    try { if (!requireActiveClass(req, res)) return; return res.json({ success: true, data: await db.getDashboardSummary(req.user!) }); }
    catch (err: any) { return res.status(503).json({ success: false, error: { code: 'SUMMARY_ERROR', message: err.message } }); }
  });

  app.get('/api/students', requireAuth, async (req, res) => {
    try { if (!requireActiveClass(req, res)) return; return res.json({ success: true, data: await db.getStudents(req.user!) }); }
    catch (err: any) { return res.status(503).json({ success: false, error: { code: 'STUDENTS_FETCH_ERROR', message: err.message } }); }
  });

  app.get('/api/students/:id', requireAuth, async (req, res) => {
    try {
      if (!requireActiveClass(req, res)) return;
      const s = await db.getStudentById(req.params.id, req.user!);
      if (!s) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Siswa tidak ditemukan.' } });
      return res.json({ success: true, data: s });
    } catch (err: any) { return res.status(503).json({ success: false, error: { code: 'STUDENT_FETCH_ERROR', message: err.message } }); }
  });

  app.post('/api/students', requireAuth, mutationRateLimiter, async (req, res) => {
    try { if (!requireActiveClass(req, res)) return; return res.json({ success: true, data: await db.createStudent(req.body, req.user!) }); }
    catch (err: any) { return res.status(400).json({ success: false, error: { code: 'CREATE_STUDENT_ERROR', message: err.message } }); }
  });

  app.put('/api/students/:id', requireAuth, mutationRateLimiter, async (req, res) => {
    try { if (!requireActiveClass(req, res)) return; return res.json({ success: true, data: await db.updateStudent(req.params.id, req.body, req.user!) }); }
    catch (err: any) { return res.status(400).json({ success: false, error: { code: 'UPDATE_STUDENT_ERROR', message: err.message } }); }
  });

  app.delete('/api/students/:id', requireAuth, mutationRateLimiter, async (req, res) => {
    try { if (!requireActiveClass(req, res)) return; await db.deleteStudent(req.params.id, req.user!); return res.json({ success: true, data: { message: 'Enrollment siswa pada kelas aktif dinonaktifkan.', mode: 'ENROLLMENT_DEACTIVATED' } }); }
    catch (err: any) { return res.status(400).json({ success: false, error: { code: 'DELETE_STUDENT_ERROR', message: err.message } }); }
  });

  app.get('/api/transactions', requireAuth, async (req, res) => {
    try {
      if (!requireActiveClass(req, res)) return;
      const studentId = typeof req.query.student_id === 'string' ? req.query.student_id : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      return res.json({ success: true, data: await db.getTransactions(req.user!, { studentId, limit: isNaN(limit as any) ? undefined : limit, cursor }) });
    } catch (err: any) { return res.status(503).json({ success: false, error: { code: 'TRANSACTIONS_FETCH_ERROR', message: err.message } }); }
  });

  app.post('/api/transactions/deposit', requireAuth, mutationRateLimiter, async (req, res) => {
    try {
      if (!requireActiveClass(req, res)) return;
      const { student_id, amount, transaction_date, description } = req.body || {};
      return res.json({ success: true, data: await db.createDeposit({ student_id, amount, transaction_date, description }, req.user!) });
    } catch (err: any) { return res.status(400).json({ success: false, error: { code: 'DEPOSIT_ERROR', message: err.message } }); }
  });

  app.post('/api/transactions/withdraw', requireAuth, mutationRateLimiter, async (req, res) => {
    try {
      if (!requireActiveClass(req, res)) return;
      const { student_id, amount, transaction_date, description } = req.body || {};
      return res.json({ success: true, data: await db.createWithdrawal({ student_id, amount, transaction_date, description }, req.user!) });
    } catch (err: any) { return res.status(400).json({ success: false, error: { code: 'WITHDRAWAL_ERROR', message: err.message } }); }
  });

  app.post('/api/transactions/void', requireAuth, mutationRateLimiter, async (req, res) => {
    try {
      if (!requireActiveClass(req, res)) return;
      const { transaction_id, void_reason } = req.body || {};
      if (!transaction_id) return res.status(400).json({ success: false, error: { code: 'MISSING_TRANSACTION_ID', message: 'ID transaksi wajib diisi.' } });
      return res.json({ success: true, data: await db.voidTransaction(transaction_id, void_reason, req.user!) });
    } catch (err: any) { return res.status(400).json({ success: false, error: { code: 'VOID_ERROR', message: err.message } }); }
  });

  app.get('/api/reports/student/:id', requireAuth, async (req, res) => {
    try {
      if (!requireActiveClass(req, res)) return;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const report = await db.getStudentReport(req.params.id, req.user!, { startDate, endDate });
      if (!report) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Siswa tidak ditemukan.' } });
      return res.json({ success: true, data: report });
    } catch (err: any) { return res.status(503).json({ success: false, error: { code: 'STUDENT_REPORT_ERROR', message: err.message } }); }
  });

  app.get('/api/reports/class', requireAuth, async (req, res) => {
    try { if (!requireActiveClass(req, res)) return; return res.json({ success: true, data: await db.getClassReport(req.user!) }); }
    catch (err: any) { return res.status(503).json({ success: false, error: { code: 'CLASS_REPORT_ERROR', message: err.message } }); }
  });

  app.get('/api/settings', requireAuth, async (req, res) => {
    try { return res.json({ success: true, data: await db.getSettings(req.user!) }); }
    catch (err: any) { return res.status(400).json({ success: false, error: { code: 'SETTINGS_ERROR', message: err.message } }); }
  });

  app.put('/api/settings', requireAuth, mutationRateLimiter, async (req, res) => {
    try { return res.json({ success: true, data: await db.updateSettings(req.body || {}, req.user!) }); }
    catch (err: any) { return res.status(403).json({ success: false, error: { code: 'SETTINGS_UPDATE_ERROR', message: err.message } }); }
  });

  app.get('/api/settings/gas-script', requireAuth, (_req, res) => res.json({ success: true, data: { code: GAS_SCRIPT_CODE } }));
  app.post('/api/sync/gas', requireAuth, syncRateLimiter, async (req, res) => {
    try { return res.json({ success: true, data: await db.syncFromGas(req.user!) }); }
    catch (err: any) { return res.status(503).json({ success: false, error: { code: 'SYNC_ERROR', message: err.message } }); }
  });
  app.post('/api/sync/refresh-cache', requireAuth, syncRateLimiter, async (req, res) => {
    try { return res.json({ success: true, data: await db.syncFromGas(req.user!) }); }
    catch (err: any) { return res.status(503).json({ success: false, error: { code: 'SYNC_ERROR', message: err.message } }); }
  });

  return app;
}
