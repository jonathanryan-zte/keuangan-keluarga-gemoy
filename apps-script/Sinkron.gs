/**
 * Sinkron berulang dari tab lama (`Monthly 25`, `Monthly 26`, `SAVING 2026`)
 * ke tab `Transaksi` dan `Saving`.
 *
 * Migrasi.gs memindahkan data lama sekali jalan. Berkas ini untuk kenyataan
 * yang ternyata belum berakhir: admin masih mengisi `Monthly 26` setiap hari,
 * dan isinya harus muncul di aplikasi tanpa menimpa apa pun yang sudah
 * dirapikan Ryan lewat HP.
 *
 * Cara pakai:
 *   1. periksaSinkron()   -> tulis rencana ke tab "Sinkron Cek", tidak mengubah apa pun
 *   2. jalankanSinkron()  -> kerjakan rencananya
 *   3. pasangPemicuSinkron() -> sekali saja, supaya jalan sendiri tiap subuh
 *
 * Tiga hal yang membuatnya aman diulang berkali-kali:
 *
 * - **Id dihitung dari isi barisnya**, bukan dari nomor urut bacanya (lihat
 *   idMigrasi_ di Migrasi.gs). Baris yang sama di Sheet lama selalu
 *   menghasilkan id yang sama, jadi sinkron kedua mengenalinya sebagai baris
 *   lama dan tidak menambah kembaran.
 * - **Baris yang sudah ada tidak pernah ditimpa.** Kategori, sifat, dan
 *   tanggal yang sudah Ryan betulkan lewat layar Rapikan tetap seperti itu,
 *   walaupun tebakan mesinnya sekarang berbeda.
 * - **Tidak ada baris yang dihapus.** Baris yang hilang dari tab lama hanya
 *   diberi catatan dan dilaporkan; Ryan yang memutuskan.
 *
 * Baris bersumber aplikasi (`sumber` != 'migrasi') tidak pernah disentuh.
 */

var TAB_SINKRON_CEK = 'Sinkron Cek';
var TAB_SINKRON_LOG = 'Sinkron Log';
var JAM_SINKRON = 5;   // sejam sebelum pengingat pagi, waktu setempat spreadsheet

/** Catatan yang ditempelkan ke baris yang sudah tidak ada lagi di tab lama. */
var TANDA_HILANG = 'hilang dari sheet lama';

// ------------------------------------------------------------------ pintu --

/** Rencana tanpa mengubah apa pun. Hasilnya ditulis ke tab "Sinkron Cek". */
function periksaSinkron() {
  var hasil = sinkron_({ periksaSaja: true, pemanggil: 'periksa' });
  var pesan = hasil.pesan + ' Rinciannya ada di tab "' + TAB_SINKRON_CEK + '".';
  kabarkan_(pesan, 'Belum ada yang diubah');
  return pesan;
}

/** Kerjakan rencananya. Aman diulang. */
function jalankanSinkron() {
  var pesan = sinkron_({ periksaSaja: false, pemanggil: 'manual' }).pesan;
  kabarkan_(pesan, 'Sinkron selesai');
  return pesan;
}

/**
 * Kabar untuk yang menjalankan dari menu KKG. Dijalankan dari editor Apps
 * Script, nilai baliknya sudah cukup; dijalankan dari menu, tidak ada yang
 * muncul sama sekali kalau tidak ditoastkan.
 */
function kabarkan_(pesan, judul) {
  try { ss_().toast(pesan, judul, 15); } catch (e) { /* tanpa UI, mis. dari pemicu */ }
}

/** Dipanggil pemicu harian. */
function sinkronHarian() {
  return sinkron_({ periksaSaja: false, pemanggil: 'pemicu' }).pesan;
}

/** Dipanggil aplikasi lewat aksi `sinkron.jalankan`. */
function sinkronDariAplikasi_() {
  return sinkron_({ periksaSaja: false, pemanggil: 'aplikasi' });
}

function pasangPemicuSinkron() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sinkronHarian') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sinkronHarian')
    .timeBased().atHour(JAM_SINKRON).everyDays(1).create();
  return 'Pemicu sinkron dipasang sekitar jam ' + JAM_SINKRON + ' pagi.';
}

// ------------------------------------------------------------------- inti --

