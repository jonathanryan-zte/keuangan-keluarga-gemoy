// Grafik SVG buatan sendiri — tanpa pustaka, supaya aplikasi tetap ringan
// dibuka di HP dengan sinyal seadanya.
//
// Bentuk dipilih menurut tugas datanya, bukan selera:
//   - "kategori mana yang paling menyedot uang"  -> batang berurut, satu warna
//     bertingkat (tugas: membandingkan besaran, bukan membedakan identitas)
//   - "bagaimana tren pemasukan vs pengeluaran"  -> garis, dua deret
//   - "wajib vs keinginan"                       -> satu batang bertumpuk
// Setiap grafik selalu punya label tulisan; warna tidak pernah jadi satu-satunya
// pembawa arti.

import { h } from './ui.js';
import { rpSingkat, rp, namaBulanPendek } from './rupiah.js';

const NS = 'http://www.w3.org/2000/svg';
const TANGGA = ['--viz-r5', '--viz-r4', '--viz-r3', '--viz-r2', '--viz-r1'];

/**
 * Label sumbu ditampilkan berselang, dan yang terlalu dekat dengan label
 * terakhir dilewati — kalau tidak, "Agu 26" dan "Sep 26" saling menimpa.
 */
function tampilLabel(i, n) {
  if (i === n - 1) return true;
  const langkah = Math.ceil(n / 5);
  return i % langkah === 0 && (n - 1 - i) >= langkah;
}

function s(tag, sifat = {}, ...anak) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(sifat)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v);
  }
  anak.flat().forEach((a) => {
    if (a === null || a === undefined || a === false) return;
    el.appendChild(a instanceof Node ? a : document.createTextNode(String(a)));
  });
  return el;
}

/** Warna tangga menurut peringkat: peringkat 1 paling pekat. */
function warnaTangga(peringkat, total) {
  const n = Math.min(TANGGA.length, Math.max(total, 1));
  const i = Math.min(Math.floor((peringkat / Math.max(total, 1)) * n), n - 1);
  return `var(${TANGGA[i]})`;
}

/**
 * Batang mendatar berurut. Nama & nominal ditulis langsung di sebelah batang,
 * jadi terbaca walau warnanya tidak terlihat sama sekali.
 */
export function batangKategori(data, opsi = {}) {
  const isi = data.filter((d) => d.nominal > 0);
  if (!isi.length) {
    return h('p.kosong', 'Belum ada pengeluaran rumah tangga di bulan ini.');
  }
  const maks = Math.max(...isi.map((d) => d.nominal));
  const total = isi.reduce((a, b) => a + b.nominal, 0);
  const batas = opsi.batas || 8;
  const tampil = isi.slice(0, batas);
  const sisa = isi.slice(batas);
  if (sisa.length) {
    tampil.push({ kategori: `${sisa.length} kategori lain`, nominal: sisa.reduce((a, b) => a + b.nominal, 0) });
  }

  return h('div.batang-kategori', { role: 'list' },
    tampil.map((d, i) => h('div.batang-baris', { role: 'listitem' },
      h('div.batang-atas',
        h('span.nama', d.kategori),
        h('span.rp.angka', rp(d.nominal)),
        h('span.mini.samar', `${Math.round((d.nominal / total) * 100)}%`)
      ),
      h('div.batang-jalur',
        h('div.batang-isi', {
          gaya: {
            width: `${Math.max((d.nominal / maks) * 100, 1.5)}%`,
            background: warnaTangga(i, tampil.length)
          }
        })
      )
    ))
  );
}

/**
 * Garis tren 12 bulan, dua deret. Ada legenda, label di ujung garis, dan
 * penunjuk yang mengikuti sentuhan jari.
 */
