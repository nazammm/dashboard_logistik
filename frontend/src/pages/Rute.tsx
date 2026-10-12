import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { stats, summarize } from '../lib/agg';
import { useSort } from '../lib/hooks';
import { fmt, kirimColor } from '../lib/format';
import { exportRowsToExcel } from '../lib/xlsx';
import { Card, CellLink, Control, ErrorBox, ExportButton, Note, PageHeader, PageSkeleton, STh, Search, ShareBar, TableWrap, Tabs, pctTxt, usePager, useTo } from '../components/ui';
import type { Stop } from '../lib/types';

type Tab = 'rute' | 'zona' | 'toko';
const KIRIM_INFO: Record<string, string> = {
  'Gudang → Toko': 'Stok dari gudang cabang (BUMIRAYA/WAJOK) diantar ke toko. Dokumen lengkap: DO → SOM → SJ toko.',
  'Gudang → Gudang': 'Mutasi stok antar gudang (mis. BUMIRAYA ↔ WAJOK). Tidak ada DO/SJ toko; dokumennya SOM saja.',
  'Pabrik → Toko': 'Kirim langsung dari pabrik (curah/bulk, satuan ton) memakai PO; status SOM-PO = APPROVE.',
  'Pelabuhan → Toko': 'Ambil dari pelabuhan/terminal pakai kontainer + seal (umumnya 560 zak = 28 ton), lalu langsung ke toko.',
};

interface RouteRow { key: string; jenis: string; asal: string; tujuan: string; rit: Set<string>; stop: number; ton: number; toko: Set<string>; lead: number[] }

