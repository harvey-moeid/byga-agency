# PRD: Byga Agency — AI Agent Dashboard 3D Interaktif

## Social Media Content Pipeline — "Kantor 3D AI Agent"

**Status:** Draft awal **Platform:** Web (React + Three.js) **Backend/Infra:** Cloudflare Workers + D1

---

## 1. Latar Belakang & Tujuan

Produk ini adalah dashboard berbasis web yang memvisualisasikan AI agent sebagai karakter yang "bekerja" di dalam sebuah kantor 3D interaktif. Alih-alih dashboard konvensional berbentuk tabel dan grafik datar, user melihat dan berinteraksi dengan representasi visual dari proses kerja AI agent: mulai dari membuat konten, menjadwalkan, mem-posting, hingga menganalisis performa konten media sosial.

Tujuan utama:

- Memberikan pengalaman monitoring & kontrol AI agent yang lebih intuitif dan menarik dibanding dashboard biasa.
- Mengotomatisasi pipeline penuh pengelolaan konten media sosial: generate → jadwal → posting → analisis.
- Menjadikan proses kerja AI agent "terlihat" (visible/explainable) lewat avatar dan ruangan yang merepresentasikan tiap tahap pipeline.

## 2. Target Pengguna

- User yang mengelola konten media sosial (personal brand, UMKM, tim kecil) dan ingin proses otomatis namun tetap bisa memantau/mengontrol secara visual.
- (Diasumsikan single-user/owner dulu di MVP — multi-tenant/tim bisa jadi fase lanjutan.)
- Single-user di sini berarti satu operator/pemilik dashboard, bukan satu akun TikTok — operator yang sama bisa mengelola **beberapa akun TikTok sekaligus** (multi-account) dari satu dashboard.

## 3. Konsep Produk: Kantor 3D Interaktif

Dashboard divisualisasikan sebagai denah kantor 3D yang terbagi menjadi beberapa ruangan, masing-masing merepresentasikan satu tahap pipeline. Avatar AI agent bergerak antar-ruangan dan menampilkan animasi kerja sesuai tahap yang sedang berjalan.

**Tema visual:** modern/minimalis dipadukan dengan nuansa hangat/cozy — warna netral, elemen kayu dan tanaman, bukan gaya futuristik/neon.

**Kontrol kamera:** otomatis fokus ke ruangan yang sedang aktif mengikuti tahap pipeline, tapi user bisa override manual (orbit/zoom bebas) kapan saja.

### 3.1 Ruangan & Fungsi

| Ruangan | Fungsi | Representasi Visual |
| --- | --- | --- |
| Ruang Riset/Intel | Riset tren konten (topik/hashtag naik) dan analisis kompetitor dari akun TikTok lain via TikTok API resmi | Avatar memantau papan/layar berisi tren & data akun kompetitor; hasil riset bisa dikirim ke Ruang Konten sebagai bahan ide |
| Ruang Konten (Meja Content) | Generate ide, caption, gambar/visual konten | Avatar duduk di meja, animasi "menulis/mengetik", preview konten muncul di layar meja |
| Ruang Jadwal (Papan Jadwal) | Menyusun & mengatur jadwal posting | Papan/kalender 3D menampilkan antrian konten per platform & waktu |
| Ruang Posting (Gerbang Publish) | Eksekusi auto-posting ke platform terpilih | Animasi "mengirim"/pintu terbuka saat konten dipublish |
| Ruang Analytics (Layar Monitor) | Menampilkan performa post (likes, reach, engagement) & rekomendasi | Layar-layar 3D menampilkan grafik performa real-time |

### 3.2 Avatar AI Agent

- Berpindah antar ruangan sesuai tahap pipeline yang aktif.
- Status kerja ditunjukkan lewat animasi (idle, generating, scheduling, posting, analyzing).
- Klik avatar menampilkan panel status/log aktivitas terkini (chat-like log atau speech bubble).

### 3.3 Interaksi User

