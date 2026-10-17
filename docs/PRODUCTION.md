# Kesiapan produksi — 17 Oktober 2026

Status: kandidat rilis MVP untuk satu workspace/pemilik. Kelulusan kode dan pengujian lokal tidak membuktikan deployment tujuan, izin TikTok, atau provider eksternal nyata.

## Gate rilis

| Kriteria           | Pemeriksaan                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Dependency         | `npm ci` dan `npm audit --audit-level=moderate`                                                                            |
| Perilaku aplikasi  | `npm test` dan `npm run test:e2e`                                                                                          |
| Tipe dan bundle    | `npm run build` dan `npm run worker:check`                                                                                 |
| Konfigurasi deploy | UUID D1, HTTPS origin dan keberadaan nama secrets diperiksa sebelum migrasi; paket harus lolos dry-run                     |
| Resource aplikasi  | `/api/ready`: panjang secrets, akses/schema D1, settings, serta akses baca R2; gagal dengan HTTP 503 tanpa detail internal |
| Browser produksi   | `npm run test:production` pada server build: lima avatar, navigasi, CSP tanpa pelanggaran, cache aset, readiness           |
| Setelah deploy     | Workflow menjalankan `npm run check:ready` ke `BYGA_APP_URL` dan gagal jika endpoint tidak siap                            |

`/api/health` hanya liveness. Readiness tidak membuktikan kecocokan master key dengan seluruh ciphertext, akses tulis R2, kuota, atau kemampuan provider AI/TikTok. Gunakan interval monitor 1–5 menit agar query D1/R2 terkendali.

Frontend memakai CSP yang mengizinkan WebAssembly untuk decoder model 3D, tetapi melarang JavaScript eval. Zod memakai mode `jitless`. Header anti-framing, nosniff, pembatasan perangkat dan referrer ditambahkan; aset build berhash memakai cache immutable.

Tooling dipasang pada versi yang diuji. Tes integrasi tetap memakai Miniflare 4 untuk kontrak `createFetchMock`; override `sharp` dan `undici` memasang patch keamanan. Wrangler terbaru memakai Miniflare 5 internal. Tinjau ulang override ketika memperbarui Miniflare.

Untuk menguji browser produksi, build lalu jalankan Worker lokal dengan database/R2 dan secrets uji terpisah, seluruh migrasi, serta APP_URL sesuai server. Script tidak menyalakan server sendiri:

```sh
BYGA_SMOKE_BASE_URL=http://127.0.0.1:8788 npm run test:production
```

Pakai `CHROMIUM_PATH` bila executable Chromium berbeda. Jangan arahkan tes ini ke Vite development server karena header dan aset produksi memang berbeda.

## Penerimaan di lingkungan produksi

Sebelum menyatakan seluruh integrasi siap, simpan bukti berikut dari akun tujuan:

1. Workflow pada commit rilis lulus, readiness domain HTTPS sehat, dan login live berhasil.
2. D1/R2 sesuai akun tujuan dan migrasi `0001`–`0004` diterapkan. Upload, baca/seek, serta hapus file uji yang tidak digunakan berhasil. Worker secrets unik tersedia; jangan mengganti `ENCRYPTION_KEY` tanpa migrasi credential terenkripsi.
3. Provider/model AI menghasilkan satu draft/storyboard valid. Periksa biaya, batas request dan kualitas; kontrak tes memakai simulasi.
4. Izin aplikasi TikTok tersedia. Dengan persetujuan pemilik video, uji OAuth → upload/review → consent → publish → konfirmasi status → analytics. Jangan mengulang publish ketika hasil remote belum pasti.
5. Jika diaktifkan, uji Research API dan notifikasi ke tujuan yang disetujui; periksa cron/retry dan kemungkinan duplikat.
6. Uji pemulihan backup di lingkungan terpisah, siapkan pemantauan error/cron, dan ukur kantor 3D pada HP target.

Audit kode ini tidak melakukan posting TikTok atau mengirim notifikasi nyata. Item yang belum memiliki bukti tidak dinyatakan lulus.

## Operasi dan pemulihan

Deployment `main` mengikuti validasi; job production diserialkan. Script memeriksa nama secrets dan dry-run sebelum migrasi, lalu mengunggah Worker/frontend. Nilai/panjang secrets diperiksa readiness setelah deploy. Jika gate setelah deploy gagal, rilis mungkin sudah terunggah: gate tidak otomatis melakukan rollback.

Sebelum perubahan database berisiko, ekspor D1 dari konfigurasi akun tujuan:

```sh
npx wrangler d1 export byga-agency --remote --config .wrangler/deploy.json --output /secure/path/byga-backup.sql
```

Simpan backup terbatas di luar repo; isinya mencakup data aplikasi dan credential terenkripsi. Kelola salinan master key melalui pengelolaan secrets. Backup D1 tidak mencakup objek R2: cadangkan media terpisah dan uji pemulihan keduanya. Tetapkan retensi serta target pemulihan sesuai kebutuhan bisnis.

Gunakan riwayat deployment Cloudflare atau `npx wrangler rollback --config .wrangler/deploy.json` bila Worker baru bermasalah. Pastikan versi lama kompatibel dengan schema saat ini. Rollback Worker tidak membatalkan migrasi D1 atau memulihkan objek R2; nilai kehilangan data sesudah backup sebelum memulihkan database.

Pantau HTTP 5xx/503, kegagalan cron, antrean publish/retry tertahan, kuota provider, serta penggunaan D1/R2. Periksa akun dan resource tujuan sebelum operasi remote.
