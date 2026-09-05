import { h, ikon } from '../ui.js';
import { rp, rpSingkat, desimal, namaBulan, tanggalPanjang, bulanIni, geserBulan } from '../rupiah.js';
import { st, ringkas, perKategori, laju, transaksiBulan, jatuhTempoDekat, saldoSaving, anggaranBulan, belanjaAktif } from '../toko.js';
import { batangKategori, garisTren, batangSifat } from '../grafik.js';
import { bukaTambah } from './tambah.js';
import { barisTransaksi } from './riwayat.js';

export function beranda() {
  const r = ringkas();
  const l = laju();
  const kat = perKategori();
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
      kartuAturan(r),
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
      h('div', 'Keluar', h('b.angka', rpSingkat(r.pengeluaran))),
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
  return h('div.petak',
    sel('Pengeluaran tetap', rp(r.tetap), `${bagi(r.tetap, r.pengeluaran)}% dari total keluar`),
    sel('Rumah tangga', rp(r.rumahTangga), `Perkiraan akhir bulan ${rpSingkat(l.perkiraanAkhir)}`),
    sel('Saldo saving', rp(saldoSaving()), `${st.saving.length} catatan`),
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
    h('div.kepala-kartu', h('h2', 'Belanja rumah tangga'),
      h('span.aksi.samar.mini', rp(r.rumahTangga))),
    batangSifat(r.rtWajib, r.rtKeinginan),
    h('div', { gaya: { marginTop: '16px' } }, batangKategori(kat))
  );
}

function kartuAturan(r) {
  const p = st.profil.persen;
  const baris = [
    ['Perpuluhan', p.perpuluhan, r.perpuluhan],
    ['Saving', p.saving, r.saving],
    ['Entertain', p.entertain, r.entertain]
  ];
  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Perpuluhan, saving, entertain')),
    h('p.mini.samar', { gaya: { marginBottom: '12px' } },
      `Dihitung dari penghasilan yang jadi basis bulan ini: ${rp(r.basis)}`),
    baris.map(([nama, persen, nilai]) => h('div.pagu',
      h('div.atas',
        h('span.nama', nama),
        h('span.lencana.tosca', `${persen}%`),
        h('span.rp.angka', rp(nilai))
      )
    )),
    r.basis === 0 ? h('p.mini.samar', { gaya: { marginTop: '8px' } },
      'Belum ada pemasukan berkategori Gaji Pokok / Gaji BRU / Tunjangan / Uang Makan di bulan ini.') : null
  );
}

function kartuTren() {
  const bulan = [];
  for (let i = 11; i >= 0; i--) bulan.push(geserBulan(bulanIni(), -i));
  const baris = bulan
    .map((b) => {
      const x = ringkas(b);
      return { bulan: b, pemasukan: x.pemasukan, pengeluaran: x.pengeluaran };
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
