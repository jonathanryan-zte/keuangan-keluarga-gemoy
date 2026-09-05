import { h, roti, kosongkan, sheet, ikon, konfirmasi } from '../ui.js';
import { rp, rpSingkat, namaBulan, tanggalPanjang, hariIni } from '../rupiah.js';
import {
  st, statusRutin, taruhTransaksi, buangTransaksi, umumkan, idTransaksi,
  pilihanKategori, PENANDA_RUTIN
} from '../toko.js';
import { panggil, kirimTransaksi } from '../api.js';

export function rutin() {
  const wadah = h('div.papan.dua');
  const gambar = () => { kosongkan(wadah); isi(wadah, gambar); };
  gambar();
  return wadah;
}

function isi(wadah, gambar) {
  const semua = statusRutin();
  const tagihan = semua.filter((s) => s.rutin.tipe !== 'cicilan');
  const cicilan = semua.filter((s) => s.rutin.tipe === 'cicilan');
  const belum = semua.filter((s) => !s.terbayar);
  const totalBelum = belum.reduce((a, b) => a + b.rutin.nominal, 0);

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu',
        h('h2', `Tagihan ${namaBulan(st.bulan)}`),
        h('button.aksi', { onclick: () => bukaUbahRutin(null, gambar) }, 'Tambah')
      ),
      h('p.mini.samar', { gaya: { marginBottom: '6px' } },
        belum.length
          ? `${belum.length} belum dibayar · ${rp(totalBelum)}`
          : 'Semua tagihan bulan ini sudah dicentang.'),
      tagihan.length
        ? tagihan.map((s) => barisRutin(s, gambar))
        : h('p.kosong', 'Belum ada tagihan rutin.')
    )
  ));

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Cicilan berjalan')),
      cicilan.length
        ? cicilan.map((s) => barisRutin(s, gambar, true))
        : h('p.kosong', 'Tidak ada cicilan yang masih berjalan.')
    )
  ));
}

function barisRutin(s, gambar, tampilkanTermin) {
  const telat = !s.terbayar && s.jatuhTempo < hariIni();
  return h('div.rutin-baris', { kelas: telat ? 'telat' : '' },
    h('button.centang', {
      type: 'button', kelas: s.terbayar ? 'ya' : '',
      'aria-label': s.terbayar ? `Batalkan centang ${s.rutin.nama}` : `Tandai ${s.rutin.nama} sudah dibayar`,
      'aria-pressed': String(s.terbayar),
      onclick: () => tandai(s, gambar)
    }, ikon('centang', 15)),
    h('button', {
      type: 'button', gaya: { flex: '1', minWidth: '0', textAlign: 'left' },
      onclick: () => bukaUbahRutin(s.rutin, gambar)
    },
      h('div.tebal', { gaya: { fontSize: '14px' } }, s.rutin.nama),
      h('div.mini.tempo.samar',
        tampilkanTermin && s.terminKe
          ? `Termin ke-${s.terminKe} dari ${s.rutin.totalTermin} · lunas ${namaBulan(s.bulanLunas)}`
          : `Jatuh tempo ${tanggalPanjang(s.jatuhTempo)}`)
    ),
    h('div.angka.tebal', rpSingkat(s.rutin.nominal))
  );
}

/**
 * Mencentang tagihan = membuat transaksi TETAP dengan penanda `#rutin:<id>`.
 * Tidak ada baris "belum dibayar" yang dibuat lebih dulu, jadi Sheet tetap
 * hanya berisi uang yang benar-benar keluar.
 */
async function tandai(s, gambar) {
  if (s.terbayar) {
    const ya = await konfirmasi('Batalkan centang?',
      `Transaksi "${s.rutin.nama}" sebesar ${rp(s.transaksi.nominal)} akan dihapus dari catatan bulan ini.`,
      'Batalkan centang');
    if (!ya) return;
    buangTransaksi(s.transaksi.id);
    gambar(); umumkan();
    try { await panggil('transaksi.hapus', { id: s.transaksi.id }); } catch (e) { /* menyusul */ }
    return;
  }
  const t = {
    id: idTransaksi(),
    tanggal: s.jatuhTempo > hariIni() ? hariIni() : s.jatuhTempo,
    bulan: s.bulan,
    jenis: s.rutin.jenis || 'TETAP',
    kategori: s.rutin.kategori,
    item: s.rutin.nama,
    nominal: s.rutin.nominal,
    sifat: s.rutin.sifat || 'WAJIB',
    catatan: PENANDA_RUTIN + s.rutin.id,
    sumber: 'rutin'
  };
  taruhTransaksi(t);
  gambar(); umumkan();
  const hasil = await kirimTransaksi([t]);
  roti(hasil?.tertunda ? `${s.rutin.nama} dicatat, dikirim saat online` : `${s.rutin.nama} tercatat lunas`);
  umumkan();
}

