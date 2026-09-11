# StockTrack — Rekapitulasi Jual Beli Saham

Aplikasi web pelacak portofolio & jurnal transaksi saham. Dibangun dengan
React + Vite + Tailwind CSS + Recharts, dengan database SQLite lokal
(otomatis) atau Supabase (Postgres, online, sinkron lintas perangkat).

## 1. Setup lokal

Butuh Node.js 18+.

```bash
npm install
npm run dev
```

Buka `http://localhost:5173` di browser. Coba semua fitur (tambah transaksi,
lihat dashboard, dll) sebelum lanjut ke langkah berikutnya.

## 2. Upload ke GitHub

Proyek ini sudah berisi git repository lokal (folder `.git`) dengan commit
pertama, jadi Anda tinggal menghubungkannya ke GitHub:

1. Buka [github.com/new](https://github.com/new), buat repository baru.
   **Jangan** centang "Add a README file" / ".gitignore" / "license" agar
   tidak bentrok dengan file yang sudah ada di proyek ini.
2. Salin URL repo yang muncul (bentuknya
   `https://github.com/USERNAME/NAMA-REPO.git`).
3. Di terminal, masuk ke folder proyek ini, lalu jalankan:

   ```bash
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git branch -M main
   git push -u origin main
   ```

4. Refresh halaman GitHub — semua file proyek sudah tampil di sana.

Setelah ini, setiap kali Anda mengubah kode dan ingin menyimpan versi baru:

```bash
git add .
git commit -m "Deskripsi perubahan"
git push
```

## 3. Setup database online (Supabase)

Tanpa langkah ini, data hanya tersimpan di satu browser (SQLite lokal via
sql.js). Untuk data yang sinkron di semua perangkat:

1. Buat akun & proyek baru gratis di [supabase.com](https://supabase.com).
2. Buka **SQL Editor** di dashboard Supabase → New Query.
3. Salin seluruh isi file `supabase-schema.sql` (sudah ada di folder ini),
   tempel, klik **Run**. Ini membuat 5 tabel yang dibutuhkan aplikasi.
4. Buka **Project Settings → API**, salin **Project URL** dan **anon public
   key**. Simpan dulu, dipakai di langkah 5.

⚠️ **Catatan keamanan**: skema ini memakai kebijakan akses "semua
diperbolehkan" lewat anon key (karena aplikasi tidak punya sistem login).
Cocok untuk pemakaian pribadi/solo. Jangan sebarkan anon key Anda secara
publik (misalnya commit ke repo GitHub publik).

## 4. Deploy ke Netlify

### Opsi A — Lewat GitHub (disarankan — auto-deploy tiap `git push`)

1. Login ke [app.netlify.com](https://app.netlify.com).
2. Klik **Add new site → Import an existing project → Deploy with GitHub**,
   izinkan akses, lalu pilih repo yang dibuat di langkah 2.
3. Netlify otomatis mendeteksi build command & publish folder dari
   `netlify.toml` (`npm run build` → `dist`). Klik **Deploy site**.
4. Setelah selesai build (1–2 menit), Netlify memberi URL publik (mis.
   `nama-acak-123.netlify.app`). Mulai sekarang, setiap `git push` ke `main`
   otomatis memicu build & deploy ulang — tidak perlu upload manual lagi.

### Opsi B — Drag & drop (tanpa GitHub, paling cepat untuk sekali coba)

```bash
npm run build
```

Buka [netlify.com/drop](https://app.netlify.com/drop), seret folder `dist/`
ke halaman tersebut untuk mendapat URL publik instan.

## 5. Hubungkan aplikasi ke Supabase

Buka URL Netlify Anda (dari langkah 4), klik tombol **"Setting Fee &
Database"** di header, tempel **Project URL** dan **anon key** dari langkah 3
di bagian **Database Online (Supabase)**, klik **Hubungkan**. Indikator di
header akan berubah dari "Lokal" menjadi "Online".

## 6. Akses dari perangkat lain

Buka URL Netlify yang sama di HP/laptop lain, masukkan Project URL & anon
key yang sama seperti di langkah 5 — data transaksi otomatis muncul sama
persis karena tersimpan di Supabase, bukan di satu browser saja.

## Struktur folder

```
stocktrack-app/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── netlify.toml             ← konfigurasi build otomatis untuk Netlify
├── supabase-schema.sql      ← jalankan ini di Supabase SQL Editor
├── LICENSE                  ← MIT, bebas diubah/dihapus sesuai kebutuhan
└── src/
    ├── main.jsx
    ├── index.css
    └── App.jsx              ← seluruh logika & tampilan aplikasi
```
