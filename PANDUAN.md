# Panduan pasang — Keuangan Keluarga Gemoy

Sekali pasang, lalu tinggal dipakai. Waktu yang dibutuhkan kira-kira 20 menit.

Urutannya penting: **Sheet dulu, aplikasi belakangan.** Notifikasi (langkah 5)
boleh dilewati dulu dan dikerjakan kapan saja nanti — bagian lain tetap jalan.

Aplikasi ini membaca tab `INPUT TRANSAKSI` **hidup, apa adanya, setiap kali
dibuka**. Tidak ada migrasi, tidak ada pekerjaan sinkron, tidak ada salinan yang
perlu dirukunkan: satu sel diubah di Sheet, angkanya langsung ikut berubah di
HP. Yang ditulis aplikasi hanya tab-tab berawalan `KKG `.

---

## 1. Pasang skrip di Google Sheet (10 menit)

Spreadsheet yang dipakai adalah yang berisi tab **`INPUT TRANSAKSI`**,
**`PILIHAN`**, dan **`TARGET`**. Kalau berkasnya masih berupa Excel yang
di-upload (judulnya berakhiran `.xlsx` atau `.xlsm`), ubah dulu jadi Google
Sheet asli lewat **File → Simpan sebagai Google Sheets** — Apps Script tidak
bisa membuka, apalagi menulisi, berkas Office.

1. Buka spreadsheet itu → menu **Ekstensi → Apps Script**.
2. Cara termudah mengirim kodenya adalah lewat `clasp` dari komputer:

   ```bash
   tools/deploy.sh "pasang pertama"
   ```

   Kalau memilih salin-tempel manual: hapus isi `Code.gs` bawaan, lalu buat
   empat berkas ini dan tempel isinya dari folder `apps-script/`. Nama berkas di
   editor **tanpa akhiran `.gs`** — editornya menambahkan sendiri.

   | Buat berkas bernama | Tempel isi dari |
   |---|---|
   | `Kode`      | `apps-script/Kode.gs` |
   | `Ringkasan` | `apps-script/Ringkasan.gs` |
   | `Rutin`     | `apps-script/Rutin.gs` |
   | `Pengingat` | `apps-script/Pengingat.gs` |

3. Simpan (Ctrl/Cmd + S).
4. Di kotak pilihan fungsi di atas, pilih **`siapkanSheet`** → klik **Run**.
   Google akan meminta izin sekali: *Review permissions → pilih akun Anda →
   Advanced → Go to (nama proyek) → Allow*. Ini wajar — skripnya memang perlu
   izin menulis ke spreadsheet Anda sendiri.

   Setelah selesai akan muncul sembilan tab baru, semuanya berawalan `KKG `:
   `KKG Transaksi`, `KKG Tanda`, `KKG Kategori`, `KKG Anggaran`, `KKG Rutin`,
   `KKG Belanja`, `KKG Perangkat`, `KKG Pengaturan`, `KKG Ringkasan`.

   **Tab bawaan Anda tidak disentuh sama sekali.** Kalau `siapkanSheet` menolak
   jalan dengan pesan "Spreadsheet ini bukan yang diharapkan", berarti skripnya
   menempel di berkas yang salah — ia sengaja berhenti daripada membuat tab di
   tempat yang keliru.

5. Tetapkan PIN keluarga. **Jangan menjalankan `setPin` langsung dari tombol
   Run** — fungsi itu butuh argumen, sedangkan tombol Run memanggilnya tanpa
   argumen, jadi yang muncul hanya pesan galat. Caranya:

   a. Buka tab **`KKG Pengaturan`**, cari baris berkunci **`pin_baru`**, lalu
      tulis PIN pilihan Anda (4–6 angka) di kolom sebelahnya.
   b. Kembali ke editor Apps Script, jalankan fungsi **`pasangPinDariSheet`**.
   c. Selesai — PIN tersimpan dalam bentuk teracak, dan sel `pin_baru`
      dikosongkan sendiri supaya angkanya tidak tertinggal di spreadsheet.

   Mau ganti PIN nanti? Ulangi tiga langkah yang sama. Menu **KKG** di bilah
   atas Spreadsheet juga memuat ketiga fungsi ini, jadi tidak perlu membuka
   editor lagi.

