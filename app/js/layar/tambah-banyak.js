// Mencatat banyak transaksi sekali jalan — untuk sepulang belanja, ketika satu
// kali keluar rumah menghasilkan enam sampai delapan catatan.
//
// Alurnya dua tahap dalam satu tampilan: tempel/ketik daftarnya, lalu perbaiki
// yang salah tebak langsung di kartunya. Tidak ada sheet di atas sheet —
// membuka dan menutup delapan kali persis yang mau dihindari di sini.

import { h, roti, ikon } from '../ui.js';
import { rp, bacaNominal, hariIni, tanggalPanjang } from '../rupiah.js';
import { bacaBanyak, geserHari } from '../parser.js';
import { st, taruhTransaksi, umumkan, idTransaksi } from '../toko.js';
import { kirimTransaksi } from '../api.js';

const CONTOH = 'galon 56500\ntelur 2 rak 78rb\nbakso chukul 59rb kemarin';

/**
 * @param {object} f Keadaan form yang dibagi dengan mode satuan (jenis, tanggal).
 * @param {Function} gambar Menggambar ulang seluruh isi sheet.
 * @param {Function} tutupSheet
 */
export function formBanyak(f, gambar, tutupSheet) {
  // Daftar baris hidup di `f` supaya tidak hilang saat sheet digambar ulang —
  // mengganti tanggal atau jenis tidak boleh menghapus koreksi yang sudah
  // dikerjakan.
  if (!f.baris) f.baris = [];
  const daftarKategori = st.profil.kategori[f.jenis] || [];
  const pemasukan = f.jenis === 'PEMASUKAN';

  // --- kotak tempel --------------------------------------------------------
  const kotak = h('textarea', {
    rows: f.baris.length ? 3 : 6,
    placeholder: CONTOH,
    'aria-label': 'Daftar transaksi, satu per baris'
  });

  const bacaKotak = () => {
    const hasil = bacaBanyak(kotak.value, { riwayat: st.transaksi, bulanAktif: st.bulan });
    if (!hasil.length) {
      roti('Belum ada yang bisa dibaca. Tulis satu transaksi per baris.', 'salah');
      return;
    }
    // Ditambahkan, bukan ditimpa: "Tambah baris lagi" tidak boleh membuang
    // baris yang sudah dirapikan.
    for (const p of hasil) {
      f.baris.push({
        kunci: idTransaksi(),
        mentah: p.mentah,
        item: p.item || p.mentah,
        nominal: p.nominal || 0,
        kategori: daftarKategori.includes(p.kategori) ? p.kategori : '',
        sifat: 'WAJIB',
        tanggal: p.pastiTanggal ? p.tanggal : null   // null = ikut tanggal bersama
      });
    }
    kotak.value = '';
    gambar();
  };

  // Ctrl/Cmd+Enter membaca; Enter biasa tetap membuat baris baru.
  kotak.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); bacaKotak(); }
  });

  // --- hitungan ------------------------------------------------------------
  const kurang = f.baris.filter((b) => !b.nominal || !b.kategori).length;
  const jumlah = f.baris.reduce((a, b) => a + (b.nominal || 0), 0);

  const simpan = async () => {
    if (!f.baris.length) { roti('Belum ada yang mau dicatat.', 'salah'); return; }
    if (kurang) { roti(`${kurang} baris belum lengkap.`, 'salah'); return; }

    const daftar = f.baris.map((b) => ({
      id: idTransaksi(),
      tanggal: b.tanggal || f.tanggal,
      bulan: (b.tanggal || f.tanggal).slice(0, 7),
      jenis: f.jenis,
      kategori: b.kategori,
      item: b.item.trim(),
      nominal: b.nominal,
      sifat: pemasukan ? '' : b.sifat,
      catatan: '',
      sumber: 'aplikasi'
    }));

    // Tampilkan dulu, kirim belakangan — sama seperti mode satuan, karena di
    // parkiran atau depan kasir sinyalnya sering hilang.
    daftar.forEach(taruhTransaksi);
    umumkan();
    tutupSheet();

    const n = daftar.length;
    const hasil = await kirimTransaksi(daftar);
    roti(hasil?.tertunda
      ? `${n} catatan tersimpan di HP, dikirim saat online`
      : `${n} catatan tersimpan di Google Sheet`);
    umumkan();
  };

  return h('div',
    h('div.isian',
      h('label', 'Tempel daftarnya — satu transaksi per baris'),
      h('div', { gaya: { display: 'flex', gap: '8px', alignItems: 'flex-start' } },
        kotak,
        h('button.tombol.tosca', {
          type: 'button', onclick: bacaKotak, 'aria-label': 'Baca daftar'
        }, ikon('kilat', 18))
      ),
      h('span.bantuan',
        f.baris.length
          ? 'Baris baru akan ditambahkan ke bawah, yang sudah ada tidak hilang.'
          : 'Nominal, tanggal, dan kategori diisikan otomatis per baris. Bisa juga dari daftar belanja di WhatsApp atau Catatan.')
    ),

    h('div.chip-baris', { gaya: { marginBottom: '12px' } }, [
      ['RUMAH_TANGGA', 'Rumah tangga'], ['TETAP', 'Tagihan tetap'], ['PEMASUKAN', 'Pemasukan']
    ].map(([nilai, label]) =>
      h('button.chip', {
        type: 'button', kelas: f.jenis === nilai ? 'aktif' : '',
        'aria-pressed': String(f.jenis === nilai),
        onclick: () => {
          f.jenis = nilai;
          // Kategori yang tidak ada di jenis baru dikosongkan, bukan dibiarkan
          // menunjuk daftar yang salah.
          const sah = st.profil.kategori[nilai] || [];
          f.baris.forEach((b) => { if (!sah.includes(b.kategori)) b.kategori = ''; });
          gambar();
        }
      }, label)
    )),

    h('div.isian',
      h('label', 'Tanggal untuk semua baris'),
      h('div.chip-baris', { gaya: { marginBottom: '7px' } },
        [['Hari ini', hariIni()], ['Kemarin', geserHari(hariIni(), -1)]].map(([label, nilai]) =>
          h('button.chip', {
            type: 'button', kelas: f.tanggal === nilai ? 'aktif' : '',
            onclick: () => { f.tanggal = nilai; gambar(); }
          }, label))
      ),
      h('input', {
        type: 'date', value: f.tanggal,
        onchange: (e) => { f.tanggal = e.target.value; gambar(); }
      }),
      h('span.bantuan', tanggalPanjang(f.tanggal))
    ),

    f.baris.length
      ? h('div', { gaya: { display: 'grid', gap: '8px', marginBottom: '14px' } },
          f.baris.map((b) => kartuBaris(b, f, daftarKategori, pemasukan, gambar)))
      : h('p.kosong', { gaya: { marginBottom: '14px' } },
          'Belum ada baris. Tulis daftarnya di atas, lalu tekan tombol kilat.'),

    h('div.kaki-catat',
      h('div.kaki-jumlah',
        h('span.mini.samar', `${f.baris.length} catatan`),
        h('span.angka.tebal', rp(jumlah))
      ),
      h('button.tombol.utama.lebar', {
        type: 'button', onclick: simpan,
        disabled: !f.baris.length || kurang > 0
      }, f.baris.length ? `Catat ${f.baris.length} transaksi` : 'Catat'),
      kurang
        ? h('p.mini.perlu-teks', { gaya: { marginTop: '7px', textAlign: 'center' } },
            `${kurang} baris belum lengkap`)
        : null
    )
  );
}

