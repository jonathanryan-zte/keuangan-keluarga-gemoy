import { h, ikon } from '../ui.js';
import { rp, rpSingkat, desimal, namaBulan, tanggalPanjang, bulanIni, geserBulan } from '../rupiah.js';
import {
  st, ringkas, perKategori, laju, transaksiBulan, jatuhTempoDekat,
  belanjaAktif, daftarPos, targetPos, terkumpulPos, daftarTarget
} from '../toko.js';
import { batangKategori, garisTren, batangSifat } from '../grafik.js';
import { urutMendesak } from '../target.js';
import { bukaTambah } from './tambah.js';
import { lencanaTarget, kiriTarget, kananTarget } from './target.js';
import { barisTransaksi } from './riwayat.js';

export function beranda() {
  const r = ringkas();
  const l = laju();
  // Kartunya berjudul pos harian dan angka kepalanya angka pos harian, jadi
  // batangnya harus pos itu juga. Tanpa saringan ini, kepalanya menulis
  // Rp1.966.480 sementara batang di bawahnya memajang Investasi Rp7.200.000
  // dari pos Saving — dua ukuran berbeda dalam satu kartu.
  const kat = perKategori(st.bulan, daftarPos()[0]);
  const tempo = jatuhTempoDekat(7);
  const belanja = belanjaAktif();

  return h('div.papan.dua',
    h('div.papan',
      kartuSisa(r, l),
      kartuAngka(r, l),
      tempo.length ? kartuTempo(tempo) : null,
      belanja.length ? kartuBelanja(belanja) : null,
      kartuKategori(kat, r)
    ),
    h('div.papan',
      kartuPos(),
      kartuTarget(),
      kartuTren(),
      kartuTerakhir()
    )
  );
}

function kartuSisa(r, l) {
  const jalan = Math.min((l.hariBerjalan / l.hari) * 100, 100);
  return h('div.kaca.sisa',
    h('div.label', `Sisa ${namaBulan(st.bulan)}`),
    h('div.nilai.angka', { kelas: r.sisa < 0 ? 'minus' : '' }, rp(r.sisa)),
    h('div.rinci',
      h('div', 'Masuk', h('b.angka', rpSingkat(r.pemasukan))),
      h('div', 'Keluar', h('b.angka', rpSingkat(r.totalKeluar))),
      h('div', 'Rata-rata/hari', h('b.angka', rpSingkat(l.rata)))
    ),
    h('div.bar-hari',
      h('div.jalur', h('div.isi', { gaya: { width: `${jalan}%` } })),
      h('div.ket',
        h('span', l.iniBulanBerjalan ? `Hari ke-${l.hariBerjalan} dari ${l.hari}` : `${l.hari} hari`),
        h('span.kanan', l.amanSampai
          ? `Aman sampai ${l.amanSampai}`
          : (r.sisa < 0 ? 'Lebih besar pasak' : 'Belum ada belanja'))
      )
    )
  );
}

function kartuAngka(r, l) {
  const pos = daftarPos();
  const saving = pos.find((k) => /saving/i.test(k)) || pos[1];
  return h('div.petak',
    sel('Belanja harian', rp(r.harian), `Perkiraan akhir bulan ${rpSingkat(l.perkiraanAkhir)}`),
    sel('Dialokasikan', rp(r.totalKeluar - r.harian), `${bagi(r.totalKeluar - r.harian, r.totalKeluar)}% dari total keluar`),
    // Saving tidak lagi punya tabel sendiri: ia hanya transaksi berkelompok
    // `Saving 30%`, jadi saldonya dijumlah dari riwayat dan tidak bisa
    // berselisih dengan angka mana pun.
    sel('Terkumpul saving', rp(terkumpulPos(saving)), 'sejak awal catatan'),
    sel('Jumlah transaksi', String(r.jumlah), l.iniBulanBerjalan ? `${desimal(r.jumlah / Math.max(l.hariBerjalan, 1))} per hari` : '')
  );
}

function sel(k, v, n) {
  return h('div.sel', h('div.k', k), h('div.v.angka', v), n ? h('div.n', n) : null);
}

function bagi(a, b) { return b ? Math.round((a / b) * 100) : 0; }

function kartuTempo(tempo) {
  const hariIniIso = new Date().toISOString().slice(0, 10);
  return h('div.kaca.kartu',
    h('div.kepala-kartu',
      ikon('lonceng', 18),
      h('h2', 'Jatuh tempo minggu ini'),
      h('span.lencana.netral', String(tempo.length))
    ),
    tempo.slice(0, 5).map((s) => h('div.rutin-baris', { kelas: s.jatuhTempo < hariIniIso ? 'telat' : '' },
      h('div', { gaya: { flex: '1', minWidth: '0' } },
        h('div.tebal', { gaya: { fontSize: '14px' } }, s.rutin.nama),
        h('div.mini.tempo', { kelas: 'samar' },
          s.jatuhTempo < hariIniIso ? `Lewat ${tanggalPanjang(s.jatuhTempo)}` : tanggalPanjang(s.jatuhTempo),
          s.terminKe ? ` · cicilan ke-${s.terminKe} dari ${s.rutin.totalTermin}` : '')
      ),
      h('div.angka.tebal', rpSingkat(s.rutin.nominal))
    )),
    h('button.tombol.hantu.lebar', {
      gaya: { marginTop: '12px' },
      onclick: () => { st.layar = 'rutin'; window.dispatchEvent(new Event('kkg:render')); }
    }, 'Buka daftar tagihan')
  );
}