function sinkron_(opsi) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(60000);
  try {
    var sumber = bacaSemuaTabLama_().transaksi;
    var rencana = rencanaTransaksi_(sumber, baca_(TAB.TRANSAKSI));
    var rencanaSvg = rencanaSaving_(bacaSavingLama_(), baca_(TAB.SAVING));

    if (!opsi.periksaSaja) {
      terapkanTransaksi_(rencana);
      terapkanSaving_(rencanaSvg);
      // Membangun ulang Ringkasan dan saldo saving hanya kalau angkanya
      // memang berubah. Mengenali ulang id tidak mengubah satu rupiah pun,
      // dan sinkron ini jalan tiap hari.
      if (rencana.pengaruhAngka) bangunRingkasan_();
      if (rencanaSvg.pengaruhAngka) { hitungUlangSaldoSaving_(); bangunRingkasan_(); }
    }

    var ringkas = {
      periksaSaja: !!opsi.periksaSaja,
      ditambah: rencana.ditambah.length,
      dirapikan: rencana.dirapikan.length,
      nominalDiperbarui: rencana.nominalBerubah.length,
      hilang: rencana.yatim.length,
      curiga: rencana.curiga.length,
      savingDitambah: rencanaSvg.ditambah.length,
      savingDirapikan: rencanaSvg.dirapikan.length,
      savingHilang: rencanaSvg.yatim.length
    };
    ringkas.pesan = susunPesan_(ringkas);

    tulisCekSinkron_(rencana, rencanaSvg, ringkas);
    if (!opsi.periksaSaja) catatLogSinkron_(opsi.pemanggil, ringkas);
    return ringkas;
  } finally {
    kunci.releaseLock();
  }
}

function susunPesan_(r) {
  var awalan = r.periksaSaja ? 'Kalau dijalankan: ' : 'Selesai: ';
  var bagian = [];
  bagian.push(r.ditambah + ' transaksi baru');
  if (r.nominalDiperbarui) bagian.push(r.nominalDiperbarui + ' nominal diperbarui');
  if (r.dirapikan) bagian.push(r.dirapikan + ' baris lama dikenali ulang');
  if (r.savingDitambah) bagian.push(r.savingDitambah + ' mutasi saving baru');
  if (r.hilang) bagian.push(r.hilang + ' baris tidak ada lagi di sheet lama');
  if (r.curiga) bagian.push(r.curiga + ' perlu diperiksa sendiri');
  return awalan + bagian.join(', ') + '.';
}

// -------------------------------------------------------------- pencocokan --

/**
 * Pasangkan tiap baris sumber dengan baris `Transaksi` yang sudah ada.
 *
 * Bertingkat, dari yang paling pasti ke yang paling longgar:
 *
 *   1. `id` sama persis — baris yang memang sudah pernah disinkron.
 *   2. bulan + jenis + nama item + nominal sama. Ini yang mengangkat baris
 *      hasil migrasi pertama dulu (yang id-nya masih bernomor urut) menjadi
 *      id gaya baru, tanpa menyentuh isinya.
 *   3. bulan + jenis + nama item sama tapi nominalnya beda, dan pasangannya
 *      benar-benar satu lawan satu. Ini kejadian "admin membetulkan angka".
 *
 * Lebih longgar dari itu tidak ditebak. Baris yang tidak berpasangan hanya
 * dilaporkan sebagai perlu diperiksa — mesin tidak boleh menebak-nebak dengan
 * uang orang.
 */
