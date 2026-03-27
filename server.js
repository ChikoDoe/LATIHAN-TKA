require("dotenv").config();
const express = require("express");
const bcrypt  = require("bcrypt");
const Database = require("better-sqlite3");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ── Config ──────────────────────────────────────────────────────
const API_PROVIDER       = (process.env.API_PROVIDER || "anthropic").toLowerCase();
const ANTHROPIC_KEY      = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const ANTHROPIC_MODEL    = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const OPENAI_KEY         = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL    = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
const OPENAI_MODEL       = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SALT_ROUNDS        = 10;
const SESSION_DURATION   = 80 * 60; // 90 menit dalam detik

if (API_PROVIDER === "anthropic" && !ANTHROPIC_KEY) { console.error("[CONFIG] ERROR: ANTHROPIC_API_KEY tidak diset"); process.exit(1); }
if (API_PROVIDER === "openai"    && !OPENAI_KEY)    { console.error("[CONFIG] ERROR: OPENAI_API_KEY tidak diset");    process.exit(1); }

const MODEL_LABEL = API_PROVIDER === "openai"
  ? `OpenAI / ${OPENAI_MODEL} @ ${OPENAI_BASE_URL}`
  : `Anthropic / ${ANTHROPIC_MODEL} @ ${ANTHROPIC_BASE_URL}`;

console.log("=".repeat(55));
console.log(`[CONFIG] Provider : ${API_PROVIDER.toUpperCase()}`);
console.log(`[CONFIG] Model    : ${MODEL_LABEL}`);
console.log(`[CONFIG] Port     : ${process.env.PORT || 3000}`);
console.log("=".repeat(55));

// ── Database ────────────────────────────────────────────────────
const db = new Database("data.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password   TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    started_at   TEXT DEFAULT (datetime('now','localtime')),
    ended_at     TEXT,
    expires_at   TEXT,
    total        INTEGER DEFAULT 0,
    correct      INTEGER DEFAULT 0,
    time_used    INTEGER DEFAULT 0,
    elemen_stats TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS session_answers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    q_index    INTEGER NOT NULL,
    elemen     TEXT,
    level      INTEGER,
    level_label TEXT,
    soal       TEXT,
    opsi       TEXT,
    jawaban    INTEGER,
    pembahasan TEXT,
    selected   INTEGER,
    correct    INTEGER DEFAULT 0,
    answered_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ── System Prompt ───────────────────────────────────────────────
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
Format persis:
{"elemen":"...","level":1,"levelLabel":"Pengetahuan dan Pemahaman","soal":"...","opsi":["A. ...","B. ...","C. ...","D. ..."],"jawaban":0,"pembahasan":"..."}
- jawaban: index 0-3 dari opsi benar
- Gunakan unicode: ², ³, √, ×, ÷, ≤, ≥, π, °
- Soal harus beragam, kontekstual, tidak mengulang topik yang sama dalam satu sesi
- Pembahasan harus menunjukkan langkah-langkah jelas`;

// ── Auth routes ─────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || username.trim().length < 3)
    return res.status(400).json({ error: "Username minimal 3 karakter." });
  if (!password || password.length < 6)
    return res.status(400).json({ error: "Password minimal 6 karakter." });

  const trimmed = username.trim();
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(trimmed);
  if (exists) return res.status(409).json({ error: "Username sudah dipakai." });

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = db.prepare("INSERT INTO users (username, password) VALUES (?,?)").run(trimmed, hash);
    const user = db.prepare("SELECT id, username, created_at FROM users WHERE id = ?").get(result.lastInsertRowid);
    console.log(`[AUTH] Register: ${trimmed}`);
    res.json({ user });
  } catch (e) {
    console.error("[AUTH] Register error:", e.message);
    res.status(500).json({ error: "Gagal mendaftar." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username dan password wajib diisi." });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim());
  if (!user) return res.status(401).json({ error: "Username atau password salah." });

  try {
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Username atau password salah." });

    const history = db.prepare(`
      SELECT id, started_at, ended_at, total, correct, time_used, elemen_stats
      FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 10
    `).all(user.id).map(s => ({ ...s, elemen_stats: JSON.parse(s.elemen_stats || "{}") }));

    console.log(`[AUTH] Login: ${user.username}`);
    res.json({ user: { id: user.id, username: user.username, created_at: user.created_at }, history });
  } catch (e) {
    console.error("[AUTH] Login error:", e.message);
    res.status(500).json({ error: "Gagal login." });
  }
});

// ── User routes ─────────────────────────────────────────────────
app.get("/api/user/:id/history", (req, res) => {
  const sessions = db.prepare(`
    SELECT id, started_at, ended_at, total, correct, time_used, elemen_stats
    FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20
  `).all(req.params.id).map(s => ({ ...s, elemen_stats: JSON.parse(s.elemen_stats || "{}") }));
  res.json({ sessions });
});

// ── Session routes ───────────────────────────────────────────────
app.post("/api/session/start", (req, res) => {
  const { user_id } = req.body;
  const now     = new Date();
  const expires = new Date(now.getTime() + SESSION_DURATION * 1000);
  const result  = db.prepare(`
    INSERT INTO sessions (user_id, expires_at) VALUES (?, ?)
  `).run(user_id, expires.toISOString());
  console.log(`[SESSION] Start: user=${user_id} session=${result.lastInsertRowid} expires=${expires.toISOString()}`);
  res.json({ session_id: result.lastInsertRowid, expires_at: expires.toISOString(), duration: SESSION_DURATION });
});

app.post("/api/session/answer", (req, res) => {
  const { session_id, q_index, question, selected, correct } = req.body;
  const q = question;
  db.prepare(`
    INSERT INTO session_answers
    (session_id, q_index, elemen, level, level_label, soal, opsi, jawaban, pembahasan, selected, correct)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(session_id, q_index, q.elemen, q.level, q.levelLabel, q.soal,
     JSON.stringify(q.opsi), q.jawaban, q.pembahasan, selected, correct ? 1 : 0);
  res.json({ ok: true });
});

