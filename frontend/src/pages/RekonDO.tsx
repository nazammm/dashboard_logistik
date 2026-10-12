import { useMemo, useState } from 'react';
import { usePeriod } from '../lib/period';
import { DataSource } from '../lib/data';
import { useAsync, useSort } from '../lib/hooks';
import { fmt, fmtDate } from '../lib/format';
import { exportRowsToExcel } from '../lib/xlsx';
import { Badge, CellLink, Control, ErrorBox, ExportButton, Kpi, Note, PageHeader, PageSkeleton, STh, Search, TableWrap, usePager, useTo, type Variant } from '../components/ui';
import type { Row } from '../lib/types';

export const STATUS: { key: string; v: Variant; desc: string }[] = [
  { key: 'Sesuai', v: 'good', desc: 'Qty dikirim = Qty DO di J028' },
  { key: 'Sebagian', v: 'warn', desc: 'Baru sebagian terkirim (sisa > 0)' },
  { key: 'Lebih kirim', v: 'bad', desc: 'Qty dikirim melebihi Qty DO' },
  { key: 'Belum dikirim', v: 'neutral', desc: 'Ada di J028 tapi belum ada pengiriman' },
  { key: 'Tidak ada di J028', v: 'bad', desc: 'Ada pengiriman tapi DO tidak ditemukan di J028' },
];
export const statusVariant = (s: string) => STATUS.find(x => x.key === s)?.v || 'neutral';

