// Daftar belanja: ceklist barang yang mau dibeli.
//
// Dua aturan yang membentuk seluruh layar ini:
//
// 1. Mencentang tidak menghapus apa pun. Barangnya cuma pindah status dan
//    dicap tanggal, jadi daftar kembali bersih tapi "kapan terakhir beli
//    beras" masih bisa dijawab. Sama seperti kategori yang disisihkan di
//    layar Anggaran — tidak ada tombol di sini yang menghilangkan data.
//
// 2. Mencentang tidak membuat transaksi. Uang keluar sekali di kasir, bukan
//    per barang. Kalau tiap centang jadi transaksi, harganya harus diketik
//    sambil berdiri di toko dan angkanya berkelahi dengan struk. Sebagai
//    gantinya ada jembatan ke form catat-banyak: nama barang yang tadi
//    dicentang datang sudah terisi, tinggal harganya.
//
// Nilai sebenarnya bukan ceklisnya, tapi kartu "Pernah dibeli": karena tiap
// barang disimpan sekali selamanya dan diurutkan dari yang paling lama tidak
// dibeli, daftar minggu depan dibuat dengan mengetuk, bukan mengetik.

import { h, roti, kosongkan, sheet, ikon, konfirmasi } from '../ui.js';
import { hariIni, berapaLama } from '../rupiah.js';
import {
  st, belanjaAktif, belanjaDiingat, belanjaDisisihkan, cariBelanja,
  taruhBelanja, idBelanja, umumkan
} from '../toko.js';
import { kirimAksi } from '../api.js';
import { bukaTambah } from './tambah.js';
import { barisDariTeks } from './tambah-banyak.js';

/**
 * Cap tanggal & hitungan sebelum barang dicentang, supaya "Batal" di kartu
 * "Sudah dibeli hari ini" benar-benar mengembalikan keadaan — bukan sekadar
 * menaruh barangnya kembali dengan riwayat yang sudah terlanjur berubah.
 * Hanya bertahan selama halaman terbuka; setelah muat ulang, mengembalikan
 * barang hanya memindahkan statusnya.
 */
const capSebelumnya = new Map();

export function belanja() {
  const wadah = h('div.papan.dua');
  const gambar = () => { kosongkan(wadah); isi(wadah, gambar); };
  gambar();
  return wadah;
}

function dibeliHariIni() {
  return st.belanja.filter((b) => String(b.status) === 'simpan' && b.terakhir === hariIni());
}

function isi(wadah, gambar) {
  wadah.appendChild(h('div.papan',
    kartuDaftar(gambar),
    kartuHariIni(gambar)
  ));
  wadah.appendChild(h('div.papan',
    kartuDiingat(gambar)
  ));
}

// ------------------------------------------------------------- belum dibeli --

