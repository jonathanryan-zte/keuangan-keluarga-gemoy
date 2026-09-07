// Membaca kolom `Periode` di tab TARGET, dan menerjemahkannya jadi angka yang
// bisa dipajang.
//
// Modul ini sengaja murni: satu-satunya impornya `rupiah.js`, yang juga murni.
// `toko.js` menyentuh `navigator.onLine` dan IndexedDB begitu dimuat, jadi apa
// pun yang tinggal di sana tidak bisa diuji dari Node. Hitungan target justru
// yang paling perlu diuji — enam barisnya punya lima arti periode yang berbeda
// dan tidak satu pun bisa ditebak dari nilainya saja. Lihat `tools/uji_target.js`.

import { geserBulan } from './rupiah.js';

/**
 * Lima arti `Periode` yang sungguhan ada di sheet. Cicilan diuji paling dulu:
 * `"60 bulan"` juga memuat kata "bulan", dan kalau `bulanan` menang lebih
 * dahulu maka cicilan KPR akan terbaca sebagai target setor bulanan biasa —
 * angkanya kebetulan mirip, jadi salahnya tidak akan berbunyi.
 */
const PERIODE = [
  ['cicilan', /^(\d+)\s*bulan$/i],
  ['bulanan', /^bulanan$/i],
  ['tahunan', /^tahunan$/i],
  ['utang', /^saldo\s*awal$/i]
];

/**
 * @returns {{jenis: string, tenor: number}} `tenor` hanya berarti untuk cicilan.
 *   Periode yang tidak dikenali jatuh ke `total` — sama seperti "Target total",
 *   yaitu diukur terhadap seluruh riwayat. Itu tebakan paling aman: ia tidak
 *   pernah mengecilkan angka yang sudah terkumpul.
 */
export function jenisTarget(periode) {
  const teks = String(periode || '').trim();
  for (const [jenis, uji] of PERIODE) {
    const m = teks.match(uji);
    if (m) return { jenis, tenor: jenis === 'cicilan' ? Number(m[1]) : 0 };
  }
  return { jenis: 'total', tenor: 0 };
}

/** Bulan sebuah transaksi, sebagai 'YYYY-MM'. */
function bulanDari(t) {
  return String(t.bulan || t.tanggal || '').slice(0, 7);
}

/**
 * Ringkasan setoran per kategori, dihitung sekali lalu dipakai semua target.
 * Dua baris KPR menunjuk kategori yang sama, jadi menghitungnya per baris
 * berarti satu pembayaran terlihat dua kali.
 */
function indeks(transaksi) {
  const peta = new Map();
  for (const t of transaksi) {
    const kat = t.kategori;
    if (!kat) continue;
    let x = peta.get(kat);
    if (!x) { x = { total: 0, perBulan: new Map() }; peta.set(kat, x); }
    x.total += t.nominal;
    const b = bulanDari(t);
    if (b) x.perBulan.set(b, (x.perBulan.get(b) || 0) + t.nominal);
  }
  return peta;
}

function ambil(peta, kategori) {
  return peta.get(kategori) || { total: 0, perBulan: new Map() };
}

function jumlahTahun(x, tahun) {
  let n = 0;
  x.perBulan.forEach((v, b) => { if (b.slice(0, 4) === tahun) n += v; });
  return n;
}

/**
 * Rata-rata setoran per bulan yang benar-benar ada setorannya — bukan dibagi
 * umur target, yang tidak tertulis di sheet mana pun. Artinya: "sekali setor,
 * biasanya sebesar ini", dan itu yang dipakai memperkirakan kapan lunas.
 */
function rataSetoran(x) {
  const n = x.perBulan.size;
  return n ? x.total / n : 0;
}

/**
 * Kapan target akan tercapai kalau laju setorannya bertahan. Mengembalikan
 * null kalau belum pernah ada setoran — perkiraan dari nol bukan perkiraan
 * yang hati-hati, melainkan pembagian dengan nol yang dibungkus rapi.
 */
