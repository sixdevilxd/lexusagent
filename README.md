# 🚗 lexusagent

An **AI trading agent on Telegram**. The brain is **Claude Code** (local `claude` CLI) or **AgentRouter** (agentrouter.org API), and on-chain actions run through **ZeroDev smart accounts** (ERC-4337 account abstraction). Built to run on **Termux / Debian**.

```
User → Telegram → lexusagent (grammY bot)
                     ├── 🤖 AI chat      → Claude Code CLI  OR  AgentRouter API
                     ├── 💰 Wallet       → ZeroDev smart account
                     ├── 🟢 Buy / 🔴 Sell → DEX swap via UserOperation
                     ├── 📊 Balance      → native + ERC-20
                     └── 📜 Transactions → local history + explorer links
```

## ✨ Features
- **AI chat** — any plain message is forwarded to the AI and the reply comes back in Telegram.
- **Two AI providers** — switch with one env var (`AI_PROVIDER`):
  - `claude` — your local Claude Code CLI (`claude -p`), free.
  - `agentrouter` — AgentRouter OpenAI-compatible API (base URL fixed to `https://agentrouter.org/v1`).
- **Smart wallet** — auto-created per Telegram user, backed by a ZeroDev kernel account.
- **Buy / Sell** — Uniswap V3 style swaps executed as UserOperations (gas can be sponsored via a ZeroDev paymaster).
- **Balance** — native coin + any ERC-20.
- **Transaction history** — recent trades with explorer links.
- **Encrypted key storage** — private keys are encrypted at rest with AES-256-GCM.
- **Allowlist** — restrict the bot to specific Telegram user IDs.

## 🧠 AI provider (Claude Code or AgentRouter)
Pick the brain in `.env`:

```env
# Use the local Claude Code CLI (default)
AI_PROVIDER=claude

# --- or ---

# Use AgentRouter API
AI_PROVIDER=agentrouter
AGENTROUTER_API_KEY=your_key_from_agentrouter.org/console/token
AGENTROUTER_MODEL=gpt-5
```

> The AgentRouter base URL is **hardcoded to `https://agentrouter.org/v1`** in `src/config.ts` and cannot be pointed anywhere else, by design.

## 🧰 Prerequisites
- Node.js 20+
- For `claude` provider: `claude` (Claude Code) working in your shell — `claude -p "hello"`
- For `agentrouter` provider: an API key from https://agentrouter.org/console/token
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A [ZeroDev](https://dashboard.zerodev.app) project (Project ID + bundler/paymaster RPCs)

## 🚀 Quick start (Termux / Debian)
```bash
git clone https://github.com/sixdevilxd/lexusagent.git
cd lexusagent
bash scripts/setup-termux.sh
# edit .env with your tokens
npm start
```

## ⚙️ Configuration (`.env`)
Copy `.env.example` → `.env` and fill in:

| Variable | What it is |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `ALLOWED_USER_IDS` | Comma-separated Telegram user IDs allowed to use the bot |
| `AI_PROVIDER` | `claude` or `agentrouter` |
| `CLAUDE_CMD` / `CLAUDE_ARGS` | How to call Claude Code (default `claude -p`) |
| `AGENTROUTER_API_KEY` / `AGENTROUTER_MODEL` | AgentRouter key + model (base URL is fixed in code) |
| `CHAIN` / `RPC_URL` | Chain + RPC (default **base-sepolia** testnet) |
| `ZERODEV_PROJECT_ID` / `ZERODEV_BUNDLER_RPC` / `ZERODEV_PAYMASTER_RPC` | From the ZeroDev dashboard |
| `WALLET_ENCRYPTION_KEY` | Long random string used to encrypt private keys |
| `DEX_ROUTER` / `WETH_ADDRESS` | Uniswap V3 router + WETH for your chain |
| `DEFAULT_SLIPPAGE_BPS` | Default slippage (100 = 1%) |

## 💬 Commands
| Command | Action |
|---|---|
| `/start` | Menu |
| `/wallet` | Show / create your smart wallet |
| `/balance [token]` | Native + optional ERC-20 balance |
| `/buy <token> <amount>` | Buy a token |
| `/sell <token> <amount>` | Sell a token |
| `/tx` | Recent transactions |
| _any text_ | Ask the AI |

## 🔐 Security notes — READ THIS
- **Never commit `.env` or `data/`** — they hold your bot token, API keys, and encrypted wallet keys. (Already in `.gitignore`.)
- Private keys are encrypted with `WALLET_ENCRYPTION_KEY`. If you lose that key, wallets are unrecoverable; if it leaks, funds are at risk.
- **Defaults to `base-sepolia` testnet.** Test thoroughly before touching mainnet or real funds.
- `amountOutMinimum` is set to `0` in the scaffold (no slippage protection) — **wire up a Uniswap Quoter before mainnet** or you can be sandwiched.
- Always set `ALLOWED_USER_IDS` so strangers can't drain your bot.
- This is a **starter scaffold**, not audited financial software. Use at your own risk.

## 🛠️ Notes
- Runs directly with `tsx` (no build step needed). `npm run typecheck` for type checks.
- The ZeroDev SDK changes fast — if an import breaks, check https://docs.zerodev.app and adjust `src/wallet/zerodev.ts`.

## 📄 License
MIT — do whatever, no warranty.
