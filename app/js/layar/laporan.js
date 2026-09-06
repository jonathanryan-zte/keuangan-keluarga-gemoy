import { h, roti, kosongkan } from '../ui.js';
import { rp, rpSingkat, namaBulan, geserBulan } from '../rupiah.js';
import { st, ringkas, perKategori, laju, daftarPos, targetPos, progresTarget } from '../toko.js';
import { tabelKategori, batangSifat } from '../grafik.js';

export function laporan() {
  const r = ringkas();
  const lalu = ringkas(geserBulan(st.bulan, -1));
  // Sepos dengan judulnya, dan dengan gambar ringkasan yang dibagikan.
  const kat = perKategori(st.bulan, daftarPos()[0]);
  const l = laju();

  return h('div.papan.dua',
    h('div.papan',
      h('div.kaca.kartu',
        h('div.kepala-kartu', h('h2', `Ringkasan ${namaBulan(st.bulan)}`)),
        // Membandingkan bulan yang baru berjalan separuh dengan bulan penuh
        // selalu terlihat "membaik". Peringatannya ditulis, bukan dibiarkan
        // menipu diri sendiri.
        l.iniBulanBerjalan
          ? h('p.mini.samar', { gaya: { marginBottom: '10px' } },
              `Bulan ini baru berjalan ${l.hariBerjalan} dari ${l.hari} hari — perbandingan dengan bulan lalu belum setara.`)
          : null,
        h('div.petak',
          selBanding('Pemasukan', r.pemasukan, lalu.pemasukan),
          selBanding('Total keluar', r.totalKeluar, lalu.totalKeluar, true),
          selBanding('Sisa', r.sisa, lalu.sisa),
          selBanding(daftarPos()[0], r.harian, lalu.harian, true)
        ),
        h('div', { gaya: { marginTop: '16px' } },
          h('h3', { gaya: { marginBottom: '8px' } }, 'Empat pos'),
          h('div', daftarPos().map((k) => selPos(k, r, lalu)))
        ),
        h('div', { gaya: { marginTop: '16px' } },
          h('h3', { gaya: { marginBottom: '8px' } }, 'Seluruh pengeluaran'),
          batangSifat(r.wajib, r.keinginan))
      ),
      h('div.kaca.kartu',
        h('div.kepala-kartu', h('h2', `Per kategori — ${daftarPos()[0]}`)),
        tabelKategori(kat)
      )
    ),
    h('div.papan',
      h('div.kaca.kartu',
        h('div.kepala-kartu', h('h2', 'Bagikan')),
        h('p.kecil.lembut', { gaya: { marginBottom: '14px' } },
          'Membuat satu gambar ringkasan bulan ini yang bisa langsung dikirim ke WhatsApp, atau disalin sebagai teks.'),
        h('div', { gaya: { display: 'grid', gap: '8px' } },
          h('button.tombol.utama.lebar', { onclick: () => bagikanGambar(r, kat, l) }, 'Buat gambar ringkasan'),
          h('button.tombol.hantu.lebar', { onclick: () => salinTeks(r, kat) }, 'Salin sebagai teks')
        )
      ),
      h('div.kaca.kartu',
        h('div.kepala-kartu', h('h2', 'Catatan bulan ini')),
        h('ul.kecil.lembut', { gaya: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '7px' } },
          catatan(r, lalu, l).map((c) => h('li', c))
        )
      )
    )
  );
}

function selBanding(label, kini, lalu, terbalik) {
  const beda = kini - lalu;
  const naik = beda > 0;
  // "Baik" bukan sekadar naik: untuk pengeluaran, naik itu buruk.
  const bagus = terbalik ? !naik : naik;
  const teks = lalu
    ? `${naik ? '▲' : '▼'} ${rpSingkat(Math.abs(beda))} dari bulan lalu`
    : 'Tidak ada data bulan lalu';
  const sel = h('div.sel', h('div.k', label), h('div.v.angka', rp(kini)), h('div.n', teks));
  if (lalu && beda !== 0) sel.lastChild.style.color = bagus ? 'var(--keinginan)' : 'var(--wajib)';
  return sel;
}

