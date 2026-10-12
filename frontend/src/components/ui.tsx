import { useEffect, useRef, useState, type ReactNode, type ThHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useChart } from '../lib/chart';
import { exportTablesToExcel } from '../lib/xlsx';
import { fmt, fmtPct } from '../lib/format';
import type { ChartConfiguration } from 'chart.js';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

/** Buat link yang tetap membawa periode (query string) halaman saat ini. */
export function useTo() {
  const { search } = useLocation();
  const keep = new URLSearchParams(search);
  const q = new URLSearchParams();
  ['mode', 'tgl', 'cabang'].forEach(k => { const v = keep.get(k); if (v != null) q.set(k, v); });
  return (path: string, extra?: Record<string, string>) => {
    const qq = new URLSearchParams(q);
    Object.entries(extra || {}).forEach(([k, v]) => qq.set(k, v));
    const s = qq.toString();
    return s ? `${path}${path.includes('?') ? '&' : '?'}${s}` : path;
  };
}

/* ---------- Header halaman ---------- */
export function PageHeader({ title, desc, eyebrow, right, children }: { title: ReactNode; desc?: ReactNode; eyebrow?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="font-mono text-[10.5px] uppercase text-faint mb-2" style={{ letterSpacing: '.07em' }}>{eyebrow}</div>}
      <div className="flex flex-wrap items-start justify-between gap-6 max-md:flex-col max-md:gap-2">
        <div className="min-w-0">
          <h1 className="text-[clamp(28px,3.6vw,42px)] leading-[1.02] break-words">{title}</h1>
          {desc && <p className="text-soft text-[14px] max-w-[760px] mt-2.5 leading-relaxed">{desc}</p>}
        </div>
        {right && <div className="shrink-0 flex gap-2 flex-wrap items-center">{right}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export type Variant = 'good' | 'warn' | 'bad' | 'neutral' | 'online';
export function Badge({ variant = 'neutral', children, className, title }: { variant?: Variant; children: ReactNode; className?: string; title?: string }) {
  return <span className={cx('badge', variant, className)} title={title}><span className="dot" aria-hidden="true" />{children}</span>;
}
export const DummyBadge = ({ title = 'Data contoh — ganti dengan data asli' }: { title?: string }) => <Badge variant="warn" title={title}>Dummy</Badge>;

/* ---------- Kartu & KPI ---------- */
export function Card({ title, children, className, plain, right }: { title?: ReactNode; children: ReactNode; className?: string; plain?: boolean; right?: ReactNode }) {
  return (
    <div className={cx('card', plain && 'plain', className)}>
      {(title || right) && <div className="flex items-start justify-between gap-3 mb-1">{title && <div className="card-title">{title}</div>}{right}</div>}
      {children}
    </div>
  );
}

export function Kpi({ title, value, unit, sub, delta, hint, onClick, active }: {
  title: string; value: ReactNode; unit?: string; sub?: ReactNode; delta?: { now: number; prev: number | null | undefined; label: string; invert?: boolean } | null;
  hint?: string; onClick?: () => void; active?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={hint}
      className={cx('card text-left', onClick && 'cursor-pointer hover:border-accent transition-colors', active && '!border-accent ring-1 ring-accent')}>
      <div className="card-title">{title}{hint && <span className="ml-1 text-line-strong" aria-hidden="true">ⓘ</span>}</div>
      <div className="kpi-value">{value}{unit && <span className="unit">{unit}</span>}</div>
      {delta && <Delta {...delta} />}
      {sub && <div className="text-[12px] text-soft mt-1.5 leading-snug">{sub}</div>}
    </Tag>
  );
}

export function Delta({ now, prev, label, invert }: { now: number; prev: number | null | undefined; label: string; invert?: boolean }) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return <div className="kpi-delta text-faint">– vs {label}</div>;
  const p = ((now - prev) / Math.abs(prev)) * 100;
  const up = p >= 0;
  const good = invert ? !up : up;
  return <div className={cx('kpi-delta', good ? 'up' : 'down')}>{up ? '▲' : '▼'} {fmtPct(Math.abs(p))} <span className="text-faint font-normal">vs {label}</span></div>;
}

/* ---------- Status pemuatan ---------- */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Memuat data…">
      <div className="skel w-[190px] h-[11px] mb-3.5" />
      <div className="skel w-[min(280px,60%)] h-[34px] mb-[22px]" />
      <div className="grid-kpi mb-7">{[0, 1, 2, 3].map(i => <div key={i} className="skel h-24" />)}</div>
      <div className="skel h-[360px]" />
    </div>
  );
}
export function Loading({ text = 'Memuat…' }: { text?: string }) {
  return <div className="py-[60px] text-center text-faint font-mono text-[12.5px]" role="status"><div className="spinner" aria-hidden="true" />{text}</div>;
}
export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error || 'Terjadi kesalahan saat mengambil data.');
  return <div className="error-box" role="alert">{msg}</div>;
}
export function EmptyBox({ children }: { children: ReactNode }) { return <div className="empty-box">{children}</div>; }
export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'info' }) {
  const c = tone === 'warn' ? 'border-amber bg-amber-soft' : tone === 'info' ? 'border-blue-mid bg-blue-soft' : 'border-line-strong bg-surface2';
  return <div className={cx('border-l-[3px] rounded-sm px-4 py-3 text-[13px] leading-relaxed text-ink', c)}>{children}</div>;
}

