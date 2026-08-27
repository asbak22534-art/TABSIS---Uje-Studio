/**
 * TABUNGAN SISWA - GOOGLE APPS SCRIPT BACKEND
 * Version 5.0.0 - Multi Role / Multi Teacher / Academic Year / Class Sections
 *
 * Required Script Property:
 *   GAS_API_SECRET = same random secret as application backend (>= 32 chars)
 *
 * Business model:
 * USERS -> TEACHER_ASSIGNMENTS -> CLASS_SECTIONS -> ACADEMIC_YEARS
 * STUDENTS -> STUDENT_ENROLLMENTS -> CLASS_SECTIONS
 * TRANSACTIONS keep immutable section/year/class snapshots.
 */

var SHEET_NAMES = {
  USERS: 'USERS',
  ACADEMIC_YEARS: 'ACADEMIC_YEARS',
  CLASS_SECTIONS: 'CLASS_SECTIONS',
  TEACHER_ASSIGNMENTS: 'TEACHER_ASSIGNMENTS',
  STUDENTS: 'STUDENTS',
  STUDENT_ENROLLMENTS: 'STUDENT_ENROLLMENTS',
  TRANSACTIONS: 'TRANSACTIONS',
  SETTINGS: 'SETTINGS'
};

var USER_HEADERS = ['user_id', 'username', 'name', 'password_hash', 'role', 'status', 'created_at', 'updated_at'];
var ACADEMIC_YEAR_HEADERS = ['academic_year_id', 'name', 'status', 'is_active', 'created_at', 'updated_at'];
var CLASS_SECTION_HEADERS = ['class_section_id', 'academic_year_id', 'class_name', 'status', 'created_at', 'updated_at'];
var TEACHER_ASSIGNMENT_HEADERS = ['assignment_id', 'user_id', 'class_section_id', 'status', 'created_at', 'updated_at'];
var STUDENT_HEADERS = ['nisn', 'nama', 'jenis_kelamin', 'no_hp_wali', 'status', 'created_at', 'updated_at'];
var ENROLLMENT_HEADERS = ['enrollment_id', 'nisn', 'class_section_id', 'status', 'created_at', 'updated_at'];
var TRANSACTION_HEADERS = [
  'transaction_id', 'enrollment_id', 'nisn', 'nama', 'class_section_id', 'academic_year', 'class_name',
  'transaction_type', 'amount', 'transaction_date', 'description',
  'created_by_user_id', 'created_by_name', 'created_at', 'updated_at', 'status', 'void_reason',
  'voided_by_user_id', 'voided_by_name', 'voided_at'
];
var SETTINGS_HEADERS = ['setting_key', 'setting_value'];

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Tabungan Siswa')
      .addItem('1. Setup / Perbaiki Struktur Sheet', 'setupDatabase')
      .addItem('2. Migrasi Data Lama', 'migrateLegacyData')
      .addToUi();
  } catch (e) {}
}

function doGet() {
  var secret = PropertiesService.getScriptProperties().getProperty('GAS_API_SECRET');
  return jsonOutput({
    status: 'online',
    service: 'Tabungan Siswa GAS Service',
    version: '5.0.0',
    security_configured: !!(secret && secret.length >= 32),
    time: formatDateTimeJakarta(new Date())
  });
}

function doPost(e) {
  var output = { success: false, data: null, error: null };
  try {
    if (!e || !e.postData || !e.postData.contents) throw apiError('EMPTY_BODY', 'Payload request kosong.');
    var payload = JSON.parse(e.postData.contents);
    var scriptSecret = PropertiesService.getScriptProperties().getProperty('GAS_API_SECRET');
    if (!scriptSecret || scriptSecret.length < 32) throw apiError('SECURITY_NOT_CONFIGURED', 'Atur GAS_API_SECRET minimal 32 karakter di Script Properties.');
    if (String(payload.secret || '') !== scriptSecret) throw apiError('UNAUTHORIZED', 'GAS_API_SECRET tidak valid.');
    assertDatabaseReady();
    var action = String(payload.action || '').trim();
    if (action === 'getAuthUser') {
      output.success = true;
      output.data = getAuthUser(payload.data || {});
      return jsonOutput(output);
    }
    var context = normalizeContext(payload.context || {});
    output.success = true;
    output.data = handleRequest(action, payload.data || {}, context);
  } catch (err) {
    output.error = { code: err.code || 'GAS_EXECUTION_ERROR', message: err.message || String(err) };
  }
  return jsonOutput(output);
}

function handleRequest(action, data, context) {
  switch (action) {
    case 'getAccessProfile': return getAccessProfile(context);
    case 'getScopeData': return getScopeData(context);
    case 'getSettings': return getSettingsData();
    case 'createStudentEnrollment': return createStudentEnrollment(data, context);
    case 'updateStudentMaster': return updateStudentMaster(data, context);
    case 'deactivateEnrollment': return deactivateEnrollment(data, context);
    case 'processTransaction': return processTransaction(data, context);
    case 'voidTransaction': return voidTransaction(data, context);
    case 'saveSettings': return saveSettings(data, context);
    case 'updateUserPasswordHash': return updateUserPasswordHash(data, context);
    default: throw apiError('UNKNOWN_ACTION', 'Aksi API tidak dikenali: ' + action);
  }
}

function assertDatabaseReady() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var missing = [];
  for (var key in SHEET_NAMES) if (!ss.getSheetByName(SHEET_NAMES[key])) missing.push(SHEET_NAMES[key]);
  if (missing.length) throw apiError('DATABASE_NOT_READY', 'Sheet belum siap: ' + missing.join(', ') + '. Jalankan setupDatabase() satu kali dari menu Tabungan Siswa.');
}

function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var users = getOrCreateSheet(ss, SHEET_NAMES.USERS, USER_HEADERS);
  var years = getOrCreateSheet(ss, SHEET_NAMES.ACADEMIC_YEARS, ACADEMIC_YEAR_HEADERS);
  var sections = getOrCreateSheet(ss, SHEET_NAMES.CLASS_SECTIONS, CLASS_SECTION_HEADERS);
  var assignments = getOrCreateSheet(ss, SHEET_NAMES.TEACHER_ASSIGNMENTS, TEACHER_ASSIGNMENT_HEADERS);
  var students = getOrCreateSheet(ss, SHEET_NAMES.STUDENTS, STUDENT_HEADERS);
  var enrollments = getOrCreateSheet(ss, SHEET_NAMES.STUDENT_ENROLLMENTS, ENROLLMENT_HEADERS);
  var transactions = getOrCreateSheet(ss, SHEET_NAMES.TRANSACTIONS, TRANSACTION_HEADERS);
  var settings = getOrCreateSheet(ss, SHEET_NAMES.SETTINGS, SETTINGS_HEADERS);
  ensureHeaders(users, USER_HEADERS); ensureHeaders(years, ACADEMIC_YEAR_HEADERS); ensureHeaders(sections, CLASS_SECTION_HEADERS);
  ensureHeaders(assignments, TEACHER_ASSIGNMENT_HEADERS); ensureHeaders(students, STUDENT_HEADERS); ensureHeaders(enrollments, ENROLLMENT_HEADERS);
  ensureHeaders(transactions, TRANSACTION_HEADERS); ensureHeaders(settings, SETTINGS_HEADERS);
  students.getRange('A:A').setNumberFormat('@'); enrollments.getRange('B:B').setNumberFormat('@'); transactions.getRange('C:C').setNumberFormat('@');
  return { success: true, message: 'Struktur database siap.' };
}

