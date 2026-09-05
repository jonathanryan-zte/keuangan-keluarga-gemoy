import { h, sheet, roti, ikon, kosongkan } from '../ui.js';
import { rp, bacaNominal, hariIni, tanggalPanjang } from '../rupiah.js';
import { baca as bacaTeks, tebakKategori, geserHari } from '../parser.js';
import {
  st, taruhTransaksi, umumkan, itemSering, idTransaksi,
  kategoriAktif, kategoriDisisihkan, kategoriDikenal, pilihanKategori
} from '../toko.js';
import { kirimTransaksi } from '../api.js';
import { lokal } from '../simpanan.js';
import { formBanyak } from './tambah-banyak.js';

const JENIS = [
  ['RUMAH_TANGGA', 'Rumah tangga'],
  ['TETAP', 'Tagihan tetap'],
  ['PEMASUKAN', 'Pemasukan']
];

const KUNCI_MODE = 'mode_tambah';

/**
 * @param {object|null} awal Transaksi yang mau diubah, atau null untuk baru.
 * @param {{mode?: string, baris?: Array}} opsi Pembuka dari layar lain. Daftar
 *   Belanja memakainya untuk membuka mode banyak dengan barang yang tadi
 *   dicentang sudah terisi sebagai baris — tinggal isi harganya.
 */
export function bukaTambah(awal = null, opsi = {}) {
  const f = {
    id: awal?.id || null,
    // Mengubah satu catatan tidak punya mode borongan — sakelarnya hanya
    // muncul saat mencatat baru.
    mode: awal ? 'satu' : (opsi.mode || lokal.ambil(KUNCI_MODE, 'satu')),
    baris: opsi.baris || null,
    jenis: awal?.jenis || 'RUMAH_TANGGA',
    nominal: awal?.nominal || 0,
    item: awal?.item || '',
    kategori: awal?.kategori || '',
    sifat: awal?.sifat || 'KEINGINAN',
    tanggal: awal?.tanggal || hariIni(),
    catatan: awal?.catatan || ''
  };

  const tutup = sheet(awal ? 'Ubah catatan' : 'Catat transaksi', (tutupSheet, badan) => {
    const wadah = h('div');
    // Slot kaki milik sheet, di luar wadah gulir — mode banyak menaruh tombol
    // "Catat N transaksi" di sana supaya selalu terlihat dan tetap selebar panel.
    const slotKaki = badan.querySelector('.kaki-sheet');
    const gambar = () => {
      kosongkan(wadah);
      kosongkan(slotKaki);
      if (!awal) wadah.appendChild(sakelarMode(f, gambar));
      wadah.appendChild(f.mode === 'banyak'
        ? formBanyak(f, gambar, tutupSheet, slotKaki)
        : isiForm(f, gambar, tutupSheet));
      // Aksen warna di seluruh sheet: kuning untuk mode banyak (sifatnya
      // beda-beda per baris, jadi tak ada satu warna sifat yang mewakili),
      // atau ikut sifat pengeluaran saat mode satu & bukan pemasukan.
      const aksen = f.mode === 'banyak' ? 'sheet-banyak'
        : f.jenis === 'PEMASUKAN' ? null
        : f.sifat === 'WAJIB' ? 'sheet-wajib' : 'sheet-keinginan';
      for (const kelas of ['sheet-wajib', 'sheet-keinginan', 'sheet-banyak']) {
        badan.classList.toggle(kelas, kelas === aksen);
      }
    };
    gambar();
    return wadah;
  });
  return tutup;
}

function sakelarMode(f, gambar) {
  return h('div.sakelar-mode', { role: 'radiogroup', 'aria-label': 'Jumlah catatan' },
    [['satu', 'Satu'], ['banyak', 'Banyak']].map(([nilai, label]) =>
      h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(f.mode === nilai),
        kelas: f.mode === nilai ? 'aktif' : '',
        onclick: () => {
          if (f.mode === nilai) return;
          f.mode = nilai;
          lokal.simpan(KUNCI_MODE, nilai);
          gambar();
        }
      }, label)
    )
  );
}

