/**
 * Keuangan Keluarga Gemoy (KKG) — inti backend.
 *
 * Skrip ini menempel di spreadsheet keuangan keluarga yang baru dan di-deploy
 * sebagai Web App. Aplikasi di GitHub Pages memanggilnya lewat POST
 * ber-Content-Type text/plain — bukan application/json — supaya browser tidak
 * mengirim preflight OPTIONS, yang tidak bisa dijawab Apps Script.
 *
 * Dua jenis tab, dan bedanya penting:
 *
 *   - Tab bawaan (`INPUT TRANSAKSI`, `PILIHAN`, `TARGET`) milik Ryan. Skrip ini
 *     hanya MEMBACANYA, hidup, setiap kali aplikasi dibuka. Tidak ada salinan,
 *     tidak ada pekerjaan sinkron: apa yang diketik di Sheet langsung terlihat
 *     di HP, dan tidak ada dua angka yang bisa berselisih.
 *   - Tab `KKG …` milik aplikasi. Di situlah transaksi dari HP, anggaran,
 *     rutin, dan daftar belanja disimpan.
 *
 * Baca PANDUAN.md untuk langkah pemasangan.
 */

// Tab milik aplikasi. Berawalan `KKG ` supaya di deretan tab paling bawah jelas
// mana yang boleh disentuh manusia dan mana yang ditulis skrip.
var TAB = {
  TRANSAKSI: 'KKG Transaksi',
  TANDA: 'KKG Tanda',
  KATEGORI: 'KKG Kategori',
  ANGGARAN: 'KKG Anggaran',
  RUTIN: 'KKG Rutin',
  BELANJA: 'KKG Belanja',
  PERANGKAT: 'KKG Perangkat',
  PENGATURAN: 'KKG Pengaturan',
  RINGKASAN: 'KKG Ringkasan'
};

/** Tab bawaan. Hanya dibaca — tidak satu pun fungsi di berkas ini menulisinya. */
var BACA = {
  INPUT: 'INPUT TRANSAKSI',
  PILIHAN: 'PILIHAN',
  TARGET: 'TARGET'
};

// `INPUT TRANSAKSI` punya tiga baris judul sebelum headernya, jadi barisan
// datanya mulai di baris 5. Rumus REKAP BULANAN berhenti di baris 1007.
var INPUT_BARIS_DATA = 5;
var INPUT_KOLOM = ['tanggal', 'keterangan', 'jenis', 'kelompok', 'kategori',
                   'bayar_pakai', 'milik', 'nominal', 'bulan', 'catatan'];

var HEADER = {};
// Sepuluh kolom pertama sengaja persis sama dengan `INPUT TRANSAKSI`. Kelak,
// saat semuanya mau disatukan, memindahkannya cuma soal salin A:J — dan rumus
// REKAP BULANAN tidak perlu diubah sedikit pun.
HEADER[TAB.TRANSAKSI] = INPUT_KOLOM.concat(
  ['id', 'sifat', 'sumber', 'dibuat', 'diubah', 'status']);
// Penanda milik aplikasi untuk baris yang tinggal di `INPUT TRANSAKSI`. Dikunci
// pada `tanda` — sidik isi barisnya — bukan nomor baris, supaya menyisipkan
// baris baru di tengah Sheet tidak menggeser kepemilikan penanda.
HEADER[TAB.TANDA] = ['tanda', 'id', 'sifat', 'catatan_app', 'diubah'];
HEADER[TAB.KATEGORI] = ['nama', 'kelompok', 'urutan', 'status', 'dibuat', 'diubah'];
HEADER[TAB.ANGGARAN] = ['bulan', 'ruang', 'nama', 'pagu', 'status', 'diubah'];
HEADER[TAB.RUTIN] = ['id', 'nama', 'tipe', 'jenis', 'kelompok', 'kategori',
                     'bayar_pakai', 'milik', 'nominal', 'sifat',
                     'hari_jatuh_tempo', 'mulai', 'total_termin',
                     'termin_terbayar', 'aktif'];
HEADER[TAB.BELANJA] = ['id', 'nama', 'status', 'terakhir_beli', 'kali', 'dibuat', 'diubah'];
HEADER[TAB.PERANGKAT] = ['id', 'endpoint', 'p256dh', 'auth', 'label', 'terdaftar'];
HEADER[TAB.PENGATURAN] = ['kunci', 'nilai'];
HEADER[TAB.RINGKASAN] = ['bulan', 'pemasukan', 'saving', 'harian', 'sosial',
                         'luar', 'total_keluar', 'sisa', 'jumlah_transaksi'];

var JENIS = {
  PEMASUKAN: 'Pemasukan',
  PENGELUARAN: 'Pengeluaran',
  ALOKASI: 'Alokasi Tujuan',
  TRANSFER: 'Transfer'
};

var KELOMPOK = {
  SAVING: 'Saving 30%',
  HARIAN: 'Harian 40%',
  SOSIAL: 'Perpuluhan/Sosial 10%',
  LUAR: 'Kegiatan Luar 20%',
  NETRAL: 'Transfer / Tidak dihitung'
};

/**
 * Empat pos yang dijumlahkan REKAP BULANAN. Urutannya menentukan urutan tampil
 * di aplikasi, dan `NETRAL` sengaja tidak ada di sini: apa pun yang berkelompok
 * `Transfer / Tidak dihitung` memang tidak ikut hitungan mana pun.
 */
var POS = [KELOMPOK.HARIAN, KELOMPOK.SAVING, KELOMPOK.SOSIAL, KELOMPOK.LUAR];

var SIFAT = { WAJIB: 'WAJIB', KEINGINAN: 'KEINGINAN' };

/**
 * Kategori yang dipakai rumus REKAP BULANAN kolom I–L dan DASHBOARD E4:E5,
 * tapi tidak ada di dropdown `PILIHAN` — jadi kolom Trip Kota, Travel LN,
 * Renovasi, dan Bayar Utang selamanya nol. Aplikasi menyediakannya lewat tab
 * `KKG Kategori` supaya bisa dipilih saat mencatat; `PILIHAN` tidak disentuh.
 */
var KATEGORI_TAMBAHAN = [
  { nama: 'Keluar Kota Bulanan', kelompok: KELOMPOK.LUAR },
  { nama: 'Luar Negeri Tahunan', kelompok: KELOMPOK.LUAR },
  { nama: 'Renovasi Atap & Kitchen Set', kelompok: KELOMPOK.SAVING },
  { nama: 'Hutang Kakak Suami', kelompok: KELOMPOK.SAVING }
];

/** Nilai bawaan tab Pengaturan. Hanya ditulis kalau kuncinya belum ada. */
var PENGATURAN_BAWAAN = {
  // Ke mana transaksi baru dari HP ditulis.
  //
  //   'KKG Transaksi'    — tab milik aplikasi, tidak menyentuh punya Ryan.
  //                        REKAP BULANAN belum melihatnya.
  //   'INPUT TRANSAKSI'  — langsung di tabel yang sama dengan isian tangan,
  //                        jadi REKAP BULANAN dan DASHBOARD ikut terisi.
  //
  // Mengubah satu sel ini sudah cukup; tidak ada kode yang perlu di-deploy ulang.
  tab_tulis: 'KKG Transaksi',
  zona_waktu: 'Asia/Jakarta',
  worker_url: '',
  worker_rahasia: '',
  vapid_publik: '',
  // Tempat menulis PIN baru dari dalam Sheet. Lihat pasangPinDariSheet().
  pin_baru: ''
};

// ---------------------------------------------------------------- utilitas --

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function zona_() {
  return ss_().getSpreadsheetTimeZone() || 'Asia/Jakarta';
}

/** Ambil tab milik aplikasi, buat kalau belum ada, dan pastikan headernya benar. */
function tab_(nama) {
  var buku = ss_();
  var sh = buku.getSheetByName(nama);
  var header = HEADER[nama];
  if (!header) throw new Error('Tab ini bukan milik aplikasi: ' + nama);
  if (!sh) {
    sh = buku.insertSheet(nama);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length)
      .setFontWeight('bold')
      .setBackground('#0F766E')
      .setFontColor('#FFFFFF');
    sh.setColumnWidths(1, header.length, 130);
  } else if (sh.getLastColumn() < header.length) {
    // Tab sudah ada tapi kolomnya kurang — lengkapi tanpa menyentuh data.
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sh;
}

/** Tab bawaan. Melempar galat kalau hilang, bukan diam-diam membuatnya. */
function tabBaca_(nama) {
  var sh = ss_().getSheetByName(nama);
  if (!sh) {
    throw new Error('Tab "' + nama + '" tidak ada di spreadsheet ini. ' +
      'Aplikasi butuh tab bawaan INPUT TRANSAKSI, PILIHAN, dan TARGET.');
  }
  return sh;
}

