# Keuangan Keluarga Gemoy (KKG)

Aplikasi web pencatat keuangan keluarga yang menulis langsung ke Google Sheet.
Dipakai terutama dari HP, bisa dipasang ke Layar Utama, dan tetap bisa mencatat
saat tidak ada sinyal.

**Mulai dari [PANDUAN.md](PANDUAN.md)** untuk memasangnya.

## Isi proyek

```
app/            Aplikasi (PWA). Modul ES biasa — tanpa npm, tanpa build.
apps-script/    Kode Google Apps Script yang menempel di Sheet.
worker/         Cloudflare Worker pengirim notifikasi push.
tools/          Alat bantu (uji hitungan, uji push, deploy, pembuat logo & kunci).
```

## Cara kerjanya

```
HP / laptop  ──POST text/plain + token──>  Apps Script  ──>  Google Sheet
   (GitHub Pages, statis)                  (menempel di Sheet itu sendiri)
```

Sheet tetap jadi sumber kebenaran: apa pun bisa dibuka, diperiksa, dan diedit
langsung dari Google Sheet seperti biasa. Aplikasi hanya menyimpan salinan
sementara di HP supaya tetap terbuka saat luring.

Ada dua jenis tab, dan bedanya menentukan seluruh rancangan:

| Tab | Milik | Diperlakukan bagaimana |
|---|---|---|
| `INPUT TRANSAKSI`, `PILIHAN`, `TARGET`, `REKAP BULANAN`, `DASHBOARD` | Ryan | **Hanya dibaca.** Dibaca hidup tiap kali aplikasi dibuka — tidak dicermin, tidak disinkronkan. Satu sel diubah di Sheet, angkanya langsung ikut di HP. |
| `KKG …` | Aplikasi | Tempat transaksi dari HP, anggaran, tagihan rutin, dan daftar belanja disimpan. |

Karena tidak ada salinan, tidak ada yang perlu dirukunkan — dan tidak ada dua
angka yang bisa berselisih. Itu yang membuat 1.289 baris kode migrasi dan
sinkron dari sheet lama bisa dihapus seluruhnya.

Ke mana catatan dari HP ditulis diatur satu baris di tab `KKG Pengaturan`:

```
tab_tulis = KKG Transaksi        transaksi dari HP disimpan terpisah;
                                 INPUT TRANSAKSI tidak disentuh sama sekali,
                                 tapi REKAP BULANAN belum melihatnya
tab_tulis = INPUT TRANSAKSI      catatan dari HP mendarat di tabel yang sama
                                 dengan isian tangan, jadi REKAP BULANAN dan
                                 DASHBOARD ikut terisi
```

Mengubah isi sel itu sudah cukup; tidak ada kode yang perlu di-deploy ulang.
Sepuluh kolom pertama tab `KKG Transaksi` sengaja disusun persis sama dengan
`INPUT TRANSAKSI`, jadi menyatukannya kelak cuma soal salin A:J.

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
| `node tools/uji_target.mjs` | Menguji pembacaan tab `TARGET`: `"60 bulan"` harus jadi cicilan dan bukan target bulanan, target tahunan dibatasi tahun takwim, saldo utang mengecil alih-alih membesar, dan dua tahap KPR yang berbagi kategori `KPR` tidak menghitung satu pembayaran dua kali. |
| `node tools/uji_hitung.js` | Menjalankan otak Apps Script di Node dengan spreadsheet yang dipalsukan, memakai baris September 2026 yang sungguhan, lalu mencocokkan hasilnya dengan baris Sep-26 di `REKAP BULANAN`. Jalankan setiap kali `Kode.gs` atau `Ringkasan.gs` disentuh. |
| `tools/deploy.sh "keterangan"` | Kirim `apps-script/` ke proyek Apps Script, buat versi baru, dan arahkan deployment yang sama ke sana — jadi URL `/exec` di HP tidak berubah. |
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
  "disisihkan" — barisnya tetap ada di tab `KKG Kategori` dengan status `arsip`,
  transaksi lamanya utuh, pagu bulan-bulan lalu tetap tersimpan, dan tombol
  "Pakai lagi" selalu tersedia. Transaksi pun dihapus lunak dengan cara yang
  sama: barisnya tetap ada, statusnya saja yang berubah.
- **Mencentang daftar belanja tidak mencatat uang.** Daftar Belanja adalah alat
  bantu di toko, bukan pembukuan: uang keluar sekali di kasir, bukan per barang.
  Mencentang hanya memindahkan barangnya ke "pernah dibeli" dan mencap
  tanggalnya. Untuk uangnya ada tombol "Catat belanjanya" yang membuka form
  catat-banyak dengan nama barangnya sudah terisi — satu struk jadi satu
  rangkaian catatan, tanpa angka yang dihitung dua kali.
