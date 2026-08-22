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

# 4. Data dir for encrypted wallet storage
mkdir -p data
chmod 700 data

echo ""
echo "✅ Setup done."
echo "Next:"
echo "  1) Edit .env (TELEGRAM_BOT_TOKEN, WALLET_ENCRYPTION_KEY, ZeroDev keys...)"
echo "  2) Make sure 'claude' works:  claude -p 'hello'"
echo "  3) Run:  npm start"
