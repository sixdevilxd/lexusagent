import type { Bot, Context } from "grammy";
import type { Address } from "viem";
import { config } from "../config";
import { mainMenu } from "./keyboards";
import { StreamingMessage, keepTyping } from "./stream";
import { askStream } from "../ai";
import { createWallet, getEoaAddress, hasWallet } from "../wallet/store";
import { getKernelClient } from "../wallet/zerodev";
import { getBalances, buyToken, sellToken } from "../wallet/trade";
import { getTxs } from "../wallet/history";
import { startMint, handleMintInput, registerMintCallbacks } from "../mint/flow";
import { startDeviceFlow, pollForToken } from "../github/oauth";
import { saveToken, getToken, getLogin, clearToken } from "../github/store";
import { getViewer, listRepos } from "../github/client";

async function showWallet(ctx: Context): Promise<void> {
  const uid = ctx.from!.id;
  if (!hasWallet(uid)) createWallet(uid);
  const eoa = getEoaAddress(uid);
  const { smartAddress } = await getKernelClient(uid);
  await ctx.reply(
    `💰 *Your Wallet*\n\nSmart Account (ZeroDev):\n\`${smartAddress}\`\n\nSigner (EOA):\n\`${eoa}\`\n\n_Fund the Smart Account address to start trading._`,
    { parse_mode: "Markdown" },
  );
}

async function showBalance(ctx: Context, token?: Address): Promise<void> {
  const uid = ctx.from!.id;
  if (!hasWallet(uid)) {
    await ctx.reply("No wallet yet. Use /wallet to create one.");
    return;
  }
  const { smartAddress } = await getKernelClient(uid);
  const bal = await getBalances(smartAddress, token);
  let msg = `📊 *Balance*\n\nSmart Account:\n\`${smartAddress}\`\n\nNative: *${bal.native}*`;
  if (bal.token) msg += `\n${bal.token.symbol}: *${bal.token.balance}*`;
  else msg += `\n\n_Tip: /balance <tokenAddress> to check an ERC-20._`;
  await ctx.reply(msg, { parse_mode: "Markdown" });
}

async function showTxs(ctx: Context): Promise<void> {
  const txs = getTxs(ctx.from!.id, 10);
  if (!txs.length) {
    await ctx.reply("📜 No transactions yet.");
    return;
  }
  const lines = txs.map((t, i) => {
    const link = config.explorerTx ? `${config.explorerTx}${t.txHash}` : t.txHash;
    return `${i + 1}. *${t.type.toUpperCase()}* ${t.amount}\n${link}`;
  });
  await ctx.reply(`📜 *Recent Transactions*\n\n${lines.join("\n\n")}`, {
    parse_mode: "Markdown",
    link_preview_options: { is_disabled: true },
  });
}

