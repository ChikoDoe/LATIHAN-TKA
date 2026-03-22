#!/bin/bash

# ╔══════════════════════════════════════════════╗
# ║   Latihan TKA Matematika SMP — Installer    ║
# ╚══════════════════════════════════════════════╝

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

print_banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║   📐 Latihan TKA Matematika SMP v2.0    ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${RESET}"
}

ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
info() { echo -e "  ${CYAN}→${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $1"; }
err()  { echo -e "  ${RED}✗${RESET}  $1"; }
step() { echo -e "\n${BOLD}$1${RESET}"; }

print_banner

# ── Cek Node.js ──────────────────────────────────
step "1. Mengecek Node.js..."
if ! command -v node &>/dev/null; then
  err "Node.js tidak ditemukan."
  echo ""
  echo "  Install Node.js terlebih dahulu:"
  echo "  Ubuntu/Debian : sudo apt install nodejs npm"
  echo "  Arch          : sudo pacman -S nodejs npm"
  echo "  Manual        : https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  err "Node.js versi $NODE_VER terdeteksi. Butuh versi 18 atau lebih baru."
  echo "  Update Node.js: https://nodejs.org"
  exit 1
fi

ok "Node.js $(node -v) terdeteksi"

# ── Cek npm ──────────────────────────────────────
if ! command -v npm &>/dev/null; then
  err "npm tidak ditemukan."
  exit 1
fi
ok "npm $(npm -v) terdeteksi"

# ── Install dependencies ──────────────────────────
step "2. Menginstall dependencies..."
if npm install --silent; then
  ok "Dependencies berhasil diinstall"
else
  err "Gagal install dependencies"
  exit 1
fi

# ── Setup .env ────────────────────────────────────
step "3. Konfigurasi .env..."

if [ -f ".env" ]; then
  EXISTING_KEY=$(grep "ANTHROPIC_API_KEY" .env | cut -d= -f2 | tr -d '[:space:]')
  if [[ "$EXISTING_KEY" != "sk-ant-"* ]] || [[ ${#EXISTING_KEY} -lt 30 ]]; then
    warn "File .env sudah ada tapi API key belum diisi."
    SETUP_ENV=true
  else
    ok "File .env sudah ada dengan API key yang valid"
    SETUP_ENV=false
  fi
else
  info "File .env belum ada, akan dibuat sekarang."
  SETUP_ENV=true
fi

if [ "$SETUP_ENV" = true ]; then
  echo ""
  echo -e "  ${BOLD}Masukkan Anthropic API key kamu.${RESET}"
  echo -e "  Dapatkan di: ${CYAN}https://console.anthropic.com${RESET}"
  echo ""
  read -rp "  API Key (sk-ant-...): " API_KEY

  if [[ "$API_KEY" != "sk-ant-"* ]] || [[ ${#API_KEY} -lt 30 ]]; then
    warn "API key yang dimasukkan tidak valid (harus diawali 'sk-ant-')."
    warn "Lanjut tanpa API key — edit file .env secara manual sebelum menjalankan server."
    API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx"
  fi

  read -rp "  Port server [3000]: " PORT_INPUT
  PORT=${PORT_INPUT:-3000}

  cat > .env << EOF
ANTHROPIC_API_KEY=${API_KEY}
PORT=${PORT}
EOF
  ok "File .env berhasil dibuat (PORT=${PORT})"
fi

# ── Baca port dari .env ───────────────────────────
PORT=$(grep "^PORT=" .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
PORT=${PORT:-3000}

# ── Tawarkan PM2 ──────────────────────────────────
step "4. Mode jalankan..."
echo ""
echo "  [1] Jalankan sekarang (foreground, cocok untuk testing)"
echo "  [2] Jalankan dengan PM2 (background, cocok untuk server)"
echo "  [3] Hanya setup, jalankan manual nanti"
echo ""
read -rp "  Pilih [1/2/3]: " RUN_MODE
RUN_MODE=${RUN_MODE:-1}

case $RUN_MODE in
  2)
    if ! command -v pm2 &>/dev/null; then
      info "PM2 belum terinstall. Menginstall PM2..."
      npm install -g pm2 --silent
      ok "PM2 berhasil diinstall"
    fi

    # Stop instance lama kalau ada
    pm2 stop latihan-tka 2>/dev/null || true
    pm2 delete latihan-tka 2>/dev/null || true

    pm2 start server.js --name latihan-tka
    pm2 save

    echo ""
    echo -e "${GREEN}${BOLD}  ✓ Server berjalan di background dengan PM2${RESET}"
    echo -e "  Akses: ${CYAN}http://localhost:${PORT}${RESET}"
    echo ""
    echo "  Perintah PM2:"
    echo "    pm2 status              → cek status"
    echo "    pm2 logs latihan-tka    → lihat log"
    echo "    pm2 restart latihan-tka → restart"
    echo "    pm2 stop latihan-tka    → stop"
    echo ""

    # Tawarkan auto-start saat reboot
    read -rp "  Aktifkan auto-start saat reboot? [y/N]: " AUTOSTART
    if [[ "$AUTOSTART" =~ ^[Yy]$ ]]; then
      pm2 startup 2>/dev/null || true
      pm2 save
      ok "Auto-start saat reboot diaktifkan"
    fi
    ;;

  3)
    echo ""
    ok "Setup selesai!"
    echo ""
    echo "  Jalankan server dengan:"
    echo -e "    ${CYAN}npm start${RESET}          → production"
    echo -e "    ${CYAN}npm run dev${RESET}        → development (auto-restart)"
    echo ""
    exit 0
    ;;

  *)
    echo ""
    info "Menjalankan server..."
    echo ""
    echo -e "${GREEN}${BOLD}  ✓ Server berjalan!${RESET}"
    echo -e "  Akses: ${CYAN}http://localhost:${PORT}${RESET}"
    echo ""
    echo "  Tekan Ctrl+C untuk menghentikan."
    echo ""
    npm start
    ;;
esac
