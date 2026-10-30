# Creative Prompt Studio — audit dan delivery

## Sumber dan scope

- Repository: `harvey-moeid/byga-agency`.
- Branch sumber: `main`, SHA **`ef381f95bead2d0b30eedba2d9121136b625fb62`**.
- Branch implementasi: **`feat/agency-creative-prompt-studio`**.
- Scope: menambah workflow prompt dan impor media ke Agency existing. Tidak melakukan rewrite, merge, push main, deploy produksi, perubahan secrets, atau perubahan resource Cloudflare.

## Audit arsitektur dan keputusan

| Area yang diperiksa | Temuan / penggunaan ulang |
| --- | --- |
| `src/App.tsx`, Office, domain | Sidebar/routing dan mode demo/live existing; menu Creative additive. Kantor 3D tidak diubah. Content Library menampilkan snapshot Creative dan link proyek sumber. |
| `UGCGenerator.tsx`, `ugc.ts` | Generator lama dan durasi union 5/8/10 dipertahankan. Profil Omni 4/6/8/10 terpisah; konversi eksplisit membuat data Creative tambahan. |
| `StudioUI.tsx`, `studio.ts`, `useStudio.ts` | Pakai ulang state proyek, revision, daftar ringkasan, akun, profil karakter, lima agen, run/cancel, callback draft dan isolasi demo/live. UI UGC tetap menampilkan proyek UGC, termasuk proyek lama yang sudah dikonversi secara eksplisit ke Creative (origin `ugc`). |
| `aiProviders.ts`, `worker/ai.ts` | Delapan provider/model/credential existing tanpa provider engine baru. Enhance memakai `aiText` dan instruction agen existing. Output sebagai proposal yang harus diterapkan pengguna. |
| `storage.ts`, `api.ts`, `media.ts` | Demo memakai IndexedDB/localStorage existing; live memakai API/session existing. Metadata video dibaca browser. |
| `worker/index.ts`, `worker/security.ts`, `worker/env.ts` | Hono/auth/Origin/bodyLimit/cookie/enkripsi existing dipakai ulang. MIME/signature upload diperiksa dan asset access tetap authenticated. |
| `worker/studio.ts`, `worker/db.ts` | CAS revision dan batch D1; proyek JSON existing. Pembuatan draft/relasi media atomik dengan update proyek, serta FK mencegah dangling asset akibat attach/delete bersamaan. Publishing tidak diubah. |
| `migrations/`, `tests/`, CI, Wrangler, docs | Migration additive `0005`, schema readiness baru, unit/integration/browser dan smoke lokal. Workflow PR/main dan konfigurasi resource produksi dipertahankan. |

