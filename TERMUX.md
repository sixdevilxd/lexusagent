# 📱 Menjalankan lexusagent di Termux / Debian

Panduan langkah demi langkah untuk menjalankan bot di HP (Termux) atau di dalam Debian proot.

---

## 🔹 Opsi A — Lewat Debian proot (disarankan)

Lebih stabil untuk Node + tooling. Kalau Claude Code kamu ada di Debian, ini paling pas.

### 1. Masuk ke Debian
```bash
proot-distro login debian
```

### 2. Install dependency dasar
```bash
apt update && apt upgrade -y
apt install -y nodejs npm git curl
node -v   # pastikan v20+
```
> Kalau versi node < 20, install Node 20 via nvm:
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
> source ~/.bashrc
> nvm install 20 && nvm use 20
> ```

### 3. Clone repo
```bash
cd ~
git clone https://github.com/sixdevilxd/lexusagent.git
cd lexusagent
```

### 4. Setup otomatis
```bash
bash scripts/setup-termux.sh
```
Ini akan install dependency npm, bikin `.env`, dan folder `data/`.

### 5. Generate WALLET_ENCRYPTION_KEY
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy hasilnya untuk dipakai di langkah berikutnya.

### 6. Isi `.env`
```bash
nano .env
```
Minimal yang wajib diisi:
- `TELEGRAM_BOT_TOKEN` — dari [@BotFather](https://t.me/BotFather)
- `ALLOWED_USER_IDS` — ID Telegram kamu (dari [@userinfobot](https://t.me/userinfobot))
- `WALLET_ENCRYPTION_KEY` — hasil langkah 5
- `AI_PROVIDER` — `claude`, `agentrouter`, atau `agentrouter-claude`
- `ZERODEV_PROJECT_ID`, `ZERODEV_BUNDLER_RPC`, `ZERODEV_PAYMASTER_RPC` — dari [dashboard.zerodev.app](https://dashboard.zerodev.app)

### 7. Pastikan otak AI jalan

Pilih salah satu dari 3 cara di bawah, lalu lanjut ke langkah 8.

---

## 🧠 Tiga cara pakai AI (pilih satu)

### Cara 1 — Claude Code CLI (langganan Claude kamu sendiri)
```env
AI_PROVIDER=claude
```
Tes:
```bash
claude -p "halo"
```

### Cara 2 — Claude Code CLI **pakai key AgentRouter**
Arahkan Claude Code ke AgentRouter (protokol Anthropic, base URL **tanpa** `/v1`):
```bash
export ANTHROPIC_AUTH_TOKEN="API_KEY_AGENTROUTER"
export ANTHROPIC_BASE_URL="https://agentrouter.org"
export ANTHROPIC_MODEL="claude-opus-4-6"
```
Biar permanen, tambahkan ke `~/.bashrc`:
```bash
echo 'export ANTHROPIC_AUTH_TOKEN="API_KEY_AGENTROUTER"' >> ~/.bashrc
echo 'export ANTHROPIC_BASE_URL="https://agentrouter.org"' >> ~/.bashrc
echo 'export ANTHROPIC_MODEL="claude-opus-4-6"'          >> ~/.bashrc
source ~/.bashrc
```
Tes: `claude -p "halo"` — lalu set `AI_PROVIDER=claude` di `.env`.

> ⚠️ Kalau kamu pernah login akun Claude Pro/Max, env var ini akan menimpa login langganan.
> Untuk balik: `unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL ANTHROPIC_MODEL`

### Cara 3 — Langsung API AgentRouter (tanpa CLI `claude`)
Paling ringan, tidak butuh Claude Code sama sekali.

Protokol Anthropic:
```env
AI_PROVIDER=agentrouter-claude
AGENTROUTER_API_KEY=api_key_kamu
AGENTROUTER_CLAUDE_MODEL=claude-opus-4-6
```

Atau protokol OpenAI-compatible:
```env
AI_PROVIDER=agentrouter
AGENTROUTER_API_KEY=api_key_kamu
AGENTROUTER_MODEL=gpt-5.5
```

Tes key-nya langsung dari terminal:
```bash
curl https://agentrouter.org/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer API_KEY_AGENTROUTER" \
  -d '{"model":"gpt-5.5","messages":[{"role":"user","content":"balas OK saja"}]}'
```

| Protokol | Base URL | Model |
|---|---|---|
| Anthropic | `https://agentrouter.org` (tanpa `/v1`) | `claude-opus-4-6` / `-4-7` / `-4-8` |
| OpenAI Compatible | `https://agentrouter.org/v1` | `gpt-5.5`, `glm-5.2` |

> Jangan campur kedua base URL tersebut.

---

### 8. Jalankan bot
```bash
npm start
```
Kalau muncul `🚗 lexusagent starting on chain=base-sepolia ...` → berhasil. Buka bot di Telegram, kirim `/start`.

---

## 🔹 Opsi B — Langsung di Termux (tanpa Debian)

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git
node -v

cd ~
git clone https://github.com/sixdevilxd/lexusagent.git
cd lexusagent
bash scripts/setup-termux.sh
nano .env        # isi seperti langkah di atas
npm start
```

> Kalau `claude` cuma terinstall di Debian (bukan Termux murni), pakai **Opsi A**, atau pakai **Cara 3** (`AI_PROVIDER=agentrouter`) supaya tidak butuh CLI `claude`.

---

## 🔄 Biar tetap jalan di background

```bash
pkg install -y tmux         # (Termux)   atau: apt install -y tmux  (Debian)
tmux new -s lexus
cd ~/lexusagent && npm start
# lepas sesi tanpa mematikan: tekan  Ctrl+b  lalu  d
```
Masuk lagi:
```bash
tmux attach -t lexus
```

Alternatif cepat:
```bash
nohup npm start > bot.log 2>&1 &
tail -f bot.log
```

> Tips: aktifkan **Acquire wakelock** di notifikasi Termux + matikan optimasi baterai untuk Termux, biar Android tidak membunuh prosesnya.

---

## 🧪 Uji cepat
1. `/start` — muncul menu
2. `/wallet` — dapat alamat Smart Account (ZeroDev)
3. Ketik pesan biasa — dibalas AI
4. `/balance` — cek saldo (isi dulu Smart Account-nya di testnet)
5. `/mint <url>` — wizard mint token

---

## 🆘 Troubleshooting
| Masalah | Solusi |
|---|---|
| `Missing required env var: ...` | Ada field wajib di `.env` yang kosong |
| `claude: command not found` | Pakai Debian (Opsi A) atau pakai Cara 3 (`AI_PROVIDER=agentrouter`) |
| `AgentRouter 401` | API key salah / habis kuota — cek di agentrouter.org/console/token |
| `AgentRouter 404` | Base URL ketuker — Anthropic tanpa `/v1`, OpenAI pakai `/v1` |
| `node: command not found` | Install ulang nodejs (langkah 2) |
| Bot diam saja | Cek `ALLOWED_USER_IDS` sudah berisi ID Telegram kamu |
| Error import ZeroDev | SDK berubah versi — cek https://docs.zerodev.app, sesuaikan `src/wallet/zerodev.ts` |
| Proses mati saat layar mati | Aktifkan wakelock + matikan battery optimization Termux |
