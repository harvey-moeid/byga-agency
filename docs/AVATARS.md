# Avatar dan kantor hidup

Kantor membundel **lima avatar manusia bertekstur dan memiliki skeletal rig**: Aria, Nova, Kai, Leo dan Iris. Model berasal dari [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9`, berlisensi MIT. Copyright dan izin lengkap disertakan di [LICENSE-Rocketbox.txt](../public/avatars/LICENSE-Rocketbox.txt). Portrait juga dirender dari model yang sama.

Semua GLB dan tekstur tersedia lokal; tidak membutuhkan CDN, akun avatar, API key atau OAuth. Lima GLB berjumlah sekitar **10 MB**, dibanding sekitar 24 MB sebelum optimasi. Tekstur opaque memakai JPEG, transparansi rambut tetap dipertahankan. Animasi disederhanakan dengan batas error quaternion 0,004 radian. Checksum, model sumber dan nama clip tersimpan di [manifest](../public/avatars/manifest.json), diverifikasi tes.

## Gerakan dan interaksi

- Lima clip per avatar: `Idle`, `Walk`, `Read`, `Present`, `Type`. Transisi menggunakan crossfade 0,32 detik.
- Nova dan Leo mengetik sambil duduk; tangan diarahkan ke keyboard dengan IK. Aria dan Kai meninjau tablet yang mengikuti tangan. Iris memakai gerakan presentasi/analisis.
- Nova berjalan ke ruangan yang dipilih atau mengikuti ruang aktivitas dashboard. Rute melewati pintu terbuka dan koridor; arah badan berubah halus, kecepatan bertambah dan berkurang saat berangkat/tiba.
- **Tur kantor** mengunjungi lima ruang bergiliran. Memilih ruang menghentikan perpindahan otomatis sampai pilihan ruang ditutup. Tur adalah visualisasi, tidak menjalankan tugas AI atau membuat aktivitas bisnis palsu.
- Auto-focus dapat mengikuti Nova. Orbit manual menghentikan gerak kamera otomatis sampai Auto-focus diaktifkan kembali atau kamera direset.
- **Jeda animasi** membekukan gerakan. Preferensi sistem `prefers-reduced-motion` memulai kantor dalam keadaan dijeda. Model gagal dimuat mendapat silhouette; navigasi dan dashboard tetap berfungsi.
- Mode **3D ringan** otomatis aktif pada layar mobile dan renderer software (SwiftShader/llvmpipe): DPR 0,75, tanpa shadow dan bayangan kontak. Tombol kualitas dapat beralih ke rendering penuh. Pada kualitas penuh, DPR dibatasi, bayangan kontak dirender sekali dan directional shadow mengikuti avatar. Rendering berhenti ketika dialog konten/agen terbuka, sehingga 3D tidak bersaing dengan upload dan review video. Kualitas dan frame rate pada perangkat fisik masih perlu pengukuran.
- Perpindahan diintegrasikan dalam langkah kecil dan memakai waktu frame yang berlalu, sehingga frame rate rendah tidak memperlambat avatar secara proporsional. Jeda panjang dibatasi satu detik per frame agar kembali dari tab background tidak memindahkan avatar sekaligus melalui seluruh kantor.

Aset ini realistis dalam proporsi dan tekstur manusia; kualitasnya bukan karakter sinematik fotoreal dengan facial capture. Furnitur kantor tetap memakai geometri buatan aplikasi. Nama agen merupakan karakter dashboard, tidak mengidentifikasi orang pada model sumber.

## Model kustom

Settings → Avatar GLB dapat mengganti Nova dengan model embedded berlisensi milik pengguna. Skeleton di-clone agar animasi terpisah. Clip dipilih menurut nama, dengan fallback idle; model tanpa clip yang sesuai tetap statis. IK untuk keyboard diterapkan pada rig Rocketbox bawaan, bukan retargeting otomatis untuk seluruh rig kustom.

## Memperbarui aset (opsional)

GLB siap pakai sudah dibundel; setup npm/build biasa tidak memerlukan Blender atau mengunduh sumber kembali. Untuk membuat ulang, gunakan Python 3 dengan Pillow, curl dan Blender 4.3:

```sh
python3 scripts/avatars/fetch.py /tmp/byga-avatar-source
blender -b -t 2 --python scripts/avatars/build.py -- /tmp/byga-avatar-source
python3 scripts/avatars/optimize.py
# Setelah Vite aktif dan Chromium tersedia:
node scripts/avatars/portraits.mjs
npm test
```

Source FBX/TGA yang diunduh sekitar 213 MB. Downloader memeriksa SHA-256 sebelum memakai file. `build.py` menyesuaikan orientasi tulang animasi ke proporsi tiap skeleton dan menghapus perpindahan horizontal bawaan clip; pengontrol rute memiliki posisi avatar. Hasil ekspor dioptimalkan kemudian checksum manifest diperbarui. Portrait tidak memerlukan layanan gambar eksternal.
