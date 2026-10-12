import { useMemo, useRef, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { usePeriod } from '../lib/period';
import { DataSource } from '../lib/data';
import { useAsync } from '../lib/hooks';
import { COLORS, PALETTE, fmt, fmtBulan, fmtIDRCompact, kirimColor, shortTrp } from '../lib/format';
import { Card, ChartBox, Chips, ErrorBox, ExportButton, Legend, Note, PageHeader, PageSkeleton, TableWrap, Th } from '../components/ui';

type Dim = 'transporter' | 'jenis_kirim' | 'gudang_asal' | 'dalam_luar';

export default function Tren() {
  const p = usePeriod();
  const tbl = useRef<HTMLTableElement>(null);
  const [dim, setDim] = useState<Dim>('transporter');
  const [met, setMet] = useState<'ton' | 'n_ritase'>('ton');
  const st = useAsync(async () => {
    const [tot, det] = await Promise.all([DataSource.bulananTotal(p.cabang), DataSource.bulanan(p.cabang)]);
    return { tot, det };
  }, [p.cabang]);

  const m = useMemo(() => {
    const d = st.data;
    if (!d) return null;
    const months = [...new Set(d.tot.map(r => r.bulan as string))].sort();
    const sumBy = (rows: typeof d.tot, k: string) => months.map(b => rows.filter(r => r.bulan === b).reduce((a, r) => a + Number(r[k] || 0), 0));
    const tot = { rit: sumBy(d.tot, 'n_ritase'), ton: sumBy(d.tot, 'ton'), unit: sumBy(d.tot, 'n_unit'), sopir: sumBy(d.tot, 'n_sopir'), biaya: sumBy(d.tot, 'biaya'),
      non: sumBy(d.tot, 'qty_non_semen'), toko: sumBy(d.tot, 'n_toko'), hari: sumBy(d.tot, 'n_hari'), lead: months.map(b => d.tot.find(r => r.bulan === b)?.lead_do_median ?? null) };
    const keys = [...new Set(d.det.map(r => r[dim] as string))];
    const series = keys.map(k => ({ k, v: months.map(b => d.det.filter(r => r.bulan === b && r[dim] === k).reduce((a, r) => a + Number(r[met] || 0), 0)) }))
      .sort((a, b) => b.v.reduce((x, y) => x + y, 0) - a.v.reduce((x, y) => x + y, 0));
    return { months, tot, series };
  }, [st.data, dim, met]);

  if (st.error) return <ErrorBox error={st.error} />;
  if (!m) return <PageSkeleton />;
  const labels = m.months.map(b => fmtBulan(b));
  const color = (k: string, i: number) => (dim === 'jenis_kirim' ? kirimColor(k) : PALETTE[i % PALETTE.length]);

  return (
    <>
      <PageHeader eyebrow="Analisis" title="Tren Bulanan" desc="Perkembangan ritase, tonase, armada, dan lead time dari bulan ke bulan. Grafik akan terisi otomatis setiap kali data bulan baru diimport."
        right={<ExportButton filename={`tren-${p.cabang || 'semua'}.xlsx`} getTables={() => [{ name: 'Tren', el: tbl.current }]} />} />
      {m.months.length < 3 && <div className="mb-5"><Note tone="info">Saat ini baru ada {m.months.length} bulan data ({labels.join(', ')}). Tren akan lebih bermakna setelah beberapa bulan diimport.</Note></div>}

      <div className="flex gap-4 flex-wrap items-stretch">
        <Card title="Ritase & tonase" className="flex-[1_1_440px]">
          <ChartBox height={260} deps={[m]} label="Ritase dan tonase bulanan"
            build={() => ({
              type: 'bar',
              data: { labels, datasets: [
                { label: 'Ton', data: m.tot.ton, backgroundColor: COLORS.accent, yAxisID: 'y', maxBarThickness: 40, order: 2 },
                { label: 'Ritase', data: m.tot.rit, type: 'line', borderColor: COLORS.blue, backgroundColor: COLORS.blue, yAxisID: 'y1', pointRadius: 4, borderWidth: 2, order: 1 },
              ] },
              options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: COLORS.line } }, y1: { position: 'right', beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } },
                plugins: { legend: { display: true, position: 'top', align: 'end' } } },
            } as ChartConfiguration)} />
        </Card>
        <Card title="Armada aktif" className="flex-[1_1_440px]">
          <ChartBox height={260} deps={[m]} label="Unit dan sopir aktif per bulan"
            build={() => ({
              type: 'line',
              data: { labels, datasets: [
                { label: 'Unit', data: m.tot.unit, borderColor: COLORS.accent, backgroundColor: COLORS.accent, pointRadius: 4, borderWidth: 2 },
                { label: 'Sopir', data: m.tot.sopir, borderColor: COLORS.blue, backgroundColor: COLORS.blue, pointRadius: 4, borderWidth: 2, borderDash: [5, 4] },
              ] },
              options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: COLORS.line } }, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'top', align: 'end' } } },
            } as ChartConfiguration)} />
        </Card>
      </div>

      <h2 className="section-title">Komposisi per bulan</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-3 mb-3">
        <Chips value={dim} onChange={setDim} options={[{ value: 'transporter', label: 'Transporter' }, { value: 'jenis_kirim', label: 'Jenis kirim' }, { value: 'gudang_asal', label: 'Gudang asal' }, { value: 'dalam_luar', label: 'Dalam/Luar kota' }]} />
        <Chips value={met} onChange={setMet} options={[{ value: 'ton', label: 'Ton' }, { value: 'n_ritase', label: 'Ritase' }]} />
      </div>
      <Card>
        <Legend items={m.series.slice(0, 10).map((s, i) => ({ label: dim === 'transporter' ? shortTrp(s.k) : s.k, color: color(s.k, i) }))} />
        <ChartBox height={300} deps={[m.series]} label="Komposisi bulanan"
          build={() => ({
            type: 'bar',
            data: { labels, datasets: m.series.map((s, i) => ({ label: dim === 'transporter' ? shortTrp(s.k) : s.k, data: s.v, backgroundColor: color(s.k, i), maxBarThickness: 60 })) },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: COLORS.line } } } },
          } as ChartConfiguration)} />
      </Card>

      <h2 className="section-title">Tabel bulanan</h2>
      <TableWrap>
        <table ref={tbl} className="tbl-dense">
          <thead><tr><Th>Bulan</Th><Th num>Hari</Th><Th num>Ritase</Th><Th num>Ton</Th><Th num>Ton/hari</Th><Th num>Unit</Th><Th num>Sopir</Th><Th num>Toko</Th><Th num>Non-semen (pcs)</Th><Th num>Lead median</Th><Th num>Ongkos</Th></tr></thead>
          <tbody>{m.months.map((b, i) => (
            <tr key={b}><td className="font-semibold">{fmtBulan(b, true)}</td><td className="num font-mono">{fmt(m.tot.hari[i])}</td><td className="num font-mono">{fmt(m.tot.rit[i])}</td>
              <td className="num font-mono">{fmt(m.tot.ton[i], 1)}</td><td className="num font-mono">{fmt(m.tot.ton[i] / Math.max(1, m.tot.hari[i]), 1)}</td>
              <td className="num font-mono">{fmt(m.tot.unit[i])}</td><td className="num font-mono">{fmt(m.tot.sopir[i])}</td><td className="num font-mono">{fmt(m.tot.toko[i])}</td>
              <td className="num font-mono">{fmt(m.tot.non[i])}</td><td className="num font-mono">{m.tot.lead[i] != null ? fmt(m.tot.lead[i], 0) : '–'}</td><td className="num font-mono">{fmtIDRCompact(m.tot.biaya[i])}</td></tr>
          ))}</tbody>
        </table>
      </TableWrap>
      {!p.cabang && p.cabangList.length > 1 && <p className="font-mono text-[11px] text-faint mt-2">Semua cabang dijumlahkan; unit/sopir dapat terhitung ganda bila beroperasi di lebih dari satu cabang.</p>}
    </>
  );
}