// ---------- GitHub ----------
async function githubStatus(ctx: Context): Promise<void> {
  const uid = ctx.from!.id;
  const token = getToken(uid);
  if (!token) {
    await ctx.reply("❌ GitHub not connected.\nSend /github to connect.");
    return;
  }
  try {
    const user = await getViewer(token);
    const repos = await listRepos(token, 5);
    const list = repos.map((r: any) => `• ${r.full_name}`).join("\n") || "_none_";
    await ctx.reply(
      `✅ *GitHub connected*\n\nAccount: *${user.login}*\nPublic repos: ${user.public_repos}\nAccess: full\n\n*Recently updated:*\n${list}`,
      { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
    );
  } catch (e: any) {
    await ctx.reply(`⚠️ Token invalid or revoked: ${e.message}\nSend /github to reconnect.`);
  }
}

async function githubConnect(ctx: Context): Promise<void> {
  const uid = ctx.from!.id;
  if (getToken(uid)) {
    await ctx.reply(
      `Already connected as *${getLogin(uid)}*.\nUse /github status or /github logout.`,
      { parse_mode: "Markdown" },
    );
    return;
  }
  try {
    const dc = await startDeviceFlow();
    await ctx.reply(
      `🔗 *Connect GitHub*\n\n1️⃣ Open: ${dc.verification_uri}\n2️⃣ Enter this code:\n\n\`${dc.user_code}\`\n\n_Waiting for authorization (expires in ${Math.floor(dc.expires_in / 60)} min)..._`,
      { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
    );

    void (async () => {
      try {
        const token = await pollForToken(dc.device_code, dc.interval, dc.expires_in);
        const user = await getViewer(token);
        saveToken(uid, token, user.login);
        console.log(`[github] connected user ${uid} as ${user.login}`);
        await ctx.reply(`✅ GitHub connected as *${user.login}*`, { parse_mode: "Markdown" });
      } catch (e: any) {
        console.error("[github] connect failed", e);
        await ctx.reply(`❌ GitHub connect failed: ${e.message}`);
      }
    })();
  } catch (e: any) {
    await ctx.reply(`❌ ${e.message}`);
  }
}

export function registerHandlers(bot: Bot): void {
  bot.command("ping", async (ctx) => {
    await ctx.reply("🏓 pong — bot is alive");
  });

  bot.command("status", async (ctx) => {
    const model =
      config.aiProvider === "agentrouter"
        ? config.agentRouter.model
        : config.agentRouter.anthropicModel;
    const gh = getLogin(ctx.from!.id);
    await ctx.reply(
      "🩺 *Status*\n\n" +
        `AI: *${model}* via AgentRouter\n` +
        `Protocol: ${config.aiProvider === "agentrouter" ? "OpenAI-compatible" : "Anthropic"}\n` +
        `Streaming: ✅ on\n` +
        `Max tokens: ${config.agentRouter.maxTokens}\n` +
        `AgentRouter key: ${config.agentRouter.apiKey ? "✅ set" : "❌ not set"}\n` +
        `GitHub: ${gh ? `✅ ${gh}` : "❌ not connected"}\n` +
        `Chain: *${config.chainName}* (${config.chainId})${config.isTestnet ? " testnet" : " MAINNET"}\n` +
        `ZeroDev: ${config.zerodev.rpc ? "✅ set" : "❌ not set"}\n` +
        `Your Telegram ID: \`${ctx.from?.id}\``,
      { parse_mode: "Markdown" },
    );
  });

  // ---- GitHub (the only integration exposed as a command) ----
  bot.command("github", async (ctx) => {
    const arg = (ctx.match || "").trim().toLowerCase();
    if (arg === "logout" || arg === "disconnect") {
      clearToken(ctx.from!.id);
      await ctx.reply("🔌 GitHub disconnected.");
      return;
    }
    if (arg === "status") {
      await githubStatus(ctx);
      return;
    }
    await githubConnect(ctx);
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🚗 *lexusagent*\nAI coding + trading agent powered by Claude Opus 5.\n\n" +
        "💬 *Just type anything* — I write, debug and explain code in any language. No command needed.\n\n" +
        "Commands:\n" +
        "/github — connect your GitHub account\n" +
        "/ping — check the bot is alive\n" +
        "/status — show configuration\n" +
        "/wallet — show/create wallet\n" +
        "/balance [token] — check balance\n" +
        "/buy <token> <amount> — buy\n" +
        "/sell <token> <amount> — sell\n" +
        "/mint [url] — create a token (confirm before signing)\n" +
        "/tx — recent transactions",
      { parse_mode: "Markdown", reply_markup: mainMenu },
    );
  });

  bot.command("wallet", showWallet);
  bot.callbackQuery("wallet", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWallet(ctx);
  });

  bot.command("balance", async (ctx) => {
    const arg = (ctx.match || "").trim();
    await showBalance(ctx, arg ? (arg as Address) : undefined);
  });
  bot.callbackQuery("balance", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showBalance(ctx);
  });

  bot.command("buy", async (ctx) => {
    const parts = (ctx.match || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      await ctx.reply("Usage: /buy <tokenAddress> <amount>\nExample: /buy 0xToken 0.01");
      return;
    }
    const [token, amount] = parts;
    await ctx.reply("⏳ Submitting buy order...");
    try {
      const hash = await buyToken(ctx.from!.id, token as Address, amount);
      const link = config.explorerTx ? `${config.explorerTx}${hash}` : hash;
      await ctx.reply(`✅ Buy sent!\n${link}`, { link_preview_options: { is_disabled: true } });
    } catch (e: any) {
      await ctx.reply(`❌ Buy failed: ${e.message}`);
    }
  });

  bot.command("sell", async (ctx) => {
    const parts = (ctx.match || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      await ctx.reply("Usage: /sell <tokenAddress> <amount>\nExample: /sell 0xToken 100");
      return;
    }
    const [token, amount] = parts;
    await ctx.reply("⏳ Submitting sell order...");
    try {
      const hash = await sellToken(ctx.from!.id, token as Address, amount);
      const link = config.explorerTx ? `${config.explorerTx}${hash}` : hash;
      await ctx.reply(`✅ Sell sent!\n${link}`, { link_preview_options: { is_disabled: true } });
    } catch (e: any) {
      await ctx.reply(`❌ Sell failed: ${e.message}`);
    }
  });

  // ---- Mint wizard ----
  bot.command("mint", async (ctx) => {
    const url = (ctx.match || "").trim();
    await startMint(ctx, url || undefined);
  });
  bot.callbackQuery("mint_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startMint(ctx);
  });
  registerMintCallbacks(bot);

  bot.command("tx", showTxs);
  bot.callbackQuery("tx", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showTxs(ctx);
  });

  bot.callbackQuery("buy_help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("🟢 To buy: /buy <tokenAddress> <amount>\nExample: /buy 0xToken 0.01");
  });
  bot.callbackQuery("sell_help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("🔴 To sell: /sell <tokenAddress> <amount>\nExample: /sell 0xToken 100");
  });
  bot.callbackQuery("ai_help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("🤖 Just type any message — code, bugs, questions. No command needed.");
  });

  // Any non-command text => mint wizard (if active) else the AI brain
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (await handleMintInput(ctx, ctx.message.text)) return;
    await askAndReply(ctx, ctx.message.text);
  });
}

/** Stream the AI answer into a single Telegram message, edited as it arrives. */
async function askAndReply(ctx: Context, prompt: string): Promise<void> {
  const stopTyping = keepTyping(ctx);
  const stream = new StreamingMessage(ctx);
  const t0 = Date.now();
  let firstMs = 0;
  let ticker: NodeJS.Timeout | undefined;

  try {
    await stream.init();
    ticker = setInterval(() => void stream.flush(), 1400);

    const full = await askStream(prompt, (delta) => {
      if (!firstMs) firstMs = Date.now() - t0;
      stream.append(delta);
    });

    clearInterval(ticker);
    await stream.finish();
    console.log(
      `[ai] first=${firstMs}ms total=${Date.now() - t0}ms chars=${full.length}`,
    );
  } catch (e: any) {
    if (ticker) clearInterval(ticker);
    console.error("[ai error]", e);
    const msg =
      e?.name === "AbortError"
        ? "AI berhenti merespons (stall). Coba kirim ulang."
        : e.message;
    try {
      await stream.fail(msg);
    } catch {
      await ctx.reply(`❌ AI error: ${msg}`);
    }
  } finally {
    if (ticker) clearInterval(ticker);
    stopTyping();
  }
}
