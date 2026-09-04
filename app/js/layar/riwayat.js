import { h, ikon, sheet, roti, konfirmasi, kosongkan } from '../ui.js';
import { rp, tanggalPanjang } from '../rupiah.js';
import { st, transaksiBulan, buangTransaksi, umumkan } from '../toko.js';
import { panggil } from '../api.js';
import { bukaTambah } from './tambah.js';

const saring = { jenis: '', kategori: '', sifat: '', cari: '' };

export function riwayat() {
  const wadah = h('div.papan');
  const gambar = () => { kosongkan(wadah); wadah.appendChild(isi(gambar)); };
  gambar();
  return wadah;
}

function isi(gambar) {
  let daftar = transaksiBulan();
  if (saring.jenis) daftar = daftar.filter((t) => t.jenis === saring.jenis);
  if (saring.kategori) daftar = daftar.filter((t) => t.kategori === saring.kategori);
  if (saring.sifat) daftar = daftar.filter((t) => t.sifat === saring.sifat);
  if (saring.cari) {
    const q = saring.cari.toLowerCase();
    daftar = daftar.filter((t) => t.item.toLowerCase().includes(q) ||
                                  (t.kategori || '').toLowerCase().includes(q));
  }
  daftar.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));

  const perHari = new Map();
  for (const t of daftar) {
    if (!perHari.has(t.tanggal)) perHari.set(t.tanggal, []);
    perHari.get(t.tanggal).push(t);
  }

  const kategoriAda = [...new Set(transaksiBulan().map((t) => t.kategori).filter(Boolean))].sort();

  return h('div',
    h('div.kaca.kartu',
      h('div.isian', { gaya: { marginBottom: '10px' } },
        h('input', {
          type: 'search', value: saring.cari, placeholder: 'Cari nama transaksi…',
          'aria-label': 'Cari transaksi',
          oninput: (e) => { saring.cari = e.target.value; gambar(); }
        })
      ),
      h('div.gulir-x',
        h('div.chip-baris', { gaya: { flexWrap: 'nowrap', paddingBottom: '2px' } },
          pilihan('Semua', !saring.jenis && !saring.sifat, () => { saring.jenis = ''; saring.sifat = ''; gambar(); }),
          pilihan('Rumah tangga', saring.jenis === 'RUMAH_TANGGA', () => { saring.jenis = 'RUMAH_TANGGA'; gambar(); }),
          pilihan('Tetap', saring.jenis === 'TETAP', () => { saring.jenis = 'TETAP'; gambar(); }),
          pilihan('Pemasukan', saring.jenis === 'PEMASUKAN', () => { saring.jenis = 'PEMASUKAN'; gambar(); }),
          pilihan('Wajib', saring.sifat === 'WAJIB', () => { saring.sifat = saring.sifat === 'WAJIB' ? '' : 'WAJIB'; gambar(); }),
          pilihan('Keinginan', saring.sifat === 'KEINGINAN', () => { saring.sifat = saring.sifat === 'KEINGINAN' ? '' : 'KEINGINAN'; gambar(); })
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
    ),

    h('div.kaca.kartu',
      perHari.size
        ? [...perHari.entries()].map(([tanggal, isiHari]) => h('div',
            h('div.hari-judul',
              h('span', tanggalPanjang(tanggal)),
              h('span.total.angka', rp(isiHari.reduce((a, b) =>
                a + (b.jenis === 'PEMASUKAN' ? 0 : b.nominal), 0)))
            ),
            h('div.daftar', isiHari.map((t) => barisTransaksi(t, gambar)))
          ))
        : h('p.kosong', 'Tidak ada yang cocok dengan saringan ini.')
    )
  );
}

function pilihan(label, aktif, onclick) {
  return h('button.chip', { type: 'button', kelas: aktif ? 'aktif' : '', 'aria-pressed': String(aktif), onclick }, label);
}

/** Satu baris transaksi. Dipakai juga di Beranda. */
export function barisTransaksi(t, gambar) {
  const masuk = t.jenis === 'PEMASUKAN';
  return h('button.baris', { type: 'button', onclick: () => bukaRinci(t, gambar) },
    h('div.tanda', { kelas: masuk ? 'masuk' : t.sifat }),
    h('div.isi',
      h('div.nama', t.item || '(tanpa nama)'),
      h('div.meta', [
        t.kategori,
        masuk ? 'Pemasukan' : (t.jenis === 'TETAP' ? 'Tagihan tetap' : null),
        (t.catatan || '').includes('tanggal perkiraan') ? 'tanggal perkiraan' : null
      ].filter(Boolean).join(' · '))
    ),
    h('div.rp.angka', { kelas: masuk ? 'masuk' : '' }, (masuk ? '+' : '') + rp(t.nominal))
  );
}

function bukaRinci(t, gambar) {
  const masuk = t.jenis === 'PEMASUKAN';
  sheet(t.item || 'Transaksi', (tutup) => h('div',
    h('div.kaca.kartu', { gaya: { marginBottom: '14px' } },
      h('div.layar-nominal.angka', (masuk ? '+' : '') + rp(t.nominal)),
      h('div.petak',
        h('div.sel', h('div.k', 'Tanggal'), h('div.v', { gaya: { fontSize: '14px' } }, tanggalPanjang(t.tanggal))),
        h('div.sel', h('div.k', 'Kategori'), h('div.v', { gaya: { fontSize: '14px' } }, t.kategori || '—'))
      ),
      masuk ? null : h('div', { gaya: { marginTop: '10px' } },
        h('span.lencana', { kelas: t.sifat }, t.sifat === 'WAJIB' ? 'Wajib' : 'Keinginan')),
      t.catatan ? h('p.kecil.samar', { gaya: { marginTop: '10px' } }, t.catatan) : null
    ),
    h('div', { gaya: { display: 'grid', gap: '8px' } },
      h('button.tombol.hantu.lebar', {
        onclick: () => { tutup(); bukaTambah(t); }
      }, ikon('pena', 17), 'Ubah'),
      h('button.tombol.bahaya.lebar', {
        onclick: async () => {
          const ya = await konfirmasi('Hapus transaksi?',
            `"${t.item}" sebesar ${rp(t.nominal)} akan ditandai terhapus. Barisnya tetap tersimpan di Google Sheet dan bisa dipulihkan dari sana.`,
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
