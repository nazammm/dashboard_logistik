import * as XLSX from 'xlsx';

/** Kolom tujuan (lg_muatan) -> daftar variasi judul kolom di Excel (dinormalisasi: huruf kecil, tanpa spasi/tanda baca). */
export const COLUMN_MAP: Record<string, string[]> = {
  src_no: ['no'],
  tanggal_order: ['tanggalorder', 'tglorder'],
  foad_no: ['foadno', 'nofoad', 'foad'],
  order_date: ['orderdate'],
  som_type: ['somtype', 'jenissom'],
  som_date: ['somdate', 'tglsom'],
  som_code: ['somcode', 'nosom', 'som'],
  do_no: ['dono', 'nodo'],
  do_date: ['dodate', 'tgldo'],
  est_delv_date: ['estdelvdate', 'estdeliverydate', 'estdelv'],
  sj_no: ['sjno', 'nosj'],
  sj_date: ['sjdate', 'tglsj'],
  salesman: ['salesmanname', 'salesman'],
  status_som_sj: ['statussomsj'],
  cust_code: ['custcode', 'customercode', 'kodetoko'],
  cust_name: ['custname', 'customername', 'namatoko'],
  cust_tiro_code: ['custtirocode', 'tirocode'],
  daerah: ['daerah', 'area'],
  product_code: ['productcode', 'kodeproduk'],
  product_name: ['productname', 'namaproduk'],
  jumlah: ['jumlah', 'qty', 'quantity'],
  transporter: ['transportername', 'transporter', 'ekspedisi'],
  zone_code: ['zonetranscode', 'zonecode'],
  zone_name: ['zonetransname', 'zonename', 'zona'],
  driver: ['driver', 'sopir', 'supir'],
  plat_no: ['platno', 'nopol', 'platnomor', 'nopolisi'],
  gudang_asal: ['gudangasal'],
  gudang_tujuan: ['gudangtujuan'],
  harga_perzak: ['hargaperzak', 'hargazak'],
  jml_harga: ['jmlharga', 'jumlahharga', 'totalharga'],
  terbit_sj: ['terbitsj'],
  selesai_muat: ['selesaimuat'],
  kirim: ['kirim', 'tglkirim'],
  tgl_terima_sj_toko: ['tglterimasjtoko'],
  tgl_terima_sj_doplanner: ['tglterimasjdoplanner'],
  no_sj_terminal: ['nosjterminal'],
  tgl_sj_terminal: ['tglsjterminal'],
  alamat: ['alamat'],
  ket: ['ket', 'keterangan'],
  po_no: ['pono', 'nopo'],
  sdo_no: ['sdono', 'nosdo'],
  status_som_po: ['statussompo'],
  no_kontainer: ['nokontainer', 'kontainer', 'nocontainer'],
  no_seal: ['noseal', 'seal'],
  foad_type: ['foadtype'],
  ket_dalam_luar_kota: ['ketdalamluarkota', 'dalamluarkota'],
};
export const REQUIRED = ['foad_no', 'order_date', 'product_code', 'jumlah', 'plat_no', 'transporter'];
const DATE_COLS = new Set(['tanggal_order', 'order_date', 'som_date', 'do_date', 'est_delv_date', 'sj_date', 'terbit_sj', 'kirim',
  'tgl_terima_sj_toko', 'tgl_terima_sj_doplanner', 'tgl_sj_terminal', 'selesai_muat']);

const normHeader = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ParsedFile {
  rows: Record<string, string | null>[];
  mapped: Record<string, string>;      // kolom tujuan -> judul asli
  unmapped: string[];                  // judul Excel yang tidak dikenali
  missingRequired: string[];
  tglMin: string | null; tglMax: string | null;
  cabangTebakan: string | null;
  sheetName: string;
  invalid: number;                     // baris tanpa order_date / foad_no
}

/** Serial Excel -> 'YYYY-MM-DD' (dihitung di UTC agar tidak geser zona waktu). */
export function serialToISO(n: number) {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
/** Nilai sel -> teks yang dimengerti fungsi lg_to_date/lg_to_ts di database. */
function cellToText(v: unknown, isDate: boolean): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (isDate) return String(v);           // serial Excel; dikonversi di server
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  }
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')} ${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}:${String(v.getSeconds()).padStart(2, '0')}`;
  const s = String(v).trim();
  return s === '' ? null : s;
}
/** Tebak tanggal ISO dari teks/serial (hanya untuk menghitung rentang & validasi di browser). */
export function guessISO(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n > 20000 && n < 90000 ? serialToISO(Math.floor(n)) : null; }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const mon: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', MEI: '05', JUN: '06', JUL: '07', AUG: '08', AGU: '08', SEP: '09', OCT: '10', OKT: '10', NOV: '11', DEC: '12', DES: '12' };
  const m2 = s.toUpperCase().match(/^(\d{1,2})[ -]([A-Z]{3})[A-Z]*[ -](\d{4})/);
  if (m2 && mon[m2[2]]) return `${m2[3]}-${mon[m2[2]]}-${m2[1].padStart(2, '0')}`;
  return null;
}

