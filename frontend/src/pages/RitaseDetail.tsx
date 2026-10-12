import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DataSource } from '../lib/data';
import { useAsync, useDocTitle } from '../lib/hooks';
import { esc, fmt, fmtDate, fmtIDR, fmtJam, kirimColor } from '../lib/format';
import { komposisi, tipeMuatan } from '../lib/agg';
import CoverageMap from '../components/CoverageMap';
import { Badge, BackLink, Card, CellLink, ErrorBox, KV, Kpi, Note, PageHeader, PageSkeleton, TableWrap, Th, useTo } from '../components/ui';

export default function RitaseDetail() {
  const { key = '' } = useParams();
  const to = useTo();
  const st = useAsync(() => DataSource.ritaseDetail(key), [key]);
  const gud = useAsync(() => DataSource.gudang(), []);
  useDocTitle('Ritase ' + key.split('|').pop());

  const m = useMemo(() => {
    const d = st.data;
    if (!d || !d.rit) return null;
    const gids = new Map<string, number>();
    d.stops.forEach(s => { if (s.gid) gids.set(s.gid, (gids.get(s.gid) || 0) + (s.ton || 0)); });
    const flows = [...gids.entries()].map(([gid, v]) => ({ from: d.rit!.gudang_asal || '', gid, value: v || 1 }));
    const kom = komposisi(d.items);
    const times = (k: 'som_date' | 'sj_date' | 'kirim' | 'tgl_terima_sj_toko' | 'tgl_terima_sj_doplanner') => d.stops.map(s => s[k]).filter(Boolean).sort();
    const doDates = d.items.map(i => i.do_date).filter(Boolean).sort();
    return { gids, flows, kom, times, doDates };
  }, [st.data]);

  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data) return <PageSkeleton />;
  const { rit, stops, items } = st.data;
  if (!rit || !m) return <><BackLink to={to('/ritase')}>Daftar ritase</BackLink><ErrorBox error="Ritase tidak ditemukan." /></>;
  const gg = rit.jenis_kirim === 'Gudang → Gudang';
  const t = m.times;
  const timeline: [string, string | null | undefined, string][] = [
    ['DO dibuat', m.doDates[0], 'Tanggal DO paling awal di ritase ini (DO Date)'],
    ['SOM', t('som_date')[0], 'Sales Order Movement (SOM Date)'],
    ['SJ terbit', t('sj_date')[0], 'Surat Jalan dibuat (SJ Date)'],
    ['Selesai muat', rit.selesai_muat, 'Selesai muat di gudang asal'],
    ['Kirim', t('kirim')[0], 'Tanggal kirim'],
    ['Diterima toko', t('tgl_terima_sj_toko').pop(), 'Tgl Terima SJ Toko'],
    ['SJ kembali ke DO Planner', t('tgl_terima_sj_doplanner').pop(), 'Tgl Terima SJ DoPlanner (dokumen balik)'],
  ];

  return (
    <>
      <BackLink to={to('/ritase')}>Daftar ritase</BackLink>
      <PageHeader eyebrow={`Ritase · ${fmtDate(rit.tanggal)} · ${rit.cabang}`} title={<>FOAD {rit.foad_no}</>}
        desc={<>{rit.gudang_asal} → {gg ? `Gudang ${rit.gudang_tujuan}` : rit.kecamatan || '–'} · <span style={{ color: kirimColor(rit.jenis_kirim) }} className="font-semibold">{rit.jenis_kirim}</span> · {rit.dalam_luar}</>}
        right={<><Badge variant={rit.foad_type === 'Bulk' ? 'warn' : 'neutral'}>FOAD {rit.foad_type}</Badge><Badge>{tipeMuatan(rit)}</Badge>{rit.kirim_campuran && <Badge variant="warn">Jenis kirim campuran</Badge>}</>} />

      <div className="grid-kpi">
        <Kpi title="Tonase semen" value={fmt(rit.ton, 2)} unit="ton" sub={`${fmt(rit.qty_semen)} ${rit.foad_type === 'Bulk' ? 'ton curah' : 'zak'} · ${fmt(rit.n_jenis_semen)} jenis`} />
        <Kpi title="Non-semen" value={fmt(rit.qty_non_semen)} unit="pcs" sub={`${fmt(rit.n_jenis_non_semen)} jenis barang`} />
        <Kpi title="Titik bongkar" value={fmt(rit.n_stop)} sub={`${fmt(rit.n_sj)} SJ · ${fmt(rit.n_toko)} toko · ${fmt(rit.n_do)} DO`} />
        <Kpi title="Ritase ke-" value={rit.plat ? `${rit.rit_ke} / ${rit.rit_hari_ini}` : '–'} sub={`hari itu untuk unit ${rit.plat_label || '–'}`} />
      </div>

      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <Card title="Armada" className="flex-[1_1_300px]">
          <KV rows={[
            ['Unit', rit.plat ? <CellLink to={to('/unit/' + encodeURIComponent(rit.plat))}>{rit.plat_label}</CellLink> : '–'],
            ['Sopir', rit.sopir ? <CellLink to={to('/sopir/' + encodeURIComponent(rit.sopir))}>{rit.sopir}</CellLink> : '–'],
            ['Transporter', rit.transporter ? <CellLink to={to('/transporter/' + encodeURIComponent(rit.transporter))}>{rit.transporter}</CellLink> : '–'],
            ['Gudang asal', rit.gudang_asal ? <CellLink to={to('/gudang/' + encodeURIComponent(rit.gudang_asal))}>{rit.gudang_asal}</CellLink> : '–'],
            ['Gudang tujuan', rit.gudang_tujuan || '–'],
            ['Kontainer / Seal', rit.kontainer ? `${rit.kontainer} / ${rit.seal || '–'}` : '–'],
            ['Ongkos angkut', rit.biaya ? fmtIDR(rit.biaya) : '–'],
            ['Kunci ritase', <span className="font-mono text-[11px] text-faint">{rit.ritase_key}</span>],
          ]} />
        </Card>
        <Card title="Linimasa dokumen" className="flex-[1_1_300px]">
          <ol className="relative border-l-2 border-line ml-1.5 mt-2">
            {timeline.map(([k, v, h]) => (
              <li key={k} className="ml-4 mb-3" title={h}>
                <span className={`absolute -left-[7px] w-3 h-3 rounded-full border-2 border-surface ${v ? 'bg-accent' : 'bg-line'}`} />
                <div className="font-mono text-[10.5px] uppercase text-faint" style={{ letterSpacing: '.05em' }}>{k}</div>
                <div className="text-[13px]">{v ? (k === 'Selesai muat' ? `${fmtDate(v)} ${fmtJam(v)}` : fmtDate(v)) : <span className="text-faint">kosong</span>}</div>
              </li>
            ))}
          </ol>
        </Card>
        {!gg && (
          <div className="flex-[2_1_420px] min-w-0">
            <CoverageMap values={m.gids} height={380} flows={m.flows} gudang={(gud.data || []) as never} fitTo="values"
              tooltip={(gid, f) => `<b>${esc(f?.properties.kec)}</b><br>${esc(f?.properties.kab)}<br>${stops.filter(s => s.gid === gid).map(s => esc(s.cust_name)).join('<br>')}`} />
          </div>
        )}
      </div>

      {gg && <div className="mt-4"><Note tone="info">Ritase Gudang → Gudang (mutasi stok antar gudang) tidak punya DO, SJ, maupun toko — dokumennya adalah SOM. Karena itu kolom DO/SJ/tanggal terima kosong.</Note></div>}

      <h2 className="section-title">Titik bongkar <span className="n">· {fmt(stops.length)} SJ</span></h2>
      <TableWrap>
        <table className="tbl-dense">
          <thead><tr><Th>SJ / SOM</Th><Th>Toko</Th><Th>Kecamatan · Zona</Th><Th>DO</Th><Th num>Ton</Th><Th num>Non-semen</Th><Th>Terima toko</Th><Th num>Lead DO (hr)</Th><Th>Keterangan</Th></tr></thead>
          <tbody>{stops.map(s => (
            <tr key={s.stop_key} className="align-top">
              <td className="font-mono">{s.sj_no || s.som_code}</td>
              <td className="!whitespace-normal min-w-[160px]">{s.cust_code ? <CellLink to={to('/toko/' + encodeURIComponent(s.cust_code))}>{s.cust_name}</CellLink> : '–'}<div className="text-[11px] text-faint">{s.alamat}</div></td>
              <td className="!whitespace-normal">{s.kecamatan || '–'}<div className="text-[11px] text-faint">{s.zone_name} · {s.dalam_luar}</div></td>
              <td>{(s.do_nos || '').split(', ').filter(Boolean).map(d => <div key={d}><CellLink to={to('/do/' + encodeURIComponent(d))}>{d}</CellLink></div>)}</td>
              <td className="num font-mono">{fmt(s.ton, 2)}</td><td className="num font-mono">{s.qty_non_semen ? fmt(s.qty_non_semen) : '–'}</td>
              <td className="font-mono">{fmtDate(s.tgl_terima_sj_toko, false)}</td>
              <td className="num font-mono">{s.lead_do_hari ?? '–'}</td>
              <td className="!whitespace-normal text-[11.5px] max-w-[280px]">{s.ket || ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>

      <h2 className="section-title">Isi muatan <span className="n">· {fmt(items.length)} baris produk</span></h2>
      <div className="flex gap-4 flex-wrap items-start">
        <div className="flex-[2_1_560px] min-w-0">
          <TableWrap>
            <table className="tbl-dense">
              <thead><tr><Th>Produk</Th><Th>Kategori</Th><Th>Jenis</Th><Th num>Qty</Th><Th>Satuan</Th><Th num>Ton</Th><Th>DO</Th><Th>SJ</Th></tr></thead>
              <tbody>{items.map(i => (
                <tr key={i.id}>
                  <td><CellLink to={to('/produk/' + encodeURIComponent(i.product_code))}>{i.product_name}</CellLink><div className="font-mono text-[10.5px] text-faint">{i.product_code}</div></td>
                  <td><Badge variant={i.kategori === 'SEMEN' ? 'online' : 'neutral'}>{i.kategori}</Badge></td>
                  <td>{i.kategori === 'SEMEN' ? i.lini : i.kelompok}</td>
                  <td className="num font-mono">{fmt(i.jumlah)}</td><td>{i.satuan}</td><td className="num font-mono">{i.ton ? fmt(i.ton, 2) : '–'}</td>
                  <td>{i.do_no ? <CellLink to={to('/do/' + encodeURIComponent(i.do_no))}>{i.do_no}</CellLink> : '–'}</td>
                  <td className="font-mono">{i.sj_no || '–'}</td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        </div>
        <Card title="Komposisi per jenis" className="flex-[1_1_300px]">
          <table className="tbl-dense !min-w-0"><tbody>
            {m.kom.rows.map(r => <tr key={r.jenis}><td>{r.jenis}</td><td className="num font-mono">{fmt(r.qty)} {r.satuan === 'ZAK' ? 'zak' : r.satuan === 'TON' ? 'ton' : 'pcs'}</td></tr>)}
          </tbody></table>
        </Card>
      </div>
    </>
  );
}
