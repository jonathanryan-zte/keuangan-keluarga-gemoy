// Mencatat banyak transaksi sekali jalan — untuk sepulang belanja, ketika satu
// kali keluar rumah menghasilkan enam sampai delapan catatan.
//
// Alurnya dua tahap dalam satu tampilan: tempel/ketik daftarnya, lalu perbaiki
// yang salah tebak langsung di kartunya. Tidak ada sheet di atas sheet —
// membuka dan menutup delapan kali persis yang mau dihindari di sini.
//
// Ada dua jalan masuk, dan keduanya setara. Kotak tempel di atas untuk yang
// sudah punya daftar; satu baris kosong yang selalu tersedia di bawah untuk
// yang mau langsung mengetik per kolom tanpa lewat kotak itu dulu.

import { h, roti, ikon, kosongkan } from '../ui.js';
import { rp, bacaNominal, hariIni, tanggalPanjang } from '../rupiah.js';
import { bacaBanyak, geserHari } from '../parser.js';
import { st, taruhTransaksi, umumkan, idTransaksi } from '../toko.js';
import { kirimTransaksi } from '../api.js';

const CONTOH = 'galon 56500\ntelur 2 rak 78rb\nbakso chukul 59rb kemarin';

/** Baris yang belum disentuh sama sekali. Bukan baris yang salah — cuma belum
 *  diisi — jadi ia tidak ikut dihitung, tidak ditandai merah, dan tidak ikut
 *  tersimpan. */
const barisKosong = (b) => !b.item.trim() && !b.nominal && !b.kategori;
const barisTerisi = (f) => f.baris.filter((b) => !barisKosong(b));

function baruKosong() {
  return {
    kunci: idTransaksi(), mentah: '', item: '', nominal: 0,
    kategori: '', sifat: 'KEINGINAN', tanggal: null
  };
}

/**
 * @param {object} f Keadaan form yang dibagi dengan mode satuan (jenis, tanggal).
 * @param {Function} gambar Menggambar ulang seluruh isi sheet.
 * @param {Function} tutupSheet
 * @param {HTMLElement} slotKaki Slot kaki milik sheet, di luar wadah gulir.
 */
