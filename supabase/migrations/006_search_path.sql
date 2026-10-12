-- 006: kunci search_path fungsi helper (saran Supabase Security Advisor). Sudah dijalankan di project.
do $$ declare r record; begin
for r in select p.oid::regprocedure sig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
 ('lg_label_kirim','lg_kode_kirim','lg_norm_dalam_luar','lg_norm_plat','lg_fmt_plat','lg_norm_nama','lg_zona_kecamatan','lg_zona_ring','lg_to_date','lg_to_ts','lg_to_num','lg_txt','lg_klasifikasi_produk')
loop execute format('alter function %s set search_path = public, pg_temp', r.sig); end loop; end $$;
