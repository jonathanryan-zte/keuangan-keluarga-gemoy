// Keadaan aplikasi + semua hitungan turunan.
// Satu tempat, supaya angka di dashboard, anggaran, dan laporan tidak pernah
// berbeda gara-gara dihitung dua kali dengan cara berbeda.
//
// Rumusnya meniru `REKAP BULANAN` di spreadsheet persis: pemasukan dijumlah
// dari Jenis, empat pos dijumlah dari Kelompok, dan sisa = pemasukan dikurangi
// keempat pos. Apa pun yang berkelompok `Transfer / Tidak dihitung` tidak ikut
// — dan justru kelompok itulah yang dipakai baris pemasukan, jadi uang masuk
// tidak pernah terhitung dua kali.

import { lokal } from './simpanan.js';
import { bulanIni, hariIni, jumlahHari, geserBulan } from './rupiah.js';
import { susunTarget } from './target.js';

export const PENANDA_RUTIN = '#rutin:';

export const NETRAL = 'Transfer / Tidak dihitung';
export const POS = ['Harian 40%', 'Saving 30%', 'Perpuluhan/Sosial 10%', 'Kegiatan Luar 20%'];

export const st = {
  siap: false,
  profil: {
    // Bawaan ini cuma dipakai sebelum panggilan pertama ke Sheet berhasil —
    // isinya disalin dari tab PILIHAN supaya form tetap bisa dipakai saat
    // aplikasi dibuka pertama kali tanpa sinyal.
    pilihan: {
      jenis: ['Pemasukan', 'Pengeluaran', 'Alokasi Tujuan', 'Transfer'],
      kelompok: POS.concat([NETRAL]),
      bayarPakai: ['BCA Suami', 'BCA Istri', 'Cash', 'QRIS/E-Wallet', 'Kartu Kredit',
                   'Rekening Saving', 'Investasi', 'Lainnya'],
      milik: ['Suami', 'Istri', 'Bersama']
    },
    pos: POS,
    kelompokNetral: NETRAL,
    kategori: [],
    // Kategori yang disisihkan. Tidak muncul lagi sebagai pilihan, tapi
    // namanya tetap dikenali supaya transaksi lama tidak jadi yatim.
    kategoriArsip: [],
    kategoriKelompok: {},
    target: { pos: { 'Harian 40%': 40, 'Saving 30%': 30, 'Perpuluhan/Sosial 10%': 10, 'Kegiatan Luar 20%': 20 }, rupiah: [] },
    tabTulis: 'KKG Transaksi',
    vapidPublik: ''
  },
  transaksi: [],
  rutin: [],
  anggaran: [],
  belanja: [],
  bulan: bulanIni(),
  layar: 'beranda',
  antri: 0,
  online: navigator.onLine
};

const pendengar = new Set();
export function dengar(fn) { pendengar.add(fn); return () => pendengar.delete(fn); }
export function umumkan() { pendengar.forEach((fn) => fn()); }

export function muatCache() {
  const c = lokal.ambil('cache');
  if (!c) return false;
  Object.assign(st, {
    transaksi: c.transaksi || [], rutin: c.rutin || [],
    anggaran: c.anggaran || [], belanja: c.belanja || [],
    profil: c.profil || st.profil
  });
  return true;
}

export function simpanCache() {
  lokal.simpan('cache', {
    transaksi: st.transaksi, rutin: st.rutin,
    anggaran: st.anggaran, belanja: st.belanja,
    profil: st.profil
  });
}

export function terapkanMuatan(d) {
  st.transaksi = d.transaksi || [];
  st.rutin = d.rutin || [];
  st.anggaran = d.anggaran || [];
  st.belanja = d.belanja || [];
  if (d.profil) {
    st.profil = {
      ...st.profil, ...d.profil,
      pilihan: { ...st.profil.pilihan, ...(d.profil.pilihan || {}) },
      target: { ...st.profil.target, ...(d.profil.target || {}) }
    };
  }
  st.siap = true;
  simpanCache();
}

