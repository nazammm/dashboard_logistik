import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { groupRit } from '../lib/agg';
import { useSort } from '../lib/hooks';
import { COLORS, fmt, fmtIDRCompact, shortTrp } from '../lib/format';
import { exportRowsToExcel } from '../lib/xlsx';
import { Card, CellLink, ChartBox, Control, ErrorBox, ExportButton, Kpi, Note, PageHeader, PageSkeleton, STh, Search, TableWrap, Tabs, usePager, useTo } from '../components/ui';
import type { Ritase } from '../lib/types';

type Tab = 'unit' | 'sopir';

export default function Armada() {
  const p = usePeriod();
  const to = useTo();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'unit';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }); };
  const [q, setQ] = useState('');
  const [trp, setTrp] = useState('');
    const { data, error } = usePeriodData();

  const m = useMemo(() => {
    if (!data) return null;
    const rit = data.rit.filter(r => !trp || r.transporter === trp);
    const mk = (keyFn: (r: Ritase) => string | null) => groupRit(rit.filter(r => keyFn(r)), keyFn).map(a => {
      const rs = rit.filter(r => keyFn(r) === a.key);
      const perDay = new Map<string, number>();
      rs.forEach(r => perDay.set(r.tanggal, (perDay.get(r.tanggal) || 0) + 1));
      return {
        ...a, label: tab === 'unit' ? rs[0]?.plat_label || a.key : a.key,
        trps: [...new Set(rs.map(r => r.transporter).filter(Boolean))] as string[],
        others: [...new Set(rs.map(r => (tab === 'unit' ? r.sopir : r.plat_label)).filter(Boolean))] as string[],
        maxDay: Math.max(0, ...perDay.values()), ritHari: a.rit / Math.max(1, a.hari),
        kec: new Set(rs.flatMap(r => r.gids || [])).size, luar: rs.filter(r => r.dalam_luar === 'LUAR KOTA').length,
      };
    });
    const units = mk(r => r.plat), sopir = mk(r => r.sopir);
    // histogram ritase per unit-hari
    const ud = new Map<string, number>();
    rit.forEach(r => { if (r.plat) ud.set(r.plat + '|' + r.tanggal, (ud.get(r.plat + '|' + r.tanggal) || 0) + 1); });
    const hist = [1, 2, 3, 4, 5].map(n => ({ n, c: [...ud.values()].filter(v => (n === 5 ? v >= 5 : v === n)).length }));
    // unit yang aktif di bulan ini tapi tidak jalan hari ini (mode harian)
    const idle = p.mode === 'harian' ? [...new Set(data.ritBulan.filter(r => !trp || r.transporter === trp).map(r => r.plat).filter(Boolean))].filter(pl => !rit.some(r => r.plat === pl)) as string[] : [];
    const trps = [...new Set(data.rit.map(r => r.transporter).filter(Boolean))].sort() as string[];
    return { units, sopir, hist, idle, trps };
  }, [data, trp, tab, p.mode]);

  const rows = useMemo(() => (m ? (tab === 'unit' ? m.units : m.sopir) : []).filter(r => !q || (r.label + ' ' + r.others.join(' ') + ' ' + r.trps.join(' ')).toUpperCase().includes(q.toUpperCase())), [m, tab, q]);
  const s = useSort(rows, 'rit', 'desc', (r, k) => (r as never)[k]);
  const { view, Pager } = usePager(s.sorted, 60);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const ud = m.hist.reduce((a, h) => a + h.c, 0);

  return (
    <>
      <PageHeader eyebrow="Armada & Mitra" title="Unit & Sopir" desc="Utilisasi armada: berapa ritase per unit/sopir per hari, berapa ton yang diangkut, dan ke mana saja. Klik plat atau nama sopir untuk melihat peta tujuan dan semua ritasenya."
        right={<ExportButton filename="" onExport={() => exportRowsToExcel([{ name: tab === 'unit' ? 'Unit' : 'Sopir', rows: s.sorted.map(r => ({
          [tab === 'unit' ? 'Unit' : 'Sopir']: r.label, [tab === 'unit' ? 'Sopir' : 'Unit']: r.others.join(', '), Transporter: r.trps.join(', '), Ritase: r.rit, Ton: Number(r.ton.toFixed(3)),
          'Ton/rit': r.tonPerRit, 'Hari aktif': r.hari, 'Rit/hari': Number(r.ritHari.toFixed(2)), 'Maks/hari': r.maxDay, Titik: r.stop, Kecamatan: r.kec, 'Luar kota': r.luar, Ongkos: r.biaya })) }], `${tab}-${p.cabang || 'semua'}-${p.tgl}.xlsx`)} />} />

      <div className="grid-kpi mb-5">
        <Kpi title="Unit aktif" value={fmt(m.units.length)} sub={`${fmt(m.sopir.length)} sopir`} />
        <Kpi title="Unit-hari operasi" value={fmt(ud)} sub="kombinasi unit × hari yang ada ritasenya" />
        <Kpi title="1 rit / hari" value={fmt(m.hist[0].c)} sub={`${((m.hist[0].c / Math.max(1, ud)) * 100).toFixed(0)}% unit-hari hanya 1 ritase`} />
        <Kpi title="≥ 3 rit / hari" value={fmt(m.hist.slice(2).reduce((a, h) => a + h.c, 0))} sub="unit-hari dengan 3 ritase atau lebih" />
      </div>

      <div className="flex gap-4 flex-wrap items-stretch mb-5">
        <Card title="Sebaran ritase per unit per hari" className="flex-[1_1_380px]">
          <ChartBox height={200} deps={[m.hist]} label="Histogram ritase per unit per hari"
            build={() => ({
              type: 'bar',
              data: { labels: m.hist.map(h => (h.n === 5 ? '5+' : String(h.n)) + ' rit'), datasets: [{ data: m.hist.map(h => h.c), backgroundColor: COLORS.blue, maxBarThickness: 40 }] },
              options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: COLORS.line }, title: { display: true, text: 'unit-hari' } }, x: { grid: { display: false } } } },
            } as ChartConfiguration)} />
        </Card>
        {p.mode === 'harian' && (
          <Card title={`Unit tidak jalan pada ${p.label}`} className="flex-[1_1_380px]">
            <p className="text-[12.5px] text-soft mb-2">Aktif di bulan ini tetapi tidak punya ritase di tanggal ini ({fmt(m.idle.length)} unit).</p>
            <div className="flex flex-wrap gap-1.5 max-h-[170px] overflow-y-auto">{m.idle.map(pl => <CellLink key={pl} to={to('/unit/' + encodeURIComponent(pl))}>{pl}</CellLink>)}</div>
          </Card>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'unit', label: `Unit (${m.units.length})` }, { value: 'sopir', label: `Sopir (${m.sopir.length})` }]} />
      <div className="controls">
        <Control label="Transporter">
          <select value={trp} onChange={e => setTrp(e.target.value)}><option value="">Semua</option>{m.trps.map(t => <option key={t} value={t}>{shortTrp(t)}</option>)}</select>
        </Control>
        <Control label="Cari"><Search value={q} onChange={setQ} placeholder={tab === 'unit' ? 'Plat, sopir, transporter…' : 'Nama sopir, plat…'} /></Control>
      </div>
      {tab === 'sopir' && <div className="mb-3"><Note>Nama sopir dinormalisasi (huruf besar, spasi rapi). Bila satu orang ditulis berbeda di sumber data, ia tetap terhitung terpisah.</Note></div>}

      <TableWrap>
        <table className="tbl-dense">
          <thead><tr>
            <STh k="label" s={s}>{tab === 'unit' ? 'Unit (plat)' : 'Sopir'}</STh><th>{tab === 'unit' ? 'Sopir' : 'Unit'}</th><th>Transporter</th>
            <STh k="rit" s={s} num>Ritase</STh><STh k="ton" s={s} num>Ton</STh><STh k="tonPerRit" s={s} num>Ton/rit</STh><STh k="hari" s={s} num>Hari aktif</STh>
            <STh k="ritHari" s={s} num>Rit/hari</STh><STh k="maxDay" s={s} num>Maks/hari</STh><STh k="stop" s={s} num>Titik</STh><STh k="kec" s={s} num>Kecamatan</STh>
            <STh k="luar" s={s} num>Luar kota</STh><STh k="biaya" s={s} num>Ongkos</STh>
          </tr></thead>
          <tbody>{view.map(r => (
            <tr key={r.key}>
              <td><CellLink to={to(`/${tab}/` + encodeURIComponent(r.key))}>{r.label}</CellLink></td>
              <td className="max-w-[200px] truncate" title={r.others.join(', ')}>{r.others.slice(0, 2).join(', ')}{r.others.length > 2 ? ` +${r.others.length - 2}` : ''}</td>
              <td className="max-w-[180px] truncate" title={r.trps.join(', ')}>{r.trps.map(shortTrp).join(', ')}</td>
              <td className="num font-mono">{fmt(r.rit)}</td><td className="num font-mono">{fmt(r.ton, 1)}</td><td className="num font-mono">{fmt(r.tonPerRit, 2)}</td>
              <td className="num font-mono">{fmt(r.hari)}</td><td className="num font-mono">{fmt(r.ritHari, 2)}</td><td className="num font-mono">{fmt(r.maxDay)}</td>
              <td className="num font-mono">{fmt(r.stop)}</td><td className="num font-mono">{fmt(r.kec)}</td><td className="num font-mono">{fmt(r.luar)}</td>
              <td className="num font-mono">{fmtIDRCompact(r.biaya)}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>
      <Pager />
    </>
  );
}
