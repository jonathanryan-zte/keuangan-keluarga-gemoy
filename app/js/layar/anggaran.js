import { h, roti, kosongkan, sheet, konfirmasi, ikon } from '../ui.js';
import { rp, rpSingkat, namaBulan } from '../rupiah.js';
import {
  st, anggaranBulan, paguDisisihkan, perKategori, umumkan, selisihBulan,
  kategoriAktif, kategoriDisisihkan, pemakaiKategori, kelompokKategori,
  pakaiKategori, sisihkanKategori, taruhPagu, daftarPos, targetPos, paguPos, ringkas
} from '../toko.js';
import { tabelKategori } from '../grafik.js';
import { kirimAksi } from '../api.js';

// Pos yang sedang dibuka rinciannya. Bertahan antar penggambaran ulang supaya
// mengubah satu pagu tidak melempar Ryan kembali ke pos pertama.
let posTerpilih = null;

function pos() {
  const semua = daftarPos();
  return semua.includes(posTerpilih) ? posTerpilih : semua[0];
}

export function anggaran() {
  const wadah = h('div.papan.dua');
  const gambar = () => { kosongkan(wadah); isi(wadah, gambar); };
  gambar();
  return wadah;
}

function isi(wadah, gambar) {
  const kelompok = pos();
  const baris = anggaranBulan(st.bulan, kelompok);
  const totalPagu = baris.reduce((a, b) => a + b.pagu, 0);
  const totalPakai = baris.reduce((a, b) => a + b.terpakai, 0);

  wadah.appendChild(h('div.papan',
    kartuPos(gambar),
    h('div.kaca.kartu',
      h('div.kepala-kartu',
        h('h2', `Rincian ${kelompok}`),
        h('button.aksi', { onclick: () => bukaUsulan(kelompok, gambar) }, 'Usulkan')
      ),
      h('p.mini.samar', { gaya: { marginBottom: '10px' } },
        totalPagu
          ? `Terpakai ${rp(totalPakai)} dari ${rp(totalPagu)} · sisa pagu ${rp(totalPagu - totalPakai)}`
          : 'Pagu per kategori itu pilihan, bukan keharusan — pos di atas sudah punya targetnya sendiri dari tab TARGET.'),
      baris.length
        ? baris.map((b) => barisPagu(b, kelompok, gambar))
        : h('p.kosong', `Belum ada kategori ${kelompok} yang tercatat bulan ini.`),
      h('button.tombol.hantu.lebar', {
        gaya: { marginTop: '12px' },
        onclick: () => bukaTambahKategori(baris, kelompok, gambar)
      }, ikon('tambah', 17), 'Tambah kategori')
    ),
    kartuArsip(gambar)
  ));

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Rincian angka')),
      h('p.mini.samar', { gaya: { marginBottom: '10px' } },
        'Tabel ini menampilkan angka yang sama dengan grafik di Beranda — berguna kalau warna batangnya sulit dibedakan.'),
      tabelKategori(perKategori(st.bulan, kelompok))
    )
  ));
}

/**
 * Empat pos beserta targetnya. Targetnya persen dari tab `TARGET` dikali
 * pemasukan bulan ini — sama seperti REKAP BULANAN membacanya. Pagu rupiah
 * boleh dipasang untuk menimpanya, tapi itu pengecualian, bukan jalur utama.
 */
