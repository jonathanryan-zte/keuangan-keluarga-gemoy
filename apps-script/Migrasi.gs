/**
 * Migrasi dari tab lama (`Monthly 25`, `Monthly 26`, `SAVING 2026`)
 * ke tab `Transaksi` dan `Saving`.
 *
 * Tab lama TIDAK disentuh sama sekali — hanya dibaca.
 *
 * Cara pakai:
 *   1. periksaMigrasi()   -> tulis laporan ke tab "Migrasi Cek", tidak mengubah data
 *   2. jalankanMigrasi()  -> tulis beneran ke tab Transaksi
 *   3. batalkanMigrasi()  -> hapus semua baris bersumber 'migrasi', bisa diulang
 *
 * Semua baris hasil ditandai kolom `sumber` = 'migrasi', jadi input manual
 * Ryan lewat aplikasi tidak akan pernah ikut terhapus.
 */

var TAB_LAMA = ['Monthly 25', 'Monthly 26'];
var TAB_SAVING_LAMA = 'SAVING 2026';
var TAB_CEK = 'Migrasi Cek';

var BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

var BARIS_ITEM_MULAI = 6;   // baris 5 adalah total, baris 6 ke bawah adalah item

/**
 * Label yang tidak boleh jadi transaksi: penanda bagian, dan angka turunan
 * yang dihitung ulang oleh tab Ringkasan. Kalau ini ikut termigrasi, uangnya
 * akan terhitung dua kali.
 */
var LABEL_DILEWATI = [
  'list cicilan', 'list cicilan wajib', 'sisa', 'perpuluhan', 'saving',
  'entertain', 'kategori', 'pemasukan', 'pengeluaran tetap',
  'pengeluaran rumah tangga', 'hutang cc', 'sisa cc', 'kelebihan cc',
  'cc blm dibayarkan', 'kado'
];

// ------------------------------------------------------- pemindaian layout --

/**
 * Cari blok bulan di sebuah tab lama dengan membaca baris 3 (nama bulan) dan
 * baris 4 (tiga judul kelompok). Sengaja dipindai saat jalan, bukan koordinat
 * tetap, karena lebar blok berubah-ubah: 7 kolom di Januari, 8 kolom sejak
 * Juni (ada kolom Kategori), 9 kolom di Agustus (ada kolom coretan).
 */
function pindaiBlok_(sh) {
  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastCol < 2 || lastRow < BARIS_ITEM_MULAI) return [];

  var baris3 = sh.getRange(3, 1, 1, lastCol).getValues()[0];
  var baris4 = sh.getRange(4, 1, 1, lastCol).getValues()[0];
  var tahunMentah = sh.getRange(4, 1).getValue();
  if (typeof tahunMentah === 'number') tahunMentah = Math.round(tahunMentah);
  var tahunSel = String(tahunMentah || '').replace(/\D/g, '');
  var tahun = tahunSel.length === 4 ? tahunSel : String(new Date().getFullYear());

  // Kolom awal tiap bulan.
  var awalBulan = [];
  for (var c = 0; c < lastCol; c++) {
    var teks = String(baris3[c] || '').trim();
    var idx = BULAN_ID.indexOf(teks);
    if (idx >= 0) awalBulan.push({ nama: teks, indeks: idx, kolom: c });
  }
  if (!awalBulan.length) return [];

  var blok = [];
  for (var i = 0; i < awalBulan.length; i++) {
    var mulai = awalBulan[i].kolom;
    var akhir = (i + 1 < awalBulan.length) ? awalBulan[i + 1].kolom : lastCol;
    var bulan = tahun + '-' + pad2_(awalBulan[i].indeks + 1);

    // Judul kelompok di dalam blok ini.
    var judul = [];
    for (var c2 = mulai; c2 < akhir; c2++) {
      var h = String(baris4[c2] || '').trim().toUpperCase();
      if (h === 'PEMASUKAN') judul.push({ jenis: JENIS.PEMASUKAN, kolom: c2 });
      else if (h === 'PENGELUARAN TETAP') judul.push({ jenis: JENIS.TETAP, kolom: c2 });
      else if (h === 'PENGELUARAN RUMAH TANGGA') judul.push({ jenis: JENIS.RUMAH_TANGGA, kolom: c2 });
    }
    if (!judul.length) continue;

    var kelompok = judul.map(function (j, n) {
      var batas = (n + 1 < judul.length) ? judul[n + 1].kolom : akhir;
      return bentukKelompok_(sh, j.jenis, j.kolom, Math.min(batas, j.kolom + 3), lastRow);
    });

    blok.push({ bulan: bulan, namaBulan: awalBulan[i].nama, kelompok: kelompok });
  }
  return blok;
}

