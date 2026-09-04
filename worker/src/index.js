/**
 * Pengirim Web Push untuk Keuangan Keluarga Gemoy.
 *
 * Kenapa bagian ini tidak ikut di Apps Script: Web Push mewajibkan JWT VAPID
 * bertanda tangan ECDSA P-256 dan isi pesan terenkripsi AES-128-GCM. Apps
 * Script tidak punya keduanya; Cloudflare Workers punya Web Crypto asli.
 *
 * Worker ini tidak menyimpan apa pun. Apps Script mengirim daftar langganan
 * beserta isi pesannya; Worker menandatangani, mengirim, lalu melaporkan
 * langganan mana yang sudah dicabut browser supaya bisa dibersihkan di Sheet.
 *
 * Rahasia yang perlu dipasang (lihat PANDUAN.md):
 *   VAPID_PUBLIK, VAPID_PRIVAT, RAHASIA_BERSAMA, SURAT_KONTAK
 */

export default {
  async fetch(permintaan, env) {
    if (permintaan.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (permintaan.method !== 'POST') {
      return jawab({ ok: false, pesan: 'Hanya menerima POST.' }, 405);
    }

    let isi;
    try { isi = await permintaan.json(); }
    catch { return jawab({ ok: false, pesan: 'Isi bukan JSON.' }, 400); }

    if (!env.RAHASIA_BERSAMA || isi.rahasia !== env.RAHASIA_BERSAMA) {
      return jawab({ ok: false, pesan: 'Rahasia tidak cocok.' }, 403);
    }

    const langganan = Array.isArray(isi.langganan) ? isi.langganan : [];
    const muatan = teks(JSON.stringify(isi.pesan || {}));

    let terkirim = 0;
    const mati = [];
    const gagal = [];

    for (const l of langganan) {
      try {
        const r = await kirimSatu(l, muatan, env);
        if (r.ok) terkirim++;
        // 404/410 = langganan sudah dicabut browser. Selain itu masalah sementara.
        else if (r.status === 404 || r.status === 410) mati.push(l.id);
        else gagal.push(`${l.id}: ${r.status}`);
      } catch (e) {
        gagal.push(`${l.id}: ${e.message}`);
      }
    }

    return jawab({ ok: true, terkirim, mati, gagal });
  }
};

async function kirimSatu(langganan, muatan, env) {
  const asal = new URL(langganan.endpoint).origin;
  const jwt = await buatVapidJwt(asal, env);
  const badan = await enkripsi(muatan, langganan.keys);

  return fetch(langganan.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIK}`
    },
    body: badan
  });
}

// ------------------------------------------------------------------ VAPID --

async function buatVapidJwt(asal, env) {
  const kepala = b64url(teks(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const klaim = b64url(teks(JSON.stringify({
    aud: asal,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.SURAT_KONTAK || 'mailto:admin@example.com'
  })));
  const data = teks(`${kepala}.${klaim}`);

  const kunci = await crypto.subtle.importKey(
    'jwk', jwkPrivat(env.VAPID_PRIVAT, env.VAPID_PUBLIK),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto mengeluarkan tanda tangan ES256 dalam bentuk r||s mentah —
  // persis yang diminta JWT, jadi tidak perlu diubah dari DER.
  const tandaTangan = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, kunci, data);

  return `${kepala}.${klaim}.${b64url(new Uint8Array(tandaTangan))}`;
}

function jwkPrivat(privatB64, publikB64) {
  const pub = dariB64url(publikB64);   // 65 bita: 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 4) {
    throw new Error('VAPID_PUBLIK harus 65 bita tak-terkompresi (base64url).');
  }
  return {
    kty: 'EC', crv: 'P-256', ext: true, key_ops: ['sign'],
    d: keB64url(privatB64),
    x: b64url(pub.slice(1, 33)),
    y: b64url(pub.slice(33, 65))
  };
}

// ------------------------------------------------------ enkripsi aes128gcm --

/**
 * RFC 8291, skema aes128gcm:
 *   ecdh  = ECDH(kunci sekali pakai kita, kunci publik perangkat)
 *   IKM   = HKDF(garam = auth, bahan = ecdh, info = "WebPush: info"|0|ua|as, 32)
 *   CEK   = HKDF(garam = acak16, bahan = IKM, info = "...aes128gcm"|0, 16)
 *   nonce = HKDF(garam = acak16, bahan = IKM, info = "...nonce"|0, 12)
 */
async function enkripsi(muatan, kunciLangganan) {
  const kunciPerangkat = dariB64url(kunciLangganan.p256dh);
  const rahasiaAuth = dariB64url(kunciLangganan.auth);

  const pasangan = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publikKita = new Uint8Array(await crypto.subtle.exportKey('raw', pasangan.publicKey));

  const publikPerangkat = await crypto.subtle.importKey(
    'raw', kunciPerangkat, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publikPerangkat }, pasangan.privateKey, 256));

  const infoKunci = gabung(teks('WebPush: info'), new Uint8Array([0]),
                           kunciPerangkat, publikKita);
  const ikm = await hkdf(rahasiaAuth, ecdh, infoKunci, 32);

  const garam = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(garam, ikm, teks('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(garam, ikm, teks('Content-Encoding: nonce\0'), 12);

  const kunciAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 menandai rekaman terakhir, dan ikut terenkripsi.
  const terenkripsi = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, kunciAes, gabung(muatan, new Uint8Array([2]))));

  // Kepala rekaman: garam(16) | ukuranRekaman(4) | panjangKunci(1) | kunci(65)
  const kepala = new Uint8Array(21 + publikKita.length);
  kepala.set(garam, 0);
  new DataView(kepala.buffer).setUint32(16, 4096);
  kepala[20] = publikKita.length;
  kepala.set(publikKita, 21);

  return gabung(kepala, terenkripsi);
}

/** HKDF ekstrak + kembangkan sekali jalan. */
async function hkdf(garam, bahan, info, panjang) {
  const kunci = await crypto.subtle.importKey('raw', bahan, 'HKDF', false, ['deriveBits']);
  const bit = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: garam, info }, kunci, panjang * 8);
  return new Uint8Array(bit);
}

// ------------------------------------------------------------------ bantu --

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

function jawab(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: cors() });
}

function teks(s) { return new TextEncoder().encode(s); }

function gabung(...potongan) {
  const total = potongan.reduce((a, p) => a + p.length, 0);
  const hasil = new Uint8Array(total);
  let i = 0;
  for (const p of potongan) { hasil.set(p, i); i += p.length; }
  return hasil;
}

function keB64url(s) {
  return String(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64url(bita) {
  let s = '';
  for (const b of bita) s += String.fromCharCode(b);
  return keB64url(btoa(s));
}

function dariB64url(teksB64) {
  const rapi = String(teksB64).replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(rapi.padEnd(Math.ceil(rapi.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// Diekspor supaya bisa diuji dari halaman uji (tools/uji_push.html).
export { enkripsi, buatVapidJwt, hkdf, b64url, dariB64url };