function normalizeContext(raw) {
  var userId = sanitizeText(raw.user_id, 100);
  if (!userId) throw apiError('USER_CONTEXT_MISSING', 'user_id tidak tersedia pada context.');
  var user = getUserById(userId);
  if (!user || user.status !== 'ACTIVE') throw apiError('USER_INACTIVE', 'Akun tidak ditemukan atau tidak aktif.');
  var suppliedRole = String(raw.role || '').toUpperCase();
  if (suppliedRole && suppliedRole !== user.role) throw apiError('ROLE_MISMATCH', 'Role session tidak sesuai data USERS.');
  var maxAmount = Number(raw.max_transaction_amount || 10000000);
  if (!isFinite(maxAmount) || maxAmount <= 0) maxAmount = 10000000;
  return {
    user_id: user.user_id,
    username: user.username,
    user_name: user.name,
    role: user.role,
    active_class_section_id: sanitizeText(raw.active_class_section_id, 100),
    max_transaction_amount: Math.floor(maxAmount)
  };
}

function getAuthUser(data) {
  var username = sanitizeText(data.username, 100).toLowerCase();
  var userId = sanitizeText(data.user_id, 100);
  if (!username && !userId) throw apiError('INVALID_IDENTIFIER', 'Username atau user_id wajib diisi.');
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) throw apiError('USERS_NOT_READY', 'Sheet USERS belum tersedia. Jalankan setupDatabase().');
  var h = ensureHeaders(sheet, USER_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), found = null;
  for (var i = 1; i < rows.length; i++) {
    var rowUserId = String(rows[i][idx.user_id] || '').trim();
    var rowUsername = String(rows[i][idx.username] || '').trim();
    if (userId && rowUserId !== userId) continue;
    if (username && rowUsername.toLowerCase() !== username) continue;
    if (found) throw apiError('DUPLICATE_USERNAME', 'Username atau ID duplikat ditemukan di sheet USERS. Perbaiki sebelum login.');
    var role = 'GURU';
    var status = String(rows[i][idx.status] || 'ACTIVE').toUpperCase();
    var hash = String(rows[i][idx.password_hash] || '').trim();
    if (!hash || hash.indexOf('$2') !== 0) throw apiError('PASSWORD_HASH_REQUIRED', 'Akun belum memiliki bcrypt password_hash yang valid.');
    found = {
      user_id: rowUserId,
      username: rowUsername,
      name: String(rows[i][idx.name] || rowUsername).trim(),
      password_hash: hash,
      role: role,
      status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      created_at: formatAnyDateTime(rows[i][idx.created_at]),
      updated_at: formatAnyDateTime(rows[i][idx.updated_at])
    };
  }
  if (!found) throw apiError('INVALID_CREDENTIALS', 'Pengguna tidak ditemukan atau kredensial salah.');
  if (!found.user_id) throw apiError('USER_ID_REQUIRED', 'user_id pada USERS wajib diisi. Jalankan migrasi atau isi manual.');
  return found;
}

function getUserById(userId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) return null;
  var h = ensureHeaders(sheet, USER_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idx.user_id] || '').trim() !== userId) continue;
    return {
      user_id: userId,
      username: String(rows[i][idx.username] || '').trim(),
      name: String(rows[i][idx.name] || '').trim(),
      role: 'GURU',
      status: String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
    };
  }
  return null;
}

function normalizeRole(value) {
  return 'GURU';
}

function updateUserPasswordHash(data, context) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var targetUserId = String(data.user_id || context.user_id || '').trim();
    if (!targetUserId) throw apiError('USER_ID_REQUIRED', 'user_id wajib diisi.');
    if (context.user_id && context.user_id !== targetUserId) {
      throw apiError('FORBIDDEN', 'Hanya dapat mengganti kata sandi akun Anda sendiri.');
    }
    var newHash = String(data.password_hash || '').trim();
    if (!newHash || newHash.indexOf('$2') !== 0) {
      throw apiError('INVALID_PASSWORD_HASH', 'Password hash tidak valid.');
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.USERS);
    if (!sheet) throw apiError('USERS_NOT_READY', 'Sheet USERS belum tersedia.');
    var h = ensureHeaders(sheet, USER_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), found = false;
    var now = formatDateTimeJakarta(new Date());
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idx.user_id] || '').trim() !== targetUserId) continue;
      sheet.getRange(i + 1, idx.password_hash + 1).setValue(newHash);
      sheet.getRange(i + 1, idx.updated_at + 1).setValue(now);
      found = true;
      break;
    }
    if (!found) throw apiError('USER_NOT_FOUND', 'User tidak ditemukan di sheet USERS.');
    SpreadsheetApp.flush();
    return { success: true, message: 'Password hash berhasil diperbarui.' };
  } finally {
    lock.releaseLock();
  }
}

function getAccessProfile(context) {
  var years = getAcademicYearsMap();
  var sections = getClassSectionsMap(years);
  var allowedSections = [], assignments = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.TEACHER_ASSIGNMENTS);
  if (sheet) {
    var h = ensureHeaders(sheet, TEACHER_ASSIGNMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idx.user_id] || '').trim() !== context.user_id) continue;
      if (String(rows[i][idx.status] || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
      var sectionId = String(rows[i][idx.class_section_id] || '').trim();
      if (!sections[sectionId] || sections[sectionId].status !== 'ACTIVE' || sections[sectionId].academic_year_status !== 'ACTIVE') continue;
      allowedSections.push(sections[sectionId]);
      assignments.push({
        assignment_id: String(rows[i][idx.assignment_id] || '').trim(),
        user_id: context.user_id,
        class_section_id: sectionId,
        status: 'ACTIVE',
        created_at: formatAnyDateTime(rows[i][idx.created_at]),
        updated_at: formatAnyDateTime(rows[i][idx.updated_at])
      });
    }
  }
  allowedSections.sort(function(a, b) {
    if (!!a.academic_year_is_active !== !!b.academic_year_is_active) return a.academic_year_is_active ? -1 : 1;
    var yearCompare = String(b.academic_year).localeCompare(String(a.academic_year));
    return yearCompare !== 0 ? yearCompare : String(a.class_name).localeCompare(String(b.class_name));
  });
  var academicYears = [], classesByYear = {};
  for (var s = 0; s < allowedSections.length; s++) {
    var sec = allowedSections[s], yearName = sec.academic_year;
    if (academicYears.indexOf(yearName) === -1) academicYears.push(yearName);
    if (!classesByYear[yearName]) classesByYear[yearName] = [];
    if (classesByYear[yearName].indexOf(sec.class_name) === -1) classesByYear[yearName].push(sec.class_name);
  }
  for (var y in classesByYear) classesByYear[y].sort();
  return {
    user_id: context.user_id,
    username: context.username,
    user_name: context.user_name,
    role: 'GURU',
    academic_years: academicYears,
    classes_by_year: classesByYear,
    class_sections: allowedSections,
    assignments: assignments
  };
}

function getAcademicYearsMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.ACADEMIC_YEARS);
  var h = ensureHeaders(sheet, ACADEMIC_YEAR_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), out = {};
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][idx.academic_year_id] || '').trim(), name = normalizeAcademicYearOrBlank(rows[i][idx.name]);
    if (!id || !name) continue;
    out[id] = {
      academic_year_id: id,
      name: name,
      status: String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      is_active: toBoolean(rows[i][idx.is_active]),
      created_at: formatAnyDateTime(rows[i][idx.created_at]),
      updated_at: formatAnyDateTime(rows[i][idx.updated_at])
    };
  }
  return out;
}