function kartuPos(gambar) {
  const t = targetPos();
  const timpa = paguPos();
  const r = ringkas();
  const terpilih = pos();

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', `Pos ${namaBulan(st.bulan)}`)),
    h('p.mini.samar', { gaya: { marginBottom: '10px' } },
      r.pemasukan
        ? `Target dihitung dari pemasukan bulan ini: ${rp(r.pemasukan)}. Ketuk sebuah pos untuk melihat rinciannya, ketuk sekali lagi untuk memaguinya.`
        : 'Belum ada pemasukan bulan ini, jadi target keempat pos masih nol.'),
    daftarPos().map((k) => {
      const p = t[k];
      const batas = timpa.get(k) || p.target;
      const persen = batas ? (p.terpakai / batas) * 100 : 0;
      const tingkat = !batas ? 'aman' : persen > 100 ? 'jebol' : persen >= 80 ? 'hampir' : 'aman';
      return h('button.pagu', {
        type: 'button',
        kelas: k === terpilih ? 'terpilih' : '',
        gaya: { width: '100%', textAlign: 'left', display: 'block' },
        onclick: () => {
          // Ketukan pertama membuka rinciannya; ketukan kedua pada pos yang
          // sama membuka setelan pagunya. Satu kartu, dua maksud, dan yang
          // paling sering dipakai tetap yang paling dangkal.
          if (k !== terpilih) { posTerpilih = k; gambar(); return; }
          bukaSetPaguPos(k, timpa.get(k) || 0, p, gambar);
        }
      },
        h('div.atas',
          h('span.nama', k.replace(/\s*\d+%$/, '')),
          h('span.lencana', { kelas: timpa.has(k) ? 'netral' : 'tosca' }, `${p.persen}%`),
          // Cukup satu angka di baris atas. Menaruh "terpakai / target" di sini
          // memaksa dua angka tujuh digit berbagi satu baris, dan di layar
          // 320px hasilnya pecah sampai garis miringnya berdiri sendirian.
          h('span.rp.angka', rp(p.terpakai))
        ),
        h('div.jalur',
          h('div.isi', { kelas: tingkat, gaya: { width: `${Math.min(persen, 100)}%` } })
        ),
        h('div.ket',
          h('span', timpa.has(k) ? `Pagu ${rpSingkat(batas)}` : `Target ${rpSingkat(batas)}`),
          h('span.kanan', persen > 100
            ? `Lewat ${rpSingkat(p.terpakai - batas)}`
            : `Sisa ${rpSingkat(batas - p.terpakai)}`)
        )
      );
    })
  );
}

function bukaSetPaguPos(kelompok, sekarang, p, gambar) {
  let nilai = sekarang;
  sheet(`Pagu ${kelompok}`, (tutup) => {
    const kotak = h('input', {
      type: 'number', inputmode: 'numeric', value: nilai || '', placeholder: '0',
      oninput: (e) => { nilai = Number(e.target.value) || 0; }
    });
    const simpan = async (angka) => {
      const rekam = { bulan: st.bulan, ruang: 'kelompok', nama: kelompok, pagu: angka };
      taruhPagu(rekam);
      tutup(); gambar(); umumkan();
      try {
        const hasil = await kirimAksi('anggaran.simpan', { daftar: [rekam] });
        roti(hasil?.tertunda ? 'Tersimpan di HP, dikirim saat online' : 'Pagu pos tersimpan');
      } catch (e) { roti(e.message, 'salah'); }
    };
    return h('div',
      h('p.kecil.samar', { gaya: { marginBottom: '12px' } },
        `Tanpa pagu, ${kelompok} memakai target ${p.persen}% dari pemasukan — bulan ini ${rp(p.target)}. ` +
        `Isi di sini kalau bulan ini memang direncanakan lain. Sudah terpakai ${rp(p.terpakai)}.`),
      h('div.isian', h('label', 'Pagu bulan ini (Rp)'), kotak),
      h('button.tombol.utama.lebar', { onclick: () => simpan(nilai) }, 'Simpan pagu'),
      sekarang
        ? h('button.tombol.hantu.lebar', {
            gaya: { marginTop: '8px' }, onclick: () => simpan(0)
          }, 'Kembali ke target persen')
        : null
    );
  });
}

function barisPagu(b, kelompok, gambar) {
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
    onclick: () => bukaSetPagu(b, kelompok, gambar)
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
  const kategori = kategoriDisisihkan();
  const pagu = paguDisisihkan();
  if (!kategori.length && !pagu.length) return null;

  const paguTerakhir = new Map(pagu.map((p) => [p.kategori, p.pagu]));
  const daftar = [...new Set([...kategori, ...paguTerakhir.keys()])].sort();

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Disisihkan')),
    h('p.mini.samar', { gaya: { marginBottom: '10px' } },
      'Kategori ini tidak lagi muncul di form catat, tapi transaksi lamanya tetap utuh dan tetap ikut terhitung di Laporan. ' +
      'Dropdown di tab PILIHAN tidak ikut berubah — yang disisihkan hanya pilihan di aplikasi.'),
    daftar.map((k) => h('div.rutin-baris',
      h('div', { gaya: { flex: 1 } },
        h('div', k),
        paguTerakhir.has(k)
          ? h('div.mini.samar', `Pagu terakhir ${rp(paguTerakhir.get(k))}`)
          : h('div.mini.samar', `${pemakaiKategori(k)} transaksi tersimpan`)
      ),
      h('button.aksi', { onclick: () => pulihkan(k, paguTerakhir.get(k) || 0, gambar) }, 'Pakai lagi')
    ))
  );
}

