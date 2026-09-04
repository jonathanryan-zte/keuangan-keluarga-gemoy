#!/usr/bin/env python3
"""
Cermin Python dari apps-script/Migrasi.gs.

Tujuannya cuma satu: menguji algoritma pemindaian blok bulan terhadap salinan
Sheet (.xlsx) di mesin lokal, supaya kesalahan baca layout ketahuan sebelum
skripnya dijalankan sungguhan di Apps Script. Logikanya sengaja dibuat sepersis
mungkin dengan versi .gs — kalau salah satunya diubah, ubah keduanya.

Pakai:  python3 tools/cek_migrasi.py <berkas.xlsx>
"""
import sys, re, zipfile, datetime
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
TAB_LAMA = ['Monthly 25', 'Monthly 26']
BARIS_ITEM_MULAI = 6
LABEL_DILEWATI = {
    'list cicilan', 'list cicilan wajib', 'sisa', 'perpuluhan', 'saving',
    'entertain', 'kategori', 'pemasukan', 'pengeluaran tetap',
    'pengeluaran rumah tangga', 'hutang cc', 'sisa cc', 'kelebihan cc',
    'cc blm dibayarkan', 'kado',
}
KATEGORI_RT = ['Pangan', 'Sandang', 'Papan', 'Hobi', 'Gift', 'Travelling',
               'Kesehatan', 'Lainnya']


# ------------------------------------------------------------- baca xlsx --

