# Pembaruan UI dan model AI

Pembaruan 17 Oktober 2026 menggunakan sistem visual bersama di `src/premium.css`: hijau gelap, ivory, aksen sage/gold, font lokal Manrope dan DM Sans, kartu dengan border/shadow halus, serta kontrol dan fokus yang konsisten.

## Pratinjau

- [Workspace desktop](premium-desktop.png)
- [Content library mobile, 390 × 844](premium-mobile.png)
- [Pengaturan AI](premium-ai-settings.png)

## Cakupan

Sepuluh halaman: Workspace, Proyek UGC, Riset & inspirasi, Content library, Prompt UGC, Kalender, Publishing, Analytics, File manager, dan Settings. Dialog, login, percakapan agen, storyboard, review, status, dan notifikasi memakai sistem visual yang sama.

Ponsel memperoleh navigasi bawah, pencarian library, kontrol sentuh minimal 44 piksel pada navigasi utama, kolom formulir satu lajur, font input 16 piksel untuk menghindari zoom otomatis, dan dukungan safe area. Kalender tetap dapat digeser horizontal tanpa membuat halaman melebar. Drawer memblokir interaksi latar, menjaga fokus, mendukung Escape dan klik latar, serta mengembalikan fokus ke pemicu saat ditutup. Gerakan menghormati preferensi reduced motion. Input file yang memiliki atribut `hidden` tetap tersembunyi; tombol upload File manager dapat diaktifkan dengan keyboard.

Settings memakai katalog bersama untuk tepat dua model per provider, dengan model default, deskripsi, ID, persyaratan credential dan tautan dokumentasi. Backend menolak kombinasi provider/model yang tidak tersedia. Pengaturan model lama dinormalisasi saat dibaca tanpa menghapus data atau credential. Lihat [integrasi AI](INTEGRATIONS.md#provider-ai) untuk seluruh 16 model dan perubahan adapter Groq/Gemini.

## Validasi

- `npm ci` memakai lockfile yang ada, tanpa perubahan dependency.
- `npm test`: 120 tes unit/integrasi API lulus, termasuk kedua model pada tujuh adapter HTTP, kegagalan provider, credential terenkripsi, penolakan kombinasi model, dan normalisasi pengaturan lama. Binding Workers AI yang belum tersedia diuji sebagai kegagalan konfigurasi.
- `npm run build`: typecheck frontend/backend/test dan bundle produksi lulus.
- Pengujian browser memeriksa seluruh sepuluh halaman pada lebar 320, 390, 768, dan 1440 piksel; heading tampil dan tidak ada overflow horizontal pada dokumen.
- 25 skenario E2E tervalidasi: 24 lulus pada suite akhir dan skenario draft lulus pada uji ulang setelah selector pencarian desktop dibuat spesifik (`exact: true`).
- Alur browser mencakup draft → edit → unggah video → approval → penjadwalan, persistensi, live login dengan API simulasi, pilihan kedua model, proyek/riwayat, percakapan agen, UGC, pencarian mobile, dan navigasi keyboard.

Pengujian berjalan di Chromium headless. API provider nyata belum dipanggil dengan credential pengguna; kuota, billing, izin model dan ketersediaan inferensi tetap mengikuti akun provider. Tampilan belum diuji pada perangkat fisik atau Safari. Perubahan ini tidak melakukan deployment produksi.