export function garisTren(baris, opsi = {}) {
  const L = 8, K = 8, A = 14, B = 22;
  const lebar = 340, tinggi = opsi.tinggi || 150;
  const w = lebar - L - K, t = tinggi - A - B;
  if (baris.length < 2) return h('p.kosong', 'Butuh minimal dua bulan data untuk melihat tren.');

  const maks = Math.max(...baris.flatMap((b) => [b.pemasukan, b.pengeluaran]), 1);
  const x = (i) => L + (i / (baris.length - 1)) * w;
  const y = (v) => A + t - (v / maks) * t;
  const jalur = (kunci) => baris.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b[kunci]).toFixed(1)}`).join(' ');

  const penunjuk = s('g', { opacity: '0' },
    s('line', { y1: A, y2: A + t, stroke: 'var(--viz-grid)', 'stroke-width': '1' }),
    s('circle', { r: '4.5', fill: 'var(--viz-1)', stroke: 'var(--viz-latar)', 'stroke-width': '2' }),
    s('circle', { r: '4.5', fill: 'var(--viz-2)', stroke: 'var(--viz-latar)', 'stroke-width': '2' })
  );

  const svg = s('svg', {
    viewBox: `0 0 ${lebar} ${tinggi}`, width: '100%', role: 'img',
    'aria-label': 'Tren pemasukan dan pengeluaran per bulan',
    preserveAspectRatio: 'none', style: 'touch-action: pan-y'
  },
    // Garis dasar nol saja; kisi penuh cuma menambah bising di layar HP.
    s('line', { x1: L, x2: L + w, y1: A + t, y2: A + t, stroke: 'var(--viz-grid)', 'stroke-width': '1' }),
    s('path', { d: jalur('pengeluaran'), fill: 'none', stroke: 'var(--viz-2)', 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    s('path', { d: jalur('pemasukan'), fill: 'none', stroke: 'var(--viz-1)', 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    baris.map((b, i) => tampilLabel(i, baris.length)
      ? s('text', {
          x: x(i), y: tinggi - 6, 'text-anchor': i === 0 ? 'start' : (i === baris.length - 1 ? 'end' : 'middle'),
          'font-size': '9.5', fill: 'var(--tinta-samar)'
        }, namaBulanPendek(b.bulan))
      : null),
    penunjuk
  );

  const ket = h('div.tren-ket',
    h('span.tren-nilai', h('i', { gaya: { background: 'var(--viz-1)' } }), 'Pemasukan ',
      h('b.angka', rpSingkat(baris[baris.length - 1].pemasukan))),
    h('span.tren-nilai', h('i', { gaya: { background: 'var(--viz-2)' } }), 'Pengeluaran ',
      h('b.angka', rpSingkat(baris[baris.length - 1].pengeluaran)))
  );

  const bungkus = h('div.tren', svg, ket);

  // Penunjuk mengikuti jari / tetikus; nilainya ditulis di baris keterangan
  // supaya tidak ada tooltip mengambang yang tertutup jempol.
  const gerak = (ev) => {
    const kotak = svg.getBoundingClientRect();
    const px = ((ev.touches?.[0]?.clientX ?? ev.clientX) - kotak.left) / kotak.width * lebar;
    const i = Math.round(Math.min(Math.max((px - L) / w, 0), 1) * (baris.length - 1));
    const b = baris[i];
    penunjuk.setAttribute('opacity', '1');
    penunjuk.children[0].setAttribute('x1', x(i)); penunjuk.children[0].setAttribute('x2', x(i));
    penunjuk.children[1].setAttribute('cx', x(i)); penunjuk.children[1].setAttribute('cy', y(b.pemasukan));
    penunjuk.children[2].setAttribute('cx', x(i)); penunjuk.children[2].setAttribute('cy', y(b.pengeluaran));
    ket.children[0].lastChild.textContent = rpSingkat(b.pemasukan);
    ket.children[1].lastChild.textContent = rpSingkat(b.pengeluaran);
    ket.dataset.bulan = namaBulanPendek(b.bulan);
  };
  const lepas = () => {
    penunjuk.setAttribute('opacity', '0');
    const b = baris[baris.length - 1];
    ket.children[0].lastChild.textContent = rpSingkat(b.pemasukan);
    ket.children[1].lastChild.textContent = rpSingkat(b.pengeluaran);
    delete ket.dataset.bulan;
  };
  svg.addEventListener('pointermove', gerak);
  svg.addEventListener('pointerdown', gerak);
  svg.addEventListener('pointerleave', lepas);
  svg.addEventListener('touchmove', gerak, { passive: true });
  svg.addEventListener('touchend', lepas);

  return bungkus;
}

/**
 * Satu batang bertumpuk WAJIB vs KEINGINAN. Selalu dengan tulisan dan
 * persentase — merah/hijau tidak pernah berdiri sendiri sebagai penanda.
 */
export function batangSifat(wajib, keinginan) {
  const total = wajib + keinginan;
  if (!total) return null;
  const pw = (wajib / total) * 100;
  return h('div.sifat-blok',
    h('div.sifat-jalur',
      h('div.sifat-isi.w', { gaya: { width: `${pw}%` } }),
      h('div.sifat-isi.k', { gaya: { width: `${100 - pw}%` } })
    ),
    h('div.sifat-ket',
      h('span', h('i.w'), 'Wajib ', h('b.angka', `${Math.round(pw)}%`),
        h('span.mini.samar', ` · ${rpSingkat(wajib)}`)),
      h('span', h('i.k'), 'Keinginan ', h('b.angka', `${Math.round(100 - pw)}%`),
        h('span.mini.samar', ` · ${rpSingkat(keinginan)}`))
    )
  );
}

/** Tabel angka pendamping grafik — jalan keluar kalau warnanya tak terbaca. */
export function tabelKategori(data) {
  const total = data.reduce((a, b) => a + b.nominal, 0) || 1;
  return h('table.tabel',
    h('thead', h('tr', h('th', 'Kategori'), h('th', 'Nominal'), h('th', 'Porsi'))),
    h('tbody', data.map((d) => h('tr',
      h('td', d.kategori),
      h('td.angka', rp(d.nominal)),
      h('td.angka.samar', `${Math.round((d.nominal / total) * 100)}%`)
    )))
  );
}
