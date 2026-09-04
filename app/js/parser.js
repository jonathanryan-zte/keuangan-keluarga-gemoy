// Mengubah satu baris ketikan bebas menjadi transaksi.
//   "bakso chukul 59rb"        -> Bakso Chukul, 59.000, hari ini, Pangan
//   "galon 56500 kemarin"      -> Galon, 56.500, kemarin, Pangan
//   "tennis 1,5jt tgl 3"       -> Tennis, 1.500.000, tanggal 3 bulan ini, Hobi
// Tebakan kategori memakai riwayat Ryan lebih dulu, baru kata kunci.

import { bacaNominal, hariIni, pad } from './rupiah.js';

const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

const KATA_KUNCI = [
  ['Pangan', /belanja|pasar|bravo|superindo|aeon|hokky|indomaret|alfamart|lawson|galon|telur|telor|beras|sayur|buah|daging|ikan|ayam|lauk|susu|kopi|jajan|makan|sarapan|nasi|bakso|soto|sate|mie|bakmi|roti|donut|kue|sourdough|martabak|tahu|tempe|gula|santan|bumbu|snack|minum|teh|grabfood|gofood|shopeefood|depot|resto|warung|cafe|kantin|hotpot|pizza|nugget|salad|ragi|tepung|elpiji|gas /i],
  ['Sandang', /baju|celana|jaket|kaos|sepatu|sandal|tas |kacamata|casing|setrika|strika|laundry|potong rambut|barbershop|salon|vermak|jahit|sabun|pasta gigi|pembalut|skincare|parfum|barber|materai|j&t|ongkir/i],
  // Bensin, parkir, ojek daring, dan servis kendaraan masuk Papan — mengikuti
  // cara Ryan mencatatnya di Sheet, bukan tebakan umum.
  ['Papan', /pbb|kebon|taman|tukang|bebersih|cuci ac|pel |sapu|vaccum|sprei|cabinet|rak |perlengkapan|kompor|lampu|listrik|pdam|paku|semen|cat |gelas|piring|stempel|racun tikus|ovo|topup|token|bensin|parkir|tol|grab|gojek|indrive|ojek|oli|servis|service|cuci mobil|perbaikan motor/i],
  ['Hobi', /tennis|tenis|gym|fitness|badminton|nonton|bioskop|game|sepeda|lari|renang|buku|grinder|biji kopi|pameran|konser|hobi/i],
  ['Gift', /kado|hadiah|amplop|traktir|angpao|sumbangan|persembahan|jastip|titipan|fellowship|iuran hut/i],
  ['Travelling', /liburan|penginapan|hotel|tiket|wisata|travel|pesawat|kereta|villa|resort/i],
  ['Kesehatan', /rumah sakit|klinik|dokter|apotek|obat|vitamin|imunisasi|vaksin|bpjs|periksa|berobat|scaling/i]
];

/**
 * @param {string} teks
 * @param {{riwayat?: Array, bulanAktif?: string}} opsi
 */
export function baca(teks, opsi = {}) {
  let sisa = ' ' + String(teks || '').trim() + ' ';
  if (!sisa.trim()) return null;

  const acuan = opsi.bulanAktif ? `${opsi.bulanAktif}-01` : hariIni();
  const hasil = { tanggal: hariIni(), nominal: null, item: '', kategori: null, pastiTanggal: false };

  // --- tanggal -------------------------------------------------------------
  const potong = (re) => {
    const m = sisa.match(re);
    if (m) sisa = sisa.replace(m[0], ' ');
    return m;
  };

  let m;
  if ((m = potong(/\b(hari ini|hr ini|skrg|sekarang)\b/i))) {
    hasil.tanggal = hariIni(); hasil.pastiTanggal = true;
  } else if ((m = potong(/\b(kemarin|kmrn|kmren)\b/i))) {
    hasil.tanggal = geserHari(hariIni(), -1); hasil.pastiTanggal = true;
  } else if ((m = potong(/\bkemarin lusa|\b2 hari lalu\b/i))) {
    hasil.tanggal = geserHari(hariIni(), -2); hasil.pastiTanggal = true;
  } else if ((m = potong(/\b(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\s*[\/-]\s*(\d{2,4}))?\b/))) {
    const th = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +acuan.slice(0, 4);
    const t = susun(th, +m[2], +m[1]);
    if (t) { hasil.tanggal = t; hasil.pastiTanggal = true; }
  } else if ((m = potong(/\btgl\.?\s*(\d{1,2})\b|\btanggal\s+(\d{1,2})\b/i))) {
    const t = susun(+acuan.slice(0, 4), +acuan.slice(5, 7), +(m[1] || m[2]));
    if (t) { hasil.tanggal = t; hasil.pastiTanggal = true; }
  } else if ((m = potong(new RegExp(`\\b(${HARI.join('|')})\\b`, 'i')))) {
    hasil.tanggal = hariTerakhir(HARI.indexOf(m[1].toLowerCase()));
    hasil.pastiTanggal = true;
  }

  // --- nominal -------------------------------------------------------------
  // Ambil kandidat terakhir yang punya satuan (rb/jt/k); kalau tidak ada,
  // ambil angka telanjang terbesar. "Bakso 2 porsi 59rb" jadi 59.000, bukan 2.
  const kandidat = [...sisa.matchAll(/(\d[\d.,]*)\s*(m(?:ilyar|iliar)?|jt|juta|rb|ribu|k)?\b/gi)];
  let pilih = null;
  for (const c of kandidat) if (c[2]) pilih = c;
  if (!pilih) {
    for (const c of kandidat) {
      const n = bacaNominal(c[0]);
      if (n !== null && (!pilih || n > bacaNominal(pilih[0]))) pilih = c;
    }
  }
  if (pilih) {
    hasil.nominal = bacaNominal(pilih[0]);
    sisa = sisa.replace(pilih[0], ' ');
  }

  // --- item ----------------------------------------------------------------
  hasil.item = rapikan(sisa);

  // --- kategori ------------------------------------------------------------
  hasil.kategori = tebakKategori(hasil.item, opsi.riwayat);
  return hasil;
}