- User bisa klik tiap ruangan untuk membuka panel detail/kontrol (mis. klik Ruang Konten → form generate konten baru).
- Kamera 3D bisa di-orbit/zoom bebas (orbit controls) untuk eksplorasi kantor.
- Notifikasi visual (ikon di atas ruangan) saat ada tugas baru/selesai/error.
- Multi-account TikTok: semua akun ditampilkan sekaligus (bukan switcher) — tiap ruangan menampilkan konten/data dikelompokkan per akun, mis. Ruang Jadwal punya sub-bagian per akun
- Approval konten: cukup lihat raw file video + caption apa adanya, tanpa perlu mockup preview feed TikTok

## 4. Fitur Pipeline (Full: Generate → Jadwal → Post → Analisis)

### 4.0 Riset Tren & Analisis Kompetitor (Ruang Riset/Intel)

- Fetch data tren (topik/hashtag yang sedang naik) dari web dan dari TikTok, untuk jadi bahan ide saat generate konten
- Fetch data performa akun TikTok lain (kompetitor) via TikTok API resmi, dalam batas yang diizinkan ToS (publik/scraping terbatas)
- Hasil riset ditampilkan di Ruang Riset/Intel dan bisa dikirim sebagai referensi ke Ruang Konten saat generate (baik manual maupun saat AI agent cari ide secara otomatis)
- Output riset minimal: daftar topik/hashtag tren + ringkasan performa konten kompetitor (jenis konten, jam posting, engagement) sebagai dasar rekomendasi
- Cron jalan tiap 1 jam untuk cek info baru/upload baru dari akun kompetitor (deteksi cepat); ringkasan tren & rekomendasi harian tetap disiapkan sekali sehari sebagai bahan utama sebelum sesi generate konten
- Daftar akun kompetitor yang dipantau bisa ditambah/dihapus dinamis dari UI (bukan daftar tetap/hardcode) — tiap akun baru otomatis masuk ke jadwal cek per jam

### 4.1 Generate Konten

- Input: topik/brief dari user, atau trigger otomatis berdasarkan jadwal/tren.
- Output: caption teks + text prompt video, otomatis disusun mengikuti spek TikTok (rasio 9:16 vertical, durasi pendek, dll) — video di-generate manual oleh user di tool text-to-video pilihan sendiri di luar dashboard
- AI model untuk generate teks: caption + prompt video (OpenRouter/Cloudflare Workers AI) — dashboard tidak generate video secara otomatis
- User dapat approve/edit/regenerate hasil sebelum lanjut ke jadwal.
- Setelah video siap, user upload file video-nya lewat Ruang Konten — disimpan ke R2, lalu masuk ke alur approval → jadwal → posting seperti biasa

### 4.2 Jadwal (Scheduling)

- Kalender/antrian konten per platform (IG, TikTok, X, dll — scope platform perlu dikonfirmasi).
- User bisa drag-drop atau atur manual waktu posting, atau biarkan AI agent menentukan waktu optimal.

### 4.3 Auto-Posting

- Eksekusi posting otomatis ke platform terjadwal via API resmi tiap platform (butuh OAuth/API key per platform).
- Status posting (sukses/gagal) tercatat dan ditampilkan di ruang posting.
- Kalau posting gagal: retry otomatis beberapa kali (dengan backoff), kalau tetap gagal setelah batas percobaan — status ditandai gagal dan notifikasi dikirim ke Discord/Telegram

### 4.4 Analisis Performa

- Tarik data performa post dari API platform — MVP minimal: likes & views saja; metrik lain (komentar, share, reach, engagement rate, follower growth) jadi fase lanjutan
- Tampilkan di Ruang Analytics dalam bentuk grafik 3D/2D.
- AI agent memberi rekomendasi (mis. waktu posting terbaik, tipe konten yang berkinerja baik) berdasarkan data historis.

## 5. Arsitektur Teknis (Usulan Awal)

