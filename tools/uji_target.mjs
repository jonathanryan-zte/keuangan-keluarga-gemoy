/**
 * Uji pembacaan tab TARGET.
 *
 * Enam baris rupiah di tab itu punya lima arti periode yang berbeda, dan tidak
 * satu pun bisa ditebak dari nilainya. Yang paling licin: `"60 bulan"` juga
 * memuat kata "bulan", jadi kalau urutan pengujiannya terbalik, cicilan KPR
 * terbaca sebagai target setor bulanan biasa — angkanya kebetulan mirip, dan
 * tidak ada yang berbunyi. Dua baris KPR pun menunjuk kategori yang sama, jadi
 * satu pembayaran gampang sekali terhitung dua kali.
 *
 * Enam baris TARGET di bawah ini disalin apa adanya dari spreadsheet.
 *
 * Berekstensi .mjs, bukan .js seperti `uji_hitung.js`, karena yang diuji adalah
 * modul ES di `app/` — sementara `uji_hitung.js` memuat Apps Script yang bukan
 * modul sama sekali. Dua sistem modul, dua ekstensi.
 *
 * Pakai:  node tools/uji_target.mjs
 */
import { jenisTarget, susunTarget, urutMendesak } from '../app/js/target.js';

// Disalin dari tab TARGET, baris 4 ke bawah, kolom A–D.
const TARGET = [
  { nama: 'Trip luar kota', nilai: 2000000, periode: 'Bulanan', keterangan: 'Target ± Rp2 juta', kategori: 'Keluar Kota Bulanan' },
  { nama: 'Travel luar negeri', nilai: 25000000, periode: 'Tahunan', keterangan: 'Bisa diubah Rp20–30 juta', kategori: 'Luar Negeri Tahunan' },
  { nama: 'Renovasi atap + kitchen set', nilai: 150000000, periode: 'Target total', keterangan: '', kategori: 'Renovasi Atap & Kitchen Set' },
  { nama: 'Utang kakak suami', nilai: 138500000, periode: 'Saldo awal', keterangan: '', kategori: 'Hutang Kakak Suami' },
  { nama: 'KPR tahap 1', nilai: 2200000, periode: '60 bulan', keterangan: '5 tahun', kategori: 'KPR' },
  { nama: 'KPR tahap 2', nilai: 2700000, periode: '120 bulan', keterangan: '10 tahun berikutnya', kategori: 'KPR' }
];

let gagal = 0;
function cek(nama, dapat, harap) {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (!ok) gagal++;
  console.log((ok ? '  ok  ' : 'GAGAL ') + nama +
    (ok ? '' : `\n        dapat ${JSON.stringify(dapat)}\n        harap ${JSON.stringify(harap)}`));
}

const setor = (bulan, kategori, nominal) => ({ bulan, tanggal: `${bulan}-05`, kategori, nominal });
const susun = (transaksi, bulan) => {
  const peta = {};
  susunTarget(TARGET, transaksi, bulan).forEach((t) => { peta[t.nama] = t; });
  return peta;
};

// ------------------------------------------------------------ periode --

console.log('— kolom Periode dibaca sesuai artinya, bukan sekadar ada kata "bulan" —');
cek('Bulanan', jenisTarget('Bulanan'), { jenis: 'bulanan', tenor: 0 });
cek('Tahunan', jenisTarget('Tahunan'), { jenis: 'tahunan', tenor: 0 });
cek('Target total', jenisTarget('Target total'), { jenis: 'total', tenor: 0 });
cek('Saldo awal', jenisTarget('Saldo awal'), { jenis: 'utang', tenor: 0 });
// Inti seluruh berkas ini: kalau `bulanan` menang lebih dulu, baris ini lolos
// sebagai target setor Rp2,2 juta/bulan dan tenor 60-nya hilang tanpa jejak.
cek('60 bulan → cicilan, bukan bulanan', jenisTarget('60 bulan'), { jenis: 'cicilan', tenor: 60 });
cek('120 bulan → cicilan', jenisTarget('120 bulan'), { jenis: 'cicilan', tenor: 120 });
cek('periode kosong jatuh ke total', jenisTarget(''), { jenis: 'total', tenor: 0 });

