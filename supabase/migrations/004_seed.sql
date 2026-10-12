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
