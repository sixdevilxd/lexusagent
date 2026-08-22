# 🐙 Connect GitHub (OAuth Device Flow)

`/github` menghubungkan akun GitHub kamu ke bot dengan **full access**, memakai
**OAuth Device Flow** — cocok untuk bot Telegram karena tidak butuh callback URL / web server.

---

## 1. Bikin OAuth App di GitHub

1. Buka [github.com/settings/developers](https://github.com/settings/developers)
2. **OAuth Apps** → **New OAuth App**
3. Isi:
   - **Application name**: `lexusagent`
   - **Homepage URL**: `https://github.com/sixdevilxd/lexusagent`
   - **Authorization callback URL**: `https://github.com/sixdevilxd/lexusagent`
     (tidak dipakai oleh device flow, tapi kolomnya wajib diisi)
4. **Register application**
5. ❗ Buka app-nya lagi → centang **Enable Device Flow** → **Update application**

> Tanpa **Enable Device Flow**, `/github` akan gagal dengan error
> `device_flow_disabled`.

---

## 2. Copy Client ID

Di halaman app, copy **Client ID** (bentuknya seperti `Ov23li...`).
Device Flow **tidak** membutuhkan client secret — jadi tidak ada secret yang perlu disimpan.

---

## 3. Masukkan ke `.env`

```env
GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX
```

Scope default sudah full access. Kalau mau dibatasi, isi `GITHUB_SCOPES` sendiri:
```env
GITHUB_SCOPES=repo,gist,user
```

Restart bot: `npm start`

---

## 4. Pakai

| Perintah | Fungsi |
|---|---|
| `/github` | Mulai koneksi — bot kasih kode, kamu masukkan di github.com/login/device |
| `/github status` | Lihat akun yang terhubung + repo terbaru |
| `/github logout` | Putuskan koneksi & hapus token |

Alurnya:
1. Kirim `/github`
2. Bot balas kode, misal `WDJB-MJHT`
3. Buka [github.com/login/device](https://github.com/login/device), masukkan kode
4. Approve → bot otomatis balas `✅ GitHub connected as <username>`

---

## 🔐 Keamanan

- Token disimpan **terenkripsi** (AES-256-GCM) di `data/github.json`, pakai `WALLET_ENCRYPTION_KEY`.
- `data/` sudah ada di `.gitignore` — token tidak akan ter-commit.
- Token ini punya **akses penuh** ke GitHub kamu. Selalu isi `ALLOWED_USER_IDS`
  supaya hanya kamu yang bisa memakai bot.
- Cabut kapan saja: `/github logout`, atau lewat
  [github.com/settings/applications](https://github.com/settings/applications).

---

## 🆘 Troubleshooting

| Error | Solusi |
|---|---|
| `GITHUB_CLIENT_ID not set` | Isi di `.env`, lalu restart |
| `device_flow_disabled` | Centang **Enable Device Flow** di OAuth App |
| `Code expired` | Kode berlaku ~15 menit — kirim `/github` lagi |
| `Authorization was denied` | Kamu menolak di halaman GitHub — ulangi |
| `Token invalid or revoked` | Kirim `/github logout` lalu `/github` |
