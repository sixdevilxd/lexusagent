#!/data/data/com.termux/files/usr/bin/bash
# lexusagent - one-shot start/resume for Termux.
# Safe to run again any time. Usage:  bash ~/start.sh

APP="$HOME/lexusagent"
REPO="https://github.com/sixdevilxd/lexusagent.git"
DEB="$PREFIX/var/lib/proot-distro/installed-rootfs/debian/root/lexusagent"
SESSION="lexus"

say() { echo ""; echo "==> $*"; }
die() { echo ""; echo "!! $*"; exit 1; }

# --------------------------------------------------- 1. packages
say "Checking packages"
NEED=""
command -v node >/dev/null || NEED="$NEED nodejs-lts"
command -v git  >/dev/null || NEED="$NEED git"
command -v tmux >/dev/null || NEED="$NEED tmux"
if [ -n "$NEED" ]; then
  echo "installing:$NEED"
  pkg install -y $NEED || die "pkg install failed"
else
  echo "node $(node -v), git, tmux present"
fi

# --------------------------------------------------- 2. claude CLI
say "Checking claude CLI"
if command -v claude >/dev/null; then
  echo "claude: $(command -v claude)"
else
  echo "WARNING: claude not found in Termux."
  echo "The bot will start but the AI will not reply until this works."
  echo "Install with: npm install -g @anthropic-ai/claude-code"
fi

# --------------------------------------------------- 3. repo
say "Getting the code"
if [ -d "$APP/.git" ]; then
  cd "$APP" || die "cannot enter $APP"
  git fetch origin --quiet && git reset --hard origin/main --quiet
  echo "updated to $(git log --oneline -1)"
else
  git clone --quiet "$REPO" "$APP" || die "clone failed"
  cd "$APP" || die "cannot enter $APP"
  echo "cloned"
fi

# --------------------------------------------------- 4. env + wallets
say "Checking .env and wallet data"
if [ ! -f "$APP/.env" ] && [ -f "$DEB/.env" ]; then
  cp "$DEB/.env" "$APP/.env"
  echo "copied .env from the Debian install"
fi
if [ ! -d "$APP/data" ] && [ -d "$DEB/data" ]; then
  cp -r "$DEB/data" "$APP/data"
  echo "copied wallet data from the Debian install"
fi

if [ ! -f "$APP/.env" ]; then
  cp "$APP/.env.example" "$APP/.env"
  echo ""
  echo "No .env found, so a blank one was created."
  echo "Fill these in, then run this script again:"
  echo "   nano ~/lexusagent/.env"
  echo "   TELEGRAM_BOT_TOKEN=..."
  echo "   ALLOWED_USER_IDS=..."
  echo "   WALLET_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null)"
  exit 1
fi
mkdir -p "$APP/data" && chmod 700 "$APP/data"

# --------------------------------------------------- 5. provider
say "Setting AI provider to the local claude CLI"
if grep -q '^AI_PROVIDER=' "$APP/.env"; then
  sed -i 's|^AI_PROVIDER=.*|AI_PROVIDER=claude|' "$APP/.env"
else
  echo "AI_PROVIDER=claude" >> "$APP/.env"
fi
grep '^AI_PROVIDER=' "$APP/.env"

# --------------------------------------------------- 6. deps
say "Installing dependencies (may take a minute)"
npm install --silent || die "npm install failed"

# --------------------------------------------------- 7. run in tmux
say "Starting the bot"
if [ -n "$TMUX" ]; then
  echo "Already inside tmux - starting in the foreground."
  exec npm start
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already running - attaching."
else
  tmux new-session -d -s "$SESSION" -c "$APP" 'npm start; echo; echo "bot stopped - press enter"; read'
  echo "Started in tmux session '$SESSION'."
  sleep 2
fi

cat <<'TIPS'

---------------------------------------------
Attaching now. Inside tmux:
  detach (keeps running) : Ctrl+b  then  d
  come back later        : tmux attach -t lexus
  run this script again  : bash ~/start.sh

Also do this once:
  - Termux notification -> Acquire wakelock
  - Android settings -> Apps -> Termux -> Battery -> Unrestricted
---------------------------------------------
TIPS

sleep 2
tmux attach -t "$SESSION"
