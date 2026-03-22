require("dotenv").config();
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ── Database setup ──────────────────────────────────────────────
const db = new Database("data.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    started_at TEXT DEFAULT (datetime('now','localtime')),
    ended_at   TEXT,
    total      INTEGER DEFAULT 0,
    correct    INTEGER DEFAULT 0,
    elemen_stats TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS session_answers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    q_index    INTEGER NOT NULL,
    elemen     TEXT,
    level      INTEGER,
    soal       TEXT,
    opsi       TEXT,
    jawaban    INTEGER,
    pembahasan TEXT,
    selected   INTEGER,
    correct    INTEGER DEFAULT 0
  );
`);

// ── Anthropic system prompt ─────────────────────────────────────
const SYSTEM_PROMPT = `Kamu adalah pembuat soal TKA Matematika SMP/MTs Indonesia yang ahli.
Buat soal pilihan ganda (A, B, C, D) sesuai kisi-kisi TKA berikut:

Elemen:
- Bilangan: bilangan bulat, rasional, irasional, berpangkat, akar, notasi ilmiah, rasio, skala, proporsi, perbandingan senilai & berbalik nilai, faktorisasi prima
- Aljabar: persamaan/pertidaksamaan linear satu variabel, sistem persamaan linear dua variabel, bentuk aljabar, relasi dan fungsi, barisan dan deret berhingga
- Geometri dan Pengukuran: hubungan antar sudut, teorema Pythagoras, kekongruenan & kesebangunan, jaring-jaring bangun ruang, transformasi tunggal (refleksi/translasi/rotasi/dilatasi), keliling & luas bangun datar, volume bangun ruang
- Data dan Peluang: penyajian & interpretasi data, mean/median/modus/range, peluang kejadian tunggal, frekuensi relatif

Level:
- Level 1 = Pengetahuan dan Pemahaman
- Level 2 = Aplikasi
- Level 3 = Penalaran

Respons HANYA JSON valid, tanpa markdown, tanpa backtick, tanpa komentar apapun.
Format:
{"elemen":"...","level":1,"levelLabel":"Pengetahuan dan Pemahaman","soal":"...","opsi":["A. ...","B. ...","C. ...","D. ..."],"jawaban":0,"pembahasan":"..."}
- jawaban: index 0-3 dari opsi benar
- Gunakan unicode: ², ³, √, ×, ÷, ≤, ≥, π, °
- Soal harus beragam, kontekstual, tidak mengulang topik yang sama dalam satu sesi
- Pembahasan harus menunjukkan langkah-langkah jelas`;

// ── User routes ─────────────────────────────────────────────────
app.post("/api/user/login", (req, res) => {
  const { name } = req.body;
  if (!name || name.trim().length < 2)
    return res.status(400).json({ error: "Nama minimal 2 karakter." });

  const trimmed = name.trim();
  let user = db.prepare("SELECT * FROM users WHERE name = ?").get(trimmed);
  if (!user) {
    const result = db.prepare("INSERT INTO users (name) VALUES (?)").run(trimmed);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  }

  const history = db
    .prepare(`SELECT s.id, s.started_at, s.ended_at, s.total, s.correct, s.elemen_stats
              FROM sessions s WHERE s.user_id = ? ORDER BY s.started_at DESC LIMIT 10`)
    .all(user.id)
    .map(s => ({ ...s, elemen_stats: JSON.parse(s.elemen_stats || "{}") }));

  res.json({ user, history });
});

app.get("/api/user/:id/history", (req, res) => {
  const sessions = db
    .prepare(`SELECT id, started_at, ended_at, total, correct, elemen_stats
              FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20`)
    .all(req.params.id)
    .map(s => ({ ...s, elemen_stats: JSON.parse(s.elemen_stats || "{}") }));
  res.json({ sessions });
});

// ── Session routes ───────────────────────────────────────────────
app.post("/api/session/start", (req, res) => {
  const { user_id } = req.body;
  const result = db.prepare("INSERT INTO sessions (user_id) VALUES (?)").run(user_id);
  res.json({ session_id: result.lastInsertRowid });
});

app.post("/api/session/answer", (req, res) => {
  const { session_id, q_index, question, selected, correct } = req.body;
  const q = question;
  db.prepare(`INSERT INTO session_answers
    (session_id, q_index, elemen, level, soal, opsi, jawaban, pembahasan, selected, correct)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(session_id, q_index, q.elemen, q.level, q.soal,
      JSON.stringify(q.opsi), q.jawaban, q.pembahasan, selected, correct ? 1 : 0);
  res.json({ ok: true });
});

app.post("/api/session/finish", (req, res) => {
  const { session_id, total, correct, elemen_stats } = req.body;
  db.prepare(`UPDATE sessions SET ended_at=datetime('now','localtime'), total=?, correct=?, elemen_stats=? WHERE id=?`)
    .run(total, correct, JSON.stringify(elemen_stats), session_id);
  res.json({ ok: true });
});

app.get("/api/session/:id/answers", (req, res) => {
  const answers = db
    .prepare("SELECT * FROM session_answers WHERE session_id = ? ORDER BY q_index ASC")
    .all(req.params.id)
    .map(a => ({ ...a, opsi: JSON.parse(a.opsi) }));
  res.json({ answers });
});

// ── Generate question ────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  const { elemen, level, index, sessionId } = req.body;
  const levelLabel =
    level === 1 ? "Pengetahuan dan Pemahaman" :
    level === 2 ? "Aplikasi" : "Penalaran";

  const prompt = `Buat soal TKA Matematika SMP elemen "${elemen}", level ${level} (${levelLabel}). Soal ke-${index} dari 30 sesi ini (sesi: ${sessionId}). Buat unik dan berbeda. Respons JSON langsung.`;

  const MAX_RETRY = 4;
  let lastErr = null;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      // Rate limited — tunggu lalu retry
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const wait = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 3000;
        console.warn(`[429] Rate limited soal ${index}, tunggu ${wait}ms (attempt ${attempt+1})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: "API error", detail: errText });
      }

      const data = await response.json();
      const raw = data.content.map(b => b.text || "").join("");
      const clean = raw.replace(/```json|```/g, "").trim();
      const question = JSON.parse(clean);
      return res.json({ question });

    } catch (err) {
      lastErr = err;
      console.error(`Generate error attempt ${attempt+1}:`, err.message);
      if (attempt < MAX_RETRY - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }

  res.status(500).json({ error: lastErr?.message || "Max retry exceeded" });
});

// ── Leaderboard ──────────────────────────────────────────────────
app.get("/api/leaderboard", (req, res) => {
  const rows = db.prepare(`
    SELECT u.name,
      COUNT(s.id) as sesi,
      ROUND(AVG(CASE WHEN s.total > 0 THEN s.correct * 100.0 / s.total ELSE 0 END), 1) as avg_score,
      MAX(CASE WHEN s.total > 0 THEN s.correct * 100.0 / s.total ELSE 0 END) as best_score
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id AND s.ended_at IS NOT NULL
    GROUP BY u.id
    ORDER BY avg_score DESC
    LIMIT 20
  `).all();
  res.json({ rows });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TKA Latihan v2 → http://localhost:${PORT}`));
