# 📱 Menjalankan lexusagent di Termux / Debian

Panduan langkah demi langkah untuk menjalankan bot di HP (Termux) atau di dalam Debian proot.

---

## 🔹 Opsi A — Lewat Debian proot (disarankan)

Lebih stabil untuk Node + tooling. Kamu bilang Claude Code sudah ada di Debian, jadi ini paling pas.

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

### 5. Isi `.env`
```bash
nano .env
```
Minimal yang wajib diisi:
- `TELEGRAM_BOT_TOKEN` — dari [@BotFather](https://t.me/BotFather)
- `ALLOWED_USER_IDS` — ID Telegram kamu (dari [@userinfobot](https://t.me/userinfobot))
- `WALLET_ENCRYPTION_KEY` — string random panjang (lihat langkah 6)
- `AI_PROVIDER` — `claude` atau `agentrouter`
  - kalau `agentrouter`: isi `AGENTROUTER_API_KEY`
- `ZERODEV_PROJECT_ID`, `ZERODEV_BUNDLER_RPC`, `ZERODEV_PAYMASTER_RPC` — dari [dashboard.zerodev.app](https://dashboard.zerodev.app)

### 6. Generate WALLET_ENCRYPTION_KEY
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy hasilnya ke `WALLET_ENCRYPTION_KEY` di `.env`.

### 7. Pastikan otak AI jalan
- Kalau pakai Claude Code:
  ```bash
  claude -p "halo"
  ```
  Harus keluar balasan. Kalau `claude: command not found`, pastikan Claude Code terinstall & ada di PATH.
- Kalau pakai AgentRouter: cukup pastikan `AGENTROUTER_API_KEY` terisi.

### 8. Jalankan bot
```bash
npm start
```
Kalau muncul `🚗 lexusagent starting on chain=base-sepolia ...` → berhasil. Buka bot di Telegram, kirim `/start`.

---

## 🔹 Opsi B — Langsung di Termux (tanpa Debian)

### 1. Install paket
```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git
node -v
```

### 2. Clone & setup
```bash
cd ~
git clone https://github.com/sixdevilxd/lexusagent.git
cd lexusagent
bash scripts/setup-termux.sh
nano .env        # isi seperti langkah di atas
npm start
```

> Catatan: kalau `claude` cuma terinstall di Debian (bukan Termux murni), pakai **Opsi A**, atau set `AI_PROVIDER=agentrouter` supaya tidak butuh CLI `claude`.

---

## 🔄 Biar tetap jalan di background

Bot mati kalau sesi ketutup. Pakai `tmux` biar tetap hidup:

```bash
pkg install -y tmux         # (Termux)   atau: apt install -y tmux  (Debian)
tmux new -s lexus          # buat sesi
cd ~/lexusagent && npm start
# lepas sesi tanpa mematikan: tekan  Ctrl+b  lalu  d
```
Masuk lagi ke sesi:
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
| `claude: command not found` | Pakai Debian (Opsi A) atau set `AI_PROVIDER=agentrouter` |
| `node: command not found` | Install ulang nodejs (langkah 2) |
| Bot diam saja | Cek `ALLOWED_USER_IDS` sudah berisi ID Telegram kamu |
| Error import ZeroDev | SDK berubah versi — cek https://docs.zerodev.app, sesuaikan `src/wallet/zerodev.ts` |
| Proses mati saat layar mati | Aktifkan wakelock + matikan battery optimization Termux |
