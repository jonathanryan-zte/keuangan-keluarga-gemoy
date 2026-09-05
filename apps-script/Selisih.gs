/**
 * Menjelaskan kenapa "Sisa" di aplikasi tidak sama dengan "Sisa" yang tertulis
 * di tab lama.
 *
 * Pertanyaan ini akan muncul berkali-kali selama tab lama masih dipakai, dan
 * jawabannya tidak pernah satu kalimat — biasanya campuran dua hal yang
 * berbeda sifatnya:
 *
 *   1. **Bedanya data.** Ada baris di `Monthly 26` yang belum tertarik ke
 *      aplikasi, atau sebaliknya ada catatan yang hanya ada di aplikasi.
 *      Ini hilang sendiri begitu sinkron dijalankan.
 *   2. **Bedanya rumus.** "Sisa" di sheet lama dan "Sisa" di aplikasi memang
 *      tidak menghitung hal yang sama. Aplikasi memakai
 *      `pemasukan - tetap - rumah tangga` dan menampilkan Perpuluhan / Saving
 *      / Entertain sebagai angka tersendiri, sedangkan rumus di sheet lama di
 *      beberapa bulan sudah ikut mengurangkannya. Ini TIDAK akan hilang
 *      dengan sinkron, dan memang tidak seharusnya hilang.
 *
 * Berkas ini tidak menebak mana yang berlaku. Ia menghitung keduanya, lalu
 * menutup selisihnya sampai nol — kalau masih ada yang tersisa, angkanya
 * ditulis apa adanya sebagai "belum terjelaskan" alih-alih disembunyikan.
 *
 * Pakai:  periksaSelisih()   -> tulis laporan ke tab "Selisih Cek"
 * Tidak mengubah data apa pun.
 */

var TAB_SELISIH = 'Selisih Cek';

function periksaSelisih() {
  var hasil = kumpulkanSelisih_();
  tulisSelisih_(hasil);
  var pesan = hasil.pesan;
  kabarkan_(pesan, 'Perbandingan selesai');
  return pesan;
}

// ---------------------------------------------------------------- hitungan --

function kumpulkanSelisih_() {
  var bacaan = bacaSemuaTabLama_();
  var barisTransaksi = baca_(TAB.TRANSAKSI);
  var rencana = rencanaTransaksi_(bacaan.transaksi, barisTransaksi);

  // Sheet lama, per bulan: total baris yang layak jadi transaksi + nilai baris
  // turunannya (Sisa, Perpuluhan, Saving, Entertain, ...).
  var sheet = {};
  bacaan.laporan.forEach(function (r) {
    sheet[r.bulan] = {
      pemasukan: r.pemasukan, tetap: r.tetap, rumah_tangga: r.rumah_tangga,
      turunan: r.turunan || {}
    };
  });

  // Aplikasi, per bulan: apa yang benar-benar ada di tab Transaksi sekarang.
  var app = {};
  function selApp(bulan) {
    if (!app[bulan]) {
      app[bulan] = { pemasukan: 0, tetap: 0, rumah_tangga: 0,
                     hanyaApp: { PEMASUKAN: 0, TETAP: 0, RUMAH_TANGGA: 0, jumlah: 0 } };
    }
    return app[bulan];
  }
  barisTransaksi.forEach(function (t) {
    if (String(t.status || 'aktif') === 'dihapus') return;
    var bulan = bulanDari_(t.tanggal);
    if (!bulan) return;
    var a = selApp(bulan);
    var n = angka_(t.nominal);
    var jenis = String(t.jenis);
    if (jenis === JENIS.PEMASUKAN) a.pemasukan += n;
    else if (jenis === JENIS.TETAP) a.tetap += n;
    else a.rumah_tangga += n;
    if (String(t.sumber) !== 'migrasi') {
      a.hanyaApp[jenis] = (a.hanyaApp[jenis] || 0) + n;
      a.hanyaApp.jumlah++;
    }
  });

  // Baris sheet lama yang belum pernah sampai ke tab Transaksi.
  var belum = {};
  rencana.ditambah.forEach(function (s) {
    var bulan = bulanDari_(s.tanggal);
    if (!belum[bulan]) {
      belum[bulan] = { PEMASUKAN: 0, TETAP: 0, RUMAH_TANGGA: 0, jumlah: 0 };
    }
    belum[bulan][s.jenis] += angka_(s.nominal);
    belum[bulan].jumlah++;
  });

  var semuaBulan = {};
  Object.keys(sheet).forEach(function (b) { semuaBulan[b] = true; });
  Object.keys(app).forEach(function (b) { semuaBulan[b] = true; });

  var baris = Object.keys(semuaBulan).sort().map(function (bulan) {
    return hitungSatuBulan_(bulan, sheet[bulan], app[bulan], belum[bulan]);
  });

  var bermasalah = baris.filter(function (b) { return Math.abs(b.selisih) >= 1; });
  var belumJelas = baris.filter(function (b) { return Math.abs(b.belumJelas) >= 1; });

  var pesan;
  if (!bermasalah.length) {
    pesan = 'Sisa di aplikasi sudah sama dengan sisa di sheet lama untuk semua bulan.';
  } else {
    pesan = bermasalah.length + ' bulan berbeda. ' +
      (belumJelas.length
        ? belumJelas.length + ' di antaranya belum terjelaskan seluruhnya — lihat baris terakhir tiap bulan.'
        : 'Semuanya terjelaskan; rinciannya di tab "' + TAB_SELISIH + '".');
  }
  return { baris: baris, pesan: pesan };
}

