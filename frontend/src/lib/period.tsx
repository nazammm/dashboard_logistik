// Periode global (seperti web semen: Harian / Bulanan) + cabang. Disimpan di URL (?cabang=&mode=&tgl=) supaya link
// yang dibagikan membuka periode yang sama, dan di sessionStorage sebagai default saat membuka halaman lain.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, addMonths, fmtBulan, fmtDay, monthEnd, monthStart } from './format';
import { useAsync } from './hooks';
import { DataSource } from './data';
import type { Periode } from './types';

export type Mode = 'harian' | 'bulanan';
export interface PeriodState {
  cabang: string;                 // '' = semua cabang
  mode: Mode;
  tgl: string;                    // harian: YYYY-MM-DD; bulanan: YYYY-MM-01
  dari: string; sampai: string;   // rentang aktif
  bulan: string;                  // bulan (YYYY-MM-01) yang memuat periode
  label: string;                  // 'Jan 2026' / 'Sen, 05 Jan'
  periode: Periode[];             // ketersediaan data
  cabangList: string[];
  hariAda: Set<string> | null;    // (diisi halaman yang memuat ritase) -> navigasi lompat ke hari berdata
  set: (p: Partial<{ cabang: string; mode: Mode; tgl: string }>) => void;
  geser: (n: number) => void;
  ready: boolean;
  kosong: boolean;               // database belum berisi data sama sekali
}

const Ctx = createContext<PeriodState | null>(null);
const SS_KEY = 'lg_period';

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [sp, setSp] = useSearchParams();
  const per = useAsync(() => DataSource.periode(), []);
  const periode = per.data || [];

  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch { return null; } })() as null | { cabang: string; mode: Mode; tgl: string };
  const cabangList = useMemo(() => [...new Set(periode.map(p => p.cabang))].sort(), [periode]);
  const latest = useMemo(() => periode.reduce<string | null>((m, p) => (!m || p.tgl_max > m ? p.tgl_max : m), null), [periode]);
  // bulan "utama" = bulan dengan baris terbanyak di antara 2 bulan terakhir (hindari bulan yang baru berisi 1 hari ekor data)
  const defaultBulan = useMemo(() => {
    const byMonth = new Map<string, number>();
    periode.forEach(p => byMonth.set(p.bulan, (byMonth.get(p.bulan) || 0) + p.n_baris));
    const sorted = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    if (!sorted.length) return null;
    if (sorted.length > 1 && sorted[0][1] < sorted[1][1] * 0.2) return sorted[1][0];
    return sorted[0][0];
  }, [periode]);

  const mode: Mode = (sp.get('mode') as Mode) || saved?.mode || 'bulanan';
  const cabangQ = sp.get('cabang');
  const cabang = cabangQ != null ? cabangQ : saved?.cabang ?? (cabangList.length === 1 ? cabangList[0] : '');
  let tgl = sp.get('tgl') || saved?.tgl || '';
  if (!tgl) {
    if (mode === 'bulanan') tgl = defaultBulan || (latest ? monthStart(latest) : '');
    else {
      const lastInDefault = periode.filter(p => p.bulan === defaultBulan).map(p => p.tgl_max).sort().pop();
      tgl = lastInDefault || latest || '';
    }
  }
  if (mode === 'bulanan' && tgl) tgl = monthStart(tgl);

  useEffect(() => {
    if (tgl) try { sessionStorage.setItem(SS_KEY, JSON.stringify({ cabang, mode, tgl })); } catch { /* private mode */ }
  }, [cabang, mode, tgl]);

  const value = useMemo<PeriodState>(() => {
    const dari = mode === 'bulanan' ? monthStart(tgl || '2000-01-01') : tgl;
    const sampai = mode === 'bulanan' ? monthEnd(tgl || '2000-01-01') : tgl;
    const set: PeriodState['set'] = p => {
      const next = new URLSearchParams(sp);
      const m = p.mode ?? mode;
      let t = p.tgl ?? tgl;
      if (p.mode && p.mode !== mode && !p.tgl) {
        // pindah mode: bulanan -> hari terakhir berdata di bulan itu; harian -> bulan dari tanggal itu
        if (m === 'harian') {
          const mx = periode.filter(x => x.bulan === monthStart(tgl) && (!cabang || x.cabang === cabang)).map(x => x.tgl_max).sort().pop();
          t = mx || tgl;
        } else t = monthStart(tgl);
      }
      next.set('mode', m); next.set('tgl', t); next.set('cabang', p.cabang ?? cabang);
      setSp(next, { replace: false });
    };
    const geser = (n: number) => set({ tgl: mode === 'bulanan' ? addMonths(tgl, n) : addDays(tgl, n) });
    return {
      cabang, mode, tgl, dari, sampai, bulan: monthStart(tgl || '2000-01-01'),
      label: mode === 'bulanan' ? fmtBulan(tgl) : fmtDay(tgl),
      periode: periode.filter(p => !cabang || p.cabang === cabang), cabangList, hariAda: null, set, geser,
      ready: !!per.data && !!tgl,
      kosong: !!per.data && per.data.length === 0,
    };
  }, [cabang, mode, tgl, periode, cabangList, per.data, sp, setSp]);

  if (per.error) return <div className="p-10"><div className="error-box" role="alert">{per.error.message}</div></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePeriod() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePeriod di luar PeriodProvider');
  return v;
}

/** Query string periode saat ini — dipakai untuk membuat link ke halaman detail tanpa kehilangan periode. */
export function usePeriodQS() {
  const p = usePeriod();
  return `mode=${p.mode}&tgl=${p.tgl}&cabang=${encodeURIComponent(p.cabang)}`;
}
