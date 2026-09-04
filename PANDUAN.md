# Panduan pasang — Keuangan Keluarga Gemoy

Sekali pasang, lalu tinggal dipakai. Waktu yang dibutuhkan kira-kira 25 menit.

Urutannya penting: **Sheet dulu, aplikasi belakangan.** Notifikasi (langkah 5)
boleh dilewati dulu dan dikerjakan kapan saja nanti — bagian lain tetap jalan.

---

## 1. Pasang skrip di Google Sheet (10 menit)

1. Buka Sheet keuangan Anda → menu **Ekstensi → Apps Script**.
2. Hapus isi `Code.gs` bawaan. Lalu buat lima berkas dan tempel isinya dari folder
   `apps-script/` di proyek ini. Nama berkas di editor **tanpa akhiran `.gs`** —
   editornya menambahkan sendiri:

   | Buat berkas bernama | Tempel isi dari |
   |---|---|
   | `Kode`      | `apps-script/Kode.gs` |
   | `Ringkasan` | `apps-script/Ringkasan.gs` |
   | `Rutin`     | `apps-script/Rutin.gs` |
   | `Migrasi`   | `apps-script/Migrasi.gs` |
   | `Pengingat` | `apps-script/Pengingat.gs` |

3. Simpan (Ctrl/Cmd + S).
4. Di kotak pilihan fungsi di atas, pilih **`siapkanSheet`** → klik **Run**.
   Google akan meminta izin sekali: *Review permissions → pilih akun Anda →
   Advanced → Go to (nama proyek) → Allow*. Ini wajar — skripnya memang perlu izin
   menulis ke Sheet Anda sendiri.

   Setelah selesai akan muncul tujuh tab baru: `Transaksi`, `Rutin`, `Anggaran`,
   `Saving`, `Perangkat`, `Pengaturan`, `Ringkasan`. Tab lama Anda tidak disentuh.

5. Tetapkan PIN keluarga. Di editor, ubah sementara baris paling bawah mana pun
   menjadi pemanggilan berikut — atau lebih mudah: buka menu fungsi, pilih
   `setPin`, lalu jalankan lewat **Run**; kalau diminta argumen, ketik langsung
   di editor sebuah fungsi kecil seperti ini lalu jalankan fungsi itu:

   ```javascript
   function pasangPinSaya() {
     return setPin('123456');   // ganti dengan PIN pilihan Anda, 4-6 angka
   }
   ```

   Setelah berhasil, **hapus fungsi itu** supaya PIN-nya tidak tertinggal
   sebagai teks di dalam skrip.

6. Isi daftar tagihan & cicilan awal: pilih fungsi **`isiRutinAwal`** → **Run**.
   Angkanya diambil dari Sheet Anda per September 2026; nanti bisa diubah dari
   dalam aplikasi.

---

## 2. Pindahkan data lama (5 menit)

1. Jalankan fungsi **`periksaMigrasi`**. Ini **tidak mengubah apa pun** — hanya
   menulis laporan ke tab baru `Migrasi Cek`.
2. Buka tab `Migrasi Cek` dan bandingkan kolom "migrasi" dengan "sheet".

   **Yang wajar terjadi:**

   - **Rumah tangga selisih 0** di semua bulan. Ini yang paling penting; kalau
     ada yang tidak nol, hentikan dan periksa dulu.
   - **Pemasukan migrasi lebih besar** di Des 2025, Mar, Apr, dan Jun 2026.
     Bukan salah hitung: rumus `=sum(C6:C11)` di Sheet lama hanya menjumlah
     baris 6–11, sementara THR (Des), Fee Giznus + Uang Koperasi (Mar),
     PK GKKA + PK Paskah (Apr), dan PK Emoy (Jun) ada di baris 12–13 sehingga
     tidak pernah ikut terhitung. Migrasi menghitungnya — jadi angka barunya
     yang benar.
   - **Pengeluaran tetap migrasi lebih kecil** di hampir semua bulan 2026.
     Juga bukan salah hitung: rumus total di Sheet lama tidak konsisten antar
     bulan — Februari `=SUM(L6:L38)` ikut menjumlah baris Saving dan Perpuluhan,
     Mei ikut menjumlah Arisan Cappadocia dua kali, Juli mulai dari baris 9
     sehingga dua arisan terlewat. Perpuluhan/Saving/Entertain sengaja **tidak**
     dimigrasikan sebagai transaksi karena tab `Ringkasan` menghitungnya ulang
     dari persentase; kalau ikut dimasukkan, uangnya terhitung dua kali.
     Kolom "baris turunan yang sengaja dilewati" memperlihatkan angkanya.
   - Kolom "tglx" memberi tahu berapa transaksi yang tidak punya petunjuk
     tanggal di namanya. Semua itu diberi tanggal 1 dan catatan
     `tanggal perkiraan`, dan bisa dirapikan belakangan lewat aplikasi.

3. Kalau sudah cocok, jalankan **`jalankanMigrasi`**.
   Salah? Jalankan **`batalkanMigrasi`** — hanya baris bersumber `migrasi` yang
   dihapus, catatan yang Anda masukkan lewat aplikasi tidak tersentuh. Boleh
   diulang berapa kali pun.

4. Opsional: jalankan **`usulkanAnggaran`** untuk mengisi pagu bulan berjalan
   dari rata-rata belanja enam bulan terakhir.

> **Catatan soal saldo saving.** Rantai saldo di `SAVING 2026` punya satu rumus
> yang salah rujuk: baris ke-10 memakai `=D7+B10-C10`, jadi melompati baris 8
> dan 9 (Rp600.000 + Rp200.000) dan semua baris di bawahnya mewarisi kekurangan
> itu. Tab `Saving` yang baru menghitung ulang seluruh mutasi, sehingga saldonya
> **Rp14.127.046**, bukan Rp13.327.046 seperti yang tertulis di tab lama.

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

**Setiap kali Anda mengubah kode `.gs`, ulangi Deploy** — pilih
*Manage deployments → ikon pensil → Version: New version → Deploy*. Kalau
membuat *New deployment*, URL-nya berubah dan harus ditempel ulang di aplikasi.

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

3. Di Sheet, buka tab **`Pengaturan`** dan isi tiga baris ini:

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
| Angka aplikasi beda dengan Sheet | Jalankan `segarkanRingkasan` di Apps Script |
| Notifikasi tidak datang di iPhone | Aplikasi belum ditambahkan ke Layar Utama, atau izin belum diberikan |
| Catatan tertahan "tertunda" | Sedang tanpa sinyal. Akan terkirim sendiri; bisa dipaksa lewat Pengaturan → Kirim catatan tertunda |

Data Anda selalu ada di Google Sheet. Aplikasi ini hanya jendela — kalau
aplikasinya bermasalah, angkanya tetap utuh di `Transaksi` dan bisa dibuka
langsung dari Sheet seperti biasa.