/** Seluruh baris data satu tab milik aplikasi, plus nomor barisnya. */
function baca_(nama) {
  var sh = tab_(nama);
  var akhir = sh.getLastRow();
  if (akhir < 2) return [];
  var header = HEADER[nama];
  var nilai = sh.getRange(2, 1, akhir - 1, header.length).getValues();
  var hasil = [];
  for (var i = 0; i < nilai.length; i++) {
    var baris = nilai[i];
    // Baris benar-benar kosong dilewati (sering muncul kalau Ryan hapus isi
    // sel lewat Sheet, bukan hapus barisnya).
    var adaIsi = false;
    for (var k = 0; k < baris.length; k++) {
      if (baris[k] !== '' && baris[k] !== null) { adaIsi = true; break; }
    }
    if (!adaIsi) continue;
    var obj = { _baris: i + 2 };
    for (var j = 0; j < header.length; j++) obj[header[j]] = baris[j];
    hasil.push(obj);
  }
  return hasil;
}

function tulisBaris_(nama, obj) {
  var sh = tab_(nama);
  var header = HEADER[nama];
  var baris = [];
  for (var i = 0; i < header.length; i++) {
    var v = obj[header[i]];
    baris.push(v === undefined || v === null ? '' : v);
  }
  sh.appendRow(baris);
  return sh.getLastRow();
}

function tulisBanyak_(nama, daftarObj) {
  if (!daftarObj.length) return 0;
  var sh = tab_(nama);
  var header = HEADER[nama];
  var matriks = daftarObj.map(function (obj) {
    return header.map(function (h) {
      var v = obj[h];
      return v === undefined || v === null ? '' : v;
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, matriks.length, header.length).setValues(matriks);
  return matriks.length;
}

function perbaruiBaris_(nama, nomorBaris, obj) {
  var sh = tab_(nama);
  var header = HEADER[nama];
  var baris = header.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : v;
  });
  sh.getRange(nomorBaris, 1, 1, header.length).setValues([baris]);
}

/** Nomor kolom (1-based) sebuah medan. Dipakai supaya tidak ada huruf kolom
 *  yang ditulis tangan — huruf akan salah diam-diam begitu HEADER diurutkan
 *  ulang, dan salahnya baru ketahuan setelah data tertulis di tempat keliru. */
function kolom_(nama, medan) {
  var i = HEADER[nama].indexOf(medan);
  if (i < 0) throw new Error('Kolom tidak dikenal: ' + nama + '.' + medan);
  return i + 1;
}

function idBaru_(awalan) {
  return awalan + '-' + Date.now().toString(36) + '-' +
         Utilities.getUuid().substring(0, 6);
}

/** Delapan huruf heksadesimal pertama dari MD5. Cukup untuk membedakan baris. */
function sidik_(teks) {
  var bita = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, String(teks), Utilities.Charset.UTF_8);
  var hasil = '';
  for (var i = 0; i < 4; i++) {
    var b = (bita[i] + 256) % 256;
    hasil += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hasil;
}

/** Tanggal apa pun (Date / 'yyyy-MM-dd' / serial Excel) → 'yyyy-MM-dd'. */
function keTanggal_(nilai) {
  if (nilai instanceof Date) return Utilities.formatDate(nilai, zona_(), 'yyyy-MM-dd');
  if (typeof nilai === 'number' && nilai > 20000 && nilai < 90000) {
    // Serial spreadsheet: hari sejak 1899-12-30.
    var ms = (nilai - 25569) * 86400000;
    return Utilities.formatDate(new Date(ms), 'UTC', 'yyyy-MM-dd');
  }
  var s = String(nilai || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  // '01-Sep-2026', bentuk yang dipakai kolom Tanggal di INPUT TRANSAKSI kalau
  // selnya kebetulan tersimpan sebagai teks, bukan tanggal.
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    var bl = BULAN_EN.indexOf(m[2].charAt(0).toUpperCase() + m[2].substring(1, 3).toLowerCase());
    if (bl >= 0) return m[3] + '-' + pad2_(bl + 1) + '-' + pad2_(parseInt(m[1], 10));
  }
  return '';
}

function bulanDari_(tanggal) {
  var t = keTanggal_(tanggal);
  return t ? t.substring(0, 7) : '';
}

/**
 * Baca kolom bulan sebagai 'yyyy-MM'.
 *
 * Perlu penjaga sendiri karena Google Sheets otomatis mengubah teks "2026-09"
 * menjadi tanggal 1 September 2026 begitu ditulis ke sel. Kalau dibaca apa
 * adanya, String(nilai) menghasilkan "Tue Sep 01 2026 ..." dan pencocokan pagu
 * anggaran maupun hitungan termin cicilan jadi tidak pernah ketemu.
 */
function keBulan_(nilai) {
  if (nilai instanceof Date) return Utilities.formatDate(nilai, zona_(), 'yyyy-MM');
  if (typeof nilai === 'number') {
    var t = keTanggal_(nilai);
    return t ? t.substring(0, 7) : '';
  }
  var s = String(nilai || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})/);
  return m ? m[0] : '';
}

var BULAN_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2_(n) { return n < 10 ? '0' + n : String(n); }

/** '2026-09' → 'Sep-26', bentuk kolom Bulan di INPUT TRANSAKSI. */
function keBulanSheet_(bulan) {
  var m = String(bulan || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  return BULAN_EN[parseInt(m[2], 10) - 1] + '-' + m[1].substring(2);
}

/** 'Sep-26' (atau tanggal, kalau Sheets terlanjur mengubahnya) → '2026-09'. */
function bulanSheet_(nilai) {
  if (nilai instanceof Date) return Utilities.formatDate(nilai, zona_(), 'yyyy-MM');
  var s = String(nilai || '').trim();
  var m = s.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    var bl = BULAN_EN.indexOf(m[1].charAt(0).toUpperCase() + m[1].substring(1).toLowerCase());
    if (bl >= 0) return '20' + m[2] + '-' + pad2_(bl + 1);
  }
  return keBulan_(nilai);
}

function sekarang_() {
  return Utilities.formatDate(new Date(), zona_(), "yyyy-MM-dd'T'HH:mm:ss");
}

function angka_(v) {
  if (typeof v === 'number') return v;
  var s = String(v == null ? '' : v).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// --------------------------------------------------------------- pengaturan --

function pengaturan_() {
  var baris = baca_(TAB.PENGATURAN);
  var peta = {};
  baris.forEach(function (b) { peta[String(b.kunci)] = String(b.nilai); });
  return peta;
}

function setelPengaturan_(kunci, nilai) {
  var sh = tab_(TAB.PENGATURAN);
  var baris = baca_(TAB.PENGATURAN);
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i].kunci) === kunci) {
      sh.getRange(baris[i]._baris, kolom_(TAB.PENGATURAN, 'nilai')).setValue(nilai);
      return;
    }
  }
  sh.appendRow([kunci, nilai]);
}

/**
 * Tab tujuan transaksi baru. Hanya dua nilai yang sah; salah ketik dikembalikan
 * ke tab aplikasi, bukan dibiarkan menulis ke tempat yang tidak jelas.
 */
function tabTulis_() {
  var pilih = String(pengaturan_().tab_tulis || TAB.TRANSAKSI).trim();
  return pilih === BACA.INPUT ? BACA.INPUT : TAB.TRANSAKSI;
}

// ---------------------------------------------------------------------- auth --

function acak_(panjang) {
  var huruf = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = '';
  for (var i = 0; i < panjang; i++) out += huruf.charAt(Math.floor(Math.random() * huruf.length));
  return out;
}

function hmac_(pesan, kunci) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(pesan, kunci)
  ).replace(/=+$/, '');
}

function hashPin_(pin, garam) {
  // 5.000 putaran supaya PIN 6 digit tidak bisa ditebak cepat kalau Sheet bocor.
  var h = String(garam) + '|' + String(pin);
  for (var i = 0; i < 5000; i++) h = hmac_(h, garam);
  return h;
}

/**
 * Pasang PIN. Butuh argumen, jadi TIDAK bisa dijalankan langsung dari tombol
 * Run — pakai pasangPinDariSheet() untuk itu.
 */
