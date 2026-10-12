-- =====================================================================
-- SETUP LENGKAP Dashboard Logistik — jalankan SEKALI di Supabase SQL Editor (project baru).
-- Berisi: schema, view, fungsi/RPC ber-PIN, RLS, data awal cabang & gudang, PIN awal.
-- Data Excel dimasukkan sesudahnya lewat web: halaman Import Data. Aman dijalankan ulang.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ######## migrations/001_schema.sql ########
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

-- ######## migrations/002_views.sql ########
-- =====================================================================
-- 002: VIEW analitik. Semua view security_invoker (ikut RLS tabel).
--   v_muatan   : baris muatan + atribut turunan (ton, kategori, kecamatan, lead time)
--   v_stop     : 1 baris per titik bongkar (SJ; untuk Gudang→Gudang pakai SOM)
--   v_ritase   : 1 baris per ritase (FOAD) + rit ke-n per unit/hari + jeda antar selesai muat
--   v_do_rekon : DO logistik vs DO J028
--   v_bulanan, v_bulanan_total : agregat bulanan (tren 12 bulan)
--   v_periode, v_dim_*         : nilai unik penting untuk filter & dropdown
-- =====================================================================

create or replace view public.v_muatan with (security_invoker = true) as
select
  m.id, m.cabang, m.ritase_key, m.batch_id,
  m.order_date                              as tanggal,
  date_trunc('month', m.order_date)::date   as bulan,
  m.foad_no, m.foad_type,
  m.som_type, public.lg_kode_kirim(m.som_type) as som_kode, public.lg_label_kirim(m.som_type) as jenis_kirim,
  m.som_code, m.som_date, m.do_no, m.do_date, m.est_delv_date, m.sj_no, m.sj_date,
  coalesce(m.sj_no, 'SOM:' || m.som_code)   as stop_key,
  m.salesman, m.status_som_sj, m.status_som_po,
  m.cust_code, m.cust_name, m.cust_tiro_code, m.daerah,
  m.product_code, coalesce(p.product_name, m.product_name) as product_name,
  coalesce(p.kategori, 'NON SEMEN')         as kategori,
  coalesce(p.lini, case when coalesce(p.kategori, 'NON SEMEN') = 'SEMEN' then 'Lainnya' end) as lini,
  coalesce(p.kelompok, case when coalesce(p.kategori, 'NON SEMEN') <> 'SEMEN' then 'Lainnya' end) as kelompok,
  coalesce(p.satuan, 'PCS')                 as satuan,
  m.jumlah,
  case when p.kategori = 'SEMEN' then m.jumlah * coalesce(p.ton_per_unit, 0) else 0 end as ton,
  case when p.kategori = 'SEMEN' then m.jumlah else 0 end                                 as qty_semen,
  case when coalesce(p.kategori, 'NON SEMEN') <> 'SEMEN' then m.jumlah else 0 end         as qty_non_semen,
  m.transporter, coalesce(t.grup, m.transporter) as transporter_grup, t.jenis as transporter_jenis,
  m.zone_code, m.zone_name,
  coalesce(z.kecamatan, public.lg_zona_kecamatan(m.zone_name)) as kecamatan,
  coalesce(z.ring, public.lg_zona_ring(m.zone_name))            as ring,
  z.gid, z.kabupaten, z.provinsi,
  m.driver_norm as sopir, m.plat_norm as plat, public.lg_fmt_plat(m.plat_norm) as plat_label,
  m.gudang_asal, m.gudang_tujuan,
  m.harga_perzak, coalesce(m.jml_harga, 0) as biaya,
  m.terbit_sj, m.selesai_muat, m.kirim, m.tgl_terima_sj_toko, m.tgl_terima_sj_doplanner,
  m.no_sj_terminal, m.tgl_sj_terminal,
  m.alamat, m.ket, m.po_no, m.sdo_no, m.no_kontainer, m.no_seal,
  public.lg_norm_dalam_luar(m.ket_dalam_luar_kota) as dalam_luar,
  case when m.do_date is not null and coalesce(m.tgl_terima_sj_toko, m.kirim) is not null
       then coalesce(m.tgl_terima_sj_toko, m.kirim) - m.do_date end                         as lead_do_hari,
  case when m.tgl_terima_sj_doplanner is not null and coalesce(m.tgl_terima_sj_toko, m.kirim) is not null
       then m.tgl_terima_sj_doplanner - coalesce(m.tgl_terima_sj_toko, m.kirim) end         as sj_balik_hari,
  case when m.som_date is not null and m.sj_date is not null then m.sj_date - m.som_date end as som_ke_sj_hari,
  (m.est_delv_date is not null and coalesce(m.kirim, m.order_date) > m.est_delv_date)      as lewat_estimasi
from public.lg_muatan m
left join public.lg_produk p      on p.product_code = m.product_code
left join public.lg_zona z        on z.cabang = m.cabang and z.zone_code = m.zone_code
left join public.lg_transporter t on t.nama = m.transporter;

