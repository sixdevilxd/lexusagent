import type { Bot, Context } from "grammy";
import type { Address, Chain } from "viem";
import { config } from "../config";
import { resolveChain } from "../chains";
import { mainMenu } from "./keyboards";
import { StreamingMessage, keepTyping } from "./stream";
import { setPending, confirmKeyboard, registerConfirm } from "./confirm";
import { askStream } from "../ai";
import { createWallet, getEoaAddress, hasWallet } from "../wallet/store";
import { getKernelClient } from "../wallet/zerodev";
import { getBalances, buyToken, sellToken, type SwapResult } from "../wallet/trade";
import { provideLiquidity } from "../wallet/lp";
import { mintNft, nftInfo } from "../nft/degen";
import { getTxs } from "../wallet/history";
import { startMint, handleMintInput, registerMintCallbacks } from "../mint/flow";
import { startDeviceFlow, pollForToken } from "../github/oauth";
import { saveToken, getToken, getLogin, clearToken } from "../github/store";
import { getViewer, listRepos } from "../github/client";

/** Last token in the arg list may be a chain name/id. */
function popChain(parts: string[]): { parts: string[]; chain?: Chain } {
  if (parts.length < 2) return { parts };
  const last = parts[parts.length - 1];
  if (/^0x/i.test(last)) return { parts };
  const c = resolveChain(last);
  if (c) return { parts: parts.slice(0, -1), chain: c };
  return { parts };
}

function swapSummary(label: string, r: SwapResult): string {
  const link = r.explorerTx ? r.explorerTx + r.txHash : r.txHash;
  return (
    `✅ ${label} sent on *${r.chainName}*${r.detected ? " (auto-detected)" : ""}\n` +
    `Pool fee: ${r.fee / 10000}%  •  slippage cap ${config.slippageBps / 100}%\n` +
    link
  );
}

async function showWallet(ctx: Context): Promise<void> {
  const uid = ctx.from!.id;
  if (!hasWallet(uid)) createWallet(uid);
  const eoa = getEoaAddress(uid);
  const { smartAddress } = await getKernelClient(uid);
  await ctx.reply(
    `💰 *Wallet*\n\nSmart Account (same address on every EVM chain):\n\`${smartAddress}\`\n\nSigner (EOA):\n\`${eoa}\``,
    { parse_mode: "Markdown" },
  );
}

async function showBalance(ctx: Context, token?: Address, chain?: Chain): Promise<void> {
  const uid = ctx.from!.id;
  if (!hasWallet(uid)) {
    await ctx.reply("No wallet yet. Use /wallet.");
    return;
  }
  const { smartAddress } = await getKernelClient(uid, chain ?? config.chain);
  const bal = await getBalances(smartAddress, token, chain ?? config.chain);
  let msg = `📊 *Balance* — ${bal.chain}\n\n\`${smartAddress}\`\n\nNative: *${bal.native}*`;
  if (bal.token) msg += `\n${bal.token.symbol}: *${bal.token.balance}*`;
  await ctx.reply(msg, { parse_mode: "Markdown" });
}

async function showTxs(ctx: Context): Promise<void> {
  const txs = getTxs(ctx.from!.id, 10);
  if (!txs.length) {
    await ctx.reply("📜 No transactions yet.");
    return;
  }
  const lines = txs.map((t, i) => `${i + 1}. *${t.type.toUpperCase()}* ${t.amount}\n\`${t.txHash}\``);
  await ctx.reply(`📜 *Recent*\n\n${lines.join("\n\n")}`, {
    parse_mode: "Markdown",
    link_preview_options: { is_disabled: true },
  });
}

