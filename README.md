# Web2APK Panel

Panel web (gaya Discord) + bot Telegram (full inline button) untuk submit &
memantau build APK. Hasil build yang dikirim ke user selalu berasal dari
GitHub Actions run yang asli — bukan progress bar palsu dan file dummy.

## Yang berubah dari versi sebelumnya

- Token & branding (judul situs, nama owner, channel, foto menu bot) semua
  lewat environment variable — tidak ada yang hardcode di source code.
- Password user web di-hash (bcrypt); session pakai cookie JWT (stateless,
  cocok untuk serverless).
- Bot Telegram jalan via webhook, dan **seluruh navigasinya lewat inline
  button** (bukan lagi reply keyboard teks) — menu utama tampil sebagai satu
  foto banner dengan caption & tombol yang berganti-ganti sesuai aksi.
- Simulasi build dihapus total. Build sungguhan didorong lewat
  `workflow_dispatch` ke repo kamu, dan repo itu sendiri yang lapor balik ke
  panel saat run-nya selesai (lihat `workflow-example/build.yml`), lengkap
  dengan artifact APK asli.
- **Database = file JSON di repo GitHub**, dibaca/ditulis lewat GitHub
  Contents API. Tidak butuh Vercel KV atau database server terpisah — cukup
  token GitHub yang sudah kamu punya. Cocok untuk skala kecil-menengah;
  kalau trafiknya sudah ramai, ini bagian pertama yang perlu diganti ke
  database sungguhan (lihat catatan di `lib/db.js`).

## 1. Siapkan repo build APK kamu

1. Copy `workflow-example/build.yml` ke `.github/workflows/build.yml` di repo
   build APK kamu (mis. `akuranamaj/web2apk-builder`).
2. Ganti step "Build placeholder" dengan proses build asli (Flutter/Cordova/dll)
   sampai menghasilkan file `.apk`.
3. Tambah repository secret `BUILD_CALLBACK_SECRET` di Settings → Secrets and
   variables → Actions, isinya harus **sama persis** dengan `BUILD_CALLBACK_SECRET`
   di `.env` panel ini.

## 2. Siapkan repo penyimpanan data

Bisa pakai repo yang sama dengan repo build, atau bikin repo baru khusus
(disarankan **private**) untuk `data/db.json`. Isi `GITHUB_DB_OWNER` /
`GITHUB_DB_REPO` di `.env` — kalau dikosongkan otomatis ikut repo build.
Token GitHub kamu (`GITHUB_TOKEN`) perlu scope `repo` supaya bisa baca/tulis
file ini.

## 3. Isi environment variables

Copy `.env.example` ke `.env`, isi semuanya — termasuk branding
(`SITE_TITLE`, `SITE_NAME`, `OWNER_NAME`, `BOT_MENU_PHOTO_URL`,
`CHANNEL_USERNAME`, `CHANNEL_URL`).

## 4. Deploy ke Vercel

```bash
npm install -g vercel
vercel
```

Masukkan semua environment variable dari `.env` ke Vercel (Project Settings →
Environment Variables), termasuk `PUBLIC_URL` (URL yang diberikan Vercel
setelah deploy pertama). Redeploy setelah `PUBLIC_URL` diisi.

## 5. Pasang webhook Telegram

Sekali saja, dari komputer kamu:

```bash
npm install
npm run set-webhook
```

## Development lokal

```bash
npm install
npm run dev
```

Web panel jalan di `http://localhost:3000`, bot jalan mode long polling
(khusus development).

## Struktur

```
api/index.js        Express app: auth, dashboard API, branding, build-callback
api/telegram.js      Webhook Telegram (dipetakan dari /bot/webhook)
lib/                 config, storage (GitHub JSON), auth, integrasi GitHub, logic bot
public/              halaman & aset statis (gaya Discord)
workflow-example/    contoh build.yml untuk repo build APK kamu
```