/**
 * Tentukan kolom mana yang berisi kategori / item / nominal untuk satu
 * kelompok, dengan menghitung sel angka di tiap kolom. Kolom nominal adalah
 * yang paling banyak angkanya.
 */
function bentukKelompok_(sh, jenis, kolomMulai, kolomBatas, lastRow) {
  var lebar = Math.max(kolomBatas - kolomMulai, 2);
  var tinggi = lastRow - BARIS_ITEM_MULAI + 1;
  var nilai = tinggi > 0
    ? sh.getRange(BARIS_ITEM_MULAI, kolomMulai + 1, tinggi, lebar).getValues()
    : [];

  // Blok tiga kolom (Kategori | Item | Nominal) hanya ada di pengeluaran rumah
  // tangga sejak Juni 2026, dan dikenali dari isi kolom pertamanya yang memakai
  // kosakata kategori. Menebak lewat "kolom mana yang paling banyak angkanya"
  // tidak bisa dipakai: kolom pemisah di sebelahnya sering berisi coretan
  // hitung-hitungan, dan itu sempat membuat Februari terbaca kosong.
  var kosakata = {};
  KATEGORI.RUMAH_TANGGA.forEach(function (k) { kosakata[k.toLowerCase()] = true; });
  var cocok = 0;
  for (var r = 0; r < nilai.length; r++) {
    var sel0 = nilai[r][0];
    if (typeof sel0 === 'string' && kosakata[sel0.trim().toLowerCase()]) cocok++;
  }
  var tigaKolom = jenis === JENIS.RUMAH_TANGGA && lebar >= 3 && cocok >= 2;

  return {
    jenis: jenis,
    kolomKategori: tigaKolom ? kolomMulai : -1,
    kolomItem: tigaKolom ? kolomMulai + 1 : kolomMulai,
    kolomNominal: tigaKolom ? kolomMulai + 2 : kolomMulai + 1,
    nilai: nilai,
    tigaKolom: tigaKolom
  };
}

function pad2_(n) { return n < 10 ? '0' + n : String(n); }

// ------------------------------------------------------- tebakan & aturan --

var PETA_KATEGORI_RT = [
  ['Pangan',     /belanja|pasar|bravo|superindo|aeon|hokky|galon|telur|telor|beras|sayur|buah|daging|ikan|ayam|lauk|susu|kopi|jajan|makan|nasi|bakso|soto|sate|mie|bakmi|mei |roti|donut|donnut|kue|sourdough|martabak|tahu|tempe|gula|santan|bumbu|snack|minum|es |teh|grabfood|shopeefood|gofood|depot|resto|rumah makan|rm |warung|cafe|kopken|hotpot|pizza|marugame|chateraise|nugget|protein|karbs|smothies|lontong|pempek|tiramissu|salad|ragi|tepung|kacang|gas elpiji|carasun|volks|koi|mcd|lawson|indomaret|alfamart/i],
  ['Sandang',    /baju|celana|jaket|topi|kaos|sepatu|sandal|tas |kacamata|casing|setrika|strika|laundry|potong rambut|barbershop|salon|vermak|jahit|sabun|pasta gigi|pembalut|skincare|body|parfum|barber|test pack|materai|j&t|cetakan/i],
  ['Papan',      /pbb|kebon|taman|tukang|jasa bebersih|bebersih|merry|cuci ac|cairan|pel |vaccum|sprei|cabinet|rak |perlengkapan dapur|perlengkapan rumah|kompor|lampu|listrik|pdam|air |paku|semen|cat |gelas|piring|stempel|racun tikus|ovo|topup|bensin|parkir|tol |grab|gojek|indrive|ojek|oli|servis|service|cuci mobil|perbaikan motor/i],
  ['Hobi',       /tennis|gym|fitness|hero|spiderman|nonton|bioskop|game|sepeda|lari|renang|buku|three vi|perlengkapan kopi|grinder|biji kopi|pameran/i],
  ['Gift',       /kado|hadiah|amplop wedding|traktir|tuppak|iuran hut|angpao|sin cia|jastip|titipan|fellowship|persembahan|sumbangan/i],
  ['Travelling', /liburan|penginapan|hotel|tiket|ijen|pacitan|bali|jakarta|trawas|outing|ragunan|wisata|travel|pesawat|kereta/i],
  ['Kesehatan',  /rumah sakit|klinik|dokter|apotek|vitamin|imunisasi|vaksin|bpjs|periksa/i]
];

