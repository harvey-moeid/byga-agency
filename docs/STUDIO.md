# Studio kreatif UGC

Kantor 3D tetap menjadi beranda. Material kayu, tanaman, pencahayaan hangat, area brainstorming, meja penulisan, visual lab, set produksi dan lounge review menyatukan lima agen manusia yang telah dibundel.

## Mulai bekerja

1. Pilih **Proyek baru** atau lanjutkan proyek terakhir melalui kartu Proyek aktif. Satu proyek terhubung ke satu akun TikTok; akun tidak perlu sudah terhubung OAuth untuk menulis naskah.
2. Buka **Proyek UGC → Brief**. Isi tujuan cerita, produk opsional, karakter, audiens, gaya, jumlah adegan dan durasi. Brief tersimpan otomatis; tombol **Simpan brief** tersedia untuk penyimpanan segera.
3. Pilih **Pratinjau & ajukan brief**. Periksa hasil di percakapan agen, lalu pilih **Setujui Brief**. Brief yang masih diedit belum mengganti konteks bersama.
4. Lanjutkan melalui **Buat cerita → Buat prompt gambar → Buat prompt video → Review proyek → Pratinjau draft final**. Tiap tahap membutuhkan persetujuan tahap sebelumnya.
5. **Setujui Draft final** menambahkan naskah dan storyboard lengkap ke Content library sebagai draft. Tidak ada gambar, video, audio atau posting yang dihasilkan otomatis. Upload video jadi dan persetujuan TikTok tetap memakai alur publishing yang ada.

Menu **Prompt UGC** tetap menyediakan generator storyboard sekali jalan dari pembaruan sebelumnya. Gunakan **Proyek UGC** untuk percakapan lintas agen, persetujuan bertahap dan riwayat versi.

## Agen dan percakapan

Klik avatar, nama agen, label ruangan atau kartu anggota tim untuk membuka panel chat di kanan. Pada mobile panel memenuhi layar. Kantor tetap bergerak pada desktop; render kantor dijeda ketika tertutup chat mobile. Tombol **Buka ruang kerja** tetap mengarah ke fitur operasional ruangan.

Chat mendukung teks bebas dan pilihan tindakan. Chat bebas memberi jawaban/saran; perubahan tahap hanya dijalankan melalui tindakan yang menghasilkan pratinjau dan persetujuan eksplisit. Agen tidak memiliki tool untuk menghapus data, mengubah jadwal atau mempublikasikan TikTok lewat percakapan.

Setiap pasangan proyek–agen punya riwayat percakapan sendiri. Model menerima maksimal 16 pesan terakhir dari agen itu dan pratinjau milik agen yang sama, ditambah konteks proyek yang sudah disetujui. Chat dan pratinjau agen lain serta edit brief yang belum disetujui tidak masuk konteks bersama. Pesan, hasil pending dan versi yang disetujui tersimpan dalam proyek.

Di **Settings → Tim & instruksi agen** atau **Atur agen** dalam chat, ubah nama, peran, aksen warna, preset dan instruksi custom. Preset: Riset ide, Penulis cerita UGC, Pembuat prompt gambar, Pembuat prompt video, Reviewer konten, Pengelola jadwal dan Custom. Preset dapat diedit. Nama dan warna tampil pada daftar tim dan label avatar; identitas file GLB tetap stabil ketika nama berubah.

Mode live memakai salah satu dari delapan provider AI di Settings. Mode demo memakai template lokal yang diberi label; tidak mengirim permintaan AI.

## Revisi dan versi

Pilih **Cakupan revisi** di chat atau **Revisi adegan** pada hasil proyek. Cerita bisa direvisi satu adegan, dan prompt gambar/video bisa dibuat ulang untuk satu adegan tanpa menimpa adegan lain. Hasil tetap menunggu persetujuan.

Persetujuan cerita baru memperbarui identitas versi per adegan. Perubahan karakter atau negative prompt memengaruhi seluruh adegan; perubahan satu adegan hanya menandai prompt adegan itu sebagai **Perlu ditinjau ulang**. Perubahan prompt gambar menandai prompt video terkait sebagai perlu ditinjau ulang. Persetujuan brief baru menandai cerita lama dan hasil turunannya untuk ditinjau ulang. Edit brief yang belum disetujui tidak membatalkan hasil approved.

