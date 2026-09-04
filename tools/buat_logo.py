#!/usr/bin/env python3
"""
Penghasil logo KKG.

Hurufnya digambar sebagai garis ber-stroke bulat, bukan bidang isi: bentuknya
jadi gemuk-membulat ("gemoy") dan koordinatnya bisa dihitung, tidak ditebak.
Jalankan ulang kalau proporsinya mau diubah:  python3 tools/buat_logo.py
"""
import math

W = 512
TEBAL = 34            # tebal goresan huruf
ATAS, BAWAH = 223, 347  # garis tengah goresan, atas & bawah huruf
JARI_G = 62           # jari-jari lingkaran huruf G
JANGKAU_K = 58        # panjang lengan & kaki huruf K
SELA = 12             # jarak antar huruf (tepi ke tepi)

s = TEBAL / 2
tengah_y = (ATAS + BAWAH) / 2


def tata_letak():
    """Hitung posisi mendatar tiap huruf lalu geser semuanya supaya di tengah."""
    kiri = 0
    k1 = kiri + s
    kanan_k1 = k1 + JANGKAU_K + s
    k2 = kanan_k1 + SELA + s
    kanan_k2 = k2 + JANGKAU_K + s
    g = kanan_k2 + SELA + s + JARI_G
    kanan = g + JARI_G + s
    geser = (W - kanan) / 2
    return k1 + geser, k2 + geser, g + geser


def huruf_k(x):
    """Batang tegak + lengan atas dan kaki bawah yang bertemu di batang."""
    return (f'<path d="M{x} {ATAS} V{BAWAH}"/>'
            f'<path d="M{x + JANGKAU_K} {ATAS} L{x} {tengah_y:.1f} '
            f'L{x + JANGKAU_K} {BAWAH}"/>')


def huruf_g(cx):
    """
    G geometris: lingkaran dengan celah di kuadran kanan-atas, palang mendatar
    dari ujung kanan (titik paling kanan, setinggi garis tengah) menuju poros.

    Sudut dihitung dengan sumbu-y ke bawah, jadi sudut membesar = searah jarum
    jam di layar. Busur berangkat dari 0 derajat (paling kanan), turun ke bawah,
    memutar lewat kiri dan atas, lalu berhenti di -58 derajat (kanan atas).
    """
    akhir = math.radians(-58)
    x0, y0 = cx + JARI_G, tengah_y
    x1, y1 = cx + JARI_G * math.cos(akhir), tengah_y + JARI_G * math.sin(akhir)
    # large-arc=1 karena busurnya lebih dari setengah lingkaran (302 derajat),
    # sweep=1 karena arah sudut membesar.
    busur = (f'<path d="M{x0:.1f} {y0:.1f} '
             f'A{JARI_G} {JARI_G} 0 1 1 {x1:.1f} {y1:.1f}"/>')
    palang = f'<path d="M{x0:.1f} {y0:.1f} H{cx + 2}"/>'
    return busur + palang


def huruf():
    k1, k2, g = tata_letak()
    return (f'<g fill="none" stroke="#FFFFFF" stroke-width="{TEBAL}" '
            f'stroke-linecap="round" stroke-linejoin="round">'
            f'{huruf_k(k1)}{huruf_k(k2)}{huruf_g(g)}</g>')


KOIN = '''<g>
    <circle cx="392" cy="118" r="58" fill="url(#koin)"/>
    <circle cx="392" cy="118" r="58" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="6"/>
    <circle cx="372" cy="106" r="7.5" fill="#FFFFFF"/>
    <circle cx="412" cy="106" r="7.5" fill="#FFFFFF"/>
    <path d="M370 134a26 26 0 0 0 44 0" fill="none" stroke="#FFFFFF" stroke-width="8.5" stroke-linecap="round"/>
  </g>'''

GRADIEN = '''<defs>
    <linearGradient id="langit" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5FE3F0"/>
      <stop offset="0.55" stop-color="#22D3EE"/>
      <stop offset="1" stop-color="#0E9BAE"/>
    </linearGradient>
    <linearGradient id="koin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F5A882"/>
      <stop offset="1" stop-color="#D97757"/>
    </linearGradient>
    <radialGradient id="kilau" cx="0.26" cy="0.18" r="0.8">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>'''


def tulis(path, isi):
    with open(path, 'w') as f:
        f.write(isi)
    print('ditulis', path)


ikon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Keuangan Keluarga Gemoy">
  {GRADIEN}
  <rect width="512" height="512" rx="116" fill="url(#langit)"/>
  <rect width="512" height="512" rx="116" fill="url(#kilau)"/>
  {huruf()}
  {KOIN}
</svg>
'''

# Versi maskable: Android memotongnya jadi bulat, jadi isinya dikecilkan ke
# 62% dan latarnya dibiarkan memenuhi bidang tanpa sudut membulat.
maskable = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  {GRADIEN}
  <rect width="512" height="512" fill="url(#langit)"/>
  <rect width="512" height="512" fill="url(#kilau)"/>
  <g transform="translate(97 97) scale(0.62)">
    {huruf()}
    {KOIN}
  </g>
</svg>
'''

tulis('app/ikon/kkg.svg', ikon)
tulis('app/ikon/kkg-maskable.svg', maskable)