/**
 * Tangga rekonsiliasi satu bulan. Susunannya sengaja dibuat supaya angkanya
 * tutup: sisa aplikasi dikurangi seluruh sebab harus persis sama dengan sisa
 * yang tertulis di sheet lama. Yang tidak tertutup dituliskan, bukan dibulatkan
 * hilang.
 */
function hitungSatuBulan_(bulan, sh, ap, bl) {
  sh = sh || { pemasukan: 0, tetap: 0, rumah_tangga: 0, turunan: {} };
  ap = ap || { pemasukan: 0, tetap: 0, rumah_tangga: 0,
               hanyaApp: { PEMASUKAN: 0, TETAP: 0, RUMAH_TANGGA: 0, jumlah: 0 } };
  bl = bl || { PEMASUKAN: 0, TETAP: 0, RUMAH_TANGGA: 0, jumlah: 0 };

  var sisaApp = ap.pemasukan - ap.tetap - ap.rumah_tangga;
  var adaSisaLama = sh.turunan.sisa !== undefined;
  var sisaLama = angka_(sh.turunan.sisa);
  var selisih = sisaApp - sisaLama;

  // Bagian pertama: bedanya isi data, dihitung dari baris yang benar-benar ada
  // di satu sisi tapi tidak di sisi lain.
  var belumTertarik = -(bl.PEMASUKAN - bl.TETAP - bl.RUMAH_TANGGA);
  var hanyaApp = ap.hanyaApp.PEMASUKAN - ap.hanyaApp.TETAP - ap.hanyaApp.RUMAH_TANGGA;

  // Sisa data yang tidak dijelaskan dua baris di atas: baris migrasi yang
  // nominalnya diubah atau dihapus lewat aplikasi.
  var bedaData = (ap.pemasukan - sh.pemasukan) - (ap.tetap - sh.tetap) -
                 (ap.rumah_tangga - sh.rumah_tangga);
  var diubahDiApp = bedaData - belumTertarik - hanyaApp;

  // Bagian kedua: bedanya rumus. Apa yang dikurangkan rumus Sisa di sheet lama
  // tapi tidak dikurangkan aplikasi.
  var bedaRumus = (sh.pemasukan - sh.tetap - sh.rumah_tangga) - sisaLama;
  var turunanKandidat = ['perpuluhan', 'saving', 'entertain'].map(function (k) {
    return { nama: k, nilai: angka_(sh.turunan[k]) };
  }).filter(function (t) { return t.nilai; });
  var jumlahTurunan = turunanKandidat.reduce(function (a, t) { return a + t.nilai; }, 0);
  var belumJelas = bedaRumus - jumlahTurunan;

  return {
    bulan: bulan,
    adaSisaLama: adaSisaLama,
    app: ap, sheet: sh, belumTertarikBaris: bl.jumlah, hanyaAppBaris: ap.hanyaApp.jumlah,
    sisaApp: sisaApp, sisaLama: sisaLama, selisih: selisih,
    belumTertarik: belumTertarik, hanyaApp: hanyaApp, diubahDiApp: diubahDiApp,
    turunan: turunanKandidat, jumlahTurunan: jumlahTurunan,
    bedaData: bedaData, bedaRumus: bedaRumus, belumJelas: belumJelas
  };
}

