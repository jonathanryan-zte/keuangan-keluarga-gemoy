import { h, ikon, kosongkan, roti } from './ui.js';
import { namaBulan, bulanIni, geserBulan } from './rupiah.js';
import { st, dengar, umumkan, muatCache, terapkanMuatan, bulanTersedia } from './toko.js';
import { masuk, muatAwal, token, setToken, urlApi, setUrlApi, kirimAntrian, GagalAuth, GagalJaringan } from './api.js';
import { antrian, mintaAwet } from './simpanan.js';
import { bukaTambah } from './layar/tambah.js';
import { beranda } from './layar/beranda.js';
import { riwayat } from './layar/riwayat.js';
import { anggaran } from './layar/anggaran.js';
import { rutin } from './layar/rutin.js';
import { belanja } from './layar/belanja.js';
import { laporan } from './layar/laporan.js';
import { pengaturan } from './layar/pengaturan.js';

const LAYAR = {
  beranda: { judul: 'Beranda', ikon: 'beranda', buat: beranda },
  riwayat: { judul: 'Riwayat', ikon: 'riwayat', buat: riwayat },
  anggaran: { judul: 'Anggaran', ikon: 'anggaran', buat: anggaran },
  rutin: { judul: 'Tagihan', ikon: 'rutin', buat: rutin },
  // `tanpaBulan`: layar yang isinya tidak terikat bulan. Daftar belanja dan
  // Pengaturan tidak punya versi "September" — pemilih bulan di atasnya bukan
  // cuma tidak berguna, tapi menyesatkan, seolah daftarnya berganti tiap bulan.
  belanja: { judul: 'Belanja', ikon: 'keranjang', buat: belanja, tanpaBulan: true },
  laporan: { judul: 'Laporan', ikon: 'laporan', buat: laporan },
  pengaturan: { judul: 'Pengaturan', ikon: 'gigi', buat: pengaturan, tanpaBulan: true }
};
const NAV = ['beranda', 'riwayat', null, 'anggaran', 'rutin'];

const akar = document.getElementById('akar');

// ---------------------------------------------------------------- gerbang --

function layarSetup() {
  const kotak = h('input', {
    type: 'url', value: urlApi(),
    placeholder: 'https://script.google.com/macros/s/…/exec'
  });
  return h('div.gerbang',
    h('div.kaca.kotak',
      h('img', { src: 'ikon/kkg.svg', alt: '' }),
      h('h1', 'Halo!'),
      h('p.kecil.lembut', { gaya: { margin: '8px 0 18px' } },
        'Sekali saja: tempel alamat Web App Apps Script yang menempel di Google Sheet keluarga Anda.'),
      h('div.isian', kotak),
      h('button.tombol.utama.lebar', {
        onclick: () => {
          const v = kotak.value.trim();
          if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(v)) {
            roti('Alamatnya harus diakhiri /exec', 'salah');
            return;
          }
          setUrlApi(v);
          mulai();
        }
      }, 'Sambungkan'),
      h('p.mini.samar', { gaya: { marginTop: '14px' } }, 'Langkahnya ada di PANDUAN.md')
    )
  );
}

function layarPin() {
  let pin = '';
  const titik = h('div.pin-titik', ...Array.from({ length: 6 }, () => h('i')));
  const pesan = h('div.salah');
  const kotak = h('div.kaca.kotak');

  const gambarTitik = () => {
    [...titik.children].forEach((el, i) => el.classList.toggle('isi', i < pin.length));
  };
  const coba = async () => {
    pesan.textContent = '';
    try {
      const hasil = await masuk(pin);
      setToken(hasil.token);
      if (hasil.profil) st.profil = { ...st.profil, ...hasil.profil };
      mulai();
    } catch (e) {
      pin = ''; gambarTitik();
      pesan.textContent = e.message;
      kotak.classList.remove('goyang');
      void kotak.offsetWidth;
      kotak.classList.add('goyang');
    }
  };
  const tekan = (d) => {
    if (pin.length >= 6) return;
    pin += d; gambarTitik();
    if (pin.length >= 4) setTimeout(() => { if (pin.length >= 4) coba(); }, 120);
  };

  kotak.append(
    h('img', { src: 'ikon/kkg.svg', alt: '' }),
    h('h1', 'Keuangan Keluarga Gemoy'),
    h('p.kecil.lembut', { gaya: { marginTop: '6px' } }, 'Masukkan PIN keluarga'),
    titik, pesan,
    h('div.numpad', { gaya: { marginTop: '14px' } },
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
        h('button', { type: 'button', onclick: () => tekan(d) }, d)),
      h('button.kecil', { type: 'button', onclick: () => { pin = ''; gambarTitik(); } }, 'Ulang'),
      h('button', { type: 'button', onclick: () => tekan('0') }, '0'),
      h('button.kecil', { type: 'button', onclick: () => { pin = pin.slice(0, -1); gambarTitik(); } }, '⌫')
    )
  );

  document.addEventListener('keydown', function ketik(e) {
    if (!document.body.contains(kotak)) { document.removeEventListener('keydown', ketik); return; }
    if (/^\d$/.test(e.key)) tekan(e.key);
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); gambarTitik(); }
    else if (e.key === 'Enter' && pin.length >= 4) coba();
  });

  return h('div.gerbang', kotak);
}

// ------------------------------------------------------------------ rangka --