// --------------------------------------------------------- belum ada apa-apa --

console.log('\n— sheet yang belum pernah menerima setoran tidak boleh membuat angka aneh —');
{
  const t = susun([], '2026-09');
  cek('semua nol', TARGET.map((b) => t[b.nama].terkumpul), [0, 0, 0, 0, 0, 0]);
  cek('renovasi tanpa perkiraan lunas', t['Renovasi atap + kitchen set'].lunasPada, null);
  cek('sisa utang masih utuh', t['Utang kakak suami'].sisa, 138500000);
  cek('KPR tahap 1 sudah berjalan', t['KPR tahap 1'].tahap, 'berjalan');
  cek('angsuran pertama', t['KPR tahap 1'].angsuranKe, 1);
  cek('KPR tahap 2 belum berjalan', t['KPR tahap 2'].tahap, 'berikutnya');
}

// ------------------------------------------------------------------ bulanan --

console.log('\n— target bulanan hanya melihat bulan yang sedang dibuka —');
{
  const t = susun([
    setor('2026-08', 'Keluar Kota Bulanan', 1800000),
    setor('2026-09', 'Keluar Kota Bulanan', 500000)
  ], '2026-09');
  cek('Agustus tidak ikut', t['Trip luar kota'].terkumpul, 500000);
  cek('kurang Rp1,5 juta', t['Trip luar kota'].sisa, 1500000);
  cek('persen', Math.round(t['Trip luar kota'].persen), 25);
}

// ------------------------------------------------------------------ tahunan --

console.log('\n— target tahunan dibatasi tahun takwim, bukan seluruh riwayat —');
{
  const transaksi = [
    setor('2025-11', 'Luar Negeri Tahunan', 9000000),   // tahun lalu, tidak ikut
    setor('2026-03', 'Luar Negeri Tahunan', 4000000),
    setor('2026-09', 'Luar Negeri Tahunan', 1000000)
  ];
  const t = susun(transaksi, '2026-09');
  cek('hanya 2026', t['Travel luar negeri'].terkumpul, 5000000);
  cek('sisa tahun ini', t['Travel luar negeri'].sisa, 20000000);
  // September sampai Desember = 4 bulan, bulan berjalan ikut dihitung.
  cek('empat bulan tersisa', t['Travel luar negeri'].bulanTersisa, 4);
  cek('perlu Rp5 juta/bulan', t['Travel luar negeri'].perluPerBulan, 5000000);
  cek('tahun lalu punya angkanya sendiri', susun(transaksi, '2025-11')['Travel luar negeri'].terkumpul, 9000000);
}

// ------------------------------------------------------------- total & utang --

console.log('\n— target total & saldo utang dihitung dari seluruh riwayat —');
{
  const t = susun([
    setor('2026-07', 'Renovasi Atap & Kitchen Set', 10000000),
    setor('2026-08', 'Renovasi Atap & Kitchen Set', 20000000),
    setor('2026-08', 'Hutang Kakak Suami', 38500000)
  ], '2026-09');
  cek('renovasi terkumpul', t['Renovasi atap + kitchen set'].terkumpul, 30000000);
  // Rata-rata dari bulan yang benar-benar ada setorannya: (10jt + 20jt) / 2.
  cek('rata-rata setoran renovasi', t['Renovasi atap + kitchen set'].rataBulanan, 15000000);
  // Sisa Rp120 juta ÷ Rp15 juta = 8 bulan lagi, dihitung dari September.
  cek('perkiraan lunas renovasi', t['Renovasi atap + kitchen set'].lunasPada, '2027-05');
  cek('utang berkurang, bukan bertambah', t['Utang kakak suami'].sisa, 100000000);
  cek('utang terbayar', t['Utang kakak suami'].terkumpul, 38500000);
}

