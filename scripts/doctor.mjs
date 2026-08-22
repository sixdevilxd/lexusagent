#!/usr/bin/env node
/**
 * lexusagent doctor — diagnose why the bot / AI is not replying.
 * Run:  npm run doctor
 */
import "dotenv/config";

const ok = (m) => console.log(`\x1b[32m✅\x1b[0m ${m}`);
const bad = (m) => console.log(`\x1b[31m❌\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m⚠\uFE0F \x1b[0m ${m}`);
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const problems = [];
const fail = (m) => {
  bad(m);
  problems.push(m);
};

function clean(v) {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

async function post(url, headers, body, timeoutMs = 45000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: c.signal,
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- env
head("1. Environment");
const rawKey = process.env.AGENTROUTER_API_KEY ?? "";
const key = clean(rawKey).replace(/^Bearer\s+/i, "");
const tgRaw = process.env.TELEGRAM_BOT_TOKEN ?? "";
const tg = clean(tgRaw);

if (!key) fail("AGENTROUTER_API_KEY kosong — isi di .env (agentrouter.org/console/token)");
else {
  ok(`AGENTROUTER_API_KEY terisi (${key.length} karakter)`);
  if (rawKey !== key) warn("Key ada kutip/spasi/prefix 'Bearer' — bersihkan di .env");
}

if (!tg) fail("TELEGRAM_BOT_TOKEN kosong");
else if (!/^\d+:[\w-]{30,}$/.test(tg)) warn("Format TELEGRAM_BOT_TOKEN terlihat aneh");
else ok("TELEGRAM_BOT_TOKEN format valid");

const provider = clean(process.env.AI_PROVIDER) || "agentrouter-claude";
console.log(`   AI_PROVIDER = ${provider}`);
if (provider === "claude") {
  warn("AI_PROVIDER=claude sudah tidak dipakai — otomatis dialihkan ke AgentRouter");
}

// ------------------------------------------------------- agentrouter
head("2. AgentRouter — Anthropic (claude-opus-5)");
const claudeModel = clean(process.env.AGENTROUTER_CLAUDE_MODEL) || "claude-opus-5";
if (key) {
  try {
    const r = await post(
      "https://agentrouter.org/v1/messages",
      { Authorization: `Bearer ${key}`, "anthropic-version": "2023-06-01" },
      { model: claudeModel, max_tokens: 32, messages: [{ role: "user", content: "balas OK saja" }] },
    );
    if (r.status === 200) {
      let txt = "";
      try {
        const j = JSON.parse(r.text);
        txt = (j.content ?? []).map((c) => c.text ?? "").join("").trim();
      } catch {}
      ok(`HTTP 200 — model "${claudeModel}" jawab: ${JSON.stringify(txt).slice(0, 80)}`);
    } else {
      fail(`HTTP ${r.status} — ${r.text.slice(0, 300)}`);
      if (r.status === 401) console.log("   → API key salah / dicabut");
      if (r.status === 404) console.log(`   → Model "${claudeModel}" tidak ada. Coba model lain.`);
      if (r.status === 429) console.log("   → Kuota habis / rate limit");
    }
  } catch (e) {
    fail(`Gagal konek: ${e.message}`);
    console.log("   → Cek koneksi internet / DNS di Termux");
  }
} else {
  warn("dilewati (tidak ada API key)");
}

head("3. AgentRouter — OpenAI-compatible (fallback)");
const oaModel = clean(process.env.AGENTROUTER_MODEL) || "gpt-5.5";
if (key) {
  try {
    const r = await post(
      "https://agentrouter.org/v1/chat/completions",
      { Authorization: `Bearer ${key}` },
      { model: oaModel, messages: [{ role: "user", content: "balas OK saja" }] },
    );
    if (r.status === 200) {
      let txt = "";
      try {
        txt = JSON.parse(r.text).choices?.[0]?.message?.content ?? "";
      } catch {}
      ok(`HTTP 200 — model "${oaModel}" jawab: ${JSON.stringify(txt.trim()).slice(0, 80)}`);
    } else {
      warn(`HTTP ${r.status} — ${r.text.slice(0, 200)}`);
    }
  } catch (e) {
    warn(`Gagal konek: ${e.message}`);
  }
} else {
  warn("dilewati (tidak ada API key)");
}

// ---------------------------------------------------------- telegram
head("4. Telegram");
if (tg) {
  try {
    const me = await (await fetch(`https://api.telegram.org/bot${tg}/getMe`)).json();
    if (!me.ok) fail(`getMe gagal: ${me.description}`);
    else {
      ok(`Bot: @${me.result.username} (${me.result.first_name})`);
      console.log(`   → Pastikan kamu chat ke @${me.result.username}, bukan bot lain`);
    }

    const wh = await (await fetch(`https://api.telegram.org/bot${tg}/getWebhookInfo`)).json();
    if (wh.ok && wh.result.url) {
      fail(`Webhook aktif: ${wh.result.url} — polling TIDAK akan terima pesan!`);
      console.log("   Fix:");
      console.log(`   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook?drop_pending_updates=true"`);
    } else if (wh.ok) {
      ok("Tidak ada webhook — polling siap");
      if (wh.result.pending_update_count > 0) {
        warn(`${wh.result.pending_update_count} update tertunda`);
      }
    }
  } catch (e) {
    fail(`Telegram error: ${e.message}`);
  }
}

// ------------------------------------------------------------ others
head("5. Lainnya");
console.log(`   ALLOWED_USER_IDS = ${process.env.ALLOWED_USER_IDS || "(kosong — semua orang boleh)"}`);
console.log(`   CHAIN            = ${process.env.CHAIN || "base-sepolia (default)"}`);
console.log(`   ZERODEV_PROJECT_ID = ${process.env.ZERODEV_PROJECT_ID ? "terisi" : "(kosong)"}`);
console.log(`   GITHUB_CLIENT_ID   = ${process.env.GITHUB_CLIENT_ID ? "terisi" : "(kosong)"}`);

// ----------------------------------------------------------- verdict
head("HASIL");
if (!problems.length) {
  ok("Semua cek utama lolos — jalankan: npm start");
} else {
  bad(`${problems.length} masalah ditemukan:`);
  problems.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
}
console.log("");
