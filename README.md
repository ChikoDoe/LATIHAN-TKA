# TKA Latihan Matematika SMP v2

Web latihan soal TKA Matematika SMP dengan sistem nama pengguna, riwayat sesi, dan leaderboard.

## Fitur
- Login pakai nama (no password)
- Dashboard: riwayat sesi, rata-rata nilai, papan skor
- 30 soal per sesi, di-generate AI (Claude Haiku) secara paralel
- Distribusi: Bilangan (8), Aljabar (8), Geometri (8), Data & Peluang (6)
- Level 1–3 (Pengetahuan, Aplikasi, Penalaran)
- Kunci jawaban + pembahasan tiap soal
- Hasil per elemen di akhir sesi
- Data disimpan di SQLite (file `data.db`)
- Dark mode otomatis
- Responsive (mobile-friendly)

## Cara Install

```bash
# 1. Masuk ke folder
cd tka-latihan

# 2. Install dependencies
npm install

# 3. Isi API key
cp .env .env.backup
nano .env
# Isi: ANTHROPIC_API_KEY=sk-ant-xxxx

# 4. Jalankan
npm start
```

Akses: `http://localhost:3000`

---

## Deploy dengan PM2

```bash
npm install -g pm2
pm2 start server.js --name tka-latihan
pm2 startup && pm2 save
```

## Deploy dengan systemd

Buat `/etc/systemd/system/tka-latihan.service`:

```ini
[Unit]
Description=TKA Latihan Matematika SMP
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/tka-latihan
ExecStart=/usr/bin/node server.js
Restart=on-failure
EnvironmentFile=/path/to/tka-latihan/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable tka-latihan
sudo systemctl start tka-latihan
```

## Database

File `data.db` otomatis dibuat saat pertama kali dijalankan.
Tabel: `users`, `sessions`, `session_answers`.

Backup:
```bash
cp data.db data.db.backup
```

## Tech Stack
- Node.js + Express
- better-sqlite3 (SQLite)
- HTML/CSS/JS vanilla (no build step)
- Anthropic Claude Haiku (cepat & hemat)
- Google Fonts: DM Serif Display + DM Sans
