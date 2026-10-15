# Mengaktifkan integrasi setelah coding

Kode dapat dikembangkan dan diuji tanpa API key. Mode demo tidak mengirim posting atau notifikasi. Tes integrasi memakai API simulasi dengan seluruh jaringan keluar dimatikan.

## TikTok Login Kit dan Content Posting API

1. Buat aplikasi pada TikTok for Developers, konfigurasi produk Login Kit dan Content Posting API Direct Post, dan lengkapi review yang diwajibkan TikTok.
2. Set `APP_URL` Worker ke origin HTTPS yang dipakai dashboard. Daftarkan redirect persis `https://agency.muidsoft.com/api/tiktok/callback` jika domain itu yang dipakai. Untuk domain lain, ganti origin. Settings menampilkan redirect yang digunakan kode.
3. Masukkan client key dan client secret melalui Settings backend live. Jangan memasukkannya ke source atau percakapan.
4. Hubungkan setiap akun dari Settings. Kode meminta `user.info.basic`, `video.list`, `video.publish`. Scope yang disetujui dan batas creator menentukan fitur yang dapat dipakai.
5. Upload video MP4 vertikal 9:16, maksimal 50 MB. Review caption, pilih privasi yang tersedia, aturan interaksi, deklarasi brand/AI, konfirmasi hak video/audio dan consent publish. Pilihan privasi tidak diisi otomatis.
6. Approve, lalu publish atau jadwalkan. Status `publishing` berarti masih menunggu TikTok; `published` hanya setelah konfirmasi API. App yang belum diaudit dapat memiliki pembatasan TikTok, termasuk privasi dan pengguna.

Token disimpan terenkripsi, refresh otomatis memakai lease D1. OAuth state sekali pakai terikat ke sesi login dan cookie. Menghubungkan creator berbeda membatalkan kelayakan approval sebelumnya; konten perlu direview ulang.

Simpan edit sebelum approval. Pilihan consent direset ketika caption/prompt yang tersimpan berubah. Request edit/transition dari dashboard membawa `expectedRevision`; final approval TikTok juga wajib membawa identitas creator yang ditampilkan form. Respons 409 berarti konten atau antrean berubah dan harus diperiksa ulang. Pergantian creator saat OAuth/reconnect memblokir approval/publish, termasuk jika terjadi di antara pemeriksaan awal dan init. Pekerjaan yang telah diambil publisher tidak dapat direvisi/dihapus saat berjalan.

Antrean unik per konten menghindari pengiriman berulang dari klik atau cron. Penolakan sementara yang diketahui diulang dengan exponential backoff, maksimum lima percobaan. Timeout/HTTP 5xx saat init bisa berarti TikTok menerima permintaan: job menjadi `uncertain`, tidak membuat post kedua. Jika publish ID sudah tersimpan, tombol periksa status memakai ID itu. Untuk ketidakpastian tanpa ID, periksa akun TikTok sebelum tindakan manual; tidak ada tombol retry buta.

## Research API

Research API adalah produk terpisah dengan persyaratan kelayakan TikTok. Login Kit tidak memberikan akses riset kompetitor. Masukkan credential Research API yang benar dan aktifkan riset di Settings. Tanpa akses tersebut, hasil tetap kosong dan status menjelaskan kegagalan; tidak ada scraper atau metrik palsu.

Cron memeriksa maksimal lima referensi per jam, bergiliran. Pagination dan jendela tanggal tersimpan. Data API riset dapat tertunda dari platform. Tren hashtag berasal dari sampel akun yang dipantau, bukan klaim seluruh TikTok. Google Trends RSS Indonesia opsional disinkronkan harian. Hasil riset dapat dipilih sebagai referensi generate caption/prompt.

## Provider AI

Delapan provider tersedia di Settings → AI & otomasi. Pilih provider, isi credential yang sesuai di API key & notifikasi, lalu simpan. Penggantian provider mengisi model default; kolom Model dapat diedit sesuai model yang tersedia untuk akun Anda. Semua fitur teks (caption, prompt video, draft otomatis, ringkasan/rekomendasi analytics) menggunakan provider yang dipilih. Tidak ada generator video otomatis atau fallback ke provider lain.

| Provider              | Model default                       | Credential di Settings                                    |
| --------------------- | ----------------------------------- | --------------------------------------------------------- |
| OpenRouter            | `openai/gpt-4o-mini`                | OpenRouter API key                                        |
| Cloudflare Workers AI | `@cf/meta/llama-3.1-8b-instruct`    | Binding `AI`, tanpa key di form                           |
| Gemini                | `gemini-2.5-flash-lite`             | Gemini API key (Google AI Studio)                         |
| NVIDIA NIM            | `meta/llama-3.1-8b-instruct`        | NVIDIA NIM API key (NVIDIA API Catalog hosted API)        |
| Cohere                | `command-a-03-2025`                 | Cohere API key                                            |
| Hugging Face          | `meta-llama/Llama-3.3-70B-Instruct` | Hugging Face access token dengan izin Inference Providers |
| Mistral               | `mistral-small-latest`              | Mistral API key                                           |
| Groq                  | `llama-3.3-70b-versatile`           | Groq API key                                              |

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