async function pulihkan(kategori, pagu, gambar) {
  const kelompok = kelompokKategori(kategori) || pos();
  pakaiKategori(kategori, kelompok);
  const rekam = { bulan: st.bulan, ruang: 'kategori', nama: kategori, pagu, kelompok };
  taruhPagu(rekam);
  gambar(); umumkan();
  try {
    await kirimAksi('kategori.pulihkan', { nama: kategori, kelompok });
    await kirimAksi('anggaran.simpan', { daftar: [rekam] });
    roti(`${kategori} dipakai lagi`);
  } catch (e) {
    roti('Tersimpan di HP, Sheet menyusul');
  }
}

function bukaSetPagu(b, kelompok, gambar) {
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
          const rekam = {
            bulan: st.bulan, ruang: 'kategori', nama: b.kategori, pagu: nilai,
            kelompok: b.kelompok || kelompok
          };
          if (b.arsip) pakaiKategori(b.kategori, rekam.kelompok);
          taruhPagu(rekam);
          tutup(); gambar(); umumkan();
          try {
            if (b.arsip) await kirimAksi('kategori.pulihkan', { nama: b.kategori, kelompok: rekam.kelompok });
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
  const dipakai = pemakaiKategori(b.kategori);
  const ya = await konfirmasi(`Sisihkan ${b.kategori}?`,
    dipakai
      ? `${dipakai} transaksi memakai kategori ini dan semuanya tetap tersimpan — angka di Beranda dan Laporan tidak berubah. ` +
        'Kategorinya hanya berhenti muncul sebagai pilihan saat mencatat, dan bisa dipakai lagi kapan saja.'
      : 'Kategorinya berhenti muncul saat mencatat. Pagu bulan-bulan yang sudah lewat tetap tersimpan sebagai riwayat.',
    'Sisihkan');
  if (!ya) return false;

  sisihkanKategori(b.kategori, st.bulan);
  gambar(); umumkan();
  try {
    await kirimAksi('kategori.sisihkan', { nama: b.kategori, sejak: st.bulan });
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
function bukaTambahKategori(barisSekarang, kelompok, gambar) {
  const sudahAda = new Set(barisSekarang.map((b) => b.kategori));
  const belumDipagu = kategoriAktif().filter((k) => !sudahAda.has(k));
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
      const kembar = [...kategoriAktif(), ...kategoriDisisihkan()]
        .find((k) => k.toLowerCase() === bersih.toLowerCase());
      if (kembar && sudahAda.has(kembar)) {
        roti(`${kembar} sudah ada di daftar pagu.`, 'salah');
        return;
      }
      const dipakai = kembar || bersih;
      const rekam = { bulan: st.bulan, ruang: 'kategori', nama: dipakai, pagu, kelompok };

      pakaiKategori(dipakai, kelompok);
      taruhPagu(rekam);
      tutup(); gambar(); umumkan();
      try {
        await kirimAksi('kategori.simpan', { nama: dipakai, kelompok });
        const hasil = await kirimAksi('anggaran.simpan', { daftar: [rekam] });
        roti(hasil?.tertunda ? 'Tersimpan di HP, dikirim saat online' : `${dipakai} ditambahkan`);
      } catch (e) { roti(e.message, 'salah'); }
    };

    return h('div',
      h('p.kecil.samar', { gaya: { marginBottom: '12px' } },
        `Kategori baru masuk ke tab KKG Kategori dengan saran pos ${kelompok}. ` +
        'Dropdown di tab PILIHAN tidak disentuh — salin namanya ke sana kalau mau ikut muncul saat mengetik langsung di Sheet.'),
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
function bukaUsulan(kelompok, gambar) {
  const jumlahBulan = 6;
  const arsip = new Set(kategoriDisisihkan());
  const perKat = new Map();
  const bulanTerpakai = new Set();
  for (const t of st.transaksi) {
    if (t.kelompok !== kelompok) continue;
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
    .map(([nama, total]) => ({
      bulan: st.bulan, ruang: 'kategori', nama,
      pagu: Math.round(total / n / 50000) * 50000, kelompok
    }))
    .filter((u) => u.pagu > 0)
    .sort((a, b) => b.pagu - a.pagu);

  sheet('Usulan pagu', (tutup) => h('div',
    usulan.length
      ? h('div',
          h('p.kecil.samar', { gaya: { marginBottom: '12px' } },
            `Dihitung dari rata-rata ${bulanTerpakai.size} bulan terakhir yang ada datanya, khusus pos ${kelompok}.`),
          h('div.kaca.kartu', { gaya: { marginBottom: '14px' } },
            usulan.map((u) => h('div.rutin-baris',
              h('div', { gaya: { flex: 1 } }, u.nama),
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
