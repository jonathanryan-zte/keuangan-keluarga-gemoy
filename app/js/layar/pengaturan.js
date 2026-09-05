import { h, roti, kosongkan, konfirmasi } from '../ui.js';
import { rp, namaBulan, bulanIni, geserBulan } from '../rupiah.js';
import { st, umumkan, saldoSaving, terapkanMuatan } from '../toko.js';
import { panggil, muatAwal, urlApi, setUrlApi, keluar, kirimAntrian } from '../api.js';
import { antrian, lokal } from '../simpanan.js';

/**
 * Hasil sinkron terakhir. Disimpan di luar fungsi layar supaya tidak ikut
 * hilang saat layarnya digambar ulang — dan sinkron memang selalu diakhiri
 * gambar ulang, karena angkanya berubah.
 */
let kabarSinkron = null;

export function pengaturan() {
  const wadah = h('div.papan.dua');
  const gambar = () => { kosongkan(wadah); isi(wadah, gambar); };
  gambar();
  return wadah;
}

function isi(wadah, gambar) {
  const p = st.profil.persen;

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Pengingat di HP')),
      blokNotifikasi()
    ),
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Aturan 10 / 30 / 20')),
      h('p.kecil.lembut', { gaya: { marginBottom: '12px' } },
        'Persentase dihitung dari pemasukan berkategori ' +
        st.profil.basisPersenKategori.join(', ') +
        ' — mengikuti rumus yang selama ini dipakai di Sheet, yang memang tidak menghitung Gaji Ryan, THR, maupun fee.'),
      ['perpuluhan', 'saving', 'entertain'].map((k) => h('div.isian',
        h('label', k.charAt(0).toUpperCase() + k.slice(1) + ' (%)'),
        h('input', {
          type: 'number', min: '0', max: '100', value: p[k],
          onchange: (e) => { p[k] = Number(e.target.value) || 0; }
        })
      )),
      h('button.tombol.tosca.lebar', {
        onclick: async () => {
          try {
            await panggil('pengaturan.simpan', {
              peta: {
                persen_perpuluhan: String(p.perpuluhan),
                persen_saving: String(p.saving),
                persen_entertain: String(p.entertain)
              }
            });
            roti('Tersimpan'); umumkan();
          } catch (e) { roti(e.message, 'salah'); }
        }
      }, 'Simpan persentase')
    )
  ));

  wadah.appendChild(h('div.papan',
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Sambungan Google Sheet')),
      h('div.isian',
        h('label', 'URL Web App Apps Script'),
        h('input', {
          type: 'url', value: urlApi(), placeholder: 'https://script.google.com/macros/s/…/exec',
          onchange: (e) => setUrlApi(e.target.value)
        }),
        h('span.bantuan', 'Diambil dari tombol Deploy di editor Apps Script. Lihat PANDUAN.md.')
      ),
      h('div', { gaya: { display: 'grid', gap: '8px' } },
        h('button.tombol.hantu.lebar', {
          onclick: async () => {
            try { await panggil('ping'); roti('Sambungan sehat'); }
            catch (e) { roti(e.message, 'salah'); }
          }
        }, 'Uji sambungan'),
        h('button.tombol.hantu.lebar', {
          onclick: async () => {
            const hasil = await kirimAntrian();
            roti(hasil.terkirim ? `${hasil.terkirim} catatan tertunda terkirim` : 'Tidak ada yang tertunda');
            gambar();
          }
        }, 'Kirim catatan tertunda'),
        h('button.tombol.bahaya.lebar', {
          onclick: async () => {
            const ya = await konfirmasi('Keluar?',
              'PIN akan diminta lagi saat membuka aplikasi. Catatan yang belum terkirim tetap tersimpan di HP.', 'Keluar');
            if (!ya) return;
            keluar();
            location.reload();
          }
        }, 'Keluar')
      )
    ),
    h('div.kaca.kartu',
      h('div.kepala-kartu', h('h2', 'Data')),
      h('div.petak',
        h('div.sel', h('div.k', 'Transaksi tersimpan'), h('div.v.angka', String(st.transaksi.length))),
        h('div.sel', h('div.k', 'Bulan tercatat'),
          h('div.v.angka', String(new Set(st.transaksi.map((t) => t.bulan)).size))),
        h('div.sel', h('div.k', 'Tagihan rutin'), h('div.v.angka', String(st.rutin.length))),
        h('div.sel', h('div.k', 'Saldo saving'), h('div.v.angka', rp(saldoSaving())))
      ),
      h('p.mini.samar', { gaya: { marginTop: '12px' } },
        'Sumber kebenaran datanya tetap Google Sheet Anda. Aplikasi ini hanya menyimpan salinan sementara di HP supaya tetap bisa dibuka saat tidak ada sinyal.'),
      h('button.tombol.hantu.lebar', {
        gaya: { marginTop: '10px' },
        onclick: async () => {
          const ya = await konfirmasi('Muat ulang dari Sheet?',
            'Salinan di HP dibuang dan diambil ulang dari Google Sheet. Catatan yang belum terkirim tidak ikut hilang.', 'Muat ulang');
          if (!ya) return;
          lokal.hapus('cache');
          location.reload();
        }
      }, 'Muat ulang dari Sheet')
    ),
    kartuSinkron()
  ));
}

/**
 * Tarik isi tab lama (`Monthly 26`) yang masih diisi admin.
 *
 * Tombolnya ada di sini, bukan berjalan sendiri tiap kali aplikasi dibuka,
 * karena membaca seluruh tab lama butuh beberapa detik — terlalu lama untuk
 * ditunggu di layar pembuka. Yang otomatis adalah pemicu harian di Apps
 * Script; tombol ini untuk saat Ryan ingin melihatnya sekarang juga.
 */
