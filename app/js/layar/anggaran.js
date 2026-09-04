import { h, roti, kosongkan, sheet } from '../ui.js';
import { rp, rpSingkat, namaBulan, geserBulan } from '../rupiah.js';
import { st, anggaranBulan, ringkas, perKategori, umumkan, selisihBulan } from '../toko.js';
import { tabelKategori } from '../grafik.js';
import { panggil } from '../api.js';

export function anggaran() {
  const wadah = h('div.papan.dua');
  const gambar = () => { kosongkan(wadah); isi(wadah, gambar); };
  gambar();
  return wadah;
}

function isi(wadah, gambar) {
  const baris = anggaranBulan();
  const r = ringkas();
  const totalPagu = baris.reduce((a, b) => a + b.pagu, 0);
  const totalPakai = baris.reduce((a, b) => a + b.terpakai, 0);

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu',
        h('h2', `Pagu ${namaBulan(st.bulan)}`),
        h('button.aksi', { onclick: () => bukaUsulan(gambar) }, 'Usulkan')
      ),
      totalPagu
        ? h('p.mini.samar', { gaya: { marginBottom: '4px' } },
            `Terpakai ${rp(totalPakai)} dari ${rp(totalPagu)} · sisa pagu ${rp(totalPagu - totalPakai)}`)
        : h('p.mini.samar', { gaya: { marginBottom: '4px' } },
            'Belum ada pagu. Ketuk "Usulkan dari riwayat" untuk mengisinya dari rata-rata belanja Anda.'),
      baris.length
        ? baris.map((b) => barisPagu(b, gambar))
        : h('p.kosong', 'Belum ada kategori yang tercatat bulan ini.')
    )
  ));

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Rincian angka')),
      h('p.mini.samar', { gaya: { marginBottom: '10px' } },
        'Tabel ini menampilkan angka yang sama dengan grafik di Beranda — berguna kalau warna batangnya sulit dibedakan.'),
      tabelKategori(perKategori())
    )
  ));
}

function barisPagu(b, gambar) {
  const persen = b.pagu ? (b.terpakai / b.pagu) * 100 : 0;
  const tingkat = !b.pagu ? 'aman' : persen > 100 ? 'jebol' : persen >= 80 ? 'hampir' : 'aman';
  const pesan = !b.pagu ? 'Belum dipagu'
    : persen > 100 ? `Lewat ${rpSingkat(b.terpakai - b.pagu)}`
    : `Sisa ${rpSingkat(b.pagu - b.terpakai)}`;

  return h('button.pagu', {
    type: 'button', gaya: { width: '100%', textAlign: 'left', display: 'block' },
    onclick: () => bukaSetPagu(b, gambar)
  },
    h('div.atas',
      h('span.nama', b.kategori),
      // Statusnya selalu ada tulisannya, tidak hanya lewat warna batang.
      h('span.lencana', {
        kelas: tingkat === 'jebol' ? 'WAJIB' : tingkat === 'hampir' ? 'netral' : 'tosca'
      }, pesan),
      h('span.rp.angka', b.pagu ? `${rp(b.terpakai)} / ${rp(b.pagu)}` : rp(b.terpakai))
    ),
    h('div.jalur',
      h('div.isi', { kelas: tingkat, gaya: { width: `${Math.min(persen, 100)}%` } })
    )
  );
}

function bukaSetPagu(b, gambar) {
  let nilai = b.pagu;
  sheet(`Pagu ${b.kategori}`, (tutup) => {
    const kotak = h('input', {
      type: 'number', inputmode: 'numeric', value: nilai || '', placeholder: '0',
      oninput: (e) => { nilai = Number(e.target.value) || 0; }
    });
    return h('div',
      h('p.kecil.samar', { gaya: { marginBottom: '12px' } },
        `Bulan ini sudah terpakai ${rp(b.terpakai)}.`),
      h('div.isian', h('label', 'Pagu bulanan (Rp)'), kotak),
      h('div.chip-baris', { gaya: { marginBottom: '14px' } },
        [500000, 1000000, 2000000, 5000000].map((n) =>
          h('button.chip', { type: 'button', onclick: () => { nilai = n; kotak.value = n; } }, rpSingkat(n)))
      ),
      h('button.tombol.utama.lebar', {
        onclick: async () => {
          const rekam = { bulan: st.bulan, kategori: b.kategori, pagu: nilai };
          const i = st.anggaran.findIndex((a) => a.bulan === rekam.bulan && a.kategori === rekam.kategori);
          if (i >= 0) st.anggaran[i] = rekam; else st.anggaran.push(rekam);
          tutup(); gambar(); umumkan();
          try { await panggil('anggaran.simpan', { daftar: [rekam] }); roti('Pagu tersimpan'); }
          catch (e) { roti('Tersimpan di HP, Sheet menyusul'); }
        }
      }, 'Simpan pagu')
    );
  });
}

/**
 * Usulan pagu dari rata-rata belanja beberapa bulan terakhir, dibulatkan ke
 * 50.000 supaya angkanya enak dibaca.
 */
function bukaUsulan(gambar) {
  const jumlahBulan = 6;
  const perKat = new Map();
  const bulanTerpakai = new Set();
  for (const t of st.transaksi) {
    if (t.jenis !== 'RUMAH_TANGGA') continue;
    const jarak = selisihBulan(t.bulan, st.bulan);
    if (jarak <= 0 || jarak > jumlahBulan) continue;
    bulanTerpakai.add(t.bulan);
    perKat.set(t.kategori || 'Lainnya', (perKat.get(t.kategori || 'Lainnya') || 0) + t.nominal);
  }
  const n = Math.max(bulanTerpakai.size, 1);
  const usulan = [...perKat.entries()]
    .map(([kategori, total]) => ({
      bulan: st.bulan, kategori, pagu: Math.round(total / n / 50000) * 50000
    }))
    .filter((u) => u.pagu > 0)
    .sort((a, b) => b.pagu - a.pagu);

  sheet('Usulan pagu', (tutup) => h('div',
    usulan.length
      ? h('div',
          h('p.kecil.samar', { gaya: { marginBottom: '12px' } },
            `Dihitung dari rata-rata ${bulanTerpakai.size} bulan terakhir yang ada datanya.`),
          h('div.kaca.kartu', { gaya: { marginBottom: '14px' } },
            usulan.map((u) => h('div.rutin-baris',
              h('div', { gaya: { flex: 1 } }, u.kategori),
              h('div.angka.tebal', rp(u.pagu))
            ))
          ),
          h('button.tombol.utama.lebar', {
            onclick: async () => {
              usulan.forEach((u) => {
                const i = st.anggaran.findIndex((a) => a.bulan === u.bulan && a.kategori === u.kategori);
                if (i >= 0) st.anggaran[i] = u; else st.anggaran.push(u);
              });
              tutup(); gambar(); umumkan();
              try { await panggil('anggaran.simpan', { daftar: usulan }); roti('Pagu tersimpan'); }
              catch (e) { roti('Tersimpan di HP, Sheet menyusul'); }
            }
          }, `Pakai ${usulan.length} pagu ini`)
        )
      : h('p.kosong', 'Belum ada riwayat belanja untuk dijadikan acuan.')
  ));
}
