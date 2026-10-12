import { useEffect, useMemo, useState } from 'react';
import { usePeriod } from '../lib/period';
import { DataSource, clearCache, rpcHint } from '../lib/data';
import { useAsync } from '../lib/hooks';
import { esc, fmt } from '../lib/format';
import { loadKecIndex, type KecIndex } from '../lib/geo';
import { autoPetakanZona } from './Import';
import CoverageMap from '../components/CoverageMap';
import { Badge, Control, ErrorBox, Loading, Note, PageHeader, Search, TableWrap, Tabs, Th, cx, usePager } from '../components/ui';
import type { Row } from '../lib/types';

type Tab = 'zona' | 'produk' | 'transporter' | 'gudang';

/** Tabel master yang bisa diedit + simpan ber-PIN. */
function useEditor(rows: Row[] | null, keyOf: (r: Row) => string) {
  const [edits, setEdits] = useState<Record<string, Row>>({});
  useEffect(() => setEdits({}), [rows]);
  const get = (r: Row) => ({ ...r, ...(edits[keyOf(r)] || {}) });
  const set = (r: Row, patch: Row) => setEdits(e => ({ ...e, [keyOf(r)]: { ...(e[keyOf(r)] || {}), ...patch } }));
  const dirty = (rows || []).filter(r => edits[keyOf(r)]).map(get);
  return { get, set, dirty, reset: () => setEdits({}) };
}

function SaveBar({ n, onSave, pin, setPin }: { n: number; onSave: (pin: string) => Promise<void>; pin: string; setPin: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <div className="sticky bottom-0 z-[500] bg-bg/95 backdrop-blur border-t border-line py-3 mt-4 flex flex-wrap items-end gap-3">
      <Control label="PIN"><input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN" /></Control>
      <button type="button" className="btn btn-primary" disabled={!n || !pin || busy} onClick={async () => {
        setBusy(true); setMsg(null);
        try { await onSave(pin); setMsg({ ok: true, t: `${n} baris tersimpan.` }); } catch (e) { setMsg({ ok: false, t: rpcHint(e) }); } finally { setBusy(false); }
      }}>{busy ? 'Menyimpan…' : `Simpan ${n} perubahan`}</button>
      {msg && <span className={cx('text-[12.5px]', msg.ok ? 'text-green' : 'text-red')}>{msg.t}</span>}
    </div>
  );
}

