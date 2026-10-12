// Semua pengambilan data dari Supabase ada di sini (di-cache per sesi). Halaman tidak memanggil apiGet langsung.
import { apiGet, apiGetAll, apiRpc, enc, inList } from './api';
import type { Muatan, Periode, Ritase, Row, Stop } from './types';
import { monthEnd } from './format';

const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, fn().catch(e => { cache.delete(key); throw e; }));
  return cache.get(key) as Promise<T>;
}
/** Kosongkan cache (setelah import / simpan master). */
export const clearCache = () => cache.clear();

const cab = (c: string) => (c ? `&cabang=eq.${enc(c)}` : '');
/** Filter rentang tanggal (bukan kolom bulan) supaya filter terdorong ke indeks (cabang, order_date) melewati window function di view. */
const bln = (b: string) => `&tanggal=gte.${b}&tanggal=lte.${monthEnd(b)}`;
const NUM_RIT = ['n_baris', 'n_sj', 'n_stop', 'n_toko', 'n_do', 'n_som', 'ton', 'qty_semen', 'qty_non_semen', 'n_jenis_semen', 'n_jenis_non_semen', 'biaya',
  'ring_max', 'lead_do_avg', 'lead_do_max', 'sj_balik_avg', 'sj_balik_max', 'jam_selesai_muat', 'rit_ke', 'rit_hari_ini', 'jeda_muat_menit'];
const NUM_STOP = ['ring', 'lead_do_hari', 'sj_balik_hari', 'ton', 'qty_semen', 'qty_non_semen', 'biaya', 'n_item', 'n_produk'];
const NUM_MUAT = ['jumlah', 'ton', 'qty_semen', 'qty_non_semen', 'harga_perzak', 'biaya', 'lead_do_hari', 'ring'];
/** PostgREST mengirim numeric sebagai string untuk presisi besar; normalkan ke number. */
function numify<T>(rows: Row[], cols: string[]): T[] {
  rows.forEach(r => cols.forEach(c => { if (r[c] != null && typeof r[c] !== 'number') r[c] = Number(r[c]); }));
  return rows as T[];
}

const MUATAN_COLS = ['id', 'cabang', 'ritase_key', 'tanggal', 'stop_key', 'foad_no', 'foad_type', 'som_code', 'som_kode', 'jenis_kirim', 'do_no', 'do_date', 'sj_no',
  'cust_code', 'cust_name', 'product_code', 'product_name', 'kategori', 'lini', 'kelompok', 'satuan', 'jumlah', 'ton', 'qty_semen', 'qty_non_semen',
  'transporter', 'plat', 'plat_label', 'sopir', 'gudang_asal', 'gudang_tujuan', 'zone_code', 'kecamatan', 'gid', 'ring', 'harga_perzak', 'biaya', 'lead_do_hari',
  'salesman', 'dalam_luar', 'est_delv_date', 'kirim', 'tgl_terima_sj_toko', 'tgl_terima_sj_doplanner', 'selesai_muat'].join(',');