function kartuSinkron() {
  const tombol = h('button.tombol.tosca.lebar', {
    onclick: async () => {
      tombol.disabled = true;
      const semula = tombol.textContent;
      tombol.textContent = 'Membaca sheet lama…';
      try {
        const hasil = await panggil('sinkron.jalankan');
        kabarSinkron = hasil;
        // Angka di seluruh aplikasi ikut berubah, jadi datanya diambil ulang.
        terapkanMuatan(await muatAwal(geserBulan(bulanIni(), -13)));
        roti(hasil.ditambah ? `${hasil.ditambah} catatan baru masuk` : 'Sudah paling baru');
        umumkan();
      } catch (e) {
        tombol.disabled = false;
        tombol.textContent = semula;
        roti(e.message, 'salah');
      }
    }
  }, 'Tarik data dari sheet lama');

  return h('div.kaca.kartu',
    h('div.kepala-kartu', h('h2', 'Data dari sheet lama')),
    h('p.kecil.lembut', { gaya: { marginBottom: '12px' } },
      'Selama admin masih mengisi tab Monthly 26 di Google Sheet, isinya ditarik ke sini. ' +
      'Berjalan sendiri tiap subuh; tombol ini untuk menariknya sekarang juga.'),
    tombol,
    kabarSinkron ? ringkasSinkron(kabarSinkron) : null,
    h('p.mini.samar', { gaya: { marginTop: '10px' } },
      'Yang sudah Anda betulkan di sini tidak akan tertimpa, dan tidak ada baris yang dihapus. ' +
      'Rinciannya ada di tab "Sinkron Cek" di Google Sheet.')
  );
}

function ringkasSinkron(kabar) {
  const baris = [
    ['Catatan baru masuk', kabar.ditambah],
    ['Nominal diperbarui', kabar.nominalDiperbarui],
    ['Mutasi saving baru', kabar.savingDitambah],
    ['Tidak ada lagi di sheet lama', kabar.hilang],
    ['Perlu Anda periksa sendiri', kabar.curiga]
  ].filter(([, n]) => n > 0);

  if (!baris.length) {
    return h('p.kecil.lembut', { gaya: { marginTop: '12px' } },
      'Tidak ada yang baru — semua isi sheet lama sudah ada di sini.');
  }
  return h('div.petak', { gaya: { marginTop: '12px' } },
    ...baris.map(([k, n]) => h('div.sel', h('div.k', k), h('div.v.angka', String(n)))));
}

/**
 * Notifikasi push. Di iPhone hanya bisa kalau aplikasinya sudah ditambahkan ke
 * Layar Utama — itu batasan iOS, bukan bug. Statusnya dijelaskan apa adanya di
 * sini supaya tidak ada yang menunggu notifikasi yang tidak akan pernah datang.
 */
function blokNotifikasi() {
  const wadah = h('div');
  const didukung = 'serviceWorker' in navigator && 'PushManager' in window;
  const terpasang = matchMedia('(display-mode: standalone)').matches ||
                    window.navigator.standalone === true;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!didukung) {
    wadah.appendChild(h('p.kecil.lembut',
      iOS && !terpasang
        ? 'Untuk mendapat notifikasi di iPhone, buka menu Bagikan di Safari lalu pilih "Tambahkan ke Layar Utama". Setelah aplikasi dibuka dari ikon itu, tombol izin akan muncul di sini.'
        : 'Browser ini belum mendukung notifikasi push. Kartu "Jatuh tempo minggu ini" di Beranda tetap berjalan.'));
    return wadah;
  }

  if (!st.profil.vapidPublik) {
    wadah.appendChild(h('p.kecil.lembut',
      'Kunci push belum dipasang di Apps Script. Ikuti bagian "Notifikasi" di PANDUAN.md, lalu buka halaman ini lagi.'));
    return wadah;
  }

  const status = h('p.kecil.lembut', { gaya: { marginBottom: '12px' } },
    Notification.permission === 'granted' ? 'Izin notifikasi sudah diberikan.'
      : Notification.permission === 'denied'
        ? 'Notifikasi diblokir untuk situs ini. Ubah lewat pengaturan browser kalau ingin mengaktifkannya.'
        : 'Belum diaktifkan. Pengingat dikirim tiap pagi untuk tagihan yang jatuh tempo dan pagu kategori yang hampir jebol.');

  wadah.appendChild(status);
  wadah.appendChild(h('button.tombol.tosca.lebar', {
    disabled: Notification.permission === 'denied',
    onclick: async () => {
      try {
        const izin = await Notification.requestPermission();
        if (izin !== 'granted') { roti('Izin tidak diberikan.', 'salah'); return; }
        const reg = await navigator.serviceWorker.ready;
        const langganan = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keDataUrl(st.profil.vapidPublik)
        });
        const j = langganan.toJSON();
        await panggil('perangkat.daftar', {
          endpoint: j.endpoint,
          p256dh: j.keys.p256dh,
          auth: j.keys.auth,
          label: navigator.userAgent.slice(0, 60)
        });
        roti('Perangkat terdaftar. Pengingat mulai besok pagi.');
      } catch (e) {
        roti('Gagal mendaftar: ' + e.message, 'salah');
      }
    }
  }, 'Aktifkan notifikasi di perangkat ini'));

  if (iOS && !terpasang) {
    wadah.appendChild(h('p.mini.samar', { gaya: { marginTop: '10px' } },
      'Catatan iPhone: notifikasi baru bekerja setelah aplikasi ditambahkan ke Layar Utama dan dibuka dari ikonnya.'));
  }
  return wadah;
}

function keDataUrl(base64) {
  const isi = (base64 + '='.repeat((4 - base64.length % 4) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const biner = atob(isi);
  return Uint8Array.from(biner, (c) => c.charCodeAt(0));
}
