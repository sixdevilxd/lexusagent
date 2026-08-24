import { setDefaultResultOrder } from "node:dns";

// Mobile / Termux networks frequently blackhole IPv6 routes to api.telegram.org,
// which surfaces as ETIMEDOUT. Node 20 defaults to "verbatim" (IPv6 first),
// so force IPv4 before anything opens a socket.
try {
  setDefaultResultOrder("ipv4first");
} catch {
  /* older node */
}

import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "./config";
import { registerHandlers } from "./bot/commands";
import { registerTarget } from "./recon/flow";

const bot = new Bot(config.telegramToken, {
  client: { timeoutSeconds: 60 },
});

// ---- retry transient network failures against the Telegram API ----
const RETRIABLE = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

bot.api.config.use(async (prev, method, payload, signal) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prev(method, payload, signal);
    } catch (e: any) {
      lastErr = e;
      const code = e?.code ?? e?.errno ?? e?.cause?.code;
      if (!RETRIABLE.has(String(code))) throw e;
      const wait = 800 * 2 ** attempt;
      console.warn(`[net] ${method} ${code} - retry ${attempt + 1}/3 in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
});

// ---- incoming update logging ----
bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  const uname = ctx.from?.username ?? "-";
  const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? "<non-text>";
  console.log(`[in] ${uid} (@${uname}): ${String(text).slice(0, 160)}`);
  const t0 = Date.now();
  await next();
  console.log(`[done] ${Date.now() - t0}ms`);
});

// ---- allowlist ----
bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  if (config.allowedUserIds.length && (!uid || !config.allowedUserIds.includes(uid))) {
    console.warn(`[auth] blocked ${uid}`);
    await ctx.reply(
      `⛔ Not authorized.\n\nYour Telegram ID: ${uid}\nAdd it to ALLOWED_USER_IDS in .env, then restart.`,
    );
    return;
  }
  await next();
});

registerHandlers(bot);
registerTarget(bot);

bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error(`[telegram] ${e.description}`);
  } else if (e instanceof HttpError) {
    console.error(`[network] cannot reach Telegram: ${(e as any)?.error?.code ?? e.message}`);
  } else {
    console.error("[bot error]", e);
  }
});

// ---- startup checks ----
const isClaudeModel = (m: string) => /claude/i.test(m);
const mask = (u: string) => u.replace(/\/api\/v3\/[^/]+/, "/api/v3/***");

if (!config.agentRouter.apiKey) {
  console.error("❌ AGENTROUTER_API_KEY is empty - the AI cannot reply.");
}
if (config.aiProvider === "agentrouter") {
  console.warn(
    "⚠️  AI_PROVIDER=agentrouter - realtime tools (search, prices, token scan) are DISABLED.\n" +
      "   Set AI_PROVIDER=agentrouter-claude to enable them.",
  );
}
if (config.aiProvider === "agentrouter" && isClaudeModel(config.agentRouter.model)) {
  console.error(
    `❌ MISMATCH: AGENTROUTER_MODEL="${config.agentRouter.model}" is a Claude model on the OpenAI endpoint.`,
  );
}
if (!config.allowedUserIds.length) {
  console.warn("⚠️  ALLOWED_USER_IDS is empty.");
}
if (!config.zerodev.rpc) {
  console.error("❌ ZERODEV_PROJECT_ID is empty - wallet & trading commands will fail.");
}
if (!config.dexRouter || !config.positionManager) {
  console.warn(`⚠️  No Uniswap V3 preset for chain ${config.chainId} - /buy /sell /lp disabled.`);
}
if (!process.env.CHROMIUM_PATH) {
  console.warn("⚠️  CHROMIUM_PATH not set - /target needs it. Run: bash scripts/setup-browser.sh");
}
if (
  process.env.RPC_URL &&
  /sepolia|testnet|goerli|amoy|fuji/i.test(process.env.RPC_URL) &&
  !config.isTestnet
) {
  console.error(`❌ RPC_URL is a testnet endpoint but CHAIN=${config.chainKey} is mainnet.`);
}
if (!config.isTestnet) {
  console.warn(
    `❗ MAINNET: ${config.chainName} (${config.chainId}) - slippage cap ${config.slippageBps / 100}%`,
  );
}

const activeModel =
  config.aiProvider === "agentrouter"
    ? config.agentRouter.model
    : config.agentRouter.anthropicModel;

console.log("🚗 lexusagent starting...");
console.log(`   AI    : ${activeModel} (${config.aiProvider})`);
console.log(`   Chain : ${config.chainName} (${config.chainId})${config.isTestnet ? " [testnet]" : " [MAINNET]"}`);
console.log(`   RPC   : ${mask(config.rpcUrl)}`);
console.log(`   AA RPC: ${config.zerodev.rpc ? mask(config.zerodev.rpc) : "- not set"}`);

void bot.start({
  drop_pending_updates: true,
  onStart: async (info) => {
    console.log(`✅ Connected as @${info.username}`);
    try {
      await bot.api.setMyCommands([
        { command: "target", description: "Recon a mint site and mint (GTD/FCFS/WL/public)" },
        { command: "degen", description: "Mint an NFT contract directly" },
        { command: "lp", description: "Provide Uniswap V3 liquidity" },
        { command: "buy", description: "Buy a token with native" },
        { command: "sell", description: "Sell a token to WETH" },
        { command: "mint", description: "Create a new token" },
        { command: "wallet", description: "Show smart wallet" },
        { command: "balance", description: "Check balance" },
        { command: "tx", description: "Recent transactions" },
        { command: "github", description: "Connect GitHub" },
        { command: "status", description: "Show configuration" },
        { command: "ping", description: "Check the bot is alive" },
      ]);
    } catch {
      /* non-fatal */
    }
  },
});