export default function Rute() {
  const p = usePeriod();
  const to = useTo();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'rute';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }); };
  const [level, setLevel] = useState<'kab' | 'kec'>('kab');
  const [q, setQ] = useState('');
  const { data, error } = usePeriodData({ stops: true });

  const m = useMemo(() => {
    if (!data) return null;
    const stops = data.stops;
    const tot = summarize(data.rit);
    const byKirim = ['Gudang → Toko', 'Gudang → Gudang', 'Pabrik → Toko', 'Pelabuhan → Toko'].map(k => ({ k, s: summarize(data.rit.filter(r => r.jenis_kirim === k)) }));
    // rute asal -> tujuan
    const rm = new Map<string, RouteRow>();
    stops.forEach(s => {
      const tujuan = s.jenis_kirim === 'Gudang → Gudang' ? `Gudang ${s.gudang_tujuan || '?'}` : level === 'kab' ? (s.kabupaten || s.daerah || '(belum dipetakan)') : `${s.kecamatan || '?'} · ${s.kabupaten || ''}`;
      const key = `${s.jenis_kirim}|${s.gudang_asal}|${tujuan}`;
      if (!rm.has(key)) rm.set(key, { key, jenis: s.jenis_kirim, asal: s.gudang_asal || '–', tujuan, rit: new Set(), stop: 0, ton: 0, toko: new Set(), lead: [] });
      const r = rm.get(key)!; r.rit.add(s.ritase_key); r.stop++; r.ton += s.ton || 0; if (s.cust_code) r.toko.add(s.cust_code); if (s.lead_do_hari != null) r.lead.push(s.lead_do_hari);
    });
    const routes = [...rm.values()].map(r => ({ ...r, nRit: r.rit.size, nToko: r.toko.size, leadMed: stats(r.lead).med })).sort((a, b) => b.ton - a.ton || b.nRit - a.nRit);
    // zona
    const zm = new Map<string, { key: string; name: string; kec: string | null; ring: number | null; dl: string; rit: Set<string>; stop: number; ton: number; toko: Set<string>; trp: Set<string>; gid: string | null }>();
    stops.forEach(s => {
      if (!s.zone_code) return;
      if (!zm.has(s.zone_code)) zm.set(s.zone_code, { key: s.zone_code, name: s.zone_name || s.zone_code, kec: s.kecamatan, ring: s.ring, dl: s.dalam_luar, rit: new Set(), stop: 0, ton: 0, toko: new Set(), trp: new Set(), gid: s.gid });
      const z = zm.get(s.zone_code)!; z.rit.add(s.ritase_key); z.stop++; z.ton += s.ton || 0; if (s.cust_code) z.toko.add(s.cust_code); if (s.transporter) z.trp.add(s.transporter);
    });
    const zonas = [...zm.values()].map(z => ({ ...z, nRit: z.rit.size, nToko: z.toko.size, nTrp: z.trp.size }));
    // toko
    const tm = new Map<string, { key: string; name: string; daerah: string | null; kec: string | null; stops: Stop[] }>();
    stops.forEach(s => {
      if (!s.cust_code) return;
      if (!tm.has(s.cust_code)) tm.set(s.cust_code, { key: s.cust_code, name: s.cust_name || s.cust_code, daerah: s.daerah, kec: s.kecamatan, stops: [] });
      tm.get(s.cust_code)!.stops.push(s);
    });
    const tokos = [...tm.values()].map(t => ({
      key: t.key, name: t.name, daerah: t.daerah, kec: t.kec, stop: t.stops.length, ton: t.stops.reduce((a, s) => a + (s.ton || 0), 0),
      non: t.stops.reduce((a, s) => a + (s.qty_non_semen || 0), 0), leadMed: stats(t.stops.map(s => s.lead_do_hari)).med,
      trp: new Set(t.stops.map(s => s.transporter)).size, jenis: [...new Set(t.stops.map(s => s.jenis_kirim))].join(', '),
    }));
    return { tot, byKirim, routes, zonas, tokos };
  }, [data, level]);

  const rRows = useMemo(() => (m?.routes || []).filter(r => !q || (r.asal + r.tujuan + r.jenis).toUpperCase().includes(q.toUpperCase())), [m, q]);
  const zRows = useMemo(() => (m?.zonas || []).filter(r => !q || (r.name + r.key).toUpperCase().includes(q.toUpperCase())), [m, q]);
  const tRows = useMemo(() => (m?.tokos || []).filter(r => !q || (r.name + r.key + (r.kec || '')).toUpperCase().includes(q.toUpperCase())), [m, q]);
  const sr = useSort(rRows, 'ton', 'desc', (r, k) => (r as never)[k]);
  const sz = useSort(zRows, 'ton', 'desc', (r, k) => (r as never)[k]);
  const st = useSort(tRows, 'ton', 'desc', (r, k) => (r as never)[k]);
  const pz = usePager(sz.sorted, 60);
  const pt = usePager(st.sorted, 60);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;

  return (
    <>
      <PageHeader eyebrow="Wilayah" title="Rute & Zona" desc="Empat pola pengiriman (gudang–toko, gudang–gudang, pabrik–toko, pelabuhan–toko), rute asal → tujuan, zona transporter, dan toko yang dilayani."
        right={<ExportButton filename="" onExport={() => {
          const rows = tab === 'rute' ? sr.sorted.map(r => ({ 'Jenis kirim': r.jenis, Asal: r.asal, Tujuan: r.tujuan, Ritase: r.nRit, Titik: r.stop, Toko: r.nToko, Ton: r.ton, 'Lead median (hari)': r.leadMed }))
            : tab === 'zona' ? sz.sorted.map(z => ({ Kode: z.key, Zona: z.name, Kecamatan: z.kec, Ring: z.ring, 'Dalam/Luar': z.dl, Ritase: z.nRit, Titik: z.stop, Toko: z.nToko, Transporter: z.nTrp, Ton: z.ton }))
            : st.sorted.map(t => ({ 'Kode toko': t.key, Toko: t.name, Daerah: t.daerah, Kecamatan: t.kec, Titik: t.stop, Ton: t.ton, 'Non-semen': t.non, 'Lead median': t.leadMed, Transporter: t.trp, 'Jenis kirim': t.jenis }));
          exportRowsToExcel([{ name: tab, rows }], `${tab}-${p.cabang || 'semua'}-${p.tgl}.xlsx`);
        }} />} />

      <div className="grid gap-3.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
        {m.byKirim.map(({ k, s }) => (
          <Card key={k} title={<span style={{ color: kirimColor(k) }}>{k}</span>}>
            <div className="kpi-value !text-[28px]">{fmt(s.rit)}<span className="unit">ritase · {fmt(s.ton, 0)} t</span></div>
            <div className="my-2"><ShareBar value={s.rit} max={m.tot.rit} color={kirimColor(k)} label={pctTxt(s.rit, m.tot.rit)} /></div>
            <p className="text-[12px] text-soft leading-snug">{KIRIM_INFO[k]}</p>
            <div className="font-mono text-[11px] text-faint mt-2">{fmt(s.tonPerRit, 1)} t/rit · {fmt(s.stop / Math.max(1, s.rit), 1)} titik/rit · {fmt(s.unit)} unit</div>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'rute', label: `Rute (${m.routes.length})` }, { value: 'zona', label: `Zona (${m.zonas.length})` }, { value: 'toko', label: `Toko (${m.tokos.length})` }]} />
      <div className="controls">
        {tab === 'rute' && (
          <Control label="Tingkat tujuan">
            <select value={level} onChange={e => setLevel(e.target.value as 'kab' | 'kec')}><option value="kab">Kabupaten/Kota</option><option value="kec">Kecamatan</option></select>
          </Control>
        )}
        <Control label="Cari"><Search value={q} onChange={setQ} /></Control>
      </div>

      {tab === 'rute' && (
        <TableWrap>
          <table className="tbl-dense">
            <thead><tr><STh k="jenis" s={sr}>Jenis kirim</STh><STh k="asal" s={sr}>Asal</STh><STh k="tujuan" s={sr}>Tujuan</STh><STh k="nRit" s={sr} num>Ritase</STh><STh k="stop" s={sr} num>Titik</STh>
              <STh k="nToko" s={sr} num>Toko</STh><STh k="ton" s={sr} num>Ton</STh><STh k="leadMed" s={sr} num title="Median hari dari DO sampai diterima toko">Lead (hari)</STh><th>Porsi ton</th></tr></thead>
            <tbody>{sr.sorted.map(r => (
              <tr key={r.key}>
                <td style={{ color: kirimColor(r.jenis) }} className="font-semibold">{r.jenis}</td>
                <td><CellLink to={to('/gudang/' + encodeURIComponent(r.asal))}>{r.asal}</CellLink></td><td>{r.tujuan}</td>
                <td className="num font-mono">{fmt(r.nRit)}</td><td className="num font-mono">{fmt(r.stop)}</td><td className="num font-mono">{fmt(r.nToko)}</td>
                <td className="num font-mono">{fmt(r.ton, 1)}</td><td className="num font-mono">{r.leadMed ?? '–'}</td>
                <td><ShareBar value={r.ton} max={m.tot.ton} color={kirimColor(r.jenis)} label={pctTxt(r.ton, m.tot.ton)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
      )}

      {tab === 'zona' && (
        <>
          <TableWrap>
            <table className="tbl-dense">
              <thead><tr><STh k="key" s={sz}>Kode</STh><STh k="name" s={sz}>Zona</STh><STh k="kec" s={sz}>Kecamatan</STh><STh k="ring" s={sz} num>Ring</STh><STh k="dl" s={sz}>Dalam/Luar</STh>
                <STh k="nRit" s={sz} num>Ritase</STh><STh k="stop" s={sz} num>Titik</STh><STh k="nToko" s={sz} num>Toko</STh><STh k="nTrp" s={sz} num>Transporter</STh><STh k="ton" s={sz} num>Ton</STh></tr></thead>
              <tbody>{pz.view.map(z => (
                <tr key={z.key}><td className="font-mono">{z.key}</td><td><CellLink to={to('/zona/' + encodeURIComponent(z.key))}>{z.name}</CellLink></td>
                  <td>{z.gid ? <CellLink to={to('/kecamatan/' + encodeURIComponent(z.gid))}>{z.kec}</CellLink> : <span className="text-amber">{z.kec || '?'} (belum dipetakan)</span>}</td>
                  <td className="num font-mono">{z.ring ?? '–'}</td><td>{z.dl}</td><td className="num font-mono">{fmt(z.nRit)}</td><td className="num font-mono">{fmt(z.stop)}</td>
                  <td className="num font-mono">{fmt(z.nToko)}</td><td className="num font-mono">{fmt(z.nTrp)}</td><td className="num font-mono">{fmt(z.ton, 1)}</td></tr>
              ))}</tbody>
            </table>
          </TableWrap>
          <pz.Pager />
          <div className="mt-3"><Note>Ring = lapisan jarak dalam satu kecamatan yang dipakai transporter untuk tarif (Ring 1 paling dekat). Kolom Ket. Dalam/Luar Kota di data dipakai apa adanya.</Note></div>
        </>
      )}

      {tab === 'toko' && (
        <>
          <TableWrap>
            <table className="tbl-dense">
              <thead><tr><STh k="name" s={st}>Toko</STh><STh k="daerah" s={st}>Daerah</STh><STh k="kec" s={st}>Kecamatan</STh><STh k="stop" s={st} num>Titik (SJ)</STh><STh k="ton" s={st} num>Ton</STh>
                <STh k="non" s={st} num>Non-semen</STh><STh k="leadMed" s={st} num>Lead (hari)</STh><STh k="trp" s={st} num>Transporter</STh><th>Jenis kirim</th></tr></thead>
              <tbody>{pt.view.map(t => (
                <tr key={t.key}><td><CellLink to={to('/toko/' + encodeURIComponent(t.key))}>{t.name}</CellLink><div className="font-mono text-[10.5px] text-faint">{t.key}</div></td>
                  <td>{t.daerah}</td><td>{t.kec}</td><td className="num font-mono">{fmt(t.stop)}</td><td className="num font-mono">{fmt(t.ton, 1)}</td><td className="num font-mono">{t.non ? fmt(t.non) : '–'}</td>
                  <td className="num font-mono">{t.leadMed ?? '–'}</td><td className="num font-mono">{fmt(t.trp)}</td><td className="text-[11.5px]">{t.jenis}</td></tr>
              ))}</tbody>
            </table>
          </TableWrap>
          <pt.Pager />
        </>
      )}
    </>
  );
}
