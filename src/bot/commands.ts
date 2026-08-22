import type { Bot, Context } from "grammy";
import type { Address } from "viem";
import { config } from "../config";
import { mainMenu } from "./keyboards";
import { ask } from "../ai";
import { createWallet, getEoaAddress, hasWallet } from "../wallet/store";
import { getKernelClient } from "../wallet/zerodev";
import { getBalances, buyToken, sellToken } from "../wallet/trade";
import { getTxs } from "../wallet/history";

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

export function registerHandlers(bot: Bot): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🚗 *lexusagent*\nAI trading agent powered by Claude Code / AgentRouter + ZeroDev.\n\nPick an action below, or just type a message to chat with the AI.\n\nCommands:\n/wallet — show/create wallet\n/balance [token] — check balance\n/buy <token> <amount> — buy\n/sell <token> <amount> — sell\n/tx — recent transactions",
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
    await ctx.reply("🤖 Just type any message and I'll pass it to the AI.");
  });

  // Any non-command text => AI brain (Claude Code or AgentRouter)
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    await ctx.replyWithChatAction("typing");
    try {
      const answer = await ask(ctx.message.text);
      await ctx.reply(answer || "(no output)");
    } catch (e: any) {
      await ctx.reply(`❌ AI error: ${e.message}`);
    }
  });
}
