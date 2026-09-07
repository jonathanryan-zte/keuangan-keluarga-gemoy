import { h, kosongkan } from '../ui.js';
import { rpSingkat, namaBulan } from '../rupiah.js';
import { st, daftarTarget, setoranTarget, kelompokKategori } from '../toko.js';
import { urutMendesak } from '../target.js';
import { bukaTambah } from './tambah.js';
import { barisTransaksi } from './riwayat.js';

export function target() {
  const wadah = h('div.papan.dua');
  const gambar = () => { kosongkan(wadah); isi(wadah, gambar); };
  gambar();
  return wadah;
}

function isi(wadah, gambar) {
  const semua = urutMendesak(daftarTarget());
  const berjalan = semua.filter((t) => t.tahap !== 'berikutnya' && t.tahap !== 'selesai');
  const nanti = semua.filter((t) => t.tahap === 'berikutnya' || t.tahap === 'selesai');
  const setoran = setoranTarget();

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', `Target ${namaBulan(st.bulan)}`)),
      h('p.mini.samar', { gaya: { marginBottom: '12px' } },
        'Angka dan periodenya dibaca dari tab TARGET di Google Sheet. Ubah di sana kalau ' +
        'targetnya berubah — aplikasi tidak pernah menulis ke tab itu.'),
      berjalan.length
        ? berjalan.map((t) => barisTarget(t))
        : h('p.kosong', 'Tab TARGET belum memuat satu pun target rupiah.')
    ),
    nanti.length
      ? h('div.kaca.kartu',
          h('div.kepala-kartu', h('h2', 'Belum berjalan')),
          h('p.mini.samar', { gaya: { marginBottom: '12px' } },
            'Tahap yang baru mulai setelah tahap sebelumnya selesai.'),
          nanti.map((t) => barisTarget(t))
        )
      : null
  ));

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Setoran terakhir')),
      setoran.length
        ? h('div.daftar', setoran.map((t) => barisTransaksi(t, gambar)))
        : h('p.kosong',
            'Belum ada satu pun setoran ke target. Ketuk "Setor ke target ini" pada ' +
            'salah satu target — formnya terbuka dengan jenis dan kategorinya sudah terisi.')
    )
  ));
}

/**
 * Satu target, memakai kelas `.pagu` yang sama dengan pagu kategori di layar
 * Anggaran. Yang berbeda cuma isi keterangannya, dan itu memang harus berbeda:
 * "sisa Rp2 juta" berarti lain untuk cicilan KPR, tabungan renovasi, dan saldo
 * utang yang justru harus habis.
 */
function barisTarget(t) {
  const diam = t.tahap === 'berikutnya' || t.tahap === 'selesai';
  return h('div.pagu', { kelas: diam ? 'arsip' : '' },
    h('div.atas',
      h('span.nama', t.nama),
      h('span.lencana', { kelas: diam ? 'netral' : 'tosca' }, lencanaTarget(t)),
      h('span.rp.angka', rpSingkat(t.jenis === 'cicilan' ? t.komitmen : t.nilai))
    ),
    // Di layar ini batang penuh selalu kabar baik — target tercapai, cicilan
    // terbayar, utang lunas. Jadi tidak ada tingkat `hampir` atau `jebol`.
    h('div.jalur', h('div.isi.aman', { gaya: { width: `${t.persen}%` } })),
    h('div.ket',
      h('span', kiriTarget(t)),
      h('span.kanan', kananTarget(t))
    ),
    // Tahap yang belum berjalan tidak diberi tombol: membayar di muka angsuran
    // KPR tahap 2 sementara tahap 1 masih jalan bukan tindakan yang masuk akal,
    // dan tombolnya cuma akan mengundang salah catat.
    !t.kategori
      ? h('p.mini.samar', { gaya: { marginTop: '8px' } },
          'Belum ada kategori yang dipetakan ke target ini, jadi setorannya tidak bisa dilacak.')
      : diam ? null
      : h('div.aksi-target',
          h('button.tombol.hantu', { onclick: () => setor(t) }, 'Setor ke target ini'),
          h('span.kat.mini.samar', t.kategori)
        )
  );
}

