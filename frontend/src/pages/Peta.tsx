import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePeriod } from '../lib/period';
import { usePeriodData } from '../lib/usePeriodData';
import { useAsync } from '../lib/hooks';
import { DataSource } from '../lib/data';
import { PALETTE, esc, fmt, kirimColor, shortTrp } from '../lib/format';
import CoverageMap from '../components/CoverageMap';
import { Badge, Card, CellLink, Chips, EmptyBox, ErrorBox, Legend, Note, PageHeader, PageSkeleton, Search, TableWrap, Th, cx, useTo } from '../components/ui';
import type { Stop } from '../lib/types';

type Dim = 'transporter' | 'plat' | 'sopir' | 'gudang_asal' | 'jenis_kirim' | 'dalam_luar';
type Met = 'ton' | 'stop' | 'rit' | 'toko';
const DIMS: { value: Dim; label: string }[] = [
  { value: 'transporter', label: 'Transporter' }, { value: 'plat', label: 'Unit' }, { value: 'sopir', label: 'Sopir' },
  { value: 'gudang_asal', label: 'Gudang asal' }, { value: 'jenis_kirim', label: 'Jenis kirim' }, { value: 'dalam_luar', label: 'Dalam/Luar kota' },
];
const METS: { value: Met; label: string }[] = [{ value: 'ton', label: 'Ton' }, { value: 'stop', label: 'Titik bongkar' }, { value: 'rit', label: 'Ritase' }, { value: 'toko', label: 'Toko' }];
const DETAIL: Partial<Record<Dim, string>> = { transporter: '/transporter/', plat: '/unit/', sopir: '/sopir/', gudang_asal: '/gudang/' };

function metricOf(stops: Stop[], met: Met) {
  const m = new Map<string, { ton: number; stop: number; rit: Set<string>; toko: Set<string> }>();
  stops.forEach(s => {
    if (!s.gid) return;
    if (!m.has(s.gid)) m.set(s.gid, { ton: 0, stop: 0, rit: new Set(), toko: new Set() });
    const v = m.get(s.gid)!; v.ton += s.ton || 0; v.stop++; v.rit.add(s.ritase_key); if (s.cust_code) v.toko.add(s.cust_code);
  });
  const out = new Map<string, number>();
  m.forEach((v, k) => out.set(k, met === 'ton' ? v.ton : met === 'stop' ? v.stop : met === 'rit' ? v.rit.size : v.toko.size));
  return { out, raw: m };
}

