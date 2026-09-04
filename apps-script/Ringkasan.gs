/**
 * Membangun ulang tab `Ringkasan` dari tab `Transaksi`.
 *
 * Tab ini pengganti tampilan `Monthly 26` yang lama: satu baris per bulan,
 * memakai rumus keluarga yang sama (10% perpuluhan / 30% saving / 20%
 * entertain dari basis penghasilan, dan Sisa = pemasukan - tetap - rumah
 * tangga). Bedanya sekarang terisi sendiri.
 */

function bangunRingkasan_() {
  var p = pengaturan_();
  var persen = {
    perpuluhan: angka_(p.persen_perpuluhan || 10) / 100,
    saving: angka_(p.persen_saving || 30) / 100,
    entertain: angka_(p.persen_entertain || 20) / 100
  };
  var basisKategori = {};
  String(p.basis_persen_kategori || PENGATURAN_BAWAAN.basis_persen_kategori).split(',').forEach(function (s) {
    var k = s.trim();
    if (k) basisKategori[k] = true;
  });

  var perBulan = {};
  baca_(TAB.TRANSAKSI).forEach(function (t) {
    if (String(t.status || 'aktif') === 'dihapus') return;
    var bulan = bulanDari_(t.tanggal);
    if (!bulan) return;
    if (!perBulan[bulan]) {
      perBulan[bulan] = {
        bulan: bulan, pemasukan: 0, tetap: 0, rumah_tangga: 0,
        basis_penghasilan: 0, jumlah_transaksi: 0
      };
    }
    var b = perBulan[bulan];
    var n = angka_(t.nominal);
    b.jumlah_transaksi++;
    var jenis = String(t.jenis);
    if (jenis === JENIS.PEMASUKAN) {
      b.pemasukan += n;
      if (basisKategori[String(t.kategori)]) b.basis_penghasilan += n;
    } else if (jenis === JENIS.TETAP) {
      b.tetap += n;
    } else {
      b.rumah_tangga += n;
    }
  });

  var bulanUrut = Object.keys(perBulan).sort();
  var matriks = bulanUrut.map(function (bl) {
    var b = perBulan[bl];
    return [
      b.bulan,
      bulat_(b.pemasukan),
      bulat_(b.tetap),
      bulat_(b.rumah_tangga),
      bulat_(b.pemasukan - b.tetap - b.rumah_tangga),
      bulat_(b.basis_penghasilan),
      bulat_(b.basis_penghasilan * persen.perpuluhan),
      bulat_(b.basis_penghasilan * persen.saving),
      bulat_(b.basis_penghasilan * persen.entertain),
      b.jumlah_transaksi
    ];
  });

  var sh = tab_(TAB.RINGKASAN);
  var lebar = HEADER.Ringkasan.length;
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, lebar).clearContent();
  }
  if (matriks.length) {
    sh.getRange(2, 1, matriks.length, lebar).setValues(matriks);
    sh.getRange(2, 2, matriks.length, 8).setNumberFormat('#,##0');
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