- **Frontend:** React + Three.js (react-three-fiber direkomendasikan untuk integrasi React yang lebih rapi), state management untuk sinkronisasi status pipeline ke scene 3D.
- **Backend:** Cloudflare Workers dengan framework Hono (direkomendasikan — ringan, TypeScript-first, cocok untuk edge runtime, konsisten dengan JalurTarot & Gen Video), API orchestration + cron untuk scheduling/posting; Cloudflare D1 untuk data konten, jadwal, log, hasil analytics.
- **AI Generation:** OpenRouter/Cloudflare Workers AI untuk generate caption & text prompt video (bukan video-nya langsung — video di-generate manual oleh user di luar dashboard lalu diupload).
- **Integrasi Platform Sosial Media:** API resmi tiap platform (perlu OAuth flow per platform; beberapa platform punya pembatasan API untuk auto-posting, mis. Instagram/TikTok API punya syarat approval bisnis).
- **Scheduling Execution:** Cloudflare Cron Triggers atau Queues untuk eksekusi posting terjadwal.
- **Deployment:** agency.muidsoft.com, konsisten dengan project lain (Cloudflare Pages/Workers).
- **Konfigurasi API Key:** semua API key (OpenRouter, Cloudflare Workers AI, TikTok API, webhook Discord/Telegram) diisi dan dikelola lewat halaman Settings di UI — disimpan terenkripsi di D1, bukan hardcode/env var, supaya mudah diganti tanpa redeploy.
- **Tier Cloudflare:** pakai free tier untuk Workers/D1/Pages/Cron Triggers; hanya **R2** (penyimpanan asset gambar/model 3D) yang paid — perlu diperhitungkan batas free tier (mis. jumlah request Workers & cron invocations harian) saat desain frekuensi job.
- **Manajemen File R2:** halaman/panel di dashboard untuk melihat daftar file tersimpan di R2 (video, asset avatar/kantor) beserta ukurannya, dan bisa menghapus file secara manual dari UI — berguna untuk kontrol biaya R2 yang paid
- **Retensi Data:** data riset tren/kompetitor & analytics history disimpan beberapa bulan terakhir saja di D1, dengan job pembersihan otomatis (cron) yang menghapus data lebih lama dari periode retensi — jumlah bulan persis bisa dikonfigurasi lewat Settings.
- **Repo & CI/CD:** GitHub repo dengan CI/CD otomatis (push ke branch utama = deploy ke Cloudflare Pages/Workers).
- **Monitoring:** cukup pakai log bawaan Cloudflare dashboard, tidak perlu tool error tracking terpisah di MVP.

## 6. Hal yang Masih Perlu Diputuskan

- **Platform media sosial MVP:** TikTok saja dulu
- **Provider AI untuk generate caption/teks:** OpenRouter dan Cloudflare Workers AI
- **Scope MV**P generate konten: teks (caption) + text prompt video. AI tidak generate video secara otomatis — user generate video sendiri di tool pilihannya lalu upload ke dashboard
- **Target pengguna MVP:** single-user dulu (hanya pemilik project)
- **Gaya visual avatar & kantor 3D:** lebih detail/realistis (bukan low-poly)
- **Status akses TikTok API:** belum punya, masih perlu apply ke TikTok Developer/Business API — jadi proses apply perlu dimulai lebih awal karena bisa jadi bottleneck sebelum fitur auto-posting bisa live
- **Provider** video-gen: tidak diperlukan — generate video dilakukan manual oleh user di luar dashboard (lihat 4.1), dashboard hanya generate text prompt-nya dan menerima upload file video jadi

### 6.1 Keputusan Alur & Akses

