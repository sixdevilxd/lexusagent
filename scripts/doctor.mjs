#!/usr/bin/env node
/**
 * lexusagent doctor - test every AI provider path and say which one works.
 * Run:  npm run doctor
 */
import "dotenv/config";
import { spawn } from "node:child_process";

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const b = (s) => `\x1b[1m${s}\x1b[0m`;

const clean = (v) => (v ?? "").trim().replace(/^["']|["']$/g, "");
const PROMPT = "balas OK saja";
const working = [];

async function post(url, headers, body, ms = 45000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: c.signal,
    });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

function diagnose(status, text) {
  if (status === 401 && /unauthorized_client|unauthorized client/i.test(text)) {
    return "blocked: AgentRouter only accepts approved coding clients, not custom apps";
  }
  if (status === 401) return "bad or revoked API key";
  if (status === 403) return "forbidden";
  if (status === 404) return "wrong endpoint or model not found";
  if (status === 429) return "rate limited / out of quota";
  return text.slice(0, 160);
}

// ---------------------------------------------------------------- 0. env
console.log(b("\n0. Config"));
const provider = clean(process.env.AI_PROVIDER) || "agentrouter-claude";
const arKey = clean(process.env.AGENTROUTER_API_KEY).replace(/^Bearer\s+/i, "");
const antKey = clean(process.env.ANTHROPIC_API_KEY);
const antBase = clean(process.env.ANTHROPIC_BASE_URL) || "https://api.anthropic.com";
const tg = clean(process.env.TELEGRAM_BOT_TOKEN);

console.log(`   AI_PROVIDER          = ${provider}`);
console.log(`   AGENTROUTER_API_KEY  = ${arKey ? `set (${arKey.length} chars)` : r("empty")}`);
console.log(`   ANTHROPIC_API_KEY    = ${antKey ? `set (${antKey.length} chars)` : "empty"}`);
console.log(`   ANTHROPIC_BASE_URL   = ${antBase}`);
console.log(`   TELEGRAM_BOT_TOKEN   = ${tg ? "set" : r("empty")}`);

// ------------------------------------------- 1. agentrouter-claude
console.log(b("\n1. AI_PROVIDER=agentrouter-claude"));
if (!arKey) {
  console.log(y("   skipped - no AGENTROUTER_API_KEY"));
} else {
  try {
    const res = await post(
      "https://agentrouter.org/v1/messages",
      { Authorization: `Bearer ${arKey}`, "anthropic-version": "2023-06-01" },
      {
        model: clean(process.env.AGENTROUTER_CLAUDE_MODEL) || "claude-opus-5",
        max_tokens: 32,
        messages: [{ role: "user", content: PROMPT }],
      },
    );
    if (res.status === 200) {
      console.log(g("   OK"));
      working.push("agentrouter-claude");
    } else {
      console.log(r(`   HTTP ${res.status} - ${diagnose(res.status, res.text)}`));
    }
  } catch (e) {
    console.log(r(`   failed: ${e.message}`));
  }
}

// ------------------------------------------------- 2. agentrouter
console.log(b("\n2. AI_PROVIDER=agentrouter (no tools)"));
if (!arKey) {
  console.log(y("   skipped"));
} else {
  try {
    const res = await post(
      "https://agentrouter.org/v1/chat/completions",
      { Authorization: `Bearer ${arKey}` },
      {
        model: clean(process.env.AGENTROUTER_MODEL) || "gpt-5.5",
        messages: [{ role: "user", content: PROMPT }],
      },
    );
    if (res.status === 200) {
      console.log(g("   OK"));
      working.push("agentrouter");
    } else {
      console.log(r(`   HTTP ${res.status} - ${diagnose(res.status, res.text)}`));
    }
  } catch (e) {
    console.log(r(`   failed: ${e.message}`));
  }
}

// ------------------------------------------------------ 3. claude CLI
console.log(b("\n3. AI_PROVIDER=claude (local CLI, no tools)"));
console.log(`   ANTHROPIC_BASE_URL   = ${clean(process.env.ANTHROPIC_BASE_URL) || "(unset)"}`);
console.log(`   ANTHROPIC_AUTH_TOKEN = ${clean(process.env.ANTHROPIC_AUTH_TOKEN) ? "set" : "(unset)"}`);

const cliResult = await new Promise((resolve) => {
  let child;
  try {
    child = spawn(clean(process.env.CLAUDE_CMD) || "claude", ["-p", PROMPT], {
      env: process.env,
    });
  } catch (e) {
    resolve({ ok: false, msg: e.message });
    return;
  }
  let out = "";
  let err = "";
  const t = setTimeout(() => {
    child.kill("SIGKILL");
    resolve({ ok: false, msg: "timed out after 45s (CLI likely waiting for login)" });
  }, 45000);
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("error", (e) => {
    clearTimeout(t);
    resolve({ ok: false, msg: e.code === "ENOENT" ? "claude not found in PATH" : e.message });
  });
  child.on("close", (code) => {
    clearTimeout(t);
    if (code === 0 && out.trim()) resolve({ ok: true, msg: out.trim().slice(0, 80) });
    else resolve({ ok: false, msg: (err.trim() || `exit ${code}`).slice(0, 200) });
  });
});

if (cliResult.ok) {
  console.log(g(`   OK - replied: ${JSON.stringify(cliResult.msg)}`));
  working.push("claude");
} else {
  console.log(r(`   ${cliResult.msg}`));
}

// ------------------------------------------------------- 4. anthropic
console.log(b("\n4. AI_PROVIDER=anthropic (own key, tools work)"));
if (!antKey) {
  console.log(y("   skipped - no ANTHROPIC_API_KEY"));
} else {
  try {
    const res = await post(
      `${antBase.replace(/\/$/, "")}/v1/messages`,
      { "x-api-key": antKey, "anthropic-version": "2023-06-01" },
      {
        model: clean(process.env.ANTHROPIC_MODEL) || "claude-opus-5",
        max_tokens: 32,
        messages: [{ role: "user", content: PROMPT }],
      },
    );
    if (res.status === 200) {
      console.log(g("   OK"));
      working.push("anthropic");
    } else {
      console.log(r(`   HTTP ${res.status} - ${diagnose(res.status, res.text)}`));
    }
  } catch (e) {
    console.log(r(`   failed: ${e.message}`));
  }
}

// -------------------------------------------------------- 5. telegram
console.log(b("\n5. Telegram"));
if (!tg) {
  console.log(r("   TELEGRAM_BOT_TOKEN empty"));
} else {
  try {
    const me = await (await fetch(`https://api.telegram.org/bot${tg}/getMe`)).json();
    if (me.ok) console.log(g(`   bot @${me.result.username}`));
    else console.log(r(`   getMe failed: ${me.description}`));
    const wh = await (await fetch(`https://api.telegram.org/bot${tg}/getWebhookInfo`)).json();
    if (wh.ok && wh.result.url) {
      console.log(r(`   webhook set (${wh.result.url}) - polling will NOT receive messages`));
      console.log(`   fix: curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook?drop_pending_updates=true"`);
    } else if (wh.ok) {
      console.log(g("   no webhook - polling ok"));
    }
  } catch (e) {
    console.log(r(`   ${e.message}`));
  }
}

// ----------------------------------------------------------- verdict
console.log(b("\n=== VERDICT ==="));
if (!working.length) {
  console.log(r("No AI provider works."));
  console.log("\nPick one:");
  console.log("  a) Route the claude CLI through AgentRouter (their documented path):");
  console.log('     export ANTHROPIC_AUTH_TOKEN="<agentrouter key>"');
  console.log('     export ANTHROPIC_BASE_URL="https://agentrouter.org"');
  console.log('     export ANTHROPIC_MODEL="claude-opus-5"');
  console.log("     claude -p \"hi\"     # must reply, then: AI_PROVIDER=claude");
  console.log("  b) Use your own key:  ANTHROPIC_API_KEY=sk-ant-...  AI_PROVIDER=anthropic");
} else {
  const best =
    working.find((w) => w === "agentrouter-claude") ??
    working.find((w) => w === "anthropic") ??
    working[0];
  console.log(g(`Working: ${working.join(", ")}`));
  console.log(`\nUse this:\n  sed -i 's|^AI_PROVIDER=.*|AI_PROVIDER=${best}|' .env && npm start`);
  if (best === "claude" || best === "agentrouter") {
    console.log(y("\nNote: realtime tools (prices, token scan, search) are unavailable on this provider."));
  }
}
console.log("");
