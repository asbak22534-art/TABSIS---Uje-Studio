import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../src/types';

function isValidAcademicYear(value: string): boolean {
  const match = value.match(/^(\d{4})\/(\d{4})$/);
  return !!match && Number(match[2]) === Number(match[1]) + 1;
}

const autoVercelOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

const rawOrigin = process.env.APP_ORIGIN?.trim() || autoVercelOrigin;
const normalizedOrigin = rawOrigin ? (rawOrigin.startsWith('http') ? rawOrigin : `https://${rawOrigin}`) : '';

export const CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  APP_ORIGIN: normalizedOrigin,
  SESSION_SECRET: process.env.SESSION_SECRET?.trim() || 'default_session_secret_min_32_characters_long_for_dev_and_preview',
  GAS_SCRIPT_URL: process.env.GAS_SCRIPT_URL?.trim() || '',
  GAS_API_SECRET: process.env.GAS_API_SECRET?.trim() || '',
  SESSION_TTL_SECONDS: Math.max(900, parseInt(process.env.SESSION_TTL_SECONDS || '28800', 10) || 28800),
  MAX_TRANSACTION_AMOUNT: Math.max(1000, parseInt(process.env.MAX_TRANSACTION_AMOUNT || '10000000', 10) || 10000000),
  CACHE_TTL_MS: Math.max(0, parseInt(process.env.CACHE_TTL_MS || '60000', 10) || 60000),
  TRUST_PROXY: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true' || !!process.env.VERCEL
};

export function getEnvironmentDiagnostics() {
  const hasSession = Boolean(process.env.SESSION_SECRET && !process.env.SESSION_SECRET.includes('CHANGE_ME'));
  const sessionValid = Boolean(hasSession && (process.env.SESSION_SECRET?.trim().length || 0) >= 32);
  const hasGasUrl = Boolean(CONFIG.GAS_SCRIPT_URL);
  const gasUrlValid = Boolean(hasGasUrl && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(CONFIG.GAS_SCRIPT_URL));
  const hasGasSecret = Boolean(CONFIG.GAS_API_SECRET && !CONFIG.GAS_API_SECRET.includes('CHANGE_ME'));
  const gasSecretValid = Boolean(hasGasSecret && CONFIG.GAS_API_SECRET.length >= 32);
  const hasOrigin = Boolean(CONFIG.APP_ORIGIN);

  return {
    nodeEnv: CONFIG.NODE_ENV,
    hasSessionSecret: hasSession,
    sessionSecretValidLength: sessionValid,
    hasGasScriptUrl: hasGasUrl,
    gasScriptUrlValid: gasUrlValid,
    hasGasApiSecret: hasGasSecret,
    gasApiSecretValidLength: gasSecretValid,
    hasAppOrigin: hasOrigin
  };
}

export function getEnvironmentConfigErrors(): string[] {
  const errors: string[] = [];
  if (!CONFIG.SESSION_SECRET || CONFIG.SESSION_SECRET.length < 32 || CONFIG.SESSION_SECRET.includes('CHANGE_ME')) {
    errors.push('SESSION_SECRET wajib berupa secret statis minimal 32 karakter.');
  }
  if (!CONFIG.GAS_SCRIPT_URL || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(CONFIG.GAS_SCRIPT_URL)) {
    errors.push('GAS_SCRIPT_URL wajib berupa URL deployment Apps Script yang berakhiran /exec.');
  }
  if (!CONFIG.GAS_API_SECRET || CONFIG.GAS_API_SECRET.length < 32 || CONFIG.GAS_API_SECRET.includes('CHANGE_ME')) {
    errors.push('GAS_API_SECRET wajib berupa secret minimal 32 karakter.');
  }
  return errors;
}

export function validateEnvironmentOrExit(): void {
  const errors = getEnvironmentConfigErrors();
  if (errors.length) {
    console.warn(`[WARN] Konfigurasi environment belum lengkap:\n- ${errors.join('\n- ')}`);
  }
}

export function hashPassword(password: string): string {
  if (!password || String(password).length < 8) throw new Error('Password minimal 8 karakter.');
  return bcrypt.hashSync(String(password), 12);
}

export function verifyPassword(providedPass: string, storedHash: string): boolean {
  if (!providedPass || !storedHash || !storedHash.startsWith('$2')) return false;
  try {
    return bcrypt.compareSync(String(providedPass), storedHash);
  } catch {
    return false;
  }
}

