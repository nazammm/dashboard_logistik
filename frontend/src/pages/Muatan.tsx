import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { groupRit, komposisi, summarize, tipeMuatan } from '../lib/agg';
import { useSort } from '../lib/hooks';
import { donutPercentPlugins } from '../lib/chart';
import { COLORS, PALETTE, fmt, kirimColor, shortTrp } from '../lib/format';
import { Badge, Card, CellLink, ChartBox, Chips, ErrorBox, ExportButton, Kpi, Note, PageHeader, PageSkeleton, STh, Search, ShareBar, TableWrap, Th, pctTxt, usePager, useTo } from '../components/ui';

const TON_BUCKETS = [
  { label: '0 (non-semen)', test: (v: number) => v === 0 }, { label: '< 2 t', test: (v: number) => v > 0 && v < 2 }, { label: '2–4 t', test: (v: number) => v >= 2 && v < 4 },
  { label: '4–6 t', test: (v: number) => v >= 4 && v < 6 }, { label: '6–8 t', test: (v: number) => v >= 6 && v < 8 }, { label: '8–10 t', test: (v: number) => v >= 8 && v <= 10 },
  { label: '10–20 t', test: (v: number) => v > 10 && v <= 20 }, { label: '> 20 t', test: (v: number) => v > 20 },
];