// ------------------------------------------------------------------ cicilan --

console.log('\n— dua tahap KPR berbagi satu kategori dan tidak boleh saling meniru —');
{
  const tiga = ['2026-07', '2026-08', '2026-09'].map((b) => setor(b, 'KPR', 2200000));
  const t = susun(tiga, '2026-09');
  cek('angsuran ke-3, bukan ke-4', t['KPR tahap 1'].angsuranKe, 3);
  cek('sudah dibayar bulan ini', t['KPR tahap 1'].terkumpul, 2200000);
  cek('sisa 57 angsuran', t['KPR tahap 1'].sisaAngsuran, 57);
  cek('komitmen tahap 1', t['KPR tahap 1'].komitmen, 132000000);
  // Inilah yang dicegah: tahap 2 memungut pembayaran tahap 1 dan ikut
  // memajang Rp2,2 juta seolah dua cicilan berjalan sekaligus.
  cek('tahap 2 tidak ikut memungut', t['KPR tahap 2'].terkumpul, 0);
  cek('tahap 2 masih menunggu', t['KPR tahap 2'].tahap, 'berikutnya');
  cek('komitmen tahap 2', t['KPR tahap 2'].komitmen, 324000000);

  console.log('  · menengok bulan lalu tidak boleh ikut mengaku angsuran terakhir');
  const juli = susun(tiga, '2026-07');
  cek('Juli itu angsuran pertama', juli['KPR tahap 1'].angsuranKe, 1);
  cek('nominalnya nominal Juli', juli['KPR tahap 1'].terkumpul, 2200000);

  console.log('  · bulan berjalan yang belum dibayar menunjuk angsuran berikutnya');
  const oktober = susun(tiga, '2026-10');
  cek('angsuran ke-4 jatuh tempo', oktober['KPR tahap 1'].angsuranKe, 4);
  cek('belum dibayar', oktober['KPR tahap 1'].terkumpul, 0);
}

console.log('\n— tahap 1 lunas, tahap 2 mengambil alih —');
{
  const enamPuluh = [];
  for (let i = 0; i < 60; i++) {
    const th = 2026 + Math.floor(i / 12);
    const bl = String((i % 12) + 1).padStart(2, '0');
    enamPuluh.push(setor(`${th}-${bl}`, 'KPR', 2200000));
  }
  // Angsuran ke-61 jatuh di Januari 2031, bulan pertama yang belum dibayar.
  const t = susun(enamPuluh, '2031-01');
  cek('tahap 1 selesai', t['KPR tahap 1'].tahap, 'selesai');
  cek('tahap 1 tidak menyisakan angsuran', t['KPR tahap 1'].sisaAngsuran, 0);
  cek('tahap 2 berjalan', t['KPR tahap 2'].tahap, 'berjalan');
  cek('angsuran pertama tahap 2', t['KPR tahap 2'].angsuranKe, 1);
  cek('sisa 120 angsuran', t['KPR tahap 2'].sisaAngsuran, 120);
}

// ------------------------------------------------------------------- urutan --

console.log('\n— kartu ringkas di Beranda mendahulukan kewajiban bulan ini —');
{
  const daftar = urutMendesak(susunTarget(TARGET, [], '2026-09'))
    .filter((t) => t.tahap !== 'berikutnya' && t.tahap !== 'selesai')
    .slice(0, 3)
    .map((t) => t.nama);
  cek('tiga teratas', daftar, ['KPR tahap 1', 'Trip luar kota', 'Utang kakak suami']);
}

console.log('\n' + (gagal ? gagal + ' ujian GAGAL' : 'Semua ujian lolos.') + '\n');
if (typeof process !== 'undefined' && process.exit) process.exit(gagal ? 1 : 0);
