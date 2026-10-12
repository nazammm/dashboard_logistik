import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { groupRit, summarize } from '../lib/agg';
import { useSort } from '../lib/hooks';
import { useAsync } from '../lib/hooks';
import { DataSource } from '../lib/data';
import { COLORS, PALETTE, esc, fmt, fmtIDRCompact, kirimColor, shortTrp } from '../lib/format';
import CoverageMap from '../components/CoverageMap';
import { Card, CellLink, ChartBox, ErrorBox, ExportButton, Legend, PageHeader, PageSkeleton, STh, ShareBar, TableWrap, pctTxt, useTo } from '../components/ui';

const KIRIM = ['Gudang → Toko', 'Gudang → Gudang', 'Pabrik → Toko', 'Pelabuhan → Toko'];

export default function Transporter() {
  const p = usePeriod();
  const to = useTo();
  const nav = useNavigate();
  const tbl = useRef<HTMLTableElement>(null);
  const { data, error } = usePeriodData({ stops: true });
  const gud = useAsync(() => DataSource.gudang(), []);

  const m = useMemo(() => {
    if (!data) return null;
    const tot = summarize(data.rit);
    const rows = groupRit(data.rit, r => r.transporter).map(a => {
      const rs = data.rit.filter(r => (r.transporter ?? '(kosong)') === a.key);
      const st = data.stops.filter(s => (s.transporter ?? '(kosong)') === a.key && s.jenis_kirim !== 'Gudang → Gudang');
      return {
        ...a, kec: new Set(st.map(s => s.gid).filter(Boolean)).size,
        luar: rs.filter(r => r.dalam_luar === 'LUAR KOTA').length,
        kir: Object.fromEntries(KIRIM.map(k => [k, rs.filter(r => r.jenis_kirim === k).length])),
        biayaPerTon: a.ton > 0 ? a.biaya / a.ton : null,
        color: PALETTE[0],
      };
    });
    rows.forEach((r, i) => { r.color = PALETTE[i % PALETTE.length]; });
    // transporter dominan per kecamatan (tonase)
    const byGid = new Map<string, Map<string, number>>();
    data.stops.forEach(s => {
      if (!s.gid || s.jenis_kirim === 'Gudang → Gudang') return;
      const t = s.transporter || '(kosong)';
      if (!byGid.has(s.gid)) byGid.set(s.gid, new Map());
      byGid.get(s.gid)!.set(t, (byGid.get(s.gid)!.get(t) || 0) + (s.ton || 0) + 0.001);
    });
    const colorOf = new Map(rows.map(r => [r.key, r.color]));
    const dom = new Map<string, string>(), val = new Map<string, number>(), domName = new Map<string, string>();
    byGid.forEach((mm, gid) => {
      const best = [...mm.entries()].sort((a, b) => b[1] - a[1])[0];
      dom.set(gid, colorOf.get(best[0]) || '#999'); val.set(gid, [...mm.values()].reduce((a, b) => a + b, 0)); domName.set(gid, best[0]);
    });
    return { tot, rows, dom, val, domName, byGid };
  }, [data]);

  const s = useSort(m?.rows || [], 'ton', 'desc', (r, k) => (k.startsWith('kir:') ? r.kir[k.slice(4)] : (r as never)[k]));

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const top = m.rows.slice(0, 8);

  return (
    <>
      <PageHeader eyebrow="Armada & Mitra" title="Transporter" desc={`Kinerja setiap transporter pada ${p.label}. Klik nama transporter untuk melihat cakupan wilayahnya di peta, unit & sopir, rute, dan isi muatan.`}
        right={<ExportButton filename={`transporter-${p.cabang || 'semua'}-${p.tgl}.xlsx`} getTables={() => [{ name: 'Transporter', el: tbl.current }]} />} />

      <TableWrap>
        <table ref={tbl}>
          <thead><tr>
            <STh k="key" s={s}>Transporter</STh><STh k="rit" s={s} num>Ritase</STh><STh k="ton" s={s} num>Ton</STh><STh k="tonPerRit" s={s} num>Ton/rit</STh>
            <STh k="unit" s={s} num>Unit</STh><STh k="sopir" s={s} num>Sopir</STh><STh k="ritPerUnitHari" s={s} num title="Ritase per unit per hari operasi">Rit/unit/hr</STh>
            <STh k="stop" s={s} num>Titik</STh><STh k="kec" s={s} num>Kecamatan</STh><STh k="luar" s={s} num>Luar kota</STh>
            <STh k="biaya" s={s} num>Ongkos</STh><STh k="biayaPerTon" s={s} num>Ongkos/ton</STh><STh k="ton" s={s}>Porsi ton</STh>
          </tr></thead>
          <tbody>{s.sorted.map(r => (
            <tr key={r.key}>
              <td><span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: r.color }} /><CellLink to={to('/transporter/' + encodeURIComponent(r.key))}>{r.key}</CellLink></td>
              <td className="num font-mono">{fmt(r.rit)}</td><td className="num font-mono">{fmt(r.ton, 1)}</td><td className="num font-mono">{fmt(r.tonPerRit, 2)}</td>
              <td className="num font-mono">{fmt(r.unit)}</td><td className="num font-mono">{fmt(r.sopir)}</td><td className="num font-mono">{fmt(r.ritPerUnitHari, 2)}</td>
              <td className="num font-mono">{fmt(r.stop)}</td><td className="num font-mono">{fmt(r.kec)}</td><td className="num font-mono">{pctTxt(r.luar, r.rit, 0)}</td>
              <td className="num font-mono">{fmtIDRCompact(r.biaya)}</td><td className="num font-mono">{r.biayaPerTon ? fmtIDRCompact(r.biayaPerTon) : '–'}</td>
              <td><ShareBar value={r.ton} max={m.tot.ton} color={r.color} label={pctTxt(r.ton, m.tot.ton)} /></td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>

      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <Card title="Ritase per jenis kirim" className="flex-[1_1_420px]">
          <Legend items={KIRIM.map(k => ({ label: k, color: kirimColor(k) }))} />
          <ChartBox height={Math.max(220, top.length * 34 + 40)} deps={[m.rows]} label="Ritase per transporter per jenis kirim"
            build={() => ({
              type: 'bar',
              data: { labels: top.map(r => shortTrp(r.key)), datasets: KIRIM.map(k => ({ label: k, data: top.map(r => r.kir[k]), backgroundColor: kirimColor(k), maxBarThickness: 22 })) },
              options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { color: COLORS.line } }, y: { stacked: true, grid: { display: false } } },
                onClick: (_e: unknown, els: { index: number }[]) => { if (els[0]) nav(to('/transporter/' + encodeURIComponent(top[els[0].index].key))); } },
            } as ChartConfiguration)} />
        </Card>
        <Card title="Kecamatan dikuasai (transporter dominan per tonase)" className="flex-[1_1_480px]">
          <Legend items={m.rows.filter(r => [...m.domName.values()].includes(r.key)).map(r => ({ label: shortTrp(r.key), color: r.color }))} />
          <CoverageMap values={m.val} categoryColor={m.dom} height={380} gudang={(gud.data || []) as never}
            tooltip={(gid, f) => `<b>${esc(f?.properties.kec)}</b> · ${esc(f?.properties.kab)}<br>${[...(m.byGid.get(gid) || new Map()).entries()].sort((a, b) => b[1] - a[1]).map(([t, v]) => `${esc(shortTrp(t))}: ${fmt(v, 1)} t`).join('<br>')}`}
            onClickGid={gid => nav(to('/transporter/' + encodeURIComponent(m.domName.get(gid) || '')))} />
        </Card>
      </div>
    </>
  );
}