6. Isi daftar tagihan & cicilan awal: pilih fungsi **`isiRutinAwal`** → **Run**.
   Angkanya diambil dari baris September 2026 di `INPUT TRANSAKSI`; nanti bisa
   diubah dari dalam aplikasi.

---

## 2. Ke mana catatan dari HP ditulis (1 menit)

Ini satu-satunya setelan yang mengubah perilaku aplikasi secara besar, dan
tempatnya satu baris di tab **`KKG Pengaturan`**, kunci **`tab_tulis`**.

| Isi selnya | Akibatnya |
|---|---|
| `KKG Transaksi` (bawaan) | Catatan dari HP disimpan di tab milik aplikasi. `INPUT TRANSAKSI` tidak disentuh sama sekali. **Tapi `REKAP BULANAN` dan `DASHBOARD` belum melihat catatan dari HP** — keduanya cuma membaca `INPUT TRANSAKSI`. Angka di aplikasi sendiri selalu menggabungkan keduanya, jadi aplikasi tidak pernah salah; yang tertinggal adalah rekap di sheet. |
| `INPUT TRANSAKSI` | Catatan dari HP mendarat di tabel yang sama dengan isian tangan, memakai baris siap-isi di bawah tabel lebih dulu. `REKAP BULANAN` dan `DASHBOARD` ikut terisi. Baris dari sheet juga jadi bisa diubah dan dihapus dari aplikasi. |

Mulailah dengan bawaannya. Kalau sudah yakin, ganti isi selnya — tidak ada kode
yang perlu di-deploy ulang, cukup muat ulang aplikasinya di HP.

> **Kenapa tidak langsung `INPUT TRANSAKSI` saja?** Karena selama masa coba,
> satu kesalahan aplikasi berarti baris asing di tabel yang Anda pakai
> sehari-hari. Dengan bawaannya, kesalahan apa pun terkumpul di satu tab yang
> bisa dihapus seluruhnya tanpa menyentuh catatan tangan Anda.

**Kalau nanti mau menyatukannya secara manual:** sepuluh kolom pertama
`KKG Transaksi` disusun persis sama dengan `INPUT TRANSAKSI`, jadi tinggal
salin blok A:J-nya ke bawah tabel dan hapus baris asalnya. Aplikasi sudah
menyiapkan diri untuk itu: baris yang muncul di dua tempat hanya dihitung
sekali, dan yang menang adalah baris di `INPUT TRANSAKSI`.

---

## Menyetor ke target keluarga

Tab `TARGET` memuat enam target rupiah — trip bulanan, travel tahunan, renovasi,
saldo utang, dan dua tahap KPR. Aplikasi membacanya apa adanya dan tidak pernah
menulis balik ke tab itu; kalau angkanya berubah, ubah di Sheet.

Setorannya dicatat dari layar **Target**, yang dibuka lewat kartu "Target
keluarga" di Beranda. Tombol **Setor ke target ini** membuka form catat dengan
Jenis `Alokasi Tujuan`, Kelompok, dan Kategori sudah terisi — tiga pilihan yang
harus tepat, dan justru karena harus tepat itulah selama ini tidak pernah ada
setoran yang tercatat.

Empat kategorinya (`Keluar Kota Bulanan`, `Luar Negeri Tahunan`,
`Renovasi Atap & Kitchen Set`, `Hutang Kakak Suami`) memang tidak ada di
dropdown `PILIHAN`; aplikasi menyediakannya sendiri lewat tab `KKG Kategori`.
Kategori `KPR` datang dari `PILIHAN` dan tidak punya saran pos, jadi Kelompoknya
tinggal dipilih sendiri saat mencatat — atau dikunci sekali lewat layar Anggaran,
yang menuliskannya ke `KKG Kategori`.

**Kolom `Trip Kota`, `Travel LN`, `Renovasi`, `Bayar Utang`, dan `KPR` di
`REKAP BULANAN` terisi sendiri** begitu setoran tercatat — tapi hanya kalau
`tab_tulis` sudah `INPUT TRANSAKSI` (langkah 2). Rumus di kolom itu menjumlah
`INPUT TRANSAKSI`, dan tidak melihat tab `KKG Transaksi`.

