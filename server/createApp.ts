import express, { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { generateGoogleAppsScriptCode } from './gasTemplate.js';

export function createApp() {
  const app = express();

  // JSON Body parsing
  app.use(express.json());

  // Simple Auth Middleware
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring(7);
    const user = db.validateSession(token);
    if (user) {
      (req as any).user = user;
    }
    next();
  };

  app.use(authMiddleware);

  // ==========================================
  // AUTH API
  // ==========================================
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CREDENTIAL', message: 'Username dan kata sandi harus diisi.' }
      });
    }

    const authResult = await db.loginUser(username, password);
    if (!authResult) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIAL', message: 'Username atau kata sandi wali kelas salah.' }
      });
    }

    res.json({
      success: true,
      data: {
        token: authResult.session.session_id,
        user: {
          user_id: authResult.user.user_id,
          username: authResult.user.username,
          name: authResult.user.name,
          class_id: authResult.user.class_id
        },
        expires_at: authResult.session.expires_at
      }
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      db.logoutSession(token);
    }
    res.json({ success: true, message: 'Berhasil keluar.' });
  });

  app.get('/api/auth/validate-session', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Sesi tidak ditemukan. Silakan login kembali.' }
      });
    }

    const token = authHeader.substring(7);
    const user = db.validateSession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Sesi Anda telah kedaluwarsa.' }
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          username: user.username,
          name: user.name,
          class_id: user.class_id
        }
      }
    });
  });

  // ==========================================
  // DASHBOARD API
  // ==========================================
  app.get('/api/dashboard', async (req: Request, res: Response) => {
    try {
      if (req.query.fresh === 'true' || req.query.refresh === 'true') {
        await db.syncFromGas().catch(() => {});
      }
      const dashboard = db.getDashboard();
      res.json({ success: true, data: dashboard });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: err.message || 'Gagal memuat data dashboard.' }
      });
    }
  });

  // ==========================================
  // STUDENTS CRUD API
  // ==========================================
  app.get('/api/students', async (req: Request, res: Response) => {
    try {
      if (req.query.fresh === 'true' || req.query.refresh === 'true') {
        await db.syncFromGas().catch(() => {});
      }
      const status = req.query.status as 'ALL' | 'ACTIVE' | 'INACTIVE' | undefined;
      const search = req.query.search as string | undefined;
      const students = db.getStudents(status || 'ALL', search);
      res.json({ success: true, data: students });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Gagal memuat data siswa.' }
      });
    }
  });

  app.get('/api/students/:id', (req: Request, res: Response) => {
    const student = db.getStudentById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: { code: 'STUDENT_NOT_FOUND', message: 'Data siswa tidak ditemukan.' }
      });
    }
    res.json({ success: true, data: student });
  });

  app.post('/api/students', (req: Request, res: Response) => {
    try {
      const { nisn, nama, jenis_kelamin, kelas, no_hp_wali } = req.body;
      if (!nama || !nisn) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_DATA', message: 'Nama dan NISN siswa wajib diisi.' }
        });
      }

      // Check NISN duplicate
      const existing = db.getStudents('ALL').find((s) => (s.nisn || s.student_id) === String(nisn).trim());
      if (existing) {
        return res.status(400).json({
          success: false,
          error: { code: 'DUPLICATE_NISN', message: `NISN ${nisn} sudah digunakan oleh siswa ${existing.nama}.` }
        });
      }

      const newStudent = db.createStudent({
        nisn: String(nisn).trim(),
        nama: String(nama).trim(),
        jenis_kelamin: jenis_kelamin === 'P' ? 'P' : 'L',
        kelas: String(kelas || '5C').trim(),
        no_hp_wali: String(no_hp_wali || '').trim(),
        status: 'ACTIVE'
      });

      res.status(201).json({ success: true, data: newStudent });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: err.message || 'Gagal menambahkan siswa.' }
      });
    }
  });

  app.put('/api/students/:id', (req: Request, res: Response) => {
    try {
      const updated = db.updateStudent(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: { code: 'STUDENT_NOT_FOUND', message: 'Data siswa tidak ditemukan.' }
        });
      }
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Gagal memperbarui data siswa.' }
      });
    }
  });

  app.delete('/api/students/:id', (req: Request, res: Response) => {
    try {
      const result = db.deleteOrDeactivateStudent(req.params.id);
      if (!result.student && result.mode === 'DEACTIVATED') {
        return res.status(404).json({
          success: false,
          error: { code: 'STUDENT_NOT_FOUND', message: 'Data siswa tidak ditemukan.' }
        });
      }
      res.json({
        success: true,
        data: {
          mode: result.mode,
          message: result.mode === 'DEACTIVATED'
            ? 'Siswa dinonaktifkan karena memiliki riwayat transaksi (data finansial aman).'
            : 'Siswa berhasil dihapus.'
        }
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Gagal memproses penghapusan siswa.' }
      });
    }
  });

  // ==========================================
  // TRANSACTIONS API (Financial Source of Truth)
  // ==========================================
  app.get('/api/transactions', (req: Request, res: Response) => {
    try {
      const { student_id, type, startDate, endDate, status, limit } = req.query;
      const transactions = db.getTransactions({
        student_id: student_id as string,
        type: type as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined
      });
      res.json({ success: true, data: transactions });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Gagal memuat transaksi.' }
      });
    }
  });

  // DEPOSIT (Pessimistic transaction)
  app.post('/api/transactions/deposit', async (req: Request, res: Response) => {
    try {
      const { student_id, amount, description, transaction_date } = req.body;
      if (!student_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_AMOUNT', message: 'Nominal setoran harus lebih besar dari 0.' }
        });
      }

      const result = await db.createDeposit({
        student_id,
        amount: Number(amount),
        description,
        transaction_date,
        created_by: (req as any).user?.name
      });

      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === 'STUDENT_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'STUDENT_NOT_FOUND', message: 'Siswa tidak ditemukan.' }
        });
      }
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: err.message || 'Gagal memproses setoran.' }
      });
    }
  });

  // WITHDRAWAL (Strict balance check)
  app.post('/api/transactions/withdraw', async (req: Request, res: Response) => {
    try {
      const { student_id, amount, description, transaction_date } = req.body;
      if (!student_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_AMOUNT', message: 'Nominal penarikan harus lebih besar dari 0.' }
        });
      }

      const result = await db.createWithdrawal({
        student_id,
        amount: Number(amount),
        description,
        transaction_date,
        created_by: (req as any).user?.name
      });

      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'Saldo tabungan siswa tidak mencukupi untuk melakukan penarikan ini.'
          }
        });
      }
      if (err.message === 'STUDENT_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'STUDENT_NOT_FOUND', message: 'Siswa tidak ditemukan.' }
        });
      }
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: err.message || 'Gagal memproses penarikan.' }
      });
    }
  });

  // VOID / BATALKAN TRANSAKSI
  app.post('/api/transactions/void', async (req: Request, res: Response) => {
    try {
      const { transaction_id, reason } = req.body;
      if (!transaction_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TRANSACTION', message: 'ID Transaksi wajib diisi.' }
        });
      }

      const result = await db.voidTransaction(transaction_id, reason);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === 'TRANSACTION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaksi tidak ditemukan.' }
        });
      }
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: err.message || 'Gagal membatalkan transaksi.' }
      });
    }
  });

  // ==========================================
  // REPORTS API
  // ==========================================
  app.get('/api/students/:id/report', (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      const report = db.getStudentReport(req.params.id, {
        startDate: startDate as string,
        endDate: endDate as string
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          error: { code: 'STUDENT_NOT_FOUND', message: 'Siswa tidak ditemukan.' }
        });
      }

      res.json({ success: true, data: report });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Gagal menyusun rekap tabungan siswa.' }
      });
    }
  });

  app.get('/api/reports/class', (req: Request, res: Response) => {
    try {
      const report = db.getClassReport();
      res.json({ success: true, data: report });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Gagal menyusun rekap kelas.' }
      });
    }
  });

  // ==========================================
  // SETTINGS & GAS CODE API
  // ==========================================
  app.get('/api/settings', (req: Request, res: Response) => {
    res.json({ success: true, data: db.getSettings() });
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    try {
      const updated = db.updateSettings(req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Gagal memperbarui pengaturan.' }
      });
    }
  });

  app.post('/api/database/reset', async (req: Request, res: Response) => {
    db.resetToDefault();
    const syncRes = await db.syncFromGas();
    res.json({ 
      success: true, 
      data: { 
        message: syncRes.success 
          ? `Data lokal dibersihkan & berhasil disinkronkan ulang dengan Google Sheets.` 
          : 'Data lokal dibersihkan.' 
      } 
    });
  });

  app.post('/api/sync/gas', async (req: Request, res: Response) => {
    try {
      const syncResult = await db.syncFromGas();
      if (!syncResult.success) {
        return res.status(400).json({ success: false, error: { code: 'SYNC_FAILED', message: syncResult.message } });
      }
      res.json({ success: true, data: { message: syncResult.message } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message || 'Gagal sinkronisasi data.' } });
    }
  });

  app.get('/api/gas/script-export', (req: Request, res: Response) => {
    const code = generateGoogleAppsScriptCode();
    res.json({ success: true, data: { script: code } });
  });

  return app;
}
