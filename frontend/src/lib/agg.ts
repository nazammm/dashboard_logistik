// Agregasi di browser atas data 1 bulan (ratusan–ribuan baris) — cepat & fleksibel untuk filter klik.
import type { Muatan, Ritase, Stop } from './types';
import { median, percentile } from './format';

export interface Agg {
  key: string;
  rit: number; ton: number; qtySemen: number; qtyNon: number; biaya: number;
  stop: number; sj: number; toko: number; unit: number; sopir: number; hari: number; transporter: number;
  ritSemen: number;            // ritase yang membawa semen (ton > 0) -> dasar rata-rata ton/ritase
  tonPerRit: number | null;    // ton / ritSemen
  ritPerUnitHari: number | null;
  gids: Map<string, number>;   // gid -> ton (untuk peta)
}

/** Kelompokkan ritase. keyFn boleh mengembalikan array (mis. 1 ritase ke beberapa kecamatan). */
export function groupRit(rows: Ritase[], keyFn: (r: Ritase) => string | null | undefined | (string | null | undefined)[]): Agg[] {
  const m = new Map<string, { rows: Ritase[] }>();
  rows.forEach(r => {
    const ks = keyFn(r);
    (Array.isArray(ks) ? ks : [ks]).forEach(k => {
      const kk = k ?? '(kosong)';
      if (!m.has(kk)) m.set(kk, { rows: [] });
      m.get(kk)!.rows.push(r);
    });
  });
  return [...m.entries()].map(([key, g]) => summarize(g.rows, key)).sort((a, b) => b.ton - a.ton || b.rit - a.rit);
}

export function summarize(rows: Ritase[], key = 'Total'): Agg {
  const plat = new Set<string>(), sopir = new Set<string>(), hari = new Set<string>(), trp = new Set<string>(), unitHari = new Set<string>();
  let ton = 0, qs = 0, qn = 0, biaya = 0, stop = 0, sj = 0, toko = 0, ritSemen = 0;
  const gids = new Map<string, number>();
  rows.forEach(r => {
    ton += r.ton || 0; qs += r.qty_semen || 0; qn += r.qty_non_semen || 0; biaya += r.biaya || 0;
    stop += r.n_stop || 0; sj += r.n_sj || 0; toko += r.n_toko || 0;
    if ((r.ton || 0) > 0) ritSemen++;
    if (r.plat) { plat.add(r.plat); unitHari.add(r.plat + '|' + r.tanggal); }
    if (r.sopir) sopir.add(r.sopir);
    if (r.transporter) trp.add(r.transporter);
    hari.add(r.tanggal);
    const g = r.gids || [];
    g.forEach(id => gids.set(id, (gids.get(id) || 0) + (r.ton || 0) / g.length));
  });
  return {
    key, rit: rows.length, ton, qtySemen: qs, qtyNon: qn, biaya, stop, sj, toko,
    unit: plat.size, sopir: sopir.size, hari: hari.size, transporter: trp.size,
    ritSemen, tonPerRit: ritSemen ? ton / ritSemen : null,
    ritPerUnitHari: unitHari.size ? rows.filter(r => r.plat).length / unitHari.size : null,
    gids,
  };
}

/** Peta gid -> metrik untuk sekumpulan stop (lebih akurat dari ritase karena per titik bongkar). */
export function gidMetric(stops: Stop[], metric: 'ton' | 'stop' | 'rit' | 'toko') {
  const m = new Map<string, { ton: number; stop: number; rit: Set<string>; toko: Set<string> }>();
  stops.forEach(s => {
    if (!s.gid) return;
    if (!m.has(s.gid)) m.set(s.gid, { ton: 0, stop: 0, rit: new Set(), toko: new Set() });
    const v = m.get(s.gid)!;
    v.ton += s.ton || 0; v.stop++; v.rit.add(s.ritase_key); if (s.cust_code) v.toko.add(s.cust_code);
  });
  const out = new Map<string, number>();
  m.forEach((v, k) => out.set(k, metric === 'ton' ? v.ton : metric === 'stop' ? v.stop : metric === 'rit' ? v.rit.size : v.toko.size));
  return out;
}

export interface Dist { label: string; n: number }
/** Distribusi nilai ke dalam ember (mis. lead time). */
export function buckets(vals: number[], edges: { label: string; test: (v: number) => boolean }[]): Dist[] {
  return edges.map(e => ({ label: e.label, n: vals.filter(e.test).length }));
}

export function stats(vals: (number | null | undefined)[]) {
  const a = vals.filter((v): v is number => v != null && Number.isFinite(v));
  return {
    n: a.length,
    avg: a.length ? a.reduce((s, v) => s + v, 0) / a.length : null,
    med: median(a), p90: percentile(a, 0.9), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null,
  };
}

/** Komposisi muatan per ritase: rata-rata qty per jenis (lini semen / kelompok non-semen) per ritase yang membawanya. */
export function komposisi(items: Muatan[]) {
  const rits = new Set(items.map(i => i.ritase_key));
  const by = new Map<string, { kategori: string; satuan: string; qty: number; ton: number; rit: Set<string>; produk: Set<string> }>();
  items.forEach(i => {
    const k = i.kategori === 'SEMEN' ? (i.lini || 'Semen lain') : (i.kelompok || 'Lainnya');
    if (!by.has(k)) by.set(k, { kategori: i.kategori, satuan: i.satuan, qty: 0, ton: 0, rit: new Set(), produk: new Set() });
    const v = by.get(k)!;
    v.qty += i.jumlah || 0; v.ton += i.ton || 0; v.rit.add(i.ritase_key); v.produk.add(i.product_code);
  });
  return {
    nRit: rits.size,
    rows: [...by.entries()].map(([jenis, v]) => ({
      jenis, kategori: v.kategori, satuan: v.satuan, qty: v.qty, ton: v.ton, nRit: v.rit.size, nProduk: v.produk.size,
      qtyPerRit: v.rit.size ? v.qty / v.rit.size : 0, share: rits.size ? (v.rit.size / rits.size) * 100 : 0,
    })).sort((a, b) => (a.kategori === b.kategori ? b.qty - a.qty : a.kategori === 'SEMEN' ? -1 : 1)),
  };
}

/** Tipe muatan sebuah ritase. */
export const tipeMuatan = (r: Pick<Ritase, 'qty_semen' | 'qty_non_semen'>) =>
  r.qty_semen > 0 && r.qty_non_semen > 0 ? 'Campuran' : r.qty_semen > 0 ? 'Semen saja' : r.qty_non_semen > 0 ? 'Non-semen saja' : 'Kosong';

export const uniq = <T,>(a: (T | null | undefined)[]) => [...new Set(a.filter((x): x is T => x != null))];
