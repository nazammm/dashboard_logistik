# Dashboard Logistik

Web monitoring pengiriman (ritase, tonase, armada, cakupan wilayah, lead time, komposisi muatan, rekon DO J028) — gaya & pola sama dengan web semen (SEMENTRACK). Data di **Supabase** (project `Logistic`), frontend **React + Vite + Tailwind + Chart.js + Leaflet**.

## Isi folder

```
supabase/
  SETUP_LENGKAP.sql          ⚠ jalankan sekali di SQL Editor project baru (gabungan semua migration + PIN awal)
  OPSIONAL_J028_DUMMY.sql    contoh data J028 (dummy) untuk mencoba Rekon DO — jalankan setelah import
  migrations/001…006         sumber yang sama, dipisah per bagian (untuk dibaca / versi)
frontend/                    aplikasi web (.env sudah berisi URL & publishable key project wygycegrybbnoosnupzn)
```

## 1. Setup database (sekali)

1. Supabase → project **wygycegrybbnoosnupzn** → SQL Editor → New query.
2. Tempel seluruh isi `supabase/SETUP_LENGKAP.sql` → Run (bila muncul peringatan operasi destruktif, lanjutkan — tidak ada data yang dihapus). Aman dijalankan ulang.
3. Buka web → **Import Data** → pilih `Logistik_PTK_Jan.xlsx` → isi PIN → Import. Zona otomatis dipetakan ke poligon kecamatan (47/47 untuk PTK Januari).
4. (Opsional) jalankan `OPSIONAL_J028_DUMMY.sql` untuk mencoba halaman Rekon DO sebelum ada J028 asli.

Alur ini sudah diuji dari database kosong: hasil import identik dengan Excel (checksum sama) dan pemetaan zona sama persis dengan hasil manual.

## 2. Jalankan lokal

```bash
cd frontend
cp .env.example .env      # isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY (publishable key)
npm install
npm run dev               # http://localhost:5174
```

## 3. Deploy ke Vercel

- Import repo → **Root Directory: `frontend`**, Framework: Vite, Build: `npm run build`, Output: `dist`.
- Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- `vercel.json` sudah berisi rewrite SPA (refresh di /transporter/... tidak 404).
- Sub-folder (mis. `/logistik/`)? set `VITE_BASE=/logistik/` saat build.

## 4. Menambah data cabang / bulan baru

Halaman **Import Data** → pilih Excel (format 46 kolom yang sama) → cek pratinjau (kolom dikenali, rentang tanggal, kode cabang ditebak dari kode salesman) → isi PIN → Import.
- Import bersifat **ganti**: baris cabang itu pada rentang tanggal file dihapus dulu → aman diulang, tidak dobel.
- Setelah import otomatis: master produk/zona/transporter/gudang diperbarui (via `lg_sync_master`), zona baru dipetakan ke kecamatan (nama → poligon GADM). Zona yang gagal cocok diatur di **Master Data → Zona**.
- Cabang baru: isi provinsinya di tabel `lg_cabang.provinsi` (mis. `{Jambi}`) agar pencocokan kecamatan lebih tepat.

PIN dibagikan terpisah; ganti di **Import Data → Riwayat & PIN**.

## 5. Definisi angka

| Istilah | Definisi |
|---|---|
| Ritase | 1 FOAD (cabang + tipe + No. FOAD) = 1 truk berangkat sekali dari 1 gudang |
| Titik bongkar | 1 SJ (untuk Gudang→Gudang yang tak punya SJ: 1 SOM) |
| Tonase | hanya produk kategori SEMEN: qty × ton/unit (zak 50 kg = 0,05; curah = 1) |
| Ton/ritase | total ton ÷ ritase yang membawa semen |
| Lead time | Tgl Terima SJ Toko − DO Date (Order Date di file = tanggal kirim) |
| SJ balik | Tgl Terima SJ DoPlanner − Tgl Terima SJ Toko |
| Lama muat (proxy) | jeda antar-selesai-muat di gudang yang sama, hari yang sama (data belum punya jam mulai muat) |
| Rekon DO | per DO No. + Product Code: J028 vs total dikirim |

## 6. Catatan teknis

- Nilai unik penting diekstrak lewat **view** `v_dim_*` & `v_periode` (dropdown, ketersediaan data, master).
- View berat (`v_ritase`) difilter dengan **rentang `tanggal`** agar filter terdorong ke indeks `(cabang, order_date)` — 1 hari ±20 ms, 1 bulan ±0,3 s.
- `v_bulanan*` & `v_do_rekon` menghitung seluruh histori cabang; bila data sudah bertahun-tahun, jadikan materialized view yang di-refresh setelah import.
- Peta: poligon kecamatan GADM 4.1 (disederhanakan) di `frontend/public/geo/`, basemap Esri.
- Semua tulis data lewat RPC `SECURITY DEFINER` + PIN (bcrypt, jeda 1,5 s saat salah). Tabel hanya bisa dibaca anon (RLS select).

## 7. Data yang masih dummy / dibutuhkan

Dummy (ditandai di web): **koordinat gudang**, **data J028**.
Dibutuhkan: jam masuk/mulai muat per FOAD, area kontrak transporter (kecamatan + ring), master transporter (grup, jenis, kapasitas), kapasitas unit, koordinat gudang asli, export J028 asli, konfirmasi arti DOS / SDO / Est. Delv. Date.
