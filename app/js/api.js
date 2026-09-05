// Klien Apps Script.
//
// Dikirim sebagai POST ber-Content-Type text/plain, bukan application/json.
// Itu membuat browser menganggapnya "permintaan sederhana" sehingga tidak ada
// preflight OPTIONS — yang penting karena Apps Script tidak bisa menjawab
// OPTIONS sama sekali.

import { lokal, antrian } from './simpanan.js';

export const KUNCI_URL = 'url_api';
export const KUNCI_TOKEN = 'token';

export function urlApi() {
  return lokal.ambil(KUNCI_URL, '') || (window.KKG_URL_API || '');
}

export function setUrlApi(url) {
  lokal.simpan(KUNCI_URL, String(url || '').trim());
}

export function token() { return lokal.ambil(KUNCI_TOKEN, ''); }
export function setToken(t) { lokal.simpan(KUNCI_TOKEN, t); }
export function keluar() { lokal.hapus(KUNCI_TOKEN); }

export class GagalAuth extends Error {}
export class GagalJaringan extends Error {}

export async function panggil(aksi, data = {}, opsi = {}) {
  const url = urlApi();
  if (!url) throw new Error('URL Apps Script belum diisi.');

  let jawaban;
  try {
    jawaban = await fetch(url, {
      method: 'POST',
      // text/plain = permintaan sederhana = tanpa preflight.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ aksi, data, token: opsi.token ?? token() }),
      redirect: 'follow'
    });
  } catch (e) {
    throw new GagalJaringan('Tidak bisa menghubungi server.');
  }
  if (!jawaban.ok) throw new GagalJaringan('Server menjawab ' + jawaban.status);

  let isi;
  try { isi = await jawaban.json(); }
  catch (e) { throw new GagalJaringan('Jawaban server tidak terbaca.'); }

  if (!isi.ok) {
    if (isi.kode === 'AUTH') { keluar(); throw new GagalAuth(isi.pesan); }
    throw new Error(isi.pesan || 'Permintaan gagal.');
  }
  return isi.data;
}

export function masuk(pin) {
  return panggil('masuk', { pin }, { token: '' });
}

export function muatAwal(dari) {
  return panggil('awal', { dari });
}

/**
 * Kirim satu aksi. Kalau jaringan mati, aksinya masuk antrian dan diulang
 * nanti. Semua aksi yang dipakai lewat sini idempoten — pengulangan tidak
 * pernah menghasilkan baris ganda di Sheet.
 */
export async function kirimAksi(aksi, data) {
  try {
    return await panggil(aksi, data);
  } catch (e) {
    if (e instanceof GagalJaringan) {
      await antrian.tambah({ aksi, data });
      return { tertunda: true };
    }
    throw e;
  }
}

/** Idempoten lewat `id`, jadi kirim ulang tidak bikin transaksi duplikat. */
export function kirimTransaksi(daftar) {
  return kirimAksi('transaksi.simpan', { daftar });
}

/** Kirim ulang seluruh antrian. Dipanggil saat online & saat aplikasi dibuka. */
export async function kirimAntrian() {
  const isi = await antrian.semua();
  if (!isi.length) return { terkirim: 0 };
  const selesai = [];
  for (const item of isi) {
    try {
      await panggil(item.aksi, item.data);
      selesai.push(item.kunci);
    } catch (e) {
      if (e instanceof GagalJaringan) break;   // masih offline, coba lagi nanti
      selesai.push(item.kunci);                // ditolak server: buang, jangan ulang selamanya
    }
  }
  await antrian.bersihkan(selesai);
  return { terkirim: selesai.length, sisa: isi.length - selesai.length };
}
