# ⛽ Setup ZeroDev Paymaster (Gas Sponsorship)

Paymaster = pihak yang **bayarin gas fee** transaksi user. Dengan ini, user bisa transaksi
**tanpa punya ETH sama sekali**.

> Paymaster ≠ Passkey. Paymaster mengurus *siapa yang bayar*, passkey mengurus *siapa yang tanda tangan*.
> lexusagent menandatangani transaksi dengan private key terenkripsi (ECDSA), bukan passkey.

---

## 1. Bikin project di ZeroDev

1. Buka [dashboard.zerodev.app](https://dashboard.zerodev.app) — login (bisa pakai Google/GitHub).
2. Klik **Create Project**.
3. Kasih nama, misal `lexusagent`.
4. Pilih **network** yang sama dengan `CHAIN` di `.env` kamu.
   Untuk testing pilih **Base Sepolia**.

> ⚠️ Satu project = satu network. Kalau nanti pindah ke mainnet, bikin project baru.

---

## 2. Aktifkan Gas Policy (WAJIB)

Tanpa langkah ini, paymaster **tidak akan** mensponsori transaksi apa pun.

1. Masuk ke menu **Gas Policies** di dashboard.
2. Pilih network project kamu.
3. Aktifkan **Sponsor all transactions**.

> Untuk produksi, sebaiknya bikin policy yang lebih ketat (limit per user / per hari)
> supaya saldo gas kamu tidak habis disedot orang.

---

## 3. Copy RPC URL

Di halaman utama project, copy **RPC URL**. Bentuknya:

```
https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/<CHAIN_ID>
```

Satu URL ini melayani **bundler dan paymaster** sekaligus (API v3).

| Network | Chain ID |
|---|---|
| Base Sepolia | `84532` |
| Base | `8453` |
| Ethereum Sepolia | `11155111` |
| Ethereum Mainnet | `1` |
| Arbitrum | `42161` |
| Optimism | `10` |
| Polygon | `137` |

---

## 4. Masukkan ke `.env`

```env
CHAIN=base-sepolia
RPC_URL=https://sepolia.base.org

ZERODEV_RPC=https://rpc.zerodev.app/api/v3/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/chain/84532
ZERODEV_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

`ZERODEV_BUNDLER_RPC` dan `ZERODEV_PAYMASTER_RPC` biarkan **kosong** — keduanya otomatis
memakai `ZERODEV_RPC`. Isi hanya kalau kamu memang mau memakai infra AA yang berbeda.

---

## 5. Tes

```bash
npm start
```
Lalu di Telegram:
```
/wallet
```
Kalau muncul alamat **Smart Account**, koneksi ZeroDev sudah jalan. ✅

Uji sponsorship dengan melakukan transaksi (`/mint` atau `/buy`) — kalau berhasil padahal
smart account tidak punya ETH, artinya paymaster bekerja.

---

## 🆘 Troubleshooting

| Error | Penyebab / Solusi |
|---|---|
| `ZERODEV_RPC not set in .env` | Belum diisi — lihat langkah 3 |
| `AA33 reverted` / paymaster rejected | Gas Policy belum diaktifkan (langkah 2) |
| `chain mismatch` | Chain ID di URL tidak sama dengan `CHAIN` di `.env` |
| `AA21 didn't pay prefund` | Paymaster tidak aktif **dan** smart account tidak punya ETH |
| Kuota habis | Cek limit di dashboard — free tier punya batas |

---

## 💡 Catatan

- Testnet (Base Sepolia) gratis — sempurna untuk uji coba.
- Di mainnet, saldo gas paymaster **kamu yang top up**. Selalu pasang limit di Gas Policy.
- Selalu isi `ALLOWED_USER_IDS` di `.env` supaya orang asing tidak ikut memakai kuota gas kamu.