function setPin(pin) {
  if (pin === undefined || pin === null || pin === '') {
    throw new Error('setPin butuh argumen, dan tombol Run memanggilnya tanpa argumen. ' +
      'Pakai pasangPinDariSheet(): tulis PIN di tab KKG Pengaturan baris "pin_baru", lalu jalankan fungsi itu.');
  }
  if (String(pin).length < 4) throw new Error('PIN minimal 4 digit.');
  var garam = acak_(24);
  setelPengaturan_('pin_garam', garam);
  setelPengaturan_('pin_hash', hashPin_(String(pin), garam));
  if (!pengaturan_().rahasia_token) setelPengaturan_('rahasia_token', acak_(48));
  return 'PIN tersimpan.';
}

/**
 * Pasang PIN tanpa menaruhnya di dalam kode.
 *
 * Caranya: tulis PIN di tab `KKG Pengaturan`, baris berkunci `pin_baru`, lalu
 * jalankan fungsi ini. Karena tidak butuh argumen, fungsi ini aman dijalankan
 * dari tombol Run. Setelah PIN di-hash, sel `pin_baru` langsung dikosongkan
 * supaya angkanya tidak tertinggal sebagai teks di spreadsheet.
 */
function pasangPinDariSheet() {
  var pin = String(pengaturan_().pin_baru || '').trim();
  if (!/^[0-9]{4,6}$/.test(pin)) {
    throw new Error('Belum ada PIN yang sah. Buka tab KKG Pengaturan, tulis 4-6 angka ' +
      'di baris berkunci "pin_baru", lalu jalankan pasangPinDariSheet() lagi.');
  }
  setPin(pin);
  setelPengaturan_('pin_baru', '');
  return 'PIN tersimpan. Sel pin_baru sudah dikosongkan kembali.';
}

function buatToken_(rahasia) {
  var payload = { exp: Date.now() + 30 * 24 * 3600 * 1000 };
  var isi = Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/, '');
  return isi + '.' + hmac_(isi, rahasia);
}

function periksaToken_(token) {
  var rahasia = pengaturan_().rahasia_token;
  if (!rahasia || !token) return false;
  var potong = String(token).split('.');
  if (potong.length !== 2) return false;
  if (hmac_(potong[0], rahasia) !== potong[1]) return false;
  try {
    var payload = JSON.parse(Utilities.newBlob(
      Utilities.base64DecodeWebSafe(potong[0])).getDataAsString());
    return payload.exp > Date.now();
  } catch (e) {
    return false;
  }
}

/** Rem sederhana: 8 percobaan PIN gagal dalam 10 menit → tolak sementara. */
function remPin_() {
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get('gagal_pin') || '0', 10);
  if (n >= 8) throw new Error('Terlalu banyak percobaan. Coba lagi 10 menit lagi.');
  return {
    gagal: function () { cache.put('gagal_pin', String(n + 1), 600); },
    berhasil: function () { cache.remove('gagal_pin'); }
  };
}

// ------------------------------------------------------------------ endpoint --

function jawab_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // Berguna untuk memastikan deployment hidup dari browser biasa.
  return jawab_({ ok: true, aplikasi: 'KKG', versi: 2, waktu: sekarang_() });
}

function doPost(e) {
  var permintaan;
  try {
    permintaan = JSON.parse(e.postData.contents);
  } catch (err) {
    return jawab_({ ok: false, pesan: 'Isi permintaan bukan JSON yang sah.' });
  }

  var aksi = permintaan.aksi;
  var data = permintaan.data || {};

  try {
    if (aksi === 'ping') return jawab_({ ok: true, waktu: sekarang_() });

    if (aksi === 'masuk') {
      var rem = remPin_();
      var p = pengaturan_();
      if (!p.pin_hash) throw new Error('PIN belum diatur. Jalankan pasangPinDariSheet() di editor Apps Script.');
      if (hashPin_(String(data.pin || ''), p.pin_garam) !== p.pin_hash) {
        rem.gagal();
        throw new Error('PIN salah.');
      }
      rem.berhasil();
      return jawab_({ ok: true, data: { token: buatToken_(p.rahasia_token), profil: profilPublik_(p) } });
    }

    if (!periksaToken_(permintaan.token)) {
      return jawab_({ ok: false, kode: 'AUTH', pesan: 'Sesi berakhir, masuk lagi dengan PIN.' });
    }

    switch (aksi) {
      case 'awal':              return jawab_({ ok: true, data: muatAwal_(data) });
      case 'transaksi.simpan':  return jawab_({ ok: true, data: simpanTransaksi_(data) });
      case 'transaksi.ubah':    return jawab_({ ok: true, data: ubahTransaksi_(data) });
      case 'transaksi.hapus':   return jawab_({ ok: true, data: hapusTransaksi_(data) });
      case 'transaksi.daftar':  return jawab_({ ok: true, data: daftarTransaksi_(data) });
      case 'tanda.simpan':      return jawab_({ ok: true, data: simpanTanda_(data) });
      case 'rutin.simpan':      return jawab_({ ok: true, data: simpanRutin_(data) });
      case 'rutin.hapus':       return jawab_({ ok: true, data: hapusRutin_(data) });
      case 'anggaran.simpan':   return jawab_({ ok: true, data: simpanAnggaran_(data) });
      case 'kategori.simpan':   return jawab_({ ok: true, data: simpanKategori_(data) });
      case 'kategori.sisihkan': return jawab_({ ok: true, data: sisihkanKategori_(data) });
      case 'kategori.pulihkan': return jawab_({ ok: true, data: pulihkanKategori_(data) });
      case 'belanja.simpan':    return jawab_({ ok: true, data: simpanBelanja_(data) });
      case 'perangkat.daftar':  return jawab_({ ok: true, data: daftarkanPerangkat_(data) });
      case 'perangkat.hapus':   return jawab_({ ok: true, data: hapusPerangkat_(data) });
      case 'pengaturan.simpan': return jawab_({ ok: true, data: simpanPengaturan_(data) });
      default:
        return jawab_({ ok: false, pesan: 'Aksi tidak dikenal: ' + aksi });
    }
  } catch (err) {
    return jawab_({ ok: false, pesan: err.message || String(err) });
  }
}

// -------------------------------------------------------------- tab bawaan --

/**
 * Sidik satu baris transaksi dari isinya sendiri.
 *
 * Inilah yang membuat aplikasi bisa membaca `INPUT TRANSAKSI` langsung tanpa
 * mencerminnya lebih dulu: baris yang sama selalu menghasilkan tanda yang sama,
 * jadi penanda milik aplikasi (sifat WAJIB/KEINGINAN) tetap menempel walau
 * barisnya bergeser naik-turun karena penyisipan di tengah.
 *
 * Konsekuensinya jujur saja: kalau Ryan mengubah nominal atau keterangan sebuah
 * baris di Sheet, tandanya berubah dan penandanya lepas — sifatnya kembali ke
 * bawaan. Itu jauh lebih baik daripada penanda yang menempel di baris keliru.
 */
