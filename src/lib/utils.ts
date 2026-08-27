// Utility functions for Tabungan Siswa
import * as XLSX from 'xlsx';


/** Business date in Asia/Jakarta as YYYY-MM-DD. */
export function getJakartaToday(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatRupiah(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return 'Rp 0';
  }
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
  return formatted;
}

export function formatNumber(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount) || amount === 0) {
    return '';
  }
  return new Intl.NumberFormat('id-ID').format(amount);
}

export function terbilangRupiah(n: number): string {
  if (!n || n <= 0) return '';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  
  function spell(x: number): string {
    if (x < 12) return satuan[x];
    if (x < 20) return spell(x - 10) + ' Belas';
    if (x < 100) return spell(Math.floor(x / 10)) + ' Puluh ' + spell(x % 10);
    if (x < 200) return 'Seratus ' + spell(x - 100);
    if (x < 1000) return spell(Math.floor(x / 100)) + ' Ratus ' + spell(x % 100);
    if (x < 2000) return 'Seribu ' + spell(x - 1000);
    if (x < 1000000) return spell(Math.floor(x / 1000)) + ' Ribu ' + spell(x % 1000);
    if (x < 1000000000) return spell(Math.floor(x / 1000000)) + ' Juta ' + spell(x % 1000000);
    if (x < 1000000000000) return spell(Math.floor(x / 1000000000)) + ' Miliar ' + spell(x % 1000000000);
    return '';
  }
  
  return spell(Math.floor(n)).trim() + ' Rupiah';
}

/**
 * Format Standard Indonesian Date: DD/MM/YYYY
 */
export function formatTanggalIndonesia(dateInput: string | number | Date | undefined | null): string {
  if (!dateInput) return '-';
  try {
    if (typeof dateInput === 'string') {
      const clean = dateInput.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const [y, m, d] = clean.split('-');
        return `${d}/${m}/${y}`;
      }
      if (/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}/.test(clean)) {
        return clean.split(' ')[0];
      }
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);

    const pad = (n: number) => (n < 10 ? '0' : '') + n;
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format Standard Indonesian Date & Time: DD/MM/YYYY HH:mm:ss
 */
export function formatWaktuIndonesia(dateInput: string | number | Date | undefined | null): string {
  if (!dateInput) return '-';
  try {
    if (typeof dateInput === 'string') {
      const clean = dateInput.trim();
      if (/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2}$/.test(clean)) return clean;
      if (/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}$/.test(clean)) return `${clean}:00`;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);

    const pad = (n: number) => (n < 10 ? '0' : '') + n;
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Long Date format for reports and receipts: e.g. 26 Agustus 2026
 */
export function formatDateIndo(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  try {
    if (typeof dateStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split('/');
      const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(dateObj);
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Indonesian DateTime format: DD/MM/YYYY HH:mm:ss
 */
export function formatDateTimeIndo(isoStr: string | undefined | null): string {
  return formatWaktuIndonesia(isoStr);
}

/**
 * Export structured data directly to genuine Microsoft Excel (.xlsx) file
 * Each data row is properly placed into separate Excel columns matching Google Sheets.
 */
export function downloadExcel(
  filename: string,
  rowsOrSheets: (string | number | boolean | null | undefined)[][] | { name: string; data: (string | number | boolean | null | undefined)[][] }[],
  defaultSheetName = 'Sheet1'
): void {
  const wb = XLSX.utils.book_new();

  if (Array.isArray(rowsOrSheets) && rowsOrSheets.length > 0 && Array.isArray(rowsOrSheets[0])) {
    // Single sheet table data
    const rows = rowsOrSheets as (string | number | boolean | null | undefined)[][];
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Auto calculate column widths
    const maxCols = Math.max(...rows.map(r => (Array.isArray(r) ? r.length : 0)), 1);
    const colWidths = [];
    for (let c = 0; c < maxCols; c++) {
      let maxLen = 10;
      for (let r = 0; r < rows.length; r++) {
        const val = rows[r] ? rows[r][c] : undefined;
        if (val !== undefined && val !== null) {
          const str = String(val);
          if (str.length > maxLen) {
            maxLen = Math.min(str.length + 3, 45);
          }
        }
      }
      colWidths.push({ wch: maxLen });
    }
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, defaultSheetName.substring(0, 31));
  } else if (Array.isArray(rowsOrSheets)) {
    // Multiple sheet entries
    for (const sheet of (rowsOrSheets as { name: string; data: (string | number | boolean | null | undefined)[][] }[])) {
      const ws = XLSX.utils.aoa_to_sheet(sheet.data);
      const maxCols = Math.max(...sheet.data.map(r => (Array.isArray(r) ? r.length : 0)), 1);
      const colWidths = [];
      for (let c = 0; c < maxCols; c++) {
        let maxLen = 10;
        for (let r = 0; r < sheet.data.length; r++) {
          const val = sheet.data[r] ? sheet.data[r][c] : undefined;
          if (val !== undefined && val !== null) {
            const str = String(val);
            if (str.length > maxLen) {
              maxLen = Math.min(str.length + 3, 45);
            }
          }
        }
        colWidths.push({ wch: maxLen });
      }
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
    }
  }

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', finalFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename: string, rows: (string | number | boolean | null | undefined)[][]): void {
  const processRow = (row: (string | number | boolean | null | undefined)[]) => {
    let finalVal = '';
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      let innerValue = cell === null || cell === undefined ? '' : String(cell);

      // Formula Injection Prevention: Prefix dangerous characters (=, +, -, @) with single quote (')
      if (/^[=+\-@]/.test(innerValue)) {
        innerValue = "'" + innerValue;
      }

      let result = innerValue.replace(/"/g, '""');
      if (result.search(/("|,|\n)/g) >= 0) {
        result = '"' + result + '"';
      }
      if (j > 0) finalVal += ',';
      finalVal += result;
    }
    return finalVal + '\n';
  };

  let csvFile = '\uFEFF'; // BOM for Excel UTF-8 Indonesian support
  for (let i = 0; i < rows.length; i++) {
    csvFile += processRow(rows[i]);
  }

  const blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export function generateWhatsAppMessage(
  studentName: string,
  type: 'SETORAN' | 'PENARIKAN',
  amount: number,
  balance: number,
  trxDate: string,
  schoolName: string,
  teacherName: string,
  trxId: string
): string {
  const typeText = type === 'SETORAN' ? 'SETORAN TABUNGAN' : 'PENARIKAN TABUNGAN';
  const text = `*BUKTI TRANSAKSI ${typeText}*
${schoolName}

Yth. Orang Tua / Wali Murid dari *${studentName}*,

Telah berhasil dicatat transaksi tabungan siswa:
━━━━━━━━━━━━━━━━━━━━
📌 No. Ref: ${trxId}
📅 Tanggal: ${formatDateIndo(trxDate)}
💵 Jenis: *${type}*
💰 Nominal: *${formatRupiah(amount)}*
🏦 *Saldo Terkini: ${formatRupiah(balance)}*
━━━━━━━━━━━━━━━━━━━━
Dicatat oleh: ${teacherName} (Wali Kelas)

_Terima kasih telah membiasakan ananda gemar menabung sejak dini._`;

  return encodeURIComponent(text);
}