---

## 3. Terbitkan Web App (3 menit)

1. Di editor Apps Script, klik **Deploy → New deployment**.
2. Klik roda gigi di sebelah "Select type" → pilih **Web app**.
3. Isi:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Klik **Deploy**, lalu **salin URL** yang berakhiran `/exec`.

> **"Anyone" itu aman?** Ya, karena setiap permintaan tetap harus membawa PIN
> keluarga Anda. Pengaturan ini hanya berarti "boleh dihubungi tanpa login
> Google" — tanpa itu, aplikasi di HP tidak bisa memanggil skripnya sama sekali.
> Yang menjaga datanya adalah PIN, bukan alamatnya.

5. Simpan ID deployment-nya (bagian URL antara `/macros/s/` dan `/exec`) supaya
   `tools/deploy.sh` bisa memakainya lagi:

   ```bash
   echo "AKfyc..." > .clasp-deployment
   ```

**Setiap kali Anda mengubah kode `.gs`, ulangi Deploy** — cara termudah
`tools/deploy.sh "keterangan"`, atau lewat editor: *Manage deployments → ikon
pensil → Version: New version → Deploy*. Kalau membuat *New deployment*,
URL-nya berubah dan harus ditempel ulang di setiap HP.

---

## 4. Terbitkan aplikasi ke GitHub Pages (5 menit)

1. Buat repositori baru di GitHub, lalu dari folder proyek ini:

   ```bash
   git add . && git commit -m "Keuangan Keluarga Gemoy" && git branch -M main
   ```

   ```bash
   git remote add origin https://github.com/NAMA-ANDA/keuangan-keluarga-gemoy.git && git push -u origin main
   ```

2. Di GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Tunggu tab **Actions** hijau, lalu buka alamat yang muncul di Settings → Pages.
4. Layar pertama akan meminta **URL Web App** dari langkah 3. Tempel, lalu
   masukkan PIN.

**Pasang ke HP** (dan ini juga syarat notifikasi di iPhone):

- **iPhone/iPad:** buka di Safari → tombol Bagikan → *Tambahkan ke Layar Utama*.
- **Android:** buka di Chrome → menu titik tiga → *Instal aplikasi*.

---

## 5. Notifikasi push (10 menit, boleh nanti)

Tanpa langkah ini aplikasi tetap berjalan penuh; yang hilang hanya notifikasi
yang muncul saat aplikasi tidak dibuka. Kartu **"Jatuh tempo minggu ini"** di
Beranda tetap ada.

Perlu satu layanan tambahan di luar GitHub — Cloudflare Workers, gratis dan
tanpa kartu kredit — karena Web Push mewajibkan tanda tangan kriptografi yang
tidak bisa dilakukan Apps Script.

1. Buka `tools/buat_kunci_vapid.html` di browser → klik **Buat kunci baru**.
   Biarkan halamannya terbuka; tiga nilainya dipakai di bawah ini.

2. Pasang Worker (butuh Node.js di komputer; boleh dari komputer mana saja):

   ```bash
   cd worker && npx wrangler deploy
   ```

   ```bash
   npx wrangler secret put VAPID_PUBLIK
   ```

   Ulangi perintah `secret put` untuk `VAPID_PRIVAT`, `RAHASIA_BERSAMA`, dan
   `SURAT_KONTAK` (isi yang terakhir dengan `mailto:` + email Anda). Salin
   alamat Worker yang muncul setelah deploy.

3. Di Sheet, buka tab **`KKG Pengaturan`** dan isi tiga baris ini:

   | kunci | nilai |
   |---|---|
   | `worker_url` | alamat Worker dari langkah 2 |
   | `worker_rahasia` | nilai `RAHASIA_BERSAMA` |
   | `vapid_publik` | nilai `VAPID_PUBLIK` |

4. Di Apps Script, jalankan fungsi **`pasangPemicuHarian`** sekali.

5. Buka aplikasi dari **ikon di Layar Utama** (bukan dari tab browser biasa) →
   **Pengaturan → Aktifkan notifikasi di perangkat ini**. Ulangi di tiap HP.

