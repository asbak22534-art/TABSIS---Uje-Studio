# Instalasi Lengkap — AI Studio + Google Apps Script

## A. Sebelum mulai

1. Buat salinan/backup Google Spreadsheet lama.
2. Jangan hapus `STUDENTS` atau `TRANSACTIONS` lama.
3. Pastikan Anda memakai ZIP v5 ini, bukan Code.gs dari versi sebelumnya.

---

## B. Upload project ke AI Studio

1. Upload ZIP project ke AI Studio.
2. Jika AI Studio meminta environment variables, isi:

### Preview / development

```text
NODE_ENV = development
SESSION_SECRET = random secret minimal 32 karakter, rekomendasi 64 hex
SESSION_TTL_SECONDS = 28800
GAS_SCRIPT_URL = URL Web App GAS /exec
GAS_API_SECRET = random secret minimal 32 karakter, rekomendasi 64 hex
MAX_TRANSACTION_AMOUNT = 10000000
CACHE_TTL_MS = 5000
TRUST_PROXY = false
APP_ORIGIN = http://localhost:3000
```

Catatan:
- `APP_ORIGIN=http://localhost:3000` hanya untuk preview/development.
- Production harus menggunakan domain HTTPS asli.
- Tidak perlu `ADMIN_ACADEMIC_YEARS`, `ADMIN_CLASS_IDS`, `ADMIN_USERNAME`, atau `ADMIN_PASSWORD`.

### Generate SESSION_SECRET

Di terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate sekali lagi untuk `GAS_API_SECRET`. Gunakan dua nilai yang berbeda.

---

## C. Pasang Code.gs baru

1. Buka spreadsheet tabungan.
2. Pilih **Extensions / Ekstensi → Apps Script**.
3. Backup Code.gs lama bila diperlukan.
4. Ganti seluruh isi `Code.gs` dengan file:

```text
google-apps-script/Code.gs
```

5. Save.
6. Buka **Project Settings → Script Properties**.
7. Tambahkan:

```text
GAS_API_SECRET = nilai yang sama dengan Secrets AI Studio
```

Jangan menaruh URL GAS sebagai GAS_API_SECRET.

---

## D. Setup struktur Google Sheets

Di Apps Script editor:

1. Pilih function `setupDatabase`.
2. Klik **Run**.
3. Izinkan permission Google jika diminta.

Script akan membuat/menambah struktur berikut tanpa menghapus data lama:

```text
USERS
ACADEMIC_YEARS
CLASS_SECTIONS
TEACHER_ASSIGNMENTS
STUDENTS
STUDENT_ENROLLMENTS
TRANSACTIONS
SETTINGS
```

Kolom legacy boleh tetap ada. Aplikasi v5 hanya membaca kolom canonical baru.

---

## E. Tahun pelajaran

### Jika `SETTINGS` lama sudah memiliki `academic_year`

`migrateLegacyData()` akan mencoba membuat `ACADEMIC_YEARS` otomatis.

### Jika tidak ada

Isi satu baris di `ACADEMIC_YEARS`:

| academic_year_id | name | status | is_active |
|---|---|---|---|
| AY-2026-2027 | 2026/2027 | ACTIVE | TRUE |

`created_at` / `updated_at` boleh dikosongkan untuk setup awal.

Gunakan hanya satu `is_active=TRUE` sebagai tahun default operasional.

---

## F. Siapkan akun pertama

`USERS` menggunakan bcrypt hash, bukan password plaintext.

### 1. Generate bcrypt hash

Di AI Studio terminal setelah dependency terpasang:

```bash
npm install
npm run hash-password -- "PASSWORD_ADMIN_ANDA"
```

Copy hasil `$2b$12$...`.

### 2. Isi USERS

Contoh struktur akun admin pertama:

| user_id | username | name | password_hash | role | status |
|---|---|---|---|---|---|
| USR-ADMIN-001 | adminsekolah | Administrator | `$2b$12$...` | ADMIN | ACTIVE |

Gunakan username/password Anda sendiri.

Jika `USERS` lama sudah berisi akun, `migrateLegacyData()` dapat mengisi `user_id`, `role`, dan metadata yang kosong, tetapi **tidak menggunakan password plaintext lama**. Anda tetap harus mengisi `password_hash` bcrypt.

Setelah migrasi, hapus/bersihkan kolom password plaintext lama jika ada.

---

## G. Migrasi siswa/transaksi lama

Setelah `ACADEMIC_YEARS` dan USERS siap:

1. Di Apps Script pilih function `migrateLegacyData`.
2. Klik **Run**.
3. Baca hasil execution log/return value bila perlu.

Migrasi akan:

- membuat `CLASS_SECTIONS` dari nilai kelas legacy pada STUDENTS;
- membuat `STUDENT_ENROLLMENTS`;
- mempertahankan master NISN siswa;
- mengisi snapshot section/tahun/kelas pada transaksi lama jika dapat diinfer;
- menyalin ID transaksi legacy ke `transaction_id` bila sebelumnya header bernama `id`;
- mencoba mengonversi `TEACHER_CLASSES` lama ke `TEACHER_ASSIGNMENTS` bila user dapat dicocokkan.

**Penting:** jika transaksi lama tidak pernah menyimpan tahun/kelas secara eksplisit, script hanya dapat melakukan inferensi dari data yang tersedia. Review histori legacy setelah migrasi sebelum mengandalkan laporan kelas lama.

---

## H. Menambah kelas baru

`CLASS_SECTIONS` adalah kombinasi satu tahun pelajaran + satu kelas.

Contoh:

| class_section_id | academic_year_id | class_name | status |
|---|---|---|---|
| SEC-2026-4C | AY-2026-2027 | 4C | ACTIVE |
| SEC-2026-5C | AY-2026-2027 | 5C | ACTIVE |
| SEC-2027-5C | AY-2027-2028 | 5C | ACTIVE |

Jangan membuat dua CLASS_SECTIONS ACTIVE dengan tahun dan nama kelas yang sama. GAS akan menolak konfigurasi duplikat.

ADMIN otomatis dapat mengakses seluruh CLASS_SECTIONS aktif.

---

## I. Menambah akun guru

1. Generate bcrypt hash password guru.
2. Tambahkan baris USERS:

```text
user_id = USR-GURU-001
username = guru4c
name = Nama Guru
password_hash = $2b$12$...
role = GURU
status = ACTIVE
```

3. Ambil `class_section_id` kelas yang diampu.
4. Tambahkan ke `TEACHER_ASSIGNMENTS`:

| assignment_id | user_id | class_section_id | status |
|---|---|---|---|
| ASN-001 | USR-GURU-001 | SEC-2026-4C | ACTIVE |
| ASN-002 | USR-GURU-001 | SEC-2026-5C | ACTIVE |

Satu guru boleh memiliki banyak kelas. Satu kelas juga boleh diberikan ke lebih dari satu guru bila diperlukan.

---

## J. Siswa pada tahun berbeda

Master `STUDENTS` hanya satu per NISN.

Kelas/tahun siswa dikelola oleh `STUDENT_ENROLLMENTS`.

Misalnya NISN yang sama:

```text
2026/2027 -> 4C
2027/2028 -> 5C
```

mempunyai dua enrollment, bukan dua master siswa.

Sistem menolak dua enrollment ACTIVE untuk NISN yang sama pada tahun pelajaran yang sama.

---

## K. Deploy Google Apps Script

1. **Deploy → Manage deployments**.
2. Buat deployment Web App baru / edit deployment aktif.
3. Execute as: **Me**.
4. Access: pilih opsi yang memungkinkan backend mengakses Web App (pada banyak setup: **Anyone**).
5. Deploy versi terbaru.
6. Copy URL yang berakhiran `/exec`.
7. Masukkan ke AI Studio Secrets:

```text
GAS_SCRIPT_URL = https://script.google.com/macros/s/.../exec
```

Bila Anda meng-update deployment yang sama, URL dapat tetap sama.

---

## L. Jalankan aplikasi

1. Restart/rebuild preview AI Studio setelah Secrets berubah.
2. Login menggunakan akun di USERS.
3. Tekan **Sinkronkan Data**.
4. ADMIN seharusnya melihat seluruh kelas aktif.
5. GURU hanya melihat assignment miliknya.
6. Coba ganti Tahun Pelajaran dan Kelas dari navbar.

---

## M. Test minimum sebelum produksi

- Password salah ditolak.
- User GURU tidak dapat membuka kelas yang tidak diassign.
- ADMIN dapat membuka semua section aktif.
- NISN yang sama dapat masuk tahun berbeda.
- NISN yang sama tidak dapat memiliki dua kelas ACTIVE pada tahun yang sama.
- Setoran berhasil dan saldo bertambah sekali.
- Double-submit UUID tidak menggandakan transaksi.
- Penarikan melebihi saldo ditolak.
- VOID yang membuat saldo negatif ditolak.
- GAS error membuat transaksi gagal, bukan tersimpan lokal.
- Logout membuat cookie sesi tidak valid.

---

## N. Production

Ubah environment:

```text
NODE_ENV = production
APP_ORIGIN = https://domain-aplikasi-anda
TRUST_PROXY = sesuai hosting
```

Production menggunakan cookie `HttpOnly + Secure + SameSite=Strict`.
