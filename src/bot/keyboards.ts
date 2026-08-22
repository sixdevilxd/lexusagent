import { InlineKeyboard } from "grammy";

export const mainMenu = new InlineKeyboard()
  .text("💰 Wallet", "wallet")
  .text("📊 Balance", "balance")
  .row()
  .text("🟢 Buy", "buy_help")
  .text("🔴 Sell", "sell_help")
  .row()
  .text("💧 Add LP", "lp_help")
  .text("🎴 Degen Mint", "degen_help")
  .row()
  .text("🪙 Mint Token", "mint_menu")
  .text("📜 Txs", "tx");
