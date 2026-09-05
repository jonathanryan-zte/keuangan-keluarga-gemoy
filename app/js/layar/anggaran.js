import { h, roti, kosongkan, sheet, konfirmasi, ikon } from '../ui.js';
import { rp, rpSingkat, namaBulan } from '../rupiah.js';
import {
  st, anggaranBulan, paguDisisihkan, perKategori, umumkan, selisihBulan,
  kategoriAktif, kategoriDisisihkan, pemakaiKategori,
  pakaiKategori, sisihkanKategori, taruhPagu
} from '../toko.js';
import { tabelKategori } from '../grafik.js';
import { kirimAksi } from '../api.js';

const JENIS = 'RUMAH_TANGGA';

export function anggaran() {
  const wadah = h('div.papan.dua');
  const gambar = () => { kosongkan(wadah); isi(wadah, gambar); };
  gambar();
  return wadah;
}

function isi(wadah, gambar) {
  const baris = anggaranBulan();
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
            'Belum ada pagu. Ketuk "Usulkan" untuk mengisinya dari rata-rata belanja Anda.'),
      baris.length
        ? baris.map((b) => barisPagu(b, gambar))
        : h('p.kosong', 'Belum ada kategori yang tercatat bulan ini.'),
      h('button.tombol.hantu.lebar', {
        gaya: { marginTop: '12px' },
        onclick: () => bukaTambahKategori(baris, gambar)
      }, ikon('tambah', 17), 'Tambah kategori')
    ),
    kartuArsip(gambar)
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
  // Bulan yang sudah lewat tetap menampilkan sisa pagunya walau kategorinya
  // kini disisihkan — riwayat harus terbaca apa adanya. "Disisihkan" hanya
  // muncul kalau memang tidak ada pagu yang berlaku lagi.
  const pesan = b.arsip && !b.pagu ? 'Disisihkan'
    : !b.pagu ? 'Belum dipagu'
    : persen > 100 ? `Lewat ${rpSingkat(b.terpakai - b.pagu)}`
    : `Sisa ${rpSingkat(b.pagu - b.terpakai)}`;

  return h('button.pagu', {
    type: 'button', kelas: b.arsip ? 'arsip' : '',
    gaya: { width: '100%', textAlign: 'left', display: 'block' },
    onclick: () => bukaSetPagu(b, gambar)
  },
    h('div.atas',
      h('span.nama', b.kategori),
      // Statusnya selalu ada tulisannya, tidak hanya lewat warna batang.
      h('span.lencana', {
        kelas: tingkat === 'jebol' ? 'WAJIB' : tingkat === 'hampir' || b.arsip ? 'netral' : 'tosca'
      }, pesan),
      h('span.rp.angka', b.pagu ? `${rp(b.terpakai)} / ${rp(b.pagu)}` : rp(b.terpakai))
    ),
    h('div.jalur',
      h('div.isi', { kelas: tingkat, gaya: { width: `${Math.min(persen, 100)}%` } })
    )
  );
}

/**
 * Kategori yang sudah disisihkan tetap terlihat di bawah, lengkap dengan pagu
 * terakhirnya. Tidak ada yang benar-benar hilang — semuanya bisa dipakai lagi.
 */
function kartuArsip(gambar) {
  const kategori = kategoriDisisihkan(JENIS);
  const pagu = paguDisisihkan();
  if (!kategori.length && !pagu.length) return null;

  const paguTerakhir = new Map(pagu.map((p) => [p.kategori, p.pagu]));
  const daftar = [...new Set([...kategori, ...paguTerakhir.keys()])].sort();

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Disisihkan')),
    h('p.mini.samar', { gaya: { marginBottom: '10px' } },
      'Kategori ini tidak lagi muncul di form catat, tapi transaksi lamanya tetap utuh dan tetap ikut terhitung di Laporan.'),
    daftar.map((k) => h('div.rutin-baris',
      h('div', { gaya: { flex: 1 } },
        h('div', k),
        paguTerakhir.has(k)
          ? h('div.mini.samar', `Pagu terakhir ${rp(paguTerakhir.get(k))}`)
          : h('div.mini.samar', `${pemakaiKategori(JENIS, k)} transaksi tersimpan`)
      ),
      h('button.aksi', { onclick: () => pulihkan(k, paguTerakhir.get(k) || 0, gambar) }, 'Pakai lagi')
    ))
  );
}

