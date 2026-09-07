/**
 * Uji otak Apps Script di luar Apps Script.
 *
 * Yang diuji bukan hal remeh: apakah angka yang dilihat aplikasi sama persis
 * dengan angka yang dihitung `REKAP BULANAN` di spreadsheet. Kalau keduanya
 * pernah berselisih, tidak ada yang berbunyi — Ryan cuma melihat dua angka
 * berbeda dan tidak tahu mana yang benar.
 *
 * Datanya adalah baris September 2026 yang sungguhan, disalin apa adanya dari
 * `INPUT TRANSAKSI`, dan angka harapannya disalin dari baris Sep-26 di
 * `REKAP BULANAN`. Jadi ini bukan menguji kode terhadap dirinya sendiri.
 *
 * Pakai:  node tools/uji_hitung.js
 */
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const akar = path.join(__dirname, '..', 'apps-script') + path.sep;

// --------------------------------------------------- spreadsheet palsu --

class Sheet {
  constructor(nama, isi) { this.nama = nama; this.isi = isi || []; }
  _sel(r, k) {
    while (this.isi.length < r) this.isi.push([]);
    const baris = this.isi[r - 1];
    while (baris.length < k) baris.push('');
    return baris;
  }
  getName() { return this.nama; }
  getLastRow() {
    for (let i = this.isi.length; i > 0; i--) {
      if (this.isi[i - 1].some((v) => v !== '' && v !== null && v !== undefined)) return i;
    }
    return 0;
  }
  getLastColumn() { return this.isi.reduce((m, b) => Math.max(m, b.length), 0); }
  getMaxRows() { return Math.max(this.isi.length, 1000); }
  getRange(a, b, tinggi, lebar) {
    if (typeof a === 'string') throw new Error('Rentang A1 tidak didukung — pakai kolom_().');
    const sh = this;
    const r0 = a, k0 = b, tg = tinggi === undefined ? 1 : tinggi, lb = lebar === undefined ? 1 : lebar;
    return {
      getValues() {
        const out = [];
        for (let r = r0; r < r0 + tg; r++) {
          const baris = [];
          for (let k = k0; k < k0 + lb; k++) baris.push(sh._sel(r, k)[k - 1]);
          out.push(baris);
        }
        return out;
      },
      getValue() { return this.getValues()[0][0]; },
      setValues(m) {
        for (let r = 0; r < m.length; r++) {
          for (let k = 0; k < m[r].length; k++) sh._sel(r0 + r, k0 + k)[k0 + k - 1] = m[r][k];
        }
        return this;
      },
      setValue(v) { sh._sel(r0, k0)[k0 - 1] = v; return this; },
      clearContent() {
        for (let r = r0; r < r0 + tg; r++) {
          for (let k = k0; k < k0 + lb; k++) sh._sel(r, k)[k - 1] = '';
        }
        return this;
      },
      setNumberFormat() { return this; },
      setFontWeight() { return this; },
      setBackground() { return this; },
      setFontColor() { return this; }
    };
  }
  appendRow(baris) {
    const r = this.getLastRow() + 1;
    this.getRange(r, 1, 1, baris.length).setValues([baris]);
    return this;
  }
  deleteRow(r) { this.isi.splice(r - 1, 1); return this; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
}

class Buku {
  constructor() { this.tab = {}; }
  getSheetByName(n) { return this.tab[n] || null; }
  insertSheet(n) { this.tab[n] = new Sheet(n); return this.tab[n]; }
  taruh(n, isi) { this.tab[n] = new Sheet(n, isi); return this.tab[n]; }
  getSpreadsheetTimeZone() { return 'Asia/Jakarta'; }
}

const buku = new Buku();

// Tanggal dipatok supaya hasil uji tidak berubah tiap hari.
const HARI_UJI = new Date('2026-09-30T03:00:00Z');

const ctx = {
  console,
  Utilities: {
    DigestAlgorithm: { MD5: 'MD5' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, teks) => {
      const b = crypto.createHash('md5').update(teks, 'utf8').digest();
      return Array.from(b).map((v) => (v > 127 ? v - 256 : v));   // seperti byte[] Java
    },
    formatDate: (d, tz, pola) => {
      // Apps Script melempar galat kalau zonanya tidak dikenal. Intl melakukan
      // hal yang sama, jadi penjaga zona di zona_() benar-benar teruji di sini
      // dan bukan cuma teruji terhadap tiruan yang serba menerima.
      new Intl.DateTimeFormat('en', { timeZone: tz });
      const iso = d.toISOString();
      if (pola === 'yyyy-MM-dd') return iso.slice(0, 10);
      if (pola === 'yyyy-MM') return iso.slice(0, 7);
      return iso.slice(0, 19);
    },
    getUuid: () => crypto.randomUUID(),
    base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64url'),
    computeHmacSha256Signature: (p, k) => Array.from(crypto.createHmac('sha256', k).update(p).digest())
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => buku },
  // Zona proyek skrip (appsscript.json), bukan zona spreadsheet — lihat zona_().
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Date: class extends Date {
    constructor(...a) { super(...(a.length ? a : [HARI_UJI])); }
    static now() { return HARI_UJI.getTime(); }
  }
};
vm.createContext(ctx);
for (const f of ['Kode.gs', 'Ringkasan.gs', 'Rutin.gs', 'Pengingat.gs']) {
  vm.runInContext(fs.readFileSync(akar + f, 'utf8'), ctx, { filename: f });
}

// ------------------------------------------------------------- data uji --

// Disalin apa adanya dari INPUT TRANSAKSI, baris 5 ke bawah.
const INPUT_SEP26 = [
  ["01-Sep-2026", "Gaji Gibeon", "Pemasukan", "Transfer / Tidak dihitung", "Gaji Suami", "BCA Suami", "Bersama", 9188100, "Sep-26", ""],
  ["01-Sep-2026", "Tunjangan Tere", "Pemasukan", "Transfer / Tidak dihitung", "Gaji Istri", "BCA Istri", "Bersama", 7729230, "Sep-26", ""],
  ["01-Sep-2026", "Gaji BRU Tere", "Pemasukan", "Transfer / Tidak dihitung", "Gaji Istri", "BCA Istri", "Bersama", 1000000, "Sep-26", ""],
  ["01-Sep-2026", "Gaji BRU Ryan", "Pemasukan", "Transfer / Tidak dihitung", "Gaji Suami", "BCA Suami", "Bersama", 6000000, "Sep-26", ""],
  ["01-Sep-2026", "Gaji PNS Tere", "Pemasukan", "Transfer / Tidak dihitung", "Gaji Istri", "BCA Istri", "Bersama", 3517000, "Sep-26", ""],
  ["01-Sep-2026", "Cicilan Iphone", "Pengeluaran", "Kegiatan Luar 20%", "Internet/HP", "Kartu Kredit", "Bersama", 1229083, "Sep-26", ""],
  ["01-Sep-2026", "Arisan", "Alokasi Tujuan", "Saving 30%", "Gaji Istri", "Rekening Saving", "Bersama", 2500000, "Sep-26", ""],
  ["01-Sep-2026", "Pendapatan tambahan", "Pemasukan", "Transfer / Tidak dihitung", "Pendapatan Tambahan", "BCA Istri", "Bersama", 8000000, "Sep-26", ""],
  ["01-Sep-2026", "Perpuluhan", "Alokasi Tujuan", "Perpuluhan/Sosial 10%", "Gereja", "BCA Istri", "Bersama", 800000, "Sep-26", ""],
  ["01-Sep-2026", "Tabungan", "Alokasi Tujuan", "Saving 30%", "Investasi", "BCA Istri", "Bersama", 7200000, "Sep-26", ""],
  ["01-Sep-2026", "Iuran Perumahan Pocan", "Pengeluaran", "Harian 40%", "Kebutuhan Rumah", "BCA Istri", "Bersama", 295000, "Sep-26", ""],
  ["01-Sep-2026", "Iuran Gizi", "Pengeluaran", "Harian 40%", "Kebutuhan Rumah", "BCA Istri", "Bersama", 40000, "Sep-26", ""],
  ["01-Sep-2026", "Kasih Papa Mama Ryan", "Alokasi Tujuan", "Perpuluhan/Sosial 10%", "Bantuan Orang Tua/Keluarga", "BCA Suami", "Bersama", 370000, "Sep-26", ""],
  ["01-Sep-2026", "Iuran Mita Wonokoyo", "Alokasi Tujuan", "Perpuluhan/Sosial 10%", "Bantuan Orang Tua/Keluarga", "BCA Suami", "Bersama", 130000, "Sep-26", ""],
  ["01-Sep-2026", "Internet Rumah Menganti", "Alokasi Tujuan", "Perpuluhan/Sosial 10%", "Bantuan Orang Tua/Keluarga", "BCA Suami", "Bersama", 300000, "Sep-26", ""],
  ["01-Sep-2026", "Telkomsel (HALO)", "Pengeluaran", "Harian 40%", "Internet/HP", "BCA Suami", "Suami", 97680, "Sep-26", ""],
  ["01-Sep-2026", "Icloud", "Pengeluaran", "Harian 40%", "Subscription", "BCA Suami", "Bersama", 52000, "Sep-26", ""],
  ["01-Sep-2026", "Spotify", "Pengeluaran", "Harian 40%", "Subscription", "BCA Suami", "Bersama", 104900, "Sep-26", ""],
  ["01-Sep-2026", "Uang Makan Ryan", "Pengeluaran", "Harian 40%", "Makan di Luar", "BCA Suami", "Suami", 700000, "Sep-26", ""],
  ["01-Sep-2026", "Indihome", "Pengeluaran", "Harian 40%", "Kebutuhan Rumah", "BCA Istri", "Bersama", 213400, "Sep-26", ""],
  ["01-Sep-2026", "PDAM", "Pengeluaran", "Harian 40%", "Kebutuhan Rumah", "BCA Istri", "Bersama", 52500, "Sep-26", ""],
  ["01-Sep-2026", "Netflix", "Pengeluaran", "Harian 40%", "Subscription", "BCA Istri", "Istri", 37200, "Sep-26", ""],
  ["03-Sep-2026", "Isi Bensin", "Pengeluaran", "Harian 40%", "BBM/Transportasi", "BCA Suami", "Bersama", 373800, "Sep-26", ""],
  ["01-Sep-2026", "Kantong perpuluhan", "Alokasi Tujuan", "Perpuluhan/Sosial 10%", "Sosial", "BCA Istri", "Bersama", 1624623, "Sep-26", ""],
  ["01-Sep-2026", "Cicilan Gym Last", "Pengeluaran", "Kegiatan Luar 20%", "Gym/Olahraga", "BCA Istri", "Bersama", 560850, "Sep-26", ""],
  ["01-Sep-2026", "Kado Buat Tere Friends", "Pengeluaran", "Kegiatan Luar 20%", "Hadiah", "BCA Istri", "Istri", 248951, "Sep-26", ""],
  ["01-Sep-2026", "Midnight Baker", "Pengeluaran", "Kegiatan Luar 20%", "Personal Care", "BCA Istri", "Istri", 149020, "Sep-26", ""],
  ["01-Sep-2026", "Makan Kelg Ryan Agustus", "Pengeluaran", "Kegiatan Luar 20%", "Bantuan Orang Tua/Keluarga", "BCA Istri", "Bersama", 488565, "Sep-26", ""],
  ["01-Sep-2026", "Promo M&S", "Pengeluaran", "Kegiatan Luar 20%", "Pakaian", "BCA Suami", "Bersama", 1200000, "Sep-26", ""]
];

const PILIHAN = [
  ['Jenis', 'Kelompok', 'Kategori', 'Bayar Pakai', 'Milik', 'Bulan', 'Keterangan'],
  ['Pemasukan', 'Saving 30%', 'Gaji Suami', 'BCA Suami', 'Suami', '', ''],
  ['Pengeluaran', 'Harian 40%', 'Gaji Istri', 'BCA Istri', 'Istri', '', ''],
  ['Alokasi Tujuan', 'Perpuluhan/Sosial 10%', 'Bonus/Tunjangan', 'Cash', 'Bersama', '', ''],
  ['Transfer', 'Kegiatan Luar 20%', 'Pendapatan Tambahan', 'QRIS/E-Wallet', '', '', ''],
  ['', 'Transfer / Tidak dihitung', 'KPR', 'Kartu Kredit', '', '', ''],
  ['', '', 'Bahan Makanan', 'Rekening Saving', '', '', ''],
  ['', '', 'Makan di Luar', 'Investasi', '', '', ''],
  ['', '', 'Kebutuhan Rumah', 'Lainnya', '', '', ''],
  ['', '', 'Internet/HP', '', '', '', ''],
  ['', '', 'Subscription', '', '', '', ''],
  ['', '', 'BBM/Transportasi', '', '', '', ''],
  ['', '', 'Gym/Olahraga', '', '', '', ''],
  ['', '', 'Personal Care', '', '', '', ''],
  ['', '', 'Gereja', '', '', '', ''],
  ['', '', 'Bantuan Orang Tua/Keluarga', '', '', '', ''],
  ['', '', 'Hadiah', '', '', '', ''],
  ['', '', 'Pakaian', '', '', '', ''],
  ['', '', 'Sosial', '', '', '', ''],
  ['', '', 'Investasi', '', '', '', '']
];

const TARGET = [
  ['TARGET KELUARGA', '', '', ''],
  ['', '', '', ''],
  ['Target', 'Nilai', 'Periode', 'Keterangan'],
  ['Saving', 0.3, 'Bulanan', '30% dari pemasukan'],
  ['Harian', 0.4, 'Bulanan', '40% dari pemasukan'],
  ['Perpuluhan/Sosial', 0.1, 'Bulanan', '10% dari pemasukan'],
  ['Kegiatan Luar', 0.2, 'Bulanan', '20% dari pemasukan'],
  // Enam baris rupiah, urut seperti di sheet. Urutannya berarti: dua baris KPR
  // adalah tahap yang berurutan, dan tahap 1 harus lebih dulu.
  ['Trip luar kota', 2000000, 'Bulanan', 'Target ± Rp2 juta'],
  ['Travel luar negeri', 25000000, 'Tahunan', 'Bisa diubah Rp20–30 juta'],
  ['Renovasi atap + kitchen set', 150000000, 'Target total', ''],
  ['Utang kakak suami', 138500000, 'Saldo awal', ''],
  ['KPR tahap 1', 2200000, '60 bulan', '5 tahun'],
  ['KPR tahap 2', 2700000, '120 bulan', '10 tahun berikutnya']
];

function pasangBukuBaru() {
  for (const n of Object.keys(buku.tab)) delete buku.tab[n];
  buku.taruh('INPUT TRANSAKSI', [
    ['PENCATATAN KEUANGAN KELUARGA — INPUT HARIAN'],
    ['Cukup isi sheet ini.'],
    [''],
    ['Tanggal', 'Keterangan', 'Jenis', 'Kelompok', 'Kategori', 'Bayar Pakai', 'Milik', 'Nominal', 'Bulan', 'Catatan']
  ].concat(INPUT_SEP26.map((r) => r.slice()))
   // Enam baris siap-isi di bawah tabel, persis seperti di sheet aslinya.
   .concat([0, 1, 2, 3, 4, 5].map(() => ['01-Sep-2026', '', '', '', '', '', '', '', 'Sep-26', ''])));
  buku.taruh('PILIHAN', PILIHAN.map((r) => r.slice()));
  buku.taruh('TARGET', TARGET.map((r) => r.slice()));
}

// ----------------------------------------------------------------- ujian --

let gagal = 0;
function cek(nama, dapat, harap) {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (!ok) gagal++;
  console.log((ok ? '  ok  ' : 'GAGAL ') + nama +
    (ok ? '' : `\n        dapat ${JSON.stringify(dapat)}\n        harap ${JSON.stringify(harap)}`));
}

const rp = (n) => 'Rp' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Angka harapan disalin dari baris Sep-26 tab REKAP BULANAN.
const REKAP_SEP26 = {
  pemasukan: 35434330,
  'Saving 30%': 9700000,
  'Harian 40%': 1966480,
  'Perpuluhan/Sosial 10%': 3224623,
  'Kegiatan Luar 20%': 3876469,
  totalKeluar: 18767572,
  sisa: 16666758
};

function ringkasBulan(bulan) {
  const baris = ctx.baca_(ctx.TAB.RINGKASAN).find((r) => String(r.bulan) === bulan);
  if (!baris) return null;
  return {
    pemasukan: baris.pemasukan,
    'Saving 30%': baris.saving,
    'Harian 40%': baris.harian,
    'Perpuluhan/Sosial 10%': baris.sosial,
    'Kegiatan Luar 20%': baris.luar,
    totalKeluar: baris.total_keluar,
    sisa: baris.sisa
  };
}

console.log('\n— zona waktu tidak diambil dari spreadsheet —');
pasangBukuBaru();
// Spreadsheet hasil konversi membawa zona asalnya. Kalau zona_() mempercayainya,
// cap tanggal meleset sehari dan bisa mendarat di bulan yang salah.
buku.getSpreadsheetTimeZone = () => 'America/Los_Angeles';
cek('memakai zona proyek, bukan zona spreadsheet', ctx.zona_(), 'Asia/Jakarta');
ctx._zonaTertahan = null;
ctx.setelPengaturan_('zona_waktu', 'Asia/Makassar');
ctx._zonaTertahan = null;
cek('baris zona_waktu di KKG Pengaturan menang', ctx.zona_(), 'Asia/Makassar');
ctx._zonaTertahan = null;
ctx.setelPengaturan_('zona_waktu', 'Zona/Salah-Ketik');
ctx._zonaTertahan = null;
cek('zona salah ketik jatuh ke zona proyek', ctx.zona_(), 'Asia/Jakarta');
ctx._zonaTertahan = null;

console.log('\n— membaca INPUT TRANSAKSI apa adanya —');
pasangBukuBaru();
const dibaca = ctx.bacaInput_();
cek('baris siap-isi dilewati', dibaca.length, 29);
cek('tanggal terbaca', dibaca[0].tanggal, '2026-09-01');
cek('bulan Sep-26 jadi 2026-09', dibaca[0].bulan, '2026-09');
cek('nominal terbaca utuh', dibaca[0].nominal, 9188100);
cek('kolom Milik terbaca', dibaca[0].milik, 'Bersama');

console.log('\n— hitungan harus sama persis dengan REKAP BULANAN —');
ctx.bangunRingkasan_();
cek('ringkasan Sep-26', ringkasBulan('2026-09'), REKAP_SEP26);

console.log('\n— pilihan & target dari tab bawaan —');
const profil = ctx.profilPublik_(ctx.pengaturan_());
cek('empat jenis', profil.pilihan.jenis.length, 4);
cek('lima kelompok', profil.pilihan.kelompok.length, 5);
cek('persen Saving dari TARGET', profil.target.pos['Saving 30%'], 30);
cek('persen Harian dari TARGET', profil.target.pos['Harian 40%'], 40);
cek('enam target rupiah terbaca', profil.target.rupiah.length, 6);
// Kolom Periode harus sampai utuh ke aplikasi: di sanalah cicilan dibedakan
// dari target bulanan. Lihat tools/uji_target.mjs.
cek('periode ikut terbawa apa adanya',
  profil.target.rupiah.map((t) => t.periode),
  ['Bulanan', 'Tahunan', 'Target total', 'Saldo awal', '60 bulan', '120 bulan']);
cek('empat kategori nyangkut disediakan',
  ['Keluar Kota Bulanan', 'Luar Negeri Tahunan', 'Renovasi Atap & Kitchen Set', 'Hutang Kakak Suami']
    .every((k) => profil.kategori.indexOf(k) >= 0), true);
cek('kategori PILIHAN ikut', profil.kategori.indexOf('Bahan Makanan') >= 0, true);

console.log('\n— transaksi dari HP: mendarat di tab aplikasi, ikut terhitung —');
pasangBukuBaru();
ctx.simpanTransaksi_({
  id: 'trx-uji-1', tanggal: '2026-09-20', keterangan: 'Beli galon',
  jenis: 'Pengeluaran', kelompok: 'Harian 40%', kategori: 'Bahan Makanan',
  bayarPakai: 'Cash', milik: 'Bersama', nominal: 56500, sifat: 'WAJIB'
});
cek('tersimpan di tab aplikasi', ctx.baca_(ctx.TAB.TRANSAKSI).length, 1);
cek('INPUT TRANSAKSI tidak disentuh', ctx.bacaInput_().length, 29);
cek('Harian bertambah persis', ringkasBulan('2026-09')['Harian 40%'],
  REKAP_SEP26['Harian 40%'] + 56500);
cek('kolom bulan ditulis gaya sheet', ctx.baca_(ctx.TAB.TRANSAKSI)[0].bulan, 'Sep-26');

console.log('\n— kiriman ulang dari antrian luring tidak menggandakan —');
ctx.simpanTransaksi_({
  id: 'trx-uji-1', tanggal: '2026-09-20', keterangan: 'Beli galon',
  jenis: 'Pengeluaran', kelompok: 'Harian 40%', kategori: 'Bahan Makanan',
  bayarPakai: 'Cash', milik: 'Bersama', nominal: 56500, sifat: 'WAJIB'
});
cek('tetap satu baris', ctx.baca_(ctx.TAB.TRANSAKSI).length, 1);

console.log('\n— pemasukan dipaksa netral supaya tidak terhitung dua kali —');
ctx.simpanTransaksi_({
  id: 'trx-uji-2', tanggal: '2026-09-21', keterangan: 'Fee tambahan',
  jenis: 'Pemasukan', kelompok: 'Saving 30%', kategori: 'Pendapatan Tambahan',
  nominal: 1000000
});
const r2 = ringkasBulan('2026-09');
cek('pemasukan naik', r2.pemasukan, REKAP_SEP26.pemasukan + 1000000);
cek('Saving tidak ikut naik', r2['Saving 30%'], REKAP_SEP26['Saving 30%']);

console.log('\n— baris milik sheet tidak bisa diubah dari HP —');
pasangBukuBaru();
const idSheet = ctx.muatAwal_({}).transaksi.find((t) => t.keterangan === 'Gaji Gibeon').id;
cek('ditandai terkunci', ctx.muatAwal_({}).transaksi.find((t) => t.id === idSheet).kunci, true);
let pesan = '';
try { ctx.ubahTransaksi_({ id: idSheet, nominal: 1 }); } catch (e) { pesan = e.message; }
cek('ubah ditolak dengan alasan', /INPUT TRANSAKSI/.test(pesan), true);
pesan = '';
try { ctx.hapusTransaksi_({ id: idSheet }); } catch (e) { pesan = e.message; }
cek('hapus ditolak dengan alasan', /INPUT TRANSAKSI/.test(pesan), true);
cek('nominalnya utuh', ctx.bacaInput_()[0].nominal, 9188100);

console.log('\n— sifat WAJIB/KEINGINAN menempel walau barisnya bergeser —');
ctx.simpanTanda_({ id: idSheet, sifat: 'KEINGINAN' });
cek('tersimpan', ctx.muatAwal_({}).transaksi.find((t) => t.id === idSheet).sifat, 'KEINGINAN');
// Sisipkan satu baris di tengah INPUT TRANSAKSI: nomor barisnya berubah semua.
buku.getSheetByName('INPUT TRANSAKSI').isi.splice(4, 0,
  ['02-Sep-2026', 'Sisipan di tengah', 'Pengeluaran', 'Harian 40%', 'Bahan Makanan', 'Cash', 'Bersama', 12345, 'Sep-26', '']);
const setelah = ctx.muatAwal_({}).transaksi.find((t) => t.keterangan === 'Gaji Gibeon');
cek('id tetap sama', setelah.id, idSheet);
cek('sifat tetap menempel', setelah.sifat, 'KEINGINAN');

console.log('\n— tab_tulis dibalik: transaksi baru masuk ke INPUT TRANSAKSI —');
pasangBukuBaru();
ctx.setelPengaturan_('tab_tulis', 'INPUT TRANSAKSI');
ctx.simpanTransaksi_({
  id: 'trx-uji-3', tanggal: '2026-09-22', keterangan: 'Beli beras',
  jenis: 'Pengeluaran', kelompok: 'Harian 40%', kategori: 'Bahan Makanan',
  bayarPakai: 'Cash', milik: 'Bersama', nominal: 145000, sifat: 'WAJIB'
});
cek('mendarat di INPUT TRANSAKSI', ctx.bacaInput_().length, 30);
cek('tab aplikasi tetap kosong', ctx.baca_(ctx.TAB.TRANSAKSI).length, 0);
cek('memakai baris siap-isi, bukan menambah baris',
  buku.getSheetByName('INPUT TRANSAKSI').getLastRow(), 4 + 29 + 6);
cek('Harian bertambah', ringkasBulan('2026-09')['Harian 40%'], REKAP_SEP26['Harian 40%'] + 145000);
ctx.simpanTransaksi_({
  id: 'trx-uji-3', tanggal: '2026-09-22', keterangan: 'Beli beras',
  jenis: 'Pengeluaran', kelompok: 'Harian 40%', kategori: 'Bahan Makanan',
  bayarPakai: 'Cash', milik: 'Bersama', nominal: 145000, sifat: 'WAJIB'
});
cek('kiriman ulang tidak menggandakan', ctx.bacaInput_().length, 30);

console.log('\n— baris yang sama di dua tab hanya dihitung sekali —');
pasangBukuBaru();
ctx.tulisBaris_(ctx.TAB.TRANSAKSI, {
  tanggal: '2026-09-01', keterangan: 'Gaji Gibeon', jenis: 'Pemasukan',
  kelompok: 'Transfer / Tidak dihitung', kategori: 'Gaji Suami',
  bayar_pakai: 'BCA Suami', milik: 'Bersama', nominal: 9188100, bulan: 'Sep-26',
  catatan: '', id: 'trx-kembar', sifat: '', sumber: 'aplikasi',
  dibuat: '', diubah: '', status: 'aktif'
});
ctx.bangunRingkasan_();
cek('pemasukan tidak menggelembung', ringkasBulan('2026-09').pemasukan, REKAP_SEP26.pemasukan);

console.log('\n— tagihan rutin dianggap lunas lewat penanda di Catatan —');
pasangBukuBaru();
ctx.tulisBaris_(ctx.TAB.RUTIN, {
  id: 'rtn-uji', nama: 'PDAM', tipe: 'tagihan', jenis: 'Pengeluaran',
  kelompok: 'Harian 40%', kategori: 'Kebutuhan Rumah', bayar_pakai: '', milik: '',
  nominal: 52500, sifat: 'WAJIB', hari_jatuh_tempo: 15, mulai: '',
  total_termin: '', termin_terbayar: '', aktif: true
});
cek('belum terbayar', ctx.statusRutinBulan_('2026-09')[0].terbayar, false);
// Penandanya ditulis tangan di kolom Catatan INPUT TRANSAKSI, bukan lewat app.
buku.getSheetByName('INPUT TRANSAKSI').getRange(4 + 22, 10).setValue('#rutin:rtn-uji');
cek('penanda di sheet ikut terbaca', ctx.statusRutinBulan_('2026-09')[0].terbayar, true);

console.log('\n' + (gagal ? gagal + ' ujian GAGAL' : 'Semua ujian lolos.') + '\n');
process.exit(gagal ? 1 : 0);
