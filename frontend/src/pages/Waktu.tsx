import { useMemo } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { stats, uniq } from '../lib/agg';
import { COLORS, PALETTE, fmt, fmtDate, kirimColor, parseISODate, shortTrp } from '../lib/format';
import { Card, CellLink, ChartBox, ErrorBox, Kpi, Legend, Note, PageHeader, PageSkeleton, TableWrap, Th, pctTxt, usePager, useTo } from '../components/ui';
import type { Stop } from '../lib/types';

const BUCKETS: { label: string; test: (v: number) => boolean }[] = [
  { label: '0 hr', test: v => v <= 0 }, { label: '1 hr', test: v => v === 1 }, { label: '2 hr', test: v => v === 2 }, { label: '3 hr', test: v => v === 3 },
  { label: '4–7 hr', test: v => v >= 4 && v <= 7 }, { label: '8–14 hr', test: v => v >= 8 && v <= 14 }, { label: '15–30 hr', test: v => v >= 15 && v <= 30 },
  { label: '31–90 hr', test: v => v >= 31 && v <= 90 }, { label: '> 90 hr', test: v => v > 90 },
];
const dd = (a?: string | null, b?: string | null) => (a && b ? Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 864e5) : null);

export default function Waktu() {
  const p = usePeriod();
  const to = useTo();
  const { data, error } = usePeriodData({ stops: true });

  const m = useMemo(() => {
    if (!data) return null;
    const toko = data.stops.filter(s => s.jenis_kirim !== 'Gudang → Gudang');
    const lead = stats(toko.map(s => s.lead_do_hari));
    const somSj = stats(toko.map(s => dd(s.som_date, s.sj_date)));
    const balik = stats(toko.map(s => s.sj_balik_hari));
    const leadVals = toko.map(s => s.lead_do_hari).filter((v): v is number => v != null);
    const hist = BUCKETS.map(b => ({ ...b, n: leadVals.filter(b.test).length }));
    const lewat = toko.filter(s => s.lewat_estimasi).length;
    const grp = (fn: (s: Stop) => string | null) => uniq(toko.map(fn)).map(k => {
      const ss = toko.filter(s => fn(s) === k);
      return { key: k, n: ss.length, lead: stats(ss.map(s => s.lead_do_hari)), balik: stats(ss.map(s => s.sj_balik_hari)), lewat: ss.filter(s => s.lewat_estimasi).length };
    }).sort((a, b) => b.n - a.n);
    const byTrp = grp(s => s.transporter), byKirim = grp(s => s.jenis_kirim), byDL = grp(s => s.dalam_luar);
    // muat: jam selesai muat per gudang
    const rit = data.rit.filter(r => r.jam_selesai_muat != null);
    const gudangs = uniq(rit.map(r => r.gudang_asal));
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const perHour = gudangs.map(g => ({ g, v: hours.map(h => rit.filter(r => r.gudang_asal === g && Math.floor(r.jam_selesai_muat!) === h).length) }));
    const usedH = hours.filter(h => perHour.some(x => x.v[h] > 0));
    const hMin = usedH.length ? Math.min(...usedH) : 6, hMax = usedH.length ? Math.max(...usedH) : 18;
    const jeda = gudangs.map(g => {
      const v = data.rit.filter(r => r.gudang_asal === g).map(r => r.jeda_muat_menit).filter((x): x is number => x != null && x > 0 && x <= 240);
      const s = stats(v);
      return { g, ...s, p25: v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length * 0.25)] : null, n: v.length,
        first: stats(data.rit.filter(r => r.gudang_asal === g && r.jam_selesai_muat != null).map(r => r.jam_selesai_muat)).min,
        perDay: data.rit.filter(r => r.gudang_asal === g).length / Math.max(1, new Set(data.rit.filter(r => r.gudang_asal === g).map(r => r.tanggal)).size) };
    });
    const tanpaMuat = data.rit.filter(r => r.selesai_muat == null);
    const outliers = toko.filter(s => (s.lead_do_hari ?? 0) > 30).sort((a, b) => (b.lead_do_hari || 0) - (a.lead_do_hari || 0));
    return { toko, lead, somSj, balik, hist, lewat, byTrp, byKirim, byDL, perHour, hMin, hMax, jeda, tanpaMuat, outliers };
  }, [data]);
  const { view, Pager } = usePager(m?.outliers || [], 25);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const hrs = Array.from({ length: m.hMax - m.hMin + 1 }, (_, i) => m.hMin + i);
  const fmtH = (v: number | null) => (v == null ? '–' : `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`);

  const GroupTable = ({ title, rows, color }: { title: string; rows: typeof m.byTrp; color?: (k: string) => string }) => (
    <Card title={title} className="flex-[1_1_380px] min-w-0">
      <TableWrap><table className="tbl-dense !min-w-0">
        <thead><tr><Th>{title.split(' ')[1] || 'Grup'}</Th><Th num>SJ</Th><Th num>Median</Th><Th num>P90</Th><Th num>SJ balik</Th><Th num>Lewat est.</Th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.key}><td className="max-w-[200px] truncate" style={color ? { color: color(r.key) } : undefined} title={r.key}>{shortTrp(r.key)}</td><td className="num font-mono">{fmt(r.n)}</td>
            <td className="num font-mono">{fmt(r.lead.med, 0)}</td><td className="num font-mono">{fmt(r.lead.p90, 0)}</td><td className="num font-mono">{fmt(r.balik.med, 0)}</td><td className="num font-mono">{pctTxt(r.lewat, r.n, 0)}</td></tr>
        ))}</tbody>
      </table></TableWrap>
    </Card>
  );

  return (
    <>
      <PageHeader eyebrow="Analisis" title="Waktu & Lead Time" desc={`Berapa lama dari order sampai barang diterima toko, berapa lama dokumen SJ kembali, dan pola jam muat di gudang — ${p.label}.`} />

      <div className="mb-5"><Note tone="warn"><b>Catatan data:</b> di file ini <i>Order Date</i> = tanggal kirim = tanggal terima SJ toko (hampir selalu sama). Jadi “lama dari order sampai tujuan” dihitung dari <b>DO Date</b> (tanggal pesanan dibuat) sampai <b>Tgl Terima SJ Toko</b>. DO lama (DO tahun 2022–2025 yang baru dikirim) menghasilkan lead time sangat panjang — lihat tabel “DO lama” di bawah.</Note></div>

      <div className="grid-kpi">
        <Kpi title="Lead DO → diterima toko" value={fmt(m.lead.med, 0)} unit="hari (median)" sub={`rata-rata ${fmt(m.lead.avg, 1)} · P90 ${fmt(m.lead.p90, 0)} hari · ${fmt(m.lead.n)} SJ`} />
        <Kpi title="SOM → SJ terbit" value={fmt(m.somSj.med, 0)} unit="hari (median)" sub={`P90 ${fmt(m.somSj.p90, 0)} hari`} hint="Selisih SOM Date dan SJ Date." />
        <Kpi title="SJ kembali ke DO Planner" value={fmt(m.balik.med, 0)} unit="hari (median)" sub={`P90 ${fmt(m.balik.p90, 0)} · maks ${fmt(m.balik.max)} hari`} hint="Tgl Terima SJ DoPlanner − Tgl Terima SJ Toko: seberapa cepat dokumen bukti kirim kembali ke kantor." />
        <Kpi title="Kirim melewati Est. Delv. Date" value={pctTxt(m.lewat, m.toko.length)} sub={`${fmt(m.lewat)} SJ. Est. Delv. Date mengumpul di beberapa tanggal saja (mis. 31 Jan, 7 Feb, 14 Mar, 4 Apr) — lebih mirip batas program/masa berlaku DO daripada janji kirim per order.`} />
      </div>

      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <Card title="Sebaran lead time DO → diterima (jumlah SJ)" className="flex-[2_1_520px]">
          <ChartBox height={260} deps={[m.hist]} label="Sebaran lead time"
            build={() => ({
              type: 'bar',
              data: { labels: m.hist.map(h => h.label), datasets: [{ data: m.hist.map(h => h.n), backgroundColor: m.hist.map((_, i) => (i <= 3 ? COLORS.green : i <= 6 ? COLORS.amber : COLORS.red)), maxBarThickness: 46 }] },
              options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: COLORS.line } }, x: { grid: { display: false } } },
                plugins: { tooltip: { callbacks: { label: (c: any) => ` ${fmt(c.parsed.y)} SJ (${pctTxt(c.parsed.y, m.lead.n)})` } } } },
            } as ChartConfiguration)} />
        </Card>
        <GroupTable title="Per jenis kirim" rows={m.byKirim} color={kirimColor} />
      </div>
      <div className="flex gap-4 mt-4 flex-wrap items-stretch">
        <GroupTable title="Per transporter" rows={m.byTrp} />
        <GroupTable title="Per dalam/luar kota" rows={m.byDL} />
      </div>

      <h2 className="section-title">Lama muat di gudang</h2>
      <div className="mb-4"><Note tone="warn">Data hanya punya <b>Selesai Muat</b> (jam selesai), belum ada jam truk <b>masuk / mulai muat</b>. Karena itu “lama muat” di sini didekati dengan <b>jeda antar-selesai-muat</b> di gudang yang sama pada hari yang sama (berapa menit sekali gudang menyelesaikan satu truk). Untuk lama muat sebenarnya per truk, minta kolom <i>Jam Masuk Gudang</i> / <i>Mulai Muat</i> dari sistem gudang. Ritase curah & pelabuhan tidak punya jam selesai muat ({fmt(m.tanpaMuat.length)} ritase).</Note></div>
      <div className="flex gap-4 flex-wrap items-stretch">
        <Card title="Jam selesai muat per gudang (jumlah ritase)" className="flex-[2_1_520px]">
          <Legend items={m.perHour.map((x, i) => ({ label: x.g, color: PALETTE[i % PALETTE.length] }))} />
          <ChartBox height={260} deps={[m.perHour]} label="Jam selesai muat"
            build={() => ({
              type: 'bar',
              data: { labels: hrs.map(h => `${String(h).padStart(2, '0')}:00`), datasets: m.perHour.map((x, i) => ({ label: x.g, data: hrs.map(h => x.v[h]), backgroundColor: PALETTE[i % PALETTE.length], maxBarThickness: 26 })) },
              options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: COLORS.line } } } },
            } as ChartConfiguration)} />
        </Card>
        <Card title="Jeda antar-selesai-muat (menit)" className="flex-[1_1_380px]">
          <TableWrap><table className="tbl-dense !min-w-0">
            <thead><tr><Th>Gudang</Th><Th num>Median</Th><Th num>P25</Th><Th num>P90</Th><Th num>Rit/hari</Th><Th num>Muat pertama</Th></tr></thead>
            <tbody>{m.jeda.map(j => (
              <tr key={j.g}><td><CellLink to={to('/gudang/' + encodeURIComponent(j.g))}>{j.g}</CellLink></td><td className="num font-mono">{fmt(j.med, 0)}</td><td className="num font-mono">{fmt(j.p25, 0)}</td>
                <td className="num font-mono">{fmt(j.p90, 0)}</td><td className="num font-mono">{fmt(j.perDay, 1)}</td><td className="num font-mono">{fmtH(j.first)}</td></tr>
            ))}</tbody>
          </table></TableWrap>
          <p className="text-[11.5px] text-faint mt-2">Jeda &gt; 4 jam dibuang (istirahat/ganti shift). Gudang virtual tidak punya jam muat.</p>
        </Card>
      </div>

      <h2 className="section-title">DO lama <span className="n">· lead time &gt; 30 hari ({fmt(m.outliers.length)} SJ)</span></h2>
      <TableWrap>
        <table className="tbl-dense">
          <thead><tr><Th>DO</Th><Th>Tgl DO</Th><Th>Dikirim</Th><Th num>Lead (hari)</Th><Th>Toko</Th><Th>Transporter</Th><Th>FOAD</Th><Th>Keterangan</Th></tr></thead>
          <tbody>{view.map(s => (
            <tr key={s.stop_key}>
              <td>{(s.do_nos || '').split(', ').filter(Boolean).map(d => <div key={d}><CellLink to={to('/do/' + encodeURIComponent(d))}>{d}</CellLink></div>)}</td>
              <td className="font-mono">{fmtDate(s.do_date)}</td><td className="font-mono">{fmtDate(s.tanggal)}</td><td className="num font-mono font-semibold text-red">{fmt(s.lead_do_hari)}</td>
              <td>{s.cust_code ? <CellLink to={to('/toko/' + encodeURIComponent(s.cust_code))}>{s.cust_name}</CellLink> : '–'}</td>
              <td>{shortTrp(s.transporter)}</td><td><CellLink to={to('/ritase/' + encodeURIComponent(s.ritase_key))}>{s.ritase_key.split('|').pop()}</CellLink></td>
              <td className="!whitespace-normal text-[11.5px] max-w-[260px]">{s.ket}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>
      <Pager />
    </>
  );
}