-- ---------------------------------------------------------------------
create or replace view public.v_stop with (security_invoker = true) as
select
  cabang, stop_key, ritase_key, tanggal, bulan,
  max(sj_no) as sj_no, max(som_code) as som_code, max(som_kode) as som_kode, max(jenis_kirim) as jenis_kirim,
  max(cust_code) as cust_code, max(cust_name) as cust_name, max(cust_tiro_code) as cust_tiro_code, max(daerah) as daerah,
  max(alamat) as alamat, max(ket) as ket,
  max(zone_code) as zone_code, max(zone_name) as zone_name, max(kecamatan) as kecamatan, max(ring) as ring,
  max(gid) as gid, max(kabupaten) as kabupaten, max(dalam_luar) as dalam_luar,
  max(transporter) as transporter, max(transporter_grup) as transporter_grup, max(plat) as plat, max(plat_label) as plat_label, max(sopir) as sopir,
  max(gudang_asal) as gudang_asal, max(gudang_tujuan) as gudang_tujuan,
  string_agg(distinct do_no, ', ') as do_nos, min(do_date) as do_date, min(est_delv_date) as est_delv_date,
  max(lead_do_hari) as lead_do_hari, bool_or(lewat_estimasi) as lewat_estimasi,
  max(som_date) as som_date, max(sj_date) as sj_date, max(selesai_muat) as selesai_muat, max(kirim) as kirim,
  max(tgl_terima_sj_toko) as tgl_terima_sj_toko, max(tgl_terima_sj_doplanner) as tgl_terima_sj_doplanner,
  max(sj_balik_hari) as sj_balik_hari,
  sum(ton) as ton, sum(qty_semen) as qty_semen, sum(qty_non_semen) as qty_non_semen, sum(biaya) as biaya,
  count(*) as n_item, count(distinct product_code) as n_produk,
  max(salesman) as salesman, max(no_sj_terminal) as no_sj_terminal,
  string_agg(distinct no_kontainer, ', ') as kontainer, string_agg(distinct no_seal, ', ') as seal,
  max(po_no) as po_no, max(status_som_sj) as status_som_sj, max(status_som_po) as status_som_po
from public.v_muatan
group by cabang, stop_key, ritase_key, tanggal, bulan;

-- ---------------------------------------------------------------------
create or replace view public.v_ritase with (security_invoker = true) as
with r as (
  select
    cabang, ritase_key, tanggal, bulan,
    max(foad_no) as foad_no, max(foad_type) as foad_type,
    max(plat) as plat, max(plat_label) as plat_label, max(sopir) as sopir,
    max(transporter) as transporter, max(transporter_grup) as transporter_grup, max(transporter_jenis) as transporter_jenis,
    max(gudang_asal) as gudang_asal, max(gudang_tujuan) as gudang_tujuan,
    (array_agg(jenis_kirim order by ton desc, jumlah desc))[1] as jenis_kirim,
    (array_agg(som_kode order by ton desc, jumlah desc))[1]    as som_kode,
    count(distinct jenis_kirim) > 1 as kirim_campuran,
    case when bool_or(dalam_luar = 'LUAR KOTA') then 'LUAR KOTA'
         when bool_or(dalam_luar = 'DALAM KOTA') then 'DALAM KOTA' else 'TIDAK DIKETAHUI' end as dalam_luar,
    max(selesai_muat) as selesai_muat,
    count(*)                   as n_baris,
    count(distinct sj_no)      as n_sj,
    count(distinct stop_key)   as n_stop,
    count(distinct cust_code)  as n_toko,
    count(distinct do_no)      as n_do,
    count(distinct som_code)   as n_som,
    sum(ton)                   as ton,
    sum(qty_semen)             as qty_semen,
    sum(qty_non_semen)         as qty_non_semen,
    count(distinct product_code) filter (where kategori = 'SEMEN')  as n_jenis_semen,
    count(distinct product_code) filter (where kategori <> 'SEMEN') as n_jenis_non_semen,
    sum(biaya)                 as biaya,
    array_agg(distinct zone_code) filter (where zone_code is not null) as zona,
    array_agg(distinct gid) filter (where gid is not null)             as gids,
    string_agg(distinct kecamatan, ', ')  as kecamatan,
    max(ring)                  as ring_max,
    round(avg(lead_do_hari), 2) as lead_do_avg,
    max(lead_do_hari)          as lead_do_max,
    round(avg(sj_balik_hari), 2) as sj_balik_avg,
    max(sj_balik_hari)         as sj_balik_max,
    bool_or(lewat_estimasi)    as ada_lewat_estimasi,
    string_agg(distinct no_kontainer, ', ') as kontainer,
    string_agg(distinct no_seal, ', ')      as seal,
    string_agg(distinct cust_name, ' · ')   as toko
  from public.v_muatan
  group by cabang, ritase_key, tanggal, bulan
)
select r.*,
  case when r.selesai_muat is not null
       then round(extract(hour from r.selesai_muat) + extract(minute from r.selesai_muat) / 60.0, 2) end as jam_selesai_muat,
  row_number() over (partition by r.cabang, r.tanggal, r.plat order by r.selesai_muat nulls last, r.foad_no) as rit_ke,
  count(*) over (partition by r.cabang, r.tanggal, r.plat) as rit_hari_ini,
  round((extract(epoch from r.selesai_muat - lag(r.selesai_muat) over (
      partition by r.cabang, r.tanggal, r.gudang_asal order by r.selesai_muat)) / 60.0)::numeric, 1) as jeda_muat_menit
from r;

