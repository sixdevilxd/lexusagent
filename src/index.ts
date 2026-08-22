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
const mask = (u: string) => u.replace(/\/api\/v3\/[^/]+/, "/api/v3/***");

if (!config.agentRouter.apiKey) {
  console.error(
    "❌ AGENTROUTER_API_KEY is empty — the AI cannot reply.\n" +
      "   Get a key at https://agentrouter.org/console/token",
  );
}

if (config.aiProvider === "agentrouter" && isClaudeModel(config.agentRouter.model)) {
  console.error(
    `❌ MISMATCH: AGENTROUTER_MODEL="${config.agentRouter.model}" is a Claude model,\n` +
      "   but AI_PROVIDER=agentrouter uses the OpenAI-compatible endpoint.\n" +
      "   Fix: AI_PROVIDER=agentrouter-claude   (or AGENTROUTER_MODEL=gpt-5.5)",
  );
}
if (
  config.aiProvider === "agentrouter-claude" &&
  !isClaudeModel(config.agentRouter.anthropicModel)
) {
  console.error(
    `❌ MISMATCH: AGENTROUTER_CLAUDE_MODEL="${config.agentRouter.anthropicModel}" is not a Claude model,\n` +
      "   but AI_PROVIDER=agentrouter-claude uses the Anthropic endpoint.",
  );
}

if (!config.allowedUserIds.length) {
  console.warn("⚠️  ALLOWED_USER_IDS is empty — anyone who finds the bot can use it.");
}
if (!config.zerodev.rpc) {
  console.error(
    "❌ ZERODEV_PROJECT_ID is empty — wallet & trading commands WILL FAIL.\n" +
      "   Public RPCs strip revert data, which breaks smart-account derivation.",
  );
}
if (!config.dexRouter || !config.quoter) {
  console.warn(
    `⚠️  No Uniswap V3 preset for chain ${config.chainId} — set DEX_ROUTER, QUOTER_ADDRESS and WETH_ADDRESS to trade.`,
  );
}
if (!config.github.clientId) {
  console.warn("⚠️  GITHUB_CLIENT_ID is empty — /github will not work (see GITHUB.md).");
}

// Chain sanity: an explicit RPC_URL that points at a different network is a
// common copy-paste mistake after switching CHAIN.
if (process.env.RPC_URL && /sepolia|testnet|goerli|amoy|fuji/i.test(process.env.RPC_URL) && !config.isTestnet) {
  console.error(
    `❌ RPC_URL looks like a testnet endpoint (${config.rpcUrl}) but CHAIN=${config.chainKey} is mainnet.\n` +
      "   Clear RPC_URL in .env to use the chain default.",
  );
}

if (!config.isTestnet) {
  console.warn(
    `❗ MAINNET: ${config.chainName} (id ${config.chainId}) — real funds.\n` +
      `   Slippage cap: ${config.slippageBps / 100}% (QuoterV2 enforced).`,
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
console.log(`   RPC   : ${mask(config.rpcUrl)}`);
console.log(`   AA RPC: ${config.zerodev.rpc ? mask(config.zerodev.rpc) : "— not set"}`);

void bot.start({
  drop_pending_updates: true,
  onStart: (info) =>
    console.log(`✅ Connected to Telegram as @${info.username} — send /ping to test.`),
});