6. Uji tanpa menunggu besok: jalankan **`kirimPengingatSekarang_`** di Apps Script.

> **Batasan iPhone yang perlu diketahui:** notifikasi web di iOS **hanya**
> bekerja kalau aplikasinya sudah ditambahkan ke Layar Utama dan dibuka dari
> ikon itu (iOS 16.4 ke atas). Dibuka lewat tab Safari biasa, tombol izinnya
> tidak akan muncul sama sekali. Di Android tidak ada syarat ini.

---

## Kalau ada yang tidak beres

| Gejala | Kemungkinan sebabnya |
|---|---|
| "Tidak bisa menghubungi server" | Deployment belum dibuat, atau "Who has access" belum `Anyone`. Uji dengan membuka URL `/exec` di browser — harusnya muncul `{"ok":true,...}` |
| "PIN salah" padahal benar | `setPin` belum pernah dijalankan, atau dijalankan di proyek Apps Script yang berbeda |
| Perubahan kode `.gs` tidak terasa | Belum Deploy ulang sebagai **New version** |
| Menekan Run tapi yang jalan fungsi lain | Pemilih fungsi di toolbar kadang cuma berubah tulisannya tanpa benar-benar ganti pilihan. Cara paling aman: klik dulu berkas yang memuat fungsinya di panel Files, lalu **cek riwayat di menu Executions** (ikon jam di kiri) untuk memastikan nama fungsi yang benar-benar dijalankan — jangan cuma percaya tulisan "Execution completed" |
| Tab `KKG Ringkasan` tertinggal | Jalankan `segarkanRingkasan`, atau menu **KKG → Segarkan Ringkasan** |
| Aplikasi menyapa "Alamatnya sudah pindah" | Wajar sekali, setelah pindah ke Sheet baru. HP itu masih menyimpan alamat `/exec` yang lama. Tempel alamat baru sekali, lalu masuk dengan PIN |
| Baris yang baru diketik di Sheet tidak muncul di aplikasi | Muat ulang aplikasinya. Kalau tetap tidak muncul, periksa apakah kolom Keterangan **dan** Nominal-nya sama-sama kosong — baris seperti itu dianggap baris siap-isi dan sengaja dilewati |
| Angka di aplikasi lebih besar daripada `REKAP BULANAN` | Wajar selama `tab_tulis` masih `KKG Transaksi`. Selisihnya persis isi tab `KKG Transaksi`, karena rumus REKAP cuma membaca `INPUT TRANSAKSI`. Lihat langkah 2 |
| Tombol Ubah/Hapus tidak ada di sebuah transaksi | Baris itu tinggal di `INPUT TRANSAKSI`, jadi hanya bisa diubah dari Google Sheets. Kalau ingin aplikasi ikut mengelolanya, ganti `tab_tulis` (langkah 2) |
| Sifat WAJIB/KEINGINAN sebuah baris tiba-tiba kembali ke bawaan | Penandanya dikunci pada isi barisnya. Mengubah nominal, keterangan, tanggal, atau kategori baris itu di Sheet melepaskan penandanya — setel ulang sekali dari aplikasi |
| Kolom Trip Kota / Travel LN / Renovasi / Bayar Utang di REKAP selalu nol | Rumusnya menjumlah kategori yang tidak ada di dropdown `PILIHAN`. Aplikasi sudah menyediakan keempatnya lewat tab `KKG Kategori`; supaya dropdown di Sheet ikut, salin keempat namanya ke `PILIHAN` kolom C dan lebarkan validasi kolom Kategori |
| Notifikasi tidak datang di iPhone | Aplikasi belum ditambahkan ke Layar Utama, atau izin belum diberikan |
| Catatan tertahan "tertunda" | Sedang tanpa sinyal. Akan terkirim sendiri; bisa dipaksa lewat Pengaturan → Kirim catatan tertunda |

Data Anda selalu ada di Google Sheet. Aplikasi ini hanya jendela — kalau
aplikasinya bermasalah, angkanya tetap utuh di `INPUT TRANSAKSI` dan
`KKG Transaksi`, dan bisa dibuka langsung dari Sheet seperti biasa.