var PETA_KATEGORI_TETAP = [
  ['Arisan',       /arisan/i],
  ['Rumah',        /kpr|pbb|iuran perumahan|sewa|kontrakan/i],
  ['Utilitas',     /internet|indihome|pdam|listrik|telkomsel|xl |wifi|air pam/i],
  ['Langganan',    /spotify|netflix|icloud|youtube|disney|vidio|langganan/i],
  ['Transport',    /bensin|parkir|parkiran|tol|servis mobil|service mobil|aki|ban /i],
  ['Cicilan',      /cicilan|iphone|huawei|jam papa|vaccum|azko|fitnessworks|angsuran/i],
  ['Kartu Kredit', /^cc |kartu kredit|kredit card/i],
  ['Uang Makan',   /uang makan/i],
  ['Keluarga',     /papa|mama|hutang|iuran gizi|mitra wonokoyo|kasih/i]
];

var PETA_KATEGORI_MASUK = [
  ['Gaji Ryan',    /gaji ryan|gaji bru ryan|pk ryan/i],
  ['Gaji BRU',     /gaji bru/i],
  ['Gaji Pokok',   /gaji pokok|^g1[34]|^g ?14|gaji /i],
  ['Tunjangan',    /tunjangan|tukin|tpp/i],
  ['Uang Makan',   /uang makan/i],
  ['THR & Bonus',  /thr|bonus|gratifikasi/i],
  ['Fee & Honor',  /fee|honor|fk unair|koperasi|narsum|^pk |giznus|mas halim|kelebihan/i]
];

function tebakKategori_(jenis, item, sudahLewatCicilan) {
  var teks = String(item || '');
  var peta;
  if (jenis === JENIS.PEMASUKAN) {
    if (sudahLewatCicilan) return 'Cicilan Masuk';
    peta = PETA_KATEGORI_MASUK;
  } else if (jenis === JENIS.TETAP) {
    peta = PETA_KATEGORI_TETAP;
  } else {
    peta = PETA_KATEGORI_RT;
  }
  for (var i = 0; i < peta.length; i++) {
    if (peta[i][1].test(teks)) return peta[i][0];
  }
  return jenis === JENIS.PEMASUKAN ? 'Lainnya' : 'Lainnya';
}

/**
 * WAJIB kecuali jelas-jelas keinginan. Sengaja condong ke WAJIB supaya angka
 * "keinginan" di dashboard tidak melar karena tebakan mesin; Ryan tinggal
 * membalik yang salah lewat layar Rapikan.
 */
function tebakSifat_(jenis, kategori) {
  if (jenis === JENIS.PEMASUKAN) return '';
  if (jenis === JENIS.TETAP) return SIFAT.WAJIB;
  if (kategori === 'Hobi' || kategori === 'Gift' || kategori === 'Travelling') {
    return SIFAT.KEINGINAN;
  }
  return SIFAT.WAJIB;
}

/**
 * Tarik tanggal dari nama item. Sheet lama tidak punya kolom tanggal, jadi
 * satu-satunya petunjuk harian ada di teks: "Tahu Campur 01122025",
 * "Belanja pasar 2/3/2026", "Sarapan 12/06", "Jajan takjil 09032026".
 * Kalau tidak ketemu, dipakai tanggal 1 bulan itu dan diberi tanda.
 */
