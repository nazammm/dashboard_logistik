import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { groupRit, summarize } from '../lib/agg';
import { daysInRange, fmt, fmtDay, fmtJam, kirimColor, monthEnd, monthStart, parseISODate, shortTrp } from '../lib/format';
import { Card, CellLink, EmptyBox, ErrorBox, ExportButton, PageHeader, PageSkeleton, TableWrap, Th, cx, useTo } from '../components/ui';
import type { Ritase } from '../lib/types';

const KIRIM = ['Gudang → Toko', 'Gudang → Gudang', 'Pabrik → Toko', 'Pelabuhan → Toko'];

export default function RekapHarian() {
  const p = usePeriod();
  const to = useTo();
  const nav = useNavigate();
  const tblRef = useRef<HTMLTableElement>(null);
  const dayRef = useRef<HTMLTableElement>(null);
  const { data, error } = usePeriodData();

  const m = useMemo(() => {
    if (!data) return null;
    const days = daysInRange(monthStart(p.tgl), monthEnd(p.tgl));
    const rows = days.map(d => {
      const rs = data.ritBulan.filter(r => r.tanggal === d);
      const s = summarize(rs, d);
      const kir = Object.fromEntries(KIRIM.map(k => [k, rs.filter(r => r.jenis_kirim === k).length]));
      return { d, s, kir, luar: rs.filter(r => r.dalam_luar === 'LUAR KOTA').length };
    });
    const maxTon = Math.max(1, ...rows.map(r => r.s.ton));
    const total = summarize(data.ritBulan);
    // detail hari (mode harian): urutan rit per unit
    const units = p.mode === 'harian' ? groupRit(data.rit, r => r.plat_label || '(tanpa plat)').map(u => ({
      ...u, list: data.rit.filter(r => (r.plat_label || '(tanpa plat)') === u.key).sort((a, b) => (a.rit_ke || 0) - (b.rit_ke || 0)),
    })).sort((a, b) => b.rit - a.rit || b.ton - a.ton) : [];
    return { days, rows, maxTon, total, units };
  }, [data, p.tgl, p.mode]);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const first = parseISODate(m.days[0]).getDay();
  const pad = (first + 6) % 7; // minggu mulai Senin

  return (
    <>
      <PageHeader eyebrow="Operasional" title="Rekap Harian" desc="Kalender aktivitas pengiriman. Klik sebuah tanggal untuk membuka rincian hari itu (mode Harian): urutan ritase setiap unit, jam selesai muat, dan tujuan."
        right={<ExportButton filename={`rekap-harian-${p.cabang || 'semua'}-${p.bulan.slice(0, 7)}.xlsx`} getTables={() => [{ name: 'Rekap Harian', el: tblRef.current }, { name: 'Detail Hari', el: dayRef.current }]} />} />

      <Card title={`Kalender · ${p.label.replace(/^.*?, /, '')} — warna = tonase`}>
        <div className="grid grid-cols-7 gap-1.5 mt-2">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => <div key={d} className="font-mono text-[10px] uppercase text-faint text-center">{d}</div>)}
          {Array.from({ length: pad }).map((_, i) => <div key={'p' + i} />)}
          {m.rows.map(r => {
            const a = r.s.ton / m.maxTon;
            const sel = p.mode === 'harian' && p.tgl === r.d;
            return (
              <button key={r.d} type="button" disabled={!r.s.rit} onClick={() => p.set({ mode: 'harian', tgl: r.d })}
                className={cx('rounded-sm border text-left px-2 py-1.5 min-h-[64px] transition-colors', sel ? 'border-ink ring-2 ring-accent' : 'border-line hover:border-accent', !r.s.rit && 'opacity-40 cursor-default')}
                style={{ background: r.s.rit ? `rgba(255,90,31,${0.08 + a * 0.6})` : '#F1EEE5' }} title={`${fmtDay(r.d)}: ${fmt(r.s.rit)} ritase, ${fmt(r.s.ton, 1)} ton`}>
                <div className="font-mono text-[11px] font-semibold">{r.d.slice(8)}</div>
                {r.s.rit > 0 && <><div className="font-mono text-[12px] font-bold leading-tight">{fmt(r.s.ton, 0)}<span className="font-normal text-[9.5px]"> t</span></div><div className="font-mono text-[10px] text-soft">{fmt(r.s.rit)} rit · {fmt(r.s.unit)} unit</div></>}
              </button>
            );
          })}
        </div>
      </Card>

      {p.mode === 'harian' && (
        <>
          <h2 className="section-title">Rincian {fmtDay(p.tgl)} <span className="n">· {fmt(data.rit.length)} ritase · {fmt(m.units.length)} unit</span></h2>
          {!data.rit.length ? <EmptyBox>Tidak ada ritase pada tanggal ini.</EmptyBox> : (
            <TableWrap>
              <table ref={dayRef} className="tbl-dense">
                <thead><tr><Th>Unit</Th><Th>Sopir</Th><Th>Transporter</Th><Th num>Rit</Th><Th num>Ton</Th><Th>Urutan ritase (jam selesai muat → tujuan)</Th></tr></thead>
                <tbody>{m.units.map(u => (
                  <tr key={u.key} className="align-top">
                    <td>{u.list[0]?.plat ? <CellLink to={to('/unit/' + encodeURIComponent(u.list[0].plat))}>{u.key}</CellLink> : u.key}</td>
                    <td className="!whitespace-normal">{[...new Set(u.list.map(r => r.sopir).filter(Boolean))].map(s => <div key={s}><CellLink to={to('/sopir/' + encodeURIComponent(s!))}>{s}</CellLink></div>)}</td>
                    <td>{shortTrp(u.list[0]?.transporter)}</td>
                    <td className="num font-mono">{fmt(u.rit)}</td><td className="num font-mono">{fmt(u.ton, 1)}</td>
                    <td className="!whitespace-normal">
                      <div className="flex flex-wrap gap-1.5">
                        {u.list.map((r: Ritase) => (
                          <button key={r.ritase_key} type="button" onClick={() => nav(to('/ritase/' + encodeURIComponent(r.ritase_key)))}
                            className="text-left border border-line rounded-sm px-2 py-1 bg-surface hover:border-accent text-[11px] leading-tight" title={r.toko || ''}>
                            <span className="font-mono font-semibold" style={{ color: kirimColor(r.jenis_kirim) }}>#{r.rit_ke} {fmtJam(r.selesai_muat)}</span>
                            <span className="block text-soft max-w-[220px] truncate">{r.gudang_asal} → {r.jenis_kirim === 'Gudang → Gudang' ? r.gudang_tujuan : (r.kecamatan || '–')}</span>
                            <span className="font-mono text-faint">{fmt(r.ton, 1)} t · {r.n_stop} titik</span>
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}

      <h2 className="section-title">Tabel harian <span className="n">· klik tanggal untuk rincian</span></h2>
      <TableWrap>
        <table ref={tblRef} className="tbl-dense">
          <thead><tr>
            <Th>Tanggal</Th><Th num>Ritase</Th><Th num>Ton</Th><Th num>Ton/rit</Th><Th num>Unit</Th><Th num>Sopir</Th><Th num>Rit/unit</Th><Th num>Titik</Th><Th num>Toko</Th><Th num>Luar kota</Th>
            {KIRIM.map(k => <Th key={k} num title={k}>{k.replace(' → ', '→')}</Th>)}
          </tr></thead>
          <tbody>{m.rows.filter(r => r.s.rit).map(r => (
            <tr key={r.d} className={cx(p.mode === 'harian' && p.tgl === r.d && '!bg-accent-soft')}>
              <td><button type="button" className="cell-link" onClick={() => p.set({ mode: 'harian', tgl: r.d })}>{fmtDay(r.d)}</button></td>
              <td className="num font-mono">{fmt(r.s.rit)}</td><td className="num font-mono">{fmt(r.s.ton, 1)}</td><td className="num font-mono">{fmt(r.s.tonPerRit, 2)}</td>
              <td className="num font-mono">{fmt(r.s.unit)}</td><td className="num font-mono">{fmt(r.s.sopir)}</td><td className="num font-mono">{fmt(r.s.ritPerUnitHari, 2)}</td>
              <td className="num font-mono">{fmt(r.s.stop)}</td><td className="num font-mono">{fmt(r.s.toko)}</td><td className="num font-mono">{fmt(r.luar)}</td>
              {KIRIM.map(k => <td key={k} className="num font-mono">{r.kir[k] ? fmt(r.kir[k]) : <span className="text-line-strong">–</span>}</td>)}
            </tr>
          ))}</tbody>
          <tfoot><tr className="font-semibold">
            <td>Total {fmt(m.rows.filter(r => r.s.rit).length)} hari</td>
            <td className="num font-mono">{fmt(m.total.rit)}</td><td className="num font-mono">{fmt(m.total.ton, 1)}</td><td className="num font-mono">{fmt(m.total.tonPerRit, 2)}</td>
            <td className="num font-mono">{fmt(m.total.unit)}</td><td className="num font-mono">{fmt(m.total.sopir)}</td><td className="num font-mono">{fmt(m.total.ritPerUnitHari, 2)}</td>
            <td className="num font-mono">{fmt(m.total.stop)}</td><td className="num font-mono">–</td><td className="num font-mono">{fmt(data.ritBulan.filter(r => r.dalam_luar === 'LUAR KOTA').length)}</td>
            {KIRIM.map(k => <td key={k} className="num font-mono">{fmt(data.ritBulan.filter(r => r.jenis_kirim === k).length)}</td>)}
          </tr></tfoot>
        </table>
      </TableWrap>
      <p className="font-mono text-[11px] text-faint mt-3">Kolom Toko = jumlah titik toko (bisa terhitung lebih dari sekali bila toko dikunjungi beberapa ritase). Rit/unit = rata-rata ritase per unit yang beroperasi hari itu.</p>
    </>
  );
}
