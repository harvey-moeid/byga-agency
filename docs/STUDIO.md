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