-- ---------------------------------------------------------------------
-- DO logistik vs DO J028 (per DO + produk)
create or replace view public.v_do_rekon with (security_invoker = true) as
with lg as (
  select cabang, do_no, product_code,
    max(product_name) as product_name, max(cust_code) as cust_code, max(cust_name) as cust_name,
    min(do_date) as do_date, min(est_delv_date) as est_delv_date, max(salesman) as salesman,
    sum(jumlah) as qty_kirim, sum(ton) as ton_kirim, count(distinct sj_no) as n_sj, count(distinct ritase_key) as n_ritase,
    min(kirim) as kirim_awal, max(kirim) as kirim_akhir, string_agg(distinct sj_no, ', ') as sj_nos
  from public.v_muatan where do_no is not null
  group by cabang, do_no, product_code
), j as (
  select cabang, do_no, product_code,
    max(product_name) as product_name, max(cust_code) as cust_code, max(cust_name) as cust_name,
    min(do_date) as do_date, max(salesman) as salesman, sum(qty) as qty_do, bool_or(is_dummy) as is_dummy
  from public.lg_do_j028
  group by cabang, do_no, product_code
)
select
  coalesce(lg.cabang, j.cabang) as cabang,
  coalesce(lg.do_no, j.do_no) as do_no,
  coalesce(lg.product_code, j.product_code) as product_code,
  coalesce(lg.product_name, j.product_name) as product_name,
  coalesce(lg.cust_code, j.cust_code) as cust_code,
  coalesce(lg.cust_name, j.cust_name) as cust_name,
  coalesce(j.do_date, lg.do_date) as do_date,
  lg.est_delv_date,
  coalesce(lg.salesman, j.salesman) as salesman,
  j.qty_do, coalesce(lg.qty_kirim, 0) as qty_kirim, lg.ton_kirim,
  case when j.qty_do is not null then j.qty_do - coalesce(lg.qty_kirim, 0) end as qty_sisa,
  lg.n_sj, lg.n_ritase, lg.kirim_awal, lg.kirim_akhir, lg.sj_nos,
  coalesce(j.is_dummy, false) as j028_dummy,
  case when j.do_no is null then 'Tidak ada di J028'
       when lg.do_no is null then 'Belum dikirim'
       when lg.qty_kirim = j.qty_do then 'Sesuai'
       when lg.qty_kirim < j.qty_do then 'Sebagian'
       else 'Lebih kirim' end as status
from lg full outer join j on j.cabang = lg.cabang and j.do_no = lg.do_no and j.product_code is not distinct from lg.product_code;

-- ---------------------------------------------------------------------
create or replace view public.v_bulanan with (security_invoker = true) as
select cabang, bulan, transporter, transporter_grup, jenis_kirim, gudang_asal, dalam_luar,
  count(*) as n_ritase, sum(ton) as ton, sum(qty_semen) as qty_semen, sum(qty_non_semen) as qty_non_semen,
  sum(biaya) as biaya, sum(n_stop) as n_stop, sum(n_sj) as n_sj
from public.v_ritase
group by cabang, bulan, transporter, transporter_grup, jenis_kirim, gudang_asal, dalam_luar;

create or replace view public.v_bulanan_total with (security_invoker = true) as
select cabang, bulan,
  count(distinct ritase_key) as n_ritase,
  sum(ton) as ton, sum(qty_semen) as qty_semen, sum(qty_non_semen) as qty_non_semen, sum(biaya) as biaya,
  count(distinct plat) as n_unit, count(distinct sopir) as n_sopir, count(distinct transporter) as n_transporter,
  count(distinct cust_code) as n_toko, count(distinct sj_no) as n_sj, count(distinct tanggal) as n_hari,
  percentile_cont(0.5) within group (order by lead_do_hari) as lead_do_median,
  avg(lead_do_hari) as lead_do_avg, avg(sj_balik_hari) as sj_balik_avg
from public.v_muatan
group by cabang, bulan;

-- ---------------------------------------------------------------------
-- Nilai unik penting (dropdown / filter / kesegaran data)
create or replace view public.v_periode with (security_invoker = true) as
select cabang, date_trunc('month', order_date)::date as bulan,
  min(order_date) as tgl_min, max(order_date) as tgl_max,
  count(*) as n_baris, count(distinct ritase_key) as n_ritase, count(distinct order_date) as n_hari
from public.lg_muatan group by cabang, date_trunc('month', order_date);

create or replace view public.v_dim_transporter with (security_invoker = true) as
select m.cabang, m.transporter, coalesce(t.grup, m.transporter) as grup, t.jenis, t.warna,
  count(distinct m.ritase_key) as n_ritase, count(distinct m.plat_norm) as n_unit, count(distinct m.driver_norm) as n_sopir,
  min(m.order_date) as tgl_awal, max(m.order_date) as tgl_akhir
from public.lg_muatan m left join public.lg_transporter t on t.nama = m.transporter
group by m.cabang, m.transporter, t.grup, t.jenis, t.warna;

create or replace view public.v_dim_armada with (security_invoker = true) as
select cabang, plat_norm as plat, public.lg_fmt_plat(plat_norm) as plat_label,
  array_agg(distinct transporter) as transporter, array_agg(distinct driver_norm) as sopir,
  count(distinct ritase_key) as n_ritase, min(order_date) as tgl_awal, max(order_date) as tgl_akhir
from public.lg_muatan where plat_norm is not null
group by cabang, plat_norm;

create or replace view public.v_dim_sopir with (security_invoker = true) as
select cabang, driver_norm as sopir,
  array_agg(distinct public.lg_fmt_plat(plat_norm)) as plat, array_agg(distinct transporter) as transporter,
  count(distinct ritase_key) as n_ritase, min(order_date) as tgl_awal, max(order_date) as tgl_akhir
from public.lg_muatan where driver_norm is not null
group by cabang, driver_norm;

create or replace view public.v_dim_toko with (security_invoker = true) as
select cabang, cust_code, max(cust_name) as cust_name, max(cust_tiro_code) as cust_tiro_code, max(daerah) as daerah,
  max(alamat) as alamat, count(distinct sj_no) as n_sj, count(distinct zone_code) as n_zona,
  min(order_date) as tgl_awal, max(order_date) as tgl_akhir
from public.lg_muatan where cust_code is not null
group by cabang, cust_code;

create or replace view public.v_dim_produk with (security_invoker = true) as
select m.product_code, coalesce(p.product_name, max(m.product_name)) as product_name,
  coalesce(p.kategori, 'NON SEMEN') as kategori, p.lini, p.kelompok, coalesce(p.satuan, 'PCS') as satuan,
  p.kg_per_unit, p.ton_per_unit, p.is_auto,
  count(*) as n_baris, sum(m.jumlah) as qty, min(m.order_date) as tgl_awal, max(m.order_date) as tgl_akhir