function ZonaTab({ cabang }: { cabang: string }) {
  const [pin, setPin] = useState('');
  const [n, setN] = useState(0);
  const st = useAsync(() => { clearCache(); return DataSource.zona(cabang); }, [cabang, n]);
  const idx = useAsync(() => loadKecIndex(), []);
  const cab = useAsync(() => DataSource.cabang(), []);
  const ed = useEditor(st.data, r => r.cabang + '|' + r.zone_code);
  const [q, setQ] = useState('');
  const [auto, setAuto] = useState<string | null>(null);
  const prov = ((cab.data || []).find(c => c.kode === cabang)?.provinsi as string[]) || [];
  const pool = useMemo(() => (idx.data || []).filter(k => !prov.length || prov.includes(k.prov)), [idx.data, prov.join()]);
  const rows = (st.data || []).filter(r => !q || (r.zone_name + r.zone_code + (r.kecamatan || '')).toUpperCase().includes(q.toUpperCase()));
  const pick = (r: Row, gid: string) => {
    const k = pool.find(x => x.gid === gid) as KecIndex | undefined;
    if (!k) { ed.set(r, { gid: null, kabupaten: null, provinsi: null, lat: null, lng: null, match_status: 'belum' }); return; }
    ed.set(r, { gid: k.gid, kecamatan: r.kecamatan || k.kec, kabupaten: k.kab, provinsi: k.prov, lat: k.lat, lng: k.lng, match_status: 'manual' });
  };
  const values = useMemo(() => { const m = new Map<string, number>(); (st.data || []).forEach(r => { const g = ed.get(r).gid; if (g) m.set(g, (m.get(g) || 0) + Number(r.n_baris || 0)); }); return m; }, [st.data, ed]);
  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data || !idx.data) return <Loading />;
  const belum = st.data.filter(r => !r.gid).length;
  return (
    <>
      <Note tone="info">Setiap <b>Zone Trans Code</b> dipetakan ke satu poligon kecamatan (GADM). Pemetaan otomatis memakai nama kecamatan di nama zona; bila ada nama ganda, dipilih yang paling dekat area layanan cabang. Ubah manual bila salah; centang <i>dummy</i> bila pemetaan hanya perkiraan.</Note>
      <div className="flex gap-4 flex-wrap items-start mt-4">
        <div className="flex-[2_1_620px] min-w-0">
          <div className="controls">
            <Search value={q} onChange={setQ} placeholder="Cari zona/kecamatan…" />
            {belum > 0 && <button type="button" className="btn self-end" onClick={async () => { try { const r = await autoPetakanZona(pin, cabang); setAuto(`${r.cocok}/${r.total} zona terpetakan.${r.gagal.length ? ' Belum: ' + r.gagal.join(', ') : ''}`); setN(x => x + 1); } catch (e) { setAuto(rpcHint(e)); } }}>Petakan otomatis {belum} zona (pakai PIN di bawah)</button>}
            {auto && <span className="text-[12.5px] self-center">{auto}</span>}
          </div>
          <TableWrap maxH={560}><table className="tbl-dense">
            <thead><tr><Th>Kode</Th><Th>Nama zona</Th><Th num>Baris</Th><Th>Kecamatan peta (GADM)</Th><Th>Kab/Kota</Th><Th>Status</Th><Th>Dummy</Th></tr></thead>
            <tbody>{rows.map(r0 => {
              const r = ed.get(r0);
              return (
                <tr key={r.zone_code} className={cx(ed.dirty.some(d => d.zone_code === r.zone_code) && '!bg-amber-soft')}>
                  <td className="font-mono">{r.zone_code}</td><td className="!whitespace-normal min-w-[180px]">{r.zone_name}{r.catatan && <div className="text-[10.5px] text-faint">{r.catatan}</div>}</td>
                  <td className="num font-mono">{fmt(r.n_baris)}</td>
                  <td><select value={r.gid || ''} onChange={e => pick(r0, e.target.value)} className="!min-w-[220px] !py-1 !text-[12px]">
                    <option value="">— belum dipetakan —</option>
                    {pool.map(k => <option key={k.gid} value={k.gid}>{k.kec} · {k.kab}</option>)}
                  </select></td>
                  <td>{r.kabupaten || '–'}</td>
                  <td><Badge variant={r.gid ? (r.match_status === 'manual' ? 'online' : 'good') : 'bad'}>{r.gid ? r.match_status : 'belum'}</Badge></td>
                  <td><input type="checkbox" checked={!!r.is_dummy} onChange={e => ed.set(r0, { is_dummy: e.target.checked })} aria-label="dummy" /></td>
                </tr>
              );
            })}</tbody>
          </table></TableWrap>
        </div>
        <div className="flex-[1_1_360px] min-w-0">
          <div className="card-title mb-2">Pratinjau poligon (warna = jumlah baris data)</div>
          <CoverageMap values={values} unit="baris" height={520} tooltip={(g, f) => `<b>${esc(f?.properties.kec)}</b> · ${esc(f?.properties.kab)}<br>${(st.data || []).filter(r => ed.get(r).gid === g).map(r => esc(r.zone_name)).join('<br>')}`} />
        </div>
      </div>
      <SaveBar n={ed.dirty.length} pin={pin} setPin={setPin} onSave={async pin => { await DataSource.masterSimpan(pin, 'zona', ed.dirty.map(d => ({ cabang: d.cabang, zone_code: d.zone_code, zone_name: d.zone_name, kecamatan: d.kecamatan, ring: d.ring, gid: d.gid, kabupaten: d.kabupaten, provinsi: d.provinsi, lat: d.lat, lng: d.lng, match_status: d.match_status, catatan: d.catatan, is_dummy: d.is_dummy }))); clearCache(); setN(x => x + 1); }} />
    </>
  );
}