function isiForm(f, gambar, tutupSheet) {
  const pemasukan = f.jenis === 'PEMASUKAN';
  // Yang bisa dipilih = kategori aktif. Kategori transaksi yang sedang diubah
  // ikut ditampilkan walau sudah disisihkan, supaya mengedit belanja lama
  // tidak diam-diam mengosongkan kategorinya.
  const kategoriBaru = kategoriAktif(f.jenis);
  const daftarKategori = pilihanKategori(f.jenis, f.kategori);
  const arsip = new Set(kategoriDisisihkan(f.jenis));

  // --- ketik bebas ---------------------------------------------------------
  const kotakCepat = h('input', {
    type: 'text', inputmode: 'text', autocapitalize: 'sentences',
    placeholder: 'bakso chukul 59rb · galon 56500 kemarin',
    'aria-label': 'Ketik cepat'
  });
  const terapkanCepat = () => {
    const hasil = bacaTeks(kotakCepat.value, { riwayat: st.transaksi, bulanAktif: st.bulan });
    if (!hasil || (hasil.nominal === null && !hasil.item)) {
      roti('Belum kebaca. Coba sertakan nominalnya, misal "galon 56rb".', 'salah');
      return;
    }
    if (hasil.nominal !== null) f.nominal = hasil.nominal;
    if (hasil.item) f.item = hasil.item;
    if (hasil.pastiTanggal) f.tanggal = hasil.tanggal;
    if (hasil.kategori && kategoriBaru.includes(hasil.kategori)) f.kategori = hasil.kategori;
    kotakCepat.value = '';
    gambar();
  };
  kotakCepat.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); terapkanCepat(); }
  });

  // --- numpad --------------------------------------------------------------
  const layar = h('div.layar-nominal.angka', { kelas: f.nominal ? '' : 'kosong' },
    f.nominal ? rp(f.nominal) : 'Rp0');
  const setNominal = (n) => {
    f.nominal = Math.max(0, Math.min(n, 9_999_999_999));
    layar.textContent = f.nominal ? rp(f.nominal) : 'Rp0';
    layar.classList.toggle('kosong', !f.nominal);
  };
  const tekan = (d) => setNominal(Number(String(f.nominal) + d));
  const numpad = h('div.numpad',
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
      h('button', { type: 'button', onclick: () => tekan(d) }, d)),
    h('button.kecil', { type: 'button', onclick: () => setNominal(f.nominal * 1000) }, 'rb'),
    h('button', { type: 'button', onclick: () => tekan('0') }, '0'),
    h('button.kecil', {
      type: 'button', 'aria-label': 'Hapus satu angka',
      onclick: () => setNominal(Math.floor(f.nominal / 10))
    }, '⌫')
  );

  // --- saran item ----------------------------------------------------------
  const kotakItem = h('input', {
    type: 'text', value: f.item, autocapitalize: 'words',
    placeholder: pemasukan ? 'Gaji Pokok Thesa' : 'Belanja Bravo',
    oninput: (e) => {
      f.item = e.target.value;
      if (f.kategori) return;
      const tebak = tebakKategori(f.item, st.transaksi);
      if (!tebak || !kategoriBaru.includes(tebak)) return;
      f.kategori = tebak;
      // Cukup nyalakan chip-nya di tempat. Menggambar ulang seluruh form dari
      // dalam oninput membuang <input> yang sedang diketik, dan di HP papan
      // ketiknya ikut tertutup — persis begitu huruf pertama sudah cukup untuk
      // menebak kategorinya.
      tandaiKategori();
    }
  });
  const saran = itemSering(f.jenis, 8);

  // --- kategori ------------------------------------------------------------
  const chipKategori = h('div.chip-baris', daftarKategori.map((k) =>
    h('button.chip', {
      type: 'button', 'data-kategori': k,
      kelas: (f.kategori === k ? 'aktif' : '') + (arsip.has(k) ? ' arsip' : ''),
      title: arsip.has(k) ? 'Kategori ini sudah disisihkan di layar Anggaran' : null,
      'aria-pressed': String(f.kategori === k),
      onclick: () => { f.kategori = f.kategori === k ? '' : k; gambar(); }
    }, k)
  ));
  /** Menyelaraskan chip kategori dengan f.kategori tanpa membangun ulang DOM. */
  const tandaiKategori = () => {
    for (const chip of chipKategori.children) {
      const aktif = chip.dataset.kategori === f.kategori;
      chip.classList.toggle('aktif', aktif);
      chip.setAttribute('aria-pressed', String(aktif));
    }
  };

  // --- tanggal -------------------------------------------------------------
  const kotakTanggal = h('input', {
    type: 'date', value: f.tanggal, onchange: (e) => { f.tanggal = e.target.value; gambar(); }
  });

  const simpan = async () => {
    if (!f.nominal) { roti('Nominalnya belum diisi.', 'salah'); return; }
    if (!f.item.trim()) { roti('Nama transaksinya belum diisi.', 'salah'); return; }
    if (!f.kategori) { roti('Pilih dulu kategorinya.', 'salah'); return; }

    const t = {
      id: f.id || idTransaksi(),
      tanggal: f.tanggal,
      bulan: f.tanggal.slice(0, 7),
      jenis: f.jenis,
      kategori: f.kategori,
      item: f.item.trim(),
      nominal: f.nominal,
      sifat: pemasukan ? '' : f.sifat,
      catatan: f.catatan,
      sumber: 'aplikasi'
    };
    // Tampilkan dulu, kirim belakangan: di pasar atau kasir sinyalnya sering
    // hilang, dan menunggu server bikin orang ragu apakah tersimpan.
    taruhTransaksi(t);
    umumkan();
    tutupSheet();

    const hasil = await kirimTransaksi([t]);
    roti(hasil?.tertunda ? 'Tersimpan di HP, dikirim saat online' : 'Tersimpan di Google Sheet');
    umumkan();
  };

  return h('div',
    h('div.isian',
      h('label', { for: 'cepat' }, 'Ketik cepat'),
      h('div', { gaya: { display: 'flex', gap: '8px' } },
        kotakCepat,
        h('button.tombol.tosca', { type: 'button', onclick: terapkanCepat, 'aria-label': 'Baca ketikan' }, ikon('kilat', 18))
      ),
      h('span.bantuan', 'Nominal, tanggal, dan kategori diisikan otomatis. Bisa juga pakai dikte suara di papan ketik.')
    ),

    h('div.chip-baris', { gaya: { marginBottom: '14px' } }, JENIS.map(([nilai, label]) =>
      h('button.chip', {
        type: 'button', kelas: f.jenis === nilai ? 'aktif' : '',
        'aria-pressed': String(f.jenis === nilai),
        onclick: () => {
          f.jenis = nilai;
          if (!kategoriDikenal(nilai, f.kategori)) f.kategori = '';
          gambar();
        }
      }, label)
    )),

    layar, numpad,

    h('div.isian', { gaya: { marginTop: '16px' } },
      h('label', 'Untuk apa'), kotakItem,
      saran.length ? h('div.chip-baris', { gaya: { marginTop: '7px' } }, saran.map((s) =>
        h('button.chip', {
          type: 'button',
          onclick: () => {
            f.item = s.item;
            if (!f.kategori && kategoriBaru.includes(s.kategori)) f.kategori = s.kategori;
            gambar();
          }
        }, s.item)
      )) : null
    ),

    h('div.isian', h('label', 'Kategori'), chipKategori),

    pemasukan ? null : h('div.isian',
      h('label', 'Sifat pengeluaran'),
      // Keinginan lebih dulu (kiri) dan jadi bawaan: catatan sehari-hari jauh
      // lebih sering keinginan daripada wajib, jadi jempol tidak perlu pindah
      // untuk kasus yang paling sering.
      h('div.sakelar-sifat', { role: 'radiogroup', 'aria-label': 'Sifat pengeluaran' },
        ['KEINGINAN', 'WAJIB'].map((nilai) =>
          h('button', {
            type: 'button', 'data-nilai': nilai, role: 'radio',
            'aria-checked': String(f.sifat === nilai),
            kelas: f.sifat === nilai ? 'aktif' : '',
            onclick: () => { f.sifat = nilai; gambar(); }
          }, h('span.titik'), nilai === 'WAJIB' ? 'Wajib' : 'Keinginan')
        )
      )
    ),

    h('div.isian',
      h('label', 'Tanggal'),
      h('div.chip-baris', { gaya: { marginBottom: '7px' } },
        [['Hari ini', hariIni()], ['Kemarin', geserHari(hariIni(), -1)]].map(([label, nilai]) =>
          h('button.chip', {
            type: 'button', kelas: f.tanggal === nilai ? 'aktif' : '',
            onclick: () => { f.tanggal = nilai; gambar(); }
          }, label))
      ),
      kotakTanggal,
      h('span.bantuan', tanggalPanjang(f.tanggal))
    ),

    h('button.tombol.utama.lebar', { type: 'button', onclick: simpan, gaya: { marginTop: '6px' } },
      f.id ? 'Simpan perubahan' : 'Catat')
  );
}