function getClassSectionsMap(years) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.CLASS_SECTIONS);
  var h = ensureHeaders(sheet, CLASS_SECTION_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), out = {}, activeScopeSeen = {};
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][idx.class_section_id] || '').trim(), yearId = String(rows[i][idx.academic_year_id] || '').trim(), className = sanitizeClass(rows[i][idx.class_name]);
    if (!id || !yearId || !className || !years[yearId]) continue;
    var status = String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    var scopeKey = yearId + '|' + className.toLowerCase();
    if (status === 'ACTIVE' && activeScopeSeen[scopeKey]) throw apiError('DUPLICATE_CLASS_SECTION', 'CLASS_SECTIONS memiliki kelas aktif duplikat pada tahun yang sama: ' + years[yearId].name + ' • ' + className);
    if (status === 'ACTIVE') activeScopeSeen[scopeKey] = id;
    out[id] = {
      class_section_id: id,
      academic_year_id: yearId,
      academic_year: years[yearId].name,
      class_name: className,
      status: status,
      academic_year_status: years[yearId].status,
      academic_year_is_active: !!years[yearId].is_active,
      created_at: formatAnyDateTime(rows[i][idx.created_at]),
      updated_at: formatAnyDateTime(rows[i][idx.updated_at])
    };
  }
  return out;
}

function assertSectionAccess(sectionId, context) {
  sectionId = sanitizeText(sectionId || context.active_class_section_id, 100);
  if (!sectionId) throw apiError('NO_CLASS_ASSIGNMENT', 'class_section_id belum dipilih.');
  var years = getAcademicYearsMap(), sections = getClassSectionsMap(years), section = sections[sectionId];
  if (!section || section.status !== 'ACTIVE' || section.academic_year_status !== 'ACTIVE') throw apiError('CLASS_SECTION_NOT_FOUND', 'Kelas/tahun pelajaran tidak aktif atau tidak ditemukan.');
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.TEACHER_ASSIGNMENTS);
  var h = ensureHeaders(sheet, TEACHER_ASSIGNMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idx.user_id] || '').trim() === context.user_id && String(rows[i][idx.class_section_id] || '').trim() === sectionId && String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'ACTIVE') return section;
  }
  throw apiError('CLASS_FORBIDDEN', 'Akun guru tidak ditugaskan ke kelas ini.');
}

function getScopeData(context) {
  var section = assertSectionAccess(context.active_class_section_id, context);
  var students = getStudentsForSection(section, context);
  var transactions = getTransactionsForSection(section);
  return { section: section, students: students, transactions: transactions, settings: getSettingsData() };
}

function getStudentsForSection(section, context) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var enrollmentSheet = ss.getSheetByName(SHEET_NAMES.STUDENT_ENROLLMENTS), eh = ensureHeaders(enrollmentSheet, ENROLLMENT_HEADERS), ei = headerIndexMap(eh), erows = enrollmentSheet.getDataRange().getValues();
  var studentSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS), sh = ensureHeaders(studentSheet, STUDENT_HEADERS), si = headerIndexMap(sh), srows = studentSheet.getDataRange().getValues();
  var master = {};
  for (var i = 1; i < srows.length; i++) {
    var nisn = normalizeNisnLoose(srows[i][si.nisn]); if (!nisn) continue;
    if (master[nisn]) throw apiError('DUPLICATE_NISN_MASTER', 'STUDENTS memiliki NISN duplikat: ' + nisn);
    master[nisn] = {
      nisn: nisn,
      nama: String(srows[i][si.nama] || '').trim(),
      jenis_kelamin: String(srows[i][si.jenis_kelamin] || 'L').toUpperCase() === 'P' ? 'P' : 'L',
      no_hp_wali: String(srows[i][si.no_hp_wali] || '').replace(/^'/, '').trim(),
      status: String(srows[i][si.status] || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      created_at: formatAnyDateTime(srows[i][si.created_at]), updated_at: formatAnyDateTime(srows[i][si.updated_at])
    };
  }
  var out = [], metricsMap = calculateAllStudentMetrics(ss), seenEnrollmentNisn = {};
  for (var e = 1; e < erows.length; e++) {
    if (String(erows[e][ei.class_section_id] || '').trim() !== section.class_section_id) continue;
    var enrollmentStatus = String(erows[e][ei.status] || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (enrollmentStatus !== 'ACTIVE') continue;
    var enNisn = normalizeNisnLoose(erows[e][ei.nisn]); if (!enNisn || !master[enNisn]) continue;
    if (seenEnrollmentNisn[enNisn]) throw apiError('DUPLICATE_ACTIVE_ENROLLMENT', 'Siswa memiliki enrollment ACTIVE duplikat pada CLASS_SECTION yang sama: ' + enNisn);
    seenEnrollmentNisn[enNisn] = true;
    var metrics = metricsMap[enNisn] || { balance: 0, totalDeposit: 0, totalWithdrawal: 0, transactionCount: 0 }, m = master[enNisn];
    out.push({
      student_id: enNisn,
      enrollment_id: String(erows[e][ei.enrollment_id] || '').trim(),
      class_section_id: section.class_section_id,
      nisn: enNisn,
      nama: m.nama,
      jenis_kelamin: m.jenis_kelamin,
      academic_year: section.academic_year,
      kelas: section.class_name,
      no_hp_wali: m.no_hp_wali,
      status: m.status,
      enrollment_status: enrollmentStatus,
      created_at: m.created_at,
      updated_at: m.updated_at,
      balance: metrics.balance,
      totalDeposit: metrics.totalDeposit,
      totalWithdrawal: metrics.totalWithdrawal,
      transactionCount: metrics.transactionCount
    });
  }
  out.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return out;
}

function getTransactionsForSection(section) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  var h = ensureHeaders(sheet, TRANSACTION_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), out = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idx.class_section_id] || '').trim() !== section.class_section_id) continue;
    out.push(transactionFromRow(rows[i], idx));
  }
  return out;
}