function tandaBaris_(t) {
  // Kolom Bulan sengaja TIDAK ikut. Ia menyimpan 'Sep-26' di dalam sel tapi
  // '2026-09' begitu dibaca, jadi baris yang sama menghasilkan dua tanda
  // berbeda tergantung dari mana ia datang — dan aplikasi lalu menulis
  // kembarannya setiap kali antrian luring mengirim ulang. Tanggalnya sudah
  // memuat bulan itu, jadi tidak ada yang hilang dengan membuangnya.
  return [
    keTanggal_(t.tanggal),
    String(t.keterangan || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    Math.round(angka_(t.nominal)),
    String(t.kategori || '').trim().toLowerCase()
  ].join('|');
}

/**
 * Baris `INPUT TRANSAKSI` apa adanya, dibaca hidup setiap kali dipanggil.
 *
 * Baris yang keterangan DAN nominalnya sama-sama kosong dilewati: itu baris
 * siap-isi yang memang sengaja disediakan di bawah tabel, lengkap dengan
 * tanggal dan bulan yang sudah terisi rumus.
 */
function bacaInput_() {
  var sh = tabBaca_(BACA.INPUT);
  var akhir = sh.getLastRow();
  if (akhir < INPUT_BARIS_DATA) return [];
  var nilai = sh.getRange(INPUT_BARIS_DATA, 1,
                          akhir - INPUT_BARIS_DATA + 1, INPUT_KOLOM.length).getValues();
  var hasil = [];
  for (var i = 0; i < nilai.length; i++) {
    var b = nilai[i];
    var keterangan = String(b[1] == null ? '' : b[1]).trim();
    var nominal = angka_(b[7]);
    if (!keterangan && !nominal) continue;
    var t = {
      _baris: INPUT_BARIS_DATA + i,
      tanggal: keTanggal_(b[0]),
      keterangan: keterangan,
      jenis: String(b[2] || '').trim(),
      kelompok: String(b[3] || '').trim(),
      kategori: String(b[4] || '').trim(),
      bayar_pakai: String(b[5] || '').trim(),
      milik: String(b[6] || '').trim(),
      nominal: nominal,
      bulan: bulanSheet_(b[8]),
      catatan: String(b[9] || '').trim()
    };
    if (!t.bulan) t.bulan = bulanDari_(t.tanggal);
    if (!t.tanggal && t.bulan) t.tanggal = t.bulan + '-01';
    t._tanda = tandaBaris_(t);
    hasil.push(t);
  }
  return hasil;
}

/** Isi tab `PILIHAN` per kolom, tanpa kembaran dan tanpa sel kosong. */
function bacaPilihan_() {
  var sh = tabBaca_(BACA.PILIHAN);
  var akhir = sh.getLastRow();
  var nilai = akhir < 2 ? [] : sh.getRange(2, 1, akhir - 1, 5).getValues();
  var kolom = [[], [], [], [], []];
  nilai.forEach(function (b) {
    for (var i = 0; i < 5; i++) {
      var v = String(b[i] == null ? '' : b[i]).trim();
      if (v && kolom[i].indexOf(v) < 0) kolom[i].push(v);
    }
  });
  return {
    jenis: kolom[0].length ? kolom[0] : [JENIS.PEMASUKAN, JENIS.PENGELUARAN, JENIS.ALOKASI, JENIS.TRANSFER],
    kelompok: kolom[1].length ? kolom[1] : POS.concat([KELOMPOK.NETRAL]),
    kategori: kolom[2],
    bayarPakai: kolom[3],
    milik: kolom[4]
  };
}

/** Persen yang tertulis di nama kelompok sendiri: 'Saving 30%' → 30. */
function persenDariNama_(kelompok) {
  var m = String(kelompok).match(/(\d+)\s*%/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Tab `TARGET`: persen empat pos, plus target rupiah (renovasi, utang, KPR).
 * Kalau tabnya kacau atau barisnya hilang, persen jatuh kembali ke angka yang
 * sudah tertulis di nama kelompoknya — jadi aplikasi tidak pernah menampilkan
 * target 0% hanya karena satu baris terhapus.
 */
function bacaTarget_() {
  var pos = {};
  POS.forEach(function (k) { pos[k] = persenDariNama_(k); });
  var rupiah = [];

  var sh = ss_().getSheetByName(BACA.TARGET);
  var akhir = sh ? sh.getLastRow() : 0;
  if (sh && akhir >= 4) {
    sh.getRange(4, 1, akhir - 3, 4).getValues().forEach(function (b) {
      var nama = String(b[0] || '').trim();
      if (!nama) return;
      var mentah = b[1];
      var periode = String(b[2] || '').trim();
      var keterangan = String(b[3] || '').trim();

      var kelompok = null;
      POS.forEach(function (k) { if (k.indexOf(nama) === 0) kelompok = k; });
      if (kelompok) {
        // Sel berformat persen terbaca 0.3, bukan 30. Yang sudah berupa teks
        // '30%' terbaca 30. Dua-duanya harus mendarat di angka yang sama.
        var n = typeof mentah === 'number' ? mentah : angka_(mentah);
        if (n > 0 && n <= 1) n = n * 100;
        if (n > 0) pos[kelompok] = Math.round(n * 100) / 100;
        return;
      }
      var nilai = angka_(mentah);
      if (nilai > 0) rupiah.push({ nama: nama, nilai: nilai, periode: periode, keterangan: keterangan });
    });
  }
  return { pos: pos, rupiah: rupiah };
}

// -------------------------------------------------------------------- muatan --

function profilPublik_(p) {
  var pilihan = bacaPilihan_();
  var kategori = daftarKategori_(pilihan.kategori);
  return {
    pilihan: {
      jenis: pilihan.jenis,
      kelompok: pilihan.kelompok,
      bayarPakai: pilihan.bayarPakai,
      milik: pilihan.milik
    },
    pos: POS,
    kelompokNetral: KELOMPOK.NETRAL,
    kategori: kategori.aktif,
    kategoriArsip: kategori.arsip,
    // Saran kelompok per kategori, dari tab `KKG Kategori`. Form memakainya
    // untuk mengisi Kelompok sendiri begitu kategori dipilih.
    kategoriKelompok: kategori.kelompok,
    target: bacaTarget_(),
    tabTulis: tabTulis_(),
    vapidPublik: p.vapid_publik || ''
  };
}

/**
 * Satu panggilan yang mengisi seluruh aplikasi saat dibuka. Sengaja digabung
 * supaya aplikasi cuma sekali jalan-bolak-balik ke server saat start di
 * jaringan HP.
 */
function muatAwal_(data) {
  var bulanDari = data.dari || '';   // 'yyyy-MM'
  var semua = semuaTransaksi_();
  var transaksi = semua.filter(function (t) {
    return !bulanDari || t.bulan >= bulanDari;
  });
  var bulan = {};
  semua.forEach(function (t) { if (t.bulan) bulan[t.bulan] = true; });

  return {
    transaksi: transaksi,
    bulanTersedia: Object.keys(bulan).sort(),
    rutin: baca_(TAB.RUTIN).map(bentukRutin_),
    // Pagu yang disisihkan ikut dikirim beserta bendera statusnya. Aplikasi
    // yang menyaringnya, bukan server — supaya riwayat pagu lama tetap bisa
    // dilihat dan dipulihkan dari HP.
    anggaran: baca_(TAB.ANGGARAN).map(function (a) {
      return {
        bulan: keBulan_(a.bulan), ruang: String(a.ruang || 'kategori'),
        nama: String(a.nama), pagu: angka_(a.pagu),
        status: String(a.status || 'aktif')
      };
    }),
    // Daftar belanja tidak terikat bulan, jadi dikirim utuh — termasuk barang
    // yang sudah dibeli maupun disisihkan. Aplikasi yang memilah statusnya,
    // supaya "terakhir beli" tetap bisa dilihat dari HP saat sinyal mati.
    belanja: baca_(TAB.BELANJA).map(bentukBelanja_),
    profil: profilPublik_(pengaturan_()),
    waktuServer: sekarang_()
  };
}

/** Penanda aplikasi, dikunci pada sidik isi baris. */
function petaTanda_() {
  var peta = {};
  baca_(TAB.TANDA).forEach(function (t) { peta[String(t.tanda)] = t; });
  return peta;
}

/**
 * Seluruh transaksi yang dilihat aplikasi: isian tangan di `INPUT TRANSAKSI`
 * digabung dengan catatan dari HP di `KKG Transaksi`.
 *
 * Kalau sebuah baris muncul di dua tempat — misalnya sedang setengah jalan
 * dipindahkan dengan salin-tempel — yang menang adalah baris di
 * `INPUT TRANSAKSI`, karena tab itulah yang dibaca REKAP BULANAN. Dengan
 * begitu angka di aplikasi tidak pernah lebih besar daripada angka di sheet.
 */
function semuaTransaksi_() {
  var tanda = petaTanda_();
  var hasil = [];
  var adaDiInput = {};

  bacaInput_().forEach(function (t) {
    var p = tanda[t._tanda];
    adaDiInput[t._tanda] = true;
    hasil.push(bentukTransaksi_({
      id: p && p.id ? String(p.id) : 'inp-' + sidik_(t._tanda),
      tanggal: t.tanggal, keterangan: t.keterangan, jenis: t.jenis,
      kelompok: t.kelompok, kategori: t.kategori, bayar_pakai: t.bayar_pakai,
      milik: t.milik, nominal: t.nominal, catatan: t.catatan,
      sifat: p ? String(p.sifat || '') : '',
      sumber: 'sheet'
    }, tabTulis_() !== BACA.INPUT));
  });

  baca_(TAB.TRANSAKSI).forEach(function (t) {
    if (String(t.status || 'aktif') === 'dihapus') return;
    if (adaDiInput[tandaBaris_(t)]) return;
    hasil.push(bentukTransaksi_(t, false));
  });

  hasil.sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0); });
  return hasil;
}

function bentukTransaksi_(t, terkunci) {
  var tanggal = keTanggal_(t.tanggal);
  var bulan = tanggal ? tanggal.substring(0, 7) : bulanSheet_(t.bulan);
  return {
    id: String(t.id),
    tanggal: tanggal,
    bulan: bulan,
    jenis: String(t.jenis || JENIS.PENGELUARAN),
    kelompok: String(t.kelompok || ''),
    kategori: String(t.kategori || ''),
    keterangan: String(t.keterangan || ''),
    nominal: angka_(t.nominal),
    bayarPakai: String(t.bayar_pakai || ''),
    milik: String(t.milik || ''),
    sifat: String(t.sifat || ''),
    catatan: String(t.catatan || ''),
    sumber: String(t.sumber || 'aplikasi'),
    // Baris milik `INPUT TRANSAKSI` tidak bisa diubah atau dihapus dari HP
    // selama tab_tulis masih menunjuk tab aplikasi. Aplikasi memakai bendera
    // ini untuk mematikan tombolnya, bukan untuk menyembunyikan barisnya.
    kunci: terkunci === true
  };
}

