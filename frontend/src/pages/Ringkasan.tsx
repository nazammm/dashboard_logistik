import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { groupRit, gidMetric, stats, summarize, tipeMuatan } from '../lib/agg';
import { COLORS, PALETTE, colorFor, esc, fmt, fmtDate, fmtDay, fmtIDRCompact, kirimColor, shortTrp, daysInRange, monthStart, monthEnd, DAYS_ID, parseISODate } from '../lib/format';
import { donutPercentPlugins } from '../lib/chart';
import { useAsync } from '../lib/hooks';
import { DataSource } from '../lib/data';
import CoverageMap from '../components/CoverageMap';
import { Badge, Card, CellLink, ChartBox, Delta, EmptyBox, ErrorBox, Kpi, PageSkeleton, ShareBar, TableWrap, Th, pctTxt, useTo, cx } from '../components/ui';
import type { Ritase } from '../lib/types';

function HeroKpi({ label, value, unit, delta }: { label: string; value: ReactNode; unit?: string; delta?: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase text-[#8F8874]" style={{ letterSpacing: '.08em' }}>{label}</div>
      <div className="font-disp font-extrabold text-4xl text-white mt-1"><span className="font-mono">{value}</span>{unit && <small className="font-mono text-[13px] text-accent font-semibold ml-1">{unit}</small>}</div>
      {delta && <div className="[&_.kpi-delta]:mt-0.5 [&_.text-faint]:!text-[#8F8874]">{delta}</div>}
    </div>
  );
}

export default function Ringkasan() {
  const p = usePeriod();
  const to = useTo();
  const nav = useNavigate();
  const { data, error } = usePeriodData({ stops: true, prev: true });
  const gud = useAsync(() => DataSource.gudang(), []);

  const m = useMemo(() => {
    if (!data) return null;
    const { rit, ritPrev, stops } = data;
    const tot = summarize(rit);
    const prev = ritPrev ? summarize(ritPrev) : null;
    const byTrp = groupRit(rit, r => r.transporter);
    const byKirim = groupRit(rit, r => r.jenis_kirim);
    const byDL = groupRit(rit, r => r.dalam_luar);
    const byGud = groupRit(rit, r => r.gudang_asal);
    const byTipe = groupRit(rit, r => tipeMuatan(r));
    const byKec = groupRit(rit.filter(r => r.jenis_kirim !== 'Gudang → Gudang'), r => r.kecamatan?.split(', ') || null);
    const lead = stats(stops.filter(s => s.jenis_kirim !== 'Gudang → Gudang').map(s => s.lead_do_hari));
    const leadPrev = null;
    const tokoSet = new Set(stops.map(s => s.cust_code).filter(Boolean));
    const gidTon = gidMetric(stops.filter(s => s.jenis_kirim !== 'Gudang → Gudang'), 'ton');
    const flowsMap = new Map<string, number>();
    stops.forEach(s => { if (s.gid && s.gudang_asal && s.jenis_kirim !== 'Gudang → Gudang') flowsMap.set(s.gudang_asal + '|' + s.gid, (flowsMap.get(s.gudang_asal + '|' + s.gid) || 0) + (s.ton || 0)); });
    const flows = [...flowsMap.entries()].map(([k, v]) => ({ from: k.split('|')[0], gid: k.split('|')[1], value: v }));
    // harian dalam bulan
    const days = daysInRange(monthStart(p.tgl), monthEnd(p.tgl));
    const perDay = days.map(d => summarize(data.ritBulan.filter(r => r.tanggal === d), d));
    const campuran = rit.filter(r => r.qty_semen > 0 && r.qty_non_semen > 0).length;
    const busiest = groupRit(rit, r => r.plat_label)[0];
    return { tot, prev, byTrp, byKirim, byDL, byGud, byTipe, byKec, lead, leadPrev, tokoSet, gidTon, flows, days, perDay, campuran, busiest };
  }, [data, p.tgl]);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const { tot, prev } = m;
  const dl = { label: data.prevLabel };
  const top = m.byTrp[0];
  const empty = data.rit.length === 0;

  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden bg-ink text-white -mx-11 -mt-8 mb-8 px-11 pt-12 pb-12 border-b border-[#100f0c] max-[880px]:-mx-[18px] max-[880px]:-mt-[22px] max-[880px]:px-[18px] max-[880px]:pt-9">
        <div className="absolute -inset-[10%] z-0" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
        <svg className="absolute right-0 top-0 h-full w-[60%] opacity-60 z-0" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
          style={{ WebkitMaskImage: 'linear-gradient(to left,#000 30%,transparent 90%)', maskImage: 'linear-gradient(to left,#000 30%,transparent 90%)' }}>
          {[[420, 90], [520, 160], [470, 300], [330, 250], [560, 330], [380, 150]].map(([x, y], i) => (
            <g key={i}><path d={`M300 200 Q ${(300 + x) / 2} ${y - 60} ${x} ${y}`} stroke="#FF5A1F" strokeWidth="1" fill="none" strokeDasharray="2 6" opacity=".7" />
              <circle cx={x} cy={y} r="4" fill="#0E0D0B" stroke="#FF5A1F" strokeWidth="1.4" /></g>
          ))}
          <rect x="290" y="190" width="20" height="20" fill="#FF5A1F" />
        </svg>
        <div className="relative z-[2] flex gap-10 flex-wrap items-start">
          <div className="flex-[1_1_520px] min-w-0">
            <div className="mb-4 flex gap-2 flex-wrap">
              <Badge variant="online">{p.cabang || 'Semua cabang'}</Badge>
              <Badge variant="neutral" className="!bg-white/10 !text-[#C9C3B4]">{p.mode === 'harian' ? fmtDay(p.tgl) : p.label}</Badge>
            </div>
            <h1 className="text-white leading-[.98]" style={{ fontSize: 'clamp(34px,5vw,60px)' }}>
              {empty ? 'Tidak ada pengiriman' : <>{fmt(tot.rit)} ritase,<br />{fmt(tot.ton, 0)} ton semen.</>}
            </h1>
            <p className="text-[#C9C3B4] max-w-[600px] mt-4 text-[15px] leading-relaxed">
              {empty ? 'Belum ada data pada periode ini. Pilih tanggal/bulan lain di bar periode di atas.' :
                <>{fmt(tot.unit)} unit truk dan {fmt(tot.sopir)} sopir dari {fmt(tot.transporter)} transporter melayani {fmt(m.tokoSet.size)} toko di {fmt(m.byKec.length)} kecamatan.
                  {top && <> {shortTrp(top.key)} mengangkut porsi terbesar ({pctTxt(top.ton, tot.ton)} tonase).</>}</>}
            </p>
            <div className="flex gap-[38px] max-[880px]:gap-6 flex-wrap mt-9">
              <HeroKpi label="Ritase" value={fmt(tot.rit)} delta={<Delta now={tot.rit} prev={prev?.rit} {...dl} />} />
              <HeroKpi label="Tonase semen" value={fmt(tot.ton, 1)} unit="ton" delta={<Delta now={tot.ton} prev={prev?.ton} {...dl} />} />
              <HeroKpi label="Unit truk" value={fmt(tot.unit)} delta={<Delta now={tot.unit} prev={prev?.unit} {...dl} />} />
              <HeroKpi label="Sopir" value={fmt(tot.sopir)} delta={<Delta now={tot.sopir} prev={prev?.sopir} {...dl} />} />
            </div>
          </div>
          <aside className="relative flex-none w-[320px] max-[880px]:w-full rounded px-5 py-[18px] border border-white/[.14]" style={{ background: 'rgba(14,13,11,.82)' }} aria-label="Peringkat transporter">
            <div className="font-mono text-[10.5px] uppercase text-[#8F8874] mb-3.5" style={{ letterSpacing: '.07em' }}>Top transporter · tonase</div>
            <ol className="list-none m-0 p-0 flex flex-col gap-3">
              {m.byTrp.slice(0, 5).map((t, i) => (
                <li key={t.key}>
                  <button type="button" onClick={() => nav(to('/transporter/' + encodeURIComponent(t.key)))} className="w-full flex items-center gap-2.5 text-left group">
                    <span className={cx('font-disp font-extrabold text-base w-5 shrink-0 text-center', i === 0 ? 'text-accent' : 'text-[#6B6558]')}>{i + 1}</span>
                    <span className="flex-1 min-w-0 flex flex-col font-sans text-[13px] font-semibold text-white group-hover:text-accent truncate">
                      <span className="truncate">{shortTrp(t.key)}</span>
                      <small className="font-mono text-[10.5px] font-medium text-[#9C9585]">{fmt(t.rit)} rit · {fmt(t.unit)} unit</small>
                    </span>
                    <span className="font-mono text-[13px] font-bold text-[#EDE9DF] text-right shrink-0">{fmt(t.ton, 1)}<small className="block text-[9.5px] font-medium text-[#8F8874]">ton</small></span>
                  </button>
                </li>
              ))}
              {!m.byTrp.length && <li className="font-mono text-xs text-[#8F8874]">Belum ada data.</li>}
            </ol>
          </aside>
        </div>
      </section>

      {empty ? <EmptyBox>Tidak ada ritase pada {p.label}.</EmptyBox> : (
        <>
          {/* ---------------- KPI sekunder ---------------- */}
          <div className="grid-kpi">
            <Kpi title="Rata-rata ton / ritase" value={fmt(tot.tonPerRit, 2)} unit="ton" hint="Total ton semen ÷ ritase yang membawa semen (ritase non-semen saja tidak dihitung)."
              delta={prev ? { now: tot.tonPerRit || 0, prev: prev.tonPerRit, label: data.prevLabel } : null} sub={`${fmt(tot.ritSemen)} ritase membawa semen`} />
            <Kpi title="Titik bongkar (SJ)" value={fmt(tot.stop)} sub={`${fmt(tot.stop / Math.max(1, tot.rit), 2)} titik per ritase · ${fmt(m.tokoSet.size)} toko`} />
            <Kpi title="Lead time DO → diterima" value={fmt(m.lead.med, 0)} unit="hari (median)" hint="Tanggal DO sampai Tgl Terima SJ Toko. Order Date di file = tanggal kirim, jadi DO Date dipakai sebagai awal pesanan."
              sub={`P90 ${fmt(m.lead.p90, 0)} hari · rata-rata ${fmt(m.lead.avg, 1)} hari`} onClick={() => nav(to('/waktu'))} />
            <Kpi title="Ritase / unit / hari" value={fmt(tot.ritPerUnitHari, 2)} hint="Rata-rata jumlah ritase satu unit pada hari unit itu beroperasi." sub={m.busiest ? <>Tersibuk: <b>{m.busiest.key}</b> ({fmt(m.busiest.rit)} rit)</> : null} onClick={() => nav(to('/armada'))} />
            <Kpi title="Ritase campuran" value={pctTxt(m.campuran, tot.rit)} hint="Ritase yang membawa semen + non-semen sekaligus." sub={`${fmt(m.campuran)} ritase semen + non-semen`} onClick={() => nav(to('/muatan'))} />
            <Kpi title="Ongkos angkut (Jml Harga)" value={fmtIDRCompact(tot.biaya)} sub={tot.ton > 0 ? `≈ ${fmtIDRCompact(tot.biaya / tot.ton)} / ton` : undefined} hint="Penjumlahan kolom Jml Harga (ongkos angkut per baris)." />
          </div>

          {/* ---------------- Jenis kirim ---------------- */}
          <h2 className="section-title">Jenis kirim <span className="n">· klik untuk lihat ritasenya</span></h2>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
            {m.byKirim.map(k => (
              <button key={k.key} type="button" onClick={() => nav(to('/ritase', { jenis: k.key }))} className="card text-left hover:border-accent transition-colors">
                <div className="flex items-center gap-2 mb-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: kirimColor(k.key) }} /><span className="card-title !mb-0">{k.key}</span></div>
                <div className="kpi-value !text-[30px]">{fmt(k.rit)}<span className="unit">ritase</span></div>
                <div className="font-mono text-[12px] text-soft mt-1">{fmt(k.ton, 1)} ton · {fmt(k.tonPerRit, 1)} ton/rit · {fmt(k.unit)} unit</div>
                <div className="mt-2"><ShareBar value={k.rit} max={tot.rit} color={kirimColor(k.key)} label={pctTxt(k.rit, tot.rit)} /></div>
              </button>
            ))}
          </div>

          {/* ---------------- Grafik harian ---------------- */}
          <div className="flex gap-4 mt-4 flex-wrap items-stretch">
            <Card title={`Ritase & tonase per hari · ${p.label.replace(/^.*?, /, '')} — klik batang untuk buka hari itu`} className="flex-[2_1_560px]">
              <ChartBox height={300} deps={[m.perDay, p.tgl, p.mode]} label="Ritase dan tonase per hari"
                build={() => ({
                  type: 'bar',
                  data: {
                    labels: m.days.map(d => `${DAYS_ID[parseISODate(d).getDay()]} ${d.slice(8)}`),
                    datasets: [
                      { label: 'Ton', data: m.perDay.map(x => x.ton), backgroundColor: m.days.map(d => p.mode === 'harian' && d === p.tgl ? COLORS.accent : 'rgba(255,90,31,.55)'), yAxisID: 'y', order: 2, maxBarThickness: 22 },
                      { label: 'Ritase', data: m.perDay.map(x => x.rit), type: 'line', borderColor: COLORS.blue, backgroundColor: COLORS.blue, yAxisID: 'y1', tension: .3, pointRadius: 2.5, borderWidth: 2, order: 1 },
                    ],
                  },
                  options: {
                    responsive: true, maintainAspectRatio: false,
                    onClick: (_e: unknown, els: { index: number }[]) => { if (els[0]) p.set({ mode: 'harian', tgl: m.days[els[0].index] }); },
                    onHover: (e: any, els: unknown[]) => { if (e.native?.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                    scales: { y: { beginAtZero: true, grid: { color: COLORS.line }, title: { display: true, text: 'ton' } }, y1: { position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'ritase' } }, x: { grid: { display: false } } },
                    plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { callbacks: { title: (c: any) => fmtDay(m.days[c[0].dataIndex]), label: (c: any) => ` ${c.dataset.label}: ${fmt(c.parsed.y, c.dataset.label === 'Ton' ? 1 : 0)}` } } },
                  },
                } as ChartConfiguration)} />
            </Card>
            <Card title="Dalam kota vs luar kota" className="flex-[1_1_280px]">
              <ChartBox height={300} deps={[m.byDL]} label="Ritase dalam vs luar kota"
                build={() => ({
                  type: 'doughnut',
                  data: { labels: m.byDL.map(x => x.key), datasets: [{ data: m.byDL.map(x => x.rit), backgroundColor: m.byDL.map(x => x.key === 'DALAM KOTA' ? COLORS.blue : x.key === 'LUAR KOTA' ? COLORS.accent : COLORS.faint), borderColor: '#F8F6F0', borderWidth: 2 }] },
                  options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: donutPercentPlugins('ritase', v => `${fmt(v)} ritase`) as any },
                } as ChartConfiguration)} />
              <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[11.5px] text-soft">
                {m.byDL.map(x => <div key={x.key}><b className="text-ink">{x.key}</b><br />{fmt(x.ton, 1)} ton · {fmt(x.tonPerRit, 1)} t/rit</div>)}
              </div>
            </Card>
          </div>

          <div className="flex gap-4 mt-4 flex-wrap items-stretch">
            <Card title="Gudang asal" className="flex-[1_1_320px]">
              <TableWrap><table className="tbl-dense !min-w-0">
                <thead><tr><Th>Gudang</Th><Th num>Ritase</Th><Th num>Ton</Th><Th>Porsi</Th></tr></thead>
                <tbody>{m.byGud.map(g => (
                  <tr key={g.key}><td><CellLink to={to('/gudang/' + encodeURIComponent(g.key))}>{g.key}</CellLink></td><td className="num font-mono">{fmt(g.rit)}</td><td className="num font-mono">{fmt(g.ton, 1)}</td>
                    <td><ShareBar value={g.ton} max={tot.ton} label={pctTxt(g.ton, tot.ton)} color={COLORS.blue} /></td></tr>
                ))}</tbody>
              </table></TableWrap>
            </Card>
            <Card title="Tipe muatan per ritase" className="flex-[1_1_320px]">
              <ChartBox height={220} deps={[m.byTipe]} label="Tipe muatan"
                build={() => ({
                  type: 'bar',
                  data: { labels: m.byTipe.map(x => x.key), datasets: [{ data: m.byTipe.map(x => x.rit), backgroundColor: m.byTipe.map(x => x.key === 'Semen saja' ? COLORS.accent : x.key === 'Campuran' ? COLORS.amber : x.key === 'Non-semen saja' ? COLORS.blueMid : COLORS.faint), maxBarThickness: 26 }] },
                  options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: COLORS.line } }, y: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c: any) => ` ${fmt(c.parsed.x)} ritase (${pctTxt(c.parsed.x, tot.rit)})` } } } },
                } as ChartConfiguration)} />
            </Card>
          </div>

          {/* ---------------- Peta + Top zona ---------------- */}
          <h2 className="section-title">Cakupan wilayah <span className="n">· tonase per kecamatan tujuan (klik area untuk detail)</span></h2>
          <div className="flex gap-4 flex-wrap items-stretch">
            <div className="flex-[2_1_560px] min-w-0">
              <CoverageMap values={m.gidTon} unit="ton" height={430} flows={m.flows} gudang={gud.data as never || []}
                onClickGid={gid => nav(to('/kecamatan/' + encodeURIComponent(gid)))}
                tooltip={(gid, f) => `<b>${esc(f?.properties.kec)}</b><br>${esc(f?.properties.kab)}<br>${fmt(m.gidTon.get(gid) || 0, 1)} ton`} />
            </div>
            <Card title="Top kecamatan tujuan" className="flex-[1_1_320px]">
              <TableWrap maxH={400}><table className="tbl-dense !min-w-0">
                <thead><tr><Th>Kecamatan</Th><Th num>Rit</Th><Th num>Ton</Th></tr></thead>
                <tbody>{m.byKec.slice(0, 15).map(k => (
                  <tr key={k.key}><td>{k.key}</td><td className="num font-mono">{fmt(k.rit)}</td><td className="num font-mono">{fmt(k.ton, 1)}</td></tr>
                ))}</tbody>
              </table></TableWrap>
              <div className="mt-2.5"><CellLink to={to('/rute')}>Rute & zona lengkap</CellLink></div>
            </Card>
          </div>

          {/* ---------------- Transporter ---------------- */}
          <h2 className="section-title">Per transporter <span className="n">· {fmt(m.byTrp.length)} transporter</span></h2>
          <TableWrap>
            <table>
              <thead><tr><Th>Transporter</Th><Th num>Ritase</Th><Th num>Ton</Th><Th num>Ton/rit</Th><Th num>Unit</Th><Th num>Sopir</Th><Th num>Titik</Th><Th>Porsi tonase</Th></tr></thead>
              <tbody>{m.byTrp.map(t => (
                <tr key={t.key}>
                  <td><CellLink to={to('/transporter/' + encodeURIComponent(t.key))}>{t.key}</CellLink></td>
                  <td className="num font-mono">{fmt(t.rit)}</td><td className="num font-mono">{fmt(t.ton, 1)}</td><td className="num font-mono">{fmt(t.tonPerRit, 2)}</td>
                  <td className="num font-mono">{fmt(t.unit)}</td><td className="num font-mono">{fmt(t.sopir)}</td><td className="num font-mono">{fmt(t.stop)}</td>
                  <td><ShareBar value={t.ton} max={tot.ton} label={pctTxt(t.ton, tot.ton)} color={colorFor(t.key, PALETTE)} /></td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
          <p className="font-mono text-[11px] text-faint mt-3">Periode {fmtDate(p.dari)} – {fmtDate(p.sampai)}. Ritase = 1 FOAD. Tonase hanya menghitung produk semen (zak × berat/zak, curah dalam ton).</p>
        </>
      )}
    </>
  );
}

export type { Ritase };