function kartuDaftar(gambar) {
  const daftar = belanjaAktif();
  const wadahBaris = h('div');
  const kosong = h('p.kosong',
    'Belum ada barang di daftar. Tulis di bawah, atau ketuk barang yang pernah dibeli.');
  const lencana = h('span.lencana.netral', String(daftar.length));

  daftar.forEach((b) => wadahBaris.appendChild(barisBarang(b, gambar)));
  if (!daftar.length) wadahBaris.appendChild(kosong);

  const kotak = h('input', {
    type: 'text', autocapitalize: 'words', autocomplete: 'off',
    placeholder: 'Telur', 'aria-label': 'Nama barang',
    gaya: { flex: '1', minWidth: '0' }
  });

  // Menambah barang menyisipkan barisnya langsung ke DOM — tidak memanggil
  // gambar() dan tidak memanggil umumkan(). Keduanya membangun ulang layar
  // berikut <input> ini, dan di HP itu terasa sebagai papan ketik yang menutup
  // sendiri di tengah pengisian. Mengisi delapan barang berturut-turut adalah
  // kegunaan utama layar ini, jadi papan ketiknya harus tetap terbuka.
  const tambah = async () => {
    const nama = kotak.value.trim();
    if (!nama) { kotak.focus(); return; }

    const ada = cariBelanja(nama);
    if (ada && String(ada.status) === 'aktif') {
      roti(`${ada.nama} sudah ada di daftar.`, 'salah');
      kotak.select();
      return;
    }
    // Barang yang namanya sama tidak pernah dibuat dua kali — kalau dibuat,
    // catatan "terakhir beli"-nya pecah dua dan gunanya hilang.
    const b = ada
      ? { ...ada, status: 'aktif' }
      : { id: idBelanja(), nama, status: 'aktif', terakhir: '', kali: 0 };

    taruhBelanja(b);
    kosong.remove();
    wadahBaris.appendChild(barisBarang(b, gambar));
    lencana.textContent = String(belanjaAktif().length);
    // Kartu "Pernah dibeli" tidak ikut digambar ulang, jadi chip barang yang
    // baru saja pindah ke daftar dicabut sendiri di sini. Tanpa ini, barang
    // yang diketik namanya tampak ada di dua tempat sekaligus.
    lepasChip(b.id);
    kotak.value = '';
    kotak.focus();

    try { await kirimAksi('belanja.simpan', { daftar: [b] }); }
    catch (e) { roti(e.message, 'salah'); }
  };

  kotak.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); tambah(); }
  });

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Belum dibeli'), lencana),
    wadahBaris,
    h('div', { gaya: { display: 'flex', gap: '8px', marginTop: '12px' } },
      kotak,
      h('button.tombol.tosca', {
        type: 'button', onclick: tambah, 'aria-label': 'Tambahkan barang'
      }, ikon('tambah', 18))
    )
  );
}

function barisBarang(b, gambar) {
  return h('div.rutin-baris',
    h('button.centang', {
      type: 'button',
      'aria-label': `Tandai ${b.nama} sudah dibeli`,
      'aria-pressed': 'false',
      onclick: () => centang(b, gambar)
    }, ikon('centang', 15)),
    h('button', {
      type: 'button',
      gaya: { flex: '1', minWidth: '0', textAlign: 'left' },
      onclick: () => bukaUbahBarang(b, gambar)
    },
      h('div.tebal', { gaya: { fontSize: '14px' } }, b.nama),
      h('div.mini.samar', b.terakhir
        ? `Terakhir dibeli ${berapaLama(b.terakhir)}`
        : 'Belum pernah dibeli')
    )
  );
}

/**
 * Dicentang = pindah ke "pernah dibeli", dicap hari ini, hitungannya naik satu.
 * Hitungan dinaikkan di sini lalu dikirim sebagai angka mutlak — bukan sebagai
 * perintah "tambah satu" — supaya antrian luring yang mengirim ulang aksi yang
 * sama tidak menaikkannya dua kali.
 */
async function centang(b, gambar) {
  capSebelumnya.set(b.id, { terakhir: b.terakhir, kali: b.kali });
  const baru = { ...b, status: 'simpan', terakhir: hariIni(), kali: (b.kali || 0) + 1 };
  taruhBelanja(baru);
  gambar(); umumkan();
  const hasil = await kirimAksi('belanja.simpan', { daftar: [baru] });
  roti(hasil?.tertunda ? `${b.nama} dicentang, dikirim saat online` : `${b.nama} sudah dibeli`);
}

// -------------------------------------------------------- sudah dibeli hari ini --

function kartuHariIni(gambar) {
  const daftar = dibeliHariIni();
  if (!daftar.length) return null;

  return h('div.kaca.kartu',
    h('div.kepala-kartu',
      h('h2', 'Sudah dibeli hari ini'),
      h('span.lencana.tosca', String(daftar.length))
    ),
    daftar.map((b) => h('div.rutin-baris',
      h('div', { gaya: { flex: '1', minWidth: '0' } }, b.nama),
      h('button.aksi', {
        type: 'button', onclick: () => batalCentang(b, gambar)
      }, 'Batal')
    )),
    h('button.tombol.utama.lebar', {
      gaya: { marginTop: '12px' },
      onclick: () => catatBelanja(daftar)
    }, `Catat belanjanya · ${daftar.length} barang`),
    h('p.mini.samar', { gaya: { marginTop: '8px' } },
      'Nama barangnya dibawa ke form catat-banyak, tinggal isi harga. Mencentang di sini tidak mencatat uang apa pun.')
  );
}