function bentukRutin_(r) {
  return {
    id: String(r.id),
    nama: String(r.nama || ''),
    tipe: String(r.tipe || 'tagihan'),
    jenis: String(r.jenis || JENIS.PENGELUARAN),
    kelompok: String(r.kelompok || KELOMPOK.HARIAN),
    kategori: String(r.kategori || ''),
    bayarPakai: String(r.bayar_pakai || ''),
    milik: String(r.milik || ''),
    nominal: angka_(r.nominal),
    sifat: String(r.sifat || SIFAT.WAJIB),
    hariJatuhTempo: angka_(r.hari_jatuh_tempo) || 1,
    mulai: keBulan_(r.mulai),
    totalTermin: angka_(r.total_termin),
    terminTerbayar: angka_(r.termin_terbayar),
    aktif: String(r.aktif) !== 'false' && r.aktif !== false
  };
}

function bentukBelanja_(b) {
  return {
    id: String(b.id),
    nama: String(b.nama || ''),
    status: String(b.status || 'aktif'),
    // Lewat keTanggal_ karena Sheets mengubah teks '2026-09-05' jadi objek Date
    // begitu ditulis ke sel; dibaca apa adanya, perbandingannya akan meleset.
    terakhir: keTanggal_(b.terakhir_beli),
    kali: angka_(b.kali)
  };
}

function daftarTransaksi_(data) {
  var dari = data.dari || '0000-00';
  var sampai = data.sampai || '9999-99';
  return semuaTransaksi_().filter(function (t) {
    return t.bulan >= dari && t.bulan <= sampai;
  });
}

// ------------------------------------------------------------------ transaksi --

/**
 * Rapikan satu kiriman dari HP menjadi baris yang siap ditulis.
 *
 * `Pemasukan` dan `Transfer` selalu dipaksa berkelompok `Transfer / Tidak
 * dihitung`, mengikuti kebiasaan yang sudah dipakai di INPUT TRANSAKSI. Kalau
 * tidak dipaksa, satu pemasukan yang tidak sengaja diberi kelompok `Saving 30%`
 * akan terhitung dua kali di REKAP BULANAN: sekali sebagai pemasukan, sekali
 * sebagai alokasi.
 */
function rapikanMasuk_(m) {
  var jenis = String(m.jenis || JENIS.PENGELUARAN);
  var kelompok = String(m.kelompok || '');
  if (jenis === JENIS.PEMASUKAN || jenis === JENIS.TRANSFER) kelompok = KELOMPOK.NETRAL;
  if (!kelompok) kelompok = KELOMPOK.HARIAN;
  var tanggal = keTanggal_(m.tanggal) || keTanggal_(new Date());
  return {
    tanggal: tanggal,
    keterangan: String(m.keterangan || '').trim(),
    jenis: jenis,
    kelompok: kelompok,
    kategori: String(m.kategori || '').trim(),
    bayar_pakai: String(m.bayarPakai || ''),
    milik: String(m.milik || ''),
    nominal: angka_(m.nominal),
    bulan: keBulanSheet_(tanggal.substring(0, 7)),
    catatan: String(m.catatan || ''),
    sifat: jenis === JENIS.PEMASUKAN ? '' : String(m.sifat || SIFAT.WAJIB)
  };
}

/** Sepuluh kolom pertama, urutannya sama dengan INPUT TRANSAKSI. */
function barisInput_(isi) {
  return INPUT_KOLOM.map(function (k) {
    var v = isi[k];
    return v === undefined || v === null ? '' : v;
  });
}

/**
 * Menerima satu transaksi atau sekumpulan (antrian offline dari HP).
 * Idempoten: kalau id sudah pernah tersimpan, baris lama diperbarui, bukan
 * ditambah lagi. Ini yang mencegah duplikat saat sinyal putus-nyambung.
 */
function simpanTransaksi_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var hasil = tabTulis_() === BACA.INPUT
      ? tulisKeInput_(masuk)
      : tulisKeTabAplikasi_(masuk);
    bangunRingkasan_();
    return hasil;
  } finally {
    kunci.releaseLock();
  }
}

function tulisKeTabAplikasi_(masuk) {
  var adaSekarang = {};
  baca_(TAB.TRANSAKSI).forEach(function (t) { adaSekarang[String(t.id)] = t; });

  var baru = [];
  var diperbarui = 0;
  var hasil = [];

  masuk.forEach(function (m) {
    var id = String(m.id || idBaru_('trx'));
    var isi = rapikanMasuk_(m);
    isi.id = id;
    isi.sumber = m.sumber || 'aplikasi';
    isi.dibuat = sekarang_();
    isi.diubah = sekarang_();
    isi.status = 'aktif';
    if (adaSekarang[id]) {
      isi.dibuat = adaSekarang[id].dibuat || isi.dibuat;
      perbaruiBaris_(TAB.TRANSAKSI, adaSekarang[id]._baris, isi);
      diperbarui++;
    } else {
      baru.push(isi);
    }
    hasil.push(bentukTransaksi_(isi, false));
  });

  tulisBanyak_(TAB.TRANSAKSI, baru);
  return { tersimpan: hasil, baru: baru.length, diperbarui: diperbarui, tujuan: TAB.TRANSAKSI };
}

/**
 * Menulis langsung ke `INPUT TRANSAKSI`, dipakai kalau `tab_tulis` sudah
 * dibalik ke sana.
 *
 * Baris siap-isi yang sudah disediakan di bawah tabel dipakai lebih dulu
 * sebelum menambah baris baru, supaya tabel Ryan tidak berubah bentuk hanya
 * karena aplikasi ikut mengisinya. Sifat WAJIB/KEINGINAN — yang tidak punya
 * kolom di sana — mendarat di `KKG Tanda`.
 */
function tulisKeInput_(masuk) {
  var sh = tabBaca_(BACA.INPUT);
  var adaDiInput = {};
  var slotKosong = [];
  var akhir = sh.getLastRow();
  if (akhir >= INPUT_BARIS_DATA) {
    var nilai = sh.getRange(INPUT_BARIS_DATA, 1,
                            akhir - INPUT_BARIS_DATA + 1, INPUT_KOLOM.length).getValues();
    for (var i = 0; i < nilai.length; i++) {
      var keterangan = String(nilai[i][1] == null ? '' : nilai[i][1]).trim();
      if (!keterangan && !angka_(nilai[i][7])) slotKosong.push(INPUT_BARIS_DATA + i);
    }
  }
  bacaInput_().forEach(function (t) { adaDiInput[t._tanda] = t; });

  var hasil = [];
  var baru = 0;
  masuk.forEach(function (m) {
    var id = String(m.id || idBaru_('trx'));
    var isi = rapikanMasuk_(m);
    var tanda = tandaBaris_(isi);
    if (!adaDiInput[tanda]) {
      var baris = slotKosong.length ? slotKosong.shift() : sh.getLastRow() + 1;
      sh.getRange(baris, 1, 1, INPUT_KOLOM.length).setValues([barisInput_(isi)]);
      adaDiInput[tanda] = isi;
      baru++;
    }
    tulisTanda_(tanda, id, isi.sifat, '');
    isi.id = id;
    isi.sumber = 'sheet';
    hasil.push(bentukTransaksi_(isi, false));
  });
  return { tersimpan: hasil, baru: baru, diperbarui: 0, tujuan: BACA.INPUT };
}

/**
 * Cari satu transaksi berdasarkan id, di tab mana pun ia tinggal.
 * @return {{di: string, baris: number, isi: object, tanda: string}|null}
 */
function cariTransaksi_(id) {
  id = String(id);
  var baris = baca_(TAB.TRANSAKSI);
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i].id) === id && String(baris[i].status || 'aktif') !== 'dihapus') {
      return { di: TAB.TRANSAKSI, baris: baris[i]._baris, isi: baris[i], tanda: tandaBaris_(baris[i]) };
    }
  }
  var tanda = petaTanda_();
  var input = bacaInput_();
  for (var j = 0; j < input.length; j++) {
    var p = tanda[input[j]._tanda];
    var idBaris = p && p.id ? String(p.id) : 'inp-' + sidik_(input[j]._tanda);
    if (idBaris === id) {
      return { di: BACA.INPUT, baris: input[j]._baris, isi: input[j], tanda: input[j]._tanda };
    }
  }
  return null;
}