function createStudentEnrollment(data, context) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var section = assertSectionAccess(context.active_class_section_id, context);
    var nisn = validateNisn(data.nisn), nama = sanitizeText(data.nama, 100), jk = String(data.jenis_kelamin || 'L').toUpperCase() === 'P' ? 'P' : 'L', hp = sanitizeText(data.no_hp_wali, 30);
    if (!nama) throw apiError('INVALID_NAME', 'Nama siswa wajib diisi.');
    var ss = SpreadsheetApp.getActiveSpreadsheet(), studentSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS), sh = ensureHeaders(studentSheet, STUDENT_HEADERS), si = headerIndexMap(sh), srows = studentSheet.getDataRange().getValues();
    var masterFound = false, masterStatus = '', masterMatches = 0, now = formatDateTimeJakarta(new Date());
    for (var s = 1; s < srows.length; s++) {
      if (normalizeNisnLoose(srows[s][si.nisn]) !== nisn) continue;
      masterMatches++; masterFound = true; masterStatus = String(srows[s][si.status] || 'ACTIVE').toUpperCase();
    }
    if (masterMatches > 1) throw apiError('DUPLICATE_NISN_MASTER', 'STUDENTS memiliki NISN duplikat: ' + nisn);
    if (masterFound && masterStatus === 'INACTIVE') throw apiError('STUDENT_MASTER_INACTIVE', 'Master siswa berstatus INACTIVE. Aktifkan master siswa terlebih dahulu.');
    if (!masterFound) {
      appendObjectRow(studentSheet, sh, { nisn: "'" + nisn, nama: nama, jenis_kelamin: jk, no_hp_wali: "'" + hp, status: 'ACTIVE', created_at: now, updated_at: now });
      studentSheet.getRange(studentSheet.getLastRow(), si.nisn + 1).setNumberFormat('@');
    }

    var enrollSheet = ss.getSheetByName(SHEET_NAMES.STUDENT_ENROLLMENTS), eh = ensureHeaders(enrollSheet, ENROLLMENT_HEADERS), ei = headerIndexMap(eh), erows = enrollSheet.getDataRange().getValues();
    var sections = getClassSectionsMap(getAcademicYearsMap());
    for (var e = 1; e < erows.length; e++) {
      if (normalizeNisnLoose(erows[e][ei.nisn]) !== nisn || String(erows[e][ei.status] || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
      var existingSectionId = String(erows[e][ei.class_section_id] || '').trim(), existingSection = sections[existingSectionId];
      if (!existingSection || existingSection.academic_year_id !== section.academic_year_id) continue;
      if (existingSectionId === section.class_section_id) throw apiError('DUPLICATE_ENROLLMENT', 'Siswa sudah terdaftar di kelas ini.');
      throw apiError('ENROLLMENT_EXISTS_THIS_YEAR', 'Siswa sudah memiliki kelas aktif pada tahun pelajaran ini. Gunakan proses pindah kelas, bukan membuat enrollment kedua.');
    }
    var enrollmentId = Utilities.getUuid();
    appendObjectRow(enrollSheet, eh, { enrollment_id: enrollmentId, nisn: "'" + nisn, class_section_id: section.class_section_id, status: 'ACTIVE', created_at: now, updated_at: now });
    enrollSheet.getRange(enrollSheet.getLastRow(), ei.nisn + 1).setNumberFormat('@');
    SpreadsheetApp.flush();
    var list = getStudentsForSection(section, context);
    for (var x = 0; x < list.length; x++) if (list[x].nisn === nisn) return list[x];
    throw apiError('ENROLLMENT_CREATE_FAILED', 'Enrollment tersimpan tetapi gagal dibaca kembali.');
  } finally { lock.releaseLock(); }
}

function updateStudentMaster(data, context) {
  var section = assertSectionAccess(context.active_class_section_id, context), nisn = validateNisn(data.nisn);
  assertActiveEnrollment(nisn, section.class_section_id);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.STUDENTS), h = ensureHeaders(sheet, STUDENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
  var nama = sanitizeText(data.nama, 100), jk = String(data.jenis_kelamin || 'L').toUpperCase() === 'P' ? 'P' : 'L', hp = sanitizeText(data.no_hp_wali, 30), now = formatDateTimeJakarta(new Date()), found = false;
  if (!nama) throw apiError('INVALID_NAME', 'Nama siswa wajib diisi.');
  for (var i = 1; i < rows.length; i++) {
    if (normalizeNisnLoose(rows[i][idx.nisn]) !== nisn) continue;
    sheet.getRange(i + 1, idx.nama + 1).setValue(nama); sheet.getRange(i + 1, idx.jenis_kelamin + 1).setValue(jk); sheet.getRange(i + 1, idx.no_hp_wali + 1).setValue("'" + hp); sheet.getRange(i + 1, idx.updated_at + 1).setValue(now); found = true;
  }
  if (!found) throw apiError('STUDENT_NOT_FOUND', 'Master siswa tidak ditemukan.');
  SpreadsheetApp.flush();
  var list = getStudentsForSection(section, context); for (var x = 0; x < list.length; x++) if (list[x].nisn === nisn) return list[x];
  throw apiError('STUDENT_NOT_FOUND', 'Siswa tidak ditemukan setelah pembaruan.');
}

function deactivateEnrollment(data, context) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var section = assertSectionAccess(context.active_class_section_id, context), ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.STUDENT_ENROLLMENTS), h = ensureHeaders(sheet, ENROLLMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
    var enrollmentId = sanitizeText(data.enrollment_id, 100), nisn = normalizeNisnLoose(data.nisn), now = formatDateTimeJakarta(new Date());
    for (var i = 1; i < rows.length; i++) {
      var same = enrollmentId ? String(rows[i][idx.enrollment_id] || '').trim() === enrollmentId : normalizeNisnLoose(rows[i][idx.nisn]) === nisn;
      if (!same || String(rows[i][idx.class_section_id] || '').trim() !== section.class_section_id) continue;
      if (String(rows[i][idx.status] || 'ACTIVE').toUpperCase() !== 'ACTIVE') throw apiError('ENROLLMENT_NOT_ACTIVE', 'Enrollment siswa sudah tidak aktif.');
      var targetNisn = normalizeNisnLoose(rows[i][idx.nisn]);
      var metrics = calculateStudentMetrics(targetNisn, ss);
      if (metrics.balance !== 0) throw apiError('BALANCE_MUST_BE_ZERO', 'Enrollment tidak dapat dinonaktifkan selama saldo siswa belum Rp 0. Saldo saat ini: Rp ' + String(metrics.balance));
      sheet.getRange(i + 1, idx.status + 1).setValue('INACTIVE'); sheet.getRange(i + 1, idx.updated_at + 1).setValue(now); SpreadsheetApp.flush();
      return { enrollment_id: String(rows[i][idx.enrollment_id] || '').trim(), nisn: targetNisn, status: 'INACTIVE' };
    }
    throw apiError('ENROLLMENT_NOT_FOUND', 'Enrollment siswa tidak ditemukan.');
  } finally { lock.releaseLock(); }
}