function kepala() {
  const pindah = (n) => { st.bulan = geserBulan(st.bulan, n); gambar(); };
  return h('div',
    h('header.kepala',
      h('div.merek',
        h('img', { src: 'ikon/kkg.svg', alt: 'KKG' }),
        h('div.judul', LAYAR[st.layar].judul)
      ),
      h('div.kanan',
        st.antri ? h('span.status-sinkron.antri', h('span.titik'), String(st.antri)) : null,
        !st.online ? h('span.status-sinkron.mati', h('span.titik'), 'Luring') : null,
        // Belanja, Laporan & Pengaturan tidak muat di bilah bawah, jadi ditaruh
        // di sini sebagai ikon — bukan diulang sebagai chip yang menduplikasi
        // navigasi.
        tombolKepala('belanja'),
        tombolKepala('laporan'),
        tombolKepala('pengaturan')
      )
    ),
    LAYAR[st.layar].tanpaBulan ? null : h('div.baris-bulan',
      h('div.pilih-bulan',
        h('button', { 'aria-label': 'Bulan sebelumnya', onclick: () => pindah(-1) }, ikon('panahKiri', 16)),
        h('div.label', namaBulan(st.bulan)),
        h('button', {
          'aria-label': 'Bulan berikutnya',
          disabled: st.bulan >= bulanIni(),
          onclick: () => pindah(1)
        }, ikon('panahKanan', 16))
      ),
      st.bulan !== bulanIni()
        ? h('button.tombol.hantu.kini', { onclick: () => { st.bulan = bulanIni(); gambar(); } }, 'Bulan ini')
        : null
    )
  );
}

function tombolKepala(kunci) {
  return h('a.tombol-kepala', {
    href: '#' + kunci, kelas: st.layar === kunci ? 'aktif' : '',
    'aria-label': LAYAR[kunci].judul, title: LAYAR[kunci].judul
  }, ikon(LAYAR[kunci].ikon, 19));
}

function navigasi() {
  return h('nav.nav', { 'aria-label': 'Navigasi utama' },
    NAV.map((kunci) => kunci === null
      ? h('button.tambah', { 'aria-label': 'Catat transaksi', onclick: () => bukaTambah() }, ikon('tambah'))
      : h('a', {
          href: '#' + kunci, kelas: st.layar === kunci ? 'aktif' : '',
          'aria-current': st.layar === kunci ? 'page' : null
        }, ikon(LAYAR[kunci].ikon), LAYAR[kunci].judul)
    )
  );
}

function gambar() {
  kosongkan(akar);
  akar.appendChild(kepala());
  akar.appendChild(LAYAR[st.layar].buat());
  // Bilah bawah hidup di luar #akar supaya tetap menempel saat isi digulir,
  // jadi harus dibuang sendiri — kalau tidak, tiap gambar ulang menumpuk satu
  // bilah baru di atas yang lama.
  document.querySelectorAll('body > .nav').forEach((n) => n.remove());
  document.body.appendChild(navigasi());
}

// ------------------------------------------------------------------ mulai --

async function mulai() {
  kosongkan(akar);
  document.querySelectorAll('.nav').forEach((n) => n.remove());

  if (!urlApi()) { akar.appendChild(layarSetup()); return; }
  if (!token()) { akar.appendChild(layarPin()); return; }

  const adaCache = muatCache();
  if (adaCache) { st.siap = true; gambar(); }
  else akar.appendChild(h('div.gerbang', h('div.kaca.kotak',
    h('img', { src: 'ikon/kkg.svg', alt: '' }),
    h('p.lembut', 'Mengambil data dari Google Sheet…'))));

  try {
    await kirimAntrian();
    const data = await muatAwal(geserBulan(bulanIni(), -13));
    terapkanMuatan(data);
    gambar();
  } catch (e) {
    if (e instanceof GagalAuth) { mulai(); return; }
    if (!adaCache) {
      kosongkan(akar);
      akar.appendChild(h('div.gerbang', h('div.kaca.kotak',
        h('h2', 'Belum bisa mengambil data'),
        h('p.kecil.lembut', { gaya: { margin: '10px 0 16px' } }, e.message),
        h('button.tombol.utama.lebar', { onclick: () => mulai() }, 'Coba lagi'))));
      return;
    }
    roti(e instanceof GagalJaringan ? 'Luring — menampilkan data terakhir' : e.message);
  }
  perbaruiAntrian();
}

async function perbaruiAntrian() {
  st.antri = await antrian.jumlah();
  if (st.siap) gambar();
}

// ----------------------------------------------------------------- pemicu --

window.addEventListener('hashchange', () => {
  const k = location.hash.slice(1);
  if (LAYAR[k]) { st.layar = k; gambar(); window.scrollTo(0, 0); }
});
window.addEventListener('kkg:render', () => {
  location.hash = st.layar;
  gambar();
});
window.addEventListener('online', async () => {
  st.online = true;
  const hasil = await kirimAntrian();
  if (hasil.terkirim) roti(`${hasil.terkirim} catatan tertunda terkirim`);
  perbaruiAntrian();
});
window.addEventListener('offline', () => { st.online = false; if (st.siap) gambar(); });

dengar(() => { if (st.siap) { gambar(); perbaruiAntrian(); } });

if (location.hash && LAYAR[location.hash.slice(1)]) st.layar = location.hash.slice(1);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* tetap jalan tanpa luring */ });
}
mintaAwet();
mulai();
