/**
 * Membangun ulang tab `KKG Ringkasan` — satu baris per bulan.
 *
 * Rumusnya sengaja meniru `REKAP BULANAN` persis, kolom demi kolom:
 *
 *   pemasukan    = jumlah nominal ber-Jenis 'Pemasukan'
 *   empat pos    = jumlah nominal per Kelompok
 *   total keluar = jumlah keempat pos
 *   sisa         = pemasukan - total keluar
 *
 * Yang berkelompok `Transfer / Tidak dihitung` tidak pernah ikut — dan justru
 * kelompok itulah yang dipakai baris pemasukan, sehingga uang masuk tidak
 * pernah terhitung dua kali.
 *
 * Bedanya dengan REKAP BULANAN cuma satu: tab ini juga melihat transaksi yang
 * dicatat dari HP dan masih tinggal di `KKG Transaksi`. Selama `tab_tulis`
 * belum dibalik ke INPUT TRANSAKSI, angka di sini bisa lebih besar daripada
 * angka di REKAP BULANAN — dan selisihnya persis isi tab `KKG Transaksi`.
 */

function bangunRingkasan_() {
  var perBulan = {};
  semuaTransaksi_().forEach(function (t) {
    var bulan = t.bulan;
    if (!bulan) return;
    if (!perBulan[bulan]) {
      perBulan[bulan] = { bulan: bulan, pemasukan: 0, pos: {}, jumlah: 0 };
      POS.forEach(function (k) { perBulan[bulan].pos[k] = 0; });
    }
    var b = perBulan[bulan];
    b.jumlah++;
    if (t.jenis === JENIS.PEMASUKAN) b.pemasukan += t.nominal;
    if (b.pos[t.kelompok] !== undefined) b.pos[t.kelompok] += t.nominal;
  });

  var matriks = Object.keys(perBulan).sort().map(function (bl) {
    var b = perBulan[bl];
    var keluar = 0;
    POS.forEach(function (k) { keluar += b.pos[k]; });
    return [
      b.bulan,
      bulat_(b.pemasukan),
      bulat_(b.pos[KELOMPOK.SAVING]),
      bulat_(b.pos[KELOMPOK.HARIAN]),
      bulat_(b.pos[KELOMPOK.SOSIAL]),
      bulat_(b.pos[KELOMPOK.LUAR]),
      bulat_(keluar),
      bulat_(b.pemasukan - keluar),
      b.jumlah
    ];
  });

  var sh = tab_(TAB.RINGKASAN);
  var lebar = HEADER[TAB.RINGKASAN].length;
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, lebar).clearContent();
  }
  if (matriks.length) {
    sh.getRange(2, 1, matriks.length, lebar).setValues(matriks);
    sh.getRange(2, 2, matriks.length, 7).setNumberFormat('#,##0');
  }
  return matriks.length;
}

function bulat_(n) {
  return Math.round(n * 100) / 100;
}

/** Bisa dipanggil manual dari editor kalau ada yang diedit langsung di Sheet. */
function segarkanRingkasan() {
  var n = bangunRingkasan_();
  return 'Ringkasan diperbarui: ' + n + ' bulan.';
}
