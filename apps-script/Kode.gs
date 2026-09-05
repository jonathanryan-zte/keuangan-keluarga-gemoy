/**
 * Keuangan Keluarga Gemoy (KKG) — inti backend.
 *
 * Skrip ini menempel di Spreadsheet keuangan keluarga dan di-deploy sebagai
 * Web App. Aplikasi di GitHub Pages memanggilnya lewat POST ber-Content-Type
 * text/plain — bukan application/json — supaya browser tidak mengirim
 * preflight OPTIONS, yang tidak bisa dijawab Apps Script.
 *
 * Baca PANDUAN.md untuk langkah pemasangan.
 */

var TAB = {
  TRANSAKSI: 'Transaksi',
  RUTIN: 'Rutin',
  ANGGARAN: 'Anggaran',
  KATEGORI: 'Kategori',
  SAVING: 'Saving',
  PERANGKAT: 'Perangkat',
  PENGATURAN: 'Pengaturan',
  RINGKASAN: 'Ringkasan',
  BELANJA: 'Belanja'
};

var HEADER = {
  Transaksi: ['id', 'tanggal', 'jenis', 'kategori', 'item', 'nominal', 'sifat',
              'catatan', 'sumber', 'dibuat', 'diubah', 'status'],
  Rutin: ['id', 'nama', 'tipe', 'jenis', 'kategori', 'nominal', 'sifat',
          'hari_jatuh_tempo', 'mulai', 'total_termin', 'termin_terbayar', 'aktif'],
  Anggaran: ['bulan', 'kategori', 'pagu', 'status', 'diubah'],
  Kategori: ['id', 'jenis', 'nama', 'urutan', 'status', 'dibuat', 'diubah'],
  Saving: ['id', 'tanggal', 'debet', 'kredit', 'saldo', 'keterangan', 'status'],
  Perangkat: ['id', 'endpoint', 'p256dh', 'auth', 'label', 'terdaftar'],
  Pengaturan: ['kunci', 'nilai'],
  Ringkasan: ['bulan', 'pemasukan', 'tetap', 'rumah_tangga', 'sisa',
              'basis_penghasilan', 'perpuluhan', 'saving', 'entertain', 'jumlah_transaksi'],
  // Satu baris per barang, selamanya. Mencentang tidak menghapus barisnya —
  // hanya mengubah status dan mencap tanggalnya, supaya "kapan terakhir beli
  // telur" masih bisa dijawab setahun kemudian.
  Belanja: ['id', 'nama', 'status', 'terakhir_beli', 'kali', 'dibuat', 'diubah']
};

var JENIS = { PEMASUKAN: 'PEMASUKAN', TETAP: 'TETAP', RUMAH_TANGGA: 'RUMAH_TANGGA' };
var SIFAT = { WAJIB: 'WAJIB', KEINGINAN: 'KEINGINAN' };

/**
 * Benih kategori. Setelah tab `Kategori` terisi, tab itulah yang jadi sumber
 * kebenaran — daftar di sini hanya dipakai saat menyemai tab kosong dan oleh
 * Migrasi.gs untuk mencocokkan kategori dari Sheet lama.
 */
var KATEGORI = {
  // Empat kategori pertama adalah basis rumus 10/30/20 (lihat basis_persen_kategori).
  // 'Gaji Ryan' sengaja dipisah karena di Sheet lama memang tidak ikut dihitung.
  PEMASUKAN: ['Gaji Pokok', 'Gaji BRU', 'Tunjangan', 'Uang Makan',
              'Gaji Ryan', 'Fee & Honor', 'THR & Bonus', 'Cicilan Masuk', 'Lainnya'],
  TETAP: ['Arisan', 'Rumah', 'Utilitas', 'Langganan', 'Transport', 'Cicilan',
          'Keluarga', 'Kartu Kredit', 'Uang Makan'],
  RUMAH_TANGGA: ['Pangan', 'Sandang', 'Papan', 'Hobi', 'Gift', 'Travelling',
                 'Kesehatan', 'Lainnya']
};

