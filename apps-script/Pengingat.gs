/**
 * Pengingat pagi.
 *
 * Apps Script tidak bisa mengirim Web Push sendiri: protokolnya mewajibkan
 * tanda tangan VAPID dengan ECDSA P-256, dan Apps Script tidak punya ECDSA.
 * Jadi skrip ini hanya menyusun pesannya lalu menitipkannya ke sebuah
 * Cloudflare Worker kecil yang punya Web Crypto. Daftar perangkat ikut
 * dikirim, jadi Worker-nya tidak menyimpan data apa pun.
 *
 * Pasang pemicunya sekali: jalankan pasangPemicuHarian().
 */

var JAM_PENGINGAT = 6;      // waktu setempat spreadsheet
var HARI_SEBELUM_TEMPO = 3; // ingatkan H-3

function pasangPemicuHarian() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kirimPengingatHarian') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kirimPengingatHarian')
    .timeBased().atHour(JAM_PENGINGAT).everyDays(1).create();
  return 'Pemicu harian dipasang sekitar jam ' + JAM_PENGINGAT + ' pagi.';
}

function kirimPengingatHarian() {
  var pesan = susunPengingat_();
  if (!pesan) return 'Tidak ada yang perlu diingatkan hari ini.';
  return kirimKePerangkat_(pesan);
}

/** Bisa dipanggil manual dari editor untuk menguji tanpa menunggu besok pagi. */
function kirimPengingatSekarang_() {
  var pesan = susunPengingat_() || {
    judul: 'Uji coba KKG',
    badan: 'Kalau ini muncul di HP, pengingatnya sudah jalan.',
    layar: 'beranda'
  };
  return kirimKePerangkat_(pesan);
}

/**
 * Isi pengingat: tagihan yang jatuh tempo dalam 3 hari dan belum dicentang,
 * pagu kategori yang sudah lewat 80%, serta perpuluhan/saving yang belum
 * disetor setelah pemasukan bulan itu masuk.
 */
function susunPengingat_() {
  var zona = zona_();
  var hariIni = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  var bulan = hariIni.substring(0, 7);
  var batas = Utilities.formatDate(
    new Date(Date.now() + HARI_SEBELUM_TEMPO * 86400000), zona, 'yyyy-MM-dd');

  var baris = [];

  var tempo = statusRutinBulan_(bulan).filter(function (s) {
    return !s.terbayar && s.jatuhTempo <= batas;
  });
  tempo.forEach(function (s) {
    var telat = s.jatuhTempo < hariIni;
    baris.push((telat ? 'Lewat tempo: ' : 'Jatuh tempo ' + s.jatuhTempo.substring(8) + '/' +
      s.jatuhTempo.substring(5, 7) + ': ') + s.rutin.nama + ' ' + rupiah_(s.rutin.nominal));
  });

  hampirJebol_(bulan).forEach(function (a) {
    baris.push('Pagu ' + a.kategori + ' sudah ' + Math.round(a.persen) + '% terpakai');
  });

  if (!baris.length) return null;

  return {
    judul: baris.length === 1 ? 'Pengingat KKG' : baris.length + ' hal perlu dicek',
    badan: baris.slice(0, 4).join('\n') + (baris.length > 4 ? '\n…dan ' + (baris.length - 4) + ' lagi' : ''),
    layar: tempo.length ? 'rutin' : 'anggaran',
    tag: 'kkg-' + hariIni
  };
}

function hampirJebol_(bulan) {
  var pagu = {};
  baca_(TAB.ANGGARAN).forEach(function (a) {
    if (String(a.bulan) === bulan) pagu[String(a.kategori)] = angka_(a.pagu);
  });
  var pakai = {};
  baca_(TAB.TRANSAKSI).forEach(function (t) {
    if (String(t.status || 'aktif') === 'dihapus') return;
    if (String(t.jenis) !== JENIS.RUMAH_TANGGA) return;
    if (bulanDari_(t.tanggal) !== bulan) return;
    var k = String(t.kategori || 'Lainnya');
    pakai[k] = (pakai[k] || 0) + angka_(t.nominal);
  });
  return Object.keys(pagu).filter(function (k) {
    return pagu[k] > 0 && (pakai[k] || 0) / pagu[k] >= 0.8;
  }).map(function (k) {
    return { kategori: k, persen: ((pakai[k] || 0) / pagu[k]) * 100 };
  });
}

function rupiah_(n) {
  var s = String(Math.round(n));
  return 'Rp' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Titipkan pesan ke Worker, lalu bersihkan langganan yang sudah mati. */
function kirimKePerangkat_(pesan) {
  var p = pengaturan_();
  if (!p.worker_url) throw new Error('worker_url belum diisi di tab Pengaturan.');

  var perangkat = baca_(TAB.PERANGKAT).map(function (d) {
    return {
      id: String(d.id),
      endpoint: String(d.endpoint),
      keys: { p256dh: String(d.p256dh), auth: String(d.auth) }
    };
  });
  if (!perangkat.length) return 'Belum ada perangkat terdaftar.';

  var jawaban = UrlFetchApp.fetch(p.worker_url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      rahasia: p.worker_rahasia,
      langganan: perangkat,
      pesan: pesan
    }),
    muteHttpExceptions: true
  });

  var isi;
  try { isi = JSON.parse(jawaban.getContentText()); }
  catch (e) { throw new Error('Worker menjawab tidak wajar: ' + jawaban.getContentText().substring(0, 200)); }
  if (!isi.ok) throw new Error('Worker menolak: ' + (isi.pesan || jawaban.getResponseCode()));

  // Endpoint yang sudah dicabut browser dibuang supaya tabelnya tidak menumpuk
  // langganan mati yang bikin pengiriman berikutnya makin lambat.
  (isi.mati || []).forEach(function (id) { hapusPerangkat_({ id: id }); });

  return 'Terkirim ke ' + (isi.terkirim || 0) + ' perangkat, ' +
         (isi.mati || []).length + ' langganan mati dibersihkan.';
}
