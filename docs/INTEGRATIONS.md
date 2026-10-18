# Mengaktifkan integrasi setelah coding

Kode dapat dikembangkan dan diuji tanpa API key. Mode demo tidak mengirim posting atau notifikasi. Tes integrasi memakai API simulasi dengan seluruh jaringan keluar dimatikan.

## Monitoring TikTok: B (API read-only) + A (profil publik)

1. Mode **B** memakai TikTok Login Kit dan Display API. Daftarkan aplikasi di TikTok Developers, aktifkan produk tersebut dan daftarkan callback HTTPS `https://agency.muidsoft.com/api/tiktok/callback`.
2. Simpan client key dan client secret di Settings backend live, lalu hubungkan masing-masing akun TikTok yang Anda miliki/diizinkan. OAuth baru meminta **`user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`**. Izin tambahan hanya diberikan jika disetujui TikTok/pemilik akun. Tidak meminta `video.publish` atau `video.upload` pada koneksi baru.
3. Di Settings > Akun TikTok > Monitoring, mode B otomatis mencoba profil/statistik/video melalui API resmi. Saat credential belum ada, login/izin ditolak, token kedaluwarsa, atau API gagal, panel otomatis menampilkan **mode A** (Creator Profile Embed) untuk akun publik. Mode A juga bisa dipilih manual dan tidak memakai kredensial, scraping, atau data statistik palsu.
4. Creator Profile Embed berasal langsung dari domain TikTok melalui `https://www.tiktok.com/embed.js`, dan dapat dibatasi pada akun privat/di bawah umur, kebijakan browser, atau pengaturan TikTok. Dalam semua kondisi, tersedia tautan buka profil. Tidak ada jaminan seluruh statistik tersedia di mode A.
5. **Mode monitoring ini tidak memicu posting.** Pipeline publishing lama masih ada di kode untuk kompatibilitas; koneksi OAuth baru tidak memberinya izin publish. Jangan gunakan aksi publish/schedule lama ketika tujuan Anda hanya monitoring. Untuk menghilangkan izin publish yang diberikan sebelumnya, putuskan akun lalu hubungkan ulang dengan scope read-only.
   
Token disimpan terenkripsi, refresh otomatis memakai lease D1. OAuth state sekali pakai terikat ke sesi login dan cookie. Menghubungkan creator berbeda membatalkan kelayakan approval sebelumnya; konten perlu direview ulang.

Simpan edit sebelum approval. Pilihan consent direset ketika caption/prompt yang tersimpan berubah. Request edit/transition dari dashboard membawa `expectedRevision`; final approval TikTok juga wajib membawa identitas creator yang ditampilkan form. Respons 409 berarti konten atau antrean berubah dan harus diperiksa ulang. Pergantian creator saat OAuth/reconnect memblokir approval/publish, termasuk jika terjadi di antara pemeriksaan awal dan init. Pekerjaan yang telah diambil publisher tidak dapat direvisi/dihapus saat berjalan.

Antrean unik per konten menghindari pengiriman berulang dari klik atau cron. Penolakan sementara yang diketahui diulang dengan exponential backoff, maksimum lima percobaan. Timeout/HTTP 5xx saat init bisa berarti TikTok menerima permintaan: job menjadi `uncertain`, tidak membuat post kedua. Jika publish ID sudah tersimpan, tombol periksa status memakai ID itu. Untuk ketidakpastian tanpa ID, periksa akun TikTok sebelum tindakan manual; tidak ada tombol retry buta.

## Research API

Research API adalah produk terpisah dengan persyaratan kelayakan TikTok. Login Kit tidak memberikan akses riset kompetitor. Masukkan credential Research API yang benar dan aktifkan riset di Settings. Tanpa akses tersebut, hasil tetap kosong dan status menjelaskan kegagalan; tidak ada scraper atau metrik palsu.

Cron memeriksa maksimal lima referensi per jam, bergiliran. Pagination dan jendela tanggal tersimpan. Data API riset dapat tertunda dari platform. Tren hashtag berasal dari sampel akun yang dipantau, bukan klaim seluruh TikTok. Google Trends RSS Indonesia opsional disinkronkan harian. Hasil riset dapat dipilih sebagai referensi generate caption/prompt.

## Provider AI

Delapan provider tersedia di Settings → AI & otomasi. Setiap provider menyediakan **tepat dua model**, dengan nama yang mudah dibaca, ID model dan deskripsi. Mengganti provider memilih model default; backend menolak model yang bukan milik provider tersebut. Semua fitur teks menggunakan pilihan yang disimpan.