- **Alur approval:** user harus approve konten dulu sebelum di-publish ke TikTok (bukan auto-publish) — Ruang Posting menampilkan antrian "menunggu approval" sebelum animasi publish berjalan
- **Akses dashboard:** login dengan password sederhana, konsisten dengan project lain
- **Avatar 3D:** pakai asset/model ready-made yang dikustomisasi (bukan custom model dari nol) untuk mempercepat development sambil tetap mencapai gaya realistis yang diinginkan
- ### 6.2 Konteks Project & Rekomendasi Asset 3D
  - **Tujuan project:** gratis/non-komersial, sekadar tools pribadi — jadi tidak perlu pertimbangan lisensi komersial yang ketat untuk asset 3D
  - **Timeline apply TikTok API:** belum, fokus bangun pipeline dulu baru apply — auto-posting TikTok jadi fitur yang baru bisa live setelah apply selesai, sementara fase awal bisa jalan dengan draft/preview post tanpa publish asli
  - **Rekomendasi sumber asset 3D** (karena belum ditentukan):
    - **Avatar:** [Ready Player Me](https://readyplayer.me) — gratis, avatar realistis yang bisa dikustomisasi, export ke format GLB, mudah diintegrasikan ke react-three-fiber. Untuk animasi (idle, mengetik, berjalan, dll), gabungkan dengan [Mixamo](https://www.mixamo.com) (gratis dari Adobe, banyak animasi humanoid siap pakai yang tinggal di-retarget ke avatar)
    - **Kantor/environment:** [Sketchfab](https://sketchfab.com) (banyak model office/furniture gratis & berbayar, format glTF/GLB langsung kompatibel Three.js) sebagai sumber utama; untuk kebutuhan non-komersial, filter ke asset berlisensi CC yang mengizinkan penggunaan personal
    - Alternatif kalau performa jadi masalah nanti (karena arah realistis lebih berat dari project lain yang low-end friendly): turunkan resolusi tekstur/poly count asset yang dipilih, bukan ganti gaya visual

### 6.3 Dukungan Mobile, Notifikasi & Trigger Konten

- **Dukungan mobile:** dashboard harus bisa diakses dari HP — scene 3D perlu versi lebih ringan untuk mobile (poly count lebih rendah, tekstur dikompres, atau fallback ke render kualitas rendah) supaya tetap jalan lancar di device low/mid-end
- **Notifikasi:** dikirim ke Discord/Telegram untuk event "konten siap di-approve" dan "posting gagal", mengikuti pola project notifikasi trading yang sudah ada (webhook/bot terpisah dari dashboard utama). Isi pesan ringkasan singkat saja: nama akun, status, dan link ke dashboard — tanpa detail caption/preview di pesan
- **Trigger generate konten:** dua jalur — (1) manual, user input topik langsung dari Ruang Konten; (2) otomatis, AI agent mencari ide/tren sendiri secara berkala dan menyiapkan draft untuk di-review

## 7. Metrik Keberhasilan (Usulan)

- Waktu yang dihemat user dari proses manual ke otomatis (generate → publish).
- Jumlah post yang berhasil di-generate & di-publish otomatis tanpa error.
- Engagement rate post yang di-generate AI vs manual (opsional, untuk validasi kualitas AI).

## 8. Fase Pengembangan (Usulan)

1. **Fase 1 — Scene 3D Kantor (visual dulu):** Bangun scene 3D kantor dengan ruangan statis (termasuk Ruang Riset/Intel), avatar ready-made (Ready Player Me + Mixamo) dengan animasi dasar, dan navigasi kamera — pakai data dummy/mock dulu supaya hasil visual bisa langsung dilihat dan dievaluasi.
2. **Fase 2 — MVP Pipeline Backend:** Generate konten (teks+gambar) + jadwal manual + approval + posting ke TikTok, Cloudflare Workers/D1, dihubungkan ke scene 3D dari Fase 1 menggantikan data dummy.
3. **Fase 3 — Interaktivitas & Analytics:** Interaksi klik ruangan, animasi avatar dinamis sesuai status pipeline real, integrasi data analytics real-time, notifikasi Discord/Telegram.
4. **Fase 4 — Riset Otomatis & Mobile:** Riset tren/kompetitor harian (Ruang Riset/Intel aktif penuh), versi 3D ringan untuk mobile.
5. **Fase 5 — Multi-Platform & Rekomendasi AI:** Tambah platform lain selain TikTok, rekomendasi AI berbasis data historis.
