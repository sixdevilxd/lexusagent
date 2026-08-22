import { Bot } from "grammy";
import { config } from "./config";
import { registerHandlers } from "./bot/commands";

const bot = new Bot(config.telegramToken);

// Allowlist middleware — only permitted Telegram user IDs may use the bot.
bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  if (config.allowedUserIds.length && (!uid || !config.allowedUserIds.includes(uid))) {
    await ctx.reply("⛔ You are not authorized to use this bot.");
    return;
  }
  await next();
});

registerHandlers(bot);

bot.catch((err) => console.error("Bot error:", err));

console.log(`🚗 lexusagent starting on chain=${config.chainKey} ...`);
void bot.start();
