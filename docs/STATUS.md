# Status implementasi Byga Agency

Audit dan penyelesaian: 12 Oktober 2026. Implementasi MVP tersedia dalam checkout ini; koneksi produksi belum dinyatakan terverifikasi. Bukti pengujian ada di [VALIDATION.md](VALIDATION.md).

| Bagian PRD             | Implementasi saat ini                                                                                                                   | Validasi                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Kantor interaktif      | Lima ruang, avatar manusia MIT, navigasi pintu/koridor, animasi kerja, tur, orbit, pause, reduced motion dan fallback 2D                | Unit routing/GLB dan browser; gerak kini konsisten pada frame rate rendah     |
| Konten dan approval    | Brief/referensi → caption/prompt → edit → upload video → review → approval; consent TikTok dan versi konten diperiksa                   | Demo/browser, kontrak API simulasi, Worker/D1/R2 lokal                        |
| Multi-akun dan jadwal  | Akun terpisah, kalender drag-and-drop, form jadwal mobile dan timezone; perubahan jadwal/revisi membatalkan antrean secara atomik       | Browser desktop/mobile, persistensi, tes perubahan bersamaan                  |
| TikTok publish         | OAuth sekali pakai, token terenkripsi/refresh, batas creator, upload, lease, retry/backoff, rekonsiliasi hasil; tidak memalsukan sukses | API simulasi; menunggu credential dan izin produk TikTok untuk uji nyata      |
| Riset/AI/analytics     | Research API dengan pagination tersimpan, RSS Google Trends, draft otomatis, histori views/likes dan rekomendasi                        | Parsing/domain, AI/riset/analytics API simulasi; provider nyata belum diuji   |
| Notifikasi dan retensi | Discord/Telegram, lease, retry terbatas, pembersihan histori dan receipt cron                                                           | API simulasi dan migrasi lokal; belum mengirim pesan nyata                    |
| Hosting/CI             | Build frontend + Worker, migrasi D1, script deploy, workflow GitHub production dan observability Worker                                 | Build dan pemeriksaan deploy lokal; produksi/domain belum diuji pada sesi ini |

Perbaikan audit ini mencakup penolakan edit/approval usang (HTTP 409), pengikatan consent/token ke creator yang disetujui saat OAuth berganti, perlindungan publish terhadap revisi bersamaan, penolakan GLB sebagai video review, byte-range video yang benar (206/416), deduplikasi cron, pengiriman notifikasi paralel, settings live setelah login, expiry sesi, isolasi demo/live, serta gerak avatar pada perangkat dengan frame rate rendah. Mode 3D ringan untuk mobile/renderer software mengurangi resolusi dan menonaktifkan shadow; pengguna dapat mengganti kualitas melalui kontrol kantor.

Sebelum mengaktifkan produksi, seluruh migrasi termasuk `0003_job_safety.sql` harus diterapkan; Worker secrets, resource D1/R2, credential provider dan approval produk TikTok harus tersedia. Setelah itu, validasi satu akun dan satu video yang disetujui pengguna sampai publish dan analytics terkonfirmasi. Aktifkan cron AI/notifikasi hanya setelah konfigurasi masing-masing siap.

Furnitur masih prosedural. Avatar realistis sudah dibundel; facial animation tambahan dan pengukuran performa pada HP fisik belum dilakukan. Form jadwal mobile telah diuji; drag native melalui sentuhan dan auto-scroll belum diklaim didukung. Multi-platform di luar TikTok dan multi-tenant berada di luar MVP yang diputuskan PRD.
