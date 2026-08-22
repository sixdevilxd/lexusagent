import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { config } from "../config";
import { readTarget } from "./readTarget";
import { getDraft, setDraft, clearDraft, type MintDraft } from "./session";
import { executeMint } from "./execute";
import type { MintParams } from "./launchpad";

const REQUIRED: (keyof MintParams)[] = ["name", "symbol", "supply"];

const PROMPTS: Record<string, string> = {
  name: "Send the *token name* (e.g. Lexus Coin):",
  symbol: "Send the *symbol* (e.g. LEXUS):",
  supply: "Send the *total supply* (e.g. 1000000):",
  logo: "Send a *logo URL* (or type `skip`):",
};

function nextMissing(d: MintDraft): keyof MintParams | null {
  for (const f of REQUIRED) if (!d[f]) return f;
  return null;
}

function previewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirm", "mint_confirm")
    .text("❌ Cancel", "mint_cancel")
    .row()
    .text("✏️ Name", "mint_edit_name")
    .text("✏️ Symbol", "mint_edit_symbol")
    .row()
    .text("✏️ Supply", "mint_edit_supply")
    .text("✏️ Logo", "mint_edit_logo");
}

async function sendPreview(ctx: Context, d: MintDraft): Promise<void> {
  const fee = config.mint.creationFeeEth || "0";
  const msg =
    "🪙 *Transaction Preview — Mint Token*\n\n" +
    `Name: *${d.name}*\n` +
    `Symbol: *${d.symbol}*\n` +
    `Supply: *${d.supply}*\n` +
    `Logo: ${d.logo ? d.logo : "_(none)_"}\n\n` +
    `Factory: \`${config.mint.factory || "NOT SET"}\`\n` +
    `Creation fee: *${fee} ETH*\n` +
    `Network: *${config.chainKey}*\n\n` +
    (d.url ? `Source: ${d.url}\n\n` : "") +
    "Review carefully, then *Confirm* to sign & execute.";
  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: previewKeyboard(),
    link_preview_options: { is_disabled: true },
  });
}

async function askNext(ctx: Context, d: MintDraft): Promise<void> {
  const miss = nextMissing(d);
  if (miss) {
    d.awaiting = miss;
    d.stage = "collect";
    setDraft(ctx.from!.id, d);
    await ctx.reply(PROMPTS[miss], { parse_mode: "Markdown" });
  } else {
    d.awaiting = null;
    d.stage = "confirm";
    setDraft(ctx.from!.id, d);
    await sendPreview(ctx, d);
  }
}

/** Entry: /mint [url] */
export async function startMint(ctx: Context, url?: string): Promise<void> {
  const uid = ctx.from!.id;
  const d: MintDraft = { stage: "collect", awaiting: null };

  if (url) {
    d.url = url;
    await ctx.reply(`🔎 Reading target: ${url} ...`, {
      link_preview_options: { is_disabled: true },
    });
    try {
      const { extracted } = await readTarget(url);
      if (extracted.name) d.name = extracted.name;
      if (extracted.symbol) d.symbol = extracted.symbol;
      if (extracted.supply) d.supply = extracted.supply;
      if (extracted.logo) d.logo = extracted.logo;
      await ctx.reply(
        "Detected from page:\n" +
          `Name: ${d.name ?? "-"}\n` +
          `Symbol: ${d.symbol ?? "-"}\n` +
          `Supply: ${d.supply ?? "-"}\n` +
          `Logo: ${d.logo ?? "-"}`,
      );
    } catch (e: any) {
      await ctx.reply(`⚠️ Could not read page (${e.message}). Let's fill it manually.`);
    }
  }

  setDraft(uid, d);
  await askNext(ctx, d);
}

/** Route a plain text message into the mint wizard if one is active. Returns true if handled. */
export async function handleMintInput(ctx: Context, text: string): Promise<boolean> {
  const uid = ctx.from!.id;
  const d = getDraft(uid);
  if (!d || d.stage !== "collect" || !d.awaiting) return false;

  const field = d.awaiting;
  const val = text.trim();
  if (field === "logo" && val.toLowerCase() === "skip") d.logo = "";
  else (d as any)[field] = val;

  d.awaiting = null;
  setDraft(uid, d);
  await askNext(ctx, d);
  return true;
}

export function registerMintCallbacks(bot: Bot): void {
  bot.callbackQuery("mint_confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const uid = ctx.from!.id;
    const d = getDraft(uid);
    if (!d || d.stage !== "confirm") {
      await ctx.reply("No mint to confirm. Use /mint.");
      return;
    }
    await ctx.reply("✍️ Signing & executing mint...");
    try {
      const hash = await executeMint(uid, {
        name: d.name!,
        symbol: d.symbol!,
        supply: d.supply!,
        logo: d.logo,
      });
      const link = config.explorerTx ? `${config.explorerTx}${hash}` : hash;
      await ctx.reply(`✅ Mint executed!\n${link}`, {
        link_preview_options: { is_disabled: true },
      });
    } catch (e: any) {
      await ctx.reply(`❌ Mint failed: ${e.message}`);
    } finally {
      clearDraft(uid);
    }
  });

  bot.callbackQuery("mint_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    clearDraft(ctx.from!.id);
    await ctx.reply("❌ Mint cancelled.");
  });

  for (const f of ["name", "symbol", "supply", "logo"] as const) {
    bot.callbackQuery(`mint_edit_${f}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      const d = getDraft(ctx.from!.id);
      if (!d) {
        await ctx.reply("No active mint. Use /mint.");
        return;
      }
      d.stage = "collect";
      d.awaiting = f;
      setDraft(ctx.from!.id, d);
      await ctx.reply(PROMPTS[f], { parse_mode: "Markdown" });
    });
  }
}