/** Nilai bawaan tab Pengaturan. Hanya ditulis kalau kuncinya belum ada. */
var PENGATURAN_BAWAAN = {
  persen_perpuluhan: '10',
  persen_saving: '30',
  persen_entertain: '20',
  // Kategori pemasukan yang jadi basis persentase 10/30/20. Mengikuti rumus di
  // Sheet lama yang selalu menunjuk baris 8-11: gaji pokok Thesa + gaji BRU +
  // tunjangan + uang makan. Gaji Ryan, THR, fee, dan pencairan cicilan TIDAK
  // ikut dihitung.
  basis_persen_kategori: 'Gaji Pokok,Gaji BRU,Tunjangan,Uang Makan',
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

/** Ambil tab, buat kalau belum ada, dan pastikan barisan headernya benar. */
function tab_(nama) {
  var buku = ss_();
  var sh = buku.getSheetByName(nama);
  var header = HEADER[nama];
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

/** Seluruh baris data satu tab sebagai array objek, plus nomor barisnya. */
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

function idBaru_(awalan) {
  return awalan + '-' + Date.now().toString(36) + '-' +
         Utilities.getUuid().substring(0, 6);
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
  return m ? m[0] : '';
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
      sh.getRange(baris[i]._baris, 2).setValue(nilai);
      return;
    }
  }
  sh.appendRow([kunci, nilai]);
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
      'Pakai pasangPinDariSheet(): tulis PIN di tab Pengaturan baris "pin_baru", lalu jalankan fungsi itu.');
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
 * Caranya: tulis PIN di tab `Pengaturan`, baris berkunci `pin_baru`, lalu
 * jalankan fungsi ini. Karena tidak butuh argumen, fungsi ini aman dijalankan
 * dari tombol Run. Setelah PIN di-hash, sel `pin_baru` langsung dikosongkan
 * supaya angkanya tidak tertinggal sebagai teks di spreadsheet.
 */
function pasangPinDariSheet() {
  var pin = String(pengaturan_().pin_baru || '').trim();
  if (!/^[0-9]{4,6}$/.test(pin)) {
    throw new Error('Belum ada PIN yang sah. Buka tab Pengaturan, tulis 4-6 angka ' +
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
  return jawab_({ ok: true, aplikasi: 'KKG', versi: 1, waktu: sekarang_() });
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
      if (!p.pin_hash) throw new Error('PIN belum diatur. Jalankan setPin() di editor Apps Script.');
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
      case 'rutin.simpan':      return jawab_({ ok: true, data: simpanRutin_(data) });
      case 'rutin.hapus':       return jawab_({ ok: true, data: hapusRutin_(data) });
      case 'anggaran.simpan':   return jawab_({ ok: true, data: simpanAnggaran_(data) });
      case 'kategori.simpan':   return jawab_({ ok: true, data: simpanKategori_(data) });
      case 'kategori.sisihkan': return jawab_({ ok: true, data: sisihkanKategori_(data) });
      case 'kategori.pulihkan': return jawab_({ ok: true, data: pulihkanKategori_(data) });
      case 'belanja.simpan':    return jawab_({ ok: true, data: simpanBelanja_(data) });
      case 'saving.simpan':     return jawab_({ ok: true, data: simpanSaving_(data) });
      case 'saving.hapus':      return jawab_({ ok: true, data: hapusSaving_(data) });
      case 'perangkat.daftar':  return jawab_({ ok: true, data: daftarkanPerangkat_(data) });
      case 'perangkat.hapus':   return jawab_({ ok: true, data: hapusPerangkat_(data) });
      case 'pengaturan.simpan': return jawab_({ ok: true, data: simpanPengaturan_(data) });
      // Tarik isi terbaru `Monthly 26` yang masih diisi admin. Lihat Sinkron.gs.
      case 'sinkron.jalankan':  return jawab_({ ok: true, data: sinkronDariAplikasi_() });
      default:
        return jawab_({ ok: false, pesan: 'Aksi tidak dikenal: ' + aksi });
    }
  } catch (err) {
    return jawab_({ ok: false, pesan: err.message || String(err) });
  }
}