export const DataSource = {
  periode: () => cached('periode', async () => numify<Periode>(await apiGetAll('v_periode', 'select=*&order=cabang,bulan'), ['n_baris', 'n_ritase', 'n_hari'])),

  /** Semua ritase satu bulan (1 cabang atau semua). */
  ritaseBulan: (cabang: string, bulan: string) => cached(`rit|${cabang}|${bulan}`, async () =>
    numify<Ritase>(await apiGetAll('v_ritase', `select=*${bln(bulan)}${cab(cabang)}&order=tanggal,foad_no`), NUM_RIT)),

  stopBulan: (cabang: string, bulan: string) => cached(`stop|${cabang}|${bulan}`, async () =>
    numify<Stop>(await apiGetAll('v_stop', `select=*${bln(bulan)}${cab(cabang)}&order=tanggal,stop_key`), NUM_STOP)),

  muatanBulan: (cabang: string, bulan: string) => cached(`muat|${cabang}|${bulan}`, async () =>
    numify<Muatan>(await apiGetAll('v_muatan', `select=${MUATAN_COLS}${bln(bulan)}${cab(cabang)}&order=id`), NUM_MUAT)),

  /** Satu ritase lengkap (header + stop + item). */
  ritaseDetail: (key: string) => cached(`ritdet|${key}`, async () => {
    const [rit, stops, items] = await Promise.all([
      apiGet<Row[]>(`v_ritase?select=*&ritase_key=eq.${enc(key)}`),
      apiGet<Row[]>(`v_stop?select=*&ritase_key=eq.${enc(key)}&order=stop_key`),
      apiGet<Row[]>(`v_muatan?select=${MUATAN_COLS}&ritase_key=eq.${enc(key)}&order=id`),
    ]);
    return { rit: numify<Ritase>(rit, NUM_RIT)[0] || null, stops: numify<Stop>(stops, NUM_STOP), items: numify<Muatan>(items, NUM_MUAT) };
  }),

  /** Semua baris sebuah DO (logistik) + baris J028-nya. */
  doDetail: (doNo: string) => cached(`do|${doNo}`, async () => {
    const [rekon, items, j028] = await Promise.all([
      apiGet<Row[]>(`v_do_rekon?select=*&do_no=eq.${enc(doNo)}&order=product_code`),
      apiGet<Row[]>(`v_muatan?select=${MUATAN_COLS}&do_no=eq.${enc(doNo)}&order=tanggal,id`),
      apiGet<Row[]>(`lg_do_j028?select=*&do_no=eq.${enc(doNo)}&order=product_code`),
    ]);
    return { rekon: numify<Row>(rekon, ['qty_do', 'qty_kirim', 'ton_kirim', 'qty_sisa', 'n_sj', 'n_ritase']), items: numify<Muatan>(items, NUM_MUAT), j028: numify<Row>(j028, ['qty']) };
  }),

  /** Rekon DO: DO yang dikirim di periode ATAU tanggal DO di periode (agar DO J028 yang belum dikirim ikut tampil). */
  doRekon: (cabang: string, dari: string, sampai: string) => cached(`rekon|${cabang}|${dari}|${sampai}`, async () =>
    numify<Row>(await apiGetAll('v_do_rekon',
      `select=*${cab(cabang)}&or=(and(kirim_akhir.gte.${dari},kirim_akhir.lte.${sampai}),and(do_date.gte.${dari},do_date.lte.${sampai}))&order=do_no,product_code`),
    ['qty_do', 'qty_kirim', 'ton_kirim', 'qty_sisa', 'n_sj', 'n_ritase'])),

  /** Riwayat sebuah toko (semua periode). */
  tokoStops: (cabang: string, cust: string) => cached(`toko|${cabang}|${cust}`, async () => {
    // ambil dulu kunci SJ toko ini dari tabel dasar (cepat), lalu v_stop per stop_key (kolom grup -> terdorong ke indeks)
    const keys = [...new Set((await apiGetAll('lg_muatan', `select=sj_no&cust_code=eq.${enc(cust)}${cab(cabang)}&sj_no=not.is.null`)).map(r => r.sj_no as string))];
    const out: Row[] = [];
    for (let i = 0; i < keys.length; i += 80) out.push(...await apiGetAll('v_stop', `select=*&stop_key=${inList(keys.slice(i, i + 80))}${cab(cabang)}`));
    out.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
    return numify<Stop>(out, NUM_STOP);
  }),

  bulananTotal: (cabang: string) => cached(`bt|${cabang}`, async () =>
    numify<Row>(await apiGetAll('v_bulanan_total', `select=*${cab(cabang)}&order=bulan`),
      ['n_ritase', 'ton', 'qty_semen', 'qty_non_semen', 'biaya', 'n_unit', 'n_sopir', 'n_transporter', 'n_toko', 'n_sj', 'n_hari', 'lead_do_median', 'lead_do_avg', 'sj_balik_avg'])),
  bulanan: (cabang: string) => cached(`bl|${cabang}`, async () =>
    numify<Row>(await apiGetAll('v_bulanan', `select=*${cab(cabang)}&order=bulan`), ['n_ritase', 'ton', 'qty_semen', 'qty_non_semen', 'biaya', 'n_stop', 'n_sj'])),

  /* ---------- master ---------- */
  zona: (cabang: string) => cached(`zona|${cabang}`, async () =>
    numify<Row>(await apiGetAll('v_dim_zona', `select=*${cab(cabang)}&order=zone_code`), ['ring', 'lat', 'lng', 'n_baris', 'n_sj'])),
  produk: () => cached('produk', async () =>
    numify<Row>(await apiGetAll('v_dim_produk', 'select=*&order=kategori.desc,product_code'), ['kg_per_unit', 'ton_per_unit', 'n_baris', 'qty'])),
  transporter: () => cached('trp', () => apiGetAll('lg_transporter', 'select=*&order=nama')),
  dimTransporter: (cabang: string) => cached(`dimtrp|${cabang}`, async () =>
    numify<Row>(await apiGetAll('v_dim_transporter', `select=*${cab(cabang)}&order=n_ritase.desc`), ['n_ritase', 'n_unit', 'n_sopir'])),
  gudang: () => cached('gudang', async () => numify<Row>(await apiGetAll('lg_gudang', 'select=*&order=nama'), ['lat', 'lng'])),
  cabang: () => cached('cabang', () => apiGetAll('lg_cabang', 'select=*&order=kode')),
  batches: () => cached('batches', () => apiGetAll('lg_import_batch', 'select=*&order=id.desc')),

  /* ---------- tulis (RPC ber-PIN) ---------- */
  cekPin: (pin: string) => apiRpc<boolean>('lg_cek_pin', { p_pin: pin }),
  gantiPin: (lama: string, baru: string) => apiRpc<boolean>('lg_ganti_pin', { p_pin_lama: lama, p_pin_baru: baru }),
  importMulai: (pin: string, cabang: string, filename: string, dari: string, sampai: string) =>
    apiRpc<number>('lg_import_mulai', { p_pin: pin, p_cabang: cabang, p_filename: filename, p_tgl_dari: dari, p_tgl_sampai: sampai }),
  importBaris: (pin: string, batch: number, rows: Row[]) => apiRpc<number>('lg_import_baris', { p_pin: pin, p_batch_id: batch, p_rows: rows }),
  importSelesai: (pin: string, batch: number) => apiRpc<Row>('lg_import_selesai', { p_pin: pin, p_batch_id: batch }),
  importHapus: (pin: string, batch: number) => apiRpc<number>('lg_import_hapus', { p_pin: pin, p_batch_id: batch }),
  j028Simpan: (pin: string, cabang: string, filename: string, rows: Row[], ganti = true) =>
    apiRpc<Row>('lg_j028_simpan', { p_pin: pin, p_cabang: cabang, p_filename: filename, p_rows: rows, p_ganti: ganti }),
  masterSimpan: (pin: string, tabel: 'zona' | 'produk' | 'transporter' | 'gudang' | 'cabang', rows: Row[]) =>
    apiRpc<number>('lg_master_simpan', { p_pin: pin, p_tabel: tabel, p_rows: rows }),
};

/** Pesan yang lebih jelas bila fungsi RPC belum dibuat di database. */
export function rpcHint(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Could not find the function|PGRST202|404/.test(msg))
    return msg + ' — Fungsi ini belum ada di database. Jalankan file supabase/SETUP_LENGKAP.sql di Supabase SQL Editor (sekali saja).';
  if (/PIN salah/i.test(msg)) return 'PIN salah.';
  return msg;
}