Riwayat versi menyimpan hasil sebelumnya. Draft Content library merupakan snapshot; revisi proyek tidak diam-diam mengubah draft lama. Setujui rangkaian baru untuk membuat draft final baru. **Buka proyek sumber** menghubungkan draft final ke proyeknya.

**Unduh proyek & riwayat (.json)** mengekspor brief, chat, pratinjau dan semua versi. Storyboard final juga dapat disalin/diunduh sebagai teks melalui Content library. Ukuran dokumen proyek live dibatasi 1,5 MB; batas ini menolak penulisan baru tanpa memangkas versi lama. Ekspor proyek dan mulai proyek berikutnya bila batas tercapai. Daftar proyek menampilkan 100 proyek terbaru.

## Karakter cerita

**Proyek UGC → Karakter cerita** menyimpan nama tokoh, deskripsi penampilan, pakaian dan referensi gambar opsional. Profil tokoh berbeda dari nama agen kantor. Pilih profil dalam brief untuk menyalin snapshot karakter ke proyek; pengeditan profil global tidak mengubah brief atau versi lama secara otomatis.

PNG/JPG/WebP maksimal 5 MB disimpan sebagai aset. Pada backend, jenis file ditentukan dari signature dan disajikan dengan MIME yang sesuai serta `nosniff`. Gambar yang masih dirujuk profil atau riwayat brief tidak dapat dihapus. Model teks menggunakan deskripsi karakter, bukan analisis visual gambar; gunakan gambar referensi yang sama di tool pembuat gambar/video.

## Penyimpanan dan API

Terapkan `0004_creative_studio.sql` sebelum menjalankan backend baru. Migrasi menambahkan tabel `studio_agents`, `studio_characters`, dan `studio_projects` tanpa mengubah data lama. Script deploy menerapkan seluruh migrasi sebelum deploy Worker.