async function pulihkan(kategori, pagu, gambar) {
  pakaiKategori(JENIS, kategori);
  const rekam = { bulan: st.bulan, kategori, pagu, jenis: JENIS };
  taruhPagu(rekam);
  gambar(); umumkan();
  try {
    await kirimAksi('kategori.pulihkan', { jenis: JENIS, nama: kategori });
    await kirimAksi('anggaran.simpan', { daftar: [rekam] });
    roti(`${kategori} dipakai lagi`);
  } catch (e) {
    roti('Tersimpan di HP, Sheet menyusul');
  }
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
          const rekam = { bulan: st.bulan, kategori: b.kategori, pagu: nilai, jenis: JENIS };
          if (b.arsip) pakaiKategori(JENIS, b.kategori);
          taruhPagu(rekam);
          tutup(); gambar(); umumkan();
          try {
            if (b.arsip) await kirimAksi('kategori.pulihkan', { jenis: JENIS, nama: b.kategori });
            const hasil = await kirimAksi('anggaran.simpan', { daftar: [rekam] });
            roti(hasil?.tertunda ? 'Tersimpan di HP, dikirim saat online' : 'Pagu tersimpan');
          } catch (e) { roti(e.message, 'salah'); }
        }
      }, 'Simpan pagu'),
      h('button.tombol.bahaya.lebar', {
        gaya: { marginTop: '8px' },
        onclick: async () => { if (await sisihkan(b, gambar)) tutup(); }
      }, 'Sisihkan kategori ini')
    );
  });
}

/**
 * "Sisihkan", bukan "hapus". Barisnya tetap ada di Sheet dengan bendera arsip,
 * transaksi lamanya tidak disentuh sama sekali, dan tombol "Pakai lagi" selalu
 * tersedia. Jadi tidak ada langkah di layar ini yang bisa menghilangkan data.
 */
async function sisihkan(b, gambar) {
  const dipakai = pemakaiKategori(JENIS, b.kategori);
  const ya = await konfirmasi(`Sisihkan ${b.kategori}?`,
    dipakai
      ? `${dipakai} transaksi memakai kategori ini dan semuanya tetap tersimpan — angka di Beranda dan Laporan tidak berubah. ` +
        'Kategorinya hanya berhenti muncul sebagai pilihan saat mencatat, dan bisa dipakai lagi kapan saja.'
      : 'Kategorinya berhenti muncul saat mencatat. Pagu bulan-bulan yang sudah lewat tetap tersimpan sebagai riwayat.',
    'Sisihkan');
  if (!ya) return false;

  sisihkanKategori(JENIS, b.kategori, st.bulan);
  gambar(); umumkan();
  try {
    await kirimAksi('kategori.sisihkan', { jenis: JENIS, nama: b.kategori, sejak: st.bulan });
    roti(`${b.kategori} disisihkan`);
  } catch (e) {
    roti('Tersimpan di HP, Sheet menyusul');
  }
  return true;
}

/**
 * Menambah kategori di sini sekaligus menambahkannya ke form catat, saringan
 * Riwayat, dan Laporan — semuanya membaca daftar yang sama.
 */