function profilPublik_(p) {
  var kategori = daftarKategori_();
  return {
    persen: {
      perpuluhan: angka_(p.persen_perpuluhan || 10),
      saving: angka_(p.persen_saving || 30),
      entertain: angka_(p.persen_entertain || 20)
    },
    basisPersenKategori: String(p.basis_persen_kategori || PENGATURAN_BAWAAN.basis_persen_kategori)
      .split(',').map(function (s) { return s.trim(); }).filter(String),
    vapidPublik: p.vapid_publik || '',
    kategori: kategori.aktif,
    kategoriArsip: kategori.arsip
  };
}

// -------------------------------------------------------------------- muatan --

/**
 * Satu panggilan yang mengisi seluruh aplikasi saat dibuka: transaksi beberapa
 * bulan terakhir, rutin, anggaran, saving, pengaturan. Sengaja digabung supaya
 * aplikasi cuma sekali jalan-bolak-balik ke server saat start di jaringan HP.
 */
function muatAwal_(data) {
  var bulanDari = data.dari || '';   // 'yyyy-MM'
  var semua = baca_(TAB.TRANSAKSI).filter(function (t) {
    return String(t.status || 'aktif') !== 'dihapus';
  });
  var transaksi = semua.map(bentukTransaksi_).filter(function (t) {
    return !bulanDari || t.bulan >= bulanDari;
  });

  return {
    transaksi: transaksi,
    bulanTersedia: bulanTersedia_(semua),
    rutin: baca_(TAB.RUTIN).map(bentukRutin_),
    // Pagu yang disisihkan ikut dikirim beserta bendera statusnya. Aplikasi
    // yang menyaringnya, bukan server — supaya riwayat pagu lama tetap bisa
    // dilihat dan dipulihkan dari HP.
    anggaran: baca_(TAB.ANGGARAN).map(function (a) {
      return {
        bulan: keBulan_(a.bulan), kategori: String(a.kategori), pagu: angka_(a.pagu),
        status: String(a.status || 'aktif')
      };
    }),
    saving: baca_(TAB.SAVING)
      .filter(function (s) { return String(s.status || 'aktif') !== 'dihapus'; })
      .map(function (s) {
        return {
          id: String(s.id), tanggal: keTanggal_(s.tanggal), debet: angka_(s.debet),
          kredit: angka_(s.kredit), saldo: angka_(s.saldo), keterangan: String(s.keterangan || '')
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

function bentukTransaksi_(t) {
  var tanggal = keTanggal_(t.tanggal);
  return {
    id: String(t.id),
    tanggal: tanggal,
    bulan: tanggal.substring(0, 7),
    jenis: String(t.jenis || JENIS.RUMAH_TANGGA),
    kategori: String(t.kategori || ''),
    item: String(t.item || ''),
    nominal: angka_(t.nominal),
    sifat: String(t.sifat || ''),
    catatan: String(t.catatan || ''),
    sumber: String(t.sumber || 'aplikasi')
  };
}

function bentukRutin_(r) {
  return {
    id: String(r.id),
    nama: String(r.nama || ''),
    tipe: String(r.tipe || 'tagihan'),
    jenis: String(r.jenis || JENIS.TETAP),
    kategori: String(r.kategori || ''),
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

function bulanTersedia_(semua) {
  var set = {};
  semua.forEach(function (t) {
    var b = bulanDari_(t.tanggal);
    if (b) set[b] = true;
  });
  return Object.keys(set).sort();
}

function daftarTransaksi_(data) {
  var dari = data.dari || '0000-00';
  var sampai = data.sampai || '9999-99';
  return baca_(TAB.TRANSAKSI)
    .filter(function (t) { return String(t.status || 'aktif') !== 'dihapus'; })
    .map(bentukTransaksi_)
    .filter(function (t) { return t.bulan >= dari && t.bulan <= sampai; });
}

// ------------------------------------------------------------------ transaksi --

/**
 * Menerima satu transaksi atau sekumpulan (antrian offline dari HP).
 * Idempoten lewat `id`: kalau id sudah ada, baris lama diperbarui, bukan
 * ditambah lagi. Ini yang mencegah duplikat saat sinyal putus-nyambung.
 */
function simpanTransaksi_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var adaSekarang = {};
    baca_(TAB.TRANSAKSI).forEach(function (t) { adaSekarang[String(t.id)] = t; });

    var baru = [];
    var diperbarui = 0;
    var hasil = [];

    masuk.forEach(function (m) {
      var id = String(m.id || idBaru_('trx'));
      var isi = {
        id: id,
        tanggal: keTanggal_(m.tanggal) || keTanggal_(new Date()),
        jenis: m.jenis || JENIS.RUMAH_TANGGA,
        kategori: m.kategori || '',
        item: String(m.item || '').trim(),
        nominal: angka_(m.nominal),
        sifat: m.jenis === JENIS.PEMASUKAN ? '' : (m.sifat || SIFAT.WAJIB),
        catatan: m.catatan || '',
        sumber: m.sumber || 'aplikasi',
        dibuat: sekarang_(),
        diubah: sekarang_(),
        status: 'aktif'
      };
      if (adaSekarang[id]) {
        isi.dibuat = adaSekarang[id].dibuat || isi.dibuat;
        perbaruiBaris_(TAB.TRANSAKSI, adaSekarang[id]._baris, isi);
        diperbarui++;
      } else {
        baru.push(isi);
      }
      hasil.push(bentukTransaksi_(isi));
    });

    tulisBanyak_(TAB.TRANSAKSI, baru);
    bangunRingkasan_();
    return { tersimpan: hasil, baru: baru.length, diperbarui: diperbarui };
  } finally {
    kunci.releaseLock();
  }
}

function ubahTransaksi_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var baris = baca_(TAB.TRANSAKSI);
    for (var i = 0; i < baris.length; i++) {
      if (String(baris[i].id) !== String(data.id)) continue;
      var isi = {
        id: baris[i].id,
        tanggal: keTanggal_(data.tanggal !== undefined ? data.tanggal : baris[i].tanggal),
        jenis: data.jenis !== undefined ? data.jenis : baris[i].jenis,
        kategori: data.kategori !== undefined ? data.kategori : baris[i].kategori,
        item: data.item !== undefined ? data.item : baris[i].item,
        nominal: angka_(data.nominal !== undefined ? data.nominal : baris[i].nominal),
        sifat: data.sifat !== undefined ? data.sifat : baris[i].sifat,
        catatan: data.catatan !== undefined ? data.catatan : baris[i].catatan,
        sumber: baris[i].sumber,
        dibuat: baris[i].dibuat,
        diubah: sekarang_(),
        status: 'aktif'
      };
      if (isi.jenis === JENIS.PEMASUKAN) isi.sifat = '';
      perbaruiBaris_(TAB.TRANSAKSI, baris[i]._baris, isi);
      bangunRingkasan_();
      return bentukTransaksi_(isi);
    }
    throw new Error('Transaksi tidak ditemukan: ' + data.id);
  } finally {
    kunci.releaseLock();
  }
}

/** Hapus lunak — barisnya tetap ada supaya tidak ada data yang hilang permanen. */
function hapusTransaksi_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var sh = tab_(TAB.TRANSAKSI);
    var kolomStatus = HEADER.Transaksi.indexOf('status') + 1;
    var kolomDiubah = HEADER.Transaksi.indexOf('diubah') + 1;
    var baris = baca_(TAB.TRANSAKSI);
    var idSet = {};
    (data.daftar || [data.id]).forEach(function (id) { idSet[String(id)] = true; });
    var n = 0;
    baris.forEach(function (b) {
      if (!idSet[String(b.id)]) return;
      sh.getRange(b._baris, kolomStatus).setValue('dihapus');
      sh.getRange(b._baris, kolomDiubah).setValue(sekarang_());
      n++;
    });
    bangunRingkasan_();
    return { dihapus: n };
  } finally {
    kunci.releaseLock();
  }
}

// -------------------------------------------------------------------- kategori --

/**
 * Sumber kebenaran daftar kategori.
 *
 * Tab `Kategori` yang menentukan, bukan konstanta KATEGORI di atas — itu cuma
 * benih. Kategori yang "dihapus" dari aplikasi tidak pernah dibuang barisnya;
 * statusnya jadi 'arsip' supaya transaksi lama tetap punya nama kategori yang
 * bisa dibaca, dan supaya kategori itu bisa dipulihkan lagi kapan saja.
 */
/**
 * Daftar kategori ditahan selama satu eksekusi. Tanpa ini, menyimpan sepuluh
 * pagu sekaligus berarti membaca tab Kategori sepuluh kali — pemborosan yang
 * langsung terasa sebagai jeda di HP. Setiap tulisan membatalkannya.
 */
var _kategoriTertahan = null;

function lupakanKategori_() { _kategoriTertahan = null; }

function semaiKategori_() {
  var sh = tab_(TAB.KATEGORI);
  if (sh.getLastRow() > 1) return;
  var waktu = sekarang_();
  var benih = [];
  Object.keys(KATEGORI).forEach(function (jenis) {
    KATEGORI[jenis].forEach(function (nama, i) {
      benih.push({
        id: idBaru_('kat'), jenis: jenis, nama: nama, urutan: i + 1,
        status: 'aktif', dibuat: waktu, diubah: waktu
      });
    });
  });
  tulisBanyak_(TAB.KATEGORI, benih);
  lupakanKategori_();
}

/** Baris kategori mentah, sudah tersemai dan terurut. */
function barisKategori_() {
  if (_kategoriTertahan) return _kategoriTertahan;
  semaiKategori_();
  var baris = baca_(TAB.KATEGORI).filter(function (k) { return String(k.nama || '').trim(); });
  baris.sort(function (a, b) {
    var ua = angka_(a.urutan) || 9999;
    var ub = angka_(b.urutan) || 9999;
    if (ua !== ub) return ua - ub;
    return String(a.nama) < String(b.nama) ? -1 : 1;
  });
  _kategoriTertahan = baris;
  return baris;
}

/** { aktif: {JENIS: [nama]}, arsip: {JENIS: [nama]} } */
function daftarKategori_() {
  var hasil = { aktif: {}, arsip: {} };
  Object.keys(JENIS).forEach(function (j) { hasil.aktif[j] = []; hasil.arsip[j] = []; });
  barisKategori_().forEach(function (k) {
    var jenis = String(k.jenis || JENIS.RUMAH_TANGGA);
    if (!hasil.aktif[jenis]) { hasil.aktif[jenis] = []; hasil.arsip[jenis] = []; }
    var wadah = String(k.status || 'aktif') === 'arsip' ? hasil.arsip : hasil.aktif;
    if (wadah[jenis].indexOf(String(k.nama)) < 0) wadah[jenis].push(String(k.nama));
  });
  return hasil;
}

function cariKategori_(jenis, nama) {
  var cari = String(nama || '').trim().toLowerCase();
  var baris = barisKategori_();
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i].jenis) !== String(jenis)) continue;
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
    masuk.forEach(function (m) { pastikanKategori_(m.jenis, m.nama, m.urutan); });
    return { kategori: daftarKategori_() };
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Pastikan satu kategori ada dan aktif. Tanpa kunci sendiri, jadi aman
 * dipanggil dari dalam fungsi yang sudah memegang kunci skrip.
 */
