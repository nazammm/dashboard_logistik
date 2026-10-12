-- =====================================================================
-- LOGISTRACK — skema database logistik (Supabase / PostgreSQL 15+)
-- 001: tabel inti, master, fungsi bantu
-- =====================================================================
create schema if not exists lg_private;
revoke all on schema lg_private from public;

-- ---------------------------------------------------------------------
-- Fungsi bantu (immutable, dipakai view & import)
-- ---------------------------------------------------------------------

-- Label jenis kirim dari SOMType: 'GUDANG - TOKO (04)' -> 'Gudang → Toko'
create or replace function public.lg_label_kirim(p text) returns text
language sql immutable as $$
  select case when p is null or btrim(p) = '' then 'Tidak diketahui'
    else initcap(lower(regexp_replace(regexp_replace(btrim(p), '\s*\(\s*\d+\s*\)\s*$', ''), '\s*-\s*', ' → ', 'g'))) end
$$;

-- Kode SOMType: 'GUDANG - TOKO (04)' -> '04'
create or replace function public.lg_kode_kirim(p text) returns text
language sql immutable as $$ select coalesce(substring(p from '\(\s*(\d+)\s*\)'), '') $$;

-- 'DALAM  KOTA' / 'luar kota' -> 'DALAM KOTA' / 'LUAR KOTA'
create or replace function public.lg_norm_dalam_luar(p text) returns text
language sql immutable as $$
  select case when p is null or btrim(p) = '' then 'TIDAK DIKETAHUI'
              when upper(p) like '%LUAR%' then 'LUAR KOTA'
              when upper(p) like '%DALAM%' then 'DALAM KOTA'
              else upper(regexp_replace(btrim(p), '\s+', ' ', 'g')) end
$$;

-- Plat nomor dinormalisasi: 'KB 8660 HA' & 'KB8660HA' -> 'KB8660HA'
create or replace function public.lg_norm_plat(p text) returns text
language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '') $$;

-- Tampilan plat: 'KB8660HA' -> 'KB 8660 HA'
create or replace function public.lg_fmt_plat(p text) returns text
language sql immutable as $$
  select case when p ~ '^[A-Z]{1,2}[0-9]{1,4}[A-Z]{0,3}$'
    then btrim(regexp_replace(p, '^([A-Z]{1,2})([0-9]{1,4})([A-Z]{0,3})$', '\1 \2 \3')) else p end
$$;

-- Nama sopir dinormalisasi (spasi ganda, huruf besar)
create or replace function public.lg_norm_nama(p text) returns text
language sql immutable as $$ select nullif(upper(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))), '') $$;

-- Zona transporter: 'KEC. PONTIANAK BARAT - RING 2.0' -> kecamatan 'PONTIANAK BARAT', ring 2.0
create or replace function public.lg_zona_kecamatan(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(upper(coalesce(p, '')), '\s*-\s*RING\s*[0-9.,]+\s*$', ''), '^\s*(KEC(AMATAN)?\.?)\s*', '')), '')
$$;
create or replace function public.lg_zona_ring(p text) returns numeric
language sql immutable as $$ select nullif(replace(substring(upper(coalesce(p, '')) from 'RING\s*([0-9]+(?:[.,][0-9]+)?)'), ',', '.'), '')::numeric $$;

-- Konversi teks -> tanggal yang toleran format (ISO, dd/mm/yyyy, '02 Jan 2026', serial Excel)
create or replace function public.lg_to_date(p text) returns date
language plpgsql immutable as $$
declare s text := btrim(coalesce(p, ''));
begin
  if s = '' or s = '-' then return null; end if;
  if s ~ '^\d{4}-\d{2}-\d{2}' then return substring(s from 1 for 10)::date; end if;
  if s ~ '^\d{1,2}/\d{1,2}/\d{4}' then return to_date(substring(s from '^\d{1,2}/\d{1,2}/\d{4}'), 'DD/MM/YYYY'); end if;
  if s ~ '^\d{1,2}-\d{1,2}-\d{4}' then return to_date(substring(s from '^\d{1,2}-\d{1,2}-\d{4}'), 'DD-MM-YYYY'); end if;
  if s ~ '^\d+(\.\d+)?$' and s::numeric between 20000 and 90000 then return date '1899-12-30' + floor(s::numeric)::int; end if;
  s := upper(s);
  s := replace(replace(replace(replace(s, 'MEI', 'MAY'), 'AGU', 'AUG'), 'OKT', 'OCT'), 'DES', 'DEC');
  if s ~ '^\d{1,2}[ -][A-Z]{3}[A-Z]*[ -]\d{4}' then
    return to_date(substring(s from '^\d{1,2}[ -][A-Z]{3}') || ' ' || substring(s from '^\d{1,2}[ -][A-Z]{3}[A-Z]*[ -](\d{4})'), 'DD MON YYYY');
  end if;
  return null;
