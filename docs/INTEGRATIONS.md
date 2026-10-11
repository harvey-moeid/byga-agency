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

Antrean unik per konten menghindari pengiriman berulang dari klik atau cron. Penolakan sementara yang diketahui diulang dengan exponential backoff, maksimum lima percobaan. Timeout/HTTP 5xx saat init bisa berarti TikTok menerima permintaan: job menjadi `uncertain`, tidak membuat post kedua. Jika publish ID sudah tersimpan, tombol periksa status memakai ID itu. Untuk ketidakpastian tanpa ID, periksa akun TikTok sebelum tindakan manual; tidak ada tombol retry buta.

## Research API

Research API adalah produk terpisah dengan persyaratan kelayakan TikTok. Login Kit tidak memberikan akses riset kompetitor. Masukkan credential Research API yang benar dan aktifkan riset di Settings. Tanpa akses tersebut, hasil tetap kosong dan status menjelaskan kegagalan; tidak ada scraper atau metrik palsu.

Cron memeriksa maksimal lima referensi per jam, bergiliran. Pagination dan jendela tanggal tersimpan. Data API riset dapat tertunda dari platform. Tren hashtag berasal dari sampel akun yang dipantau, bukan klaim seluruh TikTok. Google Trends RSS Indonesia opsional disinkronkan harian. Hasil riset dapat dipilih sebagai referensi generate caption/prompt.

## AI, analytics, notifikasi, dan aset

OpenRouter memerlukan key di Settings. Workers AI memerlukan binding `AI` serta model yang tersedia. Analytics memakai scope `video.list`, mengambil post dashboard yang memiliki video ID, menyimpan histori views/likes. Rekomendasi waktu memerlukan sedikitnya tiga post dengan analytics yang benar-benar tersinkron. Ringkasan dan ide AI memakai provider yang dipilih; tidak mengklaim waktu optimal sebelum sampel tersedia.

Notifikasi Discord/Telegram dikonfigurasi di Settings, credential terenkripsi. Pengiriman diantrekan, deduplikasi event gagal publish, backoff, maksimal lima percobaan. Tidak ada notifikasi nyata dalam tes simulasi.

Avatar GLB embedded maksimal 10 MB dapat diupload ke File Manager dan dipilih di Settings. Model dinormalisasi, clip idle/work/walk dipilih dari animasi yang tersedia. Model tanpa clip tetap statis; tidak ada retargeting atau animasi baru yang diciptakan otomatis. Lima avatar manusia Rocketbox berlisensi MIT sudah dibundel dengan lima clip, gerakan antar ruangan dan IK untuk mengetik. Furnitur tetap prosedural. Lihat [panduan avatar](AVATARS.md).

## Cloudflare produksi

Provision D1/R2, isi Worker secrets `DASHBOARD_PASSWORD` dan `ENCRYPTION_KEY`, konfigurasi CI seperti README. Terapkan seluruh migrasi, deploy, dan hubungkan domain. Master encryption key harus dipertahankan; menggantinya memerlukan migrasi ciphertext. Kode dan tes lokal tidak membuktikan app TikTok disetujui atau deployment produksi sudah berhasil.
