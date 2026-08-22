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
if (!config.agentRouter.apiKey) {
  console.error(
    "❌ AGENTROUTER_API_KEY is empty — the AI cannot reply.\n" +
      "   Get a key at https://agentrouter.org/console/token and put it in .env",
  );
}
if (!config.allowedUserIds.length) {
  console.warn("⚠️  ALLOWED_USER_IDS is empty — anyone who finds the bot can use it.");
}
if (!config.zerodev.rpc) {
  console.warn(
    "⚠️  ZeroDev not configured — set ZERODEV_PROJECT_ID in .env, or /wallet, /balance, /buy, /sell and /mint will fail.",
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
console.log(`   RPC   : ${config.rpcUrl}`);

void bot.start({
  drop_pending_updates: true,
  onStart: (info) =>
    console.log(`✅ Connected to Telegram as @${info.username} — send /ping to test.`),
});
