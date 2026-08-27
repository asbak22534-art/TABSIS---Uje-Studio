# Tabungan Siswa v5 — Multi Role, Multi Teacher, Multi Tahun Pelajaran

Versi ini menggunakan Google Sheets + Google Apps Script sebagai persistent source-of-truth. Tidak ada mock siswa/transaksi dan tidak ada database JSON lokal.

## Model data yang dipakai

```text
USERS
  └─ role: ADMIN / GURU

ACADEMIC_YEARS
  └─ CLASS_SECTIONS          (contoh: 2026/2027 • 4C)
       ├─ TEACHER_ASSIGNMENTS
       └─ STUDENT_ENROLLMENTS
            └─ STUDENTS      (master siswa, satu NISN satu master)

TRANSACTIONS
  └─ menyimpan snapshot class_section_id + tahun + kelas + pencatat
```

### Kenapa `CLASS_SECTIONS`?

`4C` pada 2026/2027 berbeda secara data dari `4C` pada 2027/2028. Dengan satu `class_section_id`, assignment guru dan enrollment siswa tidak perlu mengirim pasangan tahun+kelas secara terpisah ke ledger.

### Siswa naik kelas

Siswa tidak diduplikasi di master `STUDENTS`. NISN yang sama memiliki enrollment berbeda per tahun:

```text
2026/2027 • 4C -> NISN 0123456789
2027/2028 • 5C -> NISN 0123456789
```

Sistem menolak dua enrollment ACTIVE untuk NISN yang sama pada tahun pelajaran yang sama. Perpindahan kelas pada tahun yang sama harus dibuat sebagai proses transfer khusus pada pengembangan berikutnya.

### Saldo

Saldo mengikuti NISN lintas tahun pelajaran. Histori aktivitas/laporan kelas tetap menggunakan snapshot kelas/tahun pada transaksi.

Jika kebijakan sekolah Anda ingin saldo reset per tahun pelajaran, ubah aturan ledger sebelum produksi.

## Role

- `ADMIN`: dapat mengakses seluruh `CLASS_SECTIONS` aktif dan mengubah pengaturan sekolah.
- `GURU`: hanya dapat mengakses `CLASS_SECTIONS` yang ada di `TEACHER_ASSIGNMENTS` miliknya.

Untuk versi ini master akun/tahun/kelas/assignment dikelola langsung melalui Google Sheets. Ini sengaja dipilih agar implementasi multi-role tetap sederhana, transparan, dan mudah diaudit. UI admin CRUD master data dapat ditambahkan nanti tanpa mengubah struktur ledger.

## Environment variables

Tidak ada tahun pelajaran, kelas, username admin, atau password di Secrets.

Gunakan:

```env
NODE_ENV=development
PORT=3000
APP_ORIGIN=
SESSION_SECRET=CHANGE_ME_RANDOM_64_HEX
SESSION_TTL_SECONDS=28800
GAS_SCRIPT_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GAS_API_SECRET=CHANGE_ME_RANDOM_64_HEX_DIFFERENT
MAX_TRANSACTION_AMOUNT=10000000
CACHE_TTL_MS=5000
TRUST_PROXY=false
```

`APP_ORIGIN` wajib HTTPS ketika `NODE_ENV=production`.

## Instalasi

Baca [INSTALLATION_AI_STUDIO_GAS.md](./INSTALLATION_AI_STUDIO_GAS.md).

## Migrasi data lama

Baca [MIGRATION_V5.md](./MIGRATION_V5.md). Script migrasi tidak menghapus sheet/kolom lama.

## Verifikasi lokal

```bash
npm install
npm run typecheck
npm run build
```

Untuk membuat bcrypt hash password:

```bash
npm run hash-password -- "PASSWORD_ANDA"
```

Password asli tidak boleh ditulis ke sheet; hanya hasil bcrypt yang dimasukkan ke `USERS.password_hash`.
