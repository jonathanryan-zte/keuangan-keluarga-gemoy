/**
 * Uji pencocokan Sinkron.gs di luar Apps Script.
 *
 * Sinkron dari `Monthly 26` dijalankan tiap hari terhadap data keuangan yang
 * sungguhan, dan kesalahan pencocokan tidak berbunyi — ia cuma diam-diam
 * menggandakan atau menghilangkan angka. Berkas ini menjalankan otak
 * pencocokannya di Node dengan Apps Script yang dipalsukan, jadi kesalahannya
 * ketahuan sebelum ter-deploy.
 *
 * Pakai:  node tools/uji_sinkron.js
 */
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const akar = path.join(__dirname, '..', 'apps-script') + path.sep;

const ctx = {
  console,
  Utilities: {
    DigestAlgorithm: { MD5: 'MD5' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, teks) => {
      const b = crypto.createHash('md5').update(teks, 'utf8').digest();
      return Array.from(b).map((v) => (v > 127 ? v - 256 : v));   // seperti byte[] Java
    },
    formatDate: (d, tz, pola) => d.toISOString().slice(0, 10),
    getUuid: () => 'x'.repeat(36)
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSpreadsheetTimeZone: () => 'Asia/Jakarta' }) },
  Date
};
vm.createContext(ctx);
for (const f of ['Kode.gs', 'Migrasi.gs', 'Sinkron.gs']) {
  vm.runInContext(fs.readFileSync(akar + f, 'utf8'), ctx, { filename: f });
}

const { idMigrasi_, rencanaTransaksi_, rencanaSaving_, idSaving_, JENIS } = ctx;

// --- pembentuk data -------------------------------------------------------
// Meniru bentuk yang dikeluarkan bacaSemuaTabLama_ untuk satu bulan.
function sumberDari(bulan, daftar) {
  const kembar = {};
  return daftar.map(([jenis, item, nominal, kategori]) => ({
    id: idMigrasi_(bulan, jenis, item, nominal, kembar),
    tanggal: bulan + '-01', jenis, kategori: kategori || 'Pangan', item,
    nominal, sifat: 'WAJIB', catatan: '', sumber: 'migrasi', status: 'aktif'
  }));
}
// Baris tab Transaksi seperti hasil migrasi lama (id bernomor urut).
function barisLama(sumber, ubah = {}) {
  return sumber.map((s, i) => Object.assign({
    _baris: i + 2, id: `mig-${s.tanggal.slice(0, 7)}-${s.jenis.slice(0, 3)}-${i + 1}`,
    tanggal: s.tanggal, jenis: s.jenis, kategori: s.kategori, item: s.item,
    nominal: s.nominal, sifat: s.sifat, catatan: '', sumber: 'migrasi', status: 'aktif'
  }, ubah[i] || {}));
}
function barisTersinkron(sumber, ubah = {}) {
  return sumber.map((s, i) => Object.assign({
    _baris: i + 2, id: s.id, tanggal: s.tanggal, jenis: s.jenis, kategori: s.kategori,
    item: s.item, nominal: s.nominal, sifat: s.sifat, catatan: '', sumber: 'migrasi',
    status: 'aktif'
  }, ubah[i] || {}));
}

const RT = JENIS.RUMAH_TANGGA, PM = JENIS.PEMASUKAN;
const dasar = [
  [RT, 'Belanja pasar 2/9/2026', 250000],
  [RT, 'Bensin', 100000],
  [RT, 'Bensin', 100000],            // kembar persis, sengaja
  [RT, 'Tahu campur 05092026', 35000],
  [PM, 'Gaji Pokok', 8000000, 'Gaji Pokok']
];
const sumber = sumberDari('2026-09', dasar);

let gagal = 0;
function cek(nama, dapat, harap) {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (!ok) gagal++;
  console.log((ok ? '  ok  ' : 'GAGAL ') + nama +
    (ok ? '' : `\n        dapat ${JSON.stringify(dapat)} harap ${JSON.stringify(harap)}`));
}
const ringkas = (r) => ({ tambah: r.ditambah.length, rapi: r.dirapikan.length,
  nominal: r.nominalBerubah.length, yatim: r.yatim.length, curiga: r.curiga.length });

// 1. id deterministik
const sumber2 = sumberDari('2026-09', dasar);
cek('id sama saat dibaca dua kali', sumber.map((s) => s.id), sumber2.map((s) => s.id));
cek('dua baris kembar dapat id berbeda', sumber[1].id !== sumber[2].id, true);

// 2. tab Transaksi masih kosong
cek('sheet kosong -> semua ditambah', ringkas(rencanaTransaksi_(sumber, [])),
  { tambah: 5, rapi: 0, nominal: 0, yatim: 0, curiga: 0 });

// 3. hasil migrasi lama (id bernomor urut) -> dikenali ulang, bukan digandakan
cek('id gaya lama -> dirapikan', ringkas(rencanaTransaksi_(sumber, barisLama(sumber))),
  { tambah: 0, rapi: 5, nominal: 0, yatim: 0, curiga: 0 });