function tarikTanggal_(item, bulan) {
  var teks = String(item || '');
  var th = parseInt(bulan.substring(0, 4), 10);
  var bl = parseInt(bulan.substring(5, 7), 10);
  var hasil = null;
  var bersih = teks;

  var m;
  // ddMMyyyy menempel: 01122025 / 09032026
  if ((m = teks.match(/(\d{2})(\d{2})(20\d{2})/))) {
    hasil = coba_(+m[1], +m[2], +m[3]);
    if (hasil) bersih = teks.replace(m[0], '');
  }
  // d/M/yyyy
  if (!hasil && (m = teks.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})/))) {
    hasil = coba_(+m[1], +m[2], +m[3]);
    if (hasil) bersih = teks.replace(m[0], '');
  }
  // d/M tanpa tahun -> pakai tahun blok
  if (!hasil && (m = teks.match(/(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?!\s*\/|\d)/))) {
    hasil = coba_(+m[1], +m[2], th);
    if (hasil) bersih = teks.replace(m[0], ' ');
  }
  // "tgl 3" / "tanggal 12"
  if (!hasil && (m = teks.match(/\btgl\.?\s*(\d{1,2})\b|\btanggal\s*(\d{1,2})\b/i))) {
    hasil = coba_(+(m[1] || m[2]), bl, th);
    if (hasil) bersih = teks.replace(m[0], '');
  }

  function coba_(d, bulanKe, tahun) {
    if (d < 1 || d > 31 || bulanKe < 1 || bulanKe > 12) return null;
    // Kalau bulan yang tertulis beda dengan bulan bloknya, kolom bloknya yang
    // dipercaya — angka di nama item sering cuma sebagian tanggal.
    if (bulanKe !== bl || tahun !== th) {
      if (bulanKe === bl && tahun !== th) return null;
      return null;
    }
    var akhir = new Date(tahun, bulanKe, 0).getDate();
    if (d > akhir) return null;
    return tahun + '-' + pad2_(bulanKe) + '-' + pad2_(d);
  }

  return {
    tanggal: hasil || (bulan + '-01'),
    perkiraan: !hasil,
    item: bersih.replace(/\s{2,}/g, ' ').trim().replace(/[\s,\-]+$/, '') || teks.trim()
  };
}

// ----------------------------------------------------------------- membaca --

/** Baca seluruh tab lama menjadi calon transaksi + catatan pemeriksaan. */
function bacaSemuaTabLama_() {
  var buku = ss_();
  var transaksi = [];
  var laporan = [];

  TAB_LAMA.forEach(function (nama) {
    var sh = buku.getSheetByName(nama);
    if (!sh) return;
    pindaiBlok_(sh).forEach(function (blok) {
      var ringkas = {
        tab: nama, bulan: blok.bulan, namaBulan: blok.namaBulan,
        pemasukan: 0, tetap: 0, rumah_tangga: 0, jumlah: 0,
        dilewati: [], cicilan: [], tanpaTanggal: 0
      };

      blok.kelompok.forEach(function (kel) {
        var lewatCicilan = false;
        for (var r = 0; r < kel.nilai.length; r++) {
          var baris = kel.nilai[r];
          var kategoriSel = kel.kolomKategori >= 0
            ? String(baris[0] || '').trim() : '';
          // Indeks di dalam `baris` relatif terhadap kolom awal kelompok.
          var selItem = baris[kel.tigaKolom ? 1 : 0];
          var nominal = baris[kel.tigaKolom ? 2 : 1];

          // Sel label yang isinya angka adalah coretan hitung-hitungan di kolom
          // pemisah, bukan transaksi.
          if (typeof selItem === 'number') continue;
          var itemMentah = String(selItem || '').trim();
          if (!itemMentah) continue;
          var rendah = itemMentah.toLowerCase();

          if (rendah.indexOf('list cicilan') >= 0) { lewatCicilan = true; continue; }

          // Di kolom pemasukan, semua baris di bawah "LIST CICILAN" adalah daftar
          // acuan angsuran (harga total / cicilan per bulan), bukan uang masuk —
          // rumus total di Sheet lama pun tidak pernah menjumlahnya. Dicatat
          // terpisah supaya bisa dipakai mengisi tab Rutin.
          if (lewatCicilan && kel.jenis === JENIS.PEMASUKAN) {
            if (angka_(nominal)) {
              ringkas.cicilan.push(itemMentah + ' = ' + Math.round(angka_(nominal)));
            }
            continue;
          }

          if (LABEL_DILEWATI.indexOf(rendah) >= 0) {
            if (nominal) {
              ringkas.dilewati.push(itemMentah + ' = ' + Math.round(angka_(nominal)));
            }
            continue;
          }
          var n = angka_(nominal);
          if (!n) continue;   // baris tanpa nominal = rencana yang belum terisi

          var tgl = tarikTanggal_(itemMentah, blok.bulan);
          var kategori = kategoriSel && kel.jenis === JENIS.RUMAH_TANGGA
            ? rapikanKategori_(kategoriSel)
            : tebakKategori_(kel.jenis, itemMentah, lewatCicilan);
          var catatan = [];
          if (tgl.perkiraan) { catatan.push('tanggal perkiraan'); ringkas.tanpaTanggal++; }
          if (!kategoriSel) catatan.push('kategori tebakan');

          transaksi.push({
            id: 'mig-' + blok.bulan + '-' + kel.jenis.substring(0, 3) + '-' + (transaksi.length + 1),
            tanggal: tgl.tanggal,
            jenis: kel.jenis,
            kategori: kategori,
            item: tgl.item,
            nominal: n,
            sifat: tebakSifat_(kel.jenis, kategori),
            catatan: catatan.join(', '),
            sumber: 'migrasi',
            dibuat: sekarang_(),
            diubah: sekarang_(),
            status: 'aktif'
          });

          if (kel.jenis === JENIS.PEMASUKAN) ringkas.pemasukan += n;
          else if (kel.jenis === JENIS.TETAP) ringkas.tetap += n;
          else ringkas.rumah_tangga += n;
          ringkas.jumlah++;
        }
      });

      laporan.push(ringkas);
    });
  });

  return { transaksi: transaksi, laporan: laporan };
}

