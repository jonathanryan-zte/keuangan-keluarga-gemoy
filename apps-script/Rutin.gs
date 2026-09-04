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
  baca_(TAB.TRANSAKSI).forEach(function (t) {
    if (String(t.status || 'aktif') === 'dihapus') return;
    if (bulanDari_(t.tanggal) !== bulan) return;
    var catatan = String(t.catatan || '');
    var pos = catatan.indexOf(PENANDA_RUTIN);
    if (pos < 0) return;
    var id = catatan.substring(pos + PENANDA_RUTIN.length).split(/[\s,;]/)[0];
    terbayar[id] = { id: String(t.id), nominal: angka_(t.nominal), tanggal: keTanggal_(t.tanggal) };
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
 * Isi tab `Rutin` dengan tagihan & cicilan yang terbaca dari Sheet lama.
 * Dijalankan sekali saat pemasangan; aman diulang karena mencocokkan nama.
 */
function isiRutinAwal() {
  var sudahAda = {};
  baca_(TAB.RUTIN).forEach(function (r) { sudahAda[String(r.nama).toLowerCase()] = true; });

  var tagihan = [
    ['Arisan Kantor',            'Arisan',        1000000, 1],
    ['Arisan Cappadocia',        'Arisan',        1500000, 1],
    ['Iuran Perumahan',          'Rumah',          295000, 5],
    ['Iuran Gizi',               'Keluarga',        70000, 5],
    ['Iuran Mitra Wonokoyo',     'Keluarga',       130000, 5],
    ['KPR Rumah Menganti',       'Rumah',         3200000, 10],
    ['Internet Rumah Menganti',  'Utilitas',       295260, 10],
    ['Internet',                 'Utilitas',       288400, 15],
    ['PDAM',                     'Utilitas',        52500, 15],
    ['Listrik',                  'Utilitas',       990000, 15],
    ['Bensin',                   'Transport',     1200000, 1],
    ['Telkomsel',                'Utilitas',        88800, 20],
    ['iCloud',                   'Langganan',       52000, 20],
    ['Spotify',                  'Langganan',      104900, 20],
    ['Netflix Tere',             'Langganan',       37200, 20],
    ['Kasih Papa Mama Ryan',     'Keluarga',       370000, 1],
    ['Hutang ke Mas Johan',      'Keluarga',      1000000, 1],
    ['Uang Makan Ryan',          'Uang Makan',     700000, 1]
  ];

  // [nama, kategori, nominal per bulan, hari jatuh tempo, total termin, bulan mulai]
  var cicilan = [
    ['Iphone 16',          'Cicilan', 1229083, 10, 12, '2026-01'],
    ['Jam Papa Tere',      'Cicilan',  543603, 10,  6, '2026-04'],
    ['Fitnessworks',       'Cicilan',  560850, 10,  6, '2026-04'],
    ['Cicilan Service Mobil', 'Cicilan', 292079, 10, 5, '2026-04']
  ];

  var baru = [];
  tagihan.forEach(function (t) {
    if (sudahAda[t[0].toLowerCase()]) return;
    baru.push({
      id: idBaru_('rtn'), nama: t[0], tipe: 'tagihan', jenis: JENIS.TETAP,
      kategori: t[1], nominal: t[2], sifat: SIFAT.WAJIB, hari_jatuh_tempo: t[3],
      mulai: '', total_termin: '', termin_terbayar: '', aktif: true
    });
  });
  cicilan.forEach(function (c) {
    if (sudahAda[c[0].toLowerCase()]) return;
    baru.push({
      id: idBaru_('rtn'), nama: c[0], tipe: 'cicilan', jenis: JENIS.TETAP,
      kategori: c[1], nominal: c[2], sifat: SIFAT.WAJIB, hari_jatuh_tempo: c[3],
      mulai: c[5], total_termin: c[4], termin_terbayar: 0, aktif: true
    });
  });

  tulisBanyak_(TAB.RUTIN, baru);
  return baru.length + ' rutin ditambahkan (' + Object.keys(sudahAda).length + ' sudah ada sebelumnya).';
}