export default function RekonDO() {
  const p = usePeriod();
  const to = useTo();
  const [st, setSt] = useState('');
  const [q, setQ] = useState('');
  const [jenis, setJenis] = useState('');
  const res = useAsync(() => (p.ready ? DataSource.doRekon(p.cabang, p.dari, p.sampai) : Promise.resolve(null)), [p.ready, p.cabang, p.dari, p.sampai]);
  const all = res.data || [];
  const dummy = all.some(r => r.j028_dummy);

  const rows = useMemo(() => all.filter(r => (!st || r.status === st) && (!jenis || (jenis === 'DOS' ? /^DOS/.test(r.do_no) : !/^DOS/.test(r.do_no))) &&
    (!q || [r.do_no, r.cust_name, r.product_name, r.sj_nos, r.cust_code].some(v => String(v || '').toUpperCase().includes(q.toUpperCase())))), [all, st, q, jenis]);
  const s = useSort<Row>(rows, 'do_no', 'asc', (r, k) => r[k]);
  const { view, Pager } = usePager(s.sorted, 60);
  const cnt = (k: string) => all.filter(r => r.status === k);
  const nDo = new Set(all.map(r => r.do_no)).size;

  if (res.error) return <ErrorBox error={res.error} />;
  if (!res.data) return <PageSkeleton />;

  return (
    <>
      <PageHeader eyebrow="Analisis" title="Rekon DO J028" desc="Menghubungkan nomor DO di J028 (daftar DO dari sistem penjualan) dengan DO No. di data logistik, per DO + kode produk: apakah sudah terkirim penuh, sebagian, lebih, atau belum."
        right={<>{dummy && <Badge variant="warn" title="Belum ada file J028 asli yang diimport">J028 dummy</Badge>}
          <ExportButton filename={`rekon-do-${p.cabang || 'semua'}-${p.tgl}.xlsx`} onExport={() => exportRowsToExcel([{ name: 'Rekon DO', rows: s.sorted.map(r => ({
            DO: r.do_no, 'Tgl DO': r.do_date, Toko: r.cust_name, 'Kode Toko': r.cust_code, Produk: r.product_name, 'Kode Produk': r.product_code, 'Qty DO (J028)': r.qty_do,
            'Qty Kirim': r.qty_kirim, Sisa: r.qty_sisa, SJ: r.sj_nos, 'Jml Ritase': r.n_ritase, 'Kirim awal': r.kirim_awal, 'Kirim akhir': r.kirim_akhir, Status: r.status })) }], `rekon-do-${p.tgl}.xlsx`)} /></>} />

      {dummy && <div className="mb-5"><Note tone="warn"><b>Data J028 saat ini DUMMY</b> (dibuat dari data logistik + variasi acak, diberi tanda) supaya alur rekon bisa dicoba. Upload export J028 asli di <CellLink to={to('/import')}>Import Data → J028</CellLink>; data dummy otomatis terhapus saat file asli diimport.</Note></div>}

      <div className="grid gap-3.5 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        {STATUS.map(x => {
          const r = cnt(x.key);
          return <Kpi key={x.key} title={x.key} value={fmt(r.length)} sub={`${fmt(new Set(r.map(y => y.do_no)).size)} DO · ${x.desc}`} active={st === x.key} onClick={() => setSt(st === x.key ? '' : x.key)} />;
        })}
      </div>

      <div className="controls">
        <Control label="Status"><select value={st} onChange={e => setSt(e.target.value)}><option value="">Semua ({fmt(all.length)} baris · {fmt(nDo)} DO)</option>{STATUS.map(x => <option key={x.key} value={x.key}>{x.key}</option>)}</select></Control>
        <Control label="Jenis DO"><select value={jenis} onChange={e => setJenis(e.target.value)}><option value="">Semua</option><option value="REG">DO reguler (26xxxxx)</option><option value="DOS">DOS (DO susulan/pengganti?)</option></select></Control>
        <Control label="Cari"><Search value={q} onChange={setQ} placeholder="No DO, toko, produk, SJ…" /></Control>
      </div>

      <TableWrap>
        <table className="tbl-dense">
          <thead><tr>
            <STh k="do_no" s={s}>DO</STh><STh k="do_date" s={s}>Tgl DO</STh><STh k="cust_name" s={s}>Toko</STh><STh k="product_name" s={s}>Produk</STh>
            <STh k="qty_do" s={s} num>Qty DO (J028)</STh><STh k="qty_kirim" s={s} num>Qty kirim</STh><STh k="qty_sisa" s={s} num>Sisa</STh>
            <STh k="n_sj" s={s} num>SJ</STh><STh k="kirim_akhir" s={s}>Kirim</STh><STh k="status" s={s}>Status</STh>
          </tr></thead>
          <tbody>{view.map((r, i) => (
            <tr key={r.do_no + r.product_code + i}>
              <td><CellLink to={to('/do/' + encodeURIComponent(r.do_no))}>{r.do_no}</CellLink></td>
              <td className="font-mono">{fmtDate(r.do_date)}</td>
              <td className="max-w-[220px] truncate" title={r.cust_name}>{r.cust_code ? <CellLink to={to('/toko/' + encodeURIComponent(r.cust_code))}>{r.cust_name}</CellLink> : r.cust_name}</td>
              <td className="max-w-[240px] truncate" title={r.product_name}>{r.product_name}</td>
              <td className="num font-mono">{r.qty_do != null ? fmt(r.qty_do) : '–'}</td><td className="num font-mono">{fmt(r.qty_kirim)}</td>
              <td className={`num font-mono ${r.qty_sisa > 0 ? 'text-amber' : r.qty_sisa < 0 ? 'text-red' : ''}`}>{r.qty_sisa != null ? fmt(r.qty_sisa) : '–'}</td>
              <td className="num font-mono">{r.n_sj ?? '–'}</td>
              <td className="font-mono">{r.kirim_akhir ? fmtDate(r.kirim_akhir, false) : '–'}</td>
              <td><Badge variant={statusVariant(r.status)}>{r.status}</Badge></td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>
      <Pager />
      <div className="mt-4"><Note tone="info">Kunci hubungan: <b>DO No.</b> + <b>Product Code</b>. Satu DO bisa dikirim lewat beberapa SJ/ritase (kirim bertahap); semua dijumlahkan. Periode = DO yang dikirim pada periode ini <i>atau</i> bertanggal DO di periode ini. DO berawalan <b>DOS</b> belum ada pasangannya di format J028 — perlu konfirmasi apakah DOS = DO susulan/pengganti.</Note></div>
    </>
  );
}