function ProdukTab() {
  const [pin, setPin] = useState('');
  const [n, setN] = useState(0);
  const st = useAsync(() => { clearCache(); return DataSource.produk(); }, [n]);
  const ed = useEditor(st.data, r => r.product_code);
  const [q, setQ] = useState('');
  const [kat, setKat] = useState('');
  const rows = (st.data || []).filter(r => (!kat || r.kategori === kat) && (!q || (r.product_name + r.product_code + (r.lini || '') + (r.kelompok || '')).toUpperCase().includes(q.toUpperCase())));
  const { view, Pager } = usePager(rows, 80);
  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data) return <Loading />;
  const inp = 'max-w-[150px] !min-w-0 !py-1 !text-[12px]';
  return (
    <>
      <Note tone="info">Tonase dihitung dari <b>kategori SEMEN</b> × <b>berat per unit</b> (zak 50 kg = 0,05 ton; 40 kg = 0,04 ton; curah satuan TON = 1). Produk non-semen dihitung dalam pcs per kelompok. Baris “otomatis” hasil tebakan sistem; ubah bila keliru.</Note>
      <div className="controls mt-4">
        <Search value={q} onChange={setQ} placeholder="Cari produk…" />
        <Control label="Kategori"><select value={kat} onChange={e => setKat(e.target.value)}><option value="">Semua</option><option>SEMEN</option><option>NON SEMEN</option></select></Control>
      </div>
      <TableWrap><table className="tbl-dense">
        <thead><tr><Th>Kode</Th><Th>Nama</Th><Th>Kategori</Th><Th>Lini (semen)</Th><Th>Kelompok (non-semen)</Th><Th>Satuan</Th><Th num>kg / unit</Th><Th num>Baris</Th><Th>Sumber</Th></tr></thead>
        <tbody>{view.map(r0 => {
          const r = ed.get(r0);
          const setKg = (kg: string, sat = r.satuan) => { const v = kg === '' ? null : Number(kg); ed.set(r0, { kg_per_unit: v, ton_per_unit: sat === 'TON' ? 1 : v != null ? v / 1000 : null }); };
          return (
            <tr key={r.product_code} className={cx(ed.dirty.some(d => d.product_code === r.product_code) && '!bg-amber-soft')}>
              <td className="font-mono">{r.product_code}</td><td className="!whitespace-normal min-w-[200px]">{r.product_name}</td>
              <td><select className={inp} value={r.kategori} onChange={e => ed.set(r0, { kategori: e.target.value })}><option>SEMEN</option><option>NON SEMEN</option></select></td>
              <td><input className={inp} type="text" value={r.lini || ''} onChange={e => ed.set(r0, { lini: e.target.value || null })} disabled={r.kategori !== 'SEMEN'} /></td>
              <td><input className={inp} type="text" value={r.kelompok || ''} onChange={e => ed.set(r0, { kelompok: e.target.value || null })} disabled={r.kategori === 'SEMEN'} /></td>
              <td><select className={inp} value={r.satuan} onChange={e => { ed.set(r0, { satuan: e.target.value }); setKg(String(r.kg_per_unit ?? ''), e.target.value); }}><option>ZAK</option><option>TON</option><option>PCS</option></select></td>
              <td className="num"><input className={inp + ' !w-[80px] text-right'} type="number" value={r.kg_per_unit ?? ''} onChange={e => setKg(e.target.value)} disabled={r.satuan === 'TON'} /></td>
              <td className="num font-mono">{fmt(r.n_baris)}</td>
              <td>{r.is_auto ? <Badge>otomatis</Badge> : <Badge variant="online">manual</Badge>}</td>
            </tr>
          );
        })}</tbody>
      </table></TableWrap>
      <Pager />
      <SaveBar n={ed.dirty.length} pin={pin} setPin={setPin} onSave={async pin => { await DataSource.masterSimpan(pin, 'produk', ed.dirty.map(d => ({ product_code: d.product_code, product_name: d.product_name, kategori: d.kategori, lini: d.lini, kelompok: d.kelompok, satuan: d.satuan, kg_per_unit: d.kg_per_unit, ton_per_unit: d.ton_per_unit }))); clearCache(); setN(x => x + 1); }} />
    </>
  );
}