function tolakBarisSheet_() {
  return new Error(
    'Baris ini milik tab INPUT TRANSAKSI, jadi hanya bisa diubah dari Google Sheets. ' +
    'Kalau ingin aplikasi ikut mengelolanya, ganti baris "tab_tulis" di tab KKG Pengaturan ' +
    'menjadi INPUT TRANSAKSI.');
}

function ubahTransaksi_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var temu = cariTransaksi_(data.id);
    if (!temu) throw new Error('Transaksi tidak ditemukan: ' + data.id);

    var lama = temu.isi;
    var gabung = {
      tanggal: data.tanggal !== undefined ? data.tanggal : lama.tanggal,
      keterangan: data.keterangan !== undefined ? data.keterangan : lama.keterangan,
      jenis: data.jenis !== undefined ? data.jenis : lama.jenis,
      kelompok: data.kelompok !== undefined ? data.kelompok : lama.kelompok,
      kategori: data.kategori !== undefined ? data.kategori : lama.kategori,
      bayarPakai: data.bayarPakai !== undefined ? data.bayarPakai : lama.bayar_pakai,
      milik: data.milik !== undefined ? data.milik : lama.milik,
      nominal: data.nominal !== undefined ? data.nominal : lama.nominal,
      catatan: data.catatan !== undefined ? data.catatan : lama.catatan,
      sifat: data.sifat !== undefined ? data.sifat : lama.sifat
    };
    var isi = rapikanMasuk_(gabung);

    if (temu.di === BACA.INPUT) {
      if (tabTulis_() !== BACA.INPUT) throw tolakBarisSheet_();
      var sh = tabBaca_(BACA.INPUT);
      sh.getRange(temu.baris, 1, 1, INPUT_KOLOM.length).setValues([barisInput_(isi)]);
      hapusTanda_(temu.tanda);
      tulisTanda_(tandaBaris_(isi), String(data.id), isi.sifat, '');
      isi.id = String(data.id);
      isi.sumber = 'sheet';
      bangunRingkasan_();
      return bentukTransaksi_(isi, false);
    }

    isi.id = String(lama.id);
    isi.sumber = lama.sumber;
    isi.dibuat = lama.dibuat;
    isi.diubah = sekarang_();
    isi.status = 'aktif';
    perbaruiBaris_(TAB.TRANSAKSI, temu.baris, isi);
    bangunRingkasan_();
    return bentukTransaksi_(isi, false);
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Hapus lunak di tab aplikasi — barisnya tetap ada, hanya berstatus 'dihapus',
 * supaya tidak ada data yang benar-benar hilang.
 *
 * Di `INPUT TRANSAKSI` tidak ada kolom status, jadi yang dilakukan adalah
 * mengosongkan isi barisnya dan membiarkan barisnya berdiri sebagai baris
 * siap-isi berikutnya. Barisnya tidak dibuang supaya tinggi tabel — dan rumus
 * yang menunjuk ke sana — tidak bergeser.
 */
function hapusTransaksi_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var daftar = data.daftar || [data.id];
    var n = 0;
    var shT = tab_(TAB.TRANSAKSI);
    var kolomStatus = kolom_(TAB.TRANSAKSI, 'status');
    var kolomDiubah = kolom_(TAB.TRANSAKSI, 'diubah');

    daftar.forEach(function (id) {
      var temu = cariTransaksi_(id);
      if (!temu) return;
      if (temu.di === BACA.INPUT) {
        if (tabTulis_() !== BACA.INPUT) throw tolakBarisSheet_();
        tabBaca_(BACA.INPUT).getRange(temu.baris, 1, 1, INPUT_KOLOM.length).clearContent();
        hapusTanda_(temu.tanda);
      } else {
        shT.getRange(temu.baris, kolomStatus).setValue('dihapus');
        shT.getRange(temu.baris, kolomDiubah).setValue(sekarang_());
      }
      n++;
    });
    bangunRingkasan_();
    return { dihapus: n };
  } finally {
    kunci.releaseLock();
  }
}

// ---------------------------------------------------------------- penanda --

function tulisTanda_(tanda, id, sifat, catatanApp) {
  var sh = tab_(TAB.TANDA);
  var isi = {
    tanda: tanda, id: String(id), sifat: String(sifat || ''),
    catatan_app: String(catatanApp || ''), diubah: sekarang_()
  };
  var baris = baca_(TAB.TANDA);
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i].tanda) === tanda) {
      perbaruiBaris_(TAB.TANDA, baris[i]._baris, isi);
      return;
    }
  }
  tulisBaris_(TAB.TANDA, isi);
}

function hapusTanda_(tanda) {
  var sh = tab_(TAB.TANDA);
  var baris = baca_(TAB.TANDA);
  for (var i = baris.length - 1; i >= 0; i--) {
    if (String(baris[i].tanda) === tanda) sh.deleteRow(baris[i]._baris);
  }
}

/**
 * Menandai baris yang tinggal di `INPUT TRANSAKSI` sebagai WAJIB atau
 * KEINGINAN. Sheet baru tidak punya kolom itu, dan kita tidak menambahkannya
 * ke tab milik Ryan — jadi penandanya disimpan terpisah di `KKG Tanda`.
 */
function simpanTanda_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var temu = cariTransaksi_(data.id);
    if (!temu) throw new Error('Transaksi tidak ditemukan: ' + data.id);
    if (temu.di !== BACA.INPUT) {
      var isi = temu.isi;
      isi.sifat = String(data.sifat || '');
      isi.diubah = sekarang_();
      perbaruiBaris_(TAB.TRANSAKSI, temu.baris, isi);
      return bentukTransaksi_(isi, false);
    }
    tulisTanda_(temu.tanda, String(data.id), data.sifat, data.catatanApp);
    var b = temu.isi;
    b.id = String(data.id);
    b.sifat = String(data.sifat || '');
    b.sumber = 'sheet';
    return bentukTransaksi_(b, tabTulis_() !== BACA.INPUT);
  } finally {
    kunci.releaseLock();
  }
}

// -------------------------------------------------------------------- kategori --
//
// Daftar kategori punya dua sumber. Yang utama adalah kolom C tab `PILIHAN` —
// itu milik Ryan dan tidak pernah disentuh skrip ini. Tab `KKG Kategori` hanya
// menambahi: kategori baru yang belum sempat masuk dropdown, saran kelompok
// untuk sebuah kategori, dan bendera 'arsip' untuk yang tidak mau ditawarkan
// lagi di form catat.
//
// Menyisihkan kategori tidak pernah membuang barisnya, dan tidak pernah
// mengubah `PILIHAN` — transaksi lama tetap punya nama kategori yang bisa
// dibaca, dan dropdown di Sheet tetap seperti yang Ryan tulis.

/**
 * Daftar kategori ditahan selama satu eksekusi. Tanpa ini, menyimpan sepuluh
 * pagu sekaligus berarti membaca tabnya sepuluh kali — pemborosan yang
 * langsung terasa sebagai jeda di HP. Setiap tulisan membatalkannya.
 */
var _kategoriTertahan = null;

function lupakanKategori_() { _kategoriTertahan = null; }

/**
 * Isi awal `KKG Kategori`: empat kategori yang sudah dipakai rumus REKAP
 * BULANAN dan DASHBOARD tapi tidak pernah ada di dropdown, jadi kolom Trip
 * Kota, Travel LN, Renovasi, dan Bayar Utang selamanya nol.
 */
function semaiKategori_() {
  var sh = tab_(TAB.KATEGORI);
  if (sh.getLastRow() > 1) return;
  var waktu = sekarang_();
  tulisBanyak_(TAB.KATEGORI, KATEGORI_TAMBAHAN.map(function (k, i) {
    return {
      nama: k.nama, kelompok: k.kelompok, urutan: i + 1,
      status: 'aktif', dibuat: waktu, diubah: waktu
    };
  }));
  lupakanKategori_();
}

function barisKategori_() {
  if (_kategoriTertahan) return _kategoriTertahan;
  semaiKategori_();
  _kategoriTertahan = baca_(TAB.KATEGORI).filter(function (k) {
    return String(k.nama || '').trim();
  });
  return _kategoriTertahan;
}