export function formBanyak(f, gambar, tutupSheet, slotKaki) {
  // Daftar baris hidup di `f` supaya tidak hilang saat sheet digambar ulang —
  // mengganti tanggal atau jenis tidak boleh menghapus koreksi yang sudah
  // dikerjakan.
  if (!f.baris) f.baris = [];
  const daftarKategori = st.profil.kategori[f.jenis] || [];
  const pemasukan = f.jenis === 'PEMASUKAN';

  // --- kotak tempel --------------------------------------------------------
  const kotak = h('textarea', {
    rows: barisTerisi(f).length ? 3 : 6,   // mengecil setelah ada isinya
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
    // baris yang sudah dirapikan. Yang dibuang cuma baris kosong, supaya hasil
    // tempelan tidak menyelip di atasnya.
    f.baris = f.baris.filter((b) => !barisKosong(b));
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
  const kurang = () => barisTerisi(f).filter((b) => !b.nominal || !b.kategori).length;
  const jumlah = () => f.baris.reduce((a, b) => a + (b.nominal || 0), 0);

  const simpan = async () => {
    const terisi = barisTerisi(f);
    if (!terisi.length) { roti('Belum ada yang mau dicatat.', 'salah'); return; }
    if (kurang()) { roti(`${kurang()} baris belum lengkap.`, 'salah'); return; }

    const daftar = terisi.map((b) => ({
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
  const wadahBaris = h('div', { gaya: { display: 'grid', gap: '8px', marginBottom: '14px' } });
  const daftarKartu = [];

  const pasangKartu = (b) => {
    const k = kartuBaris(b, f, daftarKategori, pemasukan, buangBaris, segarkan);
    daftarKartu.push(k);
    wadahBaris.appendChild(k.el);
  };

  // Selalu sisakan satu baris kosong paling bawah. Itu yang membuat form ini
  // bisa dimulai langsung dari kolom, tanpa harus lewat kotak tempel dulu:
  // begitu baris terbawah mulai diisi, satu baris kosong baru menyusul di
  // bawahnya. Kartunya ditambahkan, bukan digambar ulang, supaya kolom yang
  // sedang diketik tidak ikut terbuang.
  const jagaBarisKosong = () => {
    const terakhir = f.baris[f.baris.length - 1];
    if (terakhir && barisKosong(terakhir)) return;
    const b = baruKosong();
    f.baris.push(b);
    pasangKartu(b);
  };

  const segarkan = () => {
    jagaBarisKosong();
    daftarKartu.forEach((k) => k.perbarui());
    isiKaki(kaki, barisTerisi(f).length, kurang(), jumlah(), simpan);
  };

  const buangBaris = (b) => {
    const i = f.baris.indexOf(b);
    if (i < 0) return;
    f.baris.splice(i, 1);
    daftarKartu.splice(i, 1)[0].el.remove();
    segarkan();
  };

  f.baris.forEach(pasangKartu);
  segarkan();
  slotKaki.appendChild(kaki);

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

    wadahBaris
  );
}

/** Ringkasan + tombol simpan. Isinya diganti di tempat tiap ada koreksi.
 *  `n` adalah jumlah baris yang sudah terisi — baris kosong paling bawah tidak
 *  ikut, jadi form yang baru dibuka berbunyi "0 catatan", bukan "1". */
function isiKaki(kaki, n, kurang, jumlah, simpan) {
  kosongkan(kaki);
  kaki.append(
    h('div.kaki-jumlah',
      h('span.mini.samar', `${n} catatan`),
      h('span.angka.tebal', rp(jumlah))
    ),
    h('button.tombol.utama.lebar', {
      type: 'button', onclick: simpan,
      disabled: !n || kurang > 0
    }, n ? `Catat ${n} transaksi` : 'Catat')
  );
  if (kurang) {
    kaki.appendChild(h('p.mini.perlu-teks',
      { gaya: { marginTop: '7px', textAlign: 'center' } },
      `${kurang} baris belum lengkap`));
  }
}

/** @returns {{el: HTMLElement, perbarui: Function}} */
function kartuBaris(b, f, daftarKategori, pemasukan, buangBaris, segarkan) {
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
    type: 'button', onclick: () => buangBaris(b)
  }, '×');

  const pesanKurang = h('p.mini.perlu-teks');
  const el = h('div.baris-catat',
    h('div.baris-atas',
      h('input', {
        type: 'text', value: b.item, autocapitalize: 'words',
        placeholder: 'Untuk apa', 'aria-label': 'Nama transaksi',
        // segarkan() aman dipanggil tiap ketukan: ia cuma menyentuh atribut dan
        // kelas, dan paling banter menambahkan satu kartu kosong di bawah —
        // tidak ada elemen yang diganti, jadi papan ketik tetap terbuka.
        oninput: (e) => { b.item = e.target.value; segarkan(); },
        onblur: () => segarkan()
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
            onclick: (e) => { b.tanggal = null; e.target.remove(); segarkan(); }
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

    // Baris yang belum disentuh bukan baris yang salah — ia ajakan mengisi,
    // jadi tidak ditandai merah dan tombol hapusnya disembunyikan.
    const kosong = barisKosong(b);
    tombolBuang.hidden = kosong;
    // Baris yang sedang diisi juga belum pantas dicap merah: mengetik satu
    // huruf nama seharusnya tidak langsung dibalas "Nominal belum diisi".
    // Tandanya menyusul begitu jari pindah dari baris ini. Hitungan di kaki
    // tetap jalan dari data, jadi tombol Catat tetap terkunci sampai lengkap.
    const tandai = !kosong && !el.contains(document.activeElement);
    const kurangNominal = tandai && !b.nominal;
    const kurangKategori = tandai && !b.kategori;
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