function rapikanKategori_(teks) {
  var t = String(teks).trim().toLowerCase();
  var sah = KATEGORI.RUMAH_TANGGA;
  for (var i = 0; i < sah.length; i++) {
    if (sah[i].toLowerCase() === t) return sah[i];
  }
  if (t === 'travelling' || t === 'traveling') return 'Travelling';
  return 'Lainnya';
}

/** Total baris 5 tiap blok — angka yang selama ini Ryan lihat di Sheet. */
function totalSheetLama_() {
  var buku = ss_();
  var peta = {};
  TAB_LAMA.forEach(function (nama) {
    var sh = buku.getSheetByName(nama);
    if (!sh) return;
    pindaiBlok_(sh).forEach(function (blok) {
      var b5 = sh.getRange(5, 1, 1, sh.getLastColumn()).getValues()[0];
      var t = { pemasukan: 0, tetap: 0, rumah_tangga: 0 };
      blok.kelompok.forEach(function (kel) {
        // Total ada di kolom judul untuk blok 2 kolom, atau kolom tengah untuk
        // blok 3 kolom (di Sheet lama kolom pertama diisi tulisan "Kategori").
        var kandidat = [b5[kel.kolomItem], b5[kel.kolomKategori >= 0 ? kel.kolomKategori : kel.kolomItem]];
        var nilai = 0;
        for (var i = 0; i < kandidat.length; i++) {
          if (typeof kandidat[i] === 'number') { nilai = kandidat[i]; break; }
        }
        if (kel.jenis === JENIS.PEMASUKAN) t.pemasukan = nilai;
        else if (kel.jenis === JENIS.TETAP) t.tetap = nilai;
        else t.rumah_tangga = nilai;
      });
      peta[blok.bulan] = t;
    });
  });
  return peta;
}

// ---------------------------------------------------------------- laporan --

/**
 * Bandingkan hasil baca dengan total yang tertulis di Sheet lama, tanpa
 * mengubah apa pun. Selisih yang wajar berasal dari baris turunan (Entertain /
 * Saving / Perpuluhan) yang di beberapa bulan ikut dijumlah ke total oleh
 * rumus aslinya — itu dilaporkan terpisah di kolom "dilewati".
 */
function periksaMigrasi() {
  var hasil = bacaSemuaTabLama_();
  var total = totalSheetLama_();

  var sh = ss_().getSheetByName(TAB_CEK) || ss_().insertSheet(TAB_CEK);
  sh.clear();
  var header = ['bulan', 'transaksi terbaca', 'tanpa tanggal',
                'pemasukan migrasi', 'pemasukan sheet', 'selisih',
                'tetap migrasi', 'tetap sheet', 'selisih',
                'rumah tangga migrasi', 'rumah tangga sheet', 'selisih',
                'baris turunan yang sengaja dilewati',
                'daftar cicilan (bukan uang masuk)'];
  var baris = [header];

  hasil.laporan.forEach(function (r) {
    var t = total[r.bulan] || { pemasukan: 0, tetap: 0, rumah_tangga: 0 };
    baris.push([
      r.bulan + ' (' + r.namaBulan + ')', r.jumlah, r.tanpaTanggal,
      Math.round(r.pemasukan), Math.round(t.pemasukan), Math.round(r.pemasukan - t.pemasukan),
      Math.round(r.tetap), Math.round(t.tetap), Math.round(r.tetap - t.tetap),
      Math.round(r.rumah_tangga), Math.round(t.rumah_tangga), Math.round(r.rumah_tangga - t.rumah_tangga),
      r.dilewati.join(' | '),
      r.cicilan.join(' | ')
    ]);
  });

  sh.getRange(1, 1, baris.length, header.length).setValues(baris);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold')
    .setBackground('#0F766E').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 4, Math.max(baris.length - 1, 1), 9).setNumberFormat('#,##0');
  sh.autoResizeColumns(1, header.length);

  return 'Laporan siap di tab "' + TAB_CEK + '". ' + hasil.transaksi.length +
         ' transaksi terbaca dari ' + hasil.laporan.length + ' bulan.';
}

