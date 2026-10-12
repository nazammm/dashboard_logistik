import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { usePeriod } from '../lib/period';
import { DataSource } from '../lib/data';
import { useAsync, useDocTitle } from '../lib/hooks';
import { stats } from '../lib/agg';
import { esc, fmt, fmtDate, kirimColor, shortTrp } from '../lib/format';
import CoverageMap from '../components/CoverageMap';
import { BackLink, Card, CellLink, ErrorBox, KV, Kpi, PageHeader, PageSkeleton, TableWrap, Th, usePager, useTo } from '../components/ui';

export default function TokoDetail() {
  const { code = '' } = useParams();
  const p = usePeriod();
  const to = useTo();
  const st = useAsync(() => DataSource.tokoStops(p.cabang, code), [p.cabang, code]);
  const gud = useAsync(() => DataSource.gudang(), []);
  const stops = st.data || [];
  useDocTitle(stops[0]?.cust_name || code);

  const m = useMemo(() => {
    const gids = new Map<string, number>();
    stops.forEach(s => { if (s.gid) gids.set(s.gid, (gids.get(s.gid) || 0) + (s.ton || 0)); });
    const flowsM = new Map<string, number>();
    stops.forEach(s => { if (s.gid && s.gudang_asal) flowsM.set(s.gudang_asal + '|' + s.gid, (flowsM.get(s.gudang_asal + '|' + s.gid) || 0) + 1); });
    const trp = new Map<string, number>();
    stops.forEach(s => trp.set(s.transporter || '–', (trp.get(s.transporter || '–') || 0) + 1));
    return {
      gids, flows: [...flowsM.entries()].map(([k, v]) => ({ from: k.split('|')[0], gid: k.split('|')[1], value: v })),
      ton: stops.reduce((a, s) => a + (s.ton || 0), 0), non: stops.reduce((a, s) => a + (s.qty_non_semen || 0), 0),
      lead: stats(stops.map(s => s.lead_do_hari)), balik: stats(stops.map(s => s.sj_balik_hari)),
      trp: [...trp.entries()].sort((a, b) => b[1] - a[1]), hari: new Set(stops.map(s => s.tanggal)).size,
    };
  }, [stops]);
  const { view, Pager } = usePager(stops, 40);

  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data) return <PageSkeleton />;
  const t = stops[0];
  if (!t) return <><BackLink to={to('/rute?tab=toko')}>Daftar toko</BackLink><ErrorBox error="Toko tidak ditemukan." /></>;

  return (
    <>
      <BackLink to={to('/rute?tab=toko')}>Daftar toko</BackLink>
      <PageHeader eyebrow={`Toko · ${t.cabang} · semua periode`} title={t.cust_name || code} desc={t.alamat || undefined} />
      <div className="grid-kpi">
        <Kpi title="Pengiriman (SJ)" value={fmt(stops.length)} sub={`${fmt(m.hari)} hari berbeda`} />
        <Kpi title="Semen diterima" value={fmt(m.ton, 1)} unit="ton" sub={`${fmt(m.non)} pcs non-semen`} />
        <Kpi title="Lead time DO → terima" value={fmt(m.lead.med, 0)} unit="hari (median)" sub={m.lead.n ? `maks ${fmt(m.lead.max)} hari` : undefined} />
        <Kpi title="SJ kembali ke DO Planner" value={fmt(m.balik.med, 0)} unit="hari (median)" sub="setelah diterima toko" />
      </div>
      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <Card title="Identitas" className="flex-[1_1_300px]">
          <KV rows={[['Kode', <span className="font-mono">{t.cust_code}</span>], ['Kode Tiro', t.cust_tiro_code], ['Daerah', t.daerah], ['Kecamatan', t.kecamatan], ['Zona', t.zone_name], ['Dalam/Luar', t.dalam_luar],
            ['Salesman', t.salesman], ['Transporter', m.trp.map(([k, v]) => `${shortTrp(k)} (${v})`).join(', ')]]} />
        </Card>
        <div className="flex-[2_1_480px] min-w-0">
          <CoverageMap values={m.gids} flows={m.flows} gudang={(gud.data || []) as never} height={340}
            tooltip={(g, f) => `<b>${esc(f?.properties.kec)}</b> · ${esc(f?.properties.kab)}<br>${fmt(m.gids.get(g) || 0, 1)} ton ke toko ini`} />
        </div>
      </div>
      <h2 className="section-title">Riwayat pengiriman</h2>
      <TableWrap>
        <table className="tbl-dense">
          <thead><tr><Th>Tanggal</Th><Th>SJ</Th><Th>DO</Th><Th>FOAD</Th><Th>Jenis</Th><Th>Unit · Sopir</Th><Th>Transporter</Th><Th num>Ton</Th><Th num>Non-semen</Th><Th>Terima toko</Th><Th num>Lead</Th></tr></thead>
          <tbody>{view.map(s => (
            <tr key={s.stop_key}>
              <td className="font-mono">{fmtDate(s.tanggal)}</td><td className="font-mono">{s.sj_no}</td>
              <td>{(s.do_nos || '').split(', ').filter(Boolean).map(d => <div key={d}><CellLink to={to('/do/' + encodeURIComponent(d))}>{d}</CellLink></div>)}</td>
              <td><CellLink to={to('/ritase/' + encodeURIComponent(s.ritase_key))}>{s.ritase_key.split('|').pop()}</CellLink></td>
              <td style={{ color: kirimColor(s.jenis_kirim) }}>{s.jenis_kirim}</td>
              <td>{s.plat_label} · {s.sopir}</td><td>{shortTrp(s.transporter)}</td>
              <td className="num font-mono">{fmt(s.ton, 2)}</td><td className="num font-mono">{s.qty_non_semen ? fmt(s.qty_non_semen) : '–'}</td>
              <td className="font-mono">{fmtDate(s.tgl_terima_sj_toko, false)}</td><td className="num font-mono">{s.lead_do_hari ?? '–'}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>
      <Pager />
    </>
  );
}