function processTransaction(data, context) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var section = assertSectionAccess(context.active_class_section_id, context);
    var id = String(data.transaction_id || '').trim(); if (!isUuidV4(id)) throw apiError('INVALID_TRANSACTION_ID', 'transaction_id harus UUID v4.');
    var enrollmentId = sanitizeText(data.enrollment_id, 100), nisn = validateNisn(data.nisn), type = String(data.transaction_type || '').toUpperCase();
    if (type !== 'SETORAN' && type !== 'PENARIKAN') throw apiError('INVALID_TRANSACTION_TYPE', 'Jenis transaksi tidak valid.');
    var amount = Number(data.amount); if (!isFinite(amount) || Math.floor(amount) !== amount || amount <= 0 || amount > context.max_transaction_amount) throw apiError('INVALID_AMOUNT', 'Nominal transaksi tidak valid/melebihi batas.');
    var trxDate = normalizeBusinessDate(data.transaction_date);
    var enrollment = assertActiveEnrollment(nisn, section.class_section_id, enrollmentId), student = findStudentMaster(nisn);
    if (!student || student.status !== 'ACTIVE') throw apiError('STUDENT_NOT_ACTIVE', 'Siswa tidak aktif.');

    var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS), h = ensureHeaders(sheet, TRANSACTION_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
    for (var r = 1; r < rows.length; r++) {
      if (String(rows[r][idx.transaction_id] || '').trim() !== id) continue;
      var same = String(rows[r][idx.enrollment_id] || '').trim() === enrollment.enrollment_id && normalizeNisnLoose(rows[r][idx.nisn]) === nisn && String(rows[r][idx.class_section_id] || '').trim() === section.class_section_id && String(rows[r][idx.transaction_type] || '').toUpperCase() === type && parseMoney(rows[r][idx.amount]) === amount && normalizeBusinessDate(rows[r][idx.transaction_date]) === trxDate;
      if (!same || String(rows[r][idx.status] || '').toUpperCase() === 'VOID') throw apiError('IDEMPOTENCY_CONFLICT', 'transaction_id sudah dipakai untuk payload berbeda/VOID.');
      return { transaction: transactionFromRow(rows[r], idx), idempotent: true, newBalance: calculateStudentMetrics(nisn, ss).balance };
    }

    var current = calculateStudentMetrics(nisn, ss).balance;
    if (type === 'PENARIKAN' && current < amount) throw apiError('INSUFFICIENT_BALANCE', 'Saldo tidak mencukupi.');
    var now = formatDateTimeJakarta(new Date()), description = sanitizeText(data.description || (type === 'SETORAN' ? 'Setoran Tabungan' : 'Penarikan Tabungan'), 200);
    var obj = {
      transaction_id: id,
      enrollment_id: enrollment.enrollment_id,
      nisn: "'" + nisn,
      nama: student.nama,
      class_section_id: section.class_section_id,
      academic_year: section.academic_year,
      class_name: section.class_name,
      transaction_type: type,
      amount: amount,
      transaction_date: trxDate,
      description: description,
      created_by_user_id: context.user_id,
      created_by_name: context.user_name,
      created_at: now,
      updated_at: now,
      status: 'ACTIVE',
      void_reason: '', voided_by_user_id: '', voided_by_name: '', voided_at: ''
    };
    appendObjectRow(sheet, h, obj); sheet.getRange(sheet.getLastRow(), idx.nisn + 1).setNumberFormat('@'); SpreadsheetApp.flush();
    var newBalance = type === 'SETORAN' ? current + amount : current - amount;
    return { transaction: transactionFromObject(obj), idempotent: false, newBalance: newBalance };
  } finally { lock.releaseLock(); }
}

function voidTransaction(data, context) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var id = String(data.transaction_id || '').trim(), ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS), h = ensureHeaders(sheet, TRANSACTION_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), rowNum = -1, target = null;
    for (var i = 1; i < rows.length; i++) if (String(rows[i][idx.transaction_id] || '').trim() === id) { rowNum = i + 1; target = rows[i]; break; }
    if (!target) throw apiError('TRANSACTION_NOT_FOUND', 'Transaksi tidak ditemukan.');
    var sectionId = String(target[idx.class_section_id] || '').trim(); assertSectionAccess(sectionId, context);
    if (context.active_class_section_id && context.active_class_section_id !== sectionId) throw apiError('CLASS_SCOPE_MISMATCH', 'Transaksi berada di kelas lain.');
    if (String(target[idx.status] || '').toUpperCase() === 'VOID') throw apiError('ALREADY_VOID', 'Transaksi sudah VOID.');
    var nisn = normalizeNisnLoose(target[idx.nisn]), amount = parseMoney(target[idx.amount]), type = String(target[idx.transaction_type] || '').toUpperCase(), current = calculateStudentMetrics(nisn, ss).balance, after = current;
    if (type === 'SETORAN') after -= amount; else if (type === 'PENARIKAN') after += amount;
    if (after < 0) throw apiError('VOID_NEGATIVE_BALANCE', 'VOID ditolak karena menyebabkan saldo negatif.');
    var reason = sanitizeText(data.void_reason || 'Dibatalkan', 250), now = formatDateTimeJakarta(new Date());
    sheet.getRange(rowNum, idx.status + 1).setValue('VOID'); sheet.getRange(rowNum, idx.void_reason + 1).setValue(reason); sheet.getRange(rowNum, idx.voided_by_user_id + 1).setValue(context.user_id); sheet.getRange(rowNum, idx.voided_by_name + 1).setValue(context.user_name); sheet.getRange(rowNum, idx.voided_at + 1).setValue(now); sheet.getRange(rowNum, idx.updated_at + 1).setValue(now); SpreadsheetApp.flush();
    var updated = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    return { transaction: transactionFromRow(updated, idx), newBalance: after };
  } finally { lock.releaseLock(); }
}

function assertActiveEnrollment(nisn, sectionId, enrollmentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.STUDENT_ENROLLMENTS), h = ensureHeaders(sheet, ENROLLMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
  var sections = getClassSectionsMap(getAcademicYearsMap()), targetSection = sections[sectionId];
  if (!targetSection) throw apiError('CLASS_SECTION_NOT_FOUND', 'Class section enrollment tidak ditemukan.');
  var found = null, activeSameYear = 0;
  for (var i = 1; i < rows.length; i++) {
    if (normalizeNisnLoose(rows[i][idx.nisn]) !== nisn) continue;
    if (String(rows[i][idx.status] || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
    var rowSectionId = String(rows[i][idx.class_section_id] || '').trim(), rowSection = sections[rowSectionId];
    if (rowSection && rowSection.academic_year_id === targetSection.academic_year_id) activeSameYear++;
    if (rowSectionId !== sectionId) continue;
    var id = String(rows[i][idx.enrollment_id] || '').trim(); if (enrollmentId && id !== enrollmentId) continue;
    if (found) throw apiError('DUPLICATE_ACTIVE_ENROLLMENT', 'Enrollment ACTIVE duplikat ditemukan untuk siswa pada kelas ini.');
    found = { enrollment_id: id, nisn: nisn, class_section_id: sectionId };
  }
  if (activeSameYear > 1) throw apiError('ENROLLMENT_CONFLICT', 'Siswa memiliki lebih dari satu enrollment ACTIVE pada tahun pelajaran yang sama. Perbaiki STUDENT_ENROLLMENTS.');
  if (found) return found;
  throw apiError('ENROLLMENT_NOT_ACTIVE', 'Siswa tidak memiliki enrollment aktif pada kelas ini.');
}

function findStudentMaster(nisn) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.STUDENTS), h = ensureHeaders(sheet, STUDENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (normalizeNisnLoose(rows[i][idx.nisn]) === nisn) return { nisn: nisn, nama: String(rows[i][idx.nama] || '').trim(), jenis_kelamin: String(rows[i][idx.jenis_kelamin] || 'L').toUpperCase(), no_hp_wali: String(rows[i][idx.no_hp_wali] || '').replace(/^'/, '').trim(), status: String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' };
  return null;
}

function calculateAllStudentMetrics(ss) {
  var out = {}, sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  if (!sheet) return out;
  var h = ensureHeaders(sheet, TRANSACTION_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'VOID') continue;
    var nisn = normalizeNisnLoose(rows[i][idx.nisn]); if (!nisn) continue;
    var amount = parseMoney(rows[i][idx.amount]), type = String(rows[i][idx.transaction_type] || '').toUpperCase();
    if (!out[nisn]) out[nisn] = { balance: 0, totalDeposit: 0, totalWithdrawal: 0, transactionCount: 0 };
    if (type === 'SETORAN') { out[nisn].totalDeposit += amount; out[nisn].balance += amount; }
    else if (type === 'PENARIKAN') { out[nisn].totalWithdrawal += amount; out[nisn].balance -= amount; }
    else continue;
    out[nisn].transactionCount++;
  }
  return out;
}

function calculateStudentMetrics(nisn, ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS); if (!sheet) return { balance: 0, totalDeposit: 0, totalWithdrawal: 0, transactionCount: 0 };
  var h = ensureHeaders(sheet, TRANSACTION_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), dep = 0, wit = 0, count = 0;
  for (var i = 1; i < rows.length; i++) {
    if (normalizeNisnLoose(rows[i][idx.nisn]) !== nisn || String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'VOID') continue;
    var amount = parseMoney(rows[i][idx.amount]), type = String(rows[i][idx.transaction_type] || '').toUpperCase();
    if (type === 'SETORAN') dep += amount; else if (type === 'PENARIKAN') wit += amount; else continue;
    count++;
  }
  return { balance: dep - wit, totalDeposit: dep, totalWithdrawal: wit, transactionCount: count };
}