/** Id transaksi. Satu tempat, dipakai form satuan, borongan, dan centang rutin. */
export function idTransaksi() {
  return `trx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Sisipkan/ganti satu transaksi di memori supaya tampilan langsung berubah. */
export function taruhTransaksi(t) {
  const i = st.transaksi.findIndex((x) => x.id === t.id);
  if (i >= 0) st.transaksi[i] = t; else st.transaksi.push(t);
  simpanCache();
}

export function buangTransaksi(id) {
  st.transaksi = st.transaksi.filter((t) => t.id !== id);
  simpanCache();
}

// ------------------------------------------------------------- pemilihan --

export function bulanTersedia() {
  const set = new Set(st.transaksi.map((t) => t.bulan).filter(Boolean));
  set.add(bulanIni());
  set.add(st.bulan);
  return [...set].sort();
}

export function transaksiBulan(bulan = st.bulan) {
  return st.transaksi.filter((t) => t.bulan === bulan);
}

/** Pos-pos yang benar-benar dihitung. Datang dari Sheet, dengan bawaan lokal. */
export function daftarPos() {
  return st.profil.pos?.length ? st.profil.pos : POS;
}

export function netral() {
  return st.profil.kelompokNetral || NETRAL;
}

export function ringkas(bulan = st.bulan) {
  const pos = daftarPos();
  const r = {
    bulan, pemasukan: 0, totalKeluar: 0, sisa: 0,
    pos: {},
    wajib: 0, keinginan: 0,                // seluruh pengeluaran empat pos
    harianWajib: 0, harianKeinginan: 0,    // khusus pos Harian
    jumlah: 0
  };
  pos.forEach((k) => { r.pos[k] = 0; });

  for (const t of transaksiBulan(bulan)) {
    r.jumlah++;
    if (t.jenis === 'Pemasukan') r.pemasukan += t.nominal;
    if (r.pos[t.kelompok] === undefined) continue;
    r.pos[t.kelompok] += t.nominal;
    const keinginan = t.sifat === 'KEINGINAN';
    if (keinginan) r.keinginan += t.nominal; else r.wajib += t.nominal;
    if (t.kelompok === pos[0]) {
      if (keinginan) r.harianKeinginan += t.nominal; else r.harianWajib += t.nominal;
    }
  }

  pos.forEach((k) => { r.totalKeluar += r.pos[k]; });
  r.sisa = r.pemasukan - r.totalKeluar;
  r.harian = r.pos[pos[0]] || 0;
  return r;
}

/** Target rupiah tiap pos bulan ini: persen dari TARGET × pemasukan bulan itu. */
export function targetPos(bulan = st.bulan) {
  const r = ringkas(bulan);
  const persen = st.profil.target?.pos || {};
  const out = {};
  daftarPos().forEach((k) => {
    out[k] = {
      kelompok: k,
      persen: persen[k] ?? persenDariNama(k),
      target: r.pemasukan * ((persen[k] ?? persenDariNama(k)) / 100),
      terpakai: r.pos[k] || 0
    };
    out[k].sisa = out[k].target - out[k].terpakai;
    out[k].bagian = out[k].target ? (out[k].terpakai / out[k].target) * 100 : null;
  });
  return out;
}

/** Persen yang sudah tertulis di nama kelompoknya sendiri: 'Saving 30%' → 30. */
export function persenDariNama(kelompok) {
  const m = String(kelompok).match(/(\d+)\s*%/);
  return m ? Number(m[1]) : 0;
}

export function perKategori(bulan = st.bulan, kelompok = null) {
  const pos = daftarPos();
  const peta = new Map();
  for (const t of transaksiBulan(bulan)) {
    if (kelompok ? t.kelompok !== kelompok : pos.indexOf(t.kelompok) < 0) continue;
    const k = t.kategori || 'Lainnya';
    peta.set(k, (peta.get(k) || 0) + t.nominal);
  }
  return [...peta.entries()]
    .map(([kategori, nominal]) => ({ kategori, nominal }))
    .sort((a, b) => b.nominal - a.nominal);
}

/**
 * Laju belanja harian & proyeksi. Hanya menghitung pos harian — alokasi saving,
 * perpuluhan, dan kegiatan luar biasanya disetor sekali di awal bulan dan akan
 * membuat rata-rata harian melompat tidak wajar.
 */
export function laju(bulan = st.bulan) {
  const hari = jumlahHari(bulan);
  const iniBulanBerjalan = bulan === bulanIni();
  const hariBerjalan = iniBulanBerjalan ? Number(hariIni().slice(8)) : hari;
  const r = ringkas(bulan);
  const rata = hariBerjalan ? r.harian / hariBerjalan : 0;
  const sisaHari = Math.max(hari - hariBerjalan, 0);
  const perkiraanAkhir = r.harian + rata * sisaHari;

  // "Uang aman sampai tanggal berapa" — sisa uang dibagi laju harian.
  let amanSampai = null;
  if (iniBulanBerjalan && rata > 0 && r.sisa > 0) {
    const tambahanHari = Math.floor(r.sisa / rata);
    amanSampai = tambahanHari >= sisaHari ? 'akhir bulan'
      : `tanggal ${Math.min(hariBerjalan + tambahanHari, hari)}`;
  }
  return { hari, hariBerjalan, sisaHari, rata, perkiraanAkhir, amanSampai, iniBulanBerjalan };
}

// -------------------------------------------------------------- anggaran --

/** Bulan bisa tiba sebagai '2026-09' atau tanggal penuh; ambil 7 huruf awal. */
function bulanSaja(v) {
  return String(v || '').slice(0, 7);
}

function disisihkan(a) {
  return String(a.status || 'aktif') === 'arsip';
}

/** Pagu yang masih berlaku di satu ruang — yang disisihkan tidak ikut. */
function paguHidup(bulan, ruang) {
  return st.anggaran.filter((a) =>
    bulanSaja(a.bulan) === bulan && String(a.ruang || 'kategori') === ruang && !disisihkan(a));
}

/**
 * Pagu rupiah per pos, kalau Ryan memasangnya. Kosong berarti pakai target
 * persen dari TARGET — itu jalur bawaannya, dan pagu rupiah cuma pengecualian
 * untuk bulan yang memang direncanakan lain.
 */
export function paguPos(bulan = st.bulan) {
  const peta = new Map(paguHidup(bulan, 'kelompok').map((a) => [a.nama, a.pagu]));
  return peta;
}

export function anggaranBulan(bulan = st.bulan, kelompok = null) {
  const pakai = new Map(perKategori(bulan, kelompok).map((x) => [x.kategori, x.nominal]));
  const arsip = new Set(kategoriDisisihkan());
  const pagu = new Map(paguHidup(bulan, 'kategori').map((a) => [a.nama, a.pagu]));
  // Kalau bulan ini belum punya pagu, pakai pagu bulan terakhir yang ada —
  // kecuali kategori yang sejak itu sudah disisihkan. Mewariskan pagu kategori
  // yang sudah ditinggalkan sama saja menghidupkannya diam-diam.
  if (!pagu.size) {
    const bulanPagu = [...new Set(st.anggaran
      .filter((a) => String(a.ruang || 'kategori') === 'kategori' && !disisihkan(a))
      .map((a) => bulanSaja(a.bulan)))]
      .filter((b) => b && b < bulan).sort().pop();
    if (bulanPagu) {
      paguHidup(bulanPagu, 'kategori').forEach((a) => {
        if (!arsip.has(a.nama)) pagu.set(a.nama, a.pagu);
      });
    }
  }
  const kategori = new Set([...pagu.keys(), ...pakai.keys()]);
  return [...kategori]
    // Yang dipagu tapi bukan milik kelompok yang sedang dilihat tidak perlu
    // ikut nimbrung; kalau tidak, satu pagu muncul di keempat kartu pos.
    .filter((k) => !kelompok || pakai.has(k) || kelompokKategori(k) === kelompok)
    // Kategori yang sudah disisihkan dan tidak dipakai bulan ini tidak perlu
    // menuh-menuhi layar. Kalau masih ada belanjanya, tetap ditampilkan —
    // angka di layar Anggaran harus selalu sama dengan angka di Beranda.
    .filter((k) => !arsip.has(k) || (pakai.get(k) || 0) > 0)
    .map((k) => {
      const p = pagu.get(k) || 0;
      const t = pakai.get(k) || 0;
      return {
        kategori: k, pagu: p, terpakai: t, kelompok: kelompokKategori(k),
        persen: p ? (t / p) * 100 : null, arsip: arsip.has(k)
      };
    })
    .sort((a, b) => Number(a.arsip) - Number(b.arsip) ||
                    (b.pagu || 0) - (a.pagu || 0) || b.terpakai - a.terpakai);
}

/** Pagu bulan ini yang pernah ada tapi sudah disisihkan — riwayatnya. */
export function paguDisisihkan(bulan = st.bulan) {
  return st.anggaran
    .filter((a) => bulanSaja(a.bulan) === bulan && disisihkan(a) &&
                   String(a.ruang || 'kategori') === 'kategori')
    .map((a) => ({ kategori: a.nama, pagu: a.pagu }))
    .sort((a, b) => b.pagu - a.pagu);
}

/** Sisipkan/ganti satu pagu di memori. */
export function taruhPagu(rekam) {
  const ruang = rekam.ruang || 'kategori';
  const i = st.anggaran.findIndex(
    (a) => bulanSaja(a.bulan) === rekam.bulan &&
           String(a.ruang || 'kategori') === ruang && a.nama === rekam.nama);
  const isi = { ...rekam, ruang, status: 'aktif' };
  if (i >= 0) st.anggaran[i] = isi; else st.anggaran.push(isi);
  simpanCache();
}

// ---------------------------------------------------------------- kategori --
//
// Daftar kategori datang dari kolom Kategori tab `PILIHAN`, ditambah kategori
// milik aplikasi di tab `KKG Kategori`. Yang disisihkan tidak dibuang, hanya
// dipindah ke `kategoriArsip` — jadi transaksi lama tetap punya nama yang
// dikenali, dan kategorinya bisa dipakai lagi kapan saja.

export function kategoriAktif() {
  return st.profil.kategori || [];
}

export function kategoriDisisihkan() {
  return st.profil.kategoriArsip || [];
}

/** Kelompok yang disarankan untuk sebuah kategori, kalau pernah dicatat. */
export function kelompokKategori(nama) {
  const dari = st.profil.kategoriKelompok || {};
  if (dari[nama]) return dari[nama];
  // Belum ada sarannya di Sheet: pakai kelompok yang paling sering dipakai
  // kategori ini di riwayat sendiri. Lebih tepat daripada menebak dari nama.
  const hitung = new Map();
  for (const t of st.transaksi) {
    if (t.kategori !== nama || !t.kelompok || t.kelompok === netral()) continue;
    hitung.set(t.kelompok, (hitung.get(t.kelompok) || 0) + 1);
  }
  let juara = '';
  let n = 0;
  hitung.forEach((v, k) => { if (v > n) { n = v; juara = k; } });
  return juara;
}

/**
 * Pilihan kategori untuk form. Kategori yang sedang terpilih ikut ditampilkan
 * walau sudah disisihkan — kalau tidak, mengedit transaksi lama diam-diam
 * mengosongkan kategorinya.
 */
export function pilihanKategori(terpilih) {
  const aktif = kategoriAktif();
  return terpilih && !aktif.includes(terpilih) ? [...aktif, terpilih] : aktif;
}

/** Kategori ini pernah ada — aktif maupun sudah disisihkan. */
export function kategoriDikenal(nama) {
  return kategoriAktif().includes(nama) || kategoriDisisihkan().includes(nama);
}

/** Berapa transaksi yang masih memakai kategori ini — untuk peringatan. */
export function pemakaiKategori(nama) {
  return st.transaksi.filter((t) => t.kategori === nama).length;
}

function buang(daftar, nama) {
  const i = daftar.indexOf(nama);
  if (i >= 0) daftar.splice(i, 1);
}

/**
 * Ubah daftar kategori di memori lebih dulu, kirim ke Sheet belakangan.
 * Layar langsung berubah walau sinyal sedang mati.
 */
export function pakaiKategori(nama, kelompok) {
  if (!st.profil.kategoriArsip) st.profil.kategoriArsip = [];
  if (!st.profil.kategori) st.profil.kategori = [];
  buang(st.profil.kategoriArsip, nama);
  if (!st.profil.kategori.includes(nama)) st.profil.kategori.push(nama);
  if (kelompok) {
    if (!st.profil.kategoriKelompok) st.profil.kategoriKelompok = {};
    st.profil.kategoriKelompok[nama] = kelompok;
  }
  simpanCache();
}

export function sisihkanKategori(nama, sejak = st.bulan) {
  if (!st.profil.kategoriArsip) st.profil.kategoriArsip = [];
  buang(st.profil.kategori, nama);
  if (!st.profil.kategoriArsip.includes(nama)) st.profil.kategoriArsip.push(nama);
  // Pagu bulan berjalan dan sesudahnya ikut disisihkan; bulan yang sudah lewat
  // dibiarkan utuh sebagai riwayat. Aturannya sama persis dengan Apps Script.
  st.anggaran.forEach((a) => {
    if (String(a.ruang || 'kategori') !== 'kategori') return;
    if (a.nama === nama && bulanSaja(a.bulan) >= sejak) a.status = 'arsip';
  });
  simpanCache();
}

// ------------------------------------------------------------------ target --

/**
 * Nama di tab `TARGET` dan nama kategori di `PILIHAN` memang tidak sama —
 * "Utang kakak suami" vs "Hutang Kakak Suami", "Renovasi atap + kitchen set"
 * vs "Renovasi Atap & Kitchen Set". Jembatannya ditulis di sini, terbuka,
 * daripada dipaksakan lewat pencocokan kira-kira yang diam-diam meleset.
 */
const TARGET_KE_KATEGORI = {
  'renovasi atap + kitchen set': 'Renovasi Atap & Kitchen Set',
  'utang kakak suami': 'Hutang Kakak Suami',
  'trip luar kota': 'Keluar Kota Bulanan',
  'travel luar negeri': 'Luar Negeri Tahunan',
  'kpr tahap 1': 'KPR',
  'kpr tahap 2': 'KPR'
};

/** Total yang pernah masuk sebuah pos, sepanjang riwayat. */
export function terkumpulPos(kelompok) {
  return st.transaksi
    .filter((t) => t.kelompok === kelompok)
    .reduce((n, t) => n + t.nominal, 0);
}

/**
 * Target rupiah dari tab `TARGET`, lengkap dengan kemajuannya masing-masing.
 * Cara membacanya berbeda per periode — bulanan, tahunan, cicilan, saldo utang,
 * atau target total — dan aturannya tinggal di `target.js` supaya bisa diuji
 * dari Node. Lihat `tools/uji_target.js`.
 *
 * Kelompok netral dibuang di sini, bukan di sana: pembayaran tagihan kartu
 * kredit berkelompok `Transfer / Tidak dihitung` dan bukan setoran ke target.
 */
export function daftarTarget(bulan = st.bulan) {
  const baris = (st.profil.target?.rupiah || []).map((t) => ({
    nama: t.nama, nilai: t.nilai, periode: t.periode, keterangan: t.keterangan,
    kategori: TARGET_KE_KATEGORI[String(t.nama).toLowerCase()] || null
  }));
  const dihitung = st.transaksi.filter((t) => t.kelompok !== netral());
  return susunTarget(baris, dihitung, bulan);
}

/** Kategori yang dipakai target mana pun — dipakai menyaring daftar setoran. */
export function kategoriTarget() {
  return new Set(Object.values(TARGET_KE_KATEGORI));
}

/** Setoran ke target mana pun, terbaru lebih dulu. */
export function setoranTarget(batas = 8) {
  const kat = kategoriTarget();
  return st.transaksi
    .filter((t) => kat.has(t.kategori) && t.kelompok !== netral())
    .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))
    .slice(0, batas);
}

// -------------------------------------------------------------------- rutin --

/**
 * Satu tagihan dianggap lunas bulan X kalau ada transaksi bulan X yang
 * catatannya memuat `#rutin:<id>`. Aturan ini persis sama dengan yang dipakai
 * Apps Script untuk pengingat pagi, supaya keduanya tidak pernah beda pendapat.
 */
export function statusRutin(bulan = st.bulan) {
  const terbayar = new Map();
  for (const t of transaksiBulan(bulan)) {
    const pos = (t.catatan || '').indexOf(PENANDA_RUTIN);
    if (pos < 0) continue;
    terbayar.set(t.catatan.slice(pos + PENANDA_RUTIN.length).split(/[\s,;]/)[0], t);
  }
  return st.rutin.filter((r) => r.aktif).map((r) => {
    const info = hitungTermin(r, bulan);
    return {
      rutin: r, bulan,
      jatuhTempo: `${bulan}-${String(Math.min(Math.max(r.hariJatuhTempo || 1, 1), jumlahHari(bulan))).padStart(2, '0')}`,
      transaksi: terbayar.get(r.id) || null,
      terbayar: terbayar.has(r.id),
      ...info
    };
  }).filter((s) => !s.selesai)
    .sort((a, b) => Number(a.terbayar) - Number(b.terbayar) || a.jatuhTempo.localeCompare(b.jatuhTempo));
}

export function hitungTermin(r, bulan) {
  if (r.tipe !== 'cicilan' || !r.totalTermin || !r.mulai) {
    return { terminKe: 0, selesai: false, bulanLunas: '' };
  }
  const mulai = bulanSaja(r.mulai);
  const ke = selisihBulan(mulai, bulan) + 1;
  return {
    terminKe: ke,
    selesai: ke > r.totalTermin || ke < 1,
    bulanLunas: geserBulan(mulai, r.totalTermin - 1)
  };
}

export function selisihBulan(a, b) {
  const [ta, ba] = a.split('-').map(Number);
  const [tb, bb] = b.split('-').map(Number);
  return (tb - ta) * 12 + (bb - ba);
}

/** Tagihan yang jatuh tempo dalam `hari` ke depan dan belum dibayar. */
export function jatuhTempoDekat(hari = 7) {
  const batas = new Date();
  batas.setDate(batas.getDate() + hari);
  const batasIso = batas.toISOString().slice(0, 10);
  return statusRutin(bulanIni())
    .filter((s) => !s.terbayar && s.jatuhTempo <= batasIso)
    .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo));
}