| Endpoint                                                      | Fungsi                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /api/studio`                                             | Profil agen/karakter dan ringkasan proyek, tanpa memuat semua riwayat proyek                            |
| `PUT /api/studio/agents/:id`                                  | Simpan nama, peran, instruksi dan warna dengan pemeriksaan revisi                                       |
| `PUT /api/studio/characters/:id`                              | Simpan profil tokoh dan referensi gambar                                                                |
| `POST /api/studio/projects`                                   | Buat proyek terhubung ke akun                                                                           |
| `GET /api/studio/projects/:id`                                | Baca proyek dan riwayatnya                                                                              |
| `PATCH /api/studio/projects/:id`                              | Autosave brief dengan `expectedRevision`                                                                |
| `POST /api/studio/projects/:id/turn`                          | Chat atau usulan tahap; `runId`, `agentId`, `action`, `message`, `expectedRevision`, `sceneId` opsional |
| `POST /api/studio/projects/:id/cancel`                        | Batalkan `runId`, termasuk bila bersamaan dengan respons AI                                             |
| `POST /api/studio/projects/:id/proposals/:proposalId/approve` | Setujui hanya usulan yang konteks dan revisinya masih sesuai                                            |
| `POST /api/studio/projects/:id/proposals/:proposalId/reject`  | Tolak usulan tanpa menerapkannya                                                                        |

Semua endpoint memakai sesi dan pemeriksaan Origin yang sama dengan dashboard. Penulisan D1 memakai compare-and-swap pada revisi proyek. Persetujuan final dan pembuatan konten ada dalam satu batch atomik dengan guard terhadap duplikasi. Pratinjau usang ditolak HTTP 409.

Satu generasi aktif per proyek. Pesan pengguna disimpan sebelum memanggil AI. Tombol hentikan membatalkan request klien dan menandai run di server; hasil terlambat tidak diterapkan. Status run dapat dipulihkan setelah reload. Pembatalan tidak menjamin provider eksternal berhenti menghitung atau membebaskan tagihan; hasilnya tetap tidak masuk hasil approved. Kegagalan provider meninggalkan pesan pengguna dan memungkinkan percobaan berikutnya.

Demo memakai `byga-studio-v1` terpisah dari workspace demo lama dan data live. Video/gambar demo tetap di IndexedDB. Pemilihan proyek disimpan terpisah untuk mode demo/live. Kredensial provider tetap terenkripsi di tabel credentials dan tidak disalin ke proyek atau file ekspor.

## Creative Prompt Studio — panduan produksi (30 Oktober 2026)

Menu **Creative Prompt Studio** menambahkan workflow native React/TypeScript pada Agency. **Prompt UGC**, proyek lama, kantor 3D, akun TikTok, dan pipeline publishing tetap tersedia. Proyek Creative menggunakan data `creative` di dokumen `studio_projects` existing; durasinya terpisah dari `briefDraft` UGC lama.

### Membuat konten TikTok 30 detik

1. Buka **Creative Prompt Studio**, pilih akun Content Library, beri nama, lalu **Buat proyek Creative**. Default: 5 scene × 6 detik, 9:16, cinematic realistic, Character Lock dan Environment Lock aktif.
2. Di **Brief & Storyboard**, isi ide utama, karakter, lingkungan, bahasa, dan negative constraints. **Simpan brief** sebelum generate. **Susun storyboard template** menambahkan kerangka narasi hook/masalah/proses/solusi/CTA; edit narasinya menjadi cerita Anda. Ini kerangka deterministik, bukan klaim naskah hasil AI.
3. Pilih kartu scene untuk mengedit judul, narasi, durasi, dan detail scene. **Save Scene** menyimpan hanya scene tersebut. **Generate All Prompts** membuat kedua prompt setiap scene tanpa jaringan/API. **Regenerate Scene** hanya memperbarui scene terpilih. Regenerasi template dengan input sama menghasilkan teks yang sama.
4. Di **Image Prompt Builder**, pilih satu dari 11 preset atau preset custom. Isi pose, ekspresi, aktivitas, visual, lighting, kamera, lens, warna, mood, dan komposisi. Simpan scene, lalu **Generate Prompt**. Lock karakter memakai identitas global sebagai sumber subjek/pakaian; lock lingkungan memakai lokasi/latar global. Nonaktifkan lock untuk override scene. Referensi gambar adalah arahan untuk tool tujuan, bukan analisis visual oleh mesin template.
5. Gunakan editor prompt untuk revisi manual, **Save Prompt**, **Copy Image Prompt**, atau ekspor TXT/JSON. **Preset Manager** menyimpan/menghapus maksimal 20 konfigurasi gambar custom per proyek.
6. **Buka ChatGPT** membuka `https://chatgpt.com/`. Tempel prompt dan unggah referensi karakter bila diperlukan. Buat gambar melalui akun Anda, lalu download hasilnya. BYGA tidak mengisi prompt, mengunggah, atau menjalankan generasi di ChatGPT.
7. Di **Image Asset Manager**, upload hasil sebagai **first-frame**. Upload last-frame dan referensi tambahan bila diperlukan. PNG/JPEG/WebP maksimal 5 MB per file; aset lama dari File manager juga bisa dihubungkan. Preview/download memakai akses Agency yang sama. Referensi karakter dapat diunggah dari editor profil karakter.
8. Di **Video Prompt Builder**, pilih mode, gerakan karakter/kamera, body/expression, framing, gerakan lingkungan, lighting continuity, fisika, audio, dialog, voice, efek, dan timing. Simpan scene; generate ulang video prompt setelah menghubungkan/mengganti gambar. Durasi profil Omni: **4/6/8/10 detik**, rasio **9:16/16:9**. Prompt menekankan satu shot kontinu dan identitas first-frame.
9. **Buka Google Flow** membuka `https://labs.google/fx/tools/flow`. Upload gambar secara manual, pilih **Gemini Omni Flash 1.1**, durasi dan rasio yang sesuai; tempel video prompt dan jalankan generasi. Periksa mode yang tersedia di akun Anda. Timing, identitas, audio dan gerakan adalah arahan yang perlu ditinjau pada hasil, bukan jaminan.
10. Download hasil dari Flow; upload MP4/WebM maksimal 50 MB di **Video Asset Manager**. R2 menyimpan byte media; D1 hanya metadata/relasi. Preview video menggunakan kontrol native, mendukung mobile dan byte range. **Approve Scene** hanya aktif setelah media tersedia; backend juga memeriksa kedua prompt terbaru.
11. Ulangi untuk lima scene: **0–6 hook; 6–12 masalah; 12–18 proses; 18–24 solusi; 24–30 CTA**. Review tiap scene dan approve. Di **Review & Export**, isi caption (simpan dan review ulang bila berubah), unduh storyboard TXT/JSON, lalu **Kirim draft ke Content Library**. Pengiriman ulang versi sama tidak membuat draft ganda.
12. Draft berisi snapshot storyboard, scene, prompt, narasi, dan referensi aset. Rangkai lima klip menjadi video final di editor pilihan Anda, lalu upload video final ke Content Library untuk review/persetujuan publishing existing. Studio tidak merangkai video atau memposting otomatis.