function pastikanKategori_(jenis, nama, urutan) {
  nama = String(nama || '').trim();
  jenis = String(jenis || JENIS.RUMAH_TANGGA);
  if (!nama) throw new Error('Nama kategori tidak boleh kosong.');
  if (!JENIS[jenis]) throw new Error('Jenis kategori tidak dikenal: ' + jenis);

  var ada = cariKategori_(jenis, nama);
  if (ada) {
    if (String(ada.status || 'aktif') !== 'aktif') {
      var sh = tab_(TAB.KATEGORI);
      sh.getRange(ada._baris, HEADER.Kategori.indexOf('status') + 1).setValue('aktif');
      sh.getRange(ada._baris, HEADER.Kategori.indexOf('diubah') + 1).setValue(sekarang_());
      lupakanKategori_();
    }
    return false;
  }
  tulisBaris_(TAB.KATEGORI, {
    id: idBaru_('kat'), jenis: jenis, nama: nama,
    urutan: angka_(urutan) || urutanBerikut_(jenis),
    status: 'aktif', dibuat: sekarang_(), diubah: sekarang_()
  });
  lupakanKategori_();
  return true;
}

function urutanBerikut_(jenis) {
  var maks = 0;
  barisKategori_().forEach(function (k) {
    if (String(k.jenis) === String(jenis)) maks = Math.max(maks, angka_(k.urutan));
  });
  return maks + 1;
}