// ------------------------------------------------------------------ belanja --
//
// Satu barang = satu baris, selamanya. Mencentang tidak membuang barisnya,
// hanya memindahkannya ke status 'simpan' dan mencap tanggalnya — jadi daftar
// bersih setiap kali, tapi pertanyaan "kapan terakhir beli beras" tetap bisa
// dijawab. Yang tidak mau disarankan lagi diberi status 'arsip', bukan dihapus.

export function idBelanja() {
  return `blj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Sisipkan/ganti satu barang di memori supaya layar langsung berubah. */
export function taruhBelanja(b) {
  const i = st.belanja.findIndex((x) => x.id === b.id);
  if (i >= 0) st.belanja[i] = b; else st.belanja.push(b);
  simpanCache();
}

function statusBelanja(b) {
  return String(b.status || 'aktif');
}

/** Yang sedang ada di daftar belanja — belum dicentang. */
export function belanjaAktif() {
  return st.belanja.filter((b) => statusBelanja(b) === 'aktif')
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/**
 * Barang yang pernah dibeli dan sedang tidak di daftar. Diurutkan dari yang
 * paling lama tidak dibeli — barang yang kemungkinan besar sudah habis naik
 * sendiri ke atas, dan itulah gunanya menyimpan tanggalnya.
 */
export function belanjaDiingat() {
  return st.belanja.filter((b) => statusBelanja(b) === 'simpan')
    .sort((a, b) => (a.terakhir || '').localeCompare(b.terakhir || '') ||
                    a.nama.localeCompare(b.nama, 'id'));
}

export function belanjaDisisihkan() {
  return st.belanja.filter((b) => statusBelanja(b) === 'arsip')
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/**
 * Cari barang dengan nama yang sama tanpa peduli huruf besar-kecil, supaya
 * "telur" tidak jadi barang kedua di sebelah "Telur" — kalau itu terjadi,
 * catatan "terakhir beli"-nya pecah dua dan fiturnya kehilangan gunanya.
 */
export function cariBelanja(nama) {
  const k = String(nama || '').trim().toLowerCase();
  return st.belanja.find((b) => b.nama.trim().toLowerCase() === k) || null;
}

/** Keterangan yang paling sering dipakai, untuk saran di form input. */
export function itemSering(jenis, batas = 12) {
  const peta = new Map();
  for (const t of st.transaksi) {
    if (jenis && t.jenis !== jenis) continue;
    if (!t.keterangan) continue;
    const k = t.keterangan.trim();
    const p = peta.get(k) || {
      item: k, n: 0, kategori: t.kategori, kelompok: t.kelompok,
      nominal: t.nominal, terakhir: t.tanggal
    };
    p.n++;
    if (t.tanggal > p.terakhir) {
      p.terakhir = t.tanggal; p.kategori = t.kategori;
      p.kelompok = t.kelompok; p.nominal = t.nominal;
    }
    peta.set(k, p);
  }
  return [...peta.values()]
    .sort((a, b) => b.n - a.n || b.terakhir.localeCompare(a.terakhir))
    .slice(0, batas);
}