function bukaUbahRutin(r, gambar) {
  const f = r ? { ...r } : {
    id: null, nama: '', tipe: 'tagihan', jenis: 'TETAP', kategori: 'Utilitas',
    nominal: 0, sifat: 'WAJIB', hariJatuhTempo: 1, mulai: '', totalTermin: 0,
    terminTerbayar: 0, aktif: true
  };
  sheet(r ? 'Ubah tagihan' : 'Tagihan baru', (tutup) => h('div',
    h('div.isian', h('label', 'Nama'),
      h('input', { type: 'text', value: f.nama, oninput: (e) => { f.nama = e.target.value; } })),
    h('div.isian', h('label', 'Nominal per bulan (Rp)'),
      h('input', { type: 'number', inputmode: 'numeric', value: f.nominal || '', oninput: (e) => { f.nominal = Number(e.target.value) || 0; } })),
    h('div.isian', h('label', 'Kategori'),
      h('select', { onchange: (e) => { f.kategori = e.target.value; } },
        pilihanKategori('TETAP', f.kategori).map((k) =>
          h('option', { value: k, selected: f.kategori === k }, k)))),
    h('div.isian', h('label', 'Tanggal jatuh tempo tiap bulan'),
      h('input', { type: 'number', min: '1', max: '31', value: f.hariJatuhTempo, oninput: (e) => { f.hariJatuhTempo = Number(e.target.value) || 1; } })),
    h('div.isian', h('label', 'Jenis'),
      h('div.chip-baris', ['tagihan', 'cicilan'].map((v) =>
        h('button.chip', {
          type: 'button', kelas: f.tipe === v ? 'aktif' : '',
          onclick: (e) => {
            f.tipe = v;
            e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('aktif'));
            e.target.classList.add('aktif');
            e.target.closest('.sheet').querySelector('.blok-cicilan').hidden = v !== 'cicilan';
          }
        }, v === 'tagihan' ? 'Tagihan bulanan' : 'Cicilan berjangka'))
      )),
    h('div.blok-cicilan', { hidden: f.tipe !== 'cicilan' },
      h('div.isian', h('label', 'Jumlah termin'),
        h('input', { type: 'number', min: '1', value: f.totalTermin || '', oninput: (e) => { f.totalTermin = Number(e.target.value) || 0; } })),
      h('div.isian', h('label', 'Mulai bulan'),
        h('input', { type: 'month', value: (f.mulai || '').slice(0, 7), oninput: (e) => { f.mulai = e.target.value; } }))
    ),
    h('div', { gaya: { display: 'grid', gap: '8px', marginTop: '6px' } },
      h('button.tombol.utama.lebar', {
        onclick: async () => {
          if (!f.nama.trim()) { roti('Namanya belum diisi.', 'salah'); return; }
          if (!f.id) f.id = `rtn-${Date.now().toString(36)}`;
          const i = st.rutin.findIndex((x) => x.id === f.id);
          if (i >= 0) st.rutin[i] = { ...f }; else st.rutin.push({ ...f });
          tutup(); gambar(); umumkan();
          try { await panggil('rutin.simpan', { daftar: [f] }); roti('Tersimpan'); }
          catch (e) { roti('Tersimpan di HP, Sheet menyusul'); }
        }
      }, 'Simpan'),
      r ? h('button.tombol.bahaya.lebar', {
        onclick: async () => {
          const ya = await konfirmasi('Hapus tagihan?', `"${r.nama}" akan dihapus dari daftar rutin. Transaksi yang sudah tercatat tidak ikut terhapus.`, 'Hapus');
          if (!ya) return;
          st.rutin = st.rutin.filter((x) => x.id !== r.id);
          tutup(); gambar(); umumkan();
          try { await panggil('rutin.hapus', { id: r.id }); } catch (e) { /* menyusul */ }
        }
      }, 'Hapus') : null
    )
  ));
}
