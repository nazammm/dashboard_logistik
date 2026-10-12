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
