# RollPley Frontend

RollPley adalah aplikasi pengolahan payroll. Frontend ini menyediakan antarmuka untuk mengunggah PDF, meninjau hasil pencocokan karyawan, memeriksa rekonsiliasi, dan mengunduh file bank setelah finalisasi.

Frontend menggunakan Next.js App Router, TypeScript, dan Redux Toolkit Query. Backend Go menangani pemrosesan payroll dan pembuatan Excel. Supabase Auth menangani login.

## Prasyarat

- Node.js `>=20.0.0` (dikembangkan dengan `22.22.2`).
- pnpm `10.13.1` (dipin melalui field `packageManager` di `package.json`; dapat dipasang dengan `corepack enable && corepack prepare pnpm@10.13.1 --activate` atau Corepack bawaan Node 20+).
- Akses ke backend Go dan proyek Supabase untuk development.
- Akun development Supabase dengan backend admin profile untuk menguji halaman payroll.

## Menjalankan secara lokal

```bash
git clone https://github.com/hendychrist/rollpley-fe.git
cd rollpley-fe
pnpm install --frozen-lockfile
test -e .env.local || cp .env.example .env.local
```

Isi `.env.local` dengan konfigurasi development. Jika backend Go berjalan di port `8080`, gunakan URL API `http://localhost:8080/api/v1` sesuai tabel konfigurasi di bawah. Untuk akses lintas origin dari browser, backend perlu mengizinkan origin `http://localhost:3000` melalui `CORS_ALLOWED_ORIGINS` (konfigurasi backend, bukan frontend).

```bash
pnpm dev
```

Buka [http://localhost:3000](http://localhost:3000). Untuk uji alur payroll, masuk dengan akun development dan gunakan PDF sintetis. Validasi alur dari unggah hingga unduh file bank jika backend development sudah tersedia.

## Struktur project

| Lokasi | Isi |
|---|---|
| `app/` | Halaman, layout, dan rute Next.js |
| `components/` dan `styles/` | Komponen UI dan styling |
| `redux/` | Store dan integrasi API melalui RTK Query |
| `hooks/` | Logika yang dipakai oleh komponen |
| `lib/`, `utils/`, `type/`, dan `validations/` | Integrasi, utilitas, tipe, dan validasi |
| `public/` | Aset statis aplikasi |
| `docs/` | Matriks uji error-state dan acceptance matrix |

## Variabel environment

Semua variabel bersifat publik (`NEXT_PUBLIC_*`) dan dibaca dari browser setelah build.

| Variabel | Kegunaan | Wajib | Contoh aman |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL backend Go; sudah termasuk `/api/v1` karena client API tidak menambah path tersebut | Ya (default `http://localhost:8080/api/v1` bila kosong) | `http://localhost:8080/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase untuk autentikasi | Ya | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key Supabase (aman untuk browser; bukan service-role key) | Ya | `sb_pub....` |

Jangan letakkan database URL, secret key, service-role key, atau kredensial backend di frontend.

## Pemeriksaan sebelum commit

```bash
pnpm lint
pnpm build
pnpm type-check
```

Self-check validasi (logika murni, tanpa API):

```bash
node validations/master-import-files.selfcheck.mjs
node validations/master-import-review-selfcheck.mjs
node validations/payroll-export-downloads.selfcheck.mjs
node validations/payroll-export-retry.selfcheck.mjs
node validations/review-queue-collapse.selfcheck.mjs
```

## Konfigurasi saat deploy

Isi variabel environment di platform hosting sebelum build. Variabel `NEXT_PUBLIC_*` yang digunakan aplikasi dapat dibaca dari browser. Gunakan endpoint backend HTTPS untuk deployment dan izinkan origin frontend di konfigurasi CORS backend. Simpan kredensial backend, master Excel, PDF payroll asli, dan hasil ekspor di penyimpanan privat.

## Referensi tambahan

- [`docs/ERROR_STATE_TEST_MATRIX.md`](docs/ERROR_STATE_TEST_MATRIX.md) — cakupan state error dan aturan fault injection.
- [`docs/PHASE10_ACCEPTANCE_MATRIX.md`](docs/PHASE10_ACCEPTANCE_MATRIX.md) — matriks acceptance full-stack (fase 10).
- [`CHANGELOG_FIXES.md`](CHANGELOG_FIXES.md) — riwayat perbaikan yang terverifikasi.