function saveSettings(data, context) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS), allowed = ['school_name', 'minimum_deposit', 'maximum_deposit', 'maximum_withdrawal'];
  for (var i = 0; i < allowed.length; i++) if (data[allowed[i]] !== undefined && data[allowed[i]] !== null) upsertSetting(sheet, allowed[i], String(data[allowed[i]]));
  return getSettingsData();
}

function getSettingsData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS), out = {}; if (!sheet) return out;
  var rows = sheet.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) { var k = String(rows[i][0] || '').trim(); if (k) out[k] = String(rows[i][1] || '').trim(); } return out;
}

/**
 * Non-destructive migration helper for the previous schema.
 * Requirements before running:
 * 1) ACADEMIC_YEARS has at least one ACTIVE row.
 * 2) Existing STUDENTS rows contain legacy `kelas` if enrollment must be inferred.
 * Existing columns are never deleted.
 */
function migrateLegacyData() {
  setupDatabase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  migrateLegacyUsers();
  var years = getAcademicYearsMap(), activeYear = null;
  var hasYear = false; for (var existingYearId in years) { hasYear = true; break; }
  if (!hasYear) {
    var legacySettings = getSettingsData(), legacyYearName = normalizeAcademicYearOrBlank(legacySettings.academic_year || legacySettings.tahun_pelajaran || '');
    if (legacyYearName) {
      var yearSheet = ss.getSheetByName(SHEET_NAMES.ACADEMIC_YEARS), yh = ensureHeaders(yearSheet, ACADEMIC_YEAR_HEADERS), nowYear = formatDateTimeJakarta(new Date());
      var generatedYearId = 'AY-' + legacyYearName.replace('/', '-');
      appendObjectRow(yearSheet, yh, { academic_year_id: generatedYearId, name: legacyYearName, status: 'ACTIVE', is_active: true, created_at: nowYear, updated_at: nowYear });
      years = getAcademicYearsMap();
    }
  }
  for (var yid in years) if (years[yid].status === 'ACTIVE' && years[yid].is_active) { activeYear = years[yid]; break; }
  if (!activeYear) for (var yid2 in years) if (years[yid2].status === 'ACTIVE') { activeYear = years[yid2]; break; }
  if (!activeYear) throw new Error('ACADEMIC_YEARS masih kosong. Isi satu tahun aktif, contoh AY-2026-2027 | 2026/2027 | ACTIVE | TRUE, lalu jalankan migrasi lagi.');

  var studentSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS), sh = ensureHeaders(studentSheet, STUDENT_HEADERS), si = headerIndexMap(sh), srows = studentSheet.getDataRange().getValues();
  var legacyKelasIdx = findHeaderIndex(sh, ['kelas', 'class_name', 'class', 'class_id']);
  var legacyYearIdx = findHeaderIndex(sh, ['academic_year', 'tahun_pelajaran', 'tahun_ajaran']);
  var enrollmentSheet = ss.getSheetByName(SHEET_NAMES.STUDENT_ENROLLMENTS), eh = ensureHeaders(enrollmentSheet, ENROLLMENT_HEADERS);
  var migratedEnrollments = 0, createdSections = 0;
  var sectionCache = getClassSectionsMap(years);

  for (var i = 1; i < srows.length; i++) {
    var nisn = normalizeNisnLoose(srows[i][si.nisn]); if (!nisn) continue;
    var legacyClass = legacyKelasIdx >= 0 ? sanitizeClass(srows[i][legacyKelasIdx]) : '';
    if (!legacyClass) continue;
    var year = activeYear;
    if (legacyYearIdx >= 0) {
      var legacyYearName = normalizeAcademicYearOrBlank(srows[i][legacyYearIdx]);
      if (legacyYearName) { for (var yy in years) if (years[yy].name === legacyYearName) { year = years[yy]; break; } }
    }
    var section = findSectionByYearAndClass(sectionCache, year.academic_year_id, legacyClass);
    if (!section) { section = createClassSection(year.academic_year_id, legacyClass); sectionCache[section.class_section_id] = section; createdSections++; }
    if (!enrollmentExists(enrollmentSheet, nisn, section.class_section_id)) {
      var now = formatDateTimeJakarta(new Date()); appendObjectRow(enrollmentSheet, eh, { enrollment_id: Utilities.getUuid(), nisn: "'" + nisn, class_section_id: section.class_section_id, status: 'ACTIVE', created_at: now, updated_at: now }); migratedEnrollments++;
    }
  }

  // Migrate legacy transactions to section snapshots without changing old values.
  var trxSheet = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS), th = ensureHeaders(trxSheet, TRANSACTION_HEADERS), ti = headerIndexMap(th), trows = trxSheet.getDataRange().getValues();
  var legacyTrxIdIdx = findHeaderIndex(th, ['id', 'trx_id']);
  var legacyTrxKelasIdx = findHeaderIndex(th, ['class_name', 'kelas', 'class']);
  var legacyTrxYearIdx = findHeaderIndex(th, ['academic_year', 'tahun_pelajaran', 'tahun_ajaran']);
  var legacyCreatedByIdx = findHeaderIndex(th, ['created_by', 'creator', 'user_name']);
  var migratedTransactions = 0;
  for (var t = 1; t < trows.length; t++) {
    if (!String(trows[t][ti.transaction_id] || '').trim() && legacyTrxIdIdx >= 0) {
      var legacyId = String(trows[t][legacyTrxIdIdx] || '').trim();
      if (legacyId) trxSheet.getRange(t + 1, ti.transaction_id + 1).setValue(legacyId);
    }
    if (String(trows[t][ti.class_section_id] || '').trim()) continue;
    var tn = normalizeNisnLoose(trows[t][ti.nisn]); if (!tn) continue;
    var seedEnrollment = findAnyActiveEnrollmentForNisn(tn, enrollmentSheet, sectionCache, activeYear.academic_year_id);
    if (!seedEnrollment) continue;
    var targetSection = sectionCache[seedEnrollment.class_section_id], targetYear = years[targetSection.academic_year_id], targetClass = targetSection.class_name;
    if (legacyTrxYearIdx >= 0) {
      var ty = normalizeAcademicYearOrBlank(trows[t][legacyTrxYearIdx]);
      if (ty) for (var yk in years) if (years[yk].name === ty) { targetYear = years[yk]; break; }
    }
    if (legacyTrxKelasIdx >= 0) { var tc = sanitizeClass(trows[t][legacyTrxKelasIdx]); if (tc) targetClass = tc; }
    var matchedSection = findSectionByYearAndClass(sectionCache, targetYear.academic_year_id, targetClass);
    if (!matchedSection) { matchedSection = createClassSection(targetYear.academic_year_id, targetClass); sectionCache[matchedSection.class_section_id] = matchedSection; createdSections++; }
    targetSection = matchedSection;
    var targetEnrollment = findEnrollmentForNisnAndSection(enrollmentSheet, tn, targetSection.class_section_id);
    if (!targetEnrollment) {
      var legacyEnrollmentNow = formatDateTimeJakarta(new Date());
      targetEnrollment = { enrollment_id: Utilities.getUuid(), class_section_id: targetSection.class_section_id };
      appendObjectRow(enrollmentSheet, eh, { enrollment_id: targetEnrollment.enrollment_id, nisn: "'" + tn, class_section_id: targetSection.class_section_id, status: 'INACTIVE', created_at: legacyEnrollmentNow, updated_at: legacyEnrollmentNow });
      migratedEnrollments++;
    }
    trxSheet.getRange(t + 1, ti.enrollment_id + 1).setValue(targetEnrollment.enrollment_id);
    trxSheet.getRange(t + 1, ti.class_section_id + 1).setValue(targetSection.class_section_id);
    trxSheet.getRange(t + 1, ti.academic_year + 1).setValue(targetSection.academic_year);
    trxSheet.getRange(t + 1, ti.class_name + 1).setValue(targetSection.class_name);
    if (!String(trows[t][ti.created_by_user_id] || '').trim()) trxSheet.getRange(t + 1, ti.created_by_user_id + 1).setValue('LEGACY');
    if (!String(trows[t][ti.created_by_name] || '').trim()) trxSheet.getRange(t + 1, ti.created_by_name + 1).setValue(legacyCreatedByIdx >= 0 ? String(trows[t][legacyCreatedByIdx] || 'Legacy').trim() : 'Legacy');
    migratedTransactions++;
  }

  // Optional migration from old TEACHER_CLASSES if it exists.
  var oldAssignments = ss.getSheetByName('TEACHER_CLASSES'), newAssignments = ss.getSheetByName(SHEET_NAMES.TEACHER_ASSIGNMENTS), ah = ensureHeaders(newAssignments, TEACHER_ASSIGNMENT_HEADERS);
  var migratedAssignments = 0;
  if (oldAssignments) {
    var oh = oldAssignments.getRange(1, 1, 1, oldAssignments.getLastColumn()).getValues()[0].map(function(v) { return String(v || '').trim(); });
    var oi = headerIndexMap(oh), orows = oldAssignments.getDataRange().getValues();
    for (var a = 1; a < orows.length; a++) {
      if (String(orows[a][oi.status] || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
      var teacherKey = String(orows[a][oi.teacher_id] || '').trim(), oldYear = normalizeAcademicYearOrBlank(orows[a][oi.academic_year]), oldClass = sanitizeClass(orows[a][oi.class_id]);
      if (!teacherKey || !oldYear || !oldClass) continue;
      var user = findUserByIdOrUsername(teacherKey); if (!user) continue;
      var target = null; for (var cs in sectionCache) if (sectionCache[cs].academic_year === oldYear && sectionCache[cs].class_name === oldClass) { target = sectionCache[cs]; break; }
      if (!target || teacherAssignmentExists(newAssignments, user.user_id, target.class_section_id)) continue;
      var now2 = formatDateTimeJakarta(new Date()); appendObjectRow(newAssignments, ah, { assignment_id: Utilities.getUuid(), user_id: user.user_id, class_section_id: target.class_section_id, status: 'ACTIVE', created_at: now2, updated_at: now2 }); migratedAssignments++;
    }
  }
  SpreadsheetApp.flush();
  return { migrated_enrollments: migratedEnrollments, created_class_sections: createdSections, migrated_transactions: migratedTransactions, migrated_teacher_assignments: migratedAssignments };
}

function migrateLegacyUsers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) return;
  var h = ensureHeaders(sheet, USER_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), now = formatDateTimeJakarta(new Date());
  for (var i = 1; i < rows.length; i++) {
    var username = String(rows[i][idx.username] || '').trim(); if (!username) continue;
    if (!String(rows[i][idx.user_id] || '').trim()) sheet.getRange(i + 1, idx.user_id + 1).setValue('USR-' + Utilities.getUuid());
    if (!String(rows[i][idx.name] || '').trim()) sheet.getRange(i + 1, idx.name + 1).setValue(username);
    if (!String(rows[i][idx.status] || '').trim()) sheet.getRange(i + 1, idx.status + 1).setValue('ACTIVE');
    sheet.getRange(i + 1, idx.role + 1).setValue('GURU');
    if (!String(rows[i][idx.created_at] || '').trim()) sheet.getRange(i + 1, idx.created_at + 1).setValue(now);
    sheet.getRange(i + 1, idx.updated_at + 1).setValue(now);
  }
  SpreadsheetApp.flush();
}

