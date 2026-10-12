// Satu halaman detail generik untuk: transporter, unit (plat), sopir, gudang, kecamatan, zona.
// Semua angka mengikuti periode aktif (harian/bulanan) di bar periode.
import { useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { useAsync, useSort } from '../lib/hooks';
import { DataSource } from '../lib/data';
import { groupRit, komposisi, stats, summarize, tipeMuatan } from '../lib/agg';
import { COLORS, DAYS_ID, daysInRange, esc, fmt, fmtDate, fmtDay, fmtIDRCompact, fmtJam, kirimColor, monthEnd, monthStart, parseISODate, shortTrp } from '../lib/format';
import CoverageMap from '../components/CoverageMap';
import { BackLink, Badge, Card, CellLink, ChartBox, EmptyBox, ErrorBox, Kpi, Note, PageHeader, PageSkeleton, STh, ShareBar, TableWrap, Th, pctTxt, usePager, useTo } from '../components/ui';
import type { Ritase, Stop } from '../lib/types';

type Kind = 'transporter' | 'unit' | 'sopir' | 'gudang' | 'kecamatan' | 'zona';
const KIND_LABEL: Record<Kind, string> = { transporter: 'Transporter', unit: 'Unit truk', sopir: 'Sopir', gudang: 'Gudang asal', kecamatan: 'Kecamatan tujuan', zona: 'Zona transporter' };
const BACK: Record<Kind, [string, string]> = { transporter: ['/transporter', 'Transporter'], unit: ['/armada', 'Unit & Sopir'], sopir: ['/armada?tab=sopir', 'Unit & Sopir'], gudang: ['/rute', 'Rute & Zona'], kecamatan: ['/peta', 'Peta Cakupan'], zona: ['/rute?tab=zona', 'Rute & Zona'] };

function MiniTable<T extends { key: string }>({ title, rows, cols, link, max = 12 }: {
  title: string; rows: T[]; cols: { h: string; v: (r: T) => ReactNode; num?: boolean }[]; link?: (r: T) => string | null; max?: number;
}) {
  if (!rows.length) return null;
  return (
    <Card title={`${title} · ${fmt(rows.length)}`} className="flex-[1_1_340px] min-w-0">
      <TableWrap maxH={360}><table className="tbl-dense !min-w-0">
        <thead><tr>{cols.map((c, i) => <Th key={i} num={c.num}>{c.h}</Th>)}</tr></thead>
        <tbody>{rows.slice(0, max).map(r => {
          const l = link?.(r);
          return <tr key={r.key}>{cols.map((c, i) => <td key={i} className={c.num ? 'num font-mono' : 'max-w-[240px] truncate'} title={i === 0 ? r.key : undefined}>{i === 0 && l ? <CellLink to={l}>{c.v(r)}</CellLink> : c.v(r)}</td>)}</tr>;
        })}</tbody>
      </table></TableWrap>
      {rows.length > max && <div className="font-mono text-[11px] text-faint mt-2">+{fmt(rows.length - max)} lainnya</div>}
    </Card>
  );
}

export default function EntityDetail() {
  const { id: rawId = '' } = useParams();
  const id = decodeURIComponent(rawId);
  const { pathname } = useLocation();
  const kind = pathname.split('/')[1] as Kind;
  const p = usePeriod();
  const to = useTo();
  const nav = useNavigate();
  const { data, error } = usePeriodData({ stops: true, muatan: true });
  const gud = useAsync(() => DataSource.gudang(), []);
  const zona = useAsync(() => DataSource.zona(p.cabang), [p.cabang]);

  const m = useMemo(() => {
    if (!data) return null;
    const ritOf = (r: Ritase) => kind === 'transporter' ? r.transporter === id : kind === 'unit' ? r.plat === id : kind === 'sopir' ? r.sopir === id
      : kind === 'gudang' ? r.gudang_asal === id : kind === 'kecamatan' ? (r.gids || []).includes(id) : (r.zona || []).includes(id);
    const stopOf = (s: Stop) => kind === 'transporter' ? s.transporter === id : kind === 'unit' ? s.plat === id : kind === 'sopir' ? s.sopir === id
      : kind === 'gudang' ? s.gudang_asal === id : kind === 'kecamatan' ? s.gid === id : s.zone_code === id;
    const area = kind === 'kecamatan' || kind === 'zona';
    const rit = data.rit.filter(ritOf);
    const stops = data.stops.filter(stopOf);
    const stopKeys = new Set(stops.map(s => s.stop_key));
    const ritKeys = new Set(rit.map(r => r.ritase_key));
    const items = data.muatan.filter(i => area ? stopKeys.has(i.stop_key) : ritKeys.has(i.ritase_key));
    const tot = summarize(rit);
    const tonArea = stops.reduce((a, s) => a + (s.ton || 0), 0);
    const toko = new Set(stops.map(s => s.cust_code).filter(Boolean));
    const gidTon = new Map<string, number>();
    stops.forEach(s => { if (s.gid && s.jenis_kirim !== 'Gudang → Gudang') gidTon.set(s.gid, (gidTon.get(s.gid) || 0) + (s.ton || 0)); });
    // konteks: semua kecamatan yang dilayani periode ini (abu-abu)
    const ctx = new Map<string, number>();
    data.stops.forEach(s => { if (s.gid && s.jenis_kirim !== 'Gudang → Gudang') ctx.set(s.gid, (ctx.get(s.gid) || 0) + (s.ton || 0)); });
    const values = new Map(ctx); gidTon.forEach((v, k) => values.set(k, v));
    const flowsM = new Map<string, number>();
    stops.forEach(s => { if (s.gid && s.gudang_asal && s.jenis_kirim !== 'Gudang → Gudang') flowsM.set(s.gudang_asal + '|' + s.gid, (flowsM.get(s.gudang_asal + '|' + s.gid) || 0) + (s.ton || 0) + 0.01); });
    const flows = [...flowsM.entries()].map(([k, v]) => ({ from: k.split('|')[0], gid: k.split('|')[1], value: v }));
    const days = daysInRange(monthStart(p.tgl), monthEnd(p.tgl));
    const ritBulan = data.ritBulan.filter(ritOf);
    const perDay = days.map(d => summarize(ritBulan.filter(r => r.tanggal === d), d));
    // breakdown
    const byStop = (fn: (s: Stop) => string | null | undefined) => {
      const mm = new Map<string, { key: string; stop: number; ton: number; rit: Set<string>; toko: Set<string>; extra?: string }>();
      stops.forEach(s => {
        const k = fn(s) || '(kosong)';
        if (!mm.has(k)) mm.set(k, { key: k, stop: 0, ton: 0, rit: new Set(), toko: new Set() });
        const v = mm.get(k)!; v.stop++; v.ton += s.ton || 0; v.rit.add(s.ritase_key); if (s.cust_code) v.toko.add(s.cust_code);
      });
      return [...mm.values()].map(v => ({ ...v, nRit: v.rit.size, nToko: v.toko.size })).sort((a, b) => b.ton - a.ton || b.stop - a.stop);
    };
    const units = groupRit(rit, r => r.plat);
    const sopirs = groupRit(rit, r => r.sopir);
    const trps = groupRit(rit, r => r.transporter);
    const kirim = groupRit(rit, r => r.jenis_kirim);
    const gudangs = groupRit(rit, r => r.gudang_asal);
    const kec = byStop(s => s.jenis_kirim === 'Gudang → Gudang' ? null : s.kecamatan ? `${s.kecamatan}${s.kabupaten ? ' · ' + s.kabupaten : ''}` : null).filter(k => k.key !== '(kosong)');
    const tokoRows = byStop(s => s.cust_code).filter(t => t.key !== '(kosong)').map(t => ({ ...t, name: stops.find(s => s.cust_code === t.key)?.cust_name || t.key }));
    const zonaRows = byStop(s => s.zone_code).filter(t => t.key !== '(kosong)').map(z => ({ ...z, name: stops.find(s => s.zone_code === z.key)?.zone_name || z.key }));
    const lead = stats(stops.map(s => s.lead_do_hari));
    const muat = stats(rit.map(r => r.jam_selesai_muat));
    const jeda = stats(rit.map(r => r.jeda_muat_menit).filter(v => v != null && v > 0 && v < 240));
    const kom = komposisi(items);
    const nama = kind === 'unit' ? rit[0]?.plat_label || id
      : kind === 'kecamatan' ? (stops[0] ? `${stops[0].kecamatan}` : id)
      : kind === 'zona' ? (stops[0]?.zone_name || id) : id;
    const sub = kind === 'kecamatan' ? stops[0]?.kabupaten : kind === 'zona' ? stops[0]?.kecamatan : null;
    return { rit, stops, items, tot, tonArea, toko, gidTon, values, flows, days, perDay, units, sopirs, trps, kirim, gudangs, kec, tokoRows, zonaRows, lead, muat, jeda, kom, nama, sub, area };
  }, [data, kind, id, p.tgl]);

  const s = useSort<Ritase>(m?.rit || [], 'tanggal', 'desc', (r, k) => (r as never)[k]);
  const { view, Pager } = usePager(s.sorted, 40);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const [backTo, backLbl] = BACK[kind] || ['/ringkasan', 'Ringkasan'];
  const z = kind === 'zona' ? (zona.data || []).find(x => x.zone_code === id) : null;

  return (
    <>
      <BackLink to={to(backTo)}>{backLbl}</BackLink>
      <PageHeader eyebrow={`${KIND_LABEL[kind]} · ${p.label}${p.cabang ? ' · ' + p.cabang : ''}`} title={m.nama}
        desc={m.sub ? String(m.sub) : kind === 'unit' && m.rit[0] ? `Transporter: ${[...new Set(m.rit.map(r => r.transporter))].join(', ')}` : undefined}
        right={<>{z?.is_dummy && <Badge variant="warn">Peta zona dummy</Badge>}{kind === 'gudang' && (gud.data || []).find(g => g.nama === id)?.is_dummy && <Badge variant="warn">Koordinat gudang dummy</Badge>}</>} />

      {!m.rit.length && !m.stops.length ? <EmptyBox>Tidak ada aktivitas {KIND_LABEL[kind].toLowerCase()} ini pada {p.label}. Coba ganti periode di bar atas.</EmptyBox> : (
        <>
          <div className="grid-kpi">
            <Kpi title={m.area ? 'Ritase yang mampir' : 'Ritase'} value={fmt(m.area ? new Set(m.stops.map(s => s.ritase_key)).size : m.tot.rit)} sub={`${fmt(m.tot.hari)} hari aktif`} />
            <Kpi title={m.area ? 'Ton dibongkar di sini' : 'Tonase semen'} value={fmt(m.area ? m.tonArea : m.tot.ton, 1)} unit="ton" sub={m.area ? `${fmt(m.stops.reduce((a, s) => a + (s.qty_non_semen || 0), 0))} pcs non-semen` : `${fmt(m.tot.tonPerRit, 2)} ton/ritase semen`} />
            <Kpi title="Titik bongkar" value={fmt(m.stops.length)} sub={`${fmt(m.toko.size)} toko · ${fmt(m.gidTon.size)} kecamatan`} />
            {kind !== 'unit' && kind !== 'sopir' && <Kpi title="Unit / Sopir" value={`${fmt(m.tot.unit)} / ${fmt(m.tot.sopir)}`} sub={m.tot.ritPerUnitHari ? `${fmt(m.tot.ritPerUnitHari, 2)} rit/unit/hari` : undefined} />}
            {(kind === 'unit' || kind === 'sopir') && <Kpi title="Ritase per hari aktif" value={fmt(m.tot.rit / Math.max(1, m.tot.hari), 2)} sub={`maks ${fmt(Math.max(0, ...m.perDay.map(d => d.rit)))} rit dalam sehari`} />}
            <Kpi title="Lead time DO → terima" value={fmt(m.lead.med, 0)} unit="hari (median)" sub={m.lead.n ? `P90 ${fmt(m.lead.p90, 0)} hari · ${fmt(m.lead.n)} SJ` : 'tidak ada DO'} />
            {!m.area && <Kpi title="Jam selesai muat (median)" value={m.muat.med != null ? `${String(Math.floor(m.muat.med)).padStart(2, '0')}:${String(Math.round((m.muat.med % 1) * 60)).padStart(2, '0')}` : '–'} sub={m.jeda.med != null ? `jeda antar-muat di gudang: ${fmt(m.jeda.med, 0)} mnt (median)` : undefined} />}
            {!m.area && <Kpi title="Ongkos angkut" value={fmtIDRCompact(m.tot.biaya)} sub={m.tot.ton > 0 ? `≈ ${fmtIDRCompact(m.tot.biaya / m.tot.ton)}/ton` : undefined} />}
          </div>

          <div className="flex gap-4 mt-4 flex-wrap items-stretch">
            <div className="flex-[2_1_560px] min-w-0">
              <div className="card-title mb-2">Cakupan {m.area ? 'area' : 'tujuan'} — berwarna = dilayani {KIND_LABEL[kind].toLowerCase()} ini, abu-abu = dilayani pihak lain pada periode yang sama</div>
              {m.gidTon.size ? (
                <CoverageMap values={m.values} highlight={new Set(m.gidTon.keys())} fitTo="highlight" flows={m.flows} gudang={(gud.data || []) as never} height={440}
                  onClickGid={g => nav(to('/kecamatan/' + encodeURIComponent(g)))}
                  tooltip={(g, f) => `<b>${esc(f?.properties.kec)}</b> · ${esc(f?.properties.kab)}<br>${m.gidTon.has(g) ? `${fmt(m.gidTon.get(g) || 0, 1)} ton oleh ${esc(m.nama)}` : 'tidak dilayani'}`} />
              ) : <EmptyBox>Tidak ada titik bongkar ke toko (mis. hanya Gudang → Gudang).</EmptyBox>}
            </div>
            <Card title={`Per hari · ${p.label.replace(/^.*?, /, '')}`} className="flex-[1_1_340px]">
              <ChartBox height={410} deps={[m.perDay, p.tgl, p.mode]} label="Ritase per hari"
                build={() => ({
                  type: 'bar',
                  data: {
                    labels: m.days.map(d => `${DAYS_ID[parseISODate(d).getDay()]} ${d.slice(8)}`),
                    datasets: [
                      { label: 'Ritase', data: m.perDay.map(x => x.rit), backgroundColor: m.days.map(d => p.mode === 'harian' && d === p.tgl ? COLORS.accent : 'rgba(32,74,99,.7)'), yAxisID: 'y', maxBarThickness: 16 },
                      { label: 'Ton', data: m.perDay.map(x => x.ton), type: 'line', borderColor: COLORS.accent, yAxisID: 'y1', tension: .3, pointRadius: 1.5, borderWidth: 2 },
                    ],
                  },
                  options: {
                    responsive: true, maintainAspectRatio: false,
                    onClick: (_e: unknown, els: { index: number }[]) => { if (els[0]) p.set({ mode: 'harian', tgl: m.days[els[0].index] }); },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: COLORS.line } }, y1: { position: 'right', beginAtZero: true, grid: { display: false } }, x: { grid: { display: false }, ticks: { maxRotation: 90, autoSkip: true } } },
                    plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { callbacks: { title: (c: any) => fmtDay(m.days[c[0].dataIndex]) } } },
                  },
                } as ChartConfiguration)} />
            </Card>
          </div>

          <div className="flex gap-4 mt-4 flex-wrap items-stretch">
            {kind !== 'transporter' && <MiniTable title="Transporter" rows={m.trps} link={r => to('/transporter/' + encodeURIComponent(r.key))}
              cols={[{ h: 'Transporter', v: r => shortTrp(r.key) }, { h: 'Rit', v: r => fmt(r.rit), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }]} />}
            {kind !== 'unit' && <MiniTable title="Unit" rows={m.units} link={r => r.key === '(kosong)' ? null : to('/unit/' + encodeURIComponent(r.key))}
              cols={[{ h: 'Unit', v: r => m.rit.find(x => x.plat === r.key)?.plat_label || r.key }, { h: 'Rit', v: r => fmt(r.rit), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }, { h: 'Hari', v: r => fmt(r.hari), num: true }, { h: 'Rit/hari', v: r => fmt(r.rit / Math.max(1, r.hari), 1), num: true }]} />}
            {kind !== 'sopir' && <MiniTable title="Sopir" rows={m.sopirs} link={r => r.key === '(kosong)' ? null : to('/sopir/' + encodeURIComponent(r.key))}
              cols={[{ h: 'Sopir', v: r => r.key }, { h: 'Rit', v: r => fmt(r.rit), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }, { h: 'Unit', v: r => fmt(r.unit), num: true }]} />}
            {kind !== 'gudang' && <MiniTable title="Gudang asal" rows={m.gudangs} link={r => to('/gudang/' + encodeURIComponent(r.key))}
              cols={[{ h: 'Gudang', v: r => r.key }, { h: 'Rit', v: r => fmt(r.rit), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }]} />}
            <MiniTable title="Jenis kirim" rows={m.kirim}
              cols={[{ h: 'Jenis', v: r => <span style={{ color: kirimColor(r.key) }} className="font-semibold">{r.key}</span> }, { h: 'Rit', v: r => fmt(r.rit), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }, { h: 'Porsi', v: r => pctTxt(r.rit, m.tot.rit, 0), num: true }]} />
            {kind !== 'kecamatan' && <MiniTable title="Kecamatan tujuan" rows={m.kec}
              cols={[{ h: 'Kecamatan', v: r => r.key }, { h: 'Titik', v: r => fmt(r.stop), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }]} />}
            {kind !== 'zona' && <MiniTable title="Zona" rows={m.zonaRows} link={r => r.key === '(kosong)' ? null : to('/zona/' + encodeURIComponent(r.key))}
              cols={[{ h: 'Zona', v: r => r.name }, { h: 'Titik', v: r => fmt(r.stop), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }]} />}
            <MiniTable title="Toko" rows={m.tokoRows} max={15} link={r => r.key === '(kosong)' ? null : to('/toko/' + encodeURIComponent(r.key))}
              cols={[{ h: 'Toko', v: r => r.name }, { h: 'Titik', v: r => fmt(r.stop), num: true }, { h: 'Ton', v: r => fmt(r.ton, 1), num: true }]} />
          </div>

          <h2 className="section-title">Komposisi muatan <span className="n">· rata-rata per ritase yang membawa jenis itu</span></h2>
          {m.kom.rows.length ? (
            <TableWrap><table className="tbl-dense">
              <thead><tr><Th>Jenis</Th><Th>Kategori</Th><Th num>Total qty</Th><Th>Satuan</Th><Th num>Ritase membawa</Th><Th num>Qty / ritase</Th><Th>% ritase</Th></tr></thead>
              <tbody>{m.kom.rows.map(r => (
                <tr key={r.jenis}><td className="font-semibold">{r.jenis}</td><td><Badge variant={r.kategori === 'SEMEN' ? 'online' : 'neutral'}>{r.kategori}</Badge></td>
                  <td className="num font-mono">{fmt(r.qty)}</td><td>{r.satuan}</td><td className="num font-mono">{fmt(r.nRit)}</td><td className="num font-mono">{fmt(r.qtyPerRit, 1)}</td>
                  <td><ShareBar value={r.share} max={100} label={fmt(r.share, 0) + '%'} color={r.kategori === 'SEMEN' ? COLORS.accent : COLORS.blueMid} /></td></tr>
              ))}</tbody>
            </table></TableWrap>
          ) : <EmptyBox>Tidak ada muatan.</EmptyBox>}

          <h2 className="section-title">Daftar ritase <span className="n">· {fmt(m.rit.length)}</span></h2>
          {m.area && <div className="mb-3"><Note>Ritase di bawah adalah ritase yang <b>mampir</b> ke {KIND_LABEL[kind].toLowerCase()} ini; tonase per baris = seluruh muatan ritase (bisa termasuk titik di wilayah lain).</Note></div>}
          <TableWrap>
            <table className="tbl-dense">
              <thead><tr>
                <STh k="tanggal" s={s}>Tanggal</STh><STh k="foad_no" s={s}>FOAD</STh><STh k="jenis_kirim" s={s}>Jenis</STh><STh k="plat_label" s={s}>Unit</STh><STh k="sopir" s={s}>Sopir</STh>
                <STh k="gudang_asal" s={s}>Asal</STh><STh k="kecamatan" s={s}>Tujuan</STh><STh k="n_stop" s={s} num>Titik</STh><STh k="ton" s={s} num>Ton</STh><STh k="qty_non_semen" s={s} num>Non-semen</STh>
                <STh k="jam_selesai_muat" s={s} num>Selesai muat</STh><Th>Muatan</Th>
              </tr></thead>
              <tbody>{view.map(r => (
                <tr key={r.ritase_key}>
                  <td className="font-mono">{fmtDate(r.tanggal, false)}</td>
                  <td><CellLink to={to('/ritase/' + encodeURIComponent(r.ritase_key))}>{r.foad_no}</CellLink></td>
                  <td style={{ color: kirimColor(r.jenis_kirim) }}>{r.jenis_kirim}</td>
                  <td>{r.plat_label || '–'}</td><td>{r.sopir || '–'}</td><td>{r.gudang_asal}</td>
                  <td className="max-w-[220px] truncate" title={r.toko || ''}>{r.jenis_kirim === 'Gudang → Gudang' ? `Gudang ${r.gudang_tujuan}` : r.kecamatan}</td>
                  <td className="num font-mono">{fmt(r.n_stop)}</td><td className="num font-mono">{fmt(r.ton, 2)}</td><td className="num font-mono">{r.qty_non_semen ? fmt(r.qty_non_semen) : '–'}</td>
                  <td className="num font-mono">{fmtJam(r.selesai_muat)}</td><td>{tipeMuatan(r)}</td>
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
