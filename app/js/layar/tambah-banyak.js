// Mencatat banyak transaksi sekali jalan — untuk sepulang belanja, ketika satu
// kali keluar rumah menghasilkan enam sampai delapan catatan.
//
// Alurnya dua tahap dalam satu tampilan: tempel/ketik daftarnya, lalu perbaiki
// yang salah tebak langsung di kartunya. Tidak ada sheet di atas sheet —
// membuka dan menutup delapan kali persis yang mau dihindari di sini.

import { h, roti, ikon, kosongkan } from '../ui.js';
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
        sifat: 'KEINGINAN',   // bawaan, sama seperti mode satuan
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
  // Dihitung saat dipakai, bukan sekali di awal: sejak koreksi baris tidak lagi
  // menggambar ulang seluruh form, angka yang dibekukan di sini akan basi.
  const kurang = () => f.baris.filter((b) => !b.nominal || !b.kategori).length;
  const jumlah = () => f.baris.reduce((a, b) => a + (b.nominal || 0), 0);

  const simpan = async () => {
    if (!f.baris.length) { roti('Belum ada yang mau dicatat.', 'salah'); return; }
    if (kurang()) { roti(`${kurang()} baris belum lengkap.`, 'salah'); return; }

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

  // Kaki dan tanda "belum lengkap" per baris disegarkan di tempat. Dulu tiap
  // koreksi memanggil gambar(), yang membangun ulang seluruh form — termasuk
  // <input> yang barusan ditinggalkan. Di HP itu terasa sebagai papan ketik
  // yang menutup sendiri dan ketukan berikutnya yang tidak kena apa-apa,
  // karena elemen sasarannya sudah diganti sebelum jari sempat mendarat.
  const kaki = h('div.kaki-catat');
  const segarkan = () => {
    daftarKartu.forEach((k) => k.perbarui());
    isiKaki(kaki, f, kurang(), jumlah(), simpan);
  };
  const daftarKartu = f.baris.map((b) =>
    kartuBaris(b, f, daftarKategori, pemasukan, gambar, segarkan));
  isiKaki(kaki, f, kurang(), jumlah(), simpan);

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

    daftarKartu.length
      ? h('div', { gaya: { display: 'grid', gap: '8px', marginBottom: '14px' } },
          daftarKartu.map((k) => k.el))
      : h('p.kosong', { gaya: { marginBottom: '14px' } },
          'Belum ada baris. Tulis daftarnya di atas, lalu tekan tombol kilat.'),

    kaki
  );
}

/** Ringkasan + tombol simpan. Isinya diganti di tempat tiap ada koreksi. */
function isiKaki(kaki, f, kurang, jumlah, simpan) {
  kosongkan(kaki);
  kaki.append(
    h('div.kaki-jumlah',
      h('span.mini.samar', `${f.baris.length} catatan`),
      h('span.angka.tebal', rp(jumlah))
    ),
    h('button.tombol.utama.lebar', {
      type: 'button', onclick: simpan,
      disabled: !f.baris.length || kurang > 0
    }, f.baris.length ? `Catat ${f.baris.length} transaksi` : 'Catat')
  );
  if (kurang) {
    kaki.appendChild(h('p.mini.perlu-teks',
      { gaya: { marginTop: '7px', textAlign: 'center' } },
      `${kurang} baris belum lengkap`));
  }
}