export function lencanaTarget(t) {
  if (t.jenis === 'cicilan') return 'cicilan';
  if (t.jenis === 'utang') return 'utang';
  if (t.jenis === 'tahunan') return t.tahun;
  if (t.jenis === 'bulanan') return 'bulanan';
  return 'total';
}

/**
 * Sisi kiri keterangan: di mana posisinya sekarang. Diekspor karena kartu
 * ringkas di Beranda memakai kalimat yang sama persis — dua tempat yang
 * memajang target yang sama tidak boleh menamainya dengan dua cara. Kalimatnya beda per jenis
 * karena artinya memang beda — "terkumpul Rp38 juta" itu kabar baik untuk
 * renovasi dan kabar yang sama sekali lain untuk saldo utang.
 */
export function kiriTarget(t) {
  switch (t.jenis) {
    case 'cicilan':
      if (t.tahap === 'selesai') return `Lunas — ${t.tenor} angsuran`;
      if (t.tahap === 'berikutnya') return 'Mulai setelah tahap sebelumnya selesai';
      return `Angsuran ke-${t.angsuranKe} dari ${t.tenor} · ${rpSingkat(t.nilai)}/bulan`;
    case 'utang':
      return `Sudah dilunasi ${rpSingkat(t.terkumpul)} dari ${rpSingkat(t.nilai)}`;
    case 'bulanan':
      return `Terkumpul ${rpSingkat(t.terkumpul)} bulan ini`;
    case 'tahunan':
      return `Terkumpul ${rpSingkat(t.terkumpul)} sepanjang ${t.tahun}`;
    default:
      return `Terkumpul ${rpSingkat(t.terkumpul)}`;
  }
}

/** Sisi kanan: berapa lagi, atau kapan. */
export function kananTarget(t) {
  switch (t.jenis) {
    case 'cicilan':
      if (t.tahap === 'selesai') return '';
      if (t.tahap === 'berikutnya') return `${t.tenor} bulan · ${rpSingkat(t.komitmen)}`;
      return t.sisa > 0 ? 'Belum dibayar bulan ini' : `Sisa ${t.sisaAngsuran} angsuran`;
    case 'utang':
      return t.sisa > 0 ? `Sisa utang ${rpSingkat(t.sisa)}` : 'Lunas';
    case 'bulanan':
      return t.sisa > 0 ? `Kurang ${rpSingkat(t.sisa)}` : 'Tercapai';
    case 'tahunan':
      if (t.sisa <= 0) return 'Tercapai';
      return `${rpSingkat(t.perluPerBulan)}/bulan sampai Desember`;
    default:
      if (t.sisa <= 0) return 'Tercapai';
      // Tanpa tenggat di sheet, satu-satunya perkiraan yang jujur adalah
      // "kalau lajunya bertahan" — dan kalau belum pernah ada setoran, tidak
      // ada laju yang bisa dipakai. Itu ditulis apa adanya.
      return t.lunasPada && t.lunasPada !== 'lunas'
        ? `Selesai ${namaBulan(t.lunasPada)} pada laju ini`
        : 'Belum pernah ada setoran';
  }
}

/**
 * Membuka form catat dengan Jenis, Kelompok, dan Kategori sudah terisi. Inilah
 * yang selama ini hilang: setoran ke target menuntut tiga pilihan berturut-turut
 * yang harus tepat, dan kategorinya pun tidak ada di dropdown sheet. Akibatnya
 * dalam sembilan bulan tidak pernah ada satu pun setoran tercatat.
 */
function setor(t) {
  const prasetel = { jenis: 'Alokasi Tujuan', kategori: t.kategori, keterangan: t.nama };
  // `KKG Kategori` menyimpan saran pos untuk empat kategori target. `KPR`
  // datang dari `PILIHAN` dan tidak punya saran, jadi kuncinya sengaja tidak
  // dipasang sama sekali — memasangnya sebagai undefined justru akan menimpa
  // bawaan form dengan kekosongan.
  const pos = kelompokKategori(t.kategori);
  if (pos) prasetel.kelompok = pos;
  bukaTambah(null, { prasetel });
}