- **Barang belanja pun tidak pernah dihapus.** Satu barang satu baris di tab
  `KKG Belanja`, selamanya, lengkap dengan tanggal beli terakhir dan sudah berapa
  kali dibeli. Itulah yang membuat daftar minggu berikutnya bisa dibuat dengan
  mengetuk, bukan mengetik: sarannya diurutkan dari yang paling lama tidak
  dibeli. Yang tidak ingin disarankan lagi diberi status `arsip`, bukan dibuang.
- **Baris milik sheet tidak bisa diubah dari HP.** Baris yang diketik langsung
  di `INPUT TRANSAKSI` muncul di aplikasi dengan tombol Ubah dan Hapus yang
  memang tidak ada, disertai alasannya. Yang tetap bisa disetel dari HP cuma
  sifat WAJIB/KEINGINAN — sheet baru tidak punya kolom itu, jadi penandanya
  disimpan terpisah di tab `KKG Tanda`, dikunci pada sidik isi barisnya, bukan
  nomor barisnya. Menyisipkan baris di tengah Sheet tidak memindahkan penanda
  ke baris yang salah.
- **Hitungannya meniru `REKAP BULANAN` persis**: pemasukan dijumlah dari kolom
  Jenis, empat pos dijumlah dari kolom Kelompok, dan Sisa = pemasukan dikurangi
  keempat pos. Apa pun berkelompok `Transfer / Tidak dihitung` tidak ikut — dan
  justru kelompok itulah yang dipakai baris pemasukan, sehingga uang masuk
  tidak pernah terhitung dua kali. `tools/uji_hitung.js` mengujinya terhadap
  angka Sep-26 yang tertulis di sheet, bukan terhadap dirinya sendiri.
- **Persentase empat pos dibaca dari tab `TARGET`, dan tidak bisa diubah dari
  aplikasi.** Menyediakan dua tempat untuk mengubah angka yang sama adalah cara
  tercepat membuat keduanya berselisih.
- **Kolom `Periode` di tab `TARGET` dibaca menurut artinya, bukan menurut kata
  yang kebetulan ada di dalamnya.** Enam barisnya memakai lima arti yang
  berbeda — `Bulanan`, `Tahunan`, `Target total`, `Saldo awal`, dan `60 bulan`
  yang berarti cicilan 60 kali, bukan setoran bulanan. Yang paling licin justru
  yang terakhir: ia juga memuat kata "bulan", nilainya pun kebetulan sebesar
  setoran bulanan yang masuk akal, jadi salah membacanya tidak akan berbunyi.
  Aturannya tinggal di `app/js/target.js`, terpisah dari `toko.js`, semata agar
  bisa diuji dari Node.
- **Saldo utang dilunasi, bukan dikumpulkan.** Rp138,5 juta di baris "Utang
  kakak suami" adalah saldo yang harus habis. Layar Target menulisnya begitu —
  "sudah dilunasi X, sisa utang Y" — bukan meminjam kalimat menabung.
- **Dua tahap KPR berbagi satu kategori, dan itu ditangani terbuka.** `KPR tahap
  1` (60×) dan `KPR tahap 2` (120×) sama-sama dicatat ke kategori `KPR`. Kalau
  tiap baris menghitung sendiri, satu pembayaran muncul di keduanya. Jadi
  tahapnya ditelusuri berurutan: angsuran ke-1..60 milik tahap 1, ke-61..180
  milik tahap 2, dan hanya tahap yang sedang berjalan yang memajang tagihan
  bulan ini.
- **Layar Target tidak punya slot navigasi sendiri.** Tiga ikon di kepala sudah
  menyisakan sekitar 60px untuk judul layar di HP 320px; yang keempat
  menghabiskannya. Jadi masuknya lewat kartu "Target keluarga" di Beranda —
  kartu itu memajang tiga target yang paling mendesak, bukan keenamnya.
- **Daftar kategori punya dua sumber yang jelas pembagiannya.** Kolom Kategori
  di tab `PILIHAN` milik Ryan dan tidak pernah disentuh skrip. Tab
  `KKG Kategori` hanya menambahi: kategori baru, saran pos untuk sebuah
  kategori, dan bendera arsip. Menyisihkan kategori dari aplikasi tidak pernah
  mencoret apa pun di `PILIHAN`.
- **Tema mengikuti HP**, tanpa tombol ganti tema.
- **Efek kaca dimatikan otomatis** kalau pengguna menyalakan pengurangan
  transparansi di pengaturan aksesibilitas.
