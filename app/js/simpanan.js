// Penyimpanan lokal.
//
// - Cache & token: localStorage (kecil, perlu dibaca serentak saat start).
// - Antrian kirim (outbox): IndexedDB. Sengaja bukan localStorage — antrian ini
//   berisi catatan belanja yang belum sampai ke Sheet, dan localStorage bisa
//   dibersihkan browser tanpa permisi. Kehilangan cache tidak apa-apa;
//   kehilangan antrian berarti belanjaan Ryan hilang.

const DB_NAMA = 'kkg';
const TOKO = 'antrian';

let dbJanji;

function db() {
  if (dbJanji) return dbJanji;
  dbJanji = new Promise((selesai, gagal) => {
    const p = indexedDB.open(DB_NAMA, 1);
    p.onupgradeneeded = () => {
      if (!p.result.objectStoreNames.contains(TOKO)) {
        p.result.createObjectStore(TOKO, { keyPath: 'kunci', autoIncrement: true });
      }
    };
    p.onsuccess = () => selesai(p.result);
    p.onerror = () => gagal(p.error);
  });
  return dbJanji;
}

async function transaksi(mode, kerja) {
  const basis = await db();
  return new Promise((selesai, gagal) => {
    const t = basis.transaction(TOKO, mode);
    const hasil = kerja(t.objectStore(TOKO));
    t.oncomplete = () => selesai(hasil?.result ?? hasil);
    t.onerror = () => gagal(t.error);
  });
}

export const antrian = {
  async tambah(item) {
    try {
      return await transaksi('readwrite', (s) => s.add({ ...item, waktu: Date.now() }));
    } catch (e) {
      // IndexedDB bisa ditolak di mode penyamaran. Jatuh ke localStorage supaya
      // tetap ada, walau lebih rapuh.
      const cad = JSON.parse(localStorage.getItem('kkg_antrian_cadangan') || '[]');
      cad.push({ ...item, waktu: Date.now() });
      localStorage.setItem('kkg_antrian_cadangan', JSON.stringify(cad));
    }
  },
  async semua() {
    let utama = [];
    try { utama = await transaksi('readonly', (s) => s.getAll()) || []; } catch (e) { /* abaikan */ }
    const cad = JSON.parse(localStorage.getItem('kkg_antrian_cadangan') || '[]');
    return [...utama, ...cad];
  },
  async bersihkan(kunciTerkirim) {
    try {
      await transaksi('readwrite', (s) => {
        kunciTerkirim.forEach((k) => { if (k !== undefined) s.delete(k); });
      });
    } catch (e) { /* abaikan */ }
    localStorage.removeItem('kkg_antrian_cadangan');
  },
  async jumlah() { return (await this.semua()).length; }
};

// ------------------------------------------------------------------ cache --

export const lokal = {
  ambil(kunci, bawaan = null) {
    try {
      const v = localStorage.getItem('kkg_' + kunci);
      return v === null ? bawaan : JSON.parse(v);
    } catch (e) { return bawaan; }
  },
  simpan(kunci, nilai) {
    try { localStorage.setItem('kkg_' + kunci, JSON.stringify(nilai)); }
    catch (e) { /* kuota penuh: cache boleh hilang */ }
  },
  hapus(kunci) {
    try { localStorage.removeItem('kkg_' + kunci); } catch (e) { /* abaikan */ }
  }
};

/** Minta browser tidak membuang data kita saat ruang menipis. */
export async function mintaAwet() {
  try { await navigator.storage?.persist?.(); } catch (e) { /* abaikan */ }
}
