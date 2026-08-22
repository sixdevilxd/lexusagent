#!/usr/bin/env bash
set -e

echo "== lexusagent setup (Termux / Debian) =="

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js..."
  if command -v pkg >/dev/null 2>&1; then
    pkg install -y nodejs-lts git
  else
    sudo apt-get update && sudo apt-get install -y nodejs npm git
  fi
fi
echo "Node: $(node -v)"

# 2. Dependencies
npm install

# 3. Env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — edit it with your tokens before running."
fi

# 4. Auto-generate the wallet encryption key if it's still empty
if ! grep -q '^WALLET_ENCRYPTION_KEY=.\+' .env; then
  KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  if grep -q '^WALLET_ENCRYPTION_KEY=' .env; then
    sed -i "s|^WALLET_ENCRYPTION_KEY=.*|WALLET_ENCRYPTION_KEY=$KEY|" .env
  else
    echo "WALLET_ENCRYPTION_KEY=$KEY" >> .env
  fi
  echo "Generated WALLET_ENCRYPTION_KEY (back this up — wallets are unrecoverable without it)."
fi

# 5. Data dir for encrypted wallet storage
mkdir -p data
chmod 700 data

echo ""
echo "✅ Setup done."
echo "Next:"
echo "  1) Edit .env (TELEGRAM_BOT_TOKEN, ALLOWED_USER_IDS, AGENTROUTER_API_KEY, ZERODEV_RPC...)"
echo "  2) Run:  npm start"
