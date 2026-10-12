-- OPSIONAL: isi J028 contoh (is_dummy = true) supaya halaman Rekon DO bisa dicoba sebelum ada export J028 asli.
-- Jalankan SETELAH data Excel diimport. Terhapus otomatis saat J028 asli diimport.
insert into public.lg_do_j028 (cabang, do_no, do_date, cust_code, cust_name, product_code, product_name, qty, salesman, keterangan, is_dummy)
select cabang, do_no, do_date, cust_code, cust_name, product_code, product_name,
  case when h < 80 then qty_kirim when h < 92 then ceil(qty_kirim * 1.5) else greatest(qty_kirim - greatest(round(qty_kirim*0.2),1), 0) end,
  salesman, 'DUMMY — ganti dengan export J028 asli', true
from (select cabang, do_no, product_code, max(product_name) product_name, max(cust_code) cust_code, max(cust_name) cust_name,
    min(do_date) do_date, max(salesman) salesman, sum(jumlah) qty_kirim, abs(hashtext(do_no || product_code)) % 100 h
  from public.lg_muatan where do_no is not null and product_code is not null group by cabang, do_no, product_code) x where h < 96;
insert into public.lg_do_j028 (cabang, do_no, do_date, cust_code, cust_name, product_code, product_name, qty, salesman, keterangan, is_dummy)
select 'PTK', 'J028-DUMMY-' || lpad(g::text, 3, '0'), date '2026-01-20' + (g % 12), c.cust_code, c.cust_name, p.product_code, p.product_name, 50 * (1 + g % 4), c.salesman, 'DUMMY — DO belum dikirim (contoh)', true
from generate_series(1, 24) g
cross join lateral (select cust_code, max(cust_name) cust_name, max(salesman) salesman from public.lg_muatan where cust_code is not null group by cust_code order by md5(cust_code || g) limit 1) c
cross join lateral (select product_code, product_name from public.lg_produk where kategori = 'SEMEN' and satuan <> 'TON' order by md5(product_code || g) limit 1) p;
