export const MONTHS_ID = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const MONTHS_FULL = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const fmt = (n: unknown, d = 0) =>
  Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtMaybe = (n: unknown, d = 0, empty = '–') => (n == null || n === '' || !Number.isFinite(Number(n)) ? empty : fmt(n, d));
export const fmtIDR = (n: unknown) => 'Rp' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
export function fmtIDRCompact(v: unknown) {
  const n = Number(v || 0), abs = Math.abs(n);
  if (abs >= 1e12) return 'Rp' + (n / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' T';
  if (abs >= 1e9) return 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (abs >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  return fmtIDR(n);
}
export function fmtCompact(v: unknown) {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' rb';
  return fmt(n);
}
export const fmtPct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d).replace('.', ',') + '%');
export const share = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);

/** '2026-01-05' -> '05 Jan 2026' */
export function fmtDate(d?: string | null, withYear = true) {
  if (!d) return '–';
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !dd) return d;
  return `${String(dd).padStart(2, '0')} ${MONTHS_ID[m]}${withYear ? ' ' + y : ''}`;
}
/** '2026-01-05' -> 'Sen, 05 Jan' */
export function fmtDay(d?: string | null) {
  if (!d) return '–';
  const dt = parseISODate(d);
  return `${DAYS_ID[dt.getDay()]}, ${fmtDate(d, false)}`;
}
/** Timestamp -> '09:53' */
export function fmtJam(ts?: string | null) {
  if (!ts) return '–';
  const m = ts.match(/[T ](\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '–';
}
/** jam desimal 9.5 -> '09:30' */
export const fmtJamDec = (h: number | null | undefined) => {
  if (h == null || !Number.isFinite(h)) return '–';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 59 : mm).padStart(2, '0')}`;
};
export const fmtMenit = (m: number | null | undefined) => {
  if (m == null || !Number.isFinite(m)) return '–';
  if (m < 60) return `${Math.round(m)} mnt`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return `${h} j ${r} m`;
};
export const fmtBulan = (b?: string | null, full = false) => {
  if (!b) return '–';
  const [y, m] = b.slice(0, 7).split('-').map(Number);
  return `${(full ? MONTHS_FULL : MONTHS_ID)[m]} ${y}`;
};
export const parseISODate = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd); };
export const isoDate = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
export const addDays = (d: string, n: number) => { const dt = parseISODate(d); dt.setDate(dt.getDate() + n); return isoDate(dt); };
export const monthStart = (d: string) => d.slice(0, 7) + '-01';
export const monthEnd = (d: string) => { const dt = parseISODate(monthStart(d)); dt.setMonth(dt.getMonth() + 1); dt.setDate(0); return isoDate(dt); };
export const addMonths = (b: string, n: number) => { const dt = parseISODate(monthStart(b)); dt.setMonth(dt.getMonth() + n); return isoDate(dt); };
export function daysInRange(from: string, to: string) {
  const out: string[] = []; let d = from;
  while (d <= to && out.length < 400) { out.push(d); d = addDays(d, 1); }
  return out;
}

/** Cegah formula injection di Excel. */
export const xlsxSafeCell = (text: string) => (/^[=+\-@\t\r]/.test(text) ? "'" + text : text);

export function median(vals: number[]) {
  const a = vals.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export const avg = (vals: number[]) => { const a = vals.filter(v => Number.isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
export function percentile(vals: number[], p: number) {
  const a = vals.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const idx = (a.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

export const COLORS = {
  accent: '#FF5A1F', accentSoft: 'rgba(255,90,31,.16)', blue: '#204A63', blueMid: '#3E7899', blueSoft: 'rgba(62,120,153,.16)',
  green: '#3F7A52', red: '#B23B2E', amber: '#B8791A', ink: '#211E19', line: '#C6BFAF', faint: '#8A8375',
};
export const PALETTE = ['#FF5A1F', '#204A63', '#3F7A52', '#B8791A', '#8A5FA8', '#3E7899', '#B23B2E', '#6B6153', '#C77D9B', '#5E8C31'];
/** Warna stabil untuk sebuah kategori (mis. nama transporter). */
export function colorFor(key: string, palette = PALETTE) {
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
export const KIRIM_COLOR: Record<string, string> = {
  'Gudang → Toko': '#FF5A1F', 'Gudang → Gudang': '#204A63', 'Pabrik → Toko': '#3F7A52', 'Pelabuhan → Toko': '#B8791A',
};
export const kirimColor = (j: string) => KIRIM_COLOR[j] || colorFor(j);

export function chartSRSummary(labels: string[], values: number[], unit?: string) {
  if (!labels?.length) return '';
  return `Ringkasan data grafik: ${labels.map((l, i) => `${l}: ${fmt(values[i], 1)}${unit ? ' ' + unit : ''}`).join('; ')}.`;
}
/** Judul yang rapi untuk nama kapital: 'PT. LINTAS ABADI' tetap; 'ABANG JULFIANSYAH' -> 'Abang Julfiansyah' */
export const titleCase = (s?: string | null) => (s || '').toLowerCase().replace(/(^|[\s(./-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** Escape teks untuk HTML tooltip Leaflet. */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** Nama transporter pendek untuk label grafik. */
export const shortTrp = (s?: string | null) => (s || '–').replace(/^PT\.?\s+/i, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
