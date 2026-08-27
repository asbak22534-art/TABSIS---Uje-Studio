# Release Notes v5.0.0 — Multi Role / Multi Teacher / Multi Tahun

## Model final

- `USERS`: akun `ADMIN` dan `GURU` dengan bcrypt `password_hash`.
- `ACADEMIC_YEARS`: master tahun pelajaran dari Google Sheets, bukan Secrets.
- `CLASS_SECTIONS`: satu kelas pada satu tahun pelajaran.
- `TEACHER_ASSIGNMENTS`: relasi guru ke satu/banyak `CLASS_SECTIONS`.
- `STUDENTS`: master siswa permanen berdasarkan NISN.
- `STUDENT_ENROLLMENTS`: relasi siswa ke kelas/tahun tanpa menggandakan master siswa.
- `TRANSACTIONS`: ledger dengan snapshot section/tahun/kelas dan user pencatat.

## Keamanan & integritas

- Tidak ada mock siswa/transaksi dan tidak ada JSON database lokal.
- Session stateless HMAC melalui HttpOnly cookie; tidak ada token auth di localStorage/sessionStorage.
- Semua mutation finansial GAS-first dan menggunakan `LockService`.
- `transaction_id` baru menggunakan UUID v4 dan idempotency strict.
- NISN master immutable dari aplikasi.
- GURU hanya dapat membuka section yang ditugaskan; ADMIN dapat membuka semua section aktif.
- Enrollment tidak dapat dinonaktifkan selama saldo NISN belum Rp0 agar dana tidak tersembunyi dari daftar kelas.
- Migrasi legacy mempertahankan data lama dan memakai `academic_year`/`class_name` lama bila tersedia.

## Verifikasi release

- 24 file TS/TSX: 0 syntax/transpile diagnostics.
- Type consistency internal: lulus menggunakan TypeScript compiler dengan stub dependency eksternal.
- `Code.gs`: lulus `node --check`.
- Mock migrasi legacy: PASS.
- Mock ledger/idempotency/insufficient-balance/deactivation guard: PASS.
- Full `npm install && npm run build` belum dapat dijalankan di sandbox release karena registry npm timeout; jalankan di AI Studio setelah upload.
