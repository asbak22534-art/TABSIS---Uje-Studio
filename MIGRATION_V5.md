# Migrasi ke v5 — Master Student + Enrollment + Class Section

## Tujuan

Mengubah struktur lama yang menempelkan `academic_year` dan `kelas` langsung pada siswa menjadi:

```text
STUDENTS (master permanen)
  ↓
STUDENT_ENROLLMENTS
  ↓
CLASS_SECTIONS
  ↓
ACADEMIC_YEARS
```

Tanpa menghapus transaksi lama.

## Aman untuk kelas/siswa berbeda setiap tahun?

Ya. NISN tetap satu master, sedangkan enrollment menentukan kelas siswa pada masing-masing tahun. Histori transaksi menyimpan snapshot section/tahun/kelas sehingga perpindahan tahun berikutnya tidak mengubah transaksi lama.

## Batasan migrasi legacy

Data lama yang tidak pernah menyimpan tahun/kelas pada transaksi tidak memiliki informasi historis yang cukup untuk direkonstruksi 100% otomatis. Migrasi menggunakan informasi legacy yang tersedia dan harus direview jika histori lintas tahun sudah ada.

## Urutan

1. Backup spreadsheet.
2. Update Code.gs.
3. Run `setupDatabase()`.
4. Pastikan ACADEMIC_YEARS memiliki tahun yang benar.
5. Run `migrateLegacyData()`.
6. Isi/cek USERS.password_hash bcrypt.
7. Review CLASS_SECTIONS dan STUDENT_ENROLLMENTS.
8. Review beberapa transaksi lama secara sampling.
9. Deploy GAS versi baru.
10. Login dan sinkronisasi aplikasi.

## Jangan lakukan

- Jangan menghapus STUDENTS/TRANSACTIONS lama sebelum verifikasi.
- Jangan menyimpan password plaintext di USERS.
- Jangan membuat dua class section ACTIVE dengan year+class yang sama.
- Jangan membuat dua enrollment ACTIVE untuk satu NISN pada tahun yang sama.
