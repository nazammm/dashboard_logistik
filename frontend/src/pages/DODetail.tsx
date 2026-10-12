import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DataSource } from '../lib/data';
import { useAsync, useDocTitle } from '../lib/hooks';
import { fmt, fmtDate, kirimColor, shortTrp } from '../lib/format';
import { BackLink, Badge, Card, CellLink, EmptyBox, ErrorBox, KV, Kpi, Note, PageHeader, PageSkeleton, TableWrap, Th, useTo } from '../components/ui';
import { statusVariant } from './RekonDO';

export default function DODetail() {
  const { no = '' } = useParams();
  const to = useTo();
  useDocTitle('DO ' + no);
  const st = useAsync(() => DataSource.doDetail(no), [no]);
  const m = useMemo(() => {
    const d = st.data;
    if (!d) return null;
    const qtyDo = d.rekon.reduce((a, r) => a + (r.qty_do || 0), 0);
    const qtyKirim = d.items.reduce((a, i) => a + (i.jumlah || 0), 0);
    const rits = [...new Set(d.items.map(i => i.ritase_key))];
    const sjs = [...new Set(d.items.map(i => i.sj_no).filter(Boolean))];
    const status = [...new Set(d.rekon.map(r => r.status))];
    return { qtyDo, qtyKirim, rits, sjs, status, ton: d.items.reduce((a, i) => a + (i.ton || 0), 0) };
  }, [st.data]);

  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data || !m) return <PageSkeleton />;
  const { rekon, items, j028 } = st.data;
  const h = items[0];
  const dummy = j028.some(j => j.is_dummy);

  return (
    <>
      <BackLink to={to('/rekon-do')}>Rekon DO J028</BackLink>
      <PageHeader eyebrow="Delivery Order" title={<>DO {no}</>} desc={h ? `${h.cust_name || ''} · salesman ${h.salesman || '–'}` : rekon[0]?.cust_name}
        right={<>{m.status.map(s => <Badge key={s} variant={statusVariant(s)}>{s}</Badge>)}{dummy && <Badge variant="warn">J028 dummy</Badge>}</>} />
      <div className="grid-kpi">
        <Kpi title="Qty DO (J028)" value={j028.length ? fmt(m.qtyDo) : '–'} sub={j028.length ? `${fmt(j028.length)} baris produk di J028` : 'DO tidak ada di J028'} />
        <Kpi title="Qty dikirim" value={fmt(m.qtyKirim)} sub={`${fmt(m.ton, 2)} ton semen`} />
        <Kpi title="Sisa" value={j028.length ? fmt(m.qtyDo - m.qtyKirim) : '–'} />
        <Kpi title="Pengiriman" value={fmt(m.sjs.length)} unit="SJ" sub={`${fmt(m.rits.length)} ritase`} />
      </div>
      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <Card title="Informasi DO" className="flex-[1_1_320px]">
          <KV rows={[['Tanggal DO', fmtDate(h?.do_date || rekon[0]?.do_date)], ['Est. Delv. Date', fmtDate(h?.est_delv_date || rekon[0]?.est_delv_date)],
            ['Toko', h?.cust_code ? <CellLink to={to('/toko/' + encodeURIComponent(h.cust_code))}>{h.cust_name}</CellLink> : rekon[0]?.cust_name],
            ['Kirim pertama', fmtDate(rekon[0]?.kirim_awal)], ['Kirim terakhir', fmtDate(rekon[0]?.kirim_akhir)], ['Lead (hari)', h?.lead_do_hari ?? '–']]} />
        </Card>
        <Card title="Per produk: J028 vs dikirim" className="flex-[2_1_480px] min-w-0">
          <TableWrap><table className="tbl-dense !min-w-0">
            <thead><tr><Th>Produk</Th><Th num>Qty DO</Th><Th num>Dikirim</Th><Th num>Sisa</Th><Th>Status</Th></tr></thead>
            <tbody>{rekon.map(r => (
              <tr key={r.product_code}><td>{r.product_name}<div className="font-mono text-[10.5px] text-faint">{r.product_code}</div></td>
                <td className="num font-mono">{r.qty_do != null ? fmt(r.qty_do) : '–'}</td><td className="num font-mono">{fmt(r.qty_kirim)}</td>
                <td className="num font-mono">{r.qty_sisa != null ? fmt(r.qty_sisa) : '–'}</td><td><Badge variant={statusVariant(r.status)}>{r.status}</Badge></td></tr>
            ))}</tbody>
          </table></TableWrap>
        </Card>
      </div>
      <h2 className="section-title">Pengiriman DO ini <span className="n">· per SJ / ritase</span></h2>
      {!items.length ? <EmptyBox>Belum ada pengiriman untuk DO ini.</EmptyBox> : (
        <TableWrap><table className="tbl-dense">
          <thead><tr><Th>Tanggal</Th><Th>SJ</Th><Th>FOAD</Th><Th>Jenis</Th><Th>Unit · Sopir</Th><Th>Transporter</Th><Th>Produk</Th><Th num>Qty</Th><Th>Terima toko</Th></tr></thead>
          <tbody>{items.map(i => (
            <tr key={i.id}><td className="font-mono">{fmtDate(i.tanggal)}</td><td className="font-mono">{i.sj_no}</td>
              <td><CellLink to={to('/ritase/' + encodeURIComponent(i.ritase_key))}>{i.foad_no}</CellLink></td>
              <td style={{ color: kirimColor(i.jenis_kirim) }}>{i.jenis_kirim}</td><td>{i.plat_label} · {i.sopir}</td><td>{shortTrp(i.transporter)}</td>
              <td>{i.product_name}</td><td className="num font-mono">{fmt(i.jumlah)}</td><td className="font-mono">{fmtDate(i.tgl_terima_sj_toko, false)}</td></tr>
          ))}</tbody>
        </table></TableWrap>
      )}
      {j028.length > 0 && (
        <>
          <h2 className="section-title">Baris J028</h2>
          <TableWrap><table className="tbl-dense">
            <thead><tr><Th>DO</Th><Th>Tgl DO</Th><Th>Toko</Th><Th>Produk</Th><Th num>Qty</Th><Th>Salesman</Th><Th>Keterangan</Th></tr></thead>
            <tbody>{j028.map(j => <tr key={j.id}><td className="font-mono">{j.do_no}</td><td className="font-mono">{fmtDate(j.do_date)}</td><td>{j.cust_name}</td><td>{j.product_name}</td><td className="num font-mono">{fmt(j.qty)}</td><td>{j.salesman}</td><td className="text-[11.5px]">{j.keterangan}{j.is_dummy && <Badge variant="warn" className="ml-1.5">dummy</Badge>}</td></tr>)}</tbody>
          </table></TableWrap>
        </>
      )}
      {/^DOS/.test(no) && <div className="mt-4"><Note>DO berawalan <b>DOS</b>: di data Januari selalu qty kecil (1–8 unit), tanpa Tanggal DO dan tanpa salesman, tapi punya SJ sendiri — dugaan: DO susulan/pengganti (kurang kirim, zak pecah) atau DO khusus. Perlu konfirmasi tim DO Planner.</Note></div>}
    </>
  );
}
