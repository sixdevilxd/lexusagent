import type { Bot, Context } from "grammy";
import type { Address } from "viem";
import { config } from "../config";
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

const txLink = (hash: string) =>
  config.explorerTx ? `${config.explorerTx}${hash}` : hash;

function swapSummary(label: string, r: SwapResult): string {
  return (
    `✅ ${label} sent\n` +
    `Pool fee: ${r.fee / 10000}%\n` +
    `Slippage cap: ${config.slippageBps / 100}%\n` +
    txLink(r.txHash)
  );
}

async function showWallet(ctx: Context): Promise<void> {
  const uid = ctx.from!.id;
  if (!hasWallet(uid)) createWallet(uid);
  const eoa = getEoaAddress(uid);
  const { smartAddress } = await getKernelClient(uid);
  await ctx.reply(
    `💰 *Wallet* — ${config.chainName}\n\nSmart Account:\n\`${smartAddress}\`\n\nSigner (EOA):\n\`${eoa}\``,
    { parse_mode: "Markdown" },
  );
}

async function showBalance(ctx: Context, token?: Address): Promise<void> {
  const uid = ctx.from!.id;
  if (!hasWallet(uid)) {
    await ctx.reply("No wallet yet. Use /wallet.");
    return;
  }
  const { smartAddress } = await getKernelClient(uid);
  const bal = await getBalances(smartAddress, token);
  let msg = `📊 *Balance* — ${config.chainName}\n\n\`${smartAddress}\`\n\nNative: *${bal.native}*`;
  if (bal.token) msg += `\n${bal.token.symbol}: *${bal.token.balance}*`;
  await ctx.reply(msg, { parse_mode: "Markdown" });
}

async function showTxs(ctx: Context): Promise<void> {
  const txs = getTxs(ctx.from!.id, 10);
  if (!txs.length) {
    await ctx.reply("📜 No transactions yet.");
    return;
  }
  const lines = txs.map(
    (t, i) => `${i + 1}. *${t.type.toUpperCase()}* ${t.amount}\n${txLink(t.txHash)}`,
  );
  await ctx.reply(`📜 *Recent*\n\n${lines.join("\n\n")}`, {
    parse_mode: "Markdown",
    link_preview_options: { is_disabled: true },
  });
}