function kartuBaris(b, f, daftarKategori, pemasukan, gambar) {
  const kurangNominal = !b.nominal;
  const kurangKategori = !b.kategori;

  const kotakNominal = h('input.angka', {
    type: 'text', inputmode: 'decimal',
    value: b.nominal ? rp(b.nominal) : '',
    placeholder: 'Rp0',
    'aria-label': `Nominal ${b.item}`,
    // Dibaca saat selesai mengetik, bukan tiap ketukan — supaya "56rb" sempat
    // ditulis utuh sebelum ditafsirkan.
    onblur: (e) => {
      const n = bacaNominal(e.target.value);
      b.nominal = n === null ? 0 : Math.max(0, Math.min(n, 9_999_999_999));
      gambar();
    }
  });
  kotakNominal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  return h('div.baris-catat', { kelas: (kurangNominal || kurangKategori) ? 'perlu' : '' },
    h('div.baris-atas',
      h('input', {
        type: 'text', value: b.item, autocapitalize: 'words',
        placeholder: 'Untuk apa', 'aria-label': 'Nama transaksi',
        oninput: (e) => { b.item = e.target.value; }
      }),
      kotakNominal,
      h('button.buang', {
        type: 'button', 'aria-label': `Hapus baris ${b.item}`,
        onclick: () => { f.baris = f.baris.filter((x) => x !== b); gambar(); }
      }, '×')
    ),
    h('div.baris-bawah',
      pilihKategori(b, daftarKategori, gambar),
      pemasukan ? null : h('div.sifat-mini', { role: 'radiogroup', 'aria-label': `Sifat ${b.item}` },
        ['WAJIB', 'KEINGINAN'].map((nilai) =>
          h('button', {
            type: 'button', 'data-nilai': nilai, role: 'radio',
            'aria-checked': String(b.sifat === nilai),
            kelas: b.sifat === nilai ? 'aktif' : '',
            onclick: () => { b.sifat = nilai; gambar(); }
          }, nilai === 'WAJIB' ? 'Wajib' : 'Keinginan')
        )
      ),
      // Tanggal hanya ditulis kalau memang beda dari tanggal bersama, supaya
      // delapan lencana tanggal yang sama tidak jadi derau.
      b.tanggal && b.tanggal !== f.tanggal
        ? h('button.tanggal-beda', {
            type: 'button', 'aria-label': `Samakan tanggal ${b.item} dengan yang lain`,
            onclick: () => { b.tanggal = null; gambar(); }
          }, tanggalPanjang(b.tanggal).replace(/^\w+, /, ''))
        : null
    ),
    (kurangNominal || kurangKategori)
      ? h('p.mini.perlu-teks',
          kurangNominal && kurangKategori ? 'Nominal dan kategori belum diisi'
            : kurangNominal ? 'Nominal belum diisi' : 'Kategori belum dipilih')
      : null
  );
}

/** Nilai dipasang setelah semua <option> masuk — kalau disetel lebih dulu,
 *  browser mengembalikannya ke pilihan pertama saat option ditambahkan. */
function pilihKategori(b, daftarKategori, gambar) {
  const el = h('select', {
    'aria-label': `Kategori ${b.item}`,
    onchange: (e) => { b.kategori = e.target.value; gambar(); }
  },
    h('option', { value: '' }, 'Pilih kategori…'),
    daftarKategori.map((k) => h('option', { value: k }, k))
  );
  el.value = b.kategori || '';
  return el;
}