Editor mempertahankan draft yang belum disimpan ketika berpindah di enam bagian atau kartu scene. Reload memulihkan versi **yang sudah disimpan**; indikator menandai edit belum disimpan. File demo di IndexedDB hanya tersedia pada browser/perangkat asal. Live menyimpan proyek dan metadata di D1 serta media di R2. Lock teks membantu konsistensi, tidak menjamin wajah identik 100%.

### Karakter, stale state, dan revisi

Editor profil Creative memakai `studio_characters`, dengan face, hair, skin appearance, outfit, accessories, proportions, style, dan identifying features. Pilih profil tersimpan dalam brief, lalu simpan. Pembaruan profil yang terhubung disinkronkan ketika proyek dibaca ulang; perubahan identitas/revision menandai prompt terkait stale dan membatalkan approval Creative. Semantik snapshot karakter UGC lama tetap dipertahankan.

Perubahan scene menyimpan snapshot revisi sebelumnya (termasuk prompt dan aset). Pemulihan revisi menyalin versi lama menjadi revisi baru, bukan menghapus riwayat. Duplicate Scene membuat ID baru tanpa approval. Perubahan gambar/prompt gambar menandai video terkait stale. Perubahan global membatalkan approval scene; prompt yang inputnya berubah perlu diregenerasi. Histori maksimal 60 revisi per scene dan dokumen live maksimal 1,5 MB; batas menolak penulisan baru, tanpa membuang versi/aset lama. Ekspor dan buat proyek lanjutan bila penuh.

Proyek UGC lama tetap memakai 5/8/10 detik. Membukanya di Creative menampilkan peringatan dan **Konversi eksplisit ke Creative Studio**. Konversi membuat representasi Creative terpisah dengan durasi yang dipilih; brief, cerita, prompt approved dan riwayat UGC tidak dimodifikasi. Prompt Creative baru perlu dibuat dan media perlu ditinjau lagi.

### AI Enhance dan agen existing

1. Di backend live, buka **Settings → AI & otomasi**, pilih provider/model existing dan simpan credential di backend. Template tidak memerlukan langkah ini.
2. Simpan brief Creative, lalu **Setujui konteks untuk agen**. Hanya konteks global yang telah disetujui dipakai bersama. Scene terpilih dikirim sebagai kandidat edit, tidak diklaim approved.
3. Klik **Enhance with AI** pada Story Writer/Nova (`content`), Image Prompt Creator/Kai (`schedule`), Video Prompt Creator/Leo (`publish`), atau Content Reviewer/Iris (`analytics`). Nama/instruksi mengikuti pengaturan agen Agency. Klik ini merupakan tindakan eksplisit menggunakan provider dan dapat memakai kuota.
4. Hasil tampil sebagai **Usulan … belum diterapkan**. **Terapkan usulan AI** membuat revisi baru, tanpa memberikan approval otomatis. Reviewer menghasilkan saran yang bisa ditinjau/ditutup. Pembatalan memakai lifecycle run existing; hasil terlambat tidak diterapkan, meski tagihan provider belum tentu dibatalkan.
5. Tanpa credential/provider atau bila respons gagal, error ditampilkan dan prompt template tetap tersedia dengan sumber `template`. Demo memberi tahu bahwa AI Enhance memerlukan backend live. Teks yang benar-benar diterima dari provider diberi sumber `ai`; edit pengguna diberi sumber `manual`.

`MediaGenerationAdapter` menyediakan kontrak server untuk integrasi media mendatang. OpenAI Images API dan Gemini Interactions API (`gemini-omni-1.1-flash`) berstatus **Belum dikonfigurasi**. Tidak ada endpoint generasi media berbayar pada rilis ini, API key media di frontend, atau automation sesi login.