def muat(path):
    z = zipfile.ZipFile(path)
    ss = []
    try:
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si'):
            ss.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    except KeyError:
        pass
    rels = {r.get('Id'): r.get('Target')
            for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    buku = {}
    for s in wb.find(NS + 'sheets'):
        target = rels[s.get(RNS + 'id')]
        path_sheet = target if target.startswith('xl/') else 'xl/' + target.lstrip('/')
        buku[s.get('name')] = grid(ET.fromstring(z.read(path_sheet)), ss)
    return buku


def kolom_ke_indeks(ref):
    m = re.match(r'([A-Z]+)(\d+)', ref)
    c = 0
    for ch in m.group(1):
        c = c * 26 + ord(ch) - 64
    return c - 1, int(m.group(2))


def grid(root, ss):
    """Kembalikan dict {(baris1, kolom0): nilai}. Angka jadi float, sisanya str."""
    g, maks_baris, maks_kolom = {}, 0, 0
    for c in root.iter(NS + 'c'):
        ci, ri = kolom_ke_indeks(c.get('r'))
        t, v = c.get('t'), c.find(NS + 'v')
        if v is None:
            isv = c.find(NS + 'is')
            if isv is None:
                continue
            nilai = ''.join(x.text or '' for x in isv.iter(NS + 't'))
        elif t == 's':
            nilai = ss[int(v.text)]
        elif t in ('str', 'e'):
            nilai = v.text or ''
        else:
            try:
                nilai = float(v.text)
            except (TypeError, ValueError):
                nilai = v.text or ''
        g[(ri, ci)] = nilai
        maks_baris, maks_kolom = max(maks_baris, ri), max(maks_kolom, ci)
    g['_baris'], g['_kolom'] = maks_baris, maks_kolom + 1
    return g


def sel(g, r, c):
    return g.get((r, c), '')


# ------------------------------------------------------- pemindaian blok --

def pindai_blok(g):
    last_col, last_row = g['_kolom'], g['_baris']
    mentah = sel(g, 4, 0)
    if isinstance(mentah, float):
        mentah = int(mentah)
    tahun_sel = re.sub(r'\D', '', str(mentah))
    tahun = tahun_sel if len(tahun_sel) == 4 else str(datetime.date.today().year)

    awal = []
    for c in range(last_col):
        teks = str(sel(g, 3, c)).strip()
        if teks in BULAN_ID:
            awal.append((teks, BULAN_ID.index(teks), c))
    if not awal:
        return []

    blok = []
    for i, (nama, idx, mulai) in enumerate(awal):
        akhir = awal[i + 1][2] if i + 1 < len(awal) else last_col
        bulan = f'{tahun}-{idx + 1:02d}'
        judul = []
        for c in range(mulai, akhir):
            h = str(sel(g, 4, c)).strip().upper()
            if h == 'PEMASUKAN':
                judul.append(('PEMASUKAN', c))
            elif h == 'PENGELUARAN TETAP':
                judul.append(('TETAP', c))
            elif h == 'PENGELUARAN RUMAH TANGGA':
                judul.append(('RUMAH_TANGGA', c))
        if not judul:
            continue
        kelompok = []
        for n, (jenis, kol) in enumerate(judul):
            batas = judul[n + 1][1] if n + 1 < len(judul) else akhir
            kelompok.append(bentuk_kelompok(g, jenis, kol, min(batas, kol + 3), last_row))
        blok.append({'bulan': bulan, 'nama': nama, 'kelompok': kelompok})
    return blok


def bentuk_kelompok(g, jenis, kol_mulai, kol_batas, last_row):
    lebar = max(kol_batas - kol_mulai, 2)
    nilai = [[sel(g, r, kol_mulai + k) for k in range(lebar)]
             for r in range(BARIS_ITEM_MULAI, last_row + 1)]
    # Blok tiga kolom (Kategori | Item | Nominal) cuma ada di rumah tangga sejak
    # Juni 2026, dan dikenali dari isi kolom pertamanya yang memakai kosakata
    # kategori. Menebak lewat "kolom mana yang paling banyak angkanya" tidak bisa
    # dipakai: kolom pemisah di sebelahnya sering dipakai Ryan untuk coretan.
    kosakata = {k.lower() for k in KATEGORI_RT}
    cocok = sum(1 for baris in nilai
                if isinstance(baris[0], str) and baris[0].strip().lower() in kosakata)
    tiga = jenis == 'RUMAH_TANGGA' and lebar >= 3 and cocok >= 2
    return {'jenis': jenis, 'tiga': tiga, 'nilai': nilai,
            'kol_kategori': kol_mulai if tiga else -1,
            'kol_item': kol_mulai + (1 if tiga else 0),
            'kol_nominal': kol_mulai + (2 if tiga else 1)}


# ----------------------------------------------------------- tanggal & baca --

def tarik_tanggal(item, bulan):
    teks = str(item or '')
    th, bl = int(bulan[:4]), int(bulan[5:7])

    def coba(d, bulan_ke, tahun):
        if not (1 <= d <= 31 and 1 <= bulan_ke <= 12):
            return None
        if bulan_ke != bl or tahun != th:
            return None
        import calendar
        if d > calendar.monthrange(tahun, bulan_ke)[1]:
            return None
        return f'{tahun}-{bulan_ke:02d}-{d:02d}'

    for pola, ambil in (
        (r'(\d{2})(\d{2})(20\d{2})', lambda m: coba(int(m[1]), int(m[2]), int(m[3]))),
        (r'(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(20\d{2})', lambda m: coba(int(m[1]), int(m[2]), int(m[3]))),
        (r'(?:^|\s)(\d{1,2})\s*/\s*(\d{1,2})(?!\s*/|\d)', lambda m: coba(int(m[1]), int(m[2]), th)),
        (r'\btgl\.?\s*(\d{1,2})\b', lambda m: coba(int(m[1]), bl, th)),
    ):
        m = re.search(pola, teks, re.I)
        if m:
            hasil = ambil(m)
            if hasil:
                bersih = re.sub(r'\s{2,}', ' ', teks.replace(m.group(0), ' ')).strip(' ,-')
                return hasil, False, (bersih or teks.strip())
    return f'{bulan}-01', True, teks.strip()


def baca_semua(buku):
    transaksi, laporan = [], []
    for nama in TAB_LAMA:
        g = buku.get(nama)
        if not g:
            continue
        for blok in pindai_blok(g):
            r = {'tab': nama, 'bulan': blok['bulan'], 'nama': blok['nama'],
                 'PEMASUKAN': 0.0, 'TETAP': 0.0, 'RUMAH_TANGGA': 0.0,
                 'jumlah': 0, 'tanpa_tanggal': 0, 'dilewati': [], 'cicilan': []}
            for kel in blok['kelompok']:
                lewat_cicilan = False
                for baris in kel['nilai']:
                    sel_item = baris[1 if kel['tiga'] else 0]
                    nominal = baris[2 if kel['tiga'] else 1]
                    # Sel label yang isinya angka = coretan hitung-hitungan Ryan di
                    # kolom pemisah, bukan transaksi.
                    if isinstance(sel_item, float):
                        continue
                    item = str(sel_item or '').strip()
                    rendah = item.lower()
                    if not item:
                        continue
                    if 'list cicilan' in rendah:
                        lewat_cicilan = True
                        continue
                    # Di kolom pemasukan, semua baris di bawah "LIST CICILAN" adalah
                    # daftar acuan cicilan (harga total / angsuran), bukan uang masuk.
                    # Rumus total di Sheet lama pun tidak menjumlahnya.
                    if lewat_cicilan and kel['jenis'] == 'PEMASUKAN':
                        if isinstance(nominal, float) and nominal:
                            r['cicilan'].append(f'{item}={round(nominal)}')
                        continue
                    if rendah in LABEL_DILEWATI:
                        if isinstance(nominal, float) and nominal:
                            r['dilewati'].append(f'{item}={round(nominal)}')
                        continue
                    n = nominal if isinstance(nominal, float) else 0.0
                    if not n:
                        continue
                    tgl, perkiraan, bersih = tarik_tanggal(item, blok['bulan'])
                    if perkiraan:
                        r['tanpa_tanggal'] += 1
                    transaksi.append({'bulan': blok['bulan'], 'jenis': kel['jenis'],
                                      'tanggal': tgl, 'item': bersih, 'nominal': n})
                    r[kel['jenis']] += n
                    r['jumlah'] += 1
            laporan.append(r)
    return transaksi, laporan


def total_sheet(buku):
    peta = {}
    for nama in TAB_LAMA:
        g = buku.get(nama)
        if not g:
            continue
        for blok in pindai_blok(g):
            t = {'PEMASUKAN': 0.0, 'TETAP': 0.0, 'RUMAH_TANGGA': 0.0}
            for kel in blok['kelompok']:
                for kol in (kel['kol_item'], kel['kol_kategori']):
                    if kol < 0:
                        continue
                    v = sel(g, 5, kol)
                    if isinstance(v, float):
                        t[kel['jenis']] = v
                        break
            peta[blok['bulan']] = t
    return peta


def rp(n):
    return f'{round(n):,}'.replace(',', '.')


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'book.xlsx'
    buku = muat(path)
    transaksi, laporan = baca_semua(buku)
    total = total_sheet(buku)

    print(f'{len(transaksi)} transaksi terbaca dari {len(laporan)} bulan\n')
    lebar = '{:<16}{:>6}{:>7}  {:>14}{:>14}{:>12}  {:>14}{:>14}{:>12}  {:>13}{:>13}{:>12}'
    print(lebar.format('bulan', 'trx', 'tglx',
                       'masuk migr', 'masuk sheet', 'selisih',
                       'tetap migr', 'tetap sheet', 'selisih',
                       'RT migr', 'RT sheet', 'selisih'))
    print('-' * 165)
    for r in laporan:
        t = total.get(r['bulan'], {'PEMASUKAN': 0, 'TETAP': 0, 'RUMAH_TANGGA': 0})
        print(lebar.format(
            f"{r['bulan']} {r['nama'][:3]}", r['jumlah'], r['tanpa_tanggal'],
            rp(r['PEMASUKAN']), rp(t['PEMASUKAN']), rp(r['PEMASUKAN'] - t['PEMASUKAN']),
            rp(r['TETAP']), rp(t['TETAP']), rp(r['TETAP'] - t['TETAP']),
            rp(r['RUMAH_TANGGA']), rp(t['RUMAH_TANGGA']), rp(r['RUMAH_TANGGA'] - t['RUMAH_TANGGA'])))
    print()
    for r in laporan:
        if r['dilewati']:
            print(f"  {r['bulan']} turunan dilewati : {' | '.join(r['dilewati'])}")
    print()
    for r in laporan:
        if r['cicilan']:
            print(f"  {r['bulan']} daftar cicilan  : {' | '.join(r['cicilan'])}")


if __name__ == '__main__':
    main()


# ---------------------------------------------------------------- ekspor ---

def kategori_rt(item):
    """Tebakan kategori sederhana untuk bulan sebelum kolom Kategori ada."""
    import re as _re
    peta = [
        ('Pangan', r'belanja|pasar|bravo|superindo|aeon|hokky|galon|telur|telor|sayur|buah|daging|ikan|ayam|lauk|susu|kopi|jajan|makan|nasi|bakso|soto|sate|mie|bakmi|roti|donut|kue|sourdough|martabak|tahu|gula|santan|snack|minum|grabfood|depot|warung|cafe|hotpot|pizza|nugget|salad|ragi|tepung|elpiji|lawson|indomaret|mcd|koi'),
        ('Sandang', r'baju|celana|jaket|kaos|sepatu|tas|kacamata|casing|setrika|strika|laundry|potong rambut|barbershop|vermak|sabun|pasta gigi|pembalut|oli|servis|service|perbaikan|cuci mobil|materai|indrive|grab|j&t|amplop'),
        ('Papan', r'pbb|kebon|taman|tukang|bebersih|cuci ac|pel |vaccum|sprei|cabinet|rak |perlengkapan|lampu|listrik|pdam|gelas|stempel|racun tikus|ovo|topup'),
        ('Hobi', r'tennis|tenis|gym|fitness|hero|spiderman|nonton|game|sepeda|buku|three vi|grinder|biji kopi|pameran'),
        ('Gift', r'kado|hadiah|amplop wedding|traktir|tuppak|angpao|sin cia|jastip|titipan|fellowship'),
        ('Travelling', r'liburan|penginapan|hotel|tiket|ijen|pacitan|bali|jakarta|trawas|outing|ragunan|wisata|pesawat|kereta'),
        ('Kesehatan', r'rumah sakit|klinik|dokter|apotek|obat|vitamin|vaksin|berobat|scaling|putel'),
    ]
    for nama, pola in peta:
        if _re.search(pola, item, _re.I):
            return nama
    return 'Lainnya'


def kategori_lain(jenis, item):
    import re as _re
    if jenis == 'PEMASUKAN':
        for nama, pola in [('Gaji Ryan', r'gaji ryan|gaji bru ryan|pk ryan'),
                           ('Gaji BRU', r'gaji bru'),
                           ('Gaji Pokok', r'gaji pokok|^g ?1[34]|^g 14|gaji'),
                           ('Tunjangan', r'tunjangan|tukin|tpp'),
                           ('Uang Makan', r'uang makan'),
                           ('THR & Bonus', r'thr|bonus'),
                           ('Fee & Honor', r'fee|honor|fk unair|koperasi|narsum|^pk |giznus|mas halim|kelebihan')]:
            if _re.search(pola, item, _re.I):
                return nama
        return 'Lainnya'
    for nama, pola in [('Arisan', r'arisan'), ('Rumah', r'kpr|pbb|iuran perumahan'),
                       ('Utilitas', r'internet|indihome|pdam|listrik|telkomsel|xl '),
                       ('Langganan', r'spotify|netflix|icloud'),
                       ('Transport', r'bensin|parkir|tol|servis mobil|aki'),
                       ('Cicilan', r'cicilan|iphone|huawei|jam papa|vaccum|azko|fitnessworks'),
                       ('Kartu Kredit', r'^cc '), ('Uang Makan', r'uang makan'),
                       ('Keluarga', r'papa|mama|hutang|iuran gizi|mitra wonokoyo|kasih')]:
        if _re.search(pola, item, _re.I):
            return nama
    return 'Lainnya'


def ekspor_json(path_xlsx, keluar):
    """Tulis data contoh berformat sama dengan jawaban 'awal' dari Apps Script."""
    import json
    buku = muat(path_xlsx)
    transaksi, _ = baca_semua(buku)
    out = []
    for i, t in enumerate(transaksi):
        if t['jenis'] == 'RUMAH_TANGGA':
            kat = kategori_rt(t['item'])
        else:
            kat = kategori_lain(t['jenis'], t['item'])
        sifat = '' if t['jenis'] == 'PEMASUKAN' else (
            'KEINGINAN' if kat in ('Hobi', 'Gift', 'Travelling') else 'WAJIB')
        out.append({'id': f'mig-{i}', 'tanggal': t['tanggal'], 'bulan': t['bulan'],
                    'jenis': t['jenis'], 'kategori': kat, 'item': t['item'],
                    'nominal': t['nominal'], 'sifat': sifat,
                    'catatan': '', 'sumber': 'migrasi'})
    with open(keluar, 'w') as f:
        json.dump({'transaksi': out}, f, ensure_ascii=False)
    print(f'{len(out)} transaksi ditulis ke {keluar}')
