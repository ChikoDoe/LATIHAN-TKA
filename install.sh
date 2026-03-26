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
DIM='\033[2m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
info() { echo -e "  ${CYAN}→${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $1"; }
err()  { echo -e "  ${RED}✗${RESET}  $1"; }
step() { echo -e "\n${BOLD}$1${RESET}"; }
dim()  { echo -e "  ${DIM}$1${RESET}"; }

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   📐 Latihan TKA Matematika SMP v2.0    ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

# ── 1. Cek Node.js ───────────────────────────────
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
  err "Node.js v$NODE_VER terdeteksi. Butuh v18+."
  echo "  Update: https://nodejs.org"
  exit 1
fi
ok "Node.js $(node -v) · npm $(npm -v)"

# ── 2. Install dependencies ──────────────────────
step "2. Menginstall dependencies..."
if npm install --silent; then
  ok "Dependencies berhasil diinstall"
else
  err "Gagal install dependencies"
  exit 1
fi

# ── 3. Konfigurasi .env ──────────────────────────
step "3. Konfigurasi .env..."

SETUP_ENV=false

if [ -f ".env" ]; then
  EXISTING_PROVIDER=$(grep "^API_PROVIDER=" .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
  EXISTING_ANTH=$(grep "^ANTHROPIC_API_KEY=" .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
  EXISTING_OAI=$(grep "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')

  if [ "$EXISTING_PROVIDER" = "anthropic" ] && [[ "$EXISTING_ANTH" != *"xxx"* ]] && [ ${#EXISTING_ANTH} -gt 20 ]; then
    ok "File .env sudah ada — Anthropic API key valid"
    SETUP_ENV=false
  elif [ "$EXISTING_PROVIDER" = "openai" ] && [[ "$EXISTING_OAI" != *"xxx"* ]] && [ ${#EXISTING_OAI} -gt 20 ]; then
    ok "File .env sudah ada — OpenAI API key valid"
    SETUP_ENV=false
  else
    warn "File .env ada tapi API key belum diisi atau tidak valid."
    SETUP_ENV=true
  fi
else
  info "File .env belum ada, akan dibuat sekarang."
  SETUP_ENV=true
fi

if [ "$SETUP_ENV" = true ]; then

  # ── Pilih provider ──
  echo ""
  echo -e "  ${BOLD}Pilih provider AI:${RESET}"
  echo ""
  echo "  [1] Anthropic — Claude Haiku"
  dim "      ~\$0.001/soal · console.anthropic.com"
  echo "  [2] OpenAI    — GPT-4o mini"
  dim "      ~\$0.001/soal · platform.openai.com"
  echo ""
  read -rp "  Pilih [1/2]: " PROVIDER_CHOICE
  PROVIDER_CHOICE=${PROVIDER_CHOICE:-1}

  API_PROVIDER=""
  API_KEY=""
  BASE_URL_VAL=""
  MODEL_VAL=""
  PORT_VAL="3000"

  if [ "$PROVIDER_CHOICE" = "2" ]; then
    API_PROVIDER="openai"

    echo ""
    echo -e "  ${BOLD}OpenAI API key${RESET}"
    dim "  Dapatkan di: platform.openai.com/api-keys"
    echo ""
    read -rp "  API Key (sk-...): " API_KEY
    [[ "$API_KEY" != sk-* ]] && { warn "Key tidak valid, lanjut dengan placeholder."; API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; }

    echo ""
    echo "  Model (kosongkan = gpt-4o-mini):"
    dim "  Pilihan: gpt-4o-mini, gpt-4o, gpt-3.5-turbo"
    read -rp "  Model: " MODEL_VAL
    MODEL_VAL=${MODEL_VAL:-gpt-4o-mini}

    echo ""
    echo "  Base URL (kosongkan = default OpenAI):"
    dim "  Contoh proxy/OpenRouter: https://openrouter.ai/api"
    read -rp "  Base URL: " BASE_URL_VAL
    BASE_URL_VAL=${BASE_URL_VAL:-https://api.openai.com}

  else
    API_PROVIDER="anthropic"

    echo ""
    echo -e "  ${BOLD}Anthropic API key${RESET}"
    dim "  Dapatkan di: console.anthropic.com/settings/keys"
    dim "  Top up: console.anthropic.com/settings/billing"
    echo ""
    read -rp "  API Key (sk-ant-...): " API_KEY
    [[ "$API_KEY" != sk-ant-* ]] && { warn "Key tidak valid, lanjut dengan placeholder."; API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx"; }

    echo ""
    echo "  Model (kosongkan = claude-haiku-4-5-20251001):"
    dim "  Pilihan: claude-haiku-4-5-20251001, claude-sonnet-4-6, dll"
    read -rp "  Model: " MODEL_VAL
    MODEL_VAL=${MODEL_VAL:-claude-haiku-4-5-20251001}

    echo ""
    echo "  Base URL (kosongkan = default Anthropic):"
    dim "  Ganti jika pakai proxy atau custom endpoint"
    dim "  Contoh: https://my-proxy.example.com"
    read -rp "  Base URL: " BASE_URL_VAL
    BASE_URL_VAL=${BASE_URL_VAL:-https://api.anthropic.com}
  fi

  read -rp "  Port server [3000]: " PORT_INPUT
  PORT_VAL=${PORT_INPUT:-3000}

  # Tulis .env
  if [ "$API_PROVIDER" = "openai" ]; then
    cat > .env << EOF
# Provider
API_PROVIDER=openai

# Anthropic (tidak aktif)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
# ANTHROPIC_BASE_URL=https://api.anthropic.com
# ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# OpenAI
OPENAI_API_KEY=${API_KEY}
OPENAI_BASE_URL=${BASE_URL_VAL}
OPENAI_MODEL=${MODEL_VAL}

# Server
PORT=${PORT_VAL}
EOF
  else
    cat > .env << EOF
# Provider
API_PROVIDER=anthropic

# Anthropic
ANTHROPIC_API_KEY=${API_KEY}
ANTHROPIC_BASE_URL=${BASE_URL_VAL}
ANTHROPIC_MODEL=${MODEL_VAL}

# OpenAI (tidak aktif)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# OPENAI_BASE_URL=https://api.openai.com
# OPENAI_MODEL=gpt-4o-mini

# Server
PORT=${PORT_VAL}
EOF
  fi

  ok "File .env berhasil dibuat (provider=${API_PROVIDER}, port=${PORT_VAL})"
fi

# Baca port dari .env
PORT_VAL=$(grep "^PORT=" .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
PORT_VAL=${PORT_VAL:-3000}

# ── 4. Mode jalankan ─────────────────────────────
step "4. Mode jalankan..."
echo ""
echo "  [1] Jalankan sekarang (foreground, untuk testing)"
echo "  [2] Jalankan dengan PM2 (background, untuk server)"
echo "  [3] Setup saja, jalankan manual nanti"
echo ""
read -rp "  Pilih [1/2/3]: " RUN_MODE
RUN_MODE=${RUN_MODE:-1}

case $RUN_MODE in
  2)
    if ! command -v pm2 &>/dev/null; then
      info "PM2 belum ada. Menginstall..."
      npm install -g pm2 --silent
      ok "PM2 terinstall"
    fi

    pm2 stop latihan-tka 2>/dev/null || true
    pm2 delete latihan-tka 2>/dev/null || true
    pm2 start server.js --name latihan-tka
    pm2 save

    echo ""
    echo -e "${GREEN}${BOLD}  ✓ Server berjalan di background (PM2)${RESET}"
    echo -e "  Akses: ${CYAN}http://localhost:${PORT_VAL}${RESET}"
    echo ""
    echo "  Perintah PM2:"
    echo "    pm2 status              → cek status"
    echo "    pm2 logs latihan-tka    → lihat log"
    echo "    pm2 restart latihan-tka → restart"
    echo "    pm2 stop latihan-tka    → stop"
    echo ""
    read -rp "  Aktifkan auto-start saat reboot? [y/N]: " AUTOSTART
    if [[ "$AUTOSTART" =~ ^[Yy]$ ]]; then
      pm2 startup 2>/dev/null || true
      pm2 save
      ok "Auto-start diaktifkan"
    fi
    ;;

  3)
    echo ""
    ok "Setup selesai!"
    echo ""
    echo "  Jalankan server:"
    echo -e "    ${CYAN}npm start${RESET}      → production"
    echo -e "    ${CYAN}npm run dev${RESET}    → development (auto-restart)"
    echo ""
    exit 0
    ;;

  *)
    echo ""
    info "Menjalankan server..."
    echo ""
    echo -e "${GREEN}${BOLD}  ✓ Server berjalan!${RESET}"
    echo -e "  Akses: ${CYAN}http://localhost:${PORT_VAL}${RESET}"
    echo ""
    echo "  Tekan Ctrl+C untuk stop."
    echo ""
    npm start
    ;;
esac