| Provider | Model default | Pilihan kedua | Credential |
| --- | --- | --- | --- |
| OpenRouter | `openai/gpt-4o-mini` | `openai/gpt-4.1-mini` | OpenRouter API key |
| Cloudflare Workers AI | `@cf/meta/llama-3.1-8b-instruct-fast` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Binding `AI` |
| Gemini | `gemini-2.5-flash-lite` | `gemini-2.5-flash` | Gemini API key |
| NVIDIA NIM | `meta/llama-3.1-8b-instruct` | `meta/llama-3.3-70b-instruct` | NVIDIA NIM API key |
| Cohere | `command-a-03-2025` | `command-r-08-2024` | Cohere API key |
| Hugging Face | `meta-llama/Llama-3.3-70B-Instruct` | `Qwen/Qwen2.5-72B-Instruct` | Token dengan izin Inference Providers |
| Mistral | `mistral-small-latest` | `mistral-large-latest` | Mistral API key |
| Groq | `openai/gpt-oss-120b` | `openai/gpt-oss-20b` | Groq API key |

Katalog frontend dan backend berasal dari `src/aiProviders.ts`. Pengaturan lama dibaca dengan normalisasi tanpa menghapus konten atau credential: model di luar katalog kembali ke default provider, sedangkan Groq `llama-3.1-8b-instant` diarahkan ke GPT OSS 20B. Model kedua yang valid tetap dipertahankan. Normalisasi bukan fallback saat request: kegagalan API tetap ditampilkan dan tidak otomatis mengganti provider/model.