### API dan migrasi Creative

Terapkan seluruh migrasi termasuk **`0005_creative_prompt_studio.sql`** sebelum Worker baru. Migrasi additive menambah `studio_asset_references` dengan foreign key ke proyek/file dan index file; backfill aman pada data existing. Tidak mengubah durasi atau schema UGC lama. Save proyek, relasi file, dan ekspor draft dilakukan dalam satu batch D1 dengan compare-and-swap revision. Foreign key melindungi race attach/delete. Riwayat aktif mempertahankan relasi aset lama. Endpoint file existing juga melindungi referensi dalam snapshot Content Library.

| Endpoint | Kegunaan |
| --- | --- |
| `POST /api/studio/projects` dengan `creative: true` | Proyek Creative default |
| `POST /api/studio/projects/:id/creative` | `{expectedRevision, command}`; init/globals/storyboard/scene/generate/editPrompt/asset/duplicate/restore/approve/preset/export |
| `POST /api/studio/projects/:id/creative/enhance` | `{expectedRevision, runId, sceneId, kind}`; kind image/video/story/review |
| Endpoint read/cancel/character/agent/file existing | Dipakai ulang, tidak membuat auth/storage/agent engine kedua |

Semua mutasi memakai sesi/Origin, Zod dan batas payload 64 KiB existing. Upload maksimum 50 MB dengan gambar maksimum 5 MB, MIME/signature dicek. React merender prompt sebagai plain text; tidak ada HTML dari prompt. Error provider tidak menyertakan credential. Auth tetap workspace pemilik tunggal sesuai Agency existing, bukan multi-tenant baru.

### Troubleshooting

- **Prompt stale:** simpan edit, buat ulang gambar bila input visual berubah, lalu video setelah first-frame terhubung. Review dan approve ulang. Mengganti klip video membatalkan approval tanpa mengubah prompt geraknya.
- **HTTP 409:** proyek/agen/profil berubah di tab lain atau ada run aktif. Muat ulang, periksa hasil terbaru, hentikan run bila perlu, kemudian terapkan ulang edit. Jangan mengulang request dengan revision palsu.
- **Provider gagal:** periksa Settings, model, key/binding dan kuota. Template tetap tersedia; tidak ada fallback AI diam-diam.
- **Upload ditolak:** gunakan format/MIME benar, batas ukuran sesuai, dan video yang metadata-nya dapat dibaca browser. File SVG/HTML ditolak. Studio tidak mentranskode media.
- **Aset tidak bisa dihapus:** masih digunakan proyek, riwayat, karakter, atau Content Library. File manager tidak membuang media yang masih dirujuk.
- **AI usulan usang:** scene/konteks berubah sejak generasi. Tolak usulan dan ulangi Enhance pada konteks terbaru.
- **Backend belum siap:** jalankan migrasi `0001` sampai `0005`, periksa binding DB/FILES dan secrets; `/api/ready` memeriksa schema relasi baru.
- **Sandbox cache tidak bisa ditulis:** gunakan `NPM_CONFIG_CACHE=/tmp/byga-npm-cache` dan `XDG_CONFIG_HOME=/tmp/byga-config`; tidak perlu mengubah `HOME` atau membaca `.dev.vars` asli.

### Build dan deployment Cloudflare

```sh
npm ci
npm test
npm run build
npm run test:e2e
npm run worker:check
npm run test:creative:smoke # storage Wrangler lokal terisolasi, tanpa produksi
npm run db:migrate:local
npm run worker:dev -- --port 8787
```

Vite meneruskan `/api` ke Worker lokal. Gunakan `.dev.vars.example` untuk secrets lokal Anda sendiri; jangan commit `.dev.vars`. Resource produksi, token dan master encryption key tetap memakai konfigurasi existing. PR menjalankan validasi CI; deploy hanya oleh workflow existing setelah merge/push ke `main` atau dispatch produksi yang disetujui pemilik. Pada sesi implementasi ini tidak dilakukan deploy produksi, merge, atau perubahan secrets/resource Cloudflare. Lihat [PRODUCTION.md](PRODUCTION.md) sebelum menjalankan deployment.
