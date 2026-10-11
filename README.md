# Byga Agency

Kantor AI 3D interaktif dan pipeline konten TikTok, berdasarkan PRD **AI Agent Dashboard 3D Interaktif — Social Media**.

[PRD sumber](docs/PRD.md) · [Hasil validasi](docs/VALIDATION.md) · [Screenshot desktop](docs/office-avatars.png) · [Screenshot mobile](docs/office-avatars-mobile.png)

## Jalankan dashboard

Node.js 22 atau 24. Checkout ini adalah workspace utama; tidak memerlukan Git worktree.

```sh
npm ci
npm run dev -- --port 5173
```

Default adalah **demo lokal**. Data akun, draft, jadwal, referensi, dan settings disimpan dalam localStorage; file video asli disimpan dalam IndexedDB. Demo tidak memanggil AI, TikTok, atau notifikasi. Metrik contoh diberi label demo. Data demo dan live terpisah. Browser yang tidak mendukung WebGL mendapat denah 2D dengan navigasi ruang yang sama.

## Backend Cloudflare lokal

```sh
cp .dev.vars.example .dev.vars
# Isi DASHBOARD_PASSWORD dan ENCRYPTION_KEY unik, minimal 32 karakter untuk key.
npm run build
npm run db:migrate:local
npm run worker:dev -- --port 8787
# Terminal lain:
npm run dev -- --port 5173
```

Pilih Settings → **Masuk backend live**. Gunakan alamat host yang sesuai APP_URL; Vite mem-proxy `/api` ke Worker lokal. Backend live dimulai dengan data kosong. Tambahkan akun, isi API key OpenRouter melalui Settings, pilih model, lalu generate caption dan prompt video. Workers AI memerlukan binding `AI` dan model `@cf/...`; tambahkan `"ai":{"binding":"AI"}` pada konfigurasi lokal atau gunakan `BYGA_ENABLE_WORKERS_AI=true` saat deploy. Tidak ada generator video otomatis.

Settings menyimpan key dengan AES-GCM di D1. Master key dan password login harus tetap menjadi **Worker secrets**; master key tidak dapat disimpan di database yang sama dengan ciphertext. Mengganti master key tanpa migrasi membuat key sebelumnya tidak dapat dibaca. Nilai key tidak dikembalikan oleh API. Sesi menggunakan cookie HttpOnly/SameSite, kadaluarsa 24 jam, login dibatasi 10 percobaan per 15 menit, mutasi memeriksa Origin. Proxy/host publik harus menggunakan HTTPS. Demo bukan sistem login untuk produksi.

## Pipeline dan integrasi

Generate caption/prompt → edit → upload video → review → approval → jadwal/publish. Kalender mendukung drag-and-drop dan zona waktu Settings. Persetujuan TikTok mengikat identitas akun, privasi, batas creator, deklarasi brand/AI dan consent.

Kode OAuth, token refresh, upload resmi, antrean publish, retry/backoff dan pengecekan status tersedia. Cron tanpa credential memblokir pekerjaan; tidak memalsukan sukses. Riset resmi, Google Trends RSS, histori analytics, rekomendasi waktu/AI, antrean notifikasi dan retensi data tersedia. API/provider nyata belum diuji dengan credential pengguna.

Kantor membundel lima avatar manusia realistis bertekstur dengan lisensi MIT, animasi mengetik/membaca/presentasi, perpindahan melalui pintu dan koridor, tur kantor, serta kamera yang mengikuti Nova. Model GLB kustom tetap didukung. Lihat [avatar dan gerakan kantor](docs/AVATARS.md). Furnitur masih prosedural dan performa perangkat mobile fisik belum diukur. Integrasi produksi tetap memerlukan credential dan validasi nyata.

Lihat [panduan aktivasi API dan OAuth](docs/INTEGRATIONS.md). Anda dapat memasukkan credential dan mengatur aplikasi OAuth nanti melalui Settings. Login Kit dan Research API memerlukan akses produk yang berbeda.

## Uji

```sh
npm test                # aturan domain, AES-GCM, Worker/D1/R2 + API simulasi
npm run build           # typecheck frontend + backend dan build produksi
npm run test:e2e        # Chromium /usr/bin/chromium, dapat override CHROMIUM_PATH
```

E2E menguji draft → edit → upload → approval → jadwal, persistensi browser, blokir publish demo, multi-akun, referensi, navigasi/overflow mobile, revokasi approval, serta kontrol ruang/agent. Bila Chromium belum tersedia: `npx playwright install chromium` lalu set `CHROMIUM_PATH` ke executable browser yang terpasang. Pengujian demo tidak membuktikan TikTok atau AI provider live berfungsi.

Uji integrasi lokal tambahan: jalankan Worker dengan `--test-scheduled`, lalu `node scripts/smoke-local.mjs`. Script membaca credential lokal tanpa menampilkannya, membuat data uji sementara, memvalidasi API/D1/R2/Cron, lalu membersihkannya. `/__scheduled` hanya diaktifkan oleh Wrangler dalam mode pengujian lokal; produksi mengembalikan 404.

## Deploy

Provision D1 bernama `byga-agency` dan R2 `byga-agency-assets` pada akun Cloudflare Anda. Isi `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_ACCOUNT_ID`, dan token Cloudflare melalui kanal secret yang sesuai, jangan commit credential. Set Worker secrets `DASHBOARD_PASSWORD` dan `ENCRYPTION_KEY` menggunakan Wrangler atau dashboard Cloudflare. Lalu:

```sh
CLOUDFLARE_D1_DATABASE_ID=<database-uuid> npm run deploy
```

Script menghasilkan konfigurasi deploy di `.wrangler/`, menerapkan migrasi remote, dan deploy tanpa mengubah konfigurasi tracked. Untuk Workers AI gunakan `BYGA_ENABLE_WORKERS_AI=true`. Production cron: due jobs tiap 5 menit, riset dan analytics tiap jam, tren, draft berbasis referensi + retensi pukul 01:00 UTC (08:00 WIB). Frekuensi request/query serta biaya AI/R2 perlu dipantau; kuota gratis tidak diasumsikan tak terbatas.

Workflow GitHub memvalidasi PR/push `main`. Deploy otomatis baru aktif setelah repository variable `BYGA_DEPLOY_ENABLED=true`, database/account variables, secret token, Worker secrets, dan R2 tersedia. Gunakan environment protection `production` bila diperlukan. Hubungkan custom domain `agency.muidsoft.com` lewat pengaturan Worker setelah deploy. Tidak ada deployment atau publikasi yang dijalankan oleh setup proyek ini.
