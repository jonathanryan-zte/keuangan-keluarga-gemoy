// Keadaan aplikasi + semua hitungan turunan.
// Satu tempat, supaya angka di dashboard, anggaran, dan laporan tidak pernah
// berbeda gara-gara dihitung dua kali dengan cara berbeda.

import { lokal } from './simpanan.js';
import { bulanIni, hariIni, jumlahHari, geserBulan } from './rupiah.js';

export const PENANDA_RUTIN = '#rutin:';

export const st = {
  siap: false,
  profil: {
    persen: { perpuluhan: 10, saving: 30, entertain: 20 },
    basisPersenKategori: ['Gaji Pokok', 'Gaji BRU', 'Tunjangan', 'Uang Makan'],
    kategori: {
      PEMASUKAN: ['Gaji Pokok', 'Gaji BRU', 'Tunjangan', 'Uang Makan', 'Gaji Ryan',
                  'Fee & Honor', 'THR & Bonus', 'Cicilan Masuk', 'Lainnya'],
      TETAP: ['Arisan', 'Rumah', 'Utilitas', 'Langganan', 'Transport', 'Cicilan',
              'Keluarga', 'Kartu Kredit', 'Uang Makan'],
      RUMAH_TANGGA: ['Pangan', 'Sandang', 'Papan', 'Hobi', 'Gift', 'Travelling',
                     'Kesehatan', 'Lainnya']
    },
    // Kategori yang disisihkan. Tidak muncul lagi sebagai pilihan, tapi
    // namanya tetap dikenali supaya transaksi lama tidak jadi yatim.
    kategoriArsip: { PEMASUKAN: [], TETAP: [], RUMAH_TANGGA: [] },
    vapidPublik: ''
  },
  transaksi: [],
  rutin: [],
  anggaran: [],
  saving: [],
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
    anggaran: c.anggaran || [], saving: c.saving || [],
    belanja: c.belanja || [],
    profil: c.profil || st.profil
  });
  return true;
}

export function simpanCache() {
  lokal.simpan('cache', {
    transaksi: st.transaksi, rutin: st.rutin,
    anggaran: st.anggaran, saving: st.saving, belanja: st.belanja,
    profil: st.profil
  });
}

