# Byga Agency

Kantor AI 3D interaktif dan pipeline konten TikTok, berdasarkan PRD **AI Agent Dashboard 3D Interaktif — Social Media**.

[Status implementasi](docs/STATUS.md) · [Panduan studio kreatif](docs/STUDIO.md) · [PRD sumber](docs/PRD.md) · [Hasil validasi](docs/VALIDATION.md) · [Screenshot studio](docs/studio-office.png) · [Chat desktop](docs/studio-chat-desktop.png) · [Chat mobile](docs/studio-chat-mobile.png)

Audit produksi terbaru: [gate rilis, syarat penerimaan dan pemulihan](docs/PRODUCTION.md). Kode telah diuji secara lokal; deployment tujuan dan integrasi eksternal tetap memerlukan bukti produksi.

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

Pilih Settings → **Masuk backend live**. Gunakan alamat host yang sesuai APP_URL; Vite mem-proxy `/api` ke Worker lokal. Backend live dimulai dengan data kosong. Tambahkan akun, pilih provider AI (OpenRouter, Cloudflare Workers AI, Gemini, NVIDIA NIM, Cohere, Hugging Face, Mistral, atau Groq), isi API key/token provider melalui Settings, pilih model, lalu generate caption dan prompt video. Model default terisi saat provider diganti dan tetap dapat diedit; lihat [daftar model dan aktivasi AI](docs/INTEGRATIONS.md#provider-ai). Workers AI memerlukan binding `AI` dan model `@cf/...`; tambahkan `"ai":{"binding":"AI"}` pada konfigurasi lokal atau gunakan `BYGA_ENABLE_WORKERS_AI=true` saat deploy. Tidak ada generator video otomatis.

Settings menyimpan key dengan AES-GCM di D1. Master key dan password login harus tetap menjadi **Worker secrets**; master key tidak dapat disimpan di database yang sama dengan ciphertext. Mengganti master key tanpa migrasi membuat key sebelumnya tidak dapat dibaca. Nilai key tidak dikembalikan oleh API. Sesi menggunakan cookie HttpOnly/SameSite, kadaluarsa 24 jam, login dibatasi 10 percobaan per 15 menit, mutasi memeriksa Origin. Proxy/host publik harus menggunakan HTTPS. Demo bukan sistem login untuk produksi.

## Kantor kreatif dan proyek bersama

Beranda menampilkan kantor 3D hangat dengan kayu, tanaman, area brainstorming dan produksi. Klik agen untuk chat bebas atau tindakan terpandu; panel ada di kanan pada desktop dan memenuhi layar mobile. Nama, peran, warna serta instruksi agen dapat diedit dari preset atau custom di Settings.

Mulai **Proyek baru**, isi brief yang tersimpan otomatis, lalu tinjau dan setujui setiap tahap: **brief → cerita → prompt gambar → prompt video → review → draft final**. Setiap agen punya chat sendiri dan memakai konteks bersama yang disetujui. Revisi per adegan mempertahankan hasil lain, menandai prompt terdampak untuk ditinjau ulang, dan menyimpan riwayat versi. Profil karakter cerita mendukung penampilan, pakaian dan referensi PNG/JPG/WebP. Proyek/riwayat dapat diekspor sebagai JSON.

Jalankan `npm run db:migrate:local` untuk menambahkan tabel studio dari `0004_creative_studio.sql` pada backend lokal. Deployment menjalankan migrasi sebelum deploy. Lihat [panduan studio, revisi dan API](docs/STUDIO.md).

## Generator prompt UGC cerita

Buka **Prompt UGC** di sidebar. Pilih akun draft, tulis ide cerita, produk/brand opsional, karakter, audiens dan gaya. Pilih 3–6 adegan dengan durasi 5, 8 atau 10 detik per adegan. Backend live menggunakan provider AI di Settings; demo membuat contoh template tanpa panggilan AI.

Storyboard memuat hook, alur cerita, acuan karakter/produk, negative prompt, narasi Indonesia serta prompt **text-to-image** dan **image-to-video** berbahasa Inggris per adegan. Prompt gambar menyertakan acuan karakter yang sama; prompt video melanjutkan gambar adegan tersebut sebagai frame awal. Salin setiap prompt/narasi, salin seluruh naskah, atau unduh `.txt`. Buat gambar dan video di tool eksternal, lalu rangkai dan tambahkan voice-over/subtitle saat editing.

Hasil tersimpan sebagai draft di Content library dan daftar Cerita tersimpan. Buka kembali untuk menyalin storyboard, mengedit caption/catatan produksi, atau pilih **Generate versi baru** untuk mengisi ulang brief. Generasi ulang membuat draft baru. Storyboard per adegan tetap merupakan hasil generator; edit lanjutan dapat dilakukan setelah diekspor. Tidak ada pembuatan gambar/video atau audio otomatis. Data storyboard memakai JSON konten yang ada tanpa migrasi baru.

## Pipeline dan integrasi

Generate caption/prompt → edit → upload video → review → approval → jadwal/publish. Kalender mendukung drag-and-drop dan zona waktu Settings. Persetujuan TikTok mengikat identitas akun, privasi, batas creator, deklarasi brand/AI dan consent.

Edit caption/prompt harus disimpan sebelum review atau approval; perubahan membatalkan pilihan consent yang sedang diisi. Backend memeriksa revisi konten dan mengembalikan HTTP 409 jika versi sudah berubah. Revisi/perubahan jadwal dan pembatalan antrean dilakukan dalam satu transaksi D1; pekerjaan yang sudah diambil publisher atau memiliki hasil remote belum pasti tetap dilindungi.

Kode OAuth, token refresh, upload resmi, antrean publish, retry/backoff dan pengecekan status tersedia. Cron tanpa credential memblokir pekerjaan; tidak memalsukan sukses. Riset resmi, Google Trends RSS, histori analytics, rekomendasi waktu/AI, antrean notifikasi dan retensi data tersedia. API/provider nyata belum diuji dengan credential pengguna.

Kantor membundel lima avatar manusia realistis bertekstur dengan lisensi MIT, animasi mengetik/membaca/presentasi, perpindahan melalui pintu dan koridor, tur kantor, serta kamera yang mengikuti Nova. Mode 3D ringan otomatis aktif pada mobile dan renderer software: resolusi render dikurangi dan shadow dinonaktifkan; tombol kualitas dapat mengubahnya. Model GLB kustom tetap didukung. Lihat [avatar dan gerakan kantor](docs/AVATARS.md). Furnitur masih prosedural dan performa perangkat mobile fisik belum diukur. Integrasi produksi tetap memerlukan credential dan validasi nyata.

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

Terapkan seluruh migrasi hingga `0004_creative_studio.sql` sebelum menjalankan Worker versi ini, termasuk pada backend lokal (`npm run db:migrate:local`). Cron menyimpan receipt setiap occurrence selama 30 hari untuk mencegah eksekusi ulang event yang sama. Kegagalan dicatat, lalu pekerjaan periodik berikutnya melanjutkan antrean; occurrence yang telah dimulai tidak diulang otomatis. Notifikasi memakai lease per pekerjaan untuk mencegah pengiriman paralel. Pengiriman ulang setelah timeout/crash tetap dapat menghasilkan notifikasi duplikat jika provider sudah menerima pesan.

Binding D1/R2/assets berasal dari tipe hasil Wrangler di `worker/bindings.d.ts`; jalankan `npm run worker:types` setelah mengubah bindings. Binding AI tetap opsional karena diaktifkan saat deploy.

Workflow GitHub memvalidasi PR dan push `main` dengan unit/integration tests, typecheck, build, dan E2E Chromium. Setiap push `main` langsung deploy ke **production** setelah seluruh validasi lulus, tanpa variable `BYGA_DEPLOY_ENABLED`. Deploy juga dapat dijalankan melalui Actions → Validate and deploy → Run workflow pada branch `main`; pemicu manual pada branch lain hanya menjalankan validasi. Deployment production berjalan satu per satu agar migrasi dan deploy tidak tumpang tindih.

Konfigurasi GitHub di repository atau environment `production`:

| Jenis             | Nama                        | Isi                                                                           |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Secret            | `CLOUDFLARE_API_TOKEN`      | Token untuk deploy Workers, migrasi D1, dan akses binding R2 pada akun tujuan |
| Variable          | `CLOUDFLARE_ACCOUNT_ID`     | ID akun Cloudflare production                                                 |
| Variable          | `CLOUDFLARE_D1_DATABASE_ID` | UUID database D1 `byga-agency` production                                     |
| Variable opsional | `BYGA_ENABLE_WORKERS_AI`    | `true` untuk mengaktifkan binding Workers AI                                  |

Provision D1/R2 dan set Worker secrets `DASHBOARD_PASSWORD` serta `ENCRYPTION_KEY` sebelum deployment pertama. Workflow gagal dengan pesan konfigurasi yang hilang jika token/account/database belum tersedia. Untuk deployment langsung, environment `production` harus mengizinkan branch `main` dan tidak memerlukan approval manual. Script menerapkan migrasi D1 sebelum mengunggah Worker dan frontend. Hubungkan custom domain `agency.muidsoft.com` lewat pengaturan Worker setelah deploy. Menyimpan perubahan workflow secara lokal belum mengaktifkan pipeline; perubahan harus masuk ke `main` GitHub.