// ---------- GitHub ----------
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
    await ctx.reply(
      `✅ *${user.login}* — full access\nPublic repos: ${user.public_repos}\n\n*Recent:*\n${list}`,
      { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
    );
  } catch (e: any) {
    await ctx.reply(`⚠️ Token invalid: ${e.message}\nSend /github to reconnect.`);
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
        `Chain: *${config.chainName}* (${config.chainId})${config.isTestnet ? " testnet" : ""}\n` +
        `ZeroDev: ${config.zerodev.rpc ? "✅" : "❌"}  • DEX: ${config.dexRouter ? "✅" : "❌"}  • LP: ${config.positionManager ? "✅" : "❌"}\n` +
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
        "💬 *Type anything* — coding, live prices, token scans, X/TikTok sentiment, web search. No command needed.\n\n" +
        "/wallet — smart wallet\n" +
        "/balance [token]\n" +
        "/buy <token> <amountNative>\n" +
        "/sell <token> <amountToken>\n" +
        "/lp <token> <amountNative> <amountToken> [fee]\n" +
        "/degen <nftContract> [qty] [priceEach]\n" +
        "/mint [url] — create a token\n" +
        "/github — connect GitHub\n" +
        "/tx • /status • /ping",
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
    const p = (ctx.match || "").trim().split(/\s+/).filter(Boolean);
    if (p.length < 2) {
      await ctx.reply("/buy <tokenAddress> <amountNative>");
      return;
    }
    await ctx.reply("⏳ Quoting...");
    try {
      const r = await buyToken(ctx.from!.id, p[0] as Address, p[1]);
      await ctx.reply(swapSummary("Buy", r), { link_preview_options: { is_disabled: true } });
    } catch (e: any) {
      await ctx.reply(`❌ Buy failed: ${e.message}`);
    }
  });

  bot.command("sell", async (ctx) => {
    const p = (ctx.match || "").trim().split(/\s+/).filter(Boolean);
    if (p.length < 2) {
      await ctx.reply("/sell <tokenAddress> <amountToken>");
      return;
    }
    await ctx.reply("⏳ Quoting...");
    try {
      const r = await sellToken(ctx.from!.id, p[0] as Address, p[1]);
      await ctx.reply(swapSummary("Sell", r), { link_preview_options: { is_disabled: true } });
    } catch (e: any) {
      await ctx.reply(`❌ Sell failed: ${e.message}`);
    }
  });

  // ---------- Provide LP ----------
  bot.command("lp", async (ctx) => {
    const p = (ctx.match || "").trim().split(/\s+/).filter(Boolean);
    if (p.length < 3) {
      await ctx.reply(
        "/lp <tokenAddress> <amountNative> <amountToken> [feeTier]\n" +
          "Example: /lp 0xToken 0.05 1000000 3000\n" +
          "Fee tiers: 100 | 500 | 3000 | 10000",
      );
      return;
    }
    const [token, amtNative, amtToken, feeStr] = p;
    const fee = Number(feeStr ?? 3000);
    const uid = ctx.from!.id;

    setPending(uid, {
      title: "Adding liquidity",
      run: async () => {
        const r = await provideLiquidity(uid, token as Address, amtNative, amtToken, fee);
        return (
          `✅ LP position minted\n` +
          `Fee tier: ${r.fee / 10000}%\n` +
          `Pool: ${r.pool}\n` +
          txLink(r.txHash)
        );
      },
    });

    await ctx.reply(
      `💧 *Add Liquidity — preview*\n\n` +
        `Chain: *${config.chainName}*\n` +
        `Token: \`${token}\`\n` +
        `Native side: *${amtNative}*\n` +
        `Token side: *${amtToken}*\n` +
        `Fee tier: *${fee / 10000}%*\n` +
        `Range: full range\n` +
        `Min amounts: −${config.slippageBps / 100}%\n\n` +
        `Native is wrapped to WETH automatically.`,
      { parse_mode: "Markdown", reply_markup: confirmKeyboard() },
    );
  });

  // ---------- Degen NFT mint ----------
  bot.command("degen", async (ctx) => {
    const p = (ctx.match || "").trim().split(/\s+/).filter(Boolean);
    if (p.length < 1) {
      await ctx.reply(
        "/degen <nftContract> [qty] [priceEachNative]\n" +
          "Example: /degen 0xNft 2 0.001\n" +
          "Mint signature is auto-detected.",
      );
      return;
    }
    const contract = p[0] as Address;
    const qty = Number(p[1] ?? 1);
    const price = p[2] ?? "0";
    const uid = ctx.from!.id;

    let info;
    try {
      info = await nftInfo(contract);
    } catch {
      info = null;
    }

    setPending(uid, {
      title: "Minting NFT",
      run: async () => {
        const r = await mintNft(uid, contract, qty, price);
        return (
          `✅ Minted ${r.quantity}x\n` +
          `Function: ${r.signature}\n` +
          txLink(r.txHash)
        );
      },
    });

    const total = (Number(price) * qty).toFixed(6);
    await ctx.reply(
      `🎴 *Degen Mint — preview*\n\n` +
        (info ? `Collection: *${info.name}* (${info.symbol})\nSupply: ${info.totalSupply}/${info.maxSupply}\n` : "") +
        `Contract: \`${contract}\`\n` +
        `Chain: *${config.chainName}*\n` +
        `Quantity: *${qty}*\n` +
        `Price each: *${price}*\n` +
        `Total: *${total}*`,
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
    buy_help: "/buy <tokenAddress> <amountNative>",
    sell_help: "/sell <tokenAddress> <amountToken>",
    lp_help: "/lp <tokenAddress> <amountNative> <amountToken> [feeTier]",
    degen_help: "/degen <nftContract> [qty] [priceEach]",
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