// ----------------------------------------------------------------- laporan --

function tulisSelisih_(hasil) {
  var header = ['bulan', 'baris', 'nilai', 'artinya'];
  var baris = [header];

  hasil.baris.forEach(function (b) {
    if (!b.adaSisaLama) {
      baris.push([b.bulan, 'Sisa aplikasi', bulat_(b.sisaApp),
                  'Sheet lama tidak punya baris "Sisa" untuk bulan ini, jadi tidak ada yang dibandingkan.']);
      baris.push(['', '', '', '']);
      return;
    }

    baris.push([b.bulan, 'Sisa menurut aplikasi', bulat_(b.sisaApp),
                'pemasukan ' + bulat_(b.app.pemasukan) + ' − tetap ' + bulat_(b.app.tetap) +
                ' − rumah tangga ' + bulat_(b.app.rumah_tangga)]);
    baris.push([b.bulan, 'Sisa yang tertulis di sheet lama', bulat_(b.sisaLama),
                'angka di baris "Sisa" tab lama, apa adanya']);
    baris.push([b.bulan, 'Selisihnya', bulat_(b.selisih),
                Math.abs(b.selisih) < 1 ? 'sudah sama' : 'diuraikan di bawah ini']);

    if (Math.abs(b.selisih) < 1) { baris.push(['', '', '', '']); return; }

    baris.push([b.bulan, '— bedanya data —', '',
                'hilang sendiri setelah "Tarik data dari sheet lama" dijalankan']);
    baris.push([b.bulan, 'Belum tertarik dari sheet lama', bulat_(b.belumTertarik),
                b.belumTertarikBaris + ' baris ada di tab lama tapi belum ada di aplikasi']);
    baris.push([b.bulan, 'Hanya ada di aplikasi', bulat_(b.hanyaApp),
                b.hanyaAppBaris + ' catatan dimasukkan lewat aplikasi, tidak ada di tab lama']);
    if (Math.abs(b.diubahDiApp) >= 1) {
      baris.push([b.bulan, 'Baris migrasi yang diubah/dihapus lewat aplikasi', bulat_(b.diubahDiApp),
                  'nominal atau statusnya sudah dibetulkan di aplikasi']);
    }

    baris.push([b.bulan, '— bedanya rumus —', '',
                'TIDAK akan hilang dengan sinkron, dan memang tidak seharusnya hilang']);
    b.turunan.forEach(function (t) {
      baris.push([b.bulan, 'Rumus sheet lama ikut mengurangkan ' + t.nama, bulat_(t.nilai),
                  'aplikasi menampilkannya sebagai angka tersendiri, bukan mengurangkan dari Sisa']);
    });
    if (!b.turunan.length) {
      baris.push([b.bulan, 'Baris turunan yang ikut dikurangkan', 0,
                  'tidak ada Perpuluhan/Saving/Entertain bernilai di bulan ini']);
    }

    baris.push([b.bulan, 'Belum terjelaskan', bulat_(b.belumJelas),
                Math.abs(b.belumJelas) < 1
                  ? 'nol — seluruh selisihnya sudah terurai'
                  : 'kemungkinan besar rumus total di sheet lama memang tidak konsisten untuk bulan ini; ' +
                    'bandingkan sendiri sel totalnya']);
    baris.push(['', '', '', '']);
  });

  if (baris.length === 1) baris.push(['', 'Tidak ada bulan untuk dibandingkan', '', '']);

  var sh = ss_().getSheetByName(TAB_SELISIH) || ss_().insertSheet(TAB_SELISIH);
  sh.clear();
  sh.getRange(1, 1, baris.length, header.length).setValues(baris);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold')
    .setBackground('#0F766E').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 3, Math.max(baris.length - 1, 1), 1).setNumberFormat('#,##0');
  sh.setColumnWidth(1, 90);
  sh.setColumnWidth(2, 330);
  sh.setColumnWidth(3, 130);
  sh.setColumnWidth(4, 520);
  sh.getRange(1, 4).setNote(hasil.pesan);
}
