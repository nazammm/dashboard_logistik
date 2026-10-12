import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { useAsync } from '../lib/hooks';
import { DataSource } from '../lib/data';
import { fmt, fmtDate, shortTrp } from '../lib/format';
import { BackLink, Badge, Card, CellLink, EmptyBox, ErrorBox, KV, Kpi, PageHeader, PageSkeleton, TableWrap, Th, usePager, useTo } from '../components/ui';

export default function ProdukDetail() {
  const { code = '' } = useParams();
  const p = usePeriod();
  const to = useTo();
  const { data, error } = usePeriodData({ muatan: true });
  const prod = useAsync(() => DataSource.produk(), []);
  const items = useMemo(() => (data?.muatan || []).filter(i => i.product_code === code), [data, code]);
  const m = useMemo(() => {
    const agg = (fn: (k: typeof items[number]) => string | null) => {
      const mm = new Map<string, { key: string; qty: number; rit: Set<string> }>();
      items.forEach(i => { const k = fn(i) || '–'; if (!mm.has(k)) mm.set(k, { key: k, qty: 0, rit: new Set() }); mm.get(k)!.qty += i.jumlah || 0; mm.get(k)!.rit.add(i.ritase_key); });
      return [...mm.values()].sort((a, b) => b.qty - a.qty);
    };
    return { trp: agg(i => i.transporter), toko: agg(i => i.cust_name), gud: agg(i => i.gudang_asal), qty: items.reduce((a, i) => a + (i.jumlah || 0), 0), ton: items.reduce((a, i) => a + (i.ton || 0), 0), rit: new Set(items.map(i => i.ritase_key)).size };
  }, [items]);
  const { view, Pager } = usePager(items, 40);
  const master = (prod.data || []).find(x => x.product_code === code);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageSkeleton />;
  const name = master?.product_name || items[0]?.product_name || code;

  return (
    <>
      <BackLink to={to('/muatan')}>Komposisi muatan</BackLink>
      <PageHeader eyebrow={`Produk · ${code} · ${p.label}`} title={name} right={master && <Badge variant={master.kategori === 'SEMEN' ? 'online' : 'neutral'}>{master.kategori}</Badge>} />
      <div className="grid-kpi">
        <Kpi title="Qty dikirim" value={fmt(m.qty, master?.satuan === 'TON' ? 1 : 0)} unit={(master?.satuan || '').toLowerCase()} />
        {m.ton > 0 && <Kpi title="Tonase" value={fmt(m.ton, 1)} unit="ton" />}
        <Kpi title="Ritase membawa" value={fmt(m.rit)} sub={`${fmt(m.qty / Math.max(1, m.rit), 1)} per ritase`} />
        <Kpi title="Toko" value={fmt(m.toko.length)} />
      </div>
      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <Card title="Master produk" className="flex-[1_1_300px]">
          <KV rows={[['Kode', code], ['Kategori', master?.kategori], ['Lini (semen)', master?.lini], ['Kelompok (non-semen)', master?.kelompok], ['Satuan', master?.satuan],
            ['Berat / unit', master?.kg_per_unit ? `${fmt(master.kg_per_unit, 1)} kg` : '–'], ['Klasifikasi', master?.is_auto ? 'otomatis (bisa dikoreksi di Master Data)' : 'manual']]} />
        </Card>
        {[['Transporter', m.trp], ['Gudang asal', m.gud], ['Toko', m.toko]].map(([t, rows]) => (
          <Card key={t as string} title={t as string} className="flex-[1_1_260px]">
            <TableWrap maxH={260}><table className="tbl-dense !min-w-0"><thead><tr><Th>{t as string}</Th><Th num>Qty</Th><Th num>Rit</Th></tr></thead>
              <tbody>{(rows as typeof m.trp).slice(0, 15).map(r => <tr key={r.key}><td className="max-w-[200px] truncate" title={r.key}>{t === 'Transporter' ? shortTrp(r.key) : r.key}</td><td className="num font-mono">{fmt(r.qty)}</td><td className="num font-mono">{fmt(r.rit.size)}</td></tr>)}</tbody>
            </table></TableWrap>
          </Card>
        ))}
      </div>
      <h2 className="section-title">Baris pengiriman</h2>
      {!items.length ? <EmptyBox>Produk ini tidak dikirim pada {p.label}.</EmptyBox> : (
        <>
          <TableWrap><table className="tbl-dense">
            <thead><tr><Th>Tanggal</Th><Th>FOAD</Th><Th>DO</Th><Th>SJ</Th><Th>Toko</Th><Th>Unit</Th><Th num>Qty</Th></tr></thead>
            <tbody>{view.map(i => (
              <tr key={i.id}><td className="font-mono">{fmtDate(i.tanggal, false)}</td><td><CellLink to={to('/ritase/' + encodeURIComponent(i.ritase_key))}>{i.foad_no}</CellLink></td>
                <td>{i.do_no ? <CellLink to={to('/do/' + encodeURIComponent(i.do_no))}>{i.do_no}</CellLink> : '–'}</td><td className="font-mono">{i.sj_no || '–'}</td>
                <td>{i.cust_name || '–'}</td><td>{i.plat_label}</td><td className="num font-mono">{fmt(i.jumlah)}</td></tr>
            ))}</tbody>
          </table></TableWrap>
          <Pager />
        </>
      )}
    </>
  );
}
