import { InlineKeyboard } from "grammy";

export const mainMenu = new InlineKeyboard()
  .text("💰 Wallet", "wallet")
  .text("📊 Balance", "balance")
  .row()
  .text("🟢 Buy", "buy_help")
  .text("🔴 Sell", "sell_help")
  .row()
  .text("📜 Transactions", "tx")
  .text("🤖 Ask AI", "ai_help");
