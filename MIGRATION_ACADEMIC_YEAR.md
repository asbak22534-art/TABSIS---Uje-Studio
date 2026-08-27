# Migrasi ke Tahun Pelajaran + Multi-Kelas

## Environment AI Studio

Gunakan tahun pelajaran, bukan kelas:

```env
ADMIN_ACADEMIC_YEARS=2026/2027,2027/2028
```

Jangan lagi membuat `ADMIN_CLASS_IDS`.

Nilai umum lain:

```env
CACHE_TTL_MS=5000
SESSION_TTL_SECONDS=28800
TRUST_PROXY=false
MAX_TRANSACTION_AMOUNT=10000000
```

`APP_ORIGIN` adalah origin aplikasi, bukan URL Apps Script. Untuk production isi domain aplikasi yang exact.

## Setelah project terbuka

1. Login.
2. Buka Pengaturan.
3. Pilih tahun pelajaran di navbar.
4. Tambahkan kelas yang diampu pada bagian **Tahun Pelajaran & Assignment Kelas**.
5. Jika data lama sudah memiliki nilai `kelas`, Code.gs akan membuat assignment tersebut otomatis saat sinkronisasi pertama.

## Google Sheets

Versi ini membuat/menambah:

- `STUDENTS.academic_year`
- `TRANSACTIONS.academic_year`
- sheet `TEACHER_CLASSES`

Tidak ada baris siswa/transaksi yang sengaja dihapus oleh migrasi.

### Legacy data

Jika baris lama belum memiliki `academic_year`, script memakai:

1. `SETTINGS.academic_year` jika formatnya valid dan termasuk `ADMIN_ACADEMIC_YEARS`; atau
2. tahun pertama dari `ADMIN_ACADEMIC_YEARS`.

Karena itu pastikan urutan `ADMIN_ACADEMIC_YEARS` menempatkan tahun legacy yang benar di posisi pertama bila `SETTINGS.academic_year` belum sesuai.

## Catatan saldo lintas tahun

Saldo siswa dihitung berdasarkan NISN dari seluruh transaksi aktif lintas tahun pelajaran. Artinya saldo dapat terbawa ketika siswa masuk enrollment tahun berikutnya, sementara laporan aktivitas kelas tetap terisolasi berdasarkan tahun pelajaran + kelas.