async function batalCentang(b, gambar) {
  const cap = capSebelumnya.get(b.id);
  const baru = cap
    ? { ...b, status: 'aktif', terakhir: cap.terakhir, kali: cap.kali }
    : { ...b, status: 'aktif' };
  capSebelumnya.delete(b.id);
  taruhBelanja(baru);
  gambar(); umumkan();
  try { await kirimAksi('belanja.simpan', { daftar: [baru] }); }
  catch (e) { roti(e.message, 'salah'); }
}

/** Jembatan ke form catat-banyak yang memang dibuat untuk sepulang belanja. */
function catatBelanja(daftar) {
  bukaTambah(null, {
    mode: 'banyak',
    baris: barisDariTeks(daftar.map((b) => b.nama).join('\n'))
  });
}

// ------------------------------------------------------------- pernah dibeli --

function kartuDiingat(gambar) {
  const diingat = belanjaDiingat();
  const arsip = belanjaDisisihkan();
  if (!diingat.length && !arsip.length) {
    return h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Pernah dibeli')),
      h('p.kosong',
        'Barang yang sudah dicentang muncul di sini, lengkap dengan kapan terakhir dibeli. Minggu depan tinggal diketuk, tidak perlu diketik ulang.')
    );
  }

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Pernah dibeli'),
      h('span.aksi.samar.mini', { 'data-jumlah-diingat': '' }, `${diingat.length} barang`)),
    h('p.mini.samar', { gaya: { marginBottom: '10px' } },
      'Diurutkan dari yang paling lama tidak dibeli. Ketuk untuk memasukkannya lagi ke daftar.'),
    diingat.length
      ? h('div.chip-baris', diingat.map((b) => h('button.chip', {
          type: 'button', 'data-barang': b.id,
          onclick: () => pakaiLagi(b, gambar)
        }, `${b.nama} · ${berapaLama(b.terakhir) || 'belum pernah'}`)))
      : h('p.kosong', 'Semua barang yang tersimpan sedang disisihkan.'),
    h('button.tombol.hantu.lebar', {
      gaya: { marginTop: '12px' },
      onclick: () => bukaAturSimpanan(gambar)
    }, 'Atur barang tersimpan')
  );
}

/** Cabut satu chip saran beserta hitungannya, tanpa menggambar ulang layar. */
function lepasChip(id) {
  document.querySelector(`.chip[data-barang="${id}"]`)?.remove();
  const hitung = document.querySelector('[data-jumlah-diingat]');
  if (hitung) hitung.textContent = `${belanjaDiingat().length} barang`;
}

async function pakaiLagi(b, gambar) {
  const baru = { ...b, status: 'aktif' };
  taruhBelanja(baru);
  gambar(); umumkan();
  try { await kirimAksi('belanja.simpan', { daftar: [baru] }); }
  catch (e) { roti(e.message, 'salah'); }
}

// ------------------------------------------------------------------- atur --

function bukaUbahBarang(b, gambar) {
  let nama = b.nama;
  sheet('Ubah barang', (tutup) => h('div',
    h('div.isian',
      h('label', 'Nama barang'),
      h('input', {
        type: 'text', value: b.nama, autocapitalize: 'words',
        oninput: (e) => { nama = e.target.value; }
      }),
      h('span.bantuan', b.terakhir
        ? `Terakhir dibeli ${berapaLama(b.terakhir)} · sudah ${b.kali}× dibeli.`
        : 'Belum pernah dicentang, jadi belum punya catatan tanggal.')
    ),
    h('button.tombol.utama.lebar', {
      onclick: async () => {
        const bersih = nama.trim();
        if (!bersih) { roti('Nama barangnya belum diisi.', 'salah'); return; }
        const kembar = cariBelanja(bersih);
        if (kembar && kembar.id !== b.id) {
          roti(`${kembar.nama} sudah ada.`, 'salah');
          return;
        }
        const baru = { ...b, nama: bersih };
        taruhBelanja(baru);
        tutup(); gambar(); umumkan();
        try { await kirimAksi('belanja.simpan', { daftar: [baru] }); roti('Tersimpan'); }
        catch (e) { roti('Tersimpan di HP, Sheet menyusul'); }
      }
    }, 'Simpan'),
    h('button.tombol.bahaya.lebar', {
      gaya: { marginTop: '8px' },
      onclick: async () => { if (await sisihkan(b, gambar)) tutup(); }
    }, 'Sisihkan barang ini')
  ));
}