function rapikan(teks) {
  const bersih = teks
    .replace(/\b(beli|bayar|buat|untuk|utk|di|ke|dari|seharga|harga|sebesar)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}&'.\- ]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!bersih) return '';
  // Huruf besar hanya ditambahkan pada kata yang seluruhnya huruf kecil. Kata
  // yang sudah memuat huruf besar dibiarkan apa adanya, supaya "PBB", "KOI",
  // dan "buNa" tidak ikut diseragamkan.
  return bersih.split(' ').map((k) =>
    k === k.toLowerCase() ? k.charAt(0).toUpperCase() + k.slice(1) : k
  ).join(' ');
}

/**
 * Riwayat dipakai lebih dulu supaya aplikasi ikut kebiasaan Ryan: kalau
 * "Bravo" selama ini dicatat sebagai Pangan, tebakan berikutnya juga Pangan
 * walau kata kuncinya tidak cocok.
 */
export function tebakKategori(item, riwayat) {
  const teks = String(item || '').toLowerCase().trim();
  if (!teks) return null;

  if (riwayat && riwayat.length) {
    const kunciPersis = new Map();
    const kunciSebagian = [];
    for (const t of riwayat) {
      if (!t.item || !t.kategori) continue;
      const nama = t.item.toLowerCase().trim();
      if (nama === teks) hitung(kunciPersis, t.kategori);
      else if (nama.length >= 4 && (teks.includes(nama) || nama.includes(teks))) {
        kunciSebagian.push(t.kategori);
      }
    }
    const persis = teratas(kunciPersis);
    if (persis) return persis;
    if (kunciSebagian.length) {
      const peta = new Map();
      kunciSebagian.forEach((k) => hitung(peta, k));
      const sering = teratas(peta);
      if (sering) return sering;
    }
  }

  for (const [kategori, pola] of KATA_KUNCI) {
    if (pola.test(teks)) return kategori;
  }
  return null;
}

function hitung(peta, k) { peta.set(k, (peta.get(k) || 0) + 1); }
function teratas(peta) {
  let terbaik = null, n = 0;
  for (const [k, v] of peta) if (v > n) { n = v; terbaik = k; }
  return terbaik;
}

// ------------------------------------------------------------------ tanggal --

function susun(th, bl, hr) {
  if (!(bl >= 1 && bl <= 12) || !(hr >= 1 && hr <= 31)) return null;
  if (hr > new Date(th, bl, 0).getDate()) return null;
  return `${th}-${pad(bl)}-${pad(hr)}`;
}

export function geserHari(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "senin" berarti Senin yang baru lewat, bukan Senin depan. */
function hariTerakhir(indeks) {
  const d = new Date();
  const mundur = (d.getDay() - indeks + 7) % 7 || 7;
  return geserHari(hariIni(), -mundur);
}

// ------------------------------------------------------------- banyak baris --

/** Penanda daftar di awal baris: "- ", "• ", "1. ", "3) ".
 *  Spasi sesudahnya wajib, supaya "1,5jt tennis" dan "3/4 galon" tidak terpotong. */
const PENANDA_DAFTAR = /^\s*(?:[-•*·–—]|\d{1,2}[.)])\s+/;

const BATAS_BARIS = 40;

/**
 * Membaca banyak baris sekaligus. Tiap baris dilewatkan ke `baca()` yang sama,
 * jadi tebakan tanggal dan kategorinya persis seperti mode satu transaksi.
 * Teks asli tiap baris ikut dibawa di `mentah` supaya baris yang gagal terbaca
 * masih bisa ditampilkan apa adanya, bukan hilang diam-diam.
 *
 * @param {string} teks
 * @param {{riwayat?: Array, bulanAktif?: string}} opsi
 * @returns {Array<object>}
 */
export function bacaBanyak(teks, opsi = {}) {
  return String(teks || '')
    .split(/\r?\n/)
    .map((b) => b.replace(PENANDA_DAFTAR, '').trim())
    .filter(Boolean)
    .slice(0, BATAS_BARIS)
    .map((mentah) => ({ mentah, ...(baca(mentah, opsi) || kosong()) }));
}

function kosong() {
  return { tanggal: hariIni(), nominal: null, item: '', kategori: null, pastiTanggal: false };
}