function rencanaTransaksi_(sumber, semuaBaris) {
  var lama = semuaBaris.filter(function (b) { return String(b.sumber) === 'migrasi'; });
  var aplikasi = semuaBaris.filter(function (b) { return String(b.sumber) !== 'migrasi'; });

  var perId = {};
  lama.forEach(function (b) { perId[String(b.id)] = b; });

  var dipakai = {};
  var sisaSumber = [];
  sumber.forEach(function (s) {
    var b = perId[s.id];
    // Termasuk baris yang sudah Ryan hapus lewat aplikasi: sudah dikenali,
    // jadi tidak akan dibangkitkan lagi.
    if (b && !dipakai[b._baris]) { dipakai[b._baris] = true; return; }
    sisaSumber.push(s);
  });

  var idxPenuh = {}, idxItem = {};
  lama.forEach(function (b) {
    if (dipakai[b._baris]) return;
    var bulan = bulanDari_(b.tanggal), jenis = String(b.jenis);
    dorong_(idxPenuh, tandaPenuh_(bulan, jenis, b.item, b.nominal), b);
    dorong_(idxItem, tandaItem_(bulan, jenis, b.item), b);
  });

  // Tingkat 3 hanya boleh jalan kalau tidak ada saingan di sisi sumber.
  var hitungItemSumber = {};
  sisaSumber.forEach(function (s) {
    var k = tandaItem_(bulanDari_(s.tanggal), s.jenis, s.item);
    hitungItemSumber[k] = (hitungItemSumber[k] || 0) + 1;
  });

  var dirapikan = [], nominalBerubah = [], ditambah = [];
  sisaSumber.forEach(function (s) {
    var bulan = bulanDari_(s.tanggal), jenis = s.jenis;

    var b = ambilBebas_(idxPenuh[tandaPenuh_(bulan, jenis, s.item, s.nominal)], dipakai);
    if (b) {
      dipakai[b._baris] = true;
      dirapikan.push({ baris: b, sumber: s });
      return;
    }

    var kunciItem = tandaItem_(bulan, jenis, s.item);
    var kandidat = semuaBebas_(idxItem[kunciItem], dipakai);
    if (kandidat.length === 1 && hitungItemSumber[kunciItem] === 1) {
      dipakai[kandidat[0]._baris] = true;
      nominalBerubah.push({ baris: kandidat[0], sumber: s });
      return;
    }

    ditambah.push(s);
  });

  var yatim = lama.filter(function (b) { return !dipakai[b._baris]; });

  return {
    dirapikan: dirapikan,
    nominalBerubah: nominalBerubah,
    ditambah: ditambah,
    yatim: yatim,
    curiga: curiga_(ditambah, yatim, aplikasi),
    pengaruhAngka: !!(ditambah.length || nominalBerubah.length)
  };
}

/**
 * Hal-hal yang tidak boleh diputuskan mesin, tapi sayang kalau tidak
 * diberitahukan:
 *
 * - Baris baru yang nominalnya sama persis dengan baris yang justru hilang
 *   dari tab lama. Biasanya berarti admin membetulkan tulisan namanya, dan
 *   dua baris itu sebenarnya satu.
 * - Baris baru yang bulan, jenis, dan nominalnya sama dengan catatan yang
 *   sudah Ryan masukkan sendiri lewat aplikasi. Biasanya berarti belanja yang
 *   sama dicatat dua kali dari dua arah.
 */
function curiga_(ditambah, yatim, aplikasi) {
  var hasil = [];

  var perYatim = {};
  yatim.forEach(function (b) {
    dorong_(perYatim, tandaNominal_(bulanDari_(b.tanggal), String(b.jenis), b.nominal), b);
  });
  var perAplikasi = {};
  aplikasi.forEach(function (b) {
    if (String(b.status || 'aktif') === 'dihapus') return;
    dorong_(perAplikasi, tandaNominal_(bulanDari_(b.tanggal), String(b.jenis), b.nominal), b);
  });

  // Kalau satu nominal punya banyak calon pasangan, dugaannya sudah tidak
  // berarti apa-apa — yang keluar cuma daftar panjang tanpa petunjuk. Lebih
  // baik diam.
  var BATAS_CALON = 3;

  ditambah.forEach(function (s) {
    var k = tandaNominal_(bulanDari_(s.tanggal), s.jenis, s.nominal);
    if ((perYatim[k] || []).length > BATAS_CALON) return;
    if ((perAplikasi[k] || []).length > BATAS_CALON) return;
    (perYatim[k] || []).forEach(function (b) {
      hasil.push({
        sebab: 'mungkin baris yang sama, hanya berubah tulisannya',
        baru: s, banding: b
      });
    });
    (perAplikasi[k] || []).forEach(function (b) {
      hasil.push({
        sebab: 'nominal sama dengan catatan dari aplikasi — mungkin tercatat dua kali',
        baru: s, banding: b
      });
    });
  });
  return hasil;
}