/** Satu pos: terpakai bulan ini vs bulan lalu, plus targetnya. */
function selPos(kelompok, r, lalu) {
  const t = targetPos()[kelompok];
  const kini = r.pos[kelompok] || 0;
  const dulu = lalu.pos[kelompok] || 0;
  return h('div.rutin-baris',
    h('div', { gaya: { flex: 1, minWidth: 0 } },
      h('div.tebal', { gaya: { fontSize: '14px' } }, kelompok),
      // "bulan lalu Rp0" bukan kabar, cuma derai — bulan pertama pemakaian
      // memang belum punya pembanding, dan itu sudah ditulis di atas.
      h('div.mini.samar', [
        t.target ? `Target ${rpSingkat(t.target)}` : null,
        dulu ? `bulan lalu ${rpSingkat(dulu)}` : null
      ].filter(Boolean).join(' · ') || 'Belum ada target')
    ),
    h('div.angka.tebal', rp(kini))
  );
}

function catatan(r, lalu, l) {
  const c = [];
  if (r.sisa < 0) c.push(`Bulan ini defisit ${rp(-r.sisa)}. Pengeluaran melebihi pemasukan.`);
  else c.push(`Sisa ${rp(r.sisa)} dari pemasukan ${rp(r.pemasukan)}.`);
  if (r.totalKeluar) {
    c.push(`Porsi keinginan ${Math.round((r.keinginan / (r.wajib + r.keinginan || 1)) * 100)}% dari total pengeluaran.`);
  }
  if (l.iniBulanBerjalan) {
    c.push(`Rata-rata belanja ${daftarPos()[0]} ${rp(l.rata)} per hari; kalau polanya bertahan, akhir bulan sekitar ${rp(l.perkiraanAkhir)}.`);
  }
  const t = targetPos();
  daftarPos().forEach((k) => {
    const p = t[k];
    if (!p.target) return;
    c.push(p.terpakai > p.target
      ? `${k} lewat target ${rp(p.terpakai - p.target)}.`
      : `${k} masih bersisa ${rp(p.sisa)} dari target ${rp(p.target)}.`);
  });
  progresTarget().filter((x) => x.kategori && x.terkumpul).forEach((x) => {
    c.push(`${x.nama}: terkumpul ${rp(x.terkumpul)} dari ${rp(x.nilai)}.`);
  });
  return c;
}

function teksRingkasan(r, kat) {
  const baris = [
    `Keuangan Keluarga Gemoy — ${namaBulan(st.bulan)}`,
    '',
    `Pemasukan  : ${rp(r.pemasukan)}`
  ];
  daftarPos().forEach((k) => {
    baris.push(`${k.replace(/\s*\d+%$/, '').padEnd(11)}: ${rp(r.pos[k] || 0)}`);
  });
  baris.push(`Total keluar: ${rp(r.totalKeluar)}`, `Sisa       : ${rp(r.sisa)}`, '',
             `${daftarPos()[0]} per kategori:`);
  kat.slice(0, 8).forEach((k) => baris.push(`  ${k.kategori.padEnd(14)} ${rp(k.nominal)}`));
  return baris.join('\n');
}

async function salinTeks(r, kat) {
  const teks = teksRingkasan(r, kat);
  try {
    await navigator.clipboard.writeText(teks);
    roti('Teks ringkasan disalin');
  } catch (e) {
    // Beberapa browser menolak clipboard tanpa HTTPS. Tampilkan supaya tetap
    // bisa disalin manual, jangan cuma bilang gagal.
    prompt('Salin teks berikut:', teks);
  }
}