export function parseWorkbook(buf: ArrayBuffer | Uint8Array, preferSheet?: string): ParsedFile {
  const wb = XLSX.read(buf, { type: buf instanceof Uint8Array ? 'array' : 'array', cellDates: false, raw: false });
  // pilih sheet yang header-nya paling banyak dikenali
  let best = { name: wb.SheetNames[0], score: -1, headerRow: 0 };
  for (const name of preferSheet ? [preferSheet] : wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, blankrows: false, range: 0 }).slice(0, 15);
    aoa.forEach((r, i) => {
      const score = r.filter(h => Object.values(COLUMN_MAP).some(v => v.includes(normHeader(h)))).length;
      if (score > best.score) best = { name, score, headerRow: i };
    });
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[best.name], { header: 1, raw: true, blankrows: false });
  const header = (aoa[best.headerRow] || []).map(h => String(h ?? '').trim());
  const colIdx: Record<string, number> = {};
  const mapped: Record<string, string> = {};
  const unmapped: string[] = [];
  header.forEach((h, i) => {
    const n = normHeader(h);
    const key = Object.keys(COLUMN_MAP).find(k => COLUMN_MAP[k].includes(n));
    if (key && colIdx[key] == null) { colIdx[key] = i; mapped[key] = h; } else if (h) unmapped.push(h);
  });
  const missingRequired = REQUIRED.filter(k => colIdx[k] == null);
  const rows: Record<string, string | null>[] = [];
  let tglMin: string | null = null, tglMax: string | null = null, invalid = 0;
  const salesPrefix = new Map<string, number>();
  for (let r = best.headerRow + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    if (!line.some(v => v != null && v !== '')) continue;
    const o: Record<string, string | null> = {};
    for (const k of Object.keys(colIdx)) o[k] = cellToText(line[colIdx[k]], DATE_COLS.has(k));
    const od = guessISO(o.order_date ?? null);
    if (!od || !o.foad_no) { invalid++; continue; }
    if (!tglMin || od < tglMin) tglMin = od;
    if (!tglMax || od > tglMax) tglMax = od;
    const sp = (o.salesman || '').match(/^([A-Z]{2,4})\d/);
    if (sp) salesPrefix.set(sp[1], (salesPrefix.get(sp[1]) || 0) + 1);
    rows.push(o);
  }
  const cabangTebakan = [...salesPrefix.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { rows, mapped, unmapped, missingRequired, tglMin, tglMax, cabangTebakan, sheetName: best.name, invalid };
}

/* ---------------- J028 (format belum diketahui: pemetaan kolom fleksibel) ---------------- */
export const J028_FIELDS: { key: string; label: string; guess: string[]; required?: boolean }[] = [
  { key: 'do_no', label: 'No. DO', guess: ['dono', 'nodo', 'nomordo', 'donumber', 'do'], required: true },
  { key: 'do_date', label: 'Tanggal DO', guess: ['dodate', 'tgldo', 'tanggaldo', 'tanggal', 'date'] },
  { key: 'cust_code', label: 'Kode Toko', guess: ['custcode', 'customercode', 'kodetoko', 'kodecustomer', 'kodecust'] },
  { key: 'cust_name', label: 'Nama Toko', guess: ['custname', 'customername', 'namatoko', 'namacustomer', 'customer'] },
  { key: 'product_code', label: 'Kode Produk', guess: ['productcode', 'kodeproduk', 'kodebarang', 'itemcode', 'kodeitem'] },
  { key: 'product_name', label: 'Nama Produk', guess: ['productname', 'namaproduk', 'namabarang', 'itemname'] },
  { key: 'qty', label: 'Qty DO', guess: ['qty', 'jumlah', 'quantity', 'qtydo', 'totalqty'], required: true },
  { key: 'salesman', label: 'Salesman', guess: ['salesmanname', 'salesman', 'sales'] },
  { key: 'keterangan', label: 'Keterangan', guess: ['ket', 'keterangan', 'remark', 'note'] },
];

export function readSheetGrid(buf: ArrayBuffer): { sheet: string; header: string[]; rows: unknown[][] } {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const name = wb.SheetNames[0];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, blankrows: false });
  let hi = 0, best = -1;
  aoa.slice(0, 15).forEach((r, i) => { const s = r.filter(v => typeof v === 'string' && v.trim()).length; if (s > best) { best = s; hi = i; } });
  return { sheet: name, header: (aoa[hi] || []).map(h => String(h ?? '').trim()), rows: aoa.slice(hi + 1) };
}
export function guessJ028Mapping(header: string[]) {
  const m: Record<string, number> = {};
  J028_FIELDS.forEach(f => { const i = header.findIndex(h => f.guess.includes(normHeader(h))); if (i >= 0) m[f.key] = i; });
  return m;
}
export function buildJ028Rows(rows: unknown[][], mapping: Record<string, number>) {
  return rows.map(r => {
    const o: Record<string, string | null> = {};
    J028_FIELDS.forEach(f => { const i = mapping[f.key]; o[f.key] = i == null || i < 0 ? null : cellToText(r[i], f.key === 'do_date'); });
    return o;
  }).filter(o => o.do_no);
}
