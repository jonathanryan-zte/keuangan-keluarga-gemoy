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
    vapidPublik: ''
  },
  transaksi: [],
  rutin: [],
  anggaran: [],
  saving: [],
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
    profil: c.profil || st.profil
  });
  return true;
}

export function simpanCache() {
  lokal.simpan('cache', {
    transaksi: st.transaksi, rutin: st.rutin,
    anggaran: st.anggaran, saving: st.saving, profil: st.profil
  });
}

export function terapkanMuatan(d) {
  st.transaksi = d.transaksi || [];
  st.rutin = d.rutin || [];
  st.anggaran = d.anggaran || [];
  st.saving = d.saving || [];
  if (d.profil) st.profil = { ...st.profil, ...d.profil };
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

export function anggaranBulan(bulan = st.bulan) {
  const pakai = new Map(perKategori(bulan).map((x) => [x.kategori, x.nominal]));
  const pagu = new Map(
    st.anggaran.filter((a) => bulanSaja(a.bulan) === bulan).map((a) => [a.kategori, a.pagu])
  );
  // Kalau bulan ini belum punya pagu, pakai pagu bulan terakhir yang ada.
  if (!pagu.size) {
    const bulanPagu = [...new Set(st.anggaran.map((a) => bulanSaja(a.bulan)))]
      .filter((b) => b && b < bulan).sort().pop();
    if (bulanPagu) {
      st.anggaran.filter((a) => bulanSaja(a.bulan) === bulanPagu)
        .forEach((a) => pagu.set(a.kategori, a.pagu));
    }
  }
  const kategori = new Set([...pagu.keys(), ...pakai.keys()]);
  return [...kategori].map((k) => {
    const p = pagu.get(k) || 0;
    const t = pakai.get(k) || 0;
    return { kategori: k, pagu: p, terpakai: t, persen: p ? (t / p) * 100 : null };
  }).sort((a, b) => (b.pagu || 0) - (a.pagu || 0) || b.terpakai - a.terpakai);
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