async function githubStatus(ctx: Context): Promise<void> {
  const token = getToken(ctx.from!.id);
  if (!token) {
    await ctx.reply("❌ GitHub not connected. Send /github");
    return;
  }
  try {
    const user = await getViewer(token);
    const repos = await listRepos(token, 5);
    const list = repos.map((r: any) => `• ${r.full_name}`).join("\n") || "_none_";
    await ctx.reply(`✅ *${user.login}* — full access\n\n*Recent:*\n${list}`, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
  } catch (e: any) {
    await ctx.reply(`⚠️ Token invalid: ${e.message}`);
  }
}

async function githubConnect(ctx: Context): Promise<void> {
  const uid = ctx.from!.id;
  if (getToken(uid)) {
    await ctx.reply(`Already connected as *${getLogin(uid)}*.`, { parse_mode: "Markdown" });
    return;
  }
  try {
    const dc = await startDeviceFlow();
    await ctx.reply(
      `🔗 *Connect GitHub*\n\n1️⃣ ${dc.verification_uri}\n2️⃣ Code:\n\n\`${dc.user_code}\`\n\n_expires in ${Math.floor(dc.expires_in / 60)} min_`,
      { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
    );
    void (async () => {
      try {
        const token = await pollForToken(dc.device_code, dc.interval, dc.expires_in);
        const user = await getViewer(token);
        saveToken(uid, token, user.login);
        await ctx.reply(`✅ GitHub connected as *${user.login}*`, { parse_mode: "Markdown" });
      } catch (e: any) {
        await ctx.reply(`❌ GitHub connect failed: ${e.message}`);
      }
    })();
  } catch (e: any) {
    await ctx.reply(`❌ ${e.message}`);
  }
}

export function registerHandlers(bot: Bot): void {
  registerConfirm(bot);
  registerMintCallbacks(bot);

  bot.command("ping", (ctx) => ctx.reply("🏓 pong"));

  bot.command("status", async (ctx) => {
    const model =
      config.aiProvider === "agentrouter"
        ? config.agentRouter.model
        : config.agentRouter.anthropicModel;
    const gh = getLogin(ctx.from!.id);
    await ctx.reply(
      "🩺 *Status*\n\n" +
        `AI: *${model}*  • tools: ${config.aiProvider === "agentrouter-claude" ? "✅" : "❌"}\n` +
        `Key: ${config.agentRouter.apiKey ? "✅" : "❌"}  • GitHub: ${gh ? `✅ ${gh}` : "❌"}\n\n` +
        `Default chain: *${config.chainName}* (${config.chainId})\n` +
        `Auto chain-switch: ✅ (by deepest liquidity)\n` +
        `ZeroDev: ${config.zerodev.rpc ? "✅" : "❌"}  • browser: ${process.env.CHROMIUM_PATH ? "✅" : "❌"}\n` +
        `Slippage: ${config.slippageBps / 100}%\n` +
        `Your ID: \`${ctx.from?.id}\``,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("github", async (ctx) => {
    const arg = (ctx.match || "").trim().toLowerCase();
    if (arg === "logout" || arg === "disconnect") {
      clearToken(ctx.from!.id);
      await ctx.reply("🔌 GitHub disconnected.");
      return;
    }
    if (arg === "status") return githubStatus(ctx);
    return githubConnect(ctx);
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🚗 *lexusagent*\n\n" +
        "💬 *Type anything* — coding, live prices, token scans, sentiment, web search.\n\n" +
        "/target <url> [qty] — recon a mint site, then mint\n" +
        "/degen <nft> [qty] [price] [chain]\n" +
        "/buy <token> <amount> [chain]\n" +
        "/sell <token> <amount> [chain]\n" +
        "/lp <token> <native> <token> [fee] [chain]\n" +
        "/wallet • /balance [token] [chain] • /tx\n" +
        "/mint [url] • /github • /status • /ping\n\n" +
        "_Chain is auto-detected from the token. Add a chain name to force it._",
      { parse_mode: "Markdown", reply_markup: mainMenu },
    );
  });

  bot.command("wallet", showWallet);
  bot.callbackQuery("wallet", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWallet(ctx);
  });

  bot.command("balance", async (ctx) => {
    const { parts, chain } = popChain((ctx.match || "").trim().split(/\s+/).filter(Boolean));
    await showBalance(ctx, parts[0] ? (parts[0] as Address) : undefined, chain);
  });
  bot.callbackQuery("balance", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showBalance(ctx);
  });

  bot.command("buy", async (ctx) => {
    const { parts, chain } = popChain((ctx.match || "").trim().split(/\s+/).filter(Boolean));
    if (parts.length < 2) {
      await ctx.reply("/buy <tokenAddress> <amountNative> [chain]");
      return;
    }
    await ctx.reply("⏳ Detecting chain and quoting...");
    try {
      const r = await buyToken(ctx.from!.id, parts[0] as Address, parts[1], chain);
      await ctx.reply(swapSummary("Buy", r), {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch (e: any) {
      await ctx.reply(`❌ Buy failed: ${e.message}`);
    }
  });

  bot.command("sell", async (ctx) => {
    const { parts, chain } = popChain((ctx.match || "").trim().split(/\s+/).filter(Boolean));
    if (parts.length < 2) {
      await ctx.reply("/sell <tokenAddress> <amountToken> [chain]");
      return;
    }
    await ctx.reply("⏳ Detecting chain and quoting...");
    try {
      const r = await sellToken(ctx.from!.id, parts[0] as Address, parts[1], chain);
      await ctx.reply(swapSummary("Sell", r), {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch (e: any) {
      await ctx.reply(`❌ Sell failed: ${e.message}`);
    }
  });

  bot.command("lp", async (ctx) => {
    const { parts, chain } = popChain((ctx.match || "").trim().split(/\s+/).filter(Boolean));
    if (parts.length < 3) {
      await ctx.reply(
        "/lp <tokenAddress> <amountNative> <amountToken> [feeTier] [chain]\n" +
          "Example: /lp 0xToken 0.05 1000000 3000",
      );
      return;
    }
    const [token, amtNative, amtToken, feeStr] = parts;
    const fee = Number(feeStr ?? 3000);
    const uid = ctx.from!.id;

    setPending(uid, {
      title: "Adding liquidity",
      run: async () => {
        const r = await provideLiquidity(uid, token as Address, amtNative, amtToken, fee, chain);
        const link = r.explorerTx ? r.explorerTx + r.txHash : r.txHash;
        return `✅ LP minted on ${r.chainName}\nFee ${r.fee / 10000}%  • pool ${r.pool}\n${link}`;
      },
    });

    await ctx.reply(
      `💧 *Add Liquidity*\n\n` +
        `Token: \`${token}\`\n` +
        `Native: *${amtNative}*  •  Token: *${amtToken}*\n` +
        `Fee tier: *${fee / 10000}%*  •  full range\n` +
        `Chain: *${chain ? chain.name : "auto-detect"}*\n` +
        `Min amounts: −${config.slippageBps / 100}%`,
      { parse_mode: "Markdown", reply_markup: confirmKeyboard() },
    );
  });

  bot.command("degen", async (ctx) => {
    const { parts, chain } = popChain((ctx.match || "").trim().split(/\s+/).filter(Boolean));
    if (!parts.length) {
      await ctx.reply("/degen <nftContract> [qty] [priceEach] [chain]");
      return;
    }
    const contract = parts[0] as Address;
    const qty = Number(parts[1] ?? 1);
    const price = parts[2] ?? "0";
    const uid = ctx.from!.id;
    const target = chain ?? config.chain;

    let info: any = null;
    try {
      info = await nftInfo(contract, target);
    } catch {
      /* unreadable contract */
    }

    setPending(uid, {
      title: "Minting NFT",
      run: async () => {
        const r = await mintNft(uid, contract, qty, price, {}, target);
        const link = r.explorerTx ? r.explorerTx + r.txHash : r.txHash;
        return `✅ Minted ${r.quantity}x on ${r.chainName} via ${r.signature}\n${link}`;
      },
    });

    await ctx.reply(
      `🎴 *Degen Mint*\n\n` +
        (info ? `Collection: *${info.name}* (${info.symbol})\nSupply: ${info.totalSupply}/${info.maxSupply}\n` : "") +
        `Contract: \`${contract}\`\n` +
        `Chain: *${target.name}*\n` +
        `Qty: *${qty}*  •  each *${price}*  •  total *${(Number(price) * qty).toFixed(6)}*`,
      { parse_mode: "Markdown", reply_markup: confirmKeyboard() },
    );
  });

  bot.command("mint", async (ctx) => {
    const url = (ctx.match || "").trim();
    await startMint(ctx, url || undefined);
  });
  bot.callbackQuery("mint_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startMint(ctx);
  });

  bot.command("tx", showTxs);
  bot.callbackQuery("tx", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showTxs(ctx);
  });

  const help: Record<string, string> = {
    buy_help: "/buy <tokenAddress> <amountNative> [chain]",
    sell_help: "/sell <tokenAddress> <amountToken> [chain]",
    lp_help: "/lp <tokenAddress> <amountNative> <amountToken> [feeTier] [chain]",
    degen_help: "/degen <nftContract> [qty] [priceEach] [chain]",
  };
  for (const [key, text] of Object.entries(help)) {
    bot.callbackQuery(key, async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.reply(text);
    });
  }

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (await handleMintInput(ctx, ctx.message.text)) return;
    await askAndReply(ctx, ctx.message.text);
  });
}

async function askAndReply(ctx: Context, prompt: string): Promise<void> {
  const stopTyping = keepTyping(ctx);
  const stream = new StreamingMessage(ctx);
  const t0 = Date.now();
  let ticker: NodeJS.Timeout | undefined;

  try {
    await stream.init();
    ticker = setInterval(() => void stream.flush(), 1400);
    const full = await askStream(prompt, (delta) => stream.append(delta));
    clearInterval(ticker);
    await stream.finish();
    console.log(`[ai] total=${Date.now() - t0}ms chars=${full.length}`);
  } catch (e: any) {
    if (ticker) clearInterval(ticker);
    console.error("[ai error]", e);
    const msg = e?.name === "AbortError" ? "AI stalled. Kirim ulang." : e.message;
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
