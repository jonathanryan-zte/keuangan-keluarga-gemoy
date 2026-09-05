// Pembantu DOM sekecil mungkin. Tidak ada kerangka kerja, tidak ada langkah
// build — berkas ini jalan apa adanya di browser.

/**
 * h('div.kartu', { onclick }, 'isi', elemenLain)
 * Nama tag boleh membawa kelas: 'button.tombol.utama'.
 */
export function h(spek, sifat, ...anak) {
  const [tag, ...kelas] = String(spek).split('.');
  const el = document.createElement(tag || 'div');
  if (kelas.length) el.className = kelas.join(' ');

  if (sifat && (typeof sifat !== 'object' || sifat instanceof Node || Array.isArray(sifat))) {
    anak.unshift(sifat);
    sifat = null;
  }
  for (const [k, v] of Object.entries(sifat || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'kelas') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'gaya') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  tambah(el, anak);
  return el;
}

function tambah(el, anak) {
  for (const a of anak.flat(4)) {
    if (a === null || a === undefined || a === false || a === true) continue;
    el.appendChild(a instanceof Node ? a : document.createTextNode(String(a)));
  }
}

export function kosongkan(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** SVG sebaris dari data path. */
export function ikon(nama, ukuran) {
  const d = IKON[nama];
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.9');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  if (ukuran) { el.setAttribute('width', ukuran); el.setAttribute('height', ukuran); }
  el.innerHTML = d || '';
  return el;
}

const IKON = {
  beranda: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V20h14V9.8"/>',
  riwayat: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
  tambah: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  anggaran: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',
  rutin: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  laporan: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  gigi: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6h.1A1.7 1.7 0 0 0 9 1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 2.6"/>',
  centang: '<path d="M20 6 9 17l-5-5"/>',
  panahKiri: '<path d="M15 18l-6-6 6-6"/>',
  panahKanan: '<path d="M9 18l6-6-6-6"/>',
  bagikan: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/>',
  lonceng: '<path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  pena: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sampah: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  kilat: '<path d="M13 2 3 14h9l-1 8 10-12h-9Z"/>'
};

let waktuRoti;
export function roti(pesan, jenis) {
  document.querySelectorAll('.roti').forEach((n) => n.remove());
  const el = h('div.roti', pesan);
  if (jenis === 'salah') el.style.background = 'var(--wajib)';
  document.body.appendChild(el);
  clearTimeout(waktuRoti);
  waktuRoti = setTimeout(() => el.remove(), 2600);
}

// Latar belakang dikunci selagi ada sheet terbuka. Terhitung, karena sheet
// bisa bertumpuk (mis. konfirmasi hapus di atas sheet rincian) — baru
// dibuka lagi setelah yang paling akhir benar-benar tertutup.
let jumlahKunciGulir = 0;
let posisiGulirSebelumKunci = 0;
function kunciGulirLatar() {
  if (jumlahKunciGulir === 0) {
    posisiGulirSebelumKunci = window.scrollY;
    document.body.style.top = `-${posisiGulirSebelumKunci}px`;
    document.body.classList.add('kunci-gulir');
  }
  jumlahKunciGulir++;
}
function bukaGulirLatar() {
  jumlahKunciGulir = Math.max(0, jumlahKunciGulir - 1);
  if (jumlahKunciGulir === 0) {
    document.body.classList.remove('kunci-gulir');
    document.body.style.top = '';
    window.scrollTo(0, posisiGulirSebelumKunci);
  }
}

/** Panel yang naik dari bawah layar. Tutup lewat tombol, latar, atau Esc. */
export function sheet(judul, isi, opsi = {}) {
  // Panelnya sendiri tidak menggulir; yang menggulir .gulir-sheet di dalamnya.
  // .kaki-sheet adalah slot kosong di luar wadah gulir itu — tempat tombol yang
  // harus selalu kelihatan. Dulu tombol semacam itu dipasang sticky di dalam
  // wadah gulir, dan hasilnya selalu kurang 14px di kanan (selebar bilah gulir)
  // sehingga terlihat seperti kotak terpisah yang tidak menyatu dengan panel.
  const gulir = h('div.gulir-sheet');
  const kaki = h('div.kaki-sheet');
  const badan = h('div.sheet', { role: 'dialog', 'aria-modal': 'true' },
    h('div.pegangan'),
    h('div.judul-sheet',
      h('h2', judul),
      h('button.tutup', { 'aria-label': 'Tutup', onclick: () => tutup() }, '×')
    ),
    gulir, kaki
  );
  const tirai = h('div.tirai', { onclick: (e) => { if (e.target === tirai) tutup(); } }, badan);

  let sedangTutup = false;
  let sudahBeres = false;
  function tutup() {
    if (sedangTutup) return;
    sedangTutup = true;
    document.removeEventListener('keydown', padaTombol);
    tirai.classList.add('menutup');
    tirai.addEventListener('animationend', selesai, { once: true });
    setTimeout(selesai, 260);
  }
  function selesai() {
    if (sudahBeres) return;
    sudahBeres = true;
    tirai.remove();
    bukaGulirLatar();
    opsi.onTutup?.();
  }
  function padaTombol(e) { if (e.key === 'Escape') tutup(); }

  document.addEventListener('keydown', padaTombol);
  gulir.appendChild(isi instanceof Function ? isi(tutup, badan) : isi);
  kunciGulirLatar();
  document.body.appendChild(tirai);
  return tutup;
}

export function konfirmasi(judul, pesan, labelYa = 'Ya, lanjutkan') {
  return new Promise((selesai) => {
    let dijawab = false;
    const tutup = sheet(judul, (tutupSheet) => h('div', null,
      h('p.lembut', { gaya: { marginBottom: '18px' } }, pesan),
      h('div', { gaya: { display: 'grid', gap: '8px' } },
        h('button.tombol.bahaya.lebar', {
          onclick: () => { dijawab = true; tutupSheet(); selesai(true); }
        }, labelYa),
        h('button.tombol.hantu.lebar', { onclick: () => tutupSheet() }, 'Batal')
      )
    ), { onTutup: () => { if (!dijawab) selesai(false); } });
    return tutup;
  });
}