function perkiraanLunas(sisa, rata, bulan) {
  if (sisa <= 0) return 'lunas';
  if (rata <= 0) return null;
  return geserBulan(bulan, Math.ceil(sisa / rata));
}

/**
 * Tahap cicilan yang berbagi satu kategori disusun berurutan sesuai urutan
 * barisnya di sheet: tahap 1 memakai angsuran ke-1..60, tahap 2 ke-61..180.
 * Yang menentukan sudah sampai mana bukan tanggal — sheet tidak memuat tanggal
 * mulai — melainkan bulan keberapa pembayaran itu di antara semua pembayaran
 * kategori tersebut.
 *
 * Nomor angsuran dihitung dari posisi bulan yang sedang dilihat di dalam daftar
 * bulan yang pernah dibayar, bukan dari jumlahnya. Bedanya terasa saat menengok
 * bulan lalu: kalau memakai jumlah, September dan Juli sama-sama akan mengaku
 * angsuran terakhir.
 */
function tahapCicilan(baris, peta, bulan) {
  const offset = new Map();
  const hasil = new Map();
  baris.forEach((b) => {
    const kat = b.kategori;
    const x = kat ? ambil(peta, kat) : { perBulan: new Map() };
    const urut = [...x.perBulan.keys()].sort();
    const posisi = urut.indexOf(bulan);
    // Angsuran keberapa yang sedang dibicarakan: kalau bulan ini sudah dibayar,
    // ya angsuran itu sendiri; kalau belum, angsuran berikutnya yang jatuh tempo.
    const ke = posisi >= 0 ? posisi + 1 : urut.length + 1;
    const mulai = offset.get(kat) || 0;
    const tenor = b._tenor;
    const tahap = ke > mulai + tenor ? 'selesai' : ke > mulai ? 'berjalan' : 'berikutnya';
    hasil.set(b, {
      offset: mulai,
      tahap,
      angsuranKe: Math.min(Math.max(ke - mulai, 1), tenor),
      // Angsuran yang masih harus dibayar. Kalau bulan ini sudah dibayar,
      // angsuran ke-`ke` sudah lewat dan tidak ikut dihitung lagi; kalau belum,
      // ia justru yang paling depan dalam antrean.
      sisaAngsuran: tahap === 'selesai' ? 0
        : tahap === 'berikutnya' ? tenor
        : mulai + tenor - ke + (posisi >= 0 ? 0 : 1)
    });
    offset.set(kat, mulai + tenor);
  });
  return hasil;
}

/**
 * @param {Array} baris Baris rupiah dari tab TARGET, sudah dilengkapi
 *   `kategori` oleh pemanggilnya. Urutannya harus urutan di sheet — itulah yang
 *   menentukan tahap cicilan mana yang lebih dulu.
 * @param {Array} transaksi Hanya transaksi yang ikut hitungan; pemanggilnya
 *   yang membuang kelompok netral, supaya modul ini tidak perlu tahu apa itu
 *   `Transfer / Tidak dihitung`.
 * @param {string} bulan 'YYYY-MM' yang sedang dilihat.
 */