// 4. sinkron kedua kalinya: tidak ada apa-apa
cek('sinkron ulang -> diam', ringkas(rencanaTransaksi_(sumber, barisTersinkron(sumber))),
  { tambah: 0, rapi: 0, nominal: 0, yatim: 0, curiga: 0 });

// 5. Ryan membetulkan kategori, sifat, dan tanggal (masih di bulan yang sama)
cek('baris yang sudah dirapikan Ryan tidak digandakan',
  ringkas(rencanaTransaksi_(sumber, barisTersinkron(sumber,
    { 0: { kategori: 'Sandang', sifat: 'KEINGINAN', tanggal: '2026-09-02', catatan: 'dibetulkan' } }))),
  { tambah: 0, rapi: 0, nominal: 0, yatim: 0, curiga: 0 });

// 6. admin menambah satu baris baru
const sumberTambah = sumberDari('2026-09', dasar.concat([[RT, 'Galon 3 buah', 60000]]));
cek('satu baris baru -> satu ditambah',
  ringkas(rencanaTransaksi_(sumberTambah, barisTersinkron(sumber))),
  { tambah: 1, rapi: 0, nominal: 0, yatim: 0, curiga: 0 });

// 7. admin membetulkan nominal
const sumberBetul = sumberDari('2026-09',
  dasar.map((d, i) => (i === 0 ? [RT, 'Belanja pasar 2/9/2026', 275000] : d)));
cek('nominal dibetulkan -> diperbarui, bukan digandakan',
  ringkas(rencanaTransaksi_(sumberBetul, barisTersinkron(sumber))),
  { tambah: 0, rapi: 0, nominal: 1, yatim: 0, curiga: 0 });

// 8. baris hilang dari sheet lama
cek('baris hilang -> yatim, tidak ada tambahan',
  ringkas(rencanaTransaksi_(sumber.slice(0, 4), barisTersinkron(sumber))),
  { tambah: 0, rapi: 0, nominal: 0, yatim: 1, curiga: 0 });

// 9. baris yang sudah Ryan hapus lewat aplikasi tidak dibangkitkan lagi
cek('baris terhapus tidak kembali',
  ringkas(rencanaTransaksi_(sumber, barisTersinkron(sumber, { 3: { status: 'dihapus' } }))),
  { tambah: 0, rapi: 0, nominal: 0, yatim: 0, curiga: 0 });

// 10. catatan dari aplikasi tidak pernah disentuh, tapi kembarannya dilaporkan
const dariAplikasi = [{
  _baris: 99, id: 'trx-abc', tanggal: '2026-09-04', jenis: RT, kategori: 'Pangan',
  item: 'Galon', nominal: 60000, sifat: 'WAJIB', catatan: '', sumber: 'aplikasi', status: 'aktif'
}];
const r10 = rencanaTransaksi_(sumberTambah, barisTersinkron(sumber).concat(dariAplikasi));
cek('kembaran dengan catatan aplikasi dilaporkan', ringkas(r10),
  { tambah: 1, rapi: 0, nominal: 0, yatim: 0, curiga: 1 });
cek('baris aplikasi tidak pernah jadi yatim',
  r10.yatim.some((b) => b.sumber === 'aplikasi'), false);

// 11. admin membetulkan tulisan nama -> dilaporkan sebagai perlu diperiksa
const sumberTulis = sumberDari('2026-09',
  dasar.map((d, i) => (i === 3 ? [RT, 'Tahu Campur Pak Man 05092026', 35000] : d)));
const r11 = rencanaTransaksi_(sumberTulis, barisTersinkron(sumber));
cek('tulisan berubah -> ditandai perlu diperiksa',
  ringkas(r11), { tambah: 1, rapi: 0, nominal: 0, yatim: 1, curiga: 1 });

// 12. saving
const kembarSvg = {};
const svg = [['2026-09-01', 500000, 0, 'Setoran'], ['2026-09-10', 0, 200000, 'Tarik']]
  .map(([tanggal, debet, kredit, ket]) => ({
    id: idSaving_(tanggal, debet, kredit, ket, kembarSvg), tanggal, debet, kredit,
    saldo: 0, keterangan: ket, status: 'aktif'
  }));
cek('saving kosong -> ditambah semua',
  rencanaSaving_(svg, []).ditambah.length, 2);
cek('saving sudah ada -> diam',
  rencanaSaving_(svg, svg.map((s, i) => ({ ...s, _baris: i + 2 }))).ditambah.length, 0);
cek('saving id lama -> dirapikan',
  rencanaSaving_(svg, svg.map((s, i) => ({ ...s, _baris: i + 2, id: 'migsvg-' + (i + 1) })))
    .dirapikan.length, 2);

console.log(gagal ? `\n${gagal} uji gagal` : '\nSemua uji lolos');
process.exit(gagal ? 1 : 0);
