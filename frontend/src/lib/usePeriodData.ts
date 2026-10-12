import { useMemo } from 'react';
import { DataSource } from './data';
import { addMonths } from './format';
import { useAsync } from './hooks';
import { usePeriod } from './period';
import type { Muatan, Ritase, Stop } from './types';

export interface PeriodData {
  ritBulan: Ritase[];        // seluruh bulan (untuk grafik harian dalam bulan)
  rit: Ritase[];             // periode aktif (harian = 1 hari, bulanan = 1 bulan)
  ritPrev: Ritase[] | null;  // pembanding: bulan lalu / hari berdata sebelumnya
  prevLabel: string;
  stops: Stop[];             // periode aktif (kalau diminta)
  muatan: Muatan[];          // periode aktif (kalau diminta)
}

/** Muat data periode aktif. Selalu memuat 1 bulan penuh (cache), lalu disaring ke hari bila mode harian. */
export function usePeriodData(opts: { stops?: boolean; muatan?: boolean; prev?: boolean } = {}) {
  const p = usePeriod();
  const st = useAsync(async () => {
    if (!p.ready) return null;
    const prevBulan = addMonths(p.bulan, -1);
    const [ritBulan, stops, muatan, ritPrevBulan] = await Promise.all([
      DataSource.ritaseBulan(p.cabang, p.bulan),
      opts.stops ? DataSource.stopBulan(p.cabang, p.bulan) : Promise.resolve([] as Stop[]),
      opts.muatan ? DataSource.muatanBulan(p.cabang, p.bulan) : Promise.resolve([] as Muatan[]),
      opts.prev && p.mode === 'bulanan' && p.periode.some(x => x.bulan === prevBulan) ? DataSource.ritaseBulan(p.cabang, prevBulan) : Promise.resolve(null),
    ]);
    return { ritBulan, stops, muatan, ritPrevBulan };
  }, [p.ready, p.cabang, p.bulan, p.mode, !!opts.stops, !!opts.muatan, !!opts.prev]);

  const data = useMemo<PeriodData | null>(() => {
    const d = st.data;
    if (!d) return null;
    const inRange = (t: string) => t >= p.dari && t <= p.sampai;
    const rit = p.mode === 'bulanan' ? d.ritBulan : d.ritBulan.filter(r => inRange(r.tanggal));
    let ritPrev: Ritase[] | null = null, prevLabel = '';
    if (p.mode === 'bulanan') { ritPrev = d.ritPrevBulan; prevLabel = 'bulan lalu'; }
    else {
      const prevDay = [...new Set(d.ritBulan.map(r => r.tanggal))].filter(t => t < p.tgl).sort().pop();
      if (prevDay) { ritPrev = d.ritBulan.filter(r => r.tanggal === prevDay); prevLabel = 'hari data sebelumnya'; }
    }
    return {
      ritBulan: d.ritBulan, rit, ritPrev, prevLabel,
      stops: p.mode === 'bulanan' ? d.stops : d.stops.filter(s => inRange(s.tanggal)),
      muatan: p.mode === 'bulanan' ? d.muatan : d.muatan.filter(m => inRange(m.tanggal)),
    };
  }, [st.data, p.mode, p.dari, p.sampai, p.tgl]);

  return { data, error: st.error, loading: st.loading || !p.ready };
}