export default function Peta() {
  const p = usePeriod();
  const to = useTo();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const dim = (sp.get('dim') as Dim) || 'transporter';
  const sel = sp.get('v') || '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === 'dim') n.delete('v'); setSp(n, { replace: true }); };
  const [met, setMet] = useState<Met>('ton');
  const [q, setQ] = useState('');
  const { data, error } = usePeriodData({ stops: true });
  const gud = useAsync(() => DataSource.gudang(), []);
  const zona = useAsync(() => DataSource.zona(p.cabang), [p.cabang]);

  const m = useMemo(() => {
    if (!data) return null;
    const stops = data.stops.filter(s => s.jenis_kirim !== 'Gudang → Gudang');
    const keyOf = (s: Stop) => (dim === 'plat' ? s.plat_label || s.plat : (s as never)[dim]) as string | null;
    const all = metricOf(stops, met);
    // daftar nilai dimensi
    const vals = new Map<string, { key: string; id: string; stop: number; ton: number; gids: Set<string> }>();
    stops.forEach(s => {
      const k = keyOf(s) || '(kosong)';
      if (!vals.has(k)) vals.set(k, { key: k, id: (dim === 'plat' ? s.plat : k) || k, stop: 0, ton: 0, gids: new Set() });
      const v = vals.get(k)!; v.stop++; v.ton += s.ton || 0; if (s.gid) v.gids.add(s.gid);
    });
    const list = [...vals.values()].sort((a, b) => b.ton - a.ton || b.stop - a.stop);
    const colorOf = new Map(list.map((v, i) => [v.key, dim === 'jenis_kirim' ? kirimColor(v.key) : PALETTE[i % PALETTE.length]]));
    const selStops = sel ? stops.filter(s => keyOf(s) === sel) : stops;
    const selM = metricOf(selStops, met);
    // mode bandingkan: warna = nilai dimensi dominan per kecamatan
    const domName = new Map<string, string>(), dom = new Map<string, string>();
    if (!sel) {
      const by = new Map<string, Map<string, number>>();
      stops.forEach(s => {
        if (!s.gid) return;
        const k = keyOf(s) || '(kosong)';
        if (!by.has(s.gid)) by.set(s.gid, new Map());
        by.get(s.gid)!.set(k, (by.get(s.gid)!.get(k) || 0) + (s.ton || 0) + 0.001);
      });
      by.forEach((mm, gid) => { const b = [...mm.entries()].sort((a, c) => c[1] - a[1])[0][0]; domName.set(gid, b); dom.set(gid, colorOf.get(b) || '#999'); });
    }
    const values = new Map(all.out); selM.out.forEach((v, k) => values.set(k, v));
    const flowsM = new Map<string, number>();
    selStops.forEach(s => { if (s.gid && s.gudang_asal) flowsM.set(s.gudang_asal + '|' + s.gid, (flowsM.get(s.gudang_asal + '|' + s.gid) || 0) + (s.ton || 0) + 0.01); });
    const flows = sel ? [...flowsM.entries()].map(([k, v]) => ({ from: k.split('|')[0], gid: k.split('|')[1], value: v, color: colorOf.get(sel) })) : [];
    // tabel kecamatan
    const kecRows = [...selM.raw.entries()].map(([gid, v]) => {
      const s0 = selStops.find(s => s.gid === gid)!;
      return { gid, kec: s0.kecamatan, kab: s0.kabupaten, ton: v.ton, stop: v.stop, rit: v.rit.size, toko: v.toko.size, ring: s0.ring, dl: s0.dalam_luar };
    }).sort((a, b) => b.ton - a.ton);
    const tanpaGid = stops.filter(s => !s.gid).length;
    return { list, colorOf, selM, values, dom, domName, flows, kecRows, tanpaGid, all };
  }, [data, dim, sel, met]);

  if (error) return <ErrorBox error={error} />;
  if (!data || !m) return <PageSkeleton />;
  const unit = met === 'ton' ? 'ton' : met === 'stop' ? 'titik' : met === 'rit' ? 'ritase' : 'toko';
  const listF = m.list.filter(v => !q || v.key.toUpperCase().includes(q.toUpperCase()));
  const dummyZona = (zona.data || []).some(z => z.is_dummy);
  const selItem = m.list.find(v => v.key === sel);

  return (
    <>
      <PageHeader eyebrow="Wilayah" title="Peta Cakupan" desc="Area layanan digambar sebagai poligon kecamatan (dari Zona Transporter), bukan titik. Pilih dimensi lalu klik salah satu nama: area yang dilayaninya menyala, area lain abu-abu, garis putus-putus = arus dari gudang asal."
        right={<>{dummyZona && <Badge variant="warn">Sebagian zona dummy</Badge>}<Badge variant="warn" title="Koordinat gudang belum diisi data asli">Gudang: koordinat dummy</Badge></>} />

      <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4 items-end">
        <div className="control"><label>Warnai berdasarkan</label><Chips value={dim} onChange={v => set('dim', v)} options={DIMS} label="Dimensi" /></div>
        <div className="control"><label>Ukuran</label><Chips value={met} onChange={setMet} options={METS} label="Metrik" /></div>
      </div>

      <div className="flex gap-4 flex-wrap items-start">
        <Card title={`${DIMS.find(d => d.value === dim)?.label} · ${fmt(m.list.length)}`} className="flex-[0_1_300px] min-w-[260px]">
          <div className="mb-2"><Search value={q} onChange={setQ} placeholder="Cari…" /></div>
          <button type="button" onClick={() => set('v', '')} className={cx('w-full text-left px-2.5 py-2 rounded-sm text-[13px] mb-1 border', !sel ? 'bg-ink text-white border-ink' : 'border-line hover:border-accent')}>
            <b>Bandingkan semua</b><div className={cx('font-mono text-[10.5px]', !sel ? 'text-[#C9C3B4]' : 'text-faint')}>warna = {DIMS.find(d => d.value === dim)?.label.toLowerCase()} dominan per kecamatan</div>
          </button>
          <div className="max-h-[460px] overflow-y-auto flex flex-col gap-1 pr-1">
            {listF.map(v => (
              <button key={v.key} type="button" onClick={() => set('v', v.key === sel ? '' : v.key)}
                className={cx('w-full text-left px-2.5 py-1.5 rounded-sm text-[12.5px] border flex items-center gap-2 transition-colors', v.key === sel ? 'border-accent bg-accent-soft' : 'border-transparent hover:border-line')}>
                <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.colorOf.get(v.key) }} />
                <span className="flex-1 min-w-0"><span className="block truncate font-semibold">{dim === 'transporter' ? shortTrp(v.key) : v.key}</span>
                  <span className="font-mono text-[10.5px] text-faint">{fmt(v.gids.size)} kec · {fmt(v.stop)} titik · {fmt(v.ton, 1)} t</span></span>
              </button>
            ))}
          </div>
        </Card>
        <div className="flex-[1_1_560px] min-w-0">
          {sel && (
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="font-disp uppercase font-extrabold text-xl">{dim === 'transporter' ? shortTrp(sel) : sel} <span className="font-mono text-[12px] font-medium text-soft normal-case">· {fmt(m.selM.out.size)} kecamatan · {fmt([...m.selM.raw.values()].reduce((a, v) => a + v.ton, 0), 1)} ton</span></div>
              {DETAIL[dim] && selItem && <CellLink to={to(DETAIL[dim] + encodeURIComponent(selItem.id))}>Buka detail</CellLink>}
            </div>
          )}
          {!sel && <Legend items={[...new Set(m.domName.values())].map(k => ({ label: dim === 'transporter' ? shortTrp(k) : k, color: m.colorOf.get(k) || '#999' }))} />}
          {m.all.out.size ? (
            <CoverageMap values={m.values} unit={unit} highlight={sel ? new Set(m.selM.out.keys()) : null} categoryColor={sel ? undefined : m.dom}
              flows={m.flows} gudang={(gud.data || []) as never} height={560} fitTo={sel ? 'highlight' : 'values'}
              onClickGid={g => nav(to('/kecamatan/' + encodeURIComponent(g)))}
              tooltip={(g, f) => {
                const v = m.selM.raw.get(g), a = m.all.raw.get(g);
                const head = `<b>${esc(f?.properties.kec)}</b> · ${esc(f?.properties.kab)}`;
                if (sel) return v ? `${head}<br>${esc(sel)}: ${fmt(v.ton, 1)} t · ${v.stop} titik · ${v.toko.size} toko` : `${head}<br>tidak dilayani ${esc(sel)}<br>(total ${fmt(a?.ton || 0, 1)} t oleh pihak lain)`;
                return `${head}<br>Dominan: ${esc(m.domName.get(g))}<br>Total ${fmt(a?.ton || 0, 1)} t · ${a?.stop || 0} titik`;
              }} />
          ) : <EmptyBox>Tidak ada titik bongkar pada periode ini.</EmptyBox>}
          {m.tanpaGid > 0 && <p className="font-mono text-[11px] text-amber mt-2">{fmt(m.tanpaGid)} titik belum terpetakan ke kecamatan (zona belum dicocokkan) — lengkapi di Master Data → Zona.</p>}
        </div>
      </div>

      <h2 className="section-title">Kecamatan {sel ? `dilayani ${dim === 'transporter' ? shortTrp(sel) : sel}` : 'tujuan'} <span className="n">· {fmt(m.kecRows.length)}</span></h2>
      <TableWrap>
        <table className="tbl-dense">
          <thead><tr><Th>Kecamatan</Th><Th>Kabupaten/Kota</Th><Th>Dalam/Luar</Th><Th num>Ring</Th><Th num>Ritase</Th><Th num>Titik</Th><Th num>Toko</Th><Th num>Ton</Th></tr></thead>
          <tbody>{m.kecRows.map(r => (
            <tr key={r.gid}><td><CellLink to={to('/kecamatan/' + encodeURIComponent(r.gid))}>{r.kec}</CellLink></td><td>{r.kab}</td><td>{r.dl}</td><td className="num font-mono">{r.ring ?? '–'}</td>
              <td className="num font-mono">{fmt(r.rit)}</td><td className="num font-mono">{fmt(r.stop)}</td><td className="num font-mono">{fmt(r.toko)}</td><td className="num font-mono">{fmt(r.ton, 1)}</td></tr>
          ))}</tbody>
        </table>
      </TableWrap>
      <div className="mt-4"><Note tone="info">Poligon = batas kecamatan GADM 4.1 (disederhanakan). Zona transporter seperti “KEC. SUNGAI RAYA - RING 1.0” dicocokkan otomatis ke kecamatan; Jongkat dipetakan ke Kec. Siantan (Mempawah). Ring tidak punya batas resmi, jadi ring 1/2/3 di kecamatan yang sama digambar pada poligon yang sama. Untuk cakupan per ring yang presisi dibutuhkan data batas ring/desa dari tim logistik.</Note></div>
    </>
  );
}