Sumber upstream yang diperiksa: [Universal Prompt Studio](https://github.com/thinkrtank/universal-prompt-studio) dan [Gemini Omni Video Skills](https://github.com/jggomez/gemini-omni-video-skills), termasuk kedua LICENSE (MIT). Tidak menyalin kode/aset. Desain native BYGA mengambil ide builder terstruktur, model capabilities, kontinuitas dan timing/audio yang konkret. Capability dan ID model diverifikasi dari [Flow](https://support.google.com/flow/answer/16352836) dan [Gemini Omni](https://ai.google.dev/gemini-api/docs/omni) pada 30 Oktober 2026.

## Implementasi utama

- Enam tahap Studio responsif, scene timeline/status/progress, indikator simpan/loading/error, draft editor bertahan antar bagian.
- Prompt gambar deskriptif dengan 11 preset, seluruh field visual, bahasa/rasio/negative constraints, custom preset manager, edit/copy/export TXT/JSON.
- Prompt video first/last/references, gerakan subjek/kamera, continuity/physics, audio/dialog/voice/SFX/timing, durasi dan rasio capability.
- Storyboard default 5×6 detik; scene dapat diedit/regenerate/duplicate/restore/approve secara mandiri. Perubahan karakter/scene/gambar menandai prompt terkait stale.
- Profil karakter `studio_characters` diperluas secara optional; character/environment lock terpisah, reference upload/reuse, stale sync pada reload.
- Upload R2 image/video, preview/download, link aset existing, pergantian aset dan perlindungan histori. Tidak menyimpan byte media di D1.
- Empat peran kreatif memakai agen Agency existing. AI Enhance hanya atas klik pengguna, dapat dibatalkan, menyajikan proposal dan error provider secara eksplisit. Template tidak bergantung AI.
- Draft Content Library berupa snapshot immutable, deduplikasi versi yang sama, approval setiap scene; video final tetap mengikuti review/publishing Agency.
- UI menyatakan transfer manual ke ChatGPT/Flow. Media API hanya memiliki kontrak adapter, berstatus Belum dikonfigurasi; tidak ada endpoint generate media palsu.

Dependency CI juga dipatch: Vite 6.4.5, Vitest 4.1.12, Zod 4.6.7, dan override Undici 7.30.1 (major tetap). Audit awal menemukan tujuh advisory pada lockfile sumber; setelah patch, `npm audit --audit-level=moderate` melaporkan 0 vulnerability. Tidak menggunakan `npm audit fix --force` atau downgrade Miniflare.

## File utama

`src/CreativeStudio.tsx`, `src/creative.ts`, `src/creative.css`, `src/creativeMedia.ts`, `src/App.tsx`, `src/StudioUI.tsx`, `src/studio.ts`, `src/useStudio.ts`, `src/domain.ts`, `worker/studio.ts`, `worker/index.ts`, `migrations/0005_creative_prompt_studio.sql`, `tests/creative.test.ts`, `tests/creative-api.test.ts`, `tests/e2e/creative.spec.ts`, `scripts/smoke-creative-local.mjs`, README dan docs Studio/Status/Integrations.

## Database

`0005_creative_prompt_studio.sql` membuat `studio_asset_references(project_id,file_id)` dengan composite PK, FK ke `studio_projects` (cascade) dan `files` (restrict), serta index `file_id`. Backfill hanya relasi ID aset yang sudah ada. Dokumen Creative tetap berada di kolom JSON proyek existing; metadata/snapshot draft tetap di `contents`. Tidak mengubah migration `0001–0004`, byte R2 lama atau durasi UGC. Readiness memerlukan tabel baru.

## Bukti pengujian

Hasil verifikasi lokal setelah clean install dan patch dependency:

| Perintah | Hasil |
| --- | --- |
| `npm ci` | Lulus, lockfile sinkron (cache diarahkan ke `/tmp` pada sandbox) |
| `npm audit --audit-level=moderate` | Lulus, 0 vulnerability |
| `npm test` | Lulus, **149 tes / 14 file** |
| `npm run build` | Lulus, TypeScript dan Vite production build |
| `npm run test:e2e` | Lulus, **30 tes**; tambahan regresi konversi UGC juga lulus lewat run terarah (**1 tes**) |
| `npm run worker:check` | Lulus, bundle Worker dry-run dengan DB/FILES/ASSETS |
| `npm run test:creative:smoke` | Lulus, Wrangler lokal + migrasi + D1/R2 terisolasi |
| `git diff --check` | Lulus |

Vite melaporkan warning annotation `@__PURE__` dari Zod upstream; bundling tetap lulus. Tes browser memakai Chromium software/emulasi viewport, bukan perangkat Android fisik. Kegagalan awal sandbox (cache read-only / localhost networking) diperbaiki dengan direktori cache writable dan izin jaringan tool. Satu run E2E lama memakai server dari run yang dibatalkan dan kehilangan koneksi; run bersih berikutnya lulus seluruh suite. Tidak ada assertion perilaku yang dihapus untuk menghasilkan hijau.

Pengujian mencakup:

| Kebutuhan | Bukti |
| --- | --- |
| Generator gambar/video tanpa API, nonempty, field pengguna, durasi/rasio/bahasa | Unit `creative.test.ts`; browser memastikan tidak ada panggilan generate AI |
| UGC lama dan default 5×6 | Unit konversi eksplisit dan tests UGC existing; browser legacy navigation |
| Lock/stale/revisi independen | Unit, D1 integration, revisi per scene dalam workflow browser |
| Upload gambar/video, MIME/signature/size | Unit validation; actual byte fixture ke R2 lokal dan authenticated preview |
| D1/R2/pemulihan proyek | Integration Miniflare dan proses Wrangler lokal yang terpisah |
| Copy/edit/preset/TXT/JSON | Unit dan browser export/download/clipboard |
| Provider missing key, fallback | Integration backend tanpa credential; template tetap berlabel template |
| Enhance/approval/cancel/injection boundary | Request/response provider simulasi, assert fixed system instructions dan data user terpisah; run terlambat ditolak |
| Auth/authorization/Origin/CAS | Integration sesi valid/tidak valid, origin ditolak, stale revision 409, draft batch/FK |
| Mobile 320/360/390/430 | Browser Chromium emulated viewport, seluruh enam tahap tanpa overflow, edit/reload/legacy navigation |
| Kantor 3D, UGC, library, approval/jadwal/admin | Suite regresi existing lengkap |

Smoke: `npm run test:creative:smoke` membuat konfigurasi/secrets dummy dan storage di direktori sementara, menjalankan migration lokal dan Wrangler lokal port 8789, lalu menguji auth → project → first-frame/video R2 bytes → template → approval → draft → reload. Tidak memakai `.dev.vars` asli atau resource produksi.

## Batas bukti dan operasional

- Mesin template dan aplikasi/browser/storage lokal diuji dengan kode nyata. Fixture PNG/MP4 merupakan media tes; pengujian tidak membuktikan kualitas render generatif atau kesesuaian panjang klip dengan scene.
- Provider teks memakai fetch mock tanpa jaringan keluar. Belum ada uji provider berbayar live, ChatGPT image generation, Google Flow generation, OpenAI Images/Gemini Interactions, atau publishing TikTok live.
- Lock membantu mengulang identitas tekstual, bukan jaminan wajah/gerakan/timing 100%. Arahan pengguna berbahasa asing tetap dipertahankan; mesin template bukan penerjemah bebas.
- Berpindah enam bagian mempertahankan edit dalam memori; reload memulihkan perubahan yang sudah disimpan. Demo file hanya di browser asal. Auth workspace pemilik tunggal existing tetap berlaku.
- Video per scene tidak digabungkan otomatis. Pengguna merangkai klip dan upload video final ke Content Library untuk review/publish. Approval Creative tidak memberi consent TikTok.
- Maksimum 12 scene, 20 preset custom, 60 snapshot revisi per scene, dokumen 1,5 MB, metadata mutasi 64 KiB; batas menolak penulisan tanpa memangkas histori. Daftar proyek memakai 100 ringkasan terbaru existing.
- Kesiapan produksi tetap memerlukan migrasi `0005`, binding/secrets existing dan review PR. Tidak ada deployment produksi atau merge otomatis pada sesi ini.