/* ---------- Form ---------- */
export function Control({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="control"><label>{label}</label>{children}{hint && <div className="text-[11px] text-faint mt-1 max-w-[230px] leading-snug">{hint}</div>}</div>;
}
export function Select({ label, options, ...rest }: { label: string; options: { value: string | number; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Control label={label}>
      <select {...rest}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </Control>
  );
}
export function Chip({ active, onClick, children, title }: { active?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return <button type="button" className={cx('chip', active && 'active')} aria-pressed={!!active} onClick={onClick} title={title}>{children}</button>;
}
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return <div className="pill-row" role="group" aria-label={label}>{options.map(o => <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>{o.label}</Chip>)}</div>;
}
export function Search({ value, onChange, placeholder = 'Cari…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="search" className="search-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />;
}

/* ---------- Tabel ---------- */
export function Th({ children, sortable, ariaSort, onSort, num, ...rest }: {
  children?: ReactNode; sortable?: boolean; ariaSort?: 'ascending' | 'descending'; onSort?: () => void; num?: boolean;
} & Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onClick'>) {
  return (
    <th {...rest} className={cx(sortable && 'sortable', num && 'num', rest.className)} aria-sort={ariaSort}
      onClick={sortable ? onSort : undefined} tabIndex={sortable ? 0 : undefined}
      onKeyDown={sortable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort?.(); } } : undefined}>
      {children}
    </th>
  );
}
/** Header kolom yang bisa diurutkan (pakai hasil useSort). */
export function STh({ k, s, children, num, title }: { k: string; s: { toggle: (k: string) => void; ariaSort: (k: string) => 'ascending' | 'descending' | undefined }; children: ReactNode; num?: boolean; title?: string }) {
  return <Th sortable num={num} ariaSort={s.ariaSort(k)} onSort={() => s.toggle(k)} title={title}>{children}</Th>;
}
export function TableWrap({ children, className, maxH }: { children: ReactNode; className?: string; maxH?: number }) {
  return <div className={cx('table-wrap', className)} style={maxH ? { maxHeight: maxH, overflowY: 'auto' } : undefined}>{children}</div>;
}
export function CellLink({ to, children, title }: { to: string; children: ReactNode; title?: string }) { return <Link to={to} className="cell-link" title={title}>{children}</Link>; }

/** Batang kecil inline (pangsa) di dalam sel tabel. */
export function ShareBar({ value, max, color = '#FF5A1F', label }: { value: number; max: number; color?: string; label?: string }) {
  const w = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 bg-surface2 border border-line rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${w}%`, background: color }} /></div>
      {label != null && <span className="font-mono text-[11px] text-soft w-[46px] text-right">{label}</span>}
    </div>
  );
}

/** Paging sederhana untuk tabel panjang. */
export function usePager<T>(rows: T[], size = 50) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const view = rows.slice(page * size, page * size + size);
  const Pager = () => rows.length <= size ? null : (
    <div className="flex items-center justify-between gap-3 mt-2.5 font-mono text-[11.5px] text-soft">
      <span>{fmt(page * size + 1)}–{fmt(Math.min(rows.length, page * size + size))} dari {fmt(rows.length)}</span>
      <span className="flex gap-1.5">
        <button type="button" className="chip" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Sebelumnya</button>
        <button type="button" className="chip" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Berikutnya →</button>
      </span>
    </div>
  );
  return { view, Pager, page, setPage };
}

/* ---------- Grafik ---------- */
export function ChartBox({ build, deps, className, label, height }: { build: () => ChartConfiguration | null; deps: unknown[]; className?: string; label?: string; height?: number }) {
  const ref = useChart(build, deps);
  return <div className={cx('chart-box', className)} style={height ? { height } : undefined}><canvas ref={ref} role="img" aria-label={label} /></div>;
}

/* ---------- Export ---------- */
export function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 2.5h9l5 5V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" fill="#E4F3E8" stroke="#1D7A46" strokeWidth="1.2" />
      <path d="M14 2.5V7a1 1 0 0 0 1 1h4.5" fill="none" stroke="#1D7A46" strokeWidth="1.2" />
      <rect x="6.2" y="11.3" width="11.6" height="7.6" rx="1" fill="#1D7A46" />
      <path d="m8.5 13 2.4 4.2m0-4.2-2.4 4.2" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" /><path d="M13.7 13v4.2h2.5" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
export function ExportButton({ filename, getTables, label = 'Export Excel', onExport }: {
  filename: string; getTables?: () => { name: string; el: HTMLTableElement | null | undefined }[]; label?: string; onExport?: () => void;
}) {
  const busy = useRef(false);
  return (
    <button type="button" className="btn" onClick={() => {
      if (busy.current) return;
      busy.current = true;
      try { if (onExport) onExport(); else if (getTables) exportTablesToExcel(getTables(), filename); } finally { busy.current = false; }
    }}>
      <FileIcon />{label}
    </button>
  );
}

export function BackLink({ to, children = 'Kembali' }: { to: string; children?: ReactNode }) {
  return <Link to={to} className="inline-flex items-center gap-1.5 font-mono text-xs text-soft hover:text-accent-ink mb-4">← {children}</Link>;
}

/** Baris label–nilai untuk panel detail. */
export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([k, v], i) => <div key={i} className="contents"><dt className="font-mono text-[10.5px] uppercase text-faint pt-[3px]" style={{ letterSpacing: '.05em' }}>{k}</dt><dd className="m-0 break-words">{v ?? '–'}</dd></div>)}
    </dl>
  );
}

/** Legenda warna kecil. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="legend">{items.map(i => <span key={i.label}><i style={{ background: i.color }} aria-hidden="true" />{i.label}</span>)}</div>;
}

export const pctTxt = (part: number, total: number, d = 1) => fmtPct(total > 0 ? (part / total) * 100 : null, d);

/** Tabs sederhana. */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist">
      {tabs.map(t => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('px-4 py-2.5 font-mono text-[12px] uppercase whitespace-nowrap border-b-2 -mb-px transition-colors', value === t.value ? 'border-accent text-ink font-semibold' : 'border-transparent text-faint hover:text-accent-ink')}
          style={{ letterSpacing: '.05em' }}>{t.label}</button>
      ))}
    </div>
  );
}
