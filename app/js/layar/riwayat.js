import { h, ikon, sheet, roti, konfirmasi, kosongkan } from '../ui.js';
import { rp, tanggalPanjang } from '../rupiah.js';
import { st, transaksiBulan, buangTransaksi, umumkan, taruhTransaksi, daftarPos } from '../toko.js';
import { panggil, kirimAksi } from '../api.js';
import { bukaTambah } from './tambah.js';

const saring = { kelompok: '', kategori: '', sifat: '', milik: '', cari: '' };

export function riwayat() {
  const wadah = h('div.papan');

  // Kotak cari sengaja dibuat sekali dan hidup di luar bagian yang digambar
  // ulang. Sebelumnya ia ikut dibuang tiap ketukan: elemen yang sedang difokus
  // hilang dari DOM, fokusnya lepas, dan papan ketik HP menutup sendiri
  // sesudah satu huruf.
  const kotakCari = h('input', {
    type: 'search', value: saring.cari, placeholder: 'Cari nama transaksi…',
    'aria-label': 'Cari transaksi'
  });

  const wadahSaring = h('div');
  const wadahDaftar = h('div.kaca.kartu');
  const gambar = () => {
    kosongkan(wadahSaring);
    kosongkan(wadahDaftar);
    const { saringan, daftar } = isi(gambar);
    wadahSaring.appendChild(saringan);
    wadahDaftar.appendChild(daftar);
  };

  // Menyaring ditunda sebentar: mengetik cepat tidak perlu menyusun ulang
  // seluruh daftar per huruf.
  let tunda;
  kotakCari.addEventListener('input', () => {
    saring.cari = kotakCari.value;
    clearTimeout(tunda);
    tunda = setTimeout(gambar, 140);
  });

  gambar();
  wadah.appendChild(h('div.kaca.kartu',
    h('div.isian', { gaya: { marginBottom: '10px' } }, kotakCari),
    wadahSaring
  ));
  wadah.appendChild(wadahDaftar);
  return wadah;
}

function isi(gambar) {
  let daftar = transaksiBulan();
  if (saring.kelompok === 'Pemasukan') daftar = daftar.filter((t) => t.jenis === 'Pemasukan');
  else if (saring.kelompok) daftar = daftar.filter((t) => t.kelompok === saring.kelompok);
  if (saring.kategori) daftar = daftar.filter((t) => t.kategori === saring.kategori);
  if (saring.sifat) daftar = daftar.filter((t) => t.sifat === saring.sifat);
  if (saring.milik) daftar = daftar.filter((t) => t.milik === saring.milik);
  if (saring.cari) {
    const q = saring.cari.toLowerCase();
    daftar = daftar.filter((t) => t.keterangan.toLowerCase().includes(q) ||
                                  (t.kategori || '').toLowerCase().includes(q));
  }
  daftar.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));

  const perHari = new Map();
  for (const t of daftar) {
    if (!perHari.has(t.tanggal)) perHari.set(t.tanggal, []);
    perHari.get(t.tanggal).push(t);
  }

  const kategoriAda = [...new Set(transaksiBulan().map((t) => t.kategori).filter(Boolean))].sort();

  const milikAda = [...new Set(transaksiBulan().map((t) => t.milik).filter(Boolean))].sort();

  const saringan = h('div',
    h('div.gulir-x',
      h('div.chip-baris', { gaya: { flexWrap: 'nowrap', paddingBottom: '2px' } },
        pilihan('Semua', !saring.kelompok && !saring.sifat && !saring.milik,
          () => { saring.kelompok = ''; saring.sifat = ''; saring.milik = ''; gambar(); }),
        pilihan('Pemasukan', saring.kelompok === 'Pemasukan',
          () => { saring.kelompok = saring.kelompok === 'Pemasukan' ? '' : 'Pemasukan'; gambar(); }),
        daftarPos().map((k) => pilihan(k, saring.kelompok === k,
          () => { saring.kelompok = saring.kelompok === k ? '' : k; gambar(); })),
        pilihan('Wajib', saring.sifat === 'WAJIB', () => { saring.sifat = saring.sifat === 'WAJIB' ? '' : 'WAJIB'; gambar(); }),
        pilihan('Keinginan', saring.sifat === 'KEINGINAN', () => { saring.sifat = saring.sifat === 'KEINGINAN' ? '' : 'KEINGINAN'; gambar(); }),
        milikAda.map((m) => pilihan(m, saring.milik === m,
          () => { saring.milik = saring.milik === m ? '' : m; gambar(); }))
      )
    ),
    kategoriAda.length ? h('div.gulir-x', { gaya: { marginTop: '7px' } },
      h('div.chip-baris', { gaya: { flexWrap: 'nowrap' } },
        kategoriAda.map((k) => pilihan(k, saring.kategori === k,
          () => { saring.kategori = saring.kategori === k ? '' : k; gambar(); }))
      )
    ) : null,
    h('p.mini.samar', { gaya: { marginTop: '10px' } },
      `${daftar.length} transaksi · ${rp(daftar.reduce((a, b) => a + b.nominal, 0))}`)
  );

  const isiDaftar = h('div',
    perHari.size
      ? [...perHari.entries()].map(([tanggal, isiHari]) => h('div',
          h('div.hari-judul',
            h('span', tanggalPanjang(tanggal)),
            h('span.total.angka', rp(isiHari.reduce((a, b) =>
              a + (b.jenis === 'Pemasukan' ? 0 : b.nominal), 0)))
          ),
          h('div.daftar', isiHari.map((t) => barisTransaksi(t, gambar)))
        ))
      : h('p.kosong', 'Tidak ada yang cocok dengan saringan ini.')
  );

  return { saringan, daftar: isiDaftar };
}