function normalItem_(teks) {
  return String(teks || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function tandaItem_(bulan, jenis, item) {
  return bulan + '|' + jenis + '|' + normalItem_(item);
}
function tandaPenuh_(bulan, jenis, item, nominal) {
  return tandaItem_(bulan, jenis, item) + '|' + Math.round(angka_(nominal));
}
function tandaNominal_(bulan, jenis, nominal) {
  return bulan + '|' + jenis + '|' + Math.round(angka_(nominal));
}

function dorong_(peta, kunci, nilai) {
  if (!peta[kunci]) peta[kunci] = [];
  peta[kunci].push(nilai);
}
function semuaBebas_(daftar, dipakai) {
  return (daftar || []).filter(function (b) { return !dipakai[b._baris]; });
}
function ambilBebas_(daftar, dipakai) {
  var bebas = semuaBebas_(daftar, dipakai);
  return bebas.length ? bebas[0] : null;
}

// ---------------------------------------------------------------- saving --

/** Versi ringkas dari rencanaTransaksi_ untuk tab `Saving`. */
function rencanaSaving_(sumber, semuaBaris) {
  var lama = semuaBaris.filter(function (b) {
    return String(b.id).indexOf('migsvg-') === 0;
  });
  var perId = {};
  lama.forEach(function (b) { perId[String(b.id)] = b; });

  var dipakai = {}, sisaSumber = [];
  sumber.forEach(function (s) {
    var b = perId[s.id];
    if (b && !dipakai[b._baris]) { dipakai[b._baris] = true; return; }
    sisaSumber.push(s);
  });

  var idx = {};
  lama.forEach(function (b) {
    if (dipakai[b._baris]) return;
    dorong_(idx, tandaSaving_(keTanggal_(b.tanggal), b.debet, b.kredit, b.keterangan), b);
  });

  var dirapikan = [], ditambah = [];
  sisaSumber.forEach(function (s) {
    var b = ambilBebas_(idx[tandaSaving_(s.tanggal, s.debet, s.kredit, s.keterangan)], dipakai);
    if (b) { dipakai[b._baris] = true; dirapikan.push({ baris: b, sumber: s }); return; }
    ditambah.push(s);
  });

  var yatim = lama.filter(function (b) { return !dipakai[b._baris]; });
  return {
    dirapikan: dirapikan, ditambah: ditambah, yatim: yatim,
    pengaruhAngka: !!ditambah.length
  };
}

function tandaSaving_(tanggal, debet, kredit, keterangan) {
  return keTanggal_(tanggal) + '|' + Math.round(angka_(debet)) + '|' +
         Math.round(angka_(kredit)) + '|' + normalItem_(keterangan);
}

// -------------------------------------------------------------- eksekusi --

function terapkanTransaksi_(rencana) {
  var sel = [];

  rencana.dirapikan.forEach(function (p) {
    sel.push({ baris: p.baris._baris, kolom: 'id', nilai: p.sumber.id });
  });

  rencana.nominalBerubah.forEach(function (p) {
    sel.push({ baris: p.baris._baris, kolom: 'id', nilai: p.sumber.id });
    sel.push({ baris: p.baris._baris, kolom: 'nominal', nilai: p.sumber.nominal });
    sel.push({ baris: p.baris._baris, kolom: 'diubah', nilai: sekarang_() });
    sel.push({
      baris: p.baris._baris, kolom: 'catatan',
      nilai: tambahCatatan_(p.baris.catatan,
        'nominal diperbarui dari sheet lama (' + Math.round(angka_(p.baris.nominal)) + ')')
    });
  });

  // Baris yang tidak ada lagi di tab lama TIDAK dihapus — cuma diberi tanda,
  // supaya Ryan yang memutuskan. Tandanya ditempel sekali saja walaupun
  // sinkronnya jalan tiap hari.
  rencana.yatim.forEach(function (b) {
    var catatan = String(b.catatan || '');
    if (catatan.indexOf(TANDA_HILANG) >= 0) return;
    sel.push({ baris: b._baris, kolom: 'catatan', nilai: tambahCatatan_(catatan, TANDA_HILANG) });
  });

  terapkanSel_(TAB.TRANSAKSI, sel);
  if (rencana.ditambah.length) tulisBanyak_(TAB.TRANSAKSI, rencana.ditambah);
}

function terapkanSaving_(rencana) {
  var sel = rencana.dirapikan.map(function (p) {
    return { baris: p.baris._baris, kolom: 'id', nilai: p.sumber.id };
  });
  terapkanSel_(TAB.SAVING, sel);
  if (rencana.ditambah.length) tulisBanyak_(TAB.SAVING, rencana.ditambah);
}

function tambahCatatan_(catatan, tambahan) {
  var isi = String(catatan || '').trim();
  if (!isi) return tambahan;
  if (isi.indexOf(tambahan) >= 0) return isi;
  return isi + ', ' + tambahan;
}

/**
 * Tulis sekumpulan sel tanpa menyentuh kolom lain. Dikelompokkan per kolom
 * lalu ditulis sekali per kolom — sinkron pertama bisa menyentuh ratusan
 * baris, dan setValue satu-satu akan kena batas waktu Apps Script.
 */
function terapkanSel_(nama, perubahan) {
  if (!perubahan.length) return 0;
  var sh = tab_(nama);
  var akhir = sh.getLastRow();
  if (akhir < 2) return 0;
  var header = HEADER[nama];

  var perKolom = {};
  perubahan.forEach(function (p) { dorong_(perKolom, p.kolom, p); });

  Object.keys(perKolom).forEach(function (k) {
    var idx = header.indexOf(k);
    if (idx < 0) return;
    var rentang = sh.getRange(2, idx + 1, akhir - 1, 1);
    var nilai = rentang.getValues();
    perKolom[k].forEach(function (p) {
      if (p.baris >= 2 && p.baris <= akhir) nilai[p.baris - 2][0] = p.nilai;
    });
    rentang.setValues(nilai);
  });
  return perubahan.length;
}

// ---------------------------------------------------------------- laporan --

/** Rencana (atau hasil) sinkron, satu baris per perubahan. */
function tulisCekSinkron_(rencana, rencanaSvg, ringkas) {
  var header = ['aksi', 'bulan', 'jenis', 'kategori', 'item', 'nominal', 'keterangan'];
  var baris = [header];

  rencana.ditambah.forEach(function (s) {
    baris.push(['tambah', bulanDari_(s.tanggal), s.jenis, s.kategori, s.item,
                Math.round(angka_(s.nominal)), s.catatan || '']);
  });
  rencana.nominalBerubah.forEach(function (p) {
    baris.push(['nominal berubah', bulanDari_(p.sumber.tanggal), p.sumber.jenis,
                p.baris.kategori, p.sumber.item, Math.round(angka_(p.sumber.nominal)),
                'sebelumnya ' + Math.round(angka_(p.baris.nominal))]);
  });
  rencana.yatim.forEach(function (b) {
    baris.push(['tidak ada lagi di sheet lama', bulanDari_(b.tanggal), b.jenis,
                b.kategori, b.item, Math.round(angka_(b.nominal)),
                'baris ' + b._baris + ' tab Transaksi — tidak dihapus, hanya ditandai']);
  });
  rencana.curiga.forEach(function (c) {
    baris.push(['periksa sendiri', bulanDari_(c.baru.tanggal), c.baru.jenis,
                c.baru.kategori, c.baru.item, Math.round(angka_(c.baru.nominal)),
                c.sebab + ' — bandingkan dengan "' + c.banding.item + '"']);
  });
  rencanaSvg.ditambah.forEach(function (s) {
    baris.push(['tambah saving', bulanDari_(s.tanggal), 'SAVING', '',
                s.keterangan, Math.round(angka_(s.debet) - angka_(s.kredit)), '']);
  });
  rencanaSvg.yatim.forEach(function (b) {
    baris.push(['saving tidak ada lagi di sheet lama', bulanDari_(b.tanggal), 'SAVING', '',
                b.keterangan, Math.round(angka_(b.debet) - angka_(b.kredit)),
                'baris ' + b._baris + ' tab Saving']);
  });

  if (baris.length === 1) {
    baris.push(['tidak ada perubahan', '', '', '', '', '',
                rencana.dirapikan.length + ' baris lama sudah cocok']);
  }

  var sh = ss_().getSheetByName(TAB_SINKRON_CEK) || ss_().insertSheet(TAB_SINKRON_CEK);
  sh.clear();
  sh.getRange(1, 1, baris.length, header.length).setValues(baris);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold')
    .setBackground('#0F766E').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 6, Math.max(baris.length - 1, 1), 1).setNumberFormat('#,##0');
  sh.autoResizeColumns(1, header.length);
  sh.getRange(1, header.length).setNote(ringkas.pesan);
}

/** Satu baris per sinkron yang benar-benar dikerjakan. Riwayat, bukan rencana. */
function catatLogSinkron_(pemanggil, r) {
  var header = ['waktu', 'dipanggil dari', 'ditambah', 'nominal diperbarui',
                'dikenali ulang', 'tidak ada lagi di sheet lama', 'perlu diperiksa',
                'saving ditambah'];
  var sh = ss_().getSheetByName(TAB_SINKRON_LOG);
  if (!sh) {
    sh = ss_().insertSheet(TAB_SINKRON_LOG);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold')
      .setBackground('#0F766E').setFontColor('#FFFFFF');
    sh.setColumnWidths(1, header.length, 130);
  }
  sh.appendRow([sekarang_(), pemanggil, r.ditambah, r.nominalDiperbarui,
                r.dirapikan, r.hilang, r.curiga, r.savingDitambah]);
}
