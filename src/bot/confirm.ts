import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";

type Pending = { title: string; run: () => Promise<string> };

const pending = new Map<number, Pending>();

export const confirmKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text("✅ Confirm", "act_yes").text("❌ Cancel", "act_no");

export function setPending(userId: number, p: Pending): void {
  pending.set(userId, p);
}

export function clearPending(userId: number): void {
  pending.delete(userId);
}

/** Generic confirm gate for irreversible on-chain actions. */
export function registerConfirm(bot: Bot): void {
  bot.callbackQuery("act_yes", async (ctx) => {
    await ctx.answerCallbackQuery();
    const uid = ctx.from!.id;
    const p = pending.get(uid);
    if (!p) {
      await ctx.reply("Nothing pending.");
      return;
    }
    pending.delete(uid);
    await ctx.reply(`⏳ ${p.title}...`);
    try {
      const out = await p.run();
      await ctx.reply(out, { link_preview_options: { is_disabled: true } });
    } catch (e: any) {
      await ctx.reply(`❌ Failed: ${e.message}`);
    }
  });

  bot.callbackQuery("act_no", async (ctx) => {
    await ctx.answerCallbackQuery();
    clearPending(ctx.from!.id);
    await ctx.reply("❌ Cancelled.");
  });
}