Sumber katalog: [OpenRouter](https://openrouter.ai/models), [Cloudflare](https://developers.cloudflare.com/workers-ai/models/), [Gemini](https://ai.google.dev/gemini-api/docs/models), [NVIDIA](https://docs.api.nvidia.com/nim/reference/llm-apis), [Cohere](https://docs.cohere.com/docs/models), [Hugging Face](https://huggingface.co/docs/inference-providers/index), [Mistral](https://docs.mistral.ai/models/), dan [Groq](https://console.groq.com/docs/models). Model Groq lama diganti mengikuti [penghentian layanan 16 Agustus 2026](https://console.groq.com/docs/deprecations). Ketersediaan, akses, dan kuota aktual mengikuti akun provider.

Groq GPT OSS memakai `reasoning_effort: low`, `include_reasoning: false` dan tambahan budget 4.096 token agar penalaran tidak menghabiskan ruang JSON akhir. Gemini menonaktifkan thinking untuk kedua model Flash agar budget keluaran dipakai hasil konten.

Credential disimpan terenkripsi di D1 dan tidak dikembalikan ke browser; form kosong mempertahankan credential tersimpan. Mode demo tidak menyimpan key dan tidak memanggil provider. Tidak perlu migrasi database baru. Cloudflare Workers AI memerlukan binding `AI` (opsi deploy `BYGA_ENABLE_WORKERS_AI=true`). NVIDIA NIM menggunakan API hosted, bukan endpoint NIM self-hosted.

Gemini menggunakan `generateContent`, Cohere menggunakan Chat API v2, dan provider lainnya menggunakan endpoint chat completions masing-masing. Hugging Face menggunakan Inference Providers router; ketersediaan model/provider, izin model gated, kuota, dan billing mengikuti akun pengguna. NIM dan Hugging Face mengikuti instruksi JSON tanpa memaksakan parameter JSON mode yang dukungannya bergantung pada model; hasil generate tetap divalidasi sebelum draft disimpan. Request dibatasi 60 detik, respons HTTP maksimal 1 MB, dan kegagalan provider ditampilkan tanpa menyalin isi respons error atau credential.

Referensi kontrak API: [Gemini](https://ai.google.dev/api/generate-content), [NVIDIA NIM](https://docs.api.nvidia.com/nim/reference/llm-apis), [Cohere](https://docs.cohere.com/reference/chat), [Hugging Face](https://huggingface.co/docs/inference-providers/tasks/chat-completion), [Mistral](https://docs.mistral.ai/api/endpoint/chat), [Groq](https://console.groq.com/docs/openai). Tes menggunakan respons simulasi; koneksi nyata memerlukan credential pengguna dan belum diverifikasi.

## Generator UGC cerita

UI **Prompt UGC** memanggil `POST /api/contents/generate-ugc` dengan `{ accountId, brief: { idea, product, character, audience, tone, sceneCount, sceneDuration } }`. Tone: `relatable`, `emotional`, `humor`, atau `educational`. Jumlah adegan 3–6; durasi per adegan 5, 8, atau 10 detik. Endpoint memerlukan sesi dan Origin yang valid, memvalidasi brief dan akun sebelum memanggil AI.

Generator memakai `aiText` dan credential provider yang dipilih. Respons JSON wajib berisi judul, caption, hook, synopsis, characterLock, negativePrompt dan tepat jumlah adegan yang diminta; setiap adegan wajib memiliki judul, narasi, prompt gambar dan prompt gerakan. Respons gagal/tidak lengkap tidak membuat draft. Budget keluaran hingga 6.000 token, timeout/ukuran respons mengikuti adapter AI. Bahasa narasi Indonesia dan prompt visual Inggris diarahkan lewat instruksi model; kualitas/ketepatan bahasa dan durasi narasi tetap perlu direview.

Storyboard tersimpan pada properti `ugc` di JSON konten; `prompt` menyimpan catatan produksi untuk alur edit lama. Edit caption/catatan produksi tidak menghapus storyboard. Tidak perlu migrasi D1, layanan gambar/video baru, atau credential tambahan. Batasan provider, billing, serta keberhasilan API nyata tetap mengikuti akun pengguna. Hasil produksi gambar/video dari prompt belum diuji di tool eksternal.

## Analytics, notifikasi, dan aset

Analytics memakai scope `video.list`, mengambil post dashboard yang memiliki video ID, menyimpan histori views/likes. Rekomendasi waktu memerlukan sedikitnya tiga post dengan analytics yang benar-benar tersinkron. Ringkasan dan ide AI memakai provider yang dipilih; tidak mengklaim waktu optimal sebelum sampel tersedia.

Notifikasi Discord/Telegram dikonfigurasi di Settings, credential terenkripsi. Pengiriman diantrekan, deduplikasi event gagal publish, backoff, maksimal lima percobaan. Tidak ada notifikasi nyata dalam tes simulasi.

Lease per notifikasi mencegah dua eksekusi cron mengirim pekerjaan yang sama secara bersamaan. Respons Telegram dengan `ok: false` dianggap gagal meskipun HTTP 200. Jika koneksi terputus setelah provider menerima pesan, retry masih dapat menduplikasi pesan; tidak ada jaminan exactly-once lintas provider.

Avatar GLB embedded maksimal 10 MB dapat diupload ke File Manager dan dipilih di Settings. Model dinormalisasi, clip idle/work/walk dipilih dari animasi yang tersedia. Model tanpa clip tetap statis; tidak ada retargeting atau animasi baru yang diciptakan otomatis. Lima avatar manusia Rocketbox berlisensi MIT sudah dibundel dengan lima clip, gerakan antar ruangan dan IK untuk mengetik. Furnitur tetap prosedural. Lihat [panduan avatar](AVATARS.md).

## Cloudflare produksi

Provision D1/R2, isi Worker secrets `DASHBOARD_PASSWORD` dan `ENCRYPTION_KEY`, konfigurasi CI seperti README. Terapkan seluruh migrasi, deploy, dan hubungkan domain. Master encryption key harus dipertahankan; menggantinya memerlukan migrasi ciphertext. Kode dan tes lokal tidak membuktikan app TikTok disetujui atau deployment produksi sudah berhasil.

Migrasi `0003_job_safety.sql` menambahkan receipt cron dan lease notifikasi. Satu trigger `*/5 * * * *` mendispatch pekerjaan per jam dan harian menggunakan `scheduledTime`, termasuk jika delivery terlambat. Laporan harian disusun setelah pemrosesan riset/analytics per jam. Receipt yang sudah dimulai tidak dieksekusi ulang untuk occurrence yang sama; receipt disimpan 30 hari. Kegagalan tercatat pada log Worker/activity, dan antrean dapat diproses pada occurrence berikutnya.

## Studio kreatif dan percakapan agen

Terapkan `0004_creative_studio.sql` untuk proyek, profil agen dan karakter cerita. Chat/tahap memakai provider AI yang dipilih di Settings, dengan hasil terstruktur yang divalidasi dan persetujuan eksplisit sebelum mengubah konteks approved. Gambar referensi PNG/JPG/WebP disimpan ke R2 melalui endpoint file yang sama, maksimal 5 MB. Panduan penggunaan, endpoint, invalidasi revisi, pembatalan dan batas penyimpanan ada di [STUDIO.md](STUDIO.md).