/** @returns {{el: HTMLElement, perbarui: Function}} */
function kartuBaris(b, f, daftarKategori, pemasukan, gambar, segarkan) {
  const kotakNominal = h('input.angka', {
    type: 'text', inputmode: 'decimal',
    value: b.nominal ? rp(b.nominal) : '',
    placeholder: 'Rp0',
    // Dibaca saat selesai mengetik, bukan tiap ketukan — supaya "56rb" sempat
    // ditulis utuh sebelum ditafsirkan.
    onblur: (e) => {
      const n = bacaNominal(e.target.value);
      b.nominal = n === null ? 0 : Math.max(0, Math.min(n, 9_999_999_999));
      e.target.value = b.nominal ? rp(b.nominal) : '';
      segarkan();
    }
  });
  kotakNominal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  const sifatMini = pemasukan ? null
    : h('div.sifat-mini', { role: 'radiogroup' },
        // Urutan & bawaannya ikut mode satuan: Keinginan di kiri.
        ['KEINGINAN', 'WAJIB'].map((nilai) =>
          h('button', {
            type: 'button', 'data-nilai': nilai, role: 'radio',
            'aria-checked': String(b.sifat === nilai),
            kelas: b.sifat === nilai ? 'aktif' : '',
            onclick: () => {
              b.sifat = nilai;
              for (const t of sifatMini.children) {
                const aktif = t.dataset.nilai === b.sifat;
                t.classList.toggle('aktif', aktif);
                t.setAttribute('aria-checked', String(aktif));
              }
            }
          }, nilai === 'WAJIB' ? 'Wajib' : 'Keinginan')
        )
      );

  const pilihan = pilihKategori(b, daftarKategori, segarkan);
  const tombolBuang = h('button.buang', {
    type: 'button',
    onclick: () => { f.baris = f.baris.filter((x) => x !== b); gambar(); }
  }, '×');

  const pesanKurang = h('p.mini.perlu-teks');
  const el = h('div.baris-catat',
    h('div.baris-atas',
      h('input', {
        type: 'text', value: b.item, autocapitalize: 'words',
        placeholder: 'Untuk apa', 'aria-label': 'Nama transaksi',
        // perbarui() hanya menyentuh atribut dan kelas, tidak ada elemen yang
        // diganti — aman dipanggil tiap ketukan, papan ketik tetap terbuka.
        oninput: (e) => { b.item = e.target.value; perbarui(); }
      }),
      kotakNominal,
      tombolBuang
    ),
    h('div.baris-bawah',
      pilihan,
      sifatMini,
      // Tanggal hanya ditulis kalau memang beda dari tanggal bersama, supaya
      // delapan lencana tanggal yang sama tidak jadi derau.
      b.tanggal && b.tanggal !== f.tanggal
        ? h('button.tanggal-beda', {
            type: 'button', 'aria-label': `Samakan tanggal ${b.item} dengan yang lain`,
            onclick: () => { b.tanggal = null; gambar(); }
          }, tanggalPanjang(b.tanggal).replace(/^\w+, /, ''))
        : null
    ),
    pesanKurang
  );

  /** Menyelaraskan penanda "belum lengkap" dengan isi baris, tanpa menyentuh
   *  <input> mana pun — inilah yang membuat papan ketik tetap terbuka. */
  const perbarui = () => {
    // Label pembaca layar menyebut nama barisnya. Dulu ini ikut segar sendiri
    // karena tiap koreksi menggambar ulang; sekarang harus disetel di sini
    // supaya delapan kartu tidak semuanya berbunyi "Nominal" saja.
    const nama = b.item.trim() || 'baris ini';
    kotakNominal.setAttribute('aria-label', `Nominal ${nama}`);
    tombolBuang.setAttribute('aria-label', `Hapus ${nama}`);
    pilihan.setAttribute('aria-label', `Kategori ${nama}`);
    sifatMini?.setAttribute('aria-label', `Sifat ${nama}`);

    const kurangNominal = !b.nominal;
    const kurangKategori = !b.kategori;
    el.classList.toggle('perlu', kurangNominal || kurangKategori);
    pesanKurang.textContent = kurangNominal && kurangKategori
      ? 'Nominal dan kategori belum diisi'
      : kurangNominal ? 'Nominal belum diisi'
      : kurangKategori ? 'Kategori belum dipilih' : '';
    pesanKurang.hidden = !pesanKurang.textContent;
  };
  perbarui();

  return { el, perbarui };
}

/** Nilai dipasang setelah semua <option> masuk — kalau disetel lebih dulu,
 *  browser mengembalikannya ke pilihan pertama saat option ditambahkan. */
function pilihKategori(b, daftarKategori, segarkan) {
  const el = h('select', {
    onchange: (e) => { b.kategori = e.target.value; segarkan(); }
  },
    h('option', { value: '' }, 'Pilih kategori…'),
    daftarKategori.map((k) => h('option', { value: k }, k))
  );
  el.value = b.kategori || '';
  return el;
}