function TransporterTab({ cabang }: { cabang: string }) {
  const [pin, setPin] = useState('');
  const [n, setN] = useState(0);
  const st = useAsync(async () => { clearCache(); const [t, d] = await Promise.all([DataSource.transporter(), DataSource.dimTransporter(cabang)]); return t.map(x => ({ ...x, ...(d.find(y => y.transporter === x.nama) || {}) })); }, [n, cabang]);
  const ed = useEditor(st.data, r => r.nama);
  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data) return <Loading />;
  const inp = '!min-w-0 !py-1 !text-[12px]';
  return (
    <>
      <Note tone="info"><b>Data yang dibutuhkan:</b> kontrak/area layanan resmi tiap transporter (kecamatan/kota yang menjadi cakupan kontraknya), jenis (perusahaan/perorangan/armada sendiri), dan grup (mis. “PT. LINTAS ABADI MAKMUR (LAM)” dan “… - TRUCKING” satu grup). Saat ini cakupan di peta = cakupan <i>aktual</i> dari data pengiriman.</Note>
      <TableWrap className="mt-4"><table className="tbl-dense">
        <thead><tr><Th>Nama (sesuai data)</Th><Th>Grup</Th><Th>Jenis</Th><Th>Kontak</Th><Th>Catatan</Th><Th num>Ritase</Th><Th num>Unit</Th><Th num>Sopir</Th></tr></thead>
        <tbody>{st.data.map(r0 => {
          const r = ed.get(r0);
          return (
            <tr key={r.nama} className={cx(ed.dirty.some(d => d.nama === r.nama) && '!bg-amber-soft')}>
              <td className="font-semibold">{r.nama}</td>
              <td><input className={inp + ' w-[200px]'} type="text" value={r.grup || ''} onChange={e => ed.set(r0, { grup: e.target.value || null })} /></td>
              <td><select className={inp} value={r.jenis || ''} onChange={e => ed.set(r0, { jenis: e.target.value || null })}><option value="">–</option><option>Perusahaan</option><option>Perorangan</option><option>Ekspedisi</option><option>Armada Internal</option></select></td>
              <td><input className={inp + ' w-[140px]'} type="text" value={r.kontak || ''} onChange={e => ed.set(r0, { kontak: e.target.value || null })} /></td>
              <td><input className={inp + ' w-[220px]'} type="text" value={r.catatan || ''} onChange={e => ed.set(r0, { catatan: e.target.value || null })} /></td>
              <td className="num font-mono">{fmt(r.n_ritase)}</td><td className="num font-mono">{fmt(r.n_unit)}</td><td className="num font-mono">{fmt(r.n_sopir)}</td>
            </tr>
          );
        })}</tbody>
      </table></TableWrap>
      <SaveBar n={ed.dirty.length} pin={pin} setPin={setPin} onSave={async pin => { await DataSource.masterSimpan(pin, 'transporter', ed.dirty.map(d => ({ nama: d.nama, grup: d.grup, jenis: d.jenis, warna: d.warna, kontak: d.kontak, catatan: d.catatan }))); clearCache(); setN(x => x + 1); }} />
    </>
  );
}