app.post("/api/session/finish", (req, res) => {
  const { session_id, total, correct, elemen_stats, time_used } = req.body;
  db.prepare(`
    UPDATE sessions
    SET ended_at=datetime('now','localtime'), total=?, correct=?, elemen_stats=?, time_used=?
    WHERE id=?
  `).run(total, correct, JSON.stringify(elemen_stats), time_used || 0, session_id);
  console.log(`[SESSION] Finish: session=${session_id} score=${correct}/${total} time=${time_used}s`);
  res.json({ ok: true });
});

app.get("/api/session/:id/answers", (req, res) => {
  const answers = db.prepare(`
    SELECT * FROM session_answers WHERE session_id = ? ORDER BY q_index ASC
  `).all(req.params.id).map(a => ({ ...a, opsi: JSON.parse(a.opsi) }));
  res.json({ answers });
});

// ── Generate question ────────────────────────────────────────────
async function callAnthropic(prompt) {
  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (response.status === 429) {
    const ra = response.headers.get("retry-after");
    return { rateLimited: true, wait: ra ? parseInt(ra) * 1000 : null };
  }
  if (response.status >= 500) {
    const body = await response.text();
    throw Object.assign(new Error(`Anthropic ${response.status}`), { status: response.status, body });
  }
  if (!response.ok) {
    const body = await response.text();
    throw Object.assign(new Error(`Anthropic ${response.status}`), { status: response.status, body, fatal: true });
  }
  const data = await response.json();
  console.log(`[ANTHROPIC] stop_reason=${data.stop_reason} in=${data.usage?.input_tokens} out=${data.usage?.output_tokens}`);
  const blocks = (data.content || []).filter(b => b.type === "text");
  if (!blocks.length) throw new Error("Anthropic: response kosong");
  return { text: blocks.map(b => b.text).join("").trim() };
}

async function callOpenAI(prompt) {
  const response = await fetch(`${OPENAI_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: prompt },
      ],
    }),
  });
  if (response.status === 429) {
    const ra = response.headers.get("retry-after");
    return { rateLimited: true, wait: ra ? parseInt(ra) * 1000 : null };
  }
  if (response.status >= 500) {
    const body = await response.text();
    throw Object.assign(new Error(`OpenAI ${response.status}`), { status: response.status, body });
  }
  if (!response.ok) {
    const body = await response.text();
    throw Object.assign(new Error(`OpenAI ${response.status}`), { status: response.status, body, fatal: true });
  }
  const data = await response.json();
  console.log(`[OPENAI] finish=${data.choices?.[0]?.finish_reason} prompt=${data.usage?.prompt_tokens} compl=${data.usage?.completion_tokens}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI: response kosong");
  return { text: text.trim() };
}

function callLLM(prompt) {
  return API_PROVIDER === "openai" ? callOpenAI(prompt) : callAnthropic(prompt);
}

app.post("/api/generate", async (req, res) => {
  const { elemen, level, index, sessionId } = req.body;
  const levelLabel =
    level === 1 ? "Pengetahuan dan Pemahaman" :
    level === 2 ? "Aplikasi" : "Penalaran";
  const prompt = `Buat soal TKA Matematika SMP elemen "${elemen}", level ${level} (${levelLabel}). Soal ke-${index} dari 30 sesi ini (sesi: ${sessionId}). Buat unik dan berbeda. Respons JSON langsung.`;

  const MAX_RETRY = 4;
  let lastErr = null;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const t0 = Date.now();
    console.log(`[GEN] soal=${index} elemen=${elemen} level=${level} attempt=${attempt + 1}`);
    try {
      const result = await callLLM(prompt);
      const ms = Date.now() - t0;
      if (result.rateLimited) {
        const wait = result.wait || (attempt + 1) * 3000;
        console.warn(`[429] rate limited soal=${index}, tunggu ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      const clean = result.text.replace(/```json|```/g, "").trim();
      let question;
      try {
        question = JSON.parse(clean);
      } catch (e) {
        console.error(`[PARSE] soal=${index} (${ms}ms):`, e.message, clean.substring(0, 150));
        lastErr = e;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      console.log(`[OK] soal=${index} ${ms}ms`);
      return res.json({ question });
    } catch (err) {
      const ms = Date.now() - t0;
      if (err.fatal) {
        console.error(`[FATAL] soal=${index} status=${err.status} (${ms}ms):`, err.body?.substring(0, 300));
        return res.status(err.status || 400).json({ error: err.message, detail: err.body });
      }
      console.error(`[ERR] soal=${index} attempt=${attempt + 1} (${ms}ms):`, err.message);
      lastErr = err;
      if (attempt < MAX_RETRY - 1) await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }

  console.error(`[FAIL] soal=${index} gagal ${MAX_RETRY}x:`, lastErr?.message);
  res.status(500).json({ error: lastErr?.message || "Max retry exceeded" });
});

// ── Leaderboard ──────────────────────────────────────────────────
app.get("/api/leaderboard", (req, res) => {
  const rows = db.prepare(`
    SELECT u.username as name,
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
app.listen(PORT, () => console.log(`[START] TKA Latihan v3 → http://localhost:${PORT}`));
