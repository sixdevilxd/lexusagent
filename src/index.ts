import { Bot } from "grammy";
import { config } from "./config";
import { registerHandlers } from "./bot/commands";

const bot = new Bot(config.telegramToken);

// ---- incoming update logging (helps debugging "bot doesn't reply") ----
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
const usesAgentRouter =
  config.aiProvider === "agentrouter" || config.aiProvider === "agentrouter-claude";

if (usesAgentRouter && !config.agentRouter.apiKey) {
  console.warn("⚠️  AI_PROVIDER is AgentRouter but AGENTROUTER_API_KEY is empty — AI replies will fail.");
}
if (!config.allowedUserIds.length) {
  console.warn("⚠️  ALLOWED_USER_IDS is empty — anyone who finds the bot can use it.");
}
if (!config.zerodev.rpc) {
  console.warn("⚠️  ZERODEV_RPC is empty — /wallet, /balance, /buy, /sell, /mint will fail.");
}

console.log("🚗 lexusagent starting...");
console.log(`   AI provider : ${config.aiProvider}`);
console.log(`   Chain       : ${config.chainKey}`);

void bot.start({
  drop_pending_updates: true,
  onStart: (info) =>
    console.log(`✅ Connected to Telegram as @${info.username} — send /ping to test.`),
});