from public.lg_muatan m left join public.lg_produk p on p.product_code = m.product_code
group by m.product_code, p.product_name, p.kategori, p.lini, p.kelompok, p.satuan, p.kg_per_unit, p.ton_per_unit, p.is_auto;

create or replace view public.v_dim_zona with (security_invoker = true) as
select z.*, coalesce(u.n_baris, 0) as n_baris, coalesce(u.n_sj, 0) as n_sj, u.tgl_akhir
from public.lg_zona z
left join (select cabang, zone_code, count(*) as n_baris, count(distinct sj_no) as n_sj, max(order_date) as tgl_akhir
           from public.lg_muatan group by cabang, zone_code) u
  on u.cabang = z.cabang and u.zone_code = z.zone_code;

-- ######## migrations/003_functions_rls.sql ########
-- =====================================================================
-- 003: klasifikasi otomatis, sinkron master, RPC import (ber-PIN), RLS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Klasifikasi produk otomatis dari kode & nama (bisa dikoreksi di halaman Master)
-- ---------------------------------------------------------------------
create or replace function public.lg_klasifikasi_produk(p_code text, p_name text,
  out kategori text, out lini text, out kelompok text, out satuan text, out kg_per_unit numeric, out ton_per_unit numeric)
language plpgsql immutable as $$
declare c text := upper(coalesce(p_code, '')); n text := upper(coalesce(p_name, '')); pre text := substring(upper(coalesce(p_code, '')) from '^[A-Z]+');
  kg numeric := nullif(replace(substring(upper(coalesce(p_name, '')) from '(\d+(?:[.,]\d+)?)\s*KG'), ',', '.'), '')::numeric;
begin
  kategori := 'NON SEMEN'; satuan := 'PCS';
  -- ---- SEMEN ----
  if n ~ 'CURAH' or pre = 'CRH' then
    kategori := 'SEMEN'; lini := 'Curah'; satuan := 'TON'; kg_per_unit := 1000; ton_per_unit := 1; return;
  end if;
  if n !~ '^BAG[^A-Z]|KANTONG|SAK KOSONG' and (pre in ('CMT', 'RJW', 'CWC', 'CWM', 'SMN', 'SGR', 'SPD', 'STR', 'SBA', 'HLC', 'CND', 'CPC', 'OPC', 'PPC', 'PCC')
      or (n ~ '(^|[^A-Z])(PCC|OPC|PPC|SEMEN|PORTLAND|TR30|TR 30|WHITE CEMENT|WC)([^A-Z]|$)' and kg is not null)) then
    kategori := 'SEMEN'; satuan := 'ZAK';
    kg_per_unit := coalesce(kg, case when pre in ('CWC', 'CWM') then 40 else 50 end);
    ton_per_unit := kg_per_unit / 1000.0;
    lini := case when pre = 'CMT' then 'Tiga Roda'
                 when pre = 'RJW' or n ~ 'RAJAWALI' then 'Rajawali'
                 when pre = 'CWC' or n ~ '(^|[^A-Z])WC([^A-Z]|$)|WHITE' then 'White Cement'
                 when pre = 'CWM' or n ~ 'TR ?30' then 'TR30 (Mortar)'
                 when n ~ 'GRESIK' then 'Semen Gresik' when n ~ 'PADANG' then 'Semen Padang'
                 when n ~ 'TONASA' then 'Semen Tonasa' when n ~ 'DYNAMIX' then 'Dynamix'
                 else 'Semen Lainnya' end;
    return;
  end if;
  -- ---- NON SEMEN: kelompok dari prefix kode / kata kunci ----
  kelompok := case
    when pre = 'PKU' or n ~ '^PAKU' then 'Paku'
    when pre in ('KBT', 'KLT') or n ~ '^KAWAT' then 'Kawat'
    when pre in ('PPM', 'WAV') or n ~ 'PIPA|PIPAMAS|WAVIN|FIT ' then 'Pipa & Fitting'
    when pre = 'CST' or n ~ 'CLOSET|KLOSET|WASTAFEL' then 'Sanitary (Closet)'
    when pre in ('RYU', 'KAT') or n ~ 'KRAN|KERAN|VALVE|TAP' then 'Keran & Valve'
    when pre in ('ANB', 'ANL') or n ~ 'SELANG' then 'Selang'
    when pre = 'HNC' or n ~ 'LED|LAMPU|BULB' then 'Lampu'
    when pre in ('TPM', 'TPA', 'TJL') or n ~ 'TRIPLEK|PLYWOOD|ALBA' then 'Triplek & Papan'
    when pre in ('SNG', 'SRL') or n ~ 'SENG' then 'Seng & Atap'
    when pre in ('CGN', 'RGN') or n ~ 'TRUSS|RENG|BAJA RINGAN' then 'Baja Ringan'
    when pre = 'EXA' or n ~ 'ANATA 0' then 'Atap (Excel)'
    when pre = 'EXC' and n ~ 'TANK|TANGKI' then 'Tangki Air'
    when pre = 'EXC' then 'Atap (Excel)'
    when pre = 'PMO' or n ~ 'POMPA' then 'Pompa Air'
    when pre in ('BSK', 'SPU') or n ~ 'KUAS|BRUSH|SAPU' then 'Kuas & Sapu'
    when pre in ('GSA', 'CAG') or n ~ 'GEROBAK|SEKOP|CANGKUL' then 'Alat Kerja'
    when pre in ('PPR', 'FKO') or n ~ 'PLAMIR|CAT |DEMPUL' then 'Cat & Plamir'
    when pre = 'BSI' or n ~ '^BESI' then 'Besi Beton'
    when pre = 'BAG' or n ~ '^BAG[^A-Z]|KANTONG' then 'Kantong Semen'
    when n ~ 'POM ' then 'Keran & Valve'
    else 'Lainnya' end;
  kg_per_unit := kg;
