# 📐 Latihan TKA Matematika SMP

> Web latihan soal **TKA Matematika SMP/MTs** berbasis AI — soal di-generate otomatis per sesi, dengan sistem akun nama, riwayat sesi, dan leaderboard.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=flat&logo=sqlite&logoColor=white)
![Claude](https://img.shields.io/badge/Powered%20by-Claude%20Haiku-D97706?style=flat)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat)

---

## ✨ Fitur

- **Login pakai nama** — tanpa password, langsung masuk
- **30 soal per sesi** — di-generate AI secara paralel saat sesi dimulai
- **Distribusi soal otomatis**:
  - Bilangan → 8 soal
  - Aljabar → 8 soal
  - Geometri & Pengukuran → 8 soal
  - Data & Peluang → 6 soal
- **Level 1–3** (Pengetahuan & Pemahaman / Aplikasi / Penalaran)
- **Kunci jawaban + pembahasan** langkah demi langkah
- **Hasil per elemen** di akhir sesi
- **Riwayat sesi** tersimpan per user
- **Leaderboard** semua pengguna
- **Dark mode** otomatis (ikut preferensi sistem)
- **Responsive** — bisa dibuka di HP maupun laptop
- **API key aman** di backend, tidak terekspos ke frontend

---

## 🖥️ Preview

| Login | Dashboard | Quiz | Hasil |
|-------|-----------|------|-------|
| Input nama, quick-login | Statistik & riwayat sesi | Navigasi soal, pembahasan | Skor, breakdown per elemen |

---

## 🚀 Cara Install

### Otomatis (Linux/macOS)

```bash
git clone https://github.com/ChikoDoe/LATIHAN-TKA.git
cd LATIHAN-TKA
chmod +x install.sh
./install.sh
```

Installer akan memandu pengisian API key dan langsung menjalankan server.

### Manual

```bash
# 1. Clone repo
git clone https://github.com/ChikoDoe/LATIHAN-TKA.git
cd LATIHAN-TKA

# 2. Install dependencies
npm install

# 3. Buat file .env
cp .env.example .env
nano .env  # isi ANTHROPIC_API_KEY

# 4. Jalankan
npm start
```

Akses di: **http://localhost:3000**

---

## ⚙️ Konfigurasi

Buat file `.env` berdasarkan `.env.example`:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
PORT=3000
```

| Variabel | Keterangan | Default |
|----------|-----------|---------|
| `ANTHROPIC_API_KEY` | API key dari [console.anthropic.com](https://console.anthropic.com) | *(wajib)* |
| `PORT` | Port server | `3000` |

---

## 📁 Struktur Proyek

```
LATIHAN-TKA/
├── server.js          # Backend Express + SQLite + Anthropic API
├── package.json
├── .env.example       # Template konfigurasi
├── .gitignore
├── install.sh         # Installer otomatis (Linux/macOS)
├── README.md
└── public/
    └── index.html     # Frontend (HTML/CSS/JS vanilla, single file)
```

---

## 🗄️ Database

SQLite otomatis dibuat sebagai `data.db` saat pertama kali dijalankan.

**Tabel:**
- `users` — daftar pengguna (id, name, created_at)
- `sessions` — riwayat sesi (user_id, skor, waktu, stats per elemen)
- `session_answers` — jawaban per soal per sesi

**Backup:**
```bash
cp data.db data.db.backup
```

---

## 🔧 Deploy Permanen

### Dengan PM2

```bash
npm install -g pm2
pm2 start server.js --name latihan-tka
pm2 startup && pm2 save
```

**Perintah PM2 berguna:**
```bash
pm2 status                    # cek status
pm2 logs latihan-tka          # lihat log
pm2 restart latihan-tka       # restart
pm2 stop latihan-tka          # stop
```

### Dengan systemd

Buat file `/etc/systemd/system/latihan-tka.service`:

```ini
[Unit]
Description=Latihan TKA Matematika SMP
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/LATIHAN-TKA
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/path/to/LATIHAN-TKA/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable latihan-tka
sudo systemctl start latihan-tka
sudo systemctl status latihan-tka
```

---

## 🌐 Akses dari Jaringan Lokal

Secara default server hanya bisa diakses dari `localhost`. Untuk akses dari device lain di jaringan yang sama, ubah di `server.js`:

```js
// Dari:
app.listen(PORT, () => ...)

// Jadi:
app.listen(PORT, '0.0.0.0', () => ...)
```

Lalu akses dari HP/laptop lain dengan `http://IP_SERVER:3000`.

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | SQLite (better-sqlite3) |
| Frontend | HTML/CSS/JS Vanilla |
| Font | DM Serif Display + DM Sans |
| AI | Anthropic Claude Haiku |

---

## 📋 Requirements

- Node.js **18 atau lebih baru**
- npm
- API key Anthropic (daftar di [console.anthropic.com](https://console.anthropic.com))

---

## 📄 Lisensi

MIT © [ChikoDoe](https://github.com/ChikoDoe)