export function terapkanMuatan(d) {
  st.transaksi = d.transaksi || [];
  st.rutin = d.rutin || [];
  st.anggaran = d.anggaran || [];
  st.saving = d.saving || [];
  st.belanja = d.belanja || [];
  if (d.profil) {
    st.profil = {
      ...st.profil, ...d.profil,
      kategoriArsip: { ...st.profil.kategoriArsip, ...(d.profil.kategoriArsip || {}) }
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

export function ringkas(bulan = st.bulan) {
  const basis = new Set(st.profil.basisPersenKategori);
  const r = {
    bulan, pemasukan: 0, tetap: 0, rumahTangga: 0, basis: 0,
    wajib: 0, keinginan: 0,        // seluruh pengeluaran
    rtWajib: 0, rtKeinginan: 0,    // khusus rumah tangga
    jumlah: 0
  };
  for (const t of transaksiBulan(bulan)) {
    r.jumlah++;
    if (t.jenis === 'PEMASUKAN') {
      r.pemasukan += t.nominal;
      if (basis.has(t.kategori)) r.basis += t.nominal;
    } else {
      const keinginan = t.sifat === 'KEINGINAN';
      if (t.jenis === 'TETAP') {
        r.tetap += t.nominal;
      } else {
        r.rumahTangga += t.nominal;
        if (keinginan) r.rtKeinginan += t.nominal; else r.rtWajib += t.nominal;
      }
      if (keinginan) r.keinginan += t.nominal; else r.wajib += t.nominal;
    }
  }
  const p = st.profil.persen;
  r.pengeluaran = r.tetap + r.rumahTangga;
  r.sisa = r.pemasukan - r.pengeluaran;
  r.perpuluhan = r.basis * (p.perpuluhan / 100);
  r.saving = r.basis * (p.saving / 100);
  r.entertain = r.basis * (p.entertain / 100);
  return r;
}

export function perKategori(bulan = st.bulan, jenis = 'RUMAH_TANGGA') {
  const peta = new Map();
  for (const t of transaksiBulan(bulan)) {
    if (t.jenis !== jenis) continue;
    const k = t.kategori || 'Lainnya';
    peta.set(k, (peta.get(k) || 0) + t.nominal);
  }
  return [...peta.entries()]
    .map(([kategori, nominal]) => ({ kategori, nominal }))
    .sort((a, b) => b.nominal - a.nominal);
}

/**
 * Laju belanja harian & proyeksi. Hanya menghitung pengeluaran rumah tangga —
 * tagihan tetap sudah punya jadwalnya sendiri dan akan membuat rata-rata
 * harian melompat tidak wajar di awal bulan.
 */
export function laju(bulan = st.bulan) {
  const hari = jumlahHari(bulan);
  const iniBulanBerjalan = bulan === bulanIni();
  const hariBerjalan = iniBulanBerjalan ? Number(hariIni().slice(8)) : hari;
  const r = ringkas(bulan);
  const rata = hariBerjalan ? r.rumahTangga / hariBerjalan : 0;
  const sisaHari = Math.max(hari - hariBerjalan, 0);
  const perkiraanAkhir = r.rumahTangga + rata * sisaHari;

  // "Uang aman sampai tanggal berapa" — sisa uang dibagi laju harian.
  let amanSampai = null;
  if (iniBulanBerjalan && rata > 0 && r.sisa > 0) {
    const tambahanHari = Math.floor(r.sisa / rata);
    amanSampai = tambahanHari >= sisaHari ? 'akhir bulan'
      : `tanggal ${Math.min(hariBerjalan + tambahanHari, hari)}`;
  }
  return { hari, hariBerjalan, sisaHari, rata, perkiraanAkhir, amanSampai, iniBulanBerjalan };
}

/** Bulan bisa tiba sebagai '2026-09' atau tanggal penuh; ambil 7 huruf awal. */
function bulanSaja(v) {
  return String(v || '').slice(0, 7);
}

/** Pagu yang masih berlaku — yang sudah disisihkan tidak ikut berhitung. */
function paguHidup(bulan) {
  return st.anggaran.filter((a) => bulanSaja(a.bulan) === bulan && !disisihkan(a));
}

function disisihkan(a) {
  return String(a.status || 'aktif') === 'arsip';
}

export function anggaranBulan(bulan = st.bulan) {
  const pakai = new Map(perKategori(bulan).map((x) => [x.kategori, x.nominal]));
  const arsip = new Set(kategoriDisisihkan('RUMAH_TANGGA'));
  const pagu = new Map(paguHidup(bulan).map((a) => [a.kategori, a.pagu]));
  // Kalau bulan ini belum punya pagu, pakai pagu bulan terakhir yang ada —
  // kecuali kategori yang sejak itu sudah disisihkan. Mewariskan pagu kategori
  // yang sudah ditinggalkan sama saja menghidupkannya diam-diam.
  if (!pagu.size) {
    const bulanPagu = [...new Set(st.anggaran.filter((a) => !disisihkan(a)).map((a) => bulanSaja(a.bulan)))]
      .filter((b) => b && b < bulan).sort().pop();
    if (bulanPagu) {
      paguHidup(bulanPagu).forEach((a) => { if (!arsip.has(a.kategori)) pagu.set(a.kategori, a.pagu); });
    }
  }
  const kategori = new Set([...pagu.keys(), ...pakai.keys()]);
  return [...kategori]
    // Kategori yang sudah disisihkan dan tidak dipakai bulan ini tidak perlu
    // menuh-menuhi layar. Kalau masih ada belanjanya, tetap ditampilkan —
    // angka di layar Anggaran harus selalu sama dengan angka di Beranda.
    .filter((k) => !arsip.has(k) || (pakai.get(k) || 0) > 0)
    .map((k) => {
      const p = pagu.get(k) || 0;
      const t = pakai.get(k) || 0;
      return {
        kategori: k, pagu: p, terpakai: t,
        persen: p ? (t / p) * 100 : null, arsip: arsip.has(k)
      };
    })
    .sort((a, b) => Number(a.arsip) - Number(b.arsip) ||
                    (b.pagu || 0) - (a.pagu || 0) || b.terpakai - a.terpakai);
}

/** Pagu bulan ini yang pernah ada tapi sudah disisihkan — riwayatnya. */
export function paguDisisihkan(bulan = st.bulan) {
  return st.anggaran
    .filter((a) => bulanSaja(a.bulan) === bulan && disisihkan(a))
    .map((a) => ({ kategori: a.kategori, pagu: a.pagu }))
    .sort((a, b) => b.pagu - a.pagu);
}

// ---------------------------------------------------------------- kategori --
//
// Daftar kategori datang dari tab `Kategori` di Sheet. Yang disisihkan tidak
// dibuang, hanya dipindah ke `kategoriArsip` — jadi transaksi lama tetap punya
// nama yang dikenali, dan kategorinya bisa dipakai lagi kapan saja.

export function kategoriAktif(jenis) {
  return st.profil.kategori?.[jenis] || [];
}

export function kategoriDisisihkan(jenis) {
  return st.profil.kategoriArsip?.[jenis] || [];
}

/**
 * Pilihan kategori untuk form. Kategori yang sedang terpilih ikut ditampilkan
 * walau sudah disisihkan — kalau tidak, mengedit transaksi lama diam-diam
 * mengosongkan kategorinya.
 */
export function pilihanKategori(jenis, terpilih) {
  const aktif = kategoriAktif(jenis);
  return terpilih && !aktif.includes(terpilih) ? [...aktif, terpilih] : aktif;
}

/** Kategori ini pernah ada di jenis tersebut — aktif maupun sudah disisihkan. */
export function kategoriDikenal(jenis, nama) {
  return kategoriAktif(jenis).includes(nama) || kategoriDisisihkan(jenis).includes(nama);
}

/** Berapa transaksi yang masih memakai kategori ini — untuk peringatan. */
export function pemakaiKategori(jenis, nama) {
  return st.transaksi.filter((t) => t.jenis === jenis && t.kategori === nama).length;
}

function daftarProfil(kunci, jenis) {
  if (!st.profil[kunci]) st.profil[kunci] = {};
  if (!st.profil[kunci][jenis]) st.profil[kunci][jenis] = [];
  return st.profil[kunci][jenis];
}

function buang(daftar, nama) {
  const i = daftar.indexOf(nama);
  if (i >= 0) daftar.splice(i, 1);
}

/**
 * Ubah daftar kategori di memori lebih dulu, kirim ke Sheet belakangan.
 * Layar langsung berubah walau sinyal sedang mati.
 */
export function pakaiKategori(jenis, nama) {
  buang(daftarProfil('kategoriArsip', jenis), nama);
  const aktif = daftarProfil('kategori', jenis);
  if (!aktif.includes(nama)) aktif.push(nama);
  simpanCache();
}

export function sisihkanKategori(jenis, nama, sejak = st.bulan) {
  buang(daftarProfil('kategori', jenis), nama);
  const arsip = daftarProfil('kategoriArsip', jenis);
  if (!arsip.includes(nama)) arsip.push(nama);
  // Pagu bulan berjalan dan sesudahnya ikut disisihkan; bulan yang sudah lewat
  // dibiarkan utuh sebagai riwayat. Aturannya sama persis dengan Apps Script.
  st.anggaran.forEach((a) => {
    if (a.kategori === nama && bulanSaja(a.bulan) >= sejak) a.status = 'arsip';
  });
  simpanCache();
}

/** Sisipkan/ganti satu pagu di memori. */
export function taruhPagu(rekam) {
  const i = st.anggaran.findIndex(
    (a) => bulanSaja(a.bulan) === rekam.bulan && a.kategori === rekam.kategori);
  const isi = { ...rekam, status: 'aktif' };
  if (i >= 0) st.anggaran[i] = isi; else st.anggaran.push(isi);
  simpanCache();
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

/** Saldo saving berjalan terakhir. */
export function saldoSaving() {
  if (!st.saving.length) return 0;
  return st.saving[st.saving.length - 1].saldo || 0;
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

/** Item yang paling sering dipakai, untuk saran di form input. */
export function itemSering(jenis, batas = 12) {
  const peta = new Map();
  for (const t of st.transaksi) {
    if (jenis && t.jenis !== jenis) continue;
    if (!t.item) continue;
    const k = t.item.trim();
    const p = peta.get(k) || { item: k, n: 0, kategori: t.kategori, nominal: t.nominal, terakhir: t.tanggal };
    p.n++;
    if (t.tanggal > p.terakhir) { p.terakhir = t.tanggal; p.kategori = t.kategori; p.nominal = t.nominal; }
    peta.set(k, p);
  }
  return [...peta.values()]
    .sort((a, b) => b.n - a.n || b.terakhir.localeCompare(a.terakhir))
    .slice(0, batas);
}
