// Utility functions for Tabungan Siswa

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

export function formatDateIndo(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  try {
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

export function formatDateTimeIndo(isoStr: string | undefined | null): string {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch {
    return isoStr;
  }
}

export function downloadCSV(filename: string, rows: (string | number | boolean | null | undefined)[][]): void {
  const processRow = (row: (string | number | boolean | null | undefined)[]) => {
    let finalVal = '';
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      let innerValue = cell === null || cell === undefined ? '' : String(cell);
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
