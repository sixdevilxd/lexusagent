import { Bot } from "grammy";
import { config } from "./config";
import { registerHandlers } from "./bot/commands";

const bot = new Bot(config.telegramToken);

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
    console.warn(`[auth] blocked ${uid} — not in ALLOWED_USER_IDS`);
    await ctx.reply(
      `⛔ Not authorized.\n\nYour Telegram ID: ${uid}\nAdd it to ALLOWED_USER_IDS in .env, then restart the bot.`,
    );
    return;
  }
  await next();
});

registerHandlers(bot);

bot.catch((err) => {
  console.error("[bot error]", (err as any).error ?? err);
});

// ---- startup sanity checks ----
const isClaudeModel = (m: string) => /claude/i.test(m);

if (!config.agentRouter.apiKey) {
  console.error(
    "❌ AGENTROUTER_API_KEY is empty — the AI cannot reply.\n" +
      "   Get a key at https://agentrouter.org/console/token and put it in .env",
  );
}

// Protocol / model mismatch — Claude models only work on the Anthropic endpoint.
if (config.aiProvider === "agentrouter" && isClaudeModel(config.agentRouter.model)) {
  console.error(
    `❌ MISMATCH: AGENTROUTER_MODEL="${config.agentRouter.model}" is a Claude model,\n` +
      "   but AI_PROVIDER=agentrouter uses the OpenAI-compatible endpoint.\n" +
      "   Fix: set AI_PROVIDER=agentrouter-claude (and AGENTROUTER_CLAUDE_MODEL=claude-opus-5),\n" +
      "        or set AGENTROUTER_MODEL=gpt-5.5",
  );
}
if (
  config.aiProvider === "agentrouter-claude" &&
  !isClaudeModel(config.agentRouter.anthropicModel)
) {
  console.error(
    `❌ MISMATCH: AGENTROUTER_CLAUDE_MODEL="${config.agentRouter.anthropicModel}" is not a Claude model,\n` +
      "   but AI_PROVIDER=agentrouter-claude uses the Anthropic endpoint.\n" +
      "   Fix: set AGENTROUTER_CLAUDE_MODEL=claude-opus-5, or use AI_PROVIDER=agentrouter",
  );
}

if (!config.allowedUserIds.length) {
  console.warn("⚠️  ALLOWED_USER_IDS is empty — anyone who finds the bot can use it.");
}
if (!config.zerodev.rpc) {
  console.error(
    "❌ ZERODEV_PROJECT_ID is empty — /wallet, /balance, /buy, /sell and /mint WILL FAIL.\n" +
      "   Public RPCs strip revert data, which breaks smart-account derivation.\n" +
      "   Get a project id at https://dashboard.zerodev.app (see ZERODEV.md).",
  );
}
if (!config.github.clientId) {
  console.warn("⚠️  GITHUB_CLIENT_ID is empty — /github will not work (see GITHUB.md).");
}
if (!config.isTestnet) {
  console.warn(
    `❗ MAINNET MODE: ${config.chainName} (id ${config.chainId}). Real funds are at risk.\n` +
      "   Slippage protection is not implemented (amountOutMinimum = 0) — see README before trading.",
  );
}

const activeModel =
  config.aiProvider === "agentrouter"
    ? config.agentRouter.model
    : config.agentRouter.anthropicModel;

console.log("🚗 lexusagent starting...");
console.log(`   AI    : ${activeModel} via AgentRouter (${config.aiProvider})`);
console.log(
  `   Chain : ${config.chainName} (id ${config.chainId})${config.isTestnet ? " [testnet]" : " [MAINNET]"}`,
);
console.log(
  `   RPC   : ${config.rpcUrl.replace(/\/api\/v3\/[^/]+/, "/api/v3/***")}` +
    (config.zerodev.rpc ? "" : "   ⚠️  not a ZeroDev RPC"),
);

void bot.start({
  drop_pending_updates: true,
  onStart: (info) =>
    console.log(`✅ Connected to Telegram as @${info.username} — send /ping to test.`),
});