/** Gambar ringkasan 1080×1350 di canvas, lalu dibagikan atau diunduh. */
async function bagikanGambar(r, kat, l) {
  const L = 1080, p = 72;
  const tampil = kat.slice(0, 7);
  // Tinggi mengikuti jumlah kategori, supaya gambarnya tidak menyisakan
  // bidang kosong lebar saat bulannya masih sedikit isinya.
  const T = 672 + tampil.length * 78 + 120;
  const kanvas = document.createElement('canvas');
  kanvas.width = L; kanvas.height = T;
  const c = kanvas.getContext('2d');
  const gelap = matchMedia('(prefers-color-scheme: dark)').matches;

  const latar = c.createLinearGradient(0, 0, L, T);
  if (gelap) { latar.addColorStop(0, '#06202B'); latar.addColorStop(1, '#1A1210'); }
  else { latar.addColorStop(0, '#E9F7FB'); latar.addColorStop(1, '#FDF3EE'); }
  c.fillStyle = latar; c.fillRect(0, 0, L, T);

  const tinta = gelap ? '#E8F4F8' : '#0B2A35';
  const lembut = gelap ? '#93AEB9' : '#5A7580';
  const F = (u, b = 400) => `${b} ${u}px -apple-system, "Segoe UI", Roboto, sans-serif`;

  c.fillStyle = lembut; c.font = F(30, 600);
  c.fillText('KEUANGAN KELUARGA GEMOY', p, p + 34);
  c.fillStyle = tinta; c.font = F(58, 700);
  c.fillText(namaBulan(st.bulan), p, p + 100);

  // Kartu sisa
  const kartu = c.createLinearGradient(p, 200, L - p, 420);
  kartu.addColorStop(0, '#F0916B'); kartu.addColorStop(1, '#D97757');
  bulatkan(c, p, 200, L - p * 2, 210, 34); c.fillStyle = kartu; c.fill();
  c.fillStyle = 'rgba(255,255,255,0.86)'; c.font = F(28, 500);
  c.fillText('Sisa bulan ini', p + 40, 262);
  c.fillStyle = '#FFF6F2'; c.font = F(76, 700);
  c.fillText(rp(r.sisa), p + 40, 350);

  // Tiga angka utama
  const kolom = [['Pemasukan', r.pemasukan], ['Total keluar', r.totalKeluar], [daftarPos()[0], r.harian]];
  kolom.forEach(([label, nilai], i) => {
    const x = p + i * ((L - p * 2) / 3);
    c.fillStyle = lembut; c.font = F(26, 500); c.fillText(label, x, 480);
    c.fillStyle = tinta; c.font = F(40, 650); c.fillText(rpSingkat(nilai), x, 528);
  });

  // Batang kategori
  c.fillStyle = tinta; c.font = F(34, 650);
  c.fillText(`Belanja ${daftarPos()[0]}`, p, 622);
  const maks = Math.max(...tampil.map((k) => k.nominal), 1);
  const ramp = gelap
    ? ['#4CD4DE', '#2DB7C1', '#009BA4', '#007F88', '#00656D', '#00656D', '#00656D']
    : ['#006976', '#007D87', '#00919A', '#44A5AC', '#6EB9BF', '#6EB9BF', '#6EB9BF'];
  tampil.forEach((k, i) => {
    const y = 672 + i * 78;
    c.fillStyle = tinta; c.font = F(28, 550); c.fillText(k.kategori, p, y);
    c.fillStyle = lembut; c.font = F(26, 500);
    c.textAlign = 'right'; c.fillText(rp(k.nominal), L - p, y); c.textAlign = 'left';
    bulatkan(c, p, y + 14, L - p * 2, 14, 7);
    c.fillStyle = gelap ? 'rgba(255,255,255,0.10)' : 'rgba(11,42,53,0.08)'; c.fill();
    bulatkan(c, p, y + 14, Math.max((k.nominal / maks) * (L - p * 2), 14), 14, 7);
    c.fillStyle = ramp[i]; c.fill();
  });

  // Kaki
  c.fillStyle = lembut; c.font = F(24, 500);
  const kaki = r.pemasukan
    ? daftarPos().map((k) => `${k.replace(/\s*\d+%$/, '')} ${rpSingkat(r.pos[k] || 0)}`).join('  ·  ')
    : `${r.jumlah} transaksi tercatat`;
  c.fillText(kaki, p, T - 56);
  if (l.iniBulanBerjalan) {
    c.font = F(22, 400);
    c.fillText(`Bulan berjalan — baru hari ke-${l.hariBerjalan} dari ${l.hari}`, p, T - 22);
  }

  const blob = await new Promise((s) => kanvas.toBlob(s, 'image/png'));
  const berkas = new File([blob], `KKG-${st.bulan}.png`, { type: 'image/png' });

  if (navigator.canShare?.({ files: [berkas] })) {
    try {
      await navigator.share({ files: [berkas], title: `Keuangan ${namaBulan(st.bulan)}` });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: berkas.name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  roti('Gambar tersimpan di unduhan');
}

function bulatkan(c, x, y, w, t, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + t, r);
  c.arcTo(x + w, y + t, x, y + t, r);
  c.arcTo(x, y + t, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
