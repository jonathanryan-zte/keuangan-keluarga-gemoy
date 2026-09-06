/**
 * Tagihan rutin & cicilan.
 *
 * Tagihan TIDAK dibuat lebih dulu sebagai baris transaksi kosong — itu bikin
 * Sheet penuh baris nol yang membingungkan. Sebagai gantinya, sebuah tagihan
 * dianggap sudah dibayar bulan X kalau ada transaksi bulan X yang catatannya
 * memuat penanda `#rutin:<id>`. Aplikasi memakai aturan yang sama, jadi
 * centang di HP dan pengingat pagi selalu sepakat.
 */

var PENANDA_RUTIN = '#rutin:';

function penandaRutin_(id) {
  return PENANDA_RUTIN + id;
}

/** Status seluruh tagihan/cicilan untuk satu bulan 'yyyy-MM'. */
function statusRutinBulan_(bulan) {
  var terbayar = {};
  // Sengaja lewat semuaTransaksi_(), bukan hanya tab aplikasi: sebuah tagihan
  // bisa saja dibayar dan dicatat tangan di INPUT TRANSAKSI, lengkap dengan
  // penandanya di kolom Catatan. Kalau yang dibaca cuma tab aplikasi,
  // pengingat pagi akan menagih sesuatu yang sudah dibayar.
  semuaTransaksi_().forEach(function (t) {
    if (t.bulan !== bulan) return;
    var catatan = String(t.catatan || '');
    var pos = catatan.indexOf(PENANDA_RUTIN);
    if (pos < 0) return;
    var id = catatan.substring(pos + PENANDA_RUTIN.length).split(/[\s,;]/)[0];
    terbayar[id] = { id: String(t.id), nominal: t.nominal, tanggal: t.tanggal };
  });

  return baca_(TAB.RUTIN).map(bentukRutin_).filter(function (r) {
    return r.aktif;
  }).map(function (r) {
    var info = hitungTermin_(r, bulan);
    return {
      rutin: r,
      bulan: bulan,
      jatuhTempo: tanggalJatuhTempo_(bulan, r.hariJatuhTempo),
      terbayar: !!terbayar[r.id],
      transaksi: terbayar[r.id] || null,
      terminKe: info.terminKe,
      selesai: info.selesai,
      bulanLunas: info.bulanLunas
    };
  }).filter(function (s) {
    // Cicilan yang sudah lunas tidak perlu muncul lagi.
    return !s.selesai;
  });
}

/** Cicilan berjangka: termin ke berapa di bulan ini, dan kapan lunas. */
function hitungTermin_(r, bulan) {
  if (r.tipe !== 'cicilan' || !r.totalTermin) {
    return { terminKe: 0, selesai: false, bulanLunas: '' };
  }
  // r.mulai sudah dinormalkan keBulan_() oleh bentukRutin_.
  var mulai = String(r.mulai || '').substring(0, 7);
  if (!mulai) return { terminKe: 0, selesai: false, bulanLunas: '' };
  var selisih = selisihBulan_(mulai, bulan) + 1;
  var lunas = tambahBulan_(mulai, r.totalTermin - 1);
  return {
    terminKe: selisih,
    selesai: selisih > r.totalTermin || selisih < 1,
    bulanLunas: lunas
  };
}

function selisihBulan_(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  return (parseInt(pb[0], 10) - parseInt(pa[0], 10)) * 12 +
         (parseInt(pb[1], 10) - parseInt(pa[1], 10));
}

function tambahBulan_(bulan, n) {
  var p = bulan.split('-');
  var total = parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1) + n;
  var th = Math.floor(total / 12);
  var bl = (total % 12) + 1;
  return th + '-' + (bl < 10 ? '0' + bl : String(bl));
}

function tanggalJatuhTempo_(bulan, hari) {
  var p = bulan.split('-');
  var akhir = new Date(parseInt(p[0], 10), parseInt(p[1], 10), 0).getDate();
  var h = Math.min(Math.max(hari || 1, 1), akhir);
  return bulan + '-' + (h < 10 ? '0' + h : String(h));
}

/**
 * Isi tab `KKG Rutin` dengan tagihan & cicilan yang sudah rutin tiap bulan.
 *
 * Nominal dan kategorinya diambil dari baris September 2026 di
 * `INPUT TRANSAKSI` — jadi ini bukan tebakan, melainkan apa yang benar-benar
 * dibayar. Dijalankan sekali saat pemasangan; aman diulang karena mencocokkan
 * nama, dan seluruh angkanya memang untuk diubah sendiri dari aplikasi.
 */
