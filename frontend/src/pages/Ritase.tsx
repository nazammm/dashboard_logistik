import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { summarize, tipeMuatan, uniq } from '../lib/agg';
import { useSort } from '../lib/hooks';
import { fmt, fmtDate, fmtJam, kirimColor, shortTrp } from '../lib/format';
import { exportRowsToExcel } from '../lib/xlsx';
import { Badge, CellLink, Control, EmptyBox, ErrorBox, ExportButton, Kpi, PageHeader, PageSkeleton, STh, Search, TableWrap, usePager, useTo } from '../components/ui';
import type { Ritase } from '../lib/types';

const FILTERS = ['jenis', 'trp', 'gudang', 'dl', 'tipe', 'q'] as const;

export default function RitasePage() {
  const p = usePeriod();
  const to = useTo();
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(FILTERS.map(k => [k, sp.get(k) || ''])) as Record<(typeof FILTERS)[number], string>;
  const setF = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const { data, error } = usePeriodData();

  const opts = useMemo(() => {
    const r = data?.rit || [];
    return {
      jenis: uniq(r.map(x => x.jenis_kirim)).sort(), trp: uniq(r.map(x => x.transporter)).sort(),
      gudang: uniq(r.map(x => x.gudang_asal)).sort(), dl: uniq(r.map(x => x.dalam_luar)).sort(), tipe: uniq(r.map(x => tipeMuatan(x))).sort(),
    };
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = f.q.trim().toUpperCase();
    return data.rit.filter(r =>
      (!f.jenis || r.jenis_kirim === f.jenis) && (!f.trp || r.transporter === f.trp) && (!f.gudang || r.gudang_asal === f.gudang) &&
      (!f.dl || r.dalam_luar === f.dl) && (!f.tipe || tipeMuatan(r) === f.tipe) &&
      (!q || [r.foad_no, r.plat_label, r.plat, r.sopir, r.toko, r.kecamatan, r.gudang_tujuan, r.kontainer].some(v => (v || '').toUpperCase().includes(q))));
  }, [data, f.jenis, f.trp, f.gudang, f.dl, f.tipe, f.q]);

  const s = useSort<Ritase>(rows, 'tanggal', 'desc', (r, k) => (k === 'tipe' ? tipeMuatan(r) : (r as never)[k]));
  const { view, Pager } = usePager(s.sorted, 60);
  const tot = summarize(rows);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <PageSkeleton />;

  const sel = (k: (typeof FILTERS)[number], label: string, list: string[]) => (
    <Control label={label}>
      <select value={f[k]} onChange={e => setF(k, e.target.value)}>
        <option value="">Semua</option>
        {list.map(v => <option key={v} value={v}>{k === 'trp' ? shortTrp(v) : v}</option>)}
      </select>
    </Control>
  );

  return (
    <>
      <PageHeader eyebrow="Operasional" title="Ritase" desc="1 ritase = 1 FOAD = satu perjalanan truk dari satu gudang asal (bisa beberapa titik bongkar/SJ). Klik No. FOAD untuk melihat isi muatan, titik bongkar, dan rute di peta."
        right={<ExportButton filename={`ritase-${p.cabang || 'semua'}-${p.tgl}.xlsx`} onExport={() => exportRowsToExcel([{ name: 'Ritase', rows: s.sorted.map(r => ({
          Tanggal: r.tanggal, FOAD: r.foad_no, 'FOAD Type': r.foad_type, 'Jenis Kirim': r.jenis_kirim, Unit: r.plat_label, Sopir: r.sopir, Transporter: r.transporter,
          'Gudang Asal': r.gudang_asal, 'Gudang Tujuan': r.gudang_tujuan, Kecamatan: r.kecamatan, 'Dalam/Luar': r.dalam_luar, 'Titik (SJ)': r.n_stop, Toko: r.toko,
          'Ton Semen': r.ton, 'Qty Semen (zak)': r.qty_semen, 'Qty Non-Semen (pcs)': r.qty_non_semen, 'Selesai Muat': r.selesai_muat, 'Rit ke': r.rit_ke,
          'Lead DO rata2 (hari)': r.lead_do_avg, Kontainer: r.kontainer, Seal: r.seal, 'Ongkos (Jml Harga)': r.biaya,
        })) }], `ritase-${p.cabang || 'semua'}-${p.tgl}.xlsx`)} />} />

      <div className="controls">
        {sel('jenis', 'Jenis kirim', opts.jenis)}
        {sel('trp', 'Transporter', opts.trp)}
        {sel('gudang', 'Gudang asal', opts.gudang)}
        {sel('dl', 'Dalam/Luar kota', opts.dl)}
        {sel('tipe', 'Tipe muatan', opts.tipe)}
        <Control label="Cari"><Search value={f.q} onChange={v => setF('q', v)} placeholder="FOAD, plat, sopir, toko, kecamatan…" /></Control>
        {FILTERS.some(k => f[k]) && <button type="button" className="btn self-end" onClick={() => { const n = new URLSearchParams(sp); FILTERS.forEach(k => n.delete(k)); setSp(n, { replace: true }); }}>Reset filter</button>}
      </div>

      <div className="grid-kpi mb-5">
        <Kpi title="Ritase" value={fmt(tot.rit)} sub={`${fmt(tot.ritSemen)} membawa semen`} />
        <Kpi title="Tonase" value={fmt(tot.ton, 1)} unit="ton" sub={`${fmt(tot.tonPerRit, 2)} ton / ritase semen`} />
        <Kpi title="Unit / Sopir" value={`${fmt(tot.unit)} / ${fmt(tot.sopir)}`} sub={`${fmt(tot.ritPerUnitHari, 2)} rit per unit per hari`} />
        <Kpi title="Titik bongkar" value={fmt(tot.stop)} sub={`${fmt(tot.qtyNon)} pcs non-semen`} />
      </div>

      {!rows.length ? <EmptyBox>Tidak ada ritase yang cocok dengan filter.</EmptyBox> : (
        <>
          <TableWrap>
            <table className="tbl-dense">
              <thead><tr>
                <STh k="tanggal" s={s}>Tanggal</STh><STh k="foad_no" s={s}>FOAD</STh><STh k="jenis_kirim" s={s}>Jenis</STh>
                <STh k="plat_label" s={s}>Unit</STh><STh k="sopir" s={s}>Sopir</STh><STh k="transporter" s={s}>Transporter</STh>
                <STh k="gudang_asal" s={s}>Asal</STh><STh k="kecamatan" s={s}>Tujuan</STh><STh k="n_stop" s={s} num>Titik</STh>
                <STh k="ton" s={s} num>Ton</STh><STh k="qty_non_semen" s={s} num>Non-semen</STh><STh k="tipe" s={s}>Muatan</STh>
                <STh k="jam_selesai_muat" s={s} num>Selesai muat</STh><STh k="rit_ke" s={s} num>Rit ke</STh>
              </tr></thead>
              <tbody>{view.map(r => (
                <tr key={r.ritase_key}>
                  <td className="font-mono">{fmtDate(r.tanggal, false)}</td>
                  <td><CellLink to={to('/ritase/' + encodeURIComponent(r.ritase_key))}>{r.foad_no}</CellLink></td>
                  <td><span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: kirimColor(r.jenis_kirim) }} />{r.jenis_kirim}</span>{r.foad_type === 'Bulk' && <Badge className="ml-1.5">Bulk</Badge>}</td>
                  <td>{r.plat ? <CellLink to={to('/unit/' + encodeURIComponent(r.plat))}>{r.plat_label}</CellLink> : '–'}</td>
                  <td>{r.sopir ? <CellLink to={to('/sopir/' + encodeURIComponent(r.sopir))}>{r.sopir}</CellLink> : '–'}</td>
                  <td title={r.transporter || ''}>{shortTrp(r.transporter)}</td>
                  <td>{r.gudang_asal}</td>
                  <td className="max-w-[220px] truncate" title={r.toko || ''}>{r.jenis_kirim === 'Gudang → Gudang' ? `Gudang ${r.gudang_tujuan || '–'}` : r.kecamatan || '–'}</td>
                  <td className="num font-mono">{fmt(r.n_stop)}</td>
                  <td className="num font-mono">{fmt(r.ton, 2)}</td>
                  <td className="num font-mono">{r.qty_non_semen ? fmt(r.qty_non_semen) : '–'}</td>
                  <td>{tipeMuatan(r)}</td>
                  <td className="num font-mono">{fmtJam(r.selesai_muat)}</td>
                  <td className="num font-mono">{r.plat ? `${r.rit_ke}/${r.rit_hari_ini}` : '–'}</td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
          <Pager />
        </>
      )}
    </>
  );
}
