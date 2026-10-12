// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

/** 1 ritase = 1 FOAD (perjalanan 1 truk dari 1 gudang asal). Sumber: view v_ritase. */
export interface Ritase {
  cabang: string; ritase_key: string; tanggal: string; bulan: string;
  foad_no: string; foad_type: string;
  plat: string | null; plat_label: string | null; sopir: string | null;
  transporter: string | null; transporter_grup: string | null; transporter_jenis: string | null;
  gudang_asal: string | null; gudang_tujuan: string | null;
  jenis_kirim: string; som_kode: string; kirim_campuran: boolean; dalam_luar: string;
  selesai_muat: string | null; jam_selesai_muat: number | null;
  n_baris: number; n_sj: number; n_stop: number; n_toko: number; n_do: number; n_som: number;
  ton: number; qty_semen: number; qty_non_semen: number; n_jenis_semen: number; n_jenis_non_semen: number; biaya: number;
  zona: string[] | null; gids: string[] | null; kecamatan: string | null; ring_max: number | null;
  lead_do_avg: number | null; lead_do_max: number | null; sj_balik_avg: number | null; sj_balik_max: number | null;
  ada_lewat_estimasi: boolean | null; kontainer: string | null; seal: string | null; toko: string | null;
  rit_ke: number; rit_hari_ini: number; jeda_muat_menit: number | null;
}

/** 1 titik bongkar (SJ). Untuk Gudang→Gudang yang tidak punya SJ dipakai SOM. Sumber: v_stop. */
export interface Stop {
  cabang: string; stop_key: string; ritase_key: string; tanggal: string; bulan: string;
  sj_no: string | null; som_code: string | null; som_kode: string; jenis_kirim: string;
  cust_code: string | null; cust_name: string | null; cust_tiro_code: string | null; daerah: string | null;
  alamat: string | null; ket: string | null;
  zone_code: string | null; zone_name: string | null; kecamatan: string | null; ring: number | null;
  gid: string | null; kabupaten: string | null; dalam_luar: string;
  transporter: string | null; transporter_grup: string | null; plat: string | null; plat_label: string | null; sopir: string | null;
  gudang_asal: string | null; gudang_tujuan: string | null;
  do_nos: string | null; do_date: string | null; est_delv_date: string | null; lead_do_hari: number | null; lewat_estimasi: boolean | null;
  som_date: string | null; sj_date: string | null; selesai_muat: string | null; kirim: string | null;
  tgl_terima_sj_toko: string | null; tgl_terima_sj_doplanner: string | null; sj_balik_hari: number | null;
  ton: number; qty_semen: number; qty_non_semen: number; biaya: number; n_item: number; n_produk: number;
  salesman: string | null; no_sj_terminal: string | null; kontainer: string | null; seal: string | null;
  po_no: string | null; status_som_sj: string | null; status_som_po: string | null;
}

/** Baris muatan (produk). Sumber: v_muatan (dimuat hanya saat perlu). */
export interface Muatan {
  id: number; cabang: string; ritase_key: string; tanggal: string; stop_key: string;
  foad_no: string; som_code: string | null; do_no: string | null; do_date: string | null; sj_no: string | null;
  cust_code: string | null; cust_name: string | null;
  product_code: string; product_name: string; kategori: 'SEMEN' | 'NON SEMEN'; lini: string | null; kelompok: string | null; satuan: string;
  jumlah: number; ton: number; qty_semen: number; qty_non_semen: number;
  transporter: string | null; plat: string | null; plat_label: string | null; sopir: string | null;
  jenis_kirim: string; gudang_asal: string | null; zone_code: string | null; kecamatan: string | null; gid: string | null;
  harga_perzak: number | null; biaya: number; lead_do_hari: number | null; salesman: string | null;
  foad_type: string; som_kode: string; gudang_tujuan: string | null; ring: number | null; dalam_luar: string;
  est_delv_date: string | null; kirim: string | null; tgl_terima_sj_toko: string | null; tgl_terima_sj_doplanner: string | null; selesai_muat: string | null;
}

export interface Periode { cabang: string; bulan: string; tgl_min: string; tgl_max: string; n_baris: number; n_ritase: number; n_hari: number }