export interface StatelessSessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  issuedAt: number;
  expiresAt: number;
}

export function createSignedSessionToken(
  userId: string,
  username: string,
  role: UserRole,
  ttlSeconds = CONFIG.SESSION_TTL_SECONDS
): string {
  if (!userId || !username || !['ADMIN', 'GURU'].includes(role)) throw new Error('Payload sesi tidak valid.');
  const now = Date.now();
  const payloadObj: StatelessSessionPayload = {
    userId: sanitizeText(userId, 100),
    username: sanitizeText(username, 100),
    role,
    issuedAt: now,
    expiresAt: now + ttlSeconds * 1000
  };
  const jsonBase64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const signature = crypto.createHmac('sha256', CONFIG.SESSION_SECRET).update(jsonBase64).digest('base64url');
  return `${jsonBase64}.${signature}`;
}

export function verifySignedSessionToken(token: string): StatelessSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [jsonBase64, signature] = parts;
  if (!jsonBase64 || !signature) return null;

  const expected = crypto.createHmac('sha256', CONFIG.SESSION_SECRET).update(jsonBase64).digest('base64url');
  if (signature.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(jsonBase64, 'base64url').toString('utf8')) as StatelessSessionPayload;
    if (!parsed?.userId || !parsed?.username || !['ADMIN', 'GURU'].includes(parsed.role) || !parsed.expiresAt) return null;
    if (Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions(req?: Request): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  partitioned: boolean;
  path: string;
  maxAge: number;
} {
  const isHttps = !!(req && (req.secure || req.headers['x-forwarded-proto'] === 'https' || req.headers['x-forwarded-ssl'] === 'on'));
  const isProd = CONFIG.NODE_ENV === 'production';
  if (isProd) {
    return { httpOnly: true, secure: true, sameSite: 'strict', partitioned: false, path: '/', maxAge: CONFIG.SESSION_TTL_SECONDS * 1000 };
  }
  if (isHttps) {
    // AI Studio/preview may be embedded cross-site. Production never uses this relaxed mode.
    return { httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/', maxAge: CONFIG.SESSION_TTL_SECONDS * 1000 };
  }
  return { httpOnly: true, secure: false, sameSite: 'lax', partitioned: false, path: '/', maxAge: CONFIG.SESSION_TTL_SECONDS * 1000 };
}

interface RateLimitBucket { count: number; resetTime: number; }
const rateLimitStore = new Map<string, RateLimitBucket>();

export function createRateLimiter(options: { max: number; windowMs: number; message: string; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const forwarded = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '';
    const ip = (CONFIG.TRUST_PROXY && forwarded) || req.socket.remoteAddress || '127.0.0.1';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = rateLimitStore.get(key);
    if (!bucket || now > bucket.resetTime) {
      bucket = { count: 1, resetTime: now + options.windowMs };
      rateLimitStore.set(key, bucket);
    } else bucket.count += 1;

    if (rateLimitStore.size > 5000) {
      for (const [k, b] of rateLimitStore.entries()) if (now > b.resetTime) rateLimitStore.delete(k);
    }
    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: `${options.message} Silakan coba lagi dalam ${retryAfter} detik.` } });
    }
    next();
  };
}

export const loginRateLimiter = createRateLimiter({ max: 6, windowMs: 60_000, message: 'Terlalu banyak percobaan login.', keyPrefix: 'login' });
export const mutationRateLimiter = createRateLimiter({ max: 60, windowMs: 60_000, message: 'Terlalu banyak permintaan perubahan data.', keyPrefix: 'mutation' });
export const syncRateLimiter = createRateLimiter({ max: 15, windowMs: 60_000, message: 'Sinkronisasi terlalu sering.', keyPrefix: 'sync' });

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  if (CONFIG.NODE_ENV === 'production') {
    res.setHeader('X-Frame-Options', 'DENY');

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
        "frame-ancestors 'none'"
      ].join('; ')
    );

    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  } else {
    // AI Studio preview runs the app inside an iframe.
    // Do NOT set X-Frame-Options in preview/development.
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
        "frame-ancestors 'self' https://aistudio.google.com https://*.googleusercontent.com"
      ].join('; ')
    );
  }

  if (req.path.startsWith('/api/')) {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
}