function isiRutinAwal() {
  var sudahAda = {};
  baca_(TAB.RUTIN).forEach(function (r) { sudahAda[String(r.nama).toLowerCase()] = true; });

  var P = JENIS.PENGELUARAN;
  var A = JENIS.ALOKASI;

  // [nama, jenis, kelompok, kategori, nominal, hari jatuh tempo]
  var tagihan = [
    ['Arisan',                  A, KELOMPOK.SAVING, 'Investasi',                  2500000,  1],
    ['Tabungan Bulanan',        A, KELOMPOK.SAVING, 'Investasi',                  7200000,  1],
    ['Iuran Perumahan Pocan',   P, KELOMPOK.HARIAN, 'Kebutuhan Rumah',             295000,  5],
    ['Iuran Gizi',              P, KELOMPOK.HARIAN, 'Kebutuhan Rumah',              40000,  5],
    ['Iuran Mita Wonokoyo',     A, KELOMPOK.SOSIAL, 'Bantuan Orang Tua/Keluarga',  130000,  5],
    ['Kasih Papa Mama Ryan',    A, KELOMPOK.SOSIAL, 'Bantuan Orang Tua/Keluarga',  370000,  1],
    ['Internet Rumah Menganti', A, KELOMPOK.SOSIAL, 'Bantuan Orang Tua/Keluarga',  300000, 10],
    ['KPR',                     P, KELOMPOK.HARIAN, 'KPR',                        2200000, 10],
    ['Indihome',                P, KELOMPOK.HARIAN, 'Kebutuhan Rumah',             213400, 15],
    ['PDAM',                    P, KELOMPOK.HARIAN, 'Kebutuhan Rumah',              52500, 15],
    ['Listrik',                 P, KELOMPOK.HARIAN, 'Listrik',                     990000, 15],
    ['Bensin',                  P, KELOMPOK.HARIAN, 'BBM/Transportasi',           1200000,  1],
    ['Telkomsel (HALO)',        P, KELOMPOK.HARIAN, 'Internet/HP',                  97680, 20],
    ['Icloud',                  P, KELOMPOK.HARIAN, 'Subscription',                 52000, 20],
    ['Spotify',                 P, KELOMPOK.HARIAN, 'Subscription',                104900, 20],
    ['Netflix',                 P, KELOMPOK.HARIAN, 'Subscription',                 37200, 20],
    ['Uang Makan Ryan',         P, KELOMPOK.HARIAN, 'Makan di Luar',               700000,  1],
    ['Hutang ke Mas Johan',     A, KELOMPOK.SAVING, 'Hutang Rumah',               1000000,  1]
  ];

  // [nama, jenis, kelompok, kategori, nominal, hari, total termin, bulan mulai]
  var cicilan = [
    ['Cicilan Iphone',        P, KELOMPOK.LUAR,   'Internet/HP',      1229083, 10, 12, '2026-01'],
    ['Cicilan Gym',           P, KELOMPOK.LUAR,   'Gym/Olahraga',      560850, 10,  6, '2026-04'],
    ['Cicilan Jam Papa Tere', P, KELOMPOK.LUAR,   'Hadiah',            543603, 10,  6, '2026-04'],
    ['Cicilan Service Mobil', P, KELOMPOK.HARIAN, 'BBM/Transportasi',  292079, 10,  5, '2026-04']
  ];

  var baru = [];
  tagihan.forEach(function (t) {
    if (sudahAda[t[0].toLowerCase()]) return;
    baru.push({
      id: idBaru_('rtn'), nama: t[0], tipe: 'tagihan', jenis: t[1], kelompok: t[2],
      kategori: t[3], bayar_pakai: '', milik: 'Bersama', nominal: t[4],
      sifat: SIFAT.WAJIB, hari_jatuh_tempo: t[5],
      mulai: '', total_termin: '', termin_terbayar: '', aktif: true
    });
  });
  cicilan.forEach(function (c) {
    if (sudahAda[c[0].toLowerCase()]) return;
    baru.push({
      id: idBaru_('rtn'), nama: c[0], tipe: 'cicilan', jenis: c[1], kelompok: c[2],
      kategori: c[3], bayar_pakai: '', milik: 'Bersama', nominal: c[4],
      sifat: SIFAT.WAJIB, hari_jatuh_tempo: c[5],
      mulai: c[7], total_termin: c[6], termin_terbayar: 0, aktif: true
    });
  });

  tulisBanyak_(TAB.RUTIN, baru);
  return baru.length + ' rutin ditambahkan (' + Object.keys(sudahAda).length + ' sudah ada sebelumnya).';
}