/**
 * Sisihkan kategori: bendera 'arsip', barisnya tetap. Pagu bulan berjalan dan
 * bulan-bulan berikutnya ikut disisihkan supaya tidak terus muncul di layar
 * Anggaran, tapi pagu bulan yang sudah lewat dibiarkan utuh sebagai riwayat.
 */
function sisihkanKategori_(data) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var jenis = String(data.jenis || JENIS.RUMAH_TANGGA);
    var ada = cariKategori_(jenis, data.nama);
    if (!ada) throw new Error('Kategori tidak ditemukan: ' + data.nama);
    var sh = tab_(TAB.KATEGORI);
    sh.getRange(ada._baris, HEADER.Kategori.indexOf('status') + 1).setValue('arsip');
    sh.getRange(ada._baris, HEADER.Kategori.indexOf('diubah') + 1).setValue(sekarang_());
    lupakanKategori_();

    var sejak = keBulan_(data.sejak) || bulanDari_(new Date());
    var pagu = 0;
    var shA = tab_(TAB.ANGGARAN);
    var kolomStatusA = HEADER.Anggaran.indexOf('status') + 1;
    var kolomDiubahA = HEADER.Anggaran.indexOf('diubah') + 1;
    baca_(TAB.ANGGARAN).forEach(function (a) {
      if (String(a.kategori) !== String(ada.nama)) return;
      if (keBulan_(a.bulan) < sejak) return;
      if (String(a.status || 'aktif') === 'arsip') return;
      shA.getRange(a._baris, kolomStatusA).setValue('arsip');
      shA.getRange(a._baris, kolomDiubahA).setValue(sekarang_());
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
    var jenis = String(data.jenis || JENIS.RUMAH_TANGGA);
    if (!cariKategori_(jenis, data.nama)) throw new Error('Kategori tidak ditemukan: ' + data.nama);
    pastikanKategori_(jenis, data.nama);
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
      var isi = {
        id: id,
        nama: String(m.nama || '').trim(),
        tipe: m.tipe || 'tagihan',
        jenis: m.jenis || JENIS.TETAP,
        kategori: m.kategori || '',
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

function simpanAnggaran_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var sh = tab_(TAB.ANGGARAN);
    var kolomPagu = HEADER.Anggaran.indexOf('pagu') + 1;
    var kolomStatus = HEADER.Anggaran.indexOf('status') + 1;
    var kolomDiubah = HEADER.Anggaran.indexOf('diubah') + 1;
    var ada = {};
    baca_(TAB.ANGGARAN).forEach(function (a) {
      ada[keBulan_(a.bulan) + '|' + String(a.kategori)] = a;
    });
    var baru = [];
    masuk.forEach(function (m) {
      // Memagu kategori yang belum terdaftar sekaligus mendaftarkannya. Tanpa
      // ini, pagu yang dikirim dari antrian luring bisa menunjuk kategori yang
      // tidak pernah muncul di form catat.
      pastikanKategori_(m.jenis || JENIS.RUMAH_TANGGA, m.kategori);
      var k = keBulan_(m.bulan) + '|' + String(m.kategori);
      if (ada[k]) {
        sh.getRange(ada[k]._baris, kolomPagu).setValue(angka_(m.pagu));
        // Memagu ulang kategori yang tadinya disisihkan = memakainya lagi.
        sh.getRange(ada[k]._baris, kolomStatus).setValue('aktif');
        sh.getRange(ada[k]._baris, kolomDiubah).setValue(sekarang_());
      } else {
        baru.push({
          bulan: m.bulan, kategori: m.kategori, pagu: angka_(m.pagu),
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

// -------------------------------------------------------------------- saving --

function simpanSaving_(data) {
  var masuk = data.daftar || [data];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var ada = {};
    baca_(TAB.SAVING).forEach(function (s) { ada[String(s.id)] = s; });
    var baru = [];
    masuk.forEach(function (m) {
      var id = String(m.id || idBaru_('svg'));
      var isi = {
        id: id,
        tanggal: keTanggal_(m.tanggal) || keTanggal_(new Date()),
        debet: angka_(m.debet),
        kredit: angka_(m.kredit),
        saldo: 0,
        keterangan: String(m.keterangan || ''),
        status: 'aktif'
      };
      if (ada[id]) perbaruiBaris_(TAB.SAVING, ada[id]._baris, isi);
      else baru.push(isi);
    });
    tulisBanyak_(TAB.SAVING, baru);
    return { saving: hitungUlangSaldoSaving_() };
  } finally {
    kunci.releaseLock();
  }
}

function hapusSaving_(data) {
  var sh = tab_(TAB.SAVING);
  var kolom = HEADER.Saving.indexOf('status') + 1;
  baca_(TAB.SAVING).forEach(function (s) {
    if (String(s.id) === String(data.id)) sh.getRange(s._baris, kolom).setValue('dihapus');
  });
  return { saving: hitungUlangSaldoSaving_() };
}

/** Urutkan menurut tanggal lalu tulis ulang kolom saldo berjalan. */
function hitungUlangSaldoSaving_() {
  var sh = tab_(TAB.SAVING);
  var baris = baca_(TAB.SAVING).filter(function (s) {
    return String(s.status || 'aktif') !== 'dihapus';
  });
  baris.sort(function (a, b) {
    return keTanggal_(a.tanggal) < keTanggal_(b.tanggal) ? -1 : 1;
  });
  var saldo = 0;
  var hasil = [];
  var kolomSaldo = HEADER.Saving.indexOf('saldo') + 1;
  baris.forEach(function (s) {
    saldo += angka_(s.debet) - angka_(s.kredit);
    sh.getRange(s._baris, kolomSaldo).setValue(saldo);
    hasil.push({
      id: String(s.id), tanggal: keTanggal_(s.tanggal), debet: angka_(s.debet),
      kredit: angka_(s.kredit), saldo: saldo, keterangan: String(s.keterangan || '')
    });
  });
  return hasil;
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
 * tidak disentuh isinya.
 */
function siapkanSheet() {
  Object.keys(TAB).forEach(function (k) { tab_(TAB[k]); });
  var p = pengaturan_();
  Object.keys(PENGATURAN_BAWAAN).forEach(function (k) {
    if (p[k] === undefined) setelPengaturan_(k, PENGATURAN_BAWAAN[k]);
  });
  if (!p.rahasia_token) setelPengaturan_('rahasia_token', acak_(48));
  semaiKategori_();
  formatTabTransaksi_();
  bangunRingkasan_();
  return 'Tab siap. Berikutnya jalankan setPin("123456") dengan PIN pilihan Anda.';
}

/**
 * Menu "KKG" di Spreadsheet. Ada supaya sinkron dari `Monthly 26` bisa
 * dijalankan tanpa membuka editor Apps Script — termasuk oleh admin yang
 * mengisi tab lamanya.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('KKG')
    .addItem('Tarik data dari sheet lama', 'jalankanSinkron')
    .addItem('Lihat dulu apa yang akan berubah', 'periksaSinkron')
    .addSeparator()
    .addItem('Segarkan Ringkasan', 'segarkanRingkasan')
    .addToUi();
}

function formatTabTransaksi_() {
  var sh = tab_(TAB.TRANSAKSI);
  sh.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('F:F').setNumberFormat('#,##0');
  sh.setColumnWidth(5, 240);
  sh.setColumnWidth(8, 220);

  var svg = tab_(TAB.SAVING);
  svg.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  svg.getRange('C:E').setNumberFormat('#,##0');

  // Kolom bulan ('2026-09') dan bulan mulai cicilan harus tetap teks. Tanpa
  // ini Google Sheets mengubahnya jadi tanggal, dan pencocokan pagu anggaran
  // serta hitungan termin cicilan langsung meleset.
  tab_(TAB.ANGGARAN).getRange('A:A').setNumberFormat('@');
  tab_(TAB.ANGGARAN).getRange('C:C').setNumberFormat('#,##0');
  tab_(TAB.RINGKASAN).getRange('A:A').setNumberFormat('@');
  tab_(TAB.RUTIN).getRange('I:I').setNumberFormat('@');
  tab_(TAB.RUTIN).getRange('F:F').setNumberFormat('#,##0');
  tab_(TAB.KATEGORI).getRange('C:C').setNumberFormat('@');
  tab_(TAB.BELANJA).getRange('D:D').setNumberFormat('yyyy-mm-dd');
}