/** { aktif: [nama], arsip: [nama], kelompok: {nama: kelompok} } */
function daftarKategori_(dariPilihan) {
  var pilihan = dariPilihan || bacaPilihan_().kategori;
  var baris = barisKategori_();
  var status = {};
  var kelompok = {};
  baris.forEach(function (k) {
    var nama = String(k.nama).trim();
    status[nama.toLowerCase()] = String(k.status || 'aktif');
    if (String(k.kelompok || '').trim()) kelompok[nama] = String(k.kelompok).trim();
  });

  var aktif = [];
  var arsip = [];
  var sudah = {};
  var taruh = function (nama) {
    var k = nama.toLowerCase();
    if (!nama || sudah[k]) return;
    sudah[k] = true;
    if (status[k] === 'arsip') arsip.push(nama); else aktif.push(nama);
  };
  pilihan.forEach(taruh);
  baris.forEach(function (k) { taruh(String(k.nama).trim()); });

  return { aktif: aktif, arsip: arsip, kelompok: kelompok };
}

function cariKategori_(nama) {
  var cari = String(nama || '').trim().toLowerCase();
  var baris = barisKategori_();
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i].nama).trim().toLowerCase() === cari) return baris[i];
  }
  return null;
}

/**
 * Tambah kategori baru, atau hidupkan lagi yang sudah pernah disisihkan.
 * Sengaja tidak melempar galat kalau namanya sudah aktif — aplikasi bisa
 * mengirim ulang dari antrian luring, dan pengulangan itu harus aman.
 */
function simpanKategori_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    masuk.forEach(function (m) { pastikanKategori_(m.nama, m.kelompok); });
    return { kategori: daftarKategori_() };
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Pastikan satu kategori ada dan aktif. Tanpa kunci sendiri, jadi aman
 * dipanggil dari dalam fungsi yang sudah memegang kunci skrip.
 */
function pastikanKategori_(nama, kelompok) {
  nama = String(nama || '').trim();
  if (!nama) throw new Error('Nama kategori tidak boleh kosong.');

  var ada = cariKategori_(nama);
  if (ada) {
    var sh = tab_(TAB.KATEGORI);
    var berubah = false;
    if (String(ada.status || 'aktif') !== 'aktif') {
      sh.getRange(ada._baris, kolom_(TAB.KATEGORI, 'status')).setValue('aktif');
      berubah = true;
    }
    if (kelompok && String(ada.kelompok || '') !== String(kelompok)) {
      sh.getRange(ada._baris, kolom_(TAB.KATEGORI, 'kelompok')).setValue(kelompok);
      berubah = true;
    }
    if (berubah) {
      sh.getRange(ada._baris, kolom_(TAB.KATEGORI, 'diubah')).setValue(sekarang_());
      lupakanKategori_();
    }
    return false;
  }

  // Sudah ada di dropdown `PILIHAN` dan tidak sedang disisihkan — tidak perlu
  // baris tambahan, kecuali memang mau menyimpan saran kelompoknya.
  var diPilihan = bacaPilihan_().kategori.some(function (k) {
    return k.trim().toLowerCase() === nama.toLowerCase();
  });
  if (diPilihan && !kelompok) return false;

  tulisBaris_(TAB.KATEGORI, {
    nama: nama, kelompok: kelompok || '', urutan: urutanBerikut_(),
    status: 'aktif', dibuat: sekarang_(), diubah: sekarang_()
  });
  lupakanKategori_();
  return true;
}

function urutanBerikut_() {
  var maks = 0;
  barisKategori_().forEach(function (k) { maks = Math.max(maks, angka_(k.urutan)); });
  return maks + 1;
}

/**
 * Sisihkan kategori: bendera 'arsip' di `KKG Kategori`, `PILIHAN` tidak
 * disentuh. Pagu bulan berjalan dan bulan-bulan berikutnya ikut disisihkan
 * supaya tidak terus muncul di layar Anggaran, tapi pagu bulan yang sudah
 * lewat dibiarkan utuh sebagai riwayat.
 */
function sisihkanKategori_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var nama = String(data.nama || '').trim();
    if (!nama) throw new Error('Nama kategori tidak boleh kosong.');
    var ada = cariKategori_(nama);
    var sh = tab_(TAB.KATEGORI);
    if (ada) {
      sh.getRange(ada._baris, kolom_(TAB.KATEGORI, 'status')).setValue('arsip');
      sh.getRange(ada._baris, kolom_(TAB.KATEGORI, 'diubah')).setValue(sekarang_());
    } else {
      // Kategori bawaan `PILIHAN` disisihkan dengan menambah barisnya di sini,
      // bukan dengan mencoret namanya di tab milik Ryan.
      tulisBaris_(TAB.KATEGORI, {
        nama: nama, kelompok: '', urutan: urutanBerikut_(),
        status: 'arsip', dibuat: sekarang_(), diubah: sekarang_()
      });
    }
    lupakanKategori_();

    var sejak = keBulan_(data.sejak) || bulanDari_(new Date());
    var pagu = 0;
    var shA = tab_(TAB.ANGGARAN);
    baca_(TAB.ANGGARAN).forEach(function (a) {
      if (String(a.ruang || 'kategori') !== 'kategori') return;
      if (String(a.nama) !== nama) return;
      if (keBulan_(a.bulan) < sejak) return;
      if (String(a.status || 'aktif') === 'arsip') return;
      shA.getRange(a._baris, kolom_(TAB.ANGGARAN, 'status')).setValue('arsip');
      shA.getRange(a._baris, kolom_(TAB.ANGGARAN, 'diubah')).setValue(sekarang_());
      pagu++;
    });
    return { kategori: daftarKategori_(), paguDisisihkan: pagu };
  } finally {
    kunci.releaseLock();
  }
}

function pulihkanKategori_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    pastikanKategori_(data.nama, data.kelompok);
    return { kategori: daftarKategori_() };
  } finally {
    kunci.releaseLock();
  }
}

// -------------------------------------------------------- rutin & anggaran --

function simpanRutin_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var ada = {};
    baca_(TAB.RUTIN).forEach(function (r) { ada[String(r.id)] = r; });
    var baru = [];
    var hasil = [];
    masuk.forEach(function (m) {
      var id = String(m.id || idBaru_('rtn'));
      var jenis = m.jenis || JENIS.PENGELUARAN;
      var isi = {
        id: id,
        nama: String(m.nama || '').trim(),
        tipe: m.tipe || 'tagihan',
        jenis: jenis,
        kelompok: jenis === JENIS.PEMASUKAN || jenis === JENIS.TRANSFER
          ? KELOMPOK.NETRAL : (m.kelompok || KELOMPOK.HARIAN),
        kategori: m.kategori || '',
        bayar_pakai: m.bayarPakai || '',
        milik: m.milik || '',
        nominal: angka_(m.nominal),
        sifat: m.sifat || SIFAT.WAJIB,
        hari_jatuh_tempo: angka_(m.hariJatuhTempo) || 1,
        mulai: m.mulai || '',
        total_termin: angka_(m.totalTermin),
        termin_terbayar: angka_(m.terminTerbayar),
        aktif: m.aktif === false ? false : true
      };
      if (ada[id]) perbaruiBaris_(TAB.RUTIN, ada[id]._baris, isi);
      else baru.push(isi);
      hasil.push(bentukRutin_(isi));
    });
    tulisBanyak_(TAB.RUTIN, baru);
    return { tersimpan: hasil };
  } finally {
    kunci.releaseLock();
  }
}

function hapusRutin_(data) {
  var sh = tab_(TAB.RUTIN);
  var baris = baca_(TAB.RUTIN);
  for (var i = baris.length - 1; i >= 0; i--) {
    if (String(baris[i].id) === String(data.id)) {
      sh.deleteRow(baris[i]._baris);
      return { dihapus: 1 };
    }
  }
  return { dihapus: 0 };
}

/**
 * Pagu bisa dipasang di dua ruang: `kelompok` (empat pos besar) atau
 * `kategori` (rincian di dalamnya). Kuncinya bulan + ruang + nama, jadi pagu
 * "Harian 40%" dan pagu kategori bernama sama tidak pernah saling menimpa.
 */
