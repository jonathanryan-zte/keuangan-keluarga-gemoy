// Service worker: cangkang luring + penerima notifikasi push.
const CACHE = 'kkg-v2';
const CANGKANG = [
  './', './index.html', './manifest.webmanifest',
  './css/tema.css', './css/app.css',
  './js/main.js', './js/ui.js', './js/rupiah.js', './js/parser.js',
  './js/simpanan.js', './js/api.js', './js/toko.js', './js/grafik.js',
  './js/layar/beranda.js', './js/layar/tambah.js', './js/layar/tambah-banyak.js',
  './js/layar/riwayat.js',
  './js/layar/anggaran.js', './js/layar/rutin.js', './js/layar/laporan.js',
  './js/layar/pengaturan.js',
  './ikon/kkg.svg', './ikon/kkg-maskable.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CANGKANG)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Panggilan ke Apps Script tidak pernah di-cache: datanya harus segar, dan
  // kegagalannya ditangani antrian di aplikasi.
  if (e.request.method !== 'GET' || url.hostname.endsWith('script.google.com')) return;
  if (url.origin !== location.origin) return;

  // Jaringan lebih dulu, cache sebagai jaring pengaman. Berkasnya kecil, jadi
  // pembaruan langsung terasa tanpa perlu menunggu service worker berganti.
  e.respondWith(
    fetch(e.request)
      .then((jawab) => {
        const salinan = jawab.clone();
        caches.open(CACHE).then((c) => c.put(e.request, salinan));
        return jawab;
      })
      .catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
  );
});

self.addEventListener('push', (e) => {
  let isi = { judul: 'Keuangan Keluarga Gemoy', badan: 'Ada pengingat baru.', layar: 'rutin' };
  try { isi = { ...isi, ...e.data.json() }; } catch (err) { /* pakai bawaan */ }
  e.waitUntil(self.registration.showNotification(isi.judul, {
    body: isi.badan,
    icon: './ikon/kkg-192.png',
    badge: './ikon/kkg-192.png',
    tag: isi.tag || 'kkg-pengingat',
    data: { layar: isi.layar }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const tujuan = new URL('./#' + (e.notification.data?.layar || 'beranda'), self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((daftar) => {
      for (const c of daftar) {
        if (c.url.startsWith(self.registration.scope)) return c.focus().then((w) => w.navigate?.(tujuan));
      }
      return self.clients.openWindow(tujuan);
    })
  );
});