function GudangTab() {
  const [pin, setPin] = useState('');
  const [n, setN] = useState(0);
  const st = useAsync(() => { clearCache(); return DataSource.gudang(); }, [n]);
  const ed = useEditor(st.data, r => r.nama);
  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data) return <Loading />;
  const inp = '!min-w-0 !py-1 !text-[12px]';
  const pins = st.data.map(ed.get).map(g => ({ nama: g.nama, lat: g.lat == null ? null : Number(g.lat), lng: g.lng == null ? null : Number(g.lng), is_dummy: g.is_dummy, jenis: g.jenis }));
  return (
    <>
      <Note tone="warn">Koordinat gudang saat ini <b>dummy</b> (perkiraan lokasi Bumiraya, Wajok, dan titik virtual). Mohon isi koordinat asli (bisa salin dari Google Maps: klik kanan → koordinat) lalu hapus centang dummy.</Note>
      <div className="flex gap-4 flex-wrap items-start mt-4">
        <div className="flex-[2_1_560px] min-w-0">
          <TableWrap><table className="tbl-dense">
            <thead><tr><Th>Gudang</Th><Th>Jenis</Th><Th>Alamat</Th><Th>Lat</Th><Th>Lng</Th><Th>Dummy</Th></tr></thead>
            <tbody>{st.data.map(r0 => {
              const r = ed.get(r0);
              return (
                <tr key={r.nama} className={cx(ed.dirty.some(d => d.nama === r.nama) && '!bg-amber-soft')}>
                  <td className="font-semibold">{r.nama}</td>
                  <td><input className={inp + ' w-[150px]'} type="text" value={r.jenis || ''} onChange={e => ed.set(r0, { jenis: e.target.value || null })} /></td>
                  <td><input className={inp + ' w-[200px]'} type="text" value={r.alamat || ''} onChange={e => ed.set(r0, { alamat: e.target.value || null })} /></td>
                  <td><input className={inp + ' w-[100px]'} type="number" step="0.0001" value={r.lat ?? ''} onChange={e => ed.set(r0, { lat: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                  <td><input className={inp + ' w-[100px]'} type="number" step="0.0001" value={r.lng ?? ''} onChange={e => ed.set(r0, { lng: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                  <td><input type="checkbox" checked={!!r.is_dummy} onChange={e => ed.set(r0, { is_dummy: e.target.checked })} aria-label="dummy" /></td>
                </tr>
              );
            })}</tbody>
          </table></TableWrap>
        </div>
        <div className="flex-[1_1_360px] min-w-0"><CoverageMap values={new Map()} gudang={pins} height={360} baseProvinces={['IDN_12_1']} /></div>
      </div>
      <SaveBar n={ed.dirty.length} pin={pin} setPin={setPin} onSave={async pin => { await DataSource.masterSimpan(pin, 'gudang', ed.dirty.map(d => ({ nama: d.nama, jenis: d.jenis, cabang: d.cabang, alamat: d.alamat, lat: d.lat, lng: d.lng, is_dummy: d.is_dummy }))); clearCache(); setN(x => x + 1); }} />
    </>
  );
}

export default function Master() {
  const p = usePeriod();
  const [tab, setTab] = useState<Tab>('zona');
  const cabang = p.cabang || p.cabangList[0] || '';
  return (
    <>
      <PageHeader eyebrow="Data" title="Master Data" desc={`Nilai unik penting yang diekstrak otomatis dari data (lewat view database) dan bisa dilengkapi: pemetaan zona → kecamatan, klasifikasi produk, transporter, dan koordinat gudang.${p.cabang ? '' : ' Zona ditampilkan untuk cabang ' + cabang + '.'}`} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'zona', label: 'Zona → Peta' }, { value: 'produk', label: 'Produk' }, { value: 'transporter', label: 'Transporter' }, { value: 'gudang', label: 'Gudang' }]} />
      {tab === 'zona' && <ZonaTab cabang={cabang} />}
      {tab === 'produk' && <ProdukTab />}
      {tab === 'transporter' && <TransporterTab cabang={cabang} />}
      {tab === 'gudang' && <GudangTab />}
    </>
  );
}