function bukaTambahKategori(barisSekarang, gambar) {
  const sudahAda = new Set(barisSekarang.map((b) => b.kategori));
  const belumDipagu = kategoriAktif(JENIS).filter((k) => !sudahAda.has(k));
  let nama = '';
  let pagu = 0;

  sheet('Tambah kategori', (tutup) => {
    const kotakNama = h('input', {
      type: 'text', autocapitalize: 'words', placeholder: 'Pendidikan',
      oninput: (e) => { nama = e.target.value; }
    });
    const kotakPagu = h('input', {
      type: 'number', inputmode: 'numeric', placeholder: '0',
      oninput: (e) => { pagu = Number(e.target.value) || 0; }
    });

    const simpan = async () => {
      const bersih = nama.trim();
      if (!bersih) { roti('Nama kategorinya belum diisi.', 'salah'); return; }
      const kembar = [...kategoriAktif(JENIS), ...kategoriDisisihkan(JENIS)]
        .find((k) => k.toLowerCase() === bersih.toLowerCase());
      if (kembar && sudahAda.has(kembar)) {
        roti(`${kembar} sudah ada di daftar pagu.`, 'salah');
        return;
      }
      const dipakai = kembar || bersih;
      const rekam = { bulan: st.bulan, kategori: dipakai, pagu, jenis: JENIS };

      pakaiKategori(JENIS, dipakai);
      taruhPagu(rekam);
      tutup(); gambar(); umumkan();
      try {
        await kirimAksi('kategori.simpan', { jenis: JENIS, nama: dipakai });
        const hasil = await kirimAksi('anggaran.simpan', { daftar: [rekam] });
        roti(hasil?.tertunda ? 'Tersimpan di HP, dikirim saat online' : `${dipakai} ditambahkan`);
      } catch (e) { roti(e.message, 'salah'); }
    };

    return h('div',
      belumDipagu.length
        ? h('div', { gaya: { marginBottom: '16px' } },
            h('p.kecil.samar', { gaya: { marginBottom: '8px' } },
              'Kategori yang sudah ada tapi belum dipagu bulan ini:'),
            h('div.chip-baris', belumDipagu.map((k) =>
              h('button.chip', {
                type: 'button',
                onclick: () => { nama = k; kotakNama.value = k; kotakNama.focus(); }
              }, k)))
          )
        : null,
      h('div.isian', h('label', 'Nama kategori'), kotakNama,
        h('span.bantuan', 'Langsung ikut muncul sebagai pilihan saat mencatat dan di saringan Riwayat.')),
      h('div.isian', h('label', 'Pagu bulanan (Rp) — boleh dikosongkan'), kotakPagu),
      h('div.chip-baris', { gaya: { marginBottom: '14px' } },
        [500000, 1000000, 2000000].map((n) =>
          h('button.chip', { type: 'button', onclick: () => { pagu = n; kotakPagu.value = n; } }, rpSingkat(n)))
      ),
      h('button.tombol.utama.lebar', { onclick: simpan }, 'Tambahkan')
    );
  });
}

/**
 * Usulan pagu dari rata-rata belanja beberapa bulan terakhir, dibulatkan ke
 * 50.000 supaya angkanya enak dibaca.
 */
function bukaUsulan(gambar) {
  const jumlahBulan = 6;
  const arsip = new Set(kategoriDisisihkan(JENIS));
  const perKat = new Map();
  const bulanTerpakai = new Set();
  for (const t of st.transaksi) {
    if (t.jenis !== JENIS) continue;
    const jarak = selisihBulan(t.bulan, st.bulan);
    if (jarak <= 0 || jarak > jumlahBulan) continue;
    const k = t.kategori || 'Lainnya';
    // Kategori yang sudah disisihkan tidak diusulkan lagi — Ryan sudah bilang
    // tidak mau memakainya, dan usulan tidak boleh menghidupkannya diam-diam.
    if (arsip.has(k)) continue;
    bulanTerpakai.add(t.bulan);
    perKat.set(k, (perKat.get(k) || 0) + t.nominal);
  }
  const n = Math.max(bulanTerpakai.size, 1);
  const usulan = [...perKat.entries()]
    .map(([kategori, total]) => ({
      bulan: st.bulan, kategori, pagu: Math.round(total / n / 50000) * 50000, jenis: JENIS
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
              usulan.forEach(taruhPagu);
              tutup(); gambar(); umumkan();
              try {
                const hasil = await kirimAksi('anggaran.simpan', { daftar: usulan });
                roti(hasil?.tertunda ? 'Tersimpan di HP, dikirim saat online' : 'Pagu tersimpan');
              } catch (e) { roti(e.message, 'salah'); }
            }
          }, `Pakai ${usulan.length} pagu ini`)
        )
      : h('p.kosong', 'Belum ada riwayat belanja untuk dijadikan acuan.')
  ));
}