function pilihan(label, aktif, onclick) {
  return h('button.chip', { type: 'button', kelas: aktif ? 'aktif' : '', 'aria-pressed': String(aktif), onclick }, label);
}

/** Satu baris transaksi. Dipakai juga di Beranda. */
export function barisTransaksi(t, gambar) {
  const masuk = t.jenis === 'Pemasukan';
  return h('button.baris', { type: 'button', onclick: () => bukaRinci(t, gambar) },
    h('div.tanda', { kelas: masuk ? 'masuk' : t.sifat }),
    h('div.isi',
      h('div.nama', t.keterangan || '(tanpa nama)'),
      h('div.meta', [
        t.kategori,
        masuk ? 'Pemasukan' : t.kelompok,
        t.milik && t.milik !== 'Bersama' ? t.milik : null
      ].filter(Boolean).join(' · '))
    ),
    h('div.rp.angka', { kelas: masuk ? 'masuk' : '' }, (masuk ? '+' : '') + rp(t.nominal))
  );
}

function bukaRinci(t, gambar) {
  const masuk = t.jenis === 'Pemasukan';
  sheet(t.keterangan || 'Transaksi', (tutup) => h('div',
    h('div.kaca.kartu', { gaya: { marginBottom: '14px' } },
      h('div.layar-nominal.angka', (masuk ? '+' : '') + rp(t.nominal)),
      h('div.petak',
        h('div.sel', h('div.k', 'Tanggal'), h('div.v', { gaya: { fontSize: '14px' } }, tanggalPanjang(t.tanggal))),
        h('div.sel', h('div.k', 'Kategori'), h('div.v', { gaya: { fontSize: '14px' } }, t.kategori || '—')),
        h('div.sel', h('div.k', 'Pos'), h('div.v', { gaya: { fontSize: '14px' } }, t.kelompok || '—')),
        h('div.sel', h('div.k', 'Bayar pakai'), h('div.v', { gaya: { fontSize: '14px' } }, t.bayarPakai || '—'))
      ),
      masuk ? null : sakelarSifat(t, gambar),
      t.catatan ? h('p.kecil.samar', { gaya: { marginTop: '10px' } }, t.catatan) : null
    ),
    // Baris yang tinggal di INPUT TRANSAKSI tidak diubah dari sini. Tombolnya
    // tidak disembunyikan tapi dijelaskan — kalau hilang begitu saja, yang
    // muncul adalah pertanyaan "kok tidak bisa diedit", bukan jawabannya.
    t.kunci
      ? h('div.kaca.kartu',
          h('p.kecil.samar',
            'Baris ini diketik langsung di tab INPUT TRANSAKSI, jadi hanya bisa diubah ' +
            'atau dihapus dari Google Sheets. Yang bisa disetel dari sini cuma sifatnya.'))
      : h('div', { gaya: { display: 'grid', gap: '8px' } },
          h('button.tombol.hantu.lebar', {
            onclick: () => { tutup(); bukaTambah(t); }
          }, ikon('pena', 17), 'Ubah'),
          h('button.tombol.bahaya.lebar', {
            onclick: async () => {
              const ya = await konfirmasi('Hapus transaksi?',
                `"${t.keterangan}" sebesar ${rp(t.nominal)} akan ditandai terhapus. Barisnya tetap tersimpan di Google Sheet dan bisa dipulihkan dari sana.`,
                'Hapus');
              if (!ya) return;
              buangTransaksi(t.id);
              tutup();
              umumkan();
              gambar?.();
              try {
                await panggil('transaksi.hapus', { id: t.id });
                roti('Terhapus');
              } catch (e) {
                roti('Terhapus di HP, Sheet menyusul saat online');
              }
            }
          }, ikon('sampah', 17), 'Hapus')
        )
  ));
}

/**
 * Wajib/Keinginan bisa disetel untuk baris mana pun, termasuk yang milik
 * sheet. Sheet baru tidak punya kolom itu, jadi penandanya disimpan terpisah
 * oleh Apps Script — dan justru karena itu ia tetap boleh diubah dari HP.
 */
function sakelarSifat(t, gambar) {
  const wadah = h('div.sakelar-sifat', { role: 'radiogroup', 'aria-label': 'Sifat pengeluaran', gaya: { marginTop: '12px' } });
  const pasang = () => {
    kosongkan(wadah);
    ['KEINGINAN', 'WAJIB'].forEach((nilai) => wadah.appendChild(
      h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(t.sifat === nilai),
        kelas: t.sifat === nilai ? 'aktif' : '',
        onclick: async () => {
          if (t.sifat === nilai) return;
          t.sifat = nilai;
          taruhTransaksi(t);
          pasang();
          umumkan();
          gambar?.();
          try {
            await kirimAksi('tanda.simpan', { id: t.id, sifat: nilai });
          } catch (e) {
            roti('Tersimpan di HP, Sheet menyusul saat online');
          }
        }
      }, h('span.titik'), nilai === 'WAJIB' ? 'Wajib' : 'Keinginan')
    ));
  };
  pasang();
  return wadah;
}