/**
 * Pengingat kecil, bukan salinan layarnya: cukup untuk tahu daftarnya belum
 * kosong sebelum berangkat. Mencentangnya tetap di layar Belanja, supaya tidak
 * ada dua tempat yang bisa mengubah hal yang sama.
 */
function kartuBelanja(daftar) {
  return h('div.kaca.kartu',
    h('div.kepala-kartu',
      ikon('keranjang', 18),
      h('h2', 'Daftar belanja'),
      h('span.lencana.netral', String(daftar.length))
    ),
    daftar.slice(0, 5).map((b) => h('div.rutin-baris',
      h('div', { gaya: { flex: '1', minWidth: '0' } }, b.nama)
    )),
    daftar.length > 5
      ? h('p.mini.samar', { gaya: { marginTop: '8px' } }, `dan ${daftar.length - 5} lagi`)
      : null,
    h('button.tombol.hantu.lebar', {
      gaya: { marginTop: '12px' },
      onclick: () => { st.layar = 'belanja'; window.dispatchEvent(new Event('kkg:render')); }
    }, 'Buka daftar belanja')
  );
}

function kartuKategori(kat, r) {
  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', `Belanja ${daftarPos()[0]}`),
      h('span.aksi.samar.mini', rp(r.harian))),
    batangSifat(r.harianWajib, r.harianKeinginan),
    h('div', { gaya: { marginTop: '16px' } }, batangKategori(kat))
  );
}

/**
 * Empat pos, target rupiahnya, dan berapa yang sudah terpakai. Persennya
 * datang dari tab TARGET; targetnya sendiri persen itu dikali pemasukan bulan
 * ini — persis cara REKAP BULANAN membacanya.
 */
function kartuPos() {
  const t = targetPos();
  const r = ringkas();
  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Empat pos bulan ini')),
    h('p.mini.samar', { gaya: { marginBottom: '12px' } },
      r.pemasukan
        ? `Dihitung dari pemasukan bulan ini: ${rp(r.pemasukan)}`
        : 'Belum ada pemasukan bulan ini, jadi targetnya masih nol.'),
    daftarPos().map((k) => {
      const p = t[k];
      const lewat = p.target > 0 && p.terpakai > p.target;
      return h('div.pagu',
        h('div.atas',
          h('span.nama', k.replace(/\s*\d+%$/, '')),
          h('span.lencana.tosca', `${p.persen}%`),
          h('span.rp.angka', rp(p.terpakai))
        ),
        h('div.jalur',
          h('div.isi', {
            kelas: !p.target ? 'aman' : lewat ? 'jebol' : p.bagian >= 80 ? 'hampir' : 'aman',
            gaya: { width: `${Math.min(p.bagian || 0, 100)}%` }
          })
        ),
        h('div.ket',
          h('span', `Target ${rpSingkat(p.target)}`),
          h('span.kanan', p.target
            ? (lewat ? `Lewat ${rpSingkat(p.terpakai - p.target)}` : `Sisa ${rpSingkat(p.sisa)}`)
            : '—')
        )
      );
    })
  );
}

/**
 * Ringkasan target — tiga yang paling perlu dilihat bulan ini, bukan keenamnya.
 * Enam batang berjajar di Beranda membuat kartu ini setinggi layar sendiri,
 * dan tidak satu pun dari enam itu jadi lebih mudah dibaca. Sisanya, beserta
 * tombol setornya, ada di layar Target — yang hanya bisa dibuka dari sini.
 */
function kartuTarget() {
  const hidup = urutMendesak(daftarTarget())
    .filter((t) => t.tahap !== 'berikutnya' && t.tahap !== 'selesai');
  if (!hidup.length) return null;

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Target keluarga')),
    hidup.slice(0, 3).map((t) => h('div.pagu',
      h('div.atas',
        h('span.nama', t.nama),
        h('span.lencana.tosca', lencanaTarget(t)),
        h('span.rp.angka', rpSingkat(t.jenis === 'cicilan' ? t.komitmen : t.nilai))
      ),
      h('div.jalur', h('div.isi.aman', { gaya: { width: `${t.persen}%` } })),
      h('div.ket',
        h('span', kiriTarget(t)),
        h('span.kanan', kananTarget(t))
      )
    )),
    h('a.tombol.hantu.lebar', { href: '#target', gaya: { marginTop: '12px' } },
      ikon('target', 17),
      hidup.length > 3 ? `Semua ${hidup.length} target` : 'Buka layar Target')
  );
}

function kartuTren() {
  const bulan = [];
  for (let i = 11; i >= 0; i--) bulan.push(geserBulan(bulanIni(), -i));
  const baris = bulan
    .map((b) => {
      const x = ringkas(b);
      return { bulan: b, pemasukan: x.pemasukan, pengeluaran: x.totalKeluar };
    })
    .filter((b, i, arr) => b.pemasukan || b.pengeluaran || i === arr.length - 1);

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Tren 12 bulan')),
    garisTren(baris)
  );
}

function kartuTerakhir() {
  const t = transaksiBulan().slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 6);
  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Catatan terakhir'),
      h('button.aksi', { onclick: () => bukaTambah() }, 'Tambah')),
    t.length
      ? h('div.daftar', t.map((x) => barisTransaksi(x)))
      : h('p.kosong', 'Belum ada catatan di bulan ini. Ketuk tombol + untuk mulai.')
  );
}
