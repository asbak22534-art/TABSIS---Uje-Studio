export function generateGoogleAppsScriptCode(): string {
  return `/**
 * =========================================================================
 * GOOGLE APPS SCRIPT BACKEND: TABUNGAN SISWA (WALI KELAS)
 * =========================================================================
 * Script ini digunakan untuk menghubungkan Web PWA "TABUNGAN SISWA"
 * langsung dengan Spreadsheet Google Sheets Anda secara aman & real-time.
 *
 * CARA MEMASANG / MEMPERBARUI:
 * 1. Buka Google Spreadsheet Anda di Google Drive.
 * 2. Klik menu 'Ekstensi' > 'Apps Script'.
 * 3. Hapus seluruh kode yang lama di 'Code.gs', lalu PASTE seluruh kode ini.
 * 4. Jalankan fungsi 'initDatabase()' sekali (opsional jika sheet sudah ada).
 * 5. Klik 'Deploy' (Terapkan) > 'Manage deployments' (Kelola penerapan).
 * 6. Klik ikon pensil (Edit) pada deployment aktif, pilih Version: 'New version',
 *    lalu klik 'Deploy'.
 *    (Atau klik 'New deployment' jika baru pertama kali).
 *    - Execute as: Me (Email Anda)
 *    - Who has access: Anyone (Siapa saja)
 * 7. Pastikan URL Web App (berakhiran /exec) tersimpan di Pengaturan Aplikasi Web.
 * =========================================================================
 */

var SHEET_USERS = 'USERS';
var SHEET_STUDENTS = 'STUDENTS';
var SHEET_TRANSACTIONS = 'TRANSACTIONS';
var SHEET_SETTINGS = 'SETTINGS';
var SHEET_SESSIONS = 'SESSIONS';

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var output = { success: false, data: null, error: null };
  try {
    var params = {};
    if (e && e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (err) {
        params = {};
      }
    }
    if (e && e.parameter) {
      for (var key in e.parameter) {
        params[key] = e.parameter[key];
      }
    }

    var action = params.action || 'ping';
    var data = params.data || params;

    switch (action) {
      case 'ping':
        output.success = true;
        output.data = { status: 'ok', time: new Date().toISOString() };
        break;

      case 'login':
        output.data = loginUser(params.username || data.username, params.password || data.password);
        output.success = true;
        break;

      case 'getUsers':
        output.data = getUsersData();
        output.success = true;
        break;

      case 'syncAll':
        output.data = syncAllData();
        output.success = true;
        break;

      case 'getDashboard':
        output.data = getDashboardData();
        output.success = true;
        break;

      case 'getStudents':
        output.data = getStudentsData(params.filterStatus || data.filterStatus, params.search || data.search);
        output.success = true;
        break;

      case 'createStudent':
        output.data = createStudentData(data);
        output.success = true;
        break;

      case 'updateStudent':
        output.data = updateStudentData(data);
        output.success = true;
        break;

      case 'deleteStudent':
        output.data = deleteStudentData(data.student_id || params.student_id);
        output.success = true;
        break;

      case 'createDeposit':
        output.data = processTransaction(data, 'SETORAN');
        output.success = true;
        break;

      case 'createWithdrawal':
        output.data = processTransaction(data, 'PENARIKAN');
        output.success = true;
        break;

      case 'voidTransaction':
        output.data = voidTransactionData(data.transaction_id || params.transaction_id, data.reason || params.reason);
        output.success = true;
        break;

      case 'getClassReport':
        output.data = getClassReportData();
        output.success = true;
        break;

      case 'getStudentReport':
        output.data = getStudentReportData(data.student_id || params.student_id);
        output.success = true;
        break;

      case 'getSettings':
        output.data = getSettingsData();
        output.success = true;
        break;

      case 'updateSettings':
        output.data = updateSettingsData(data);
        output.success = true;
        break;

      default:
        throw new Error('Action tidak dikenali: ' + action);
    }
  } catch (err) {
    output.success = false;
    output.error = { code: 'SERVER_ERROR', message: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// Inisialisasi Google Sheets pertama kali
function initDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Sheet USERS
  var sheetUsers = getOrCreateSheet(ss, SHEET_USERS);
  if (sheetUsers.getLastRow() === 0) {
    sheetUsers.appendRow(['user_id', 'username', 'name', 'password_hash', 'class_id', 'status', 'created_at', 'updated_at']);
    sheetUsers.appendRow(['USR-001', 'uje', 'Jefri Eka Anggara Putra, S.Pd', 'uje321', '5C', 'ACTIVE', new Date().toISOString(), new Date().toISOString()]);
  }

  // 2. Sheet STUDENTS (NISN, Nama, Jenis Kelamin, Kelas, No HP Wali)
  var sheetStudents = getOrCreateSheet(ss, SHEET_STUDENTS);
  if (sheetStudents.getLastRow() === 0) {
    sheetStudents.appendRow(['nisn', 'nama', 'jenis_kelamin', 'kelas', 'no_hp_wali', 'status', 'created_at', 'updated_at']);
  }

  // 3. Sheet TRANSACTIONS (Source of Truth)
  var sheetTrx = getOrCreateSheet(ss, SHEET_TRANSACTIONS);
  if (sheetTrx.getLastRow() === 0) {
    sheetTrx.appendRow(['transaction_id', 'nisn', 'nama', 'transaction_type', 'amount', 'transaction_date', 'description', 'created_by', 'created_at', 'updated_at', 'status', 'void_reason']);
  }

  // 4. Sheet SETTINGS
  var sheetSettings = getOrCreateSheet(ss, SHEET_SETTINGS);
  if (sheetSettings.getLastRow() === 0) {
    sheetSettings.appendRow(['setting_key', 'setting_value']);
    sheetSettings.appendRow(['school_name', 'MI Islam Terpadu Al-Uswah Pasirian']);
    sheetSettings.appendRow(['class_name', '5C']);
    sheetSettings.appendRow(['teacher_name', 'Jefri Eka Anggara Putra, S.Pd']);
    sheetSettings.appendRow(['academic_year', '2026/2027']);
    sheetSettings.appendRow(['minimum_deposit', '1000']);
  }
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// -------------------------------------------------------------
// AUTH: LOGIN & USER VERIFICATION
// -------------------------------------------------------------
function loginUser(username, password) {
  if (!username || !password) {
    throw new Error('Username dan kata sandi wajib diisi.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_USERS);
  var rows = sheet.getDataRange().getValues();

  if (rows.length <= 1) {
    throw new Error('Tabel USERS kosong di Google Spreadsheet.');
  }

  var cleanUsername = String(username).trim().toLowerCase();
  var cleanPassword = String(password).trim();

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rUserId = String(row[0] || ('USR-00' + i));
    var rUsername = String(row[1] || '').trim().toLowerCase();
    var rName = String(row[2] || 'Wali Kelas');
    var rPasswordHash = String(row[3] || '').trim();
    var rClassId = String(row[4] || '5C');
    var rStatus = String(row[5] || 'ACTIVE').toUpperCase();

    if (rUsername === cleanUsername && rStatus === 'ACTIVE') {
      // Verifikasi password (plaintext atau exact match password_hash)
      if (rPasswordHash === cleanPassword) {
        var sessionId = 'SES-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
        return {
          user: {
            user_id: rUserId,
            username: String(row[1]).trim(),
            name: rName,
            class_id: rClassId,
            status: rStatus
          },
          session_id: sessionId
        };
      } else {
        throw new Error('Kata sandi yang dimasukkan salah.');
      }
    }
  }

  throw new Error('Pengguna dengan username "' + username + '" tidak ditemukan atau tidak aktif.');
}

function getUsersData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_USERS);
  var rows = sheet.getDataRange().getValues();
  var users = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[1]) continue;
    users.push({
      user_id: String(row[0] || ('USR-00' + i)),
      username: String(row[1] || '').trim(),
      name: String(row[2] || ''),
      password_hash: String(row[3] || ''),
      class_id: String(row[4] || '5A'),
      status: String(row[5] || 'ACTIVE').toUpperCase(),
      created_at: row[6] ? new Date(row[6]).toISOString() : new Date().toISOString(),
      updated_at: row[7] ? new Date(row[7]).toISOString() : new Date().toISOString()
    });
  }
  return users;
}

// -------------------------------------------------------------
// FULL SYNC: AMBIL SELURUH DATA DARI GOOGLE SPREADSHEET
// -------------------------------------------------------------
function syncAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    users: getUsersData(),
    students: getStudentsData('ALL'),
    transactions: getRawTransactions(ss),
    settings: getSettingsData()
  };
}

function getSettingsData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_SETTINGS);
  var rows = sheet.getDataRange().getValues();
  var settings = {};

  for (var i = 1; i < rows.length; i++) {
    var key = String(rows[i][0] || '').trim();
    var val = rows[i][1];
    if (key) {
      settings[key] = val;
    }
  }

  return {
    school_name: String(settings['school_name'] || 'SD Negeri 01 Teladan'),
    class_name: String(settings['class_name'] || 'Kelas 5A'),
    teacher_name: String(settings['teacher_name'] || 'Wali Kelas'),
    academic_year: String(settings['academic_year'] || '2026/2027'),
    minimum_deposit: Number(settings['minimum_deposit']) || 1000,
    class_id: '5A'
  };
}

function updateSettingsData(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_SETTINGS);
  var rows = sheet.getDataRange().getValues();

  var keys = ['school_name', 'class_name', 'teacher_name', 'academic_year', 'minimum_deposit'];

  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    if (data[key] !== undefined && data[key] !== null) {
      var found = false;
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === key) {
          sheet.getRange(i + 1, 2).setValue(String(data[key]));
          found = true;
          break;
        }
      }
      if (!found) {
        sheet.appendRow([key, String(data[key])]);
      }
    }
  }

  return getSettingsData();
}

function getRawTransactions(ss) {
  var sheet = getOrCreateSheet(ss, SHEET_TRANSACTIONS);
  var rows = sheet.getDataRange().getValues();
  var trxs = [];
  if (rows.length <= 1) return trxs;

  var headerRow = rows[0] || [];
  var colMap = {};
  for (var h = 0; h < headerRow.length; h++) {
    colMap[String(headerRow[h]).trim().toLowerCase()] = h;
  }

  var hasNamaCol = colMap['nama'] !== undefined;

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0]) continue;

    var trxId = String(row[colMap['transaction_id'] !== undefined ? colMap['transaction_id'] : 0] || '');
    if (!trxId) continue;

    var nisnVal = colMap['nisn'] !== undefined ? String(row[colMap['nisn']] || '').trim() : (colMap['student_id'] !== undefined ? String(row[colMap['student_id']] || '').trim() : String(row[1] || '').trim());
    var namaVal = colMap['nama'] !== undefined ? String(row[colMap['nama']] || '').trim() : '';

    var typeIdx = colMap['transaction_type'] !== undefined ? colMap['transaction_type'] : (hasNamaCol ? 3 : 2);
    var amountIdx = colMap['amount'] !== undefined ? colMap['amount'] : (hasNamaCol ? 4 : 3);
    var dateIdx = colMap['transaction_date'] !== undefined ? colMap['transaction_date'] : (hasNamaCol ? 5 : 4);
    var descIdx = colMap['description'] !== undefined ? colMap['description'] : (hasNamaCol ? 6 : 5);
    var createdByIdx = colMap['created_by'] !== undefined ? colMap['created_by'] : (hasNamaCol ? 7 : 6);
    var createdAtIdx = colMap['created_at'] !== undefined ? colMap['created_at'] : (hasNamaCol ? 8 : 7);
    var updatedAtIdx = colMap['updated_at'] !== undefined ? colMap['updated_at'] : (hasNamaCol ? 9 : 8);
    var statusIdx = colMap['status'] !== undefined ? colMap['status'] : (hasNamaCol ? 10 : 9);
    var voidIdx = colMap['void_reason'] !== undefined ? colMap['void_reason'] : (hasNamaCol ? 11 : 10);

    trxs.push({
      transaction_id: trxId,
      student_id: nisnVal,
      nisn: nisnVal,
      nama: namaVal,
      transaction_type: String(row[typeIdx] || 'SETORAN'),
      amount: Number(row[amountIdx]) || 0,
      transaction_date: formatDateString(row[dateIdx]),
      description: String(row[descIdx] || ''),
      created_by: String(row[createdByIdx] || ''),
      created_at: row[createdAtIdx] ? new Date(row[createdAtIdx]).toISOString() : new Date().toISOString(),
      updated_at: row[updatedAtIdx] ? new Date(row[updatedAtIdx]).toISOString() : new Date().toISOString(),
      status: String(row[statusIdx] || 'ACTIVE').toUpperCase(),
      void_reason: row[voidIdx] ? String(row[voidIdx]) : undefined
    });
  }
  return trxs;
}

// -------------------------------------------------------------
// STUDENTS & TRANSACTIONS MANAGEMENT
// -------------------------------------------------------------
function getStudentsData(filterStatus, search) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_STUDENTS);
  var rows = sheet.getDataRange().getValues();
  var trxs = getRawTransactions(ss);
  var students = [];

  if (rows.length <= 1) {
    return [];
  }

  // Map header column indices dynamically
  var headerRow = rows[0] || [];
  var colMap = {};
  for (var h = 0; h < headerRow.length; h++) {
    var hName = String(headerRow[h]).trim().toLowerCase();
    colMap[hName] = h;
  }

  // Hitung saldo per student_id / nisn
  var balances = {};
  var totalDeposits = {};
  var totalWithdrawals = {};
  var trxCounts = {};

  for (var k = 0; k < trxs.length; k++) {
    var t = trxs[k];
    if (t.status !== 'ACTIVE') continue;
    var sid = t.student_id;
    if (!balances[sid]) {
      balances[sid] = 0;
      totalDeposits[sid] = 0;
      totalWithdrawals[sid] = 0;
      trxCounts[sid] = 0;
    }
    trxCounts[sid]++;
    if (t.transaction_type === 'SETORAN') {
      balances[sid] += t.amount;
      totalDeposits[sid] += t.amount;
    } else if (t.transaction_type === 'PENARIKAN') {
      balances[sid] -= t.amount;
      totalWithdrawals[sid] += t.amount;
    }
  }

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0] && !row[1]) continue;

    // Detect fields dynamically by header name or position
    var nisn = colMap['nisn'] !== undefined ? String(row[colMap['nisn']] || '').trim() : String(row[0] || '').trim();
    var studentId = colMap['student_id'] !== undefined ? String(row[colMap['student_id']] || '').trim() : nisn;
    if (!nisn && studentId) nisn = studentId;
    if (!studentId && nisn) studentId = nisn;

    var nama = colMap['nama'] !== undefined ? String(row[colMap['nama']] || '').trim() : String(row[1] || '').trim();
    var jenis_kelamin = colMap['jenis_kelamin'] !== undefined ? String(row[colMap['jenis_kelamin']] || 'L').toUpperCase() : 'L';
    var kelas = colMap['kelas'] !== undefined ? String(row[colMap['kelas']] || '5A').trim() : '5A';
    var no_hp_wali = colMap['no_hp_wali'] !== undefined ? String(row[colMap['no_hp_wali']] || '').trim() : '';
    var status = colMap['status'] !== undefined ? String(row[colMap['status']] || 'ACTIVE').toUpperCase() : 'ACTIVE';
    var created_at = colMap['created_at'] !== undefined && row[colMap['created_at']] ? new Date(row[colMap['created_at']]).toISOString() : new Date().toISOString();
    var updated_at = colMap['updated_at'] !== undefined && row[colMap['updated_at']] ? new Date(row[colMap['updated_at']]).toISOString() : new Date().toISOString();

    if (filterStatus && filterStatus !== 'ALL' && status !== filterStatus) {
      continue;
    }

    if (search) {
      var q = search.toLowerCase();
      if (!nama.toLowerCase().includes(q) && !nisn.toLowerCase().includes(q)) {
        continue;
      }
    }

    // Match balance by nisn or student_id
    var calcBalance = balances[studentId] || balances[nisn] || 0;
    var calcDeposit = totalDeposits[studentId] || totalDeposits[nisn] || 0;
    var calcWithdrawal = totalWithdrawals[studentId] || totalWithdrawals[nisn] || 0;
    var calcCount = trxCounts[studentId] || trxCounts[nisn] || 0;

    students.push({
      student_id: nisn || studentId,
      nisn: nisn || studentId,
      nama: nama,
      jenis_kelamin: jenis_kelamin === 'P' ? 'P' : 'L',
      kelas: kelas,
      no_hp_wali: no_hp_wali,
      status: status,
      created_at: created_at,
      updated_at: updated_at,
      balance: calcBalance,
      totalDeposit: calcDeposit,
      totalWithdrawal: calcWithdrawal,
      transactionCount: calcCount
    });
  }

  return students;
}

function createStudentData(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_STUDENTS);
  var nisn = String(data.nisn || data.student_id || ('NISN-' + Date.now().toString().slice(-6))).trim();
  var now = new Date().toISOString();

  var rows = sheet.getDataRange().getValues();
  var headerRow = rows[0] || [];
  var colMap = {};
  for (var h = 0; h < headerRow.length; h++) {
    colMap[String(headerRow[h]).trim().toLowerCase()] = h;
  }

  if (headerRow.length === 0) {
    sheet.appendRow(['nisn', 'nama', 'jenis_kelamin', 'kelas', 'no_hp_wali', 'status', 'created_at', 'updated_at']);
    headerRow = ['nisn', 'nama', 'jenis_kelamin', 'kelas', 'no_hp_wali', 'status', 'created_at', 'updated_at'];
    for (var k = 0; k < headerRow.length; k++) {
      colMap[headerRow[k]] = k;
    }
  }

  // Construct row array based on detected header columns
  var newRow = new Array(headerRow.length);
  for (var c = 0; c < headerRow.length; c++) newRow[c] = '';

  if (colMap['nisn'] !== undefined) newRow[colMap['nisn']] = nisn;
  if (colMap['student_id'] !== undefined) newRow[colMap['student_id']] = nisn;
  if (colMap['nama'] !== undefined) newRow[colMap['nama']] = String(data.nama || '').trim();
  if (colMap['jenis_kelamin'] !== undefined) newRow[colMap['jenis_kelamin']] = String(data.jenis_kelamin || 'L').toUpperCase();
  if (colMap['kelas'] !== undefined) newRow[colMap['kelas']] = String(data.kelas || '5A').trim();
  if (colMap['no_hp_wali'] !== undefined) newRow[colMap['no_hp_wali']] = String(data.no_hp_wali || '').trim();
  if (colMap['status'] !== undefined) newRow[colMap['status']] = 'ACTIVE';
  if (colMap['created_at'] !== undefined) newRow[colMap['created_at']] = now;
  if (colMap['updated_at'] !== undefined) newRow[colMap['updated_at']] = now;

  sheet.appendRow(newRow);

  return {
    student_id: nisn,
    nisn: nisn,
    nama: String(data.nama || '').trim(),
    jenis_kelamin: String(data.jenis_kelamin || 'L').toUpperCase(),
    kelas: String(data.kelas || '5A').trim(),
    no_hp_wali: String(data.no_hp_wali || '').trim(),
    status: 'ACTIVE',
    balance: 0
  };
}

function updateStudentData(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_STUDENTS);
  var rows = sheet.getDataRange().getValues();
  var targetKey = String(data.nisn || data.student_id || '').trim();

  if (!targetKey) throw new Error('NISN / ID Siswa diperlukan.');

  var headerRow = rows[0] || [];
  var colMap = {};
  for (var h = 0; h < headerRow.length; h++) {
    colMap[String(headerRow[h]).trim().toLowerCase()] = h;
  }

  for (var i = 1; i < rows.length; i++) {
    var rNisn = colMap['nisn'] !== undefined ? String(rows[i][colMap['nisn']] || '').trim() : String(rows[i][0] || '').trim();
    var rSid = colMap['student_id'] !== undefined ? String(rows[i][colMap['student_id']] || '').trim() : rNisn;

    if (rNisn === targetKey || rSid === targetKey) {
      var rowNum = i + 1;
      if (data.nama !== undefined && colMap['nama'] !== undefined) {
        sheet.getRange(rowNum, colMap['nama'] + 1).setValue(String(data.nama).trim());
      }
      if (data.jenis_kelamin !== undefined && colMap['jenis_kelamin'] !== undefined) {
        sheet.getRange(rowNum, colMap['jenis_kelamin'] + 1).setValue(String(data.jenis_kelamin).toUpperCase());
      }
      if (data.kelas !== undefined && colMap['kelas'] !== undefined) {
        sheet.getRange(rowNum, colMap['kelas'] + 1).setValue(String(data.kelas).trim());
      }
      if (data.no_hp_wali !== undefined && colMap['no_hp_wali'] !== undefined) {
        sheet.getRange(rowNum, colMap['no_hp_wali'] + 1).setValue(String(data.no_hp_wali).trim());
      }
      if (data.status !== undefined && colMap['status'] !== undefined) {
        sheet.getRange(rowNum, colMap['status'] + 1).setValue(String(data.status).toUpperCase());
      }
      if (colMap['updated_at'] !== undefined) {
        sheet.getRange(rowNum, colMap['updated_at'] + 1).setValue(new Date().toISOString());
      }
      return { success: true, student_id: targetKey, nisn: targetKey };
    }
  }
  throw new Error('Siswa dengan NISN ' + targetKey + ' tidak ditemukan.');
}

function deleteStudentData(studentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_STUDENTS);
  var rows = sheet.getDataRange().getValues();
  var targetKey = String(studentId).trim();

  var trxSheet = getOrCreateSheet(ss, SHEET_TRANSACTIONS);
  var trxs = trxSheet.getDataRange().getValues();
  var hasTrx = false;
  for (var j = 1; j < trxs.length; j++) {
    if (String(trxs[j][1]).trim() === targetKey) {
      hasTrx = true;
      break;
    }
  }

  var headerRow = rows[0] || [];
  var colMap = {};
  for (var h = 0; h < headerRow.length; h++) {
    colMap[String(headerRow[h]).trim().toLowerCase()] = h;
  }

  for (var i = 1; i < rows.length; i++) {
    var rNisn = colMap['nisn'] !== undefined ? String(rows[i][colMap['nisn']] || '').trim() : String(rows[i][0] || '').trim();
    var rSid = colMap['student_id'] !== undefined ? String(rows[i][colMap['student_id']] || '').trim() : rNisn;

    if (rNisn === targetKey || rSid === targetKey) {
      var rowNum = i + 1;
      if (hasTrx) {
        if (colMap['status'] !== undefined) {
          sheet.getRange(rowNum, colMap['status'] + 1).setValue('INACTIVE');
        }
        if (colMap['updated_at'] !== undefined) {
          sheet.getRange(rowNum, colMap['updated_at'] + 1).setValue(new Date().toISOString());
        }
        return { success: true, mode: 'DEACTIVATED', student_id: targetKey };
      } else {
        sheet.deleteRow(rowNum);
        return { success: true, mode: 'DELETED', student_id: targetKey };
      }
    }
  }
  throw new Error('Siswa tidak ditemukan.');
}

// -------------------------------------------------------------
// DASHBOARD & REPORTS
// -------------------------------------------------------------
function getDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var students = getStudentsData('ACTIVE');
  var trxs = getRawTransactions(ss);
  var settings = getSettingsData();
  var today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');

  var totalClassBalance = 0;
  var activeSavers = 0;
  var totalDepositAllTime = 0;
  var totalWithdrawalAllTime = 0;

  for (var i = 0; i < students.length; i++) {
    var st = students[i];
    totalClassBalance += st.balance;
    if (st.balance > 0) activeSavers++;
    totalDepositAllTime += st.totalDeposit;
    totalWithdrawalAllTime += st.totalWithdrawal;
  }

  var todayDeposit = 0;
  var todayWithdrawal = 0;
  var recentTrx = [];

  // Sort descending by created_at
  trxs.sort(function(a, b) {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  for (var j = 0; j < trxs.length; j++) {
    var t = trxs[j];
    if (t.status === 'ACTIVE') {
      if (t.transaction_date === today) {
        if (t.transaction_type === 'SETORAN') todayDeposit += t.amount;
        else if (t.transaction_type === 'PENARIKAN') todayWithdrawal += t.amount;
      }
    }
    if (recentTrx.length < 10) {
      // Pasangkan nama siswa
      var studentObj = students.find(function(s) { return s.student_id === t.student_id || s.nisn === t.student_id; });
      recentTrx.push({
        ...t,
        student_nama: studentObj ? studentObj.nama : '',
        student_nisn: studentObj ? studentObj.nisn : '',
        student_kelas: studentObj ? studentObj.kelas : ''
      });
    }
  }

  return {
    teacherName: settings.teacher_name,
    className: settings.class_name,
    academicYear: settings.academic_year,
    totalStudents: students.length,
    activeSavers: activeSavers,
    totalClassBalance: totalClassBalance,
    todayDeposit: todayDeposit,
    todayWithdrawal: todayWithdrawal,
    totalDepositAllTime: totalDepositAllTime,
    totalWithdrawalAllTime: totalWithdrawalAllTime,
    recentTransactions: recentTrx
  };
}

function getClassReportData() {
  var students = getStudentsData('ALL');
  return { students: students };
}

function getStudentReportData(studentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var students = getStudentsData('ALL');
  var student = students.find(function(s) { return s.student_id === String(studentId); });
  if (!student) throw new Error('Siswa tidak ditemukan.');

  var trxs = getRawTransactions(ss).filter(function(t) {
    return t.student_id === String(studentId);
  });

  return {
    student: student,
    summary: {
      totalDeposit: student.totalDeposit,
      totalWithdrawal: student.totalWithdrawal,
      currentBalance: student.balance,
      transactionCount: student.transactionCount
    },
    transactions: trxs
  };
}

// -------------------------------------------------------------
// TRANSAKSI KEUANGAN (LOCK SERVICE CONCURRENCY)
// -------------------------------------------------------------
function processTransaction(data, type) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var trxSheet = getOrCreateSheet(ss, SHEET_TRANSACTIONS);
    var amount = Number(data.amount);
    var nisn = String(data.nisn || data.student_id || '').trim();

    if (isNaN(amount) || amount <= 0) {
      throw new Error('INVALID_AMOUNT: Jumlah transaksi harus lebih dari 0.');
    }

    var currentBalance = calculateBalance(ss, nisn);

    if (type === 'PENARIKAN' && amount > currentBalance) {
      throw new Error('INSUFFICIENT_BALANCE: Saldo tabungan tidak mencukupi untuk penarikan.');
    }

    // Cari nama siswa jika tidak dikirim langsung
    var studentName = String(data.nama || data.student_nama || '').trim();
    if (!studentName) {
      var students = getStudentsData('ALL');
      var stMatch = students.find(function(s) { return s.nisn === nisn || s.student_id === nisn; });
      if (stMatch) studentName = stMatch.nama;
    }

    var today = data.transaction_date || Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
    var now = new Date().toISOString();
    var trxId = data.transaction_id || ('TRX-' + today.replace(/-/g, '') + '-' + Math.floor(Math.random() * 900 + 100));
    var desc = data.description || (type === 'SETORAN' ? 'Setoran Tabungan' : 'Penarikan Tabungan');
    var createdBy = data.created_by || 'Wali Kelas';

    var rows = trxSheet.getDataRange().getValues();
    var headerRow = rows[0] || [];
    var colMap = {};
    for (var h = 0; h < headerRow.length; h++) {
      colMap[String(headerRow[h]).trim().toLowerCase()] = h;
    }

    if (headerRow.length === 0) {
      trxSheet.appendRow(['transaction_id', 'nisn', 'nama', 'transaction_type', 'amount', 'transaction_date', 'description', 'created_by', 'created_at', 'updated_at', 'status', 'void_reason']);
      headerRow = ['transaction_id', 'nisn', 'nama', 'transaction_type', 'amount', 'transaction_date', 'description', 'created_by', 'created_at', 'updated_at', 'status', 'void_reason'];
      for (var k = 0; k < headerRow.length; k++) {
        colMap[headerRow[k]] = k;
      }
    }

    // Tulis baris sesuai mapping kolom sheet atau urutan standar
    if (colMap['transaction_id'] !== undefined && colMap['nama'] !== undefined) {
      var newRow = new Array(headerRow.length);
      for (var c = 0; c < headerRow.length; c++) newRow[c] = '';
      if (colMap['transaction_id'] !== undefined) newRow[colMap['transaction_id']] = trxId;
      if (colMap['nisn'] !== undefined) newRow[colMap['nisn']] = nisn;
      if (colMap['student_id'] !== undefined && colMap['nisn'] === undefined) newRow[colMap['student_id']] = nisn;
      if (colMap['nama'] !== undefined) newRow[colMap['nama']] = studentName;
      if (colMap['transaction_type'] !== undefined) newRow[colMap['transaction_type']] = type;
      if (colMap['amount'] !== undefined) newRow[colMap['amount']] = amount;
      if (colMap['transaction_date'] !== undefined) newRow[colMap['transaction_date']] = today;
      if (colMap['description'] !== undefined) newRow[colMap['description']] = desc;
      if (colMap['created_by'] !== undefined) newRow[colMap['created_by']] = createdBy;
      if (colMap['created_at'] !== undefined) newRow[colMap['created_at']] = now;
      if (colMap['updated_at'] !== undefined) newRow[colMap['updated_at']] = now;
      if (colMap['status'] !== undefined) newRow[colMap['status']] = 'ACTIVE';
      if (colMap['void_reason'] !== undefined) newRow[colMap['void_reason']] = '';
      trxSheet.appendRow(newRow);
    } else {
      // Urutan Standar: transaction_id, nisn, nama, transaction_type, amount, transaction_date, description, created_by, created_at, updated_at, status, void_reason
      trxSheet.appendRow([
        trxId,
        nisn,
        studentName,
        type,
        amount,
        today,
        desc,
        createdBy,
        now,
        now,
        'ACTIVE',
        ''
      ]);
    }

    var newBalance = (type === 'SETORAN') ? currentBalance + amount : currentBalance - amount;

    return {
      transaction: {
        transaction_id: trxId,
        student_id: nisn,
        nisn: nisn,
        nama: studentName,
        transaction_type: type,
        amount: amount,
        transaction_date: today,
        description: desc,
        created_by: createdBy,
        status: 'ACTIVE'
      },
      newBalance: newBalance
    };
  } finally {
    lock.releaseLock();
  }
}

function voidTransactionData(trxId, reason) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var trxSheet = getOrCreateSheet(ss, SHEET_TRANSACTIONS);
    var rows = trxSheet.getDataRange().getValues();
    if (rows.length <= 1) throw new Error('Tabel transaksi kosong.');

    var headerRow = rows[0] || [];
    var colMap = {};
    for (var h = 0; h < headerRow.length; h++) {
      colMap[String(headerRow[h]).trim().toLowerCase()] = h;
    }

    var statusColIdx = colMap['status'] !== undefined ? colMap['status'] + 1 : (colMap['nama'] !== undefined ? 11 : 10);
    var voidReasonColIdx = colMap['void_reason'] !== undefined ? colMap['void_reason'] + 1 : (colMap['nama'] !== undefined ? 12 : 11);
    var updatedColIdx = colMap['updated_at'] !== undefined ? colMap['updated_at'] + 1 : (colMap['nama'] !== undefined ? 10 : 9);

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(trxId)) {
        var rowNum = i + 1;
        trxSheet.getRange(rowNum, statusColIdx).setValue('VOID');
        trxSheet.getRange(rowNum, voidReasonColIdx).setValue(String(reason || 'Dibatalkan oleh Wali Kelas'));
        trxSheet.getRange(rowNum, updatedColIdx).setValue(new Date().toISOString());
        return { success: true, transaction_id: trxId, status: 'VOID' };
      }
    }
    throw new Error('Transaksi tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}

function calculateBalance(ss, studentId) {
  var trxs = getRawTransactions(ss);
  var target = String(studentId).trim();
  var totalDeposit = 0;
  var totalWithdrawal = 0;

  for (var i = 0; i < trxs.length; i++) {
    var t = trxs[i];
    if ((t.student_id === target || t.nisn === target) && t.status === 'ACTIVE') {
      if (t.transaction_type === 'SETORAN') totalDeposit += t.amount;
      else if (t.transaction_type === 'PENARIKAN') totalWithdrawal += t.amount;
    }
  }

  return totalDeposit - totalWithdrawal;
}

function formatDateString(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'GMT+7', 'yyyy-MM-dd');
  }
  return String(val);
}
`;
}