export function sameOriginProtection(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!origin) return next();
  try {
    const originUrl = new URL(origin);
    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const isLocal = ['localhost', '127.0.0.1'].includes(originUrl.hostname);
    const isExactHost = !!rawHost && (originUrl.host === rawHost || originUrl.hostname === rawHost);
    const isKnownDomain = originUrl.hostname.endsWith('.vercel.app') ||
      originUrl.hostname.endsWith('.run.app') ||
      originUrl.hostname.endsWith('.ai.studio') ||
      originUrl.hostname.endsWith('.googleusercontent.com');

    if (CONFIG.APP_ORIGIN) {
      try {
        const appOriginUrl = new URL(CONFIG.APP_ORIGIN);
        if (originUrl.origin === appOriginUrl.origin || originUrl.host === appOriginUrl.host) {
          return next();
        }
      } catch {}
    }

    if (isLocal || isExactHost || isKnownDomain) {
      return next();
    }

    return res.status(403).json({ success: false, error: { code: 'CSRF_BLOCKED', message: 'Origin request tidak diizinkan.' } });
  } catch {
    return res.status(403).json({ success: false, error: { code: 'CSRF_BLOCKED', message: 'Header origin tidak valid.' } });
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
  });
  return list;
}

export function validateAcademicYear(value: unknown): string {
  const clean = sanitizeText(value, 20);
  if (!isValidAcademicYear(clean)) throw new Error('INVALID_ACADEMIC_YEAR: Tahun pelajaran harus berformat YYYY/YYYY, contoh 2026/2027.');
  return clean;
}

export function validateClassName(value: unknown): string {
  const clean = sanitizeText(value, 30);
  if (!clean || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,29}$/.test(clean)) throw new Error('INVALID_CLASS_ID: Nama/ID kelas tidak valid.');
  return clean;
}

export function validateNisn(nisn: unknown): { valid: boolean; error?: string; cleanNisn: string } {
  if (!nisn) return { valid: false, error: 'NISN wajib diisi.', cleanNisn: '' };
  const clean = String(nisn).trim();
  if (!/^\d{10}$/.test(clean)) return { valid: false, error: 'NISN harus berupa tepat 10 digit angka (0-9).', cleanNisn: clean };
  return { valid: true, cleanNisn: clean };
}

export function validateFinancialAmount(amount: unknown, min = 1000, max?: number): { valid: boolean; error?: string; numAmount: number } {
  const effectiveMax = max || CONFIG.MAX_TRANSACTION_AMOUNT;
  if (amount === undefined || amount === null || amount === '') return { valid: false, error: 'Nominal transaksi wajib diisi.', numAmount: 0 };
  const num = Number(amount);
  if (!Number.isFinite(num)) return { valid: false, error: 'Nominal transaksi harus berupa angka valid.', numAmount: 0 };
  if (!Number.isInteger(num)) return { valid: false, error: 'Nominal transaksi harus berupa bilangan bulat Rupiah (tanpa desimal).', numAmount: 0 };
  if (num <= 0) return { valid: false, error: 'Nominal transaksi harus lebih besar dari Rp 0.', numAmount: 0 };
  if (num < min) return { valid: false, error: `Nominal transaksi minimal adalah Rp ${min.toLocaleString('id-ID')}.`, numAmount: 0 };
  if (num > effectiveMax) return { valid: false, error: `Nominal transaksi melebihi batas maksimal Rp ${effectiveMax.toLocaleString('id-ID')}.`, numAmount: 0 };
  return { valid: true, numAmount: num };
}

export function sanitizeText(text: unknown, maxLength = 300): string {
  if (text === undefined || text === null) return '';
  return String(text).trim().slice(0, maxLength).replace(/[<>]/g, '');
}

export function getJakartaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function validateTransactionDate(dateInput?: string): { valid: boolean; error?: string; cleanDate: string } {
  if (!dateInput || typeof dateInput !== 'string' || !dateInput.trim()) return { valid: true, cleanDate: getJakartaToday() };
  const clean = dateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return { valid: false, error: 'Format tanggal transaksi harus YYYY-MM-DD.', cleanDate: clean };
  const [y, m, d] = clean.split('-').map(Number);
  const testDate = new Date(Date.UTC(y, m - 1, d));
  if (testDate.getUTCFullYear() !== y || testDate.getUTCMonth() !== m - 1 || testDate.getUTCDate() !== d) return { valid: false, error: `Tanggal '${clean}' bukan tanggal kalender yang valid.`, cleanDate: clean };
  if (clean > getJakartaToday()) return { valid: false, error: `Tanggal transaksi (${clean}) tidak boleh di masa depan.`, cleanDate: clean };
  return { valid: true, cleanDate: clean };
}
