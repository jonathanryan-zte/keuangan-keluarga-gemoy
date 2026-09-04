// Format & baca angka rupiah dengan kebiasaan Indonesia.

const NF = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function rp(n, opsi = {}) {
  const bulat = Math.round(Number(n) || 0);
  const teks = NF.format(Math.abs(bulat));
  const tanda = bulat < 0 ? '-' : (opsi.tandaPlus && bulat > 0 ? '+' : '');
  return `${tanda}${opsi.tanpaRp ? '' : 'Rp'}${teks}`;
}

/** Versi ringkas untuk grafik & kartu sempit: Rp1,2jt / Rp750rb. */
export function rpSingkat(n) {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  const tanda = v < 0 ? '-' : '';
  if (a >= 1e9) return `${tanda}Rp${bulatkan(a / 1e9)}M`;
  if (a >= 1e6) return `${tanda}Rp${bulatkan(a / 1e6)}jt`;
  if (a >= 1e3) return `${tanda}Rp${bulatkan(a / 1e3)}rb`;
  return `${tanda}Rp${a}`;
}

function bulatkan(x) {
  // Satu angka di belakang koma sampai 100, supaya "Rp35,4jt" tidak menyusut
  // jadi "Rp35jt" dan menyembunyikan ratusan ribu.
  return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10)
    .toString().replace('.', ',');
}

/** Angka desimal dengan koma, sesuai kebiasaan Indonesia. */
export function desimal(n, angka = 1) {
  return (Number(n) || 0).toFixed(angka).replace('.', ',');
}

/**
 * Baca angka dari cara orang mengetik sehari-hari:
 *   "40rb" "40 ribu" "40k" "1,5jt" "2 juta" "50.000" "50000" "1.5 jt"
 * Mengembalikan null kalau tidak ada angka sama sekali.
 */
export function bacaNominal(teks) {
  const s = String(teks || '').toLowerCase().trim();
  if (!s) return null;

  const m = s.match(/(\d[\d.,]*)\s*(m(?:ilyar|iliar)?|jt|juta|rb|ribu|k)?\b/);
  if (!m) return null;

  let angka = m[1];
  const satuan = m[2] || '';

  // "1,5jt" -> koma desimal. "50.000" -> titik ribuan. "1.5 jt" -> titik desimal.
  if (satuan) {
    angka = angka.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  } else {
    angka = angka.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
  }
  let nilai = parseFloat(angka);
  if (isNaN(nilai)) return null;

  if (/^m/.test(satuan)) nilai *= 1e9;
  else if (/^(jt|juta)/.test(satuan)) nilai *= 1e6;
  else if (/^(rb|ribu|k)/.test(satuan)) nilai *= 1e3;

  return Math.round(nilai);
}

export const BULAN_NAMA = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI_NAMA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function namaBulan(bulan) {
  const [th, bl] = String(bulan).split('-');
  return `${BULAN_NAMA[Number(bl) - 1] || bulan} ${th}`;
}

export function namaBulanPendek(bulan) {
  const [th, bl] = String(bulan).split('-');
  return `${(BULAN_NAMA[Number(bl) - 1] || '').slice(0, 3)} ${String(th).slice(2)}`;
}

export function tanggalPanjang(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return `${HARI_NAMA[d.getDay()]}, ${d.getDate()} ${BULAN_NAMA[d.getMonth()]}`;
}

export function hariIni() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function bulanIni() { return hariIni().slice(0, 7); }
export function pad(n) { return String(n).padStart(2, '0'); }

export function jumlahHari(bulan) {
  const [th, bl] = bulan.split('-').map(Number);
  return new Date(th, bl, 0).getDate();
}

export function geserBulan(bulan, n) {
  const [th, bl] = bulan.split('-').map(Number);
  const total = th * 12 + (bl - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}