exception when others then return null;
end $$;

-- Konversi teks -> timestamp (WIB, tanpa zona). '02 Jan 2026 09:53:36:350' / ISO / serial Excel
create or replace function public.lg_to_ts(p text) returns timestamp
language plpgsql immutable as $$
declare s text := btrim(coalesce(p, '')); d date; t text;
begin
  if s = '' or s = '-' then return null; end if;
  if s ~ '^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}' then return replace(substring(s from '^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?'), 'T', ' ')::timestamp; end if;
  if s ~ '^\d+\.\d+$' and s::numeric between 20000 and 90000 then
    return timestamp '1899-12-30' + make_interval(secs => round(s::numeric * 86400)); end if;
  d := public.lg_to_date(s);
  if d is null then return null; end if;
  t := substring(s from '(\d{1,2}:\d{2}(:\d{2})?)');
  return d + coalesce(t::time, time '00:00');
exception when others then return null;
end $$;

create or replace function public.lg_to_num(p text) returns numeric
language plpgsql immutable as $$
declare s text := btrim(coalesce(p, ''));
begin
  if s = '' or s = '-' then return null; end if;
  if s ~ '^-?\d+(\.\d+)?([eE][-+]?\d+)?$' then return s::numeric; end if;
  -- format Indonesia 1.234.567,50
  if s ~ '^-?[\d.]+,\d+$' then return replace(replace(s, '.', ''), ',', '.')::numeric; end if;
  if s ~ '^-?\d{1,3}(,\d{3})+(\.\d+)?$' then return replace(s, ',', '')::numeric; end if;
  return null;
exception when others then return null;
end $$;

-- Teks bersih: trim, kosong -> null, '1234.0' (angka dari Excel) -> '1234'
create or replace function public.lg_txt(p text) returns text
language sql immutable as $$
  select case when p is null then null
              when btrim(p) ~ '^\d+\.0+$' then split_part(btrim(p), '.', 1)
              else nullif(nullif(btrim(regexp_replace(p, '\s+', ' ', 'g')), ''), 'nan') end
$$;

-- ---------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------
create table if not exists public.lg_cabang (
  kode       text primary key,
  nama       text not null,
  provinsi   text[] not null default '{}',
  catatan    text,
  created_at timestamptz not null default now()
);
comment on table public.lg_cabang is 'Cabang/distributor pemilik data logistik (PTK = Pontianak, dst).';

