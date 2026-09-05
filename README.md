# Keuangan Keluarga Gemoy (KKG)

Aplikasi web pencatat keuangan keluarga yang menulis langsung ke Google Sheet.
Dipakai terutama dari HP, bisa dipasang ke Layar Utama, dan tetap bisa mencatat
saat tidak ada sinyal.

**Mulai dari [PANDUAN.md](PANDUAN.md)** untuk memasangnya.

## Isi proyek

```
app/            Aplikasi (PWA). Modul ES biasa — tanpa npm, tanpa build.
apps-script/    Kode Google Apps Script yang ditempel ke Sheet.
worker/         Cloudflare Worker pengirim notifikasi push.
tools/          Alat bantu sekali pakai (uji migrasi, uji push, pembuat logo & kunci).
```

## Cara kerjanya

```
HP / laptop  ──POST text/plain + token──>  Apps Script  ──>  Google Sheet
   (GitHub Pages, statis)                  (menempel di Sheet itu sendiri)
```

Sheet tetap jadi sumber kebenaran: apa pun bisa dibuka, diperiksa, dan diedit
langsung dari Google Sheet seperti biasa. Aplikasi hanya menyimpan salinan
sementara di HP supaya tetap terbuka saat luring.

Permintaan dikirim sebagai `text/plain`, bukan `application/json`. Itu membuat
browser memperlakukannya sebagai permintaan sederhana sehingga tidak ada
preflight `OPTIONS` — yang penting, karena Apps Script tidak bisa menjawab
`OPTIONS` sama sekali.

## Menjalankan di komputer

Tidak ada langkah build. Cukup layani foldernya lewat server statis apa pun:

```bash
cd app && python3 -m http.server 8000
```

Lalu buka `http://localhost:8000`. Aplikasi akan meminta URL Apps Script dan PIN
seperti di HP.

## Alat bantu

| Perintah / berkas | Gunanya |
|---|---|
| `python3 tools/cek_migrasi.py <berkas.xlsx>` | Menguji algoritma migrasi terhadap salinan Sheet (.xlsx) tanpa menyentuh data asli. Cerminan Python dari `apps-script/Migrasi.gs` — kalau salah satunya diubah, ubah keduanya. |
| `tools/uji_push.html` | Uji bolak-balik enkripsi Web Push (RFC 8291) dan tanda tangan VAPID. Butuh server lokal karena memakai modul ES. |
| `tools/buat_kunci_vapid.html` | Membuat pasangan kunci VAPID untuk notifikasi. Bisa dibuka langsung tanpa server. |
| `python3 tools/buat_logo.py` | Menggambar ulang logo KKG dari koordinat terhitung. |

## Catatan desain

- **Warna grafik diuji, bukan dipilih dengan selera.** Seluruh palet lolos
  pemeriksaan pita kecerahan, lantai kroma, pemisahan buta warna, dan kontras
  di tema terang maupun gelap. Nilainya ada di `app/css/tema.css`.
- **Merah/hijau tidak pernah berdiri sendiri.** Penanda WAJIB/KEINGINAN selalu
  disertai tulisan, karena merah lawan hijau adalah pasangan terburuk bagi buta
  warna merah-hijau. Hijaunya pun digeser ke arah toska agar terbedakan.
- **Tidak ada tombol yang menghapus data.** Kategori yang tidak dipakai lagi
  "disisihkan" — barisnya tetap ada di tab `Kategori` dengan status `arsip`,
  transaksi lamanya utuh, pagu bulan-bulan lalu tetap tersimpan, dan tombol
  "Pakai lagi" selalu tersedia. Transaksi dan mutasi saving pun dihapus lunak
  dengan cara yang sama.
- **Daftar kategori punya satu sumber**, yaitu tab `Kategori` di Sheet. Layar
  Anggaran yang mengubahnya, dan perubahan itu langsung terasa di form catat,
  saringan Riwayat, tagihan rutin, dan pengingat pagi.
- **Tema mengikuti HP**, tanpa tombol ganti tema.
- **Efek kaca dimatikan otomatis** kalau pengguna menyalakan pengurangan
  transparansi di pengaturan aksesibilitas.