// --------------------------------------------------------------- eksekusi --

function jalankanMigrasi() {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(60000);
  try {
    batalkanMigrasi_(true);
    var hasil = bacaSemuaTabLama_();
    tulisBanyak_(TAB.TRANSAKSI, hasil.transaksi);
    var jml = migrasiSaving_();
    bangunRingkasan_();
    return hasil.transaksi.length + ' transaksi + ' + jml +
           ' baris saving dimigrasikan. Jalankan periksaMigrasi() kalau ingin membandingkan lagi.';
  } finally {
    kunci.releaseLock();
  }
}

/** Buang seluruh baris bersumber 'migrasi'. Input manual tidak tersentuh. */
function batalkanMigrasi() {
  return batalkanMigrasi_(false) + ' baris hasil migrasi dihapus.';
}

function batalkanMigrasi_(diam) {
  var sh = tab_(TAB.TRANSAKSI);
  var baris = baca_(TAB.TRANSAKSI);
  var n = 0;
  for (var i = baris.length - 1; i >= 0; i--) {
    if (String(baris[i].sumber) === 'migrasi') { sh.deleteRow(baris[i]._baris); n++; }
  }
  var shs = tab_(TAB.SAVING);
  var bs = baca_(TAB.SAVING);
  for (var j = bs.length - 1; j >= 0; j--) {
    if (String(bs[j].id).indexOf('migsvg-') === 0) { shs.deleteRow(bs[j]._baris); n++; }
  }
  if (!diam) bangunRingkasan_();
  return n;
}

/** `SAVING 2026` -> tab `Saving`. Tanggal serial spreadsheet dikonversi. */
function migrasiSaving_() {
  var sh = ss_().getSheetByName(TAB_SAVING_LAMA);
  if (!sh) return 0;
  var akhir = sh.getLastRow();
  if (akhir < 3) return 0;
  var nilai = sh.getRange(3, 1, akhir - 2, 5).getValues();
  var baru = [];
  nilai.forEach(function (b, i) {
    var tanggal = keTanggal_(b[0]);
    var debet = angka_(b[1]);
    var kredit = angka_(b[2]);
    if (!tanggal) return;
    if (!debet && !kredit) return;   // baris ekor yang cuma mengulang saldo
    baru.push({
      id: 'migsvg-' + (i + 1),
      tanggal: tanggal,
      debet: debet,
      kredit: kredit,
      saldo: 0,
      keterangan: String(b[4] || ''),
      status: 'aktif'
    });
  });
  tulisBanyak_(TAB.SAVING, baru);
  hitungUlangSaldoSaving_();
  return baru.length;
}

/** Usulkan pagu anggaran dari rata-rata belanja rumah tangga 6 bulan terakhir. */
function usulkanAnggaran(bulanTarget) {
  var bulan = bulanTarget || bulanDari_(new Date());
  var perKategori = {};
  var bulanTerpakai = {};
  baca_(TAB.TRANSAKSI).forEach(function (t) {
    if (String(t.status || 'aktif') === 'dihapus') return;
    if (String(t.jenis) !== JENIS.RUMAH_TANGGA) return;
    var b = bulanDari_(t.tanggal);
    if (!b || b >= bulan) return;
    if (selisihBulan_(b, bulan) > 6) return;
    bulanTerpakai[b] = true;
    var k = String(t.kategori || 'Lainnya');
    perKategori[k] = (perKategori[k] || 0) + angka_(t.nominal);
  });
  var jumlahBulan = Math.max(Object.keys(bulanTerpakai).length, 1);
  var usulan = Object.keys(perKategori).map(function (k) {
    // Dibulatkan ke 50.000 terdekat supaya angkanya enak dibaca.
    var rata = perKategori[k] / jumlahBulan;
    return { bulan: bulan, kategori: k, pagu: Math.round(rata / 50000) * 50000 };
  });
  simpanAnggaran_({ daftar: usulan });
  return usulan.length + ' pagu diusulkan untuk ' + bulan +
         ' (rata-rata ' + jumlahBulan + ' bulan terakhir).';
}