/**
 * "Sisihkan", bukan "hapus". Barisnya tetap ada di Sheet lengkap dengan
 * tanggal beli terakhirnya; yang berhenti cuma munculnya sebagai saran. Ini
 * yang menjaga kartu "Pernah dibeli" tetap terbaca setelah setahun dipakai,
 * tanpa pernah membuang catatan.
 */
async function sisihkan(b, gambar) {
  const ya = await konfirmasi(`Sisihkan ${b.nama}?`,
    'Barangnya berhenti muncul sebagai saran, tapi catatan kapan terakhir dibeli tetap tersimpan dan bisa dipakai lagi kapan saja.',
    'Sisihkan');
  if (!ya) return false;
  const baru = { ...b, status: 'arsip' };
  taruhBelanja(baru);
  gambar(); umumkan();
  try { await kirimAksi('belanja.simpan', { daftar: [baru] }); roti(`${b.nama} disisihkan`); }
  catch (e) { roti('Tersimpan di HP, Sheet menyusul'); }
  return true;
}

function bukaAturSimpanan(gambar) {
  sheet('Barang tersimpan', () => {
    const wadah = h('div');
    const gambarSheet = () => {
      kosongkan(wadah);
      const diingat = belanjaDiingat();
      const arsip = belanjaDisisihkan();

      wadah.append(
        h('p.kecil.samar', { gaya: { marginBottom: '12px' } },
          'Barang yang disisihkan tidak lagi disarankan, tapi catatan tanggalnya tetap utuh — tidak ada yang benar-benar hilang.'),
        diingat.length
          ? h('div.kaca.kartu', { gaya: { marginBottom: '14px' } },
              diingat.map((b) => h('div.rutin-baris',
                h('div', { gaya: { flex: '1', minWidth: '0' } },
                  h('div', b.nama),
                  h('div.mini.samar',
                    `Terakhir ${berapaLama(b.terakhir) || 'belum pernah'} · ${b.kali}× dibeli`)
                ),
                h('button.aksi', {
                  type: 'button',
                  onclick: async () => {
                    const baru = { ...b, status: 'arsip' };
                    taruhBelanja(baru);
                    gambarSheet(); gambar();
                    try { await kirimAksi('belanja.simpan', { daftar: [baru] }); }
                    catch (e) { roti(e.message, 'salah'); }
                  }
                }, 'Sisihkan')
              ))
            )
          : h('p.kosong', 'Belum ada barang tersimpan.'),
        arsip.length
          ? h('div',
              h('h2', { gaya: { fontSize: '15px', margin: '0 0 8px' } }, 'Disisihkan'),
              h('div.kaca.kartu',
                arsip.map((b) => h('div.rutin-baris',
                  h('div', { gaya: { flex: '1', minWidth: '0' } },
                    h('div', b.nama),
                    h('div.mini.samar',
                      `Terakhir ${berapaLama(b.terakhir) || 'belum pernah'} · ${b.kali}× dibeli`)
                  ),
                  h('button.aksi', {
                    type: 'button',
                    onclick: async () => {
                      const baru = { ...b, status: 'simpan' };
                      taruhBelanja(baru);
                      gambarSheet(); gambar();
                      try { await kirimAksi('belanja.simpan', { daftar: [baru] }); }
                      catch (e) { roti(e.message, 'salah'); }
                    }
                  }, 'Pakai lagi')
                ))
              )
            )
          : null
      );
    };
    gambarSheet();
    return wadah;
  });
}
