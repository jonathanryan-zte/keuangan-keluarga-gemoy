#!/bin/bash
#
# Kirim apps-script/ ke proyek Apps Script milik Sheet, lalu arahkan deployment
# yang sudah ada ke versi baru.
#
# Memakai `redeploy`, bukan `deploy`. `deploy` membuat deployment baru dengan
# URL /exec baru — dan URL itulah yang tersimpan di HP setiap anggota keluarga.
# `redeploy` menaikkan versi deployment yang sama, jadi URL-nya tidak berubah.
#
# ID deployment tidak ditulis di sini. Ia bagian dari URL /exec, dan repo ini
# publik. Taruh di berkas .clasp-deployment (sudah ter-gitignore) atau di
# peubah lingkungan CLASP_DEPLOYMENT_ID.
#
# Pakai:  tools/deploy.sh ["keterangan versi"]

set -euo pipefail
cd "$(dirname "$0")/.."

# Node dipasang ke folder rumah, bukan lewat Homebrew, jadi belum tentu ada
# di PATH milik shell yang memanggil skrip ini.
[ -d "$HOME/.local/node/bin" ] && PATH="$HOME/.local/node/bin:$PATH"

command -v clasp >/dev/null || {
  echo "clasp tidak ditemukan. Pasang dengan: npm install -g @google/clasp" >&2
  exit 1
}

DEPLOY_ID="${CLASP_DEPLOYMENT_ID:-}"
if [ -z "$DEPLOY_ID" ] && [ -f .clasp-deployment ]; then
  DEPLOY_ID="$(tr -d '[:space:]' < .clasp-deployment)"
fi
if [ -z "$DEPLOY_ID" ]; then
  cat >&2 <<'PESAN'
ID deployment belum diketahui.

Ambil dari URL Web App Anda — bagian antara /macros/s/ dan /exec — lalu:

    echo "AKfyc..." > .clasp-deployment

Kalau lupa yang mana, `clasp list-deployments` menampilkan semuanya; pilih yang
BUKAN @HEAD dan yang nomor versinya paling tinggi.
PESAN
  exit 1
fi

KETERANGAN="${1:-deploy $(date +%F)}"

echo "==> Mengirim berkas ke Apps Script"
clasp push --force

echo "==> Membuat versi baru"
KELUARAN="$(clasp create-version "$KETERANGAN")"
echo "$KELUARAN"
VERSI="$(printf '%s' "$KELUARAN" | grep -o '[0-9][0-9]*$' | tail -1)"
[ -n "$VERSI" ] || { echo "Gagal membaca nomor versi dari keluaran clasp." >&2; exit 1; }

echo "==> Mengarahkan deployment ke versi $VERSI"
clasp redeploy "$DEPLOY_ID" -V "$VERSI" -d "$KETERANGAN"

echo "==> Memeriksa hasilnya"
JAWAB="$(curl -fsSL "https://script.google.com/macros/s/$DEPLOY_ID/exec")" || {
  echo "Deployment tidak menjawab. Periksa Manage deployments di editor Apps Script." >&2
  exit 1
}
echo "$JAWAB"
case "$JAWAB" in
  *'"ok":true'*) echo "Selesai. Versi $VERSI sudah melayani URL /exec yang sama." ;;
  *) echo "Jawabannya tidak seperti yang diharapkan — periksa sendiri." >&2; exit 1 ;;
esac