export default function Muatan() {
  const p = usePeriod();
  const to = useTo();
  const nav = useNavigate();
  const tbl = useRef<HTMLTableElement>(null);
  const [kat, setKat] = useState<'ALL' | 'SEMEN' | 'NON SEMEN'>('ALL');
  const [q, setQ] = useState('');
  const { data, error } = usePeriodData({ muatan: true });

  const m = useMemo(() => {
    if (!data) return null;
    const tot = summarize(data.rit);
    const items = data.muatan;
    const kom = komposisi(items);
    const kirim = groupRit(data.rit, r => r.jenis_kirim);
    const trp = groupRit(data.rit, r => r.transporter).filter(t => t.ritSemen > 0);
    const tipe = groupRit(data.rit, r => tipeMuatan(r));
    const hist = TON_BUCKETS.map(b => ({ label: b.label, n: data.rit.filter(r => b.test(r.ton || 0)).length }));
    const lini = new Map<string, number>(), kel = new Map<string, number>();
    items.forEach(i => { if (i.kategori === 'SEMEN') lini.set(i.lini || 'Lainnya', (lini.get(i.lini || 'Lainnya') || 0) + (i.ton || 0)); else kel.set(i.kelompok || 'Lainnya', (kel.get(i.kelompok || 'Lainnya') || 0) + (i.jumlah || 0)); });
    const pm = new Map<string, { key: string; name: string; kategori: string; jenis: string; satuan: string; qty: number; ton: number; rit: Set<string>; toko: Set<string> }>();
    items.forEach(i => {
      if (!pm.has(i.product_code)) pm.set(i.product_code, { key: i.product_code, name: i.product_name, kategori: i.kategori, jenis: (i.kategori === 'SEMEN' ? i.lini : i.kelompok) || '–', satuan: i.satuan, qty: 0, ton: 0, rit: new Set(), toko: new Set() });
      const v = pm.get(i.product_code)!; v.qty += i.jumlah || 0; v.ton += i.ton || 0; v.rit.add(i.ritase_key); if (i.cust_code) v.toko.add(i.cust_code);
    });
    const produk = [...pm.values()].map(v => ({ ...v, nRit: v.rit.size, nToko: v.toko.size, perRit: v.qty / Math.max(1, v.rit.size) }));
    const zak = items.filter(i => i.kategori === 'SEMEN' && i.satuan === 'ZAK').reduce((a, i) => a + (i.jumlah || 0), 0);
    const curah = items.filter(i => i.kategori === 'SEMEN' && i.satuan === 'TON').reduce((a, i) => a + (i.jumlah || 0), 0);
    return { tot, kom, kirim, trp, tipe, hist, lini: [...lini.entries()].sort((a, b) => b[1] - a[1]), kel: [...kel.entries()].sort((a, b) => b[1] - a[1]), produk, zak, curah };
  }, [data]);

  const prodRows = useMemo(() => (m?.produk || []).filter(r => (kat === 'ALL' || r.kategori === kat) && (!q || (r.name + r.key + r.jenis).toUpperCase().includes(q.toUpperCase()))), [m, kat, q]);
  const s = useSort(prodRows, 'qty', 'desc', (r, k) => (r as never)[k]);
  const { view, Pager } = usePager(s.sorted, 50);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const campuran = m.tipe.find(t => t.key === 'Campuran');

  return (
    <>
      <PageHeader eyebrow="Analisis" title="Komposisi Muatan" desc={`Apa saja yang diangkut setiap ritase: semen (zak/curah) dan barang non-semen (pcs), rata-rata per ritase, dan per jenis produk — ${p.label}.`}
        right={<ExportButton filename={`produk-${p.cabang || 'semua'}-${p.tgl}.xlsx`} getTables={() => [{ name: 'Produk', el: tbl.current }]} />} />

      <div className="grid-kpi">
        <Kpi title="Semen" value={fmt(m.tot.ton, 1)} unit="ton" sub={`${fmt(m.zak)} zak + ${fmt(m.curah, 1)} ton curah`} />
        <Kpi title="Rata-rata ton / ritase semen" value={fmt(m.tot.tonPerRit, 2)} unit="ton" sub={`${fmt(m.tot.ritSemen)} dari ${fmt(m.tot.rit)} ritase membawa semen`} />
        <Kpi title="Non-semen" value={fmt(m.tot.qtyNon)} unit="pcs" sub={`${fmt(m.kom.rows.filter(r => r.kategori !== 'SEMEN').length)} kelompok barang`} />
        <Kpi title="Ritase campuran" value={pctTxt(campuran?.rit || 0, m.tot.rit)} sub={`${fmt(campuran?.rit || 0)} ritase semen + non-semen`} />
      </div>

      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <Card title="Rata-rata ton per ritase · per jenis kirim" className="flex-[1_1_360px]">
          <ChartBox height={220} deps={[m.kirim]} label="Ton per ritase per jenis kirim"
            build={() => ({
              type: 'bar',
              data: { labels: m.kirim.map(k => k.key), datasets: [{ data: m.kirim.map(k => k.tonPerRit || 0), backgroundColor: m.kirim.map(k => kirimColor(k.key)), maxBarThickness: 34 }] },
              options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, grid: { color: COLORS.line }, title: { display: true, text: 'ton / ritase' } }, y: { grid: { display: false } } },
                plugins: { tooltip: { callbacks: { label: (c: any) => ` ${fmt(c.parsed.x, 2)} ton/rit (${fmt(m.kirim[c.dataIndex].ritSemen)} ritase semen)` } } } },
            } as ChartConfiguration)} />
        </Card>
        <Card title="Sebaran tonase per ritase" className="flex-[1_1_360px]">
          <ChartBox height={220} deps={[m.hist]} label="Sebaran ton per ritase"
            build={() => ({
              type: 'bar',
              data: { labels: m.hist.map(h => h.label), datasets: [{ data: m.hist.map(h => h.n), backgroundColor: COLORS.accent, maxBarThickness: 34 }] },
              options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: COLORS.line }, title: { display: true, text: 'ritase' } }, x: { grid: { display: false } } } },
            } as ChartConfiguration)} />
        </Card>
        <Card title="Rata-rata ton per ritase · per transporter" className="flex-[1_1_360px]">
          <ChartBox height={220} deps={[m.trp]} label="Ton per ritase per transporter"
            build={() => ({
              type: 'bar',
              data: { labels: m.trp.map(t => shortTrp(t.key)), datasets: [{ data: m.trp.map(t => t.tonPerRit || 0), backgroundColor: COLORS.blue, maxBarThickness: 22 }] },
              options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, grid: { color: COLORS.line } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } },
                onClick: (_e: unknown, els: { index: number }[]) => { if (els[0]) nav(to('/transporter/' + encodeURIComponent(m.trp[els[0].index].key))); } },
            } as ChartConfiguration)} />
        </Card>
      </div>

      <h2 className="section-title">Komposisi per ritase <span className="n">· unit per jenis per ritase yang membawanya</span></h2>
      <div className="flex gap-4 flex-wrap items-start">
        <div className="flex-[2_1_560px] min-w-0">
          <TableWrap><table className="tbl-dense">
            <thead><tr><Th>Jenis</Th><Th>Kategori</Th><Th num>Total qty</Th><Th>Satuan</Th><Th num>Produk</Th><Th num>Ritase membawa</Th><Th num>Rata-rata / ritase</Th><Th>% dari semua ritase</Th></tr></thead>
            <tbody>{m.kom.rows.map(r => (
              <tr key={r.jenis}><td className="font-semibold">{r.jenis}</td><td><Badge variant={r.kategori === 'SEMEN' ? 'online' : 'neutral'}>{r.kategori}</Badge></td>
                <td className="num font-mono">{fmt(r.qty, r.satuan === 'TON' ? 1 : 0)}</td><td>{r.satuan}</td><td className="num font-mono">{fmt(r.nProduk)}</td><td className="num font-mono">{fmt(r.nRit)}</td>
                <td className="num font-mono font-semibold">{fmt(r.qtyPerRit, 1)}</td>
                <td><ShareBar value={r.share} max={100} label={fmt(r.share, 0) + '%'} color={r.kategori === 'SEMEN' ? COLORS.accent : COLORS.blueMid} /></td></tr>
            ))}</tbody>
          </table></TableWrap>
          <p className="text-[11.5px] text-faint mt-2">Contoh baca: “Paku · 120 pcs/ritase” = setiap ritase yang membawa paku rata-rata membawa 120 pcs paku.</p>
        </div>
        <div className="flex-[1_1_320px] flex flex-col gap-4">
          <Card title="Tonase per lini semen">
            <ChartBox height={220} deps={[m.lini]} label="Lini semen"
              build={() => ({
                type: 'doughnut',
                data: { labels: m.lini.map(x => x[0]), datasets: [{ data: m.lini.map(x => x[1]), backgroundColor: PALETTE, borderColor: '#F8F6F0', borderWidth: 2 }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: donutPercentPlugins('ton', v => `${fmt(v, 1)} ton`) as any },
              } as ChartConfiguration)} />
          </Card>
        </div>
      </div>

      <h2 className="section-title">Produk <span className="n">· klik untuk detail</span></h2>
      <div className="controls">
        <Chips value={kat} onChange={setKat} options={[{ value: 'ALL', label: 'Semua' }, { value: 'SEMEN', label: 'Semen' }, { value: 'NON SEMEN', label: 'Non-semen' }]} />
        <Search value={q} onChange={setQ} placeholder="Cari produk…" />
      </div>
      <TableWrap>
        <table ref={tbl} className="tbl-dense">
          <thead><tr><STh k="name" s={s}>Produk</STh><STh k="kategori" s={s}>Kategori</STh><STh k="jenis" s={s}>Jenis</STh><STh k="qty" s={s} num>Qty</STh><th>Satuan</th>
            <STh k="ton" s={s} num>Ton</STh><STh k="nRit" s={s} num>Ritase</STh><STh k="perRit" s={s} num>Qty/ritase</STh><STh k="nToko" s={s} num>Toko</STh></tr></thead>
          <tbody>{view.map(r => (
            <tr key={r.key}><td><CellLink to={to('/produk/' + encodeURIComponent(r.key))}>{r.name}</CellLink><div className="font-mono text-[10.5px] text-faint">{r.key}</div></td>
              <td><Badge variant={r.kategori === 'SEMEN' ? 'online' : 'neutral'}>{r.kategori}</Badge></td><td>{r.jenis}</td>
              <td className="num font-mono">{fmt(r.qty, r.satuan === 'TON' ? 1 : 0)}</td><td>{r.satuan}</td><td className="num font-mono">{r.ton ? fmt(r.ton, 1) : '–'}</td>
              <td className="num font-mono">{fmt(r.nRit)}</td><td className="num font-mono">{fmt(r.perRit, 1)}</td><td className="num font-mono">{fmt(r.nToko)}</td></tr>
          ))}</tbody>
        </table>
      </TableWrap>
      <Pager />
      <div className="mt-4"><Note>Klasifikasi produk dibuat otomatis dari kode & nama (CMT = Tiga Roda, RJW = Rajawali, CWC = White Cement, CWM = TR30 Mortar, curah = ton). Berat/zak dan kelompok non-semen bisa dikoreksi di <CellLink to={to('/master')}>Master Data → Produk</CellLink>.</Note></div>
    </>
  );
}
