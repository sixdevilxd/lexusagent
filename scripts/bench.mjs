#!/usr/bin/env node
/**
 * lexusagent bench — measure how fast each AgentRouter model actually is.
 * Run:  npm run bench
 *
 * Reports, per model:
 *   streamed = did the server really stream (SSE) or send one blob?
 *   TTFB     = time until the FIRST text arrives (what latency feels like)
 *   total    = time until the answer is complete
 */
import "dotenv/config";

const KEY = (process.env.AGENTROUTER_API_KEY ?? "").trim().replace(/^Bearer\s+/i, "");
const BASE = "https://agentrouter.org";
const PROMPT = "Tulis fungsi fibonacci di Python. Singkat saja, tanpa penjelasan.";

if (!KEY) {
  console.log("❌ AGENTROUTER_API_KEY kosong di .env");
  process.exit(1);
}

const ms = (n) => `${(n / 1000).toFixed(1)}s`;

async function run(label, url, headers, body, extract) {
  const t0 = Date.now();
  let ttfb = 0;
  let chars = 0;
  let chunks = 0;
  let streamed = false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      return { label, error: `HTTP ${res.status} ${t.slice(0, 120)}` };
    }

    streamed = (res.headers.get("content-type") ?? "").includes("event-stream");

    if (!streamed) {
      const raw = await res.text();
      ttfb = Date.now() - t0;
      chars = (extract.blob(raw) ?? "").length;
      return { label, streamed, ttfb, total: Date.now() - t0, chars, chunks: 1 };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const p = l.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const d = extract.delta(JSON.parse(p));
          if (d) {
            if (!ttfb) ttfb = Date.now() - t0;
            chars += d.length;
            chunks++;
          }
        } catch {}
      }
    }
    return { label, streamed, ttfb, total: Date.now() - t0, chars, chunks };
  } catch (e) {
    return { label, error: e.message };
  }
}

const anthropic = (model) =>
  run(
    `${model} (Anthropic)`,
    `${BASE}/v1/messages`,
    { Authorization: `Bearer ${KEY}`, "anthropic-version": "2023-06-01" },
    { model, max_tokens: 512, stream: true, messages: [{ role: "user", content: PROMPT }] },
    {
      delta: (e) => (e.type === "content_block_delta" ? e.delta?.text : ""),
      blob: (raw) => {
        try {
          return (JSON.parse(raw).content ?? []).map((c) => c.text ?? "").join("");
        } catch {
          return raw;
        }
      },
    },
  );

const openai = (model) =>
  run(
    `${model} (OpenAI)`,
    `${BASE}/v1/chat/completions`,
    { Authorization: `Bearer ${KEY}` },
    { model, stream: true, messages: [{ role: "user", content: PROMPT }] },
    {
      delta: (e) => e.choices?.[0]?.delta?.content ?? "",
      blob: (raw) => {
        try {
          return JSON.parse(raw).choices?.[0]?.message?.content ?? "";
        } catch {
          return raw;
        }
      },
    },
  );

console.log("⏱️  Mengukur kecepatan AgentRouter... (butuh ~1 menit)\n");

const results = [];
for (const t of [
  () => anthropic(process.env.AGENTROUTER_CLAUDE_MODEL?.trim() || "claude-opus-5"),
  () => openai(process.env.AGENTROUTER_MODEL?.trim() || "gpt-5.5"),
  () => openai("glm-5.2"),
]) {
  const r = await t();
  results.push(r);
  if (r.error) console.log(`❌ ${r.label}: ${r.error}`);
  else
    console.log(
      `✅ ${r.label}\n` +
        `   streaming : ${r.streamed ? "YA" : "TIDAK (server kirim sekaligus)"}\n` +
        `   token-1   : ${ms(r.ttfb)}\n` +
        `   total     : ${ms(r.total)}  (${r.chars} char, ${r.chunks} chunk)\n`,
    );
}

const ok = results.filter((r) => !r.error);
if (ok.length) {
  const fastest = ok.reduce((a, b) => (a.ttfb <= b.ttfb ? a : b));
  console.log("─".repeat(50));
  console.log(`🏆 Paling responsif: ${fastest.label} — token pertama ${ms(fastest.ttfb)}`);
  if (!ok.some((r) => r.streamed)) {
    console.log("⚠️  Server TIDAK streaming — balasan memang baru muncul setelah selesai.");
  }
}
console.log("");
