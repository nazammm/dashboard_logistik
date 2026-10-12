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