export function susunTarget(baris, transaksi, bulan) {
  const peta = indeks(transaksi);
  const tahun = String(bulan).slice(0, 4);
  const lengkap = baris.map((b) => {
    const { jenis, tenor } = jenisTarget(b.periode);
    return { ...b, jenis, _tenor: tenor };
  });
  const tahap = tahapCicilan(lengkap.filter((b) => b.jenis === 'cicilan'), peta, bulan);

  return lengkap.map((b) => {
    const x = b.kategori ? ambil(peta, b.kategori) : { total: 0, perBulan: new Map() };
    const dasar = {
      nama: b.nama, nilai: b.nilai, periode: b.periode, keterangan: b.keterangan,
      kategori: b.kategori, jenis: b.jenis
    };

    if (b.jenis === 'cicilan') {
      const t = tahap.get(b);
      // Angsuran bulan ini hanya diakui oleh tahap yang sedang berjalan. Dua
      // tahap KPR berbagi kategori `KPR`; tanpa saringan ini satu pembayaran
      // akan muncul di kedua barisnya.
      const dibayarBulanIni = t.tahap === 'berjalan' ? (x.perBulan.get(bulan) || 0) : 0;
      return {
        ...dasar,
        tenor: b._tenor,
        komitmen: b.nilai * b._tenor,
        tahap: t.tahap,
        angsuranKe: t.angsuranKe,
        sisaAngsuran: t.sisaAngsuran,
        target: b.nilai,
        terkumpul: dibayarBulanIni,
        sisa: Math.max(b.nilai - dibayarBulanIni, 0),
        persen: b.nilai ? Math.min((dibayarBulanIni / b.nilai) * 100, 100) : 0
      };
    }

    if (b.jenis === 'utang') {
      const dibayar = x.total;
      const sisa = Math.max(b.nilai - dibayar, 0);
      const rata = rataSetoran(x);
      return {
        ...dasar,
        target: b.nilai, terkumpul: dibayar, sisa,
        persen: b.nilai ? Math.min((dibayar / b.nilai) * 100, 100) : 0,
        rataBulanan: rata,
        lunasPada: perkiraanLunas(sisa, rata, bulan)
      };
    }

    if (b.jenis === 'bulanan') {
      const kini = x.perBulan.get(bulan) || 0;
      return {
        ...dasar,
        target: b.nilai, terkumpul: kini,
        sisa: Math.max(b.nilai - kini, 0),
        persen: b.nilai ? Math.min((kini / b.nilai) * 100, 100) : 0
      };
    }

    if (b.jenis === 'tahunan') {
      const kini = jumlahTahun(x, tahun);
      const sisa = Math.max(b.nilai - kini, 0);
      // Bulan berjalan ikut dihitung sebagai kesempatan yang masih terbuka.
      const bulanTersisa = 12 - Number(String(bulan).slice(5, 7)) + 1;
      return {
        ...dasar,
        tahun,
        target: b.nilai, terkumpul: kini, sisa,
        persen: b.nilai ? Math.min((kini / b.nilai) * 100, 100) : 0,
        bulanTersisa,
        perluPerBulan: bulanTersisa > 0 ? sisa / bulanTersisa : sisa
      };
    }

    const rata = rataSetoran(x);
    const sisa = Math.max(b.nilai - x.total, 0);
    return {
      ...dasar,
      target: b.nilai, terkumpul: x.total, sisa,
      persen: b.nilai ? Math.min((x.total / b.nilai) * 100, 100) : 0,
      rataBulanan: rata,
      lunasPada: perkiraanLunas(sisa, rata, bulan)
    };
  });
}

/**
 * Urutan "yang paling perlu dilihat lebih dulu": kewajiban bulan ini di atas,
 * cita-cita jangka panjang di bawah. Dipakai kartu ringkas di Beranda, yang
 * cuma memuat tiga baris.
 */
const URUTAN = { cicilan: 0, bulanan: 1, utang: 2, tahunan: 3, total: 4 };

export function urutMendesak(daftar) {
  return daftar.slice().sort((a, b) => {
    // Tahap yang belum jalan tidak pernah mendesak, sesudah apa pun.
    const diamA = a.tahap === 'berikutnya' || a.tahap === 'selesai' ? 1 : 0;
    const diamB = b.tahap === 'berikutnya' || b.tahap === 'selesai' ? 1 : 0;
    if (diamA !== diamB) return diamA - diamB;
    const ua = URUTAN[a.jenis] ?? 9;
    const ub = URUTAN[b.jenis] ?? 9;
    if (ua !== ub) return ua - ub;
    // Dalam satu jenis, yang paling jauh dari selesai lebih dulu.
    return a.persen - b.persen;
  });
}