end $$;

-- ---------------------------------------------------------------------
-- Sinkron master dari data muatan (dipanggil setelah import)
-- ---------------------------------------------------------------------
-- security invoker: hanya bisa jalan efektif dari RPC ber-PIN (lg_import_selesai) — anon kena RLS
create or replace function public.lg_sync_master(p_cabang text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n_prod int; n_zona int; n_trans int; n_gud int;
begin
  insert into public.lg_produk (product_code, product_name, kategori, lini, kelompok, satuan, kg_per_unit, ton_per_unit, is_auto)
  select x.product_code, x.product_name, k.kategori, k.lini, k.kelompok, k.satuan, k.kg_per_unit, k.ton_per_unit, true
  from (select product_code, max(product_name) as product_name from public.lg_muatan
        where cabang = p_cabang and product_code is not null group by product_code) x
  cross join lateral public.lg_klasifikasi_produk(x.product_code, x.product_name) k
  on conflict (product_code) do nothing;
  get diagnostics n_prod = row_count;

  insert into public.lg_zona (cabang, zone_code, zone_name, kecamatan, ring, match_status)
  select p_cabang, zone_code, max(zone_name), public.lg_zona_kecamatan(max(zone_name)), public.lg_zona_ring(max(zone_name)), 'belum'
  from public.lg_muatan where cabang = p_cabang and zone_code is not null group by zone_code
  on conflict (cabang, zone_code) do update set zone_name = excluded.zone_name
    where public.lg_zona.zone_name is distinct from excluded.zone_name;
  get diagnostics n_zona = row_count;

  insert into public.lg_transporter (nama, grup, jenis, is_auto)
  select t, btrim(regexp_replace(t, '\s*[-(].*$', '')),
    case when t ~* 'OPERASIONAL|INTERNAL' then 'Armada Internal'
         when t ~* '^(PT|CV|UD|PD)[ .]' then 'Perusahaan'
         when t ~* 'EKSPEDISI|EXPEDISI|LOGISTI' then 'Ekspedisi'
         else 'Perorangan' end, true
  from (select distinct transporter as t from public.lg_muatan where cabang = p_cabang and transporter is not null) x
  on conflict (nama) do nothing;
  get diagnostics n_trans = row_count;

  insert into public.lg_gudang (nama, jenis, cabang, is_dummy)
  select g, case when g ~* 'VIRTUAL' and g ~* 'CURAH' then 'Virtual (Curah/Pabrik)'
                 when g ~* 'VIRTUAL' then 'Virtual (Pelabuhan/Kontainer)' else 'Gudang Fisik' end, p_cabang, true
  from (select gudang_asal as g from public.lg_muatan where cabang = p_cabang and gudang_asal is not null
        union select gudang_tujuan from public.lg_muatan where cabang = p_cabang and gudang_tujuan is not null) x
  on conflict (nama) do nothing;
  get diagnostics n_gud = row_count;

  return jsonb_build_object('produk_baru', n_prod, 'zona_baru', n_zona, 'transporter_baru', n_trans, 'gudang_baru', n_gud);
end $$;

-- ---------------------------------------------------------------------
-- PIN untuk operasi tulis (import & master). Disimpan sebagai hash bcrypt.
-- ---------------------------------------------------------------------
create or replace function lg_private.cek_pin(p_pin text) returns void
language plpgsql security definer set search_path = lg_private, extensions, pg_temp as $$
declare h text;
begin
  select nilai into h from lg_private.pengaturan where kunci = 'pin_hash';
  if h is null then raise exception 'PIN belum diset. Jalankan: select lg_private.set_pin(''PIN-BARU'');'; end if;
  if p_pin is null or extensions.crypt(p_pin, h) <> h then
    perform pg_sleep(1.5);
    raise exception 'PIN salah' using errcode = '28P01';
  end if;
end $$;

create or replace function lg_private.set_pin(p_pin_baru text) returns void
language plpgsql security definer set search_path = lg_private, extensions, pg_temp as $$
begin
  if length(coalesce(p_pin_baru, '')) < 6 then raise exception 'PIN minimal 6 karakter'; end if;
  insert into lg_private.pengaturan (kunci, nilai) values ('pin_hash', extensions.crypt(p_pin_baru, extensions.gen_salt('bf', 8)))
  on conflict (kunci) do update set nilai = excluded.nilai, updated_at = now();
end $$;

create or replace function public.lg_cek_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform lg_private.cek_pin(p_pin); return true; end $$;

create or replace function public.lg_ganti_pin(p_pin_lama text, p_pin_baru text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin perform lg_private.cek_pin(p_pin_lama); perform lg_private.set_pin(p_pin_baru); return true; end $$;

-- ---------------------------------------------------------------------
-- IMPORT LOGISTIK (3 langkah: mulai -> baris (berulang, per ~500 baris) -> selesai)
-- Mode ganti: baris lama cabang tsb pada rentang tanggal file dihapus dulu (re-import aman, tanpa dobel).
-- ---------------------------------------------------------------------
create or replace function public.lg_import_mulai(p_pin text, p_cabang text, p_filename text, p_tgl_dari date, p_tgl_sampai date,
  p_nama_cabang text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_del int;
begin
  perform lg_private.cek_pin(p_pin);
  if p_cabang is null or btrim(p_cabang) = '' then raise exception 'Kode cabang wajib diisi'; end if;
  if p_tgl_dari is null or p_tgl_sampai is null or p_tgl_sampai < p_tgl_dari then raise exception 'Rentang tanggal file tidak valid'; end if;
  insert into public.lg_cabang (kode, nama) values (upper(btrim(p_cabang)), coalesce(p_nama_cabang, upper(btrim(p_cabang))))
  on conflict (kode) do nothing;
  delete from public.lg_muatan where cabang = upper(btrim(p_cabang)) and order_date between p_tgl_dari and p_tgl_sampai;
  get diagnostics v_del = row_count;
  insert into public.lg_import_batch (cabang, jenis, filename, tgl_dari, tgl_sampai, n_dihapus)
  values (upper(btrim(p_cabang)), 'logistik', p_filename, p_tgl_dari, p_tgl_sampai, v_del) returning id into v_id;
  return v_id;
end $$;

-- p_rows: array JSON; kunci = nama kolom lg_muatan (lihat tipe lg_import_row), nilai teks/angka apa adanya
do $$ begin
  create type public.lg_import_row as (
  src_no text, tanggal_order text, order_date text, foad_no text, foad_type text, som_type text, som_date text, som_code text,
  do_no text, do_date text, est_delv_date text, sj_no text, sj_date text, salesman text, status_som_sj text,
  cust_code text, cust_name text, cust_tiro_code text, daerah text, product_code text, product_name text, jumlah text,
  transporter text, zone_code text, zone_name text, driver text, plat_no text, gudang_asal text, gudang_tujuan text,
  harga_perzak text, jml_harga text, terbit_sj text, selesai_muat text, kirim text, tgl_terima_sj_toko text,
  tgl_terima_sj_doplanner text, no_sj_terminal text, tgl_sj_terminal text, alamat text, ket text, po_no text, sdo_no text,
  status_som_po text, no_kontainer text, no_seal text, ket_dalam_luar_kota text
);
exception when duplicate_object then null; end $$;

create or replace function public.lg_import_baris(p_pin text, p_batch_id bigint, p_rows jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cabang text; v_dari date; v_sampai date; v_n int; v_luar int;
begin
  perform lg_private.cek_pin(p_pin);
  select cabang, tgl_dari, tgl_sampai into v_cabang, v_dari, v_sampai from public.lg_import_batch where id = p_batch_id and status = 'proses';
  if v_cabang is null then raise exception 'Batch % tidak ditemukan / sudah selesai', p_batch_id; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows harus array JSON'; end if;

  -- baris tanpa tanggal order / FOAD tidak bisa dipakai -> ditolak dengan pesan jelas
  select count(*) into v_luar
  from jsonb_populate_recordset(null::public.lg_import_row, p_rows) r
  where public.lg_to_date(r.order_date) is null or public.lg_txt(r.foad_no) is null
     or public.lg_to_date(r.order_date) not between v_dari and v_sampai;
  if v_luar > 0 then
    raise exception '% baris tidak punya Order Date / FOAD No. yang valid atau di luar rentang %..%', v_luar, v_dari, v_sampai;
  end if;

  insert into public.lg_muatan (
    cabang, batch_id, src_no, tanggal_order, order_date, foad_no, foad_type, som_type, som_date, som_code,
    do_no, do_date, est_delv_date, sj_no, sj_date, salesman, status_som_sj, cust_code, cust_name, cust_tiro_code, daerah,
    product_code, product_name, jumlah, transporter, zone_code, zone_name, driver, plat_no, gudang_asal, gudang_tujuan,
    harga_perzak, jml_harga, terbit_sj, selesai_muat, kirim, tgl_terima_sj_toko, tgl_terima_sj_doplanner, no_sj_terminal,
    tgl_sj_terminal, alamat, ket, po_no, sdo_no, status_som_po, no_kontainer, no_seal, ket_dalam_luar_kota)
  select v_cabang, p_batch_id, public.lg_to_num(r.src_no)::int, public.lg_to_date(r.tanggal_order), public.lg_to_date(r.order_date),
    public.lg_txt(r.foad_no), coalesce(public.lg_txt(r.foad_type), 'Non-Bulk'), public.lg_txt(r.som_type), public.lg_to_date(r.som_date), public.lg_txt(r.som_code),
    public.lg_txt(r.do_no), public.lg_to_date(r.do_date), public.lg_to_date(r.est_delv_date), public.lg_txt(r.sj_no), public.lg_to_date(r.sj_date),
    public.lg_txt(r.salesman), public.lg_txt(r.status_som_sj), public.lg_txt(r.cust_code), public.lg_txt(r.cust_name), public.lg_txt(r.cust_tiro_code), public.lg_txt(r.daerah),
    public.lg_txt(r.product_code), public.lg_txt(r.product_name), coalesce(public.lg_to_num(r.jumlah), 0),
    public.lg_txt(r.transporter), public.lg_txt(r.zone_code), public.lg_txt(r.zone_name), public.lg_txt(r.driver), public.lg_txt(r.plat_no),
    public.lg_txt(r.gudang_asal), public.lg_txt(r.gudang_tujuan),
    public.lg_to_num(r.harga_perzak), public.lg_to_num(r.jml_harga), public.lg_to_date(r.terbit_sj), public.lg_to_ts(r.selesai_muat),
    public.lg_to_date(r.kirim), public.lg_to_date(r.tgl_terima_sj_toko), public.lg_to_date(r.tgl_terima_sj_doplanner),
    public.lg_txt(r.no_sj_terminal), public.lg_to_date(r.tgl_sj_terminal), public.lg_txt(r.alamat), public.lg_txt(r.ket),
    public.lg_txt(r.po_no), public.lg_txt(r.sdo_no), public.lg_txt(r.status_som_po), public.lg_txt(r.no_kontainer), public.lg_txt(r.no_seal),
    public.lg_txt(r.ket_dalam_luar_kota)
  from jsonb_populate_recordset(null::public.lg_import_row, p_rows) r;
  get diagnostics v_n = row_count;
  update public.lg_import_batch set n_baris = n_baris + v_n where id = p_batch_id;
  return v_n;
end $$;

create or replace function public.lg_import_selesai(p_pin text, p_batch_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cabang text; v_sync jsonb; v_hasil jsonb;
begin
  perform lg_private.cek_pin(p_pin);
  select cabang into v_cabang from public.lg_import_batch where id = p_batch_id;
  if v_cabang is null then raise exception 'Batch % tidak ditemukan', p_batch_id; end if;
  v_sync := public.lg_sync_master(v_cabang);
  select jsonb_build_object(
      'baris', count(*), 'ritase', count(distinct ritase_key), 'sj', count(distinct sj_no),
      'tgl_min', min(order_date), 'tgl_max', max(order_date),
      'zona_belum_dipetakan', (select count(*) from public.lg_zona z where z.cabang = v_cabang and z.gid is null),
      'produk_tanpa_klasifikasi', (select count(*) from public.lg_produk p where p.kelompok = 'Lainnya' and p.kategori = 'NON SEMEN'))
    into v_hasil
  from public.lg_muatan where batch_id = p_batch_id;
  v_hasil := v_hasil || v_sync;
  update public.lg_import_batch set status = 'selesai', finished_at = now(), ringkasan = v_hasil where id = p_batch_id;
  return v_hasil;
end $$;

-- Batalkan/hapus satu batch import
create or replace function public.lg_import_hapus(p_pin text, p_batch_id bigint) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  perform lg_private.cek_pin(p_pin);
  delete from public.lg_muatan where batch_id = p_batch_id; get diagnostics v_n = row_count;
  delete from public.lg_do_j028 where batch_id = p_batch_id;
  update public.lg_import_batch set status = 'dihapus', finished_at = now() where id = p_batch_id;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- IMPORT DO J028. p_ganti = true: hapus data dummy cabang ini + DO yang sama sebelum insert.
-- p_rows: [{do_no, do_date, cust_code, cust_name, product_code, product_name, qty, salesman, keterangan}]
-- ---------------------------------------------------------------------
create or replace function public.lg_j028_simpan(p_pin text, p_cabang text, p_filename text, p_rows jsonb, p_ganti boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_n int; v_del int := 0; v_c text := upper(btrim(p_cabang));
begin
  perform lg_private.cek_pin(p_pin);
  insert into public.lg_cabang (kode, nama) values (v_c, v_c) on conflict (kode) do nothing;
  insert into public.lg_import_batch (cabang, jenis, filename, status) values (v_c, 'j028', p_filename, 'proses') returning id into v_id;
  if p_ganti then
    delete from public.lg_do_j028 d where d.cabang = v_c and (d.is_dummy or d.do_no in (
      select public.lg_txt(x->>'do_no') from jsonb_array_elements(p_rows) x));
    get diagnostics v_del = row_count;
  end if;
  insert into public.lg_do_j028 (cabang, batch_id, do_no, do_date, cust_code, cust_name, product_code, product_name, qty, salesman, keterangan, is_dummy)
  select v_c, v_id, public.lg_txt(x->>'do_no'), public.lg_to_date(x->>'do_date'), public.lg_txt(x->>'cust_code'), public.lg_txt(x->>'cust_name'),
    public.lg_txt(x->>'product_code'), public.lg_txt(x->>'product_name'), public.lg_to_num(x->>'qty'), public.lg_txt(x->>'salesman'),
    public.lg_txt(x->>'keterangan'), false
  from jsonb_array_elements(p_rows) x
  where public.lg_txt(x->>'do_no') is not null;
  get diagnostics v_n = row_count;
  update public.lg_import_batch set n_baris = v_n, n_dihapus = v_del, status = 'selesai', finished_at = now(),
    ringkasan = jsonb_build_object('baris', v_n, 'dihapus', v_del) where id = v_id;
  return jsonb_build_object('batch_id', v_id, 'baris', v_n, 'dihapus', v_del);
end $$;

-- ---------------------------------------------------------------------
-- Simpan master (upsert) dari halaman Master Data
-- ---------------------------------------------------------------------
create or replace function public.lg_master_simpan(p_pin text, p_tabel text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  perform lg_private.cek_pin(p_pin);
  if p_tabel = 'zona' then
    insert into public.lg_zona (cabang, zone_code, zone_name, kecamatan, ring, gid, kabupaten, provinsi, lat, lng, match_status, catatan, is_dummy, updated_at)
    select x.cabang, x.zone_code, x.zone_name, x.kecamatan, x.ring, x.gid, x.kabupaten, x.provinsi, x.lat, x.lng,
      coalesce(x.match_status, 'manual'), x.catatan, coalesce(x.is_dummy, false), now()
    from jsonb_populate_recordset(null::public.lg_zona, p_rows) x
    on conflict (cabang, zone_code) do update set
      kecamatan = excluded.kecamatan, ring = excluded.ring, gid = excluded.gid, kabupaten = excluded.kabupaten,
      provinsi = excluded.provinsi, lat = excluded.lat, lng = excluded.lng, match_status = excluded.match_status,
      catatan = excluded.catatan, is_dummy = excluded.is_dummy, updated_at = now(),
      zone_name = coalesce(excluded.zone_name, public.lg_zona.zone_name);
  elsif p_tabel = 'produk' then
    insert into public.lg_produk (product_code, product_name, kategori, lini, kelompok, satuan, kg_per_unit, ton_per_unit, is_auto, updated_at)
    select x.product_code, x.product_name, coalesce(x.kategori, 'NON SEMEN'), x.lini, x.kelompok, coalesce(x.satuan, 'PCS'),
      x.kg_per_unit, x.ton_per_unit, false, now()
    from jsonb_populate_recordset(null::public.lg_produk, p_rows) x
    on conflict (product_code) do update set product_name = coalesce(excluded.product_name, public.lg_produk.product_name),
      kategori = excluded.kategori, lini = excluded.lini, kelompok = excluded.kelompok, satuan = excluded.satuan,
      kg_per_unit = excluded.kg_per_unit, ton_per_unit = excluded.ton_per_unit, is_auto = false, updated_at = now();
  elsif p_tabel = 'transporter' then
    insert into public.lg_transporter (nama, grup, jenis, warna, kontak, catatan, is_auto, updated_at)
    select x.nama, x.grup, x.jenis, x.warna, x.kontak, x.catatan, false, now()
    from jsonb_populate_recordset(null::public.lg_transporter, p_rows) x
    on conflict (nama) do update set grup = excluded.grup, jenis = excluded.jenis, warna = excluded.warna,
      kontak = excluded.kontak, catatan = excluded.catatan, is_auto = false, updated_at = now();
  elsif p_tabel = 'gudang' then
    insert into public.lg_gudang (nama, jenis, cabang, alamat, lat, lng, is_dummy, updated_at)
    select x.nama, x.jenis, x.cabang, x.alamat, x.lat, x.lng, coalesce(x.is_dummy, false), now()
    from jsonb_populate_recordset(null::public.lg_gudang, p_rows) x
    on conflict (nama) do update set jenis = excluded.jenis, cabang = coalesce(excluded.cabang, public.lg_gudang.cabang),
      alamat = excluded.alamat, lat = excluded.lat, lng = excluded.lng, is_dummy = excluded.is_dummy, updated_at = now();
  elsif p_tabel = 'cabang' then
    insert into public.lg_cabang (kode, nama, provinsi, catatan)
    select upper(x.kode), x.nama, coalesce(x.provinsi, '{}'), x.catatan from jsonb_populate_recordset(null::public.lg_cabang, p_rows) x
    on conflict (kode) do update set nama = excluded.nama, provinsi = excluded.provinsi, catatan = excluded.catatan;
  else
    raise exception 'Tabel master tidak dikenal: %', p_tabel;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- RLS: baca terbuka untuk anon (dashboard), tulis HANYA lewat RPC ber-PIN di atas.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lg_cabang','lg_import_batch','lg_muatan','lg_produk','lg_zona','lg_transporter','lg_gudang','lg_do_j028'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists baca_semua on public.%I', t);
    execute format('create policy baca_semua on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

grant select on public.v_muatan, public.v_stop, public.v_ritase, public.v_do_rekon, public.v_bulanan, public.v_bulanan_total,
  public.v_periode, public.v_dim_transporter, public.v_dim_armada, public.v_dim_sopir, public.v_dim_toko, public.v_dim_produk,
  public.v_dim_zona to anon, authenticated;

alter table lg_private.pengaturan enable row level security;
revoke all on all tables in schema lg_private from anon, authenticated, public;
revoke all on all functions in schema lg_private from anon, authenticated, public;

revoke execute on function public.lg_sync_master(text) from public, anon, authenticated;
grant execute on function public.lg_cek_pin(text), public.lg_ganti_pin(text, text),
  public.lg_import_mulai(text, text, text, date, date, text), public.lg_import_baris(text, bigint, jsonb),
  public.lg_import_selesai(text, bigint), public.lg_import_hapus(text, bigint),
  public.lg_j028_simpan(text, text, text, jsonb, boolean), public.lg_master_simpan(text, text, jsonb)
  to anon, authenticated;

-- ######## migrations/004_seed.sql ########
-- =====================================================================
-- 004: data awal (cabang & gudang). Koordinat gudang = PERKIRAAN (is_dummy = true) — koreksi di halaman Master.
-- PIN diset terpisah:  select lg_private.set_pin('PIN-ANDA');
-- =====================================================================
insert into public.lg_cabang (kode, nama, provinsi, catatan) values
  ('PTK', 'Pontianak', array['Kalimantan Barat'], 'Cabang Pontianak — data awal Januari 2026')
on conflict (kode) do nothing;

insert into public.lg_gudang (nama, jenis, cabang, alamat, lat, lng, is_dummy) values
  ('BUMIRAYA', 'Gudang Fisik', 'PTK', 'Kawasan Pergudangan Jl. Adisucipto, Sungai Raya (perkiraan)', -0.0930, 109.3790, true),
  ('WAJOK', 'Gudang Fisik', 'PTK', 'Wajok Hulu, Siantan, Mempawah (perkiraan)', 0.0640, 109.2450, true),
  ('PTK VIRTUAL CURAH', 'Virtual (Curah/Pabrik)', 'PTK', 'Virtual — semen curah langsung dari pabrik/terminal (perkiraan: Pelabuhan Dwikora)', -0.0215, 109.3390, true),
  ('PTK VIRTUAL WAREHOUSE', 'Virtual (Pelabuhan/Kontainer)', 'PTK', 'Virtual — kontainer dari pelabuhan/terminal (perkiraan: Terminal Petikemas Pontianak)', -0.0230, 109.3420, true)
on conflict (nama) do nothing;

-- ######## migrations/006_search_path.sql ########
-- 006: kunci search_path fungsi helper (saran Supabase Security Advisor). Sudah dijalankan di project.
do $$ declare r record; begin
for r in select p.oid::regprocedure sig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
 ('lg_label_kirim','lg_kode_kirim','lg_norm_dalam_luar','lg_norm_plat','lg_fmt_plat','lg_norm_nama','lg_zona_kecamatan','lg_zona_ring','lg_to_date','lg_to_ts','lg_to_num','lg_txt','lg_klasifikasi_produk')
loop execute format('alter function %s set search_path = public, pg_temp', r.sig); end loop; end $$;

-- ######## penutup ########
revoke usage on schema lg_private from anon, authenticated, public;
-- PIN awal untuk Import & Master Data (ganti di web: Import Data → Riwayat & PIN)
select lg_private.set_pin('LGK-7CISK7');
notify pgrst, 'reload schema';
