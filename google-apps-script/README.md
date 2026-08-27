# Google Apps Script v5

Backend GAS untuk model multi-role/multi-teacher:

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

Langkah singkat:

1. Backup spreadsheet.
2. Tempel `Code.gs` ke Apps Script bound ke spreadsheet.
3. Set Script Property `GAS_API_SECRET` sama dengan secret backend.
4. Run `setupDatabase()`.
5. Siapkan ACADEMIC_YEARS + USERS.
6. Untuk data lama run `migrateLegacyData()`.
7. Deploy Web App versi baru dan gunakan URL `/exec` sebagai `GAS_SCRIPT_URL`.

Lihat `INSTALLATION_AI_STUDIO_GAS.md` di root project untuk langkah lengkap.