function createClassSection(academicYearId, className) {
  var years = getAcademicYearsMap(), year = years[academicYearId]; if (!year) throw new Error('Academic year tidak ditemukan: ' + academicYearId);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.CLASS_SECTIONS), h = ensureHeaders(sheet, CLASS_SECTION_HEADERS), now = formatDateTimeJakarta(new Date());
  var id = 'SEC-' + academicYearId.replace(/[^A-Za-z0-9]/g, '').slice(-12) + '-' + sanitizeClass(className).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  var sections = getClassSectionsMap(years), suffix = 1, candidate = id; while (sections[candidate]) { suffix++; candidate = id + '-' + suffix; }
  appendObjectRow(sheet, h, { class_section_id: candidate, academic_year_id: academicYearId, class_name: sanitizeClass(className), status: 'ACTIVE', created_at: now, updated_at: now });
  return { class_section_id: candidate, academic_year_id: academicYearId, academic_year: year.name, class_name: sanitizeClass(className), status: 'ACTIVE', academic_year_status: year.status, academic_year_is_active: !!year.is_active, created_at: now, updated_at: now };
}

function findSectionByYearAndClass(sections, yearId, className) { for (var sid in sections) if (sections[sid].academic_year_id === yearId && sections[sid].class_name === className) return sections[sid]; return null; }
function enrollmentExists(sheet, nisn, sectionId) { var h = ensureHeaders(sheet, ENROLLMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) if (normalizeNisnLoose(rows[i][idx.nisn]) === nisn && String(rows[i][idx.class_section_id] || '').trim() === sectionId && String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'ACTIVE') return true; return false; }
function findEnrollmentForNisnAndSection(sheet, nisn, sectionId) { var h = ensureHeaders(sheet, ENROLLMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) if (normalizeNisnLoose(rows[i][idx.nisn]) === nisn && String(rows[i][idx.class_section_id] || '').trim() === sectionId) return { enrollment_id: String(rows[i][idx.enrollment_id] || '').trim(), class_section_id: sectionId, status: String(rows[i][idx.status] || 'ACTIVE').toUpperCase() }; return null; }
function findAnyActiveEnrollmentForNisn(nisn, sheet, sections, preferredYearId) { var h = ensureHeaders(sheet, ENROLLMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(), fallback = null; for (var i = 1; i < rows.length; i++) { if (normalizeNisnLoose(rows[i][idx.nisn]) !== nisn || String(rows[i][idx.status] || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue; var sid = String(rows[i][idx.class_section_id] || '').trim(), obj = { enrollment_id: String(rows[i][idx.enrollment_id] || '').trim(), class_section_id: sid }; if (sections[sid] && sections[sid].academic_year_id === preferredYearId) return obj; if (!fallback) fallback = obj; } return fallback; }
function teacherAssignmentExists(sheet, userId, sectionId) { var h = ensureHeaders(sheet, TEACHER_ASSIGNMENT_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) if (String(rows[i][idx.user_id] || '').trim() === userId && String(rows[i][idx.class_section_id] || '').trim() === sectionId && String(rows[i][idx.status] || 'ACTIVE').toUpperCase() === 'ACTIVE') return true; return false; }
function findUserByIdOrUsername(key) { var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEET_NAMES.USERS), h = ensureHeaders(sheet, USER_HEADERS), idx = headerIndexMap(h), rows = sheet.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) { var id = String(rows[i][idx.user_id] || '').trim(), username = String(rows[i][idx.username] || '').trim(); if (id === key || username === key) return { user_id: id, username: username }; } return null; }

function transactionFromRow(row, idx) {
  return {
    transaction_id: String(row[idx.transaction_id] || '').trim(), enrollment_id: String(row[idx.enrollment_id] || '').trim(), nisn: normalizeNisnLoose(row[idx.nisn]), nama: String(row[idx.nama] || '').trim(), class_section_id: String(row[idx.class_section_id] || '').trim(), academic_year: String(row[idx.academic_year] || '').trim(), class_name: String(row[idx.class_name] || '').trim(), transaction_type: String(row[idx.transaction_type] || '').toUpperCase(), amount: parseMoney(row[idx.amount]), transaction_date: normalizeBusinessDate(row[idx.transaction_date]), description: String(row[idx.description] || '').trim(), created_by_user_id: String(row[idx.created_by_user_id] || '').trim(), created_by_name: String(row[idx.created_by_name] || '').trim(), created_at: formatAnyDateTime(row[idx.created_at]), updated_at: formatAnyDateTime(row[idx.updated_at]), status: String(row[idx.status] || 'ACTIVE').toUpperCase() === 'VOID' ? 'VOID' : 'ACTIVE', void_reason: String(row[idx.void_reason] || '').trim(), voided_by_user_id: String(row[idx.voided_by_user_id] || '').trim(), voided_by_name: String(row[idx.voided_by_name] || '').trim(), voided_at: formatAnyDateTime(row[idx.voided_at])
  };
}
function transactionFromObject(o) { var x = {}; for (var k in o) x[k] = o[k]; x.nisn = normalizeNisnLoose(x.nisn); x.created_by = x.created_by_name; return x; }

function getOrCreateSheet(ss, name, headers) { var sheet = ss.getSheetByName(name); if (!sheet) sheet = ss.insertSheet(name); ensureHeaders(sheet, headers); return sheet; }
function ensureHeaders(sheet, required) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) { sheet.getRange(1, 1, 1, required.length).setValues([required]); return required.slice(); }
  var current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(v) { return String(v || '').trim(); });
  var aliases = {
    transaction_id: ['id', 'trx_id'], nisn: ['student_nisn', 'student_id'], nama: ['name', 'student_name'],
    transaction_type: ['type', 'jenis_transaksi'], amount: ['nominal', 'jumlah'], transaction_date: ['date', 'tanggal', 'tanggal_transaksi'],
    description: ['keterangan', 'catatan'], created_by_name: ['created_by', 'creator', 'user_name'], class_name: ['kelas', 'class', 'class_id'], academic_year: ['tahun_ajaran', 'tahun_pelajaran', 'school_year']
  };
  for (var r = 0; r < required.length; r++) {
    var canonical = required[r]; if (current.indexOf(canonical) !== -1) continue;
    var candidates = aliases[canonical] || [];
    for (var a = 0; a < candidates.length; a++) { var aliasIndex = current.indexOf(candidates[a]); if (aliasIndex !== -1) { /* Keep legacy header intact when it still has meaning. */ break; } }
  }
  for (var i = 0; i < required.length; i++) if (current.indexOf(required[i]) === -1) { current.push(required[i]); sheet.getRange(1, current.length).setValue(required[i]); }
  return current;
}
function headerIndexMap(headers) { var map = {}; for (var i = 0; i < headers.length; i++) map[headers[i]] = i; return map; }
function findHeaderIndex(headers, names) { for (var n = 0; n < names.length; n++) { var idx = headers.indexOf(names[n]); if (idx >= 0) return idx; } return -1; }
function appendObjectRow(sheet, headers, obj) { var row = []; for (var i = 0; i < headers.length; i++) row.push(obj[headers[i]] !== undefined ? obj[headers[i]] : ''); sheet.appendRow(row); }
function upsertSetting(sheet, key, value) { var rows = sheet.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) if (String(rows[i][0] || '').trim() === key) { sheet.getRange(i + 1, 2).setValue(value); return; } sheet.appendRow([key, value]); }
function validateNisn(value) { var n = normalizeNisnLoose(value); if (!/^\d{10}$/.test(n)) throw apiError('INVALID_NISN', 'NISN harus tepat 10 digit angka.'); return n; }
function normalizeNisnLoose(value) { return String(value || '').replace(/^'/, '').trim(); }
function normalizeAcademicYearOrBlank(value) { var clean = String(value || '').trim(), m = clean.match(/^(\d{4})\/(\d{4})$/); if (!m || Number(m[2]) !== Number(m[1]) + 1) return ''; return clean; }
function sanitizeClass(value) { var clean = sanitizeText(value, 30); if (clean && !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,29}$/.test(clean)) throw apiError('INVALID_CLASS_ID', 'Nama/ID kelas tidak valid.'); return clean; }
function normalizeBusinessDate(value) {
  var today = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'); if (!value) return today;
  if (Object.prototype.toString.call(value) === '[object Date]') { if (isNaN(value.getTime())) throw apiError('INVALID_DATE', 'Tanggal tidak valid.'); var d = Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM-dd'); if (d > today) throw apiError('FUTURE_DATE_NOT_ALLOWED', 'Tanggal tidak boleh di masa depan.'); return d; }
  var clean = String(value).trim(), m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) throw apiError('INVALID_DATE', 'Tanggal harus YYYY-MM-DD.');
  var y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]), test = new Date(Date.UTC(y, mo - 1, da)); if (test.getUTCFullYear() !== y || test.getUTCMonth() !== mo - 1 || test.getUTCDate() !== da) throw apiError('INVALID_DATE', 'Tanggal kalender tidak valid.'); if (clean > today) throw apiError('FUTURE_DATE_NOT_ALLOWED', 'Tanggal tidak boleh di masa depan.'); return clean;
}
function parseMoney(value) { if (typeof value === 'number') return isFinite(value) ? Math.round(value) : 0; var s = String(value || '').trim().replace(/\s/g, '').replace(/^Rp/i, ''); if (!s) return 0; if (/^-?\d+(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); else s = s.replace(/,/g, ''); var n = Number(s); return isFinite(n) ? Math.round(n) : 0; }
function formatDateTimeJakarta(date) { return Utilities.formatDate(date, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'); }
function formatAnyDateTime(value) { if (!value) return ''; if (Object.prototype.toString.call(value) === '[object Date]') return formatDateTimeJakarta(value); return String(value); }
function sanitizeText(value, max) { if (value === undefined || value === null) return ''; return String(value).trim().slice(0, max || 300).replace(/[<>]/g, ''); }
function isUuidV4(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function toBoolean(value) { if (value === true) return true; var s = String(value || '').trim().toUpperCase(); return s === 'TRUE' || s === '1' || s === 'YES' || s === 'YA'; }
function apiError(code, message) { var err = new Error(message); err.code = code; return err; }
function jsonOutput(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