create table if not exists public.lg_import_batch (
  id          bigserial primary key,
  cabang      text not null references public.lg_cabang(kode),
  jenis       text not null default 'logistik',
  filename    text,
  tgl_dari    date,
  tgl_sampai  date,
  n_baris     int not null default 0,
  n_dihapus   int not null default 0,
  status      text not null default 'proses',
  ringkasan   jsonb,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- Satu baris = satu baris laporan logistik (1 produk dalam 1 SOM/SJ dalam 1 FOAD)
create table if not exists public.lg_muatan (
  id                      bigserial primary key,
  cabang                  text not null references public.lg_cabang(kode),
  batch_id                bigint references public.lg_import_batch(id) on delete set null,
  src_no                  int,
  tanggal_order           date,
  order_date              date not null,
  foad_no                 text not null,
  foad_type               text not null default 'Non-Bulk',
  som_type                text,
  som_date                date,
  som_code                text,
  do_no                   text,
  do_date                 date,
  est_delv_date           date,
  sj_no                   text,
  sj_date                 date,
  salesman                text,
  status_som_sj           text,
  cust_code               text,
  cust_name               text,
  cust_tiro_code          text,
  daerah                  text,
  product_code            text,
  product_name            text,
  jumlah                  numeric(14,3) not null default 0,
  transporter             text,
  zone_code               text,
  zone_name               text,
  driver                  text,
  plat_no                 text,
  gudang_asal             text,
  gudang_tujuan           text,
  harga_perzak            numeric(16,2),
  jml_harga               numeric(18,2),
  terbit_sj               date,
  selesai_muat            timestamp,
  kirim                   date,
  tgl_terima_sj_toko      date,
  tgl_terima_sj_doplanner date,
  no_sj_terminal          text,
  tgl_sj_terminal         date,
  alamat                  text,
  ket                     text,
  po_no                   text,
  sdo_no                  text,
  status_som_po           text,
  no_kontainer            text,
  no_seal                 text,
  ket_dalam_luar_kota     text,
  plat_norm   text generated always as (public.lg_norm_plat(plat_no)) stored,
  driver_norm text generated always as (public.lg_norm_nama(driver)) stored,
  ritase_key  text generated always as (cabang || '|' || foad_type || '|' || foad_no) stored
);
create index if not exists lg_muatan_cabang_tgl on public.lg_muatan (cabang, order_date);
create index if not exists lg_muatan_ritase on public.lg_muatan (ritase_key);
create index if not exists lg_muatan_do on public.lg_muatan (do_no);
create index if not exists lg_muatan_sj on public.lg_muatan (sj_no);
create index if not exists lg_muatan_plat on public.lg_muatan (plat_norm);
create index if not exists lg_muatan_driver on public.lg_muatan (driver_norm);
create index if not exists lg_muatan_batch on public.lg_muatan (batch_id);
comment on table public.lg_muatan is 'Fakta baris muatan dari laporan logistik (export ERP). Ritase = FOAD (foad_type + foad_no).';

-- Master produk: kategori semen / non semen, berat per unit
create table if not exists public.lg_produk (
  product_code text primary key,
  product_name text,
  kategori     text not null default 'NON SEMEN' check (kategori in ('SEMEN', 'NON SEMEN')),
  lini         text,           -- Tiga Roda, Rajawali, White Cement, TR30, Curah ...
  kelompok     text,           -- kelompok non-semen: Paku, Kawat, Pipa & Fitting ...
  satuan       text not null default 'PCS',  -- ZAK / TON / PCS
  kg_per_unit  numeric,
  ton_per_unit numeric,        -- konversi ke ton (hanya dipakai untuk kategori SEMEN)
  is_auto      boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- Master zona transporter -> kecamatan (GADM GID_3) untuk peta cakupan
create table if not exists public.lg_zona (
  cabang       text not null references public.lg_cabang(kode),
  zone_code    text not null,
  zone_name    text,
  kecamatan    text,
  ring         numeric,
  gid          text,           -- GADM GID_3 kecamatan, mis. IDN.12.6.11_1
  kabupaten    text,
  provinsi     text,
  lat          numeric,
  lng          numeric,
  match_status text not null default 'belum',  -- auto | manual | ambigu | tidak_ketemu | belum
  catatan      text,
  is_dummy     boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (cabang, zone_code)
);

create table if not exists public.lg_transporter (
  nama       text primary key,
  grup       text,
  jenis      text,     -- Perusahaan / Perorangan / Ekspedisi / Armada Internal
  warna      text,
  kontak     text,
  catatan    text,
  is_auto    boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.lg_gudang (
  nama       text primary key,
  jenis      text,     -- Gudang Fisik / Virtual (Curah/Pabrik) / Virtual (Pelabuhan)
  cabang     text references public.lg_cabang(kode),
  alamat     text,
  lat        numeric,
  lng        numeric,
  is_dummy   boolean not null default true,
  updated_at timestamptz not null default now()
);

-- DO dari laporan J028 (sistem penjualan) untuk dihubungkan ke DO logistik
create table if not exists public.lg_do_j028 (
  id           bigserial primary key,
  cabang       text not null references public.lg_cabang(kode),
  batch_id     bigint references public.lg_import_batch(id) on delete set null,
  do_no        text not null,
  do_date      date,
  cust_code    text,
  cust_name    text,
  product_code text,
  product_name text,
  qty          numeric(14,3),
  salesman     text,
  keterangan   text,
  is_dummy     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists lg_do_j028_do on public.lg_do_j028 (cabang, do_no);

-- Rahasia (PIN import/master) — schema privat, tidak terekspos API
create table if not exists lg_private.pengaturan (
  kunci text primary key,
  nilai text not null,
  updated_at timestamptz not null default now()
);