function simpanAnggaran_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var sh = tab_(TAB.ANGGARAN);
    var kolomPagu = kolom_(TAB.ANGGARAN, 'pagu');
    var kolomStatus = kolom_(TAB.ANGGARAN, 'status');
    var kolomDiubah = kolom_(TAB.ANGGARAN, 'diubah');
    var ada = {};
    baca_(TAB.ANGGARAN).forEach(function (a) {
      ada[keBulan_(a.bulan) + '|' + String(a.ruang || 'kategori') + '|' + String(a.nama)] = a;
    });
    var baru = [];
    masuk.forEach(function (m) {
      var ruang = String(m.ruang || 'kategori');
      // Memagu kategori yang belum terdaftar sekaligus mendaftarkannya. Tanpa
      // ini, pagu yang dikirim dari antrian luring bisa menunjuk kategori yang
      // tidak pernah muncul di form catat.
      if (ruang === 'kategori') pastikanKategori_(m.nama, m.kelompok);
      var k = keBulan_(m.bulan) + '|' + ruang + '|' + String(m.nama);
      if (ada[k]) {
        sh.getRange(ada[k]._baris, kolomPagu).setValue(angka_(m.pagu));
        // Memagu ulang kategori yang tadinya disisihkan = memakainya lagi.
        sh.getRange(ada[k]._baris, kolomStatus).setValue('aktif');
        sh.getRange(ada[k]._baris, kolomDiubah).setValue(sekarang_());
      } else {
        baru.push({
          bulan: m.bulan, ruang: ruang, nama: m.nama, pagu: angka_(m.pagu),
          status: 'aktif', diubah: sekarang_()
        });
      }
    });
    tulisBanyak_(TAB.ANGGARAN, baru);
    return { tersimpan: masuk.length };
  } finally {
    kunci.releaseLock();
  }
}

// ------------------------------------------------------------------ belanja --

/**
 * Simpan satu atau banyak barang belanja. Satu aksi untuk semuanya — menambah,
 * mencentang, mengembalikan ke daftar, menyisihkan — karena semuanya cuma beda
 * isi rekaman, bukan beda perlakuan.
 *
 * Seluruh rekaman ditulis apa adanya, termasuk `kali` sebagai angka mutlak yang
 * sudah dihitung aplikasi. Sengaja bukan perintah "tambah satu": antrian luring
 * bisa mengirim ulang aksi yang sama, dan penambahan akan menggandakan diri
 * sedangkan penimpaan tidak.
 */
function simpanBelanja_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var ada = {};
    baca_(TAB.BELANJA).forEach(function (b) { ada[String(b.id)] = b; });
    var baru = [];
    var hasil = [];
    masuk.forEach(function (m) {
      var id = String(m.id || idBaru_('blj'));
      var nama = String(m.nama || '').trim();
      if (!nama) throw new Error('Nama barang tidak boleh kosong.');
      var isi = {
        id: id,
        nama: nama,
        status: String(m.status || 'aktif'),
        terakhir_beli: keTanggal_(m.terakhir) || '',
        kali: angka_(m.kali),
        dibuat: ada[id] ? ada[id].dibuat : sekarang_(),
        diubah: sekarang_()
      };
      if (ada[id]) perbaruiBaris_(TAB.BELANJA, ada[id]._baris, isi);
      else baru.push(isi);
      hasil.push(bentukBelanja_(isi));
    });
    tulisBanyak_(TAB.BELANJA, baru);
    return { tersimpan: hasil };
  } finally {
    kunci.releaseLock();
  }
}

// ----------------------------------------------------------------- perangkat --

function daftarkanPerangkat_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var baris = baca_(TAB.PERANGKAT);
    for (var i = 0; i < baris.length; i++) {
      if (String(baris[i].endpoint) === String(data.endpoint)) {
        return { id: String(baris[i].id), sudahAda: true };
      }
    }
    var id = idBaru_('dev');
    tulisBaris_(TAB.PERANGKAT, {
      id: id, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth,
      label: data.label || 'Perangkat', terdaftar: sekarang_()
    });
    return { id: id, sudahAda: false };
  } finally {
    kunci.releaseLock();
  }
}

function hapusPerangkat_(data) {
  var sh = tab_(TAB.PERANGKAT);
  var baris = baca_(TAB.PERANGKAT);
  for (var i = baris.length - 1; i >= 0; i--) {
    if (String(baris[i].id) === String(data.id) ||
        String(baris[i].endpoint) === String(data.endpoint)) {
      sh.deleteRow(baris[i]._baris);
      return { dihapus: 1 };
    }
  }
  return { dihapus: 0 };
}

function simpanPengaturan_(data) {
  var peta = data.peta || {};
  Object.keys(peta).forEach(function (k) {
    // PIN dan rahasia token tidak boleh diubah lewat API publik.
    if (k === 'pin_hash' || k === 'pin_garam' || k === 'rahasia_token') return;
    setelPengaturan_(k, peta[k]);
  });
  return profilPublik_(pengaturan_());
}

// --------------------------------------------------------------- pemasangan --

/**
 * Jalankan sekali dari editor Apps Script. Aman diulang: tab yang sudah ada
 * tidak disentuh isinya, dan tab bawaan milik Ryan tidak pernah dibuat maupun
 * diubah oleh fungsi ini.
 */
function siapkanSheet() {
  var hilang = [];
  Object.keys(BACA).forEach(function (k) {
    if (!ss_().getSheetByName(BACA[k])) hilang.push(BACA[k]);
  });
  if (hilang.length) {
    throw new Error('Spreadsheet ini bukan yang diharapkan — tab ' + hilang.join(', ') +
      ' tidak ada. Pasang skrip ini di spreadsheet yang memuat INPUT TRANSAKSI, PILIHAN, dan TARGET.');
  }

  Object.keys(TAB).forEach(function (k) { tab_(TAB[k]); });
  var p = pengaturan_();
  Object.keys(PENGATURAN_BAWAAN).forEach(function (k) {
    if (p[k] === undefined) setelPengaturan_(k, PENGATURAN_BAWAAN[k]);
  });
  if (!p.rahasia_token) setelPengaturan_('rahasia_token', acak_(48));
  semaiKategori_();
  formatTab_();
  bangunRingkasan_();
  return 'Tab KKG siap. Berikutnya: tulis PIN di baris "pin_baru" tab KKG Pengaturan, ' +
         'lalu jalankan pasangPinDariSheet().';
}

/** Menu "KKG" di Spreadsheet, supaya pemeliharaan kecil tidak perlu buka editor. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('KKG')
    .addItem('Siapkan / perbaiki tab KKG', 'siapkanSheet')
    .addItem('Segarkan Ringkasan', 'segarkanRingkasan')
    .addSeparator()
    .addItem('Pasang PIN dari baris pin_baru', 'pasangPinDariSheet')
    .addToUi();
}

/**
 * Format kolom tab milik aplikasi.
 *
 * Nomor kolomnya diambil dari HEADER lewat kolom_(), tidak pernah ditulis
 * sebagai huruf. Versi sebelumnya memakai 'B:B' dan sejenisnya, dan itu berarti
 * setiap kali urutan HEADER digeser, format mendarat di kolom yang salah tanpa
 * satu pun galat muncul.
 */
function formatTab_() {
  var angkaFormat = '#,##0';
  var tanggalFormat = 'yyyy-mm-dd';

  var t = tab_(TAB.TRANSAKSI);
  t.getRange(1, kolom_(TAB.TRANSAKSI, 'tanggal'), t.getMaxRows()).setNumberFormat(tanggalFormat);
  t.getRange(1, kolom_(TAB.TRANSAKSI, 'nominal'), t.getMaxRows()).setNumberFormat(angkaFormat);
  // Kolom bulan berisi 'Sep-26'. Tanpa dipaksa teks, Sheets mengubahnya jadi
  // tanggal 26 September dan SUMIFS di REKAP BULANAN tidak pernah cocok lagi.
  t.getRange(1, kolom_(TAB.TRANSAKSI, 'bulan'), t.getMaxRows()).setNumberFormat('@');
  t.setColumnWidth(kolom_(TAB.TRANSAKSI, 'keterangan'), 240);
  t.setColumnWidth(kolom_(TAB.TRANSAKSI, 'catatan'), 220);

  var a = tab_(TAB.ANGGARAN);
  a.getRange(1, kolom_(TAB.ANGGARAN, 'bulan'), a.getMaxRows()).setNumberFormat('@');
  a.getRange(1, kolom_(TAB.ANGGARAN, 'pagu'), a.getMaxRows()).setNumberFormat(angkaFormat);

  var r = tab_(TAB.RUTIN);
  r.getRange(1, kolom_(TAB.RUTIN, 'mulai'), r.getMaxRows()).setNumberFormat('@');
  r.getRange(1, kolom_(TAB.RUTIN, 'nominal'), r.getMaxRows()).setNumberFormat(angkaFormat);

  var g = tab_(TAB.RINGKASAN);
  g.getRange(1, kolom_(TAB.RINGKASAN, 'bulan'), g.getMaxRows()).setNumberFormat('@');

  var k = tab_(TAB.KATEGORI);
  k.getRange(1, kolom_(TAB.KATEGORI, 'nama'), k.getMaxRows()).setNumberFormat('@');

  var b = tab_(TAB.BELANJA);
  b.getRange(1, kolom_(TAB.BELANJA, 'terakhir_beli'), b.getMaxRows()).setNumberFormat(tanggalFormat);
}
