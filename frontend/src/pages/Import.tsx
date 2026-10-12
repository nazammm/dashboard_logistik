import { useMemo, useState } from 'react';
import { DataSource, clearCache, rpcHint } from '../lib/data';
import { useAsync } from '../lib/hooks';
import { fmt, fmtDate } from '../lib/format';
import { COLUMN_MAP, J028_FIELDS, REQUIRED, buildJ028Rows, guessISO, guessJ028Mapping, parseWorkbook, readSheetGrid, type ParsedFile } from '../lib/importParser';
import { loadKecIndex, matchZona } from '../lib/geo';
import { Badge, Card, Control, ErrorBox, KV, Note, PageHeader, TableWrap, Tabs, Th } from '../components/ui';
import type { Row } from '../lib/types';

type Tab = 'logistik' | 'j028' | 'riwayat';
const CHUNK = 400;

function PinInput({ pin, setPin }: { pin: string; setPin: (v: string) => void }) {
  return <Control label="PIN import"><input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN" autoComplete="current-password" /></Control>;
}

/** Cocokkan zona yang belum punya poligon ke kecamatan GADM, lalu simpan. Dipakai setelah import & dari Master Data. */
export async function autoPetakanZona(pin: string, cabang: string): Promise<{ total: number; cocok: number; gagal: string[] }> {
  clearCache();
  const [zonas, cabs, index] = await Promise.all([DataSource.zona(cabang), DataSource.cabang(), loadKecIndex()]);
  const todo = zonas.filter(z => !z.gid);
  if (!todo.length) return { total: 0, cocok: 0, gagal: [] };
  const prov = (cabs.find(c => c.kode === cabang)?.provinsi as string[]) || [];
  // pusat area dari zona yang sudah terpetakan membantu memilih kecamatan bernama sama
  const known = zonas.filter(z => z.gid).map(z => ({ zone_code: z.zone_code, zone_name: z.zone_name, kecamatan: z.kecamatan, bobot: z.n_baris || 1 }));
  const res = matchZona([...known, ...todo.map(z => ({ zone_code: z.zone_code, zone_name: z.zone_name, bobot: z.n_baris || 1 }))], index, prov)
    .filter(r => todo.some(t => t.zone_code === r.zone_code));
  const ok = res.filter(r => r.gid);
  if (ok.length) await DataSource.masterSimpan(pin, 'zona', ok.map(r => ({ cabang, zone_code: r.zone_code, zone_name: r.zone_name, kecamatan: r.kecamatan, ring: r.ring, gid: r.gid, kabupaten: r.kabupaten, provinsi: r.provinsi, lat: r.lat, lng: r.lng, match_status: r.match_status, catatan: r.catatan, is_dummy: false })));
  clearCache();
  return { total: todo.length, cocok: ok.length, gagal: res.filter(r => !r.gid).map(r => r.zone_name || r.zone_code) };
}

function ImportLogistik() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [cabang, setCabang] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Row | null>(null);
  const add = (s: string) => setLog(l => [...l, s]);

  const onFile = async (f: File | null) => {
    setFile(f); setParsed(null); setErr(null); setHasil(null); setLog([]);
    if (!f) return;
    try {
      const p = parseWorkbook(new Uint8Array(await f.arrayBuffer()));
      setParsed(p); setCabang(p.cabangTebakan || '');
    } catch (e) { setErr('Gagal membaca file: ' + (e instanceof Error ? e.message : String(e))); }
  };

  const jalankan = async () => {
    if (!parsed || !file) return;
    setBusy(true); setErr(null); setLog([]); setHasil(null);
    try {
      await DataSource.cekPin(pin);
      add(`Mulai import ${fmt(parsed.rows.length)} baris, cabang ${cabang}, ${parsed.tglMin} s.d. ${parsed.tglMax}. Data lama cabang ini di rentang tanggal yang sama diganti.`);
      const batch = await DataSource.importMulai(pin, cabang, file.name, parsed.tglMin!, parsed.tglMax!);
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const n = await DataSource.importBaris(pin, batch, parsed.rows.slice(i, i + CHUNK));
        add(`Baris ${fmt(i + 1)}–${fmt(i + n)} tersimpan`);
      }
      const r = await DataSource.importSelesai(pin, batch);
      add('Selesai. Master produk/zona/transporter/gudang diperbarui otomatis.');
      if (Number(r.zona_belum_dipetakan) > 0) {
        add(`Memetakan ${r.zona_belum_dipetakan} zona baru ke peta kecamatan…`);
        const z = await autoPetakanZona(pin, cabang);
        add(`${z.cocok}/${z.total} zona terpetakan otomatis.${z.gagal.length ? ' Belum cocok: ' + z.gagal.join(', ') + ' (atur manual di Master Data → Zona).' : ''}`);
      }
      setHasil(r); clearCache();
    } catch (e) { setErr(rpcHint(e)); } finally { setBusy(false); }
  };

  const req = REQUIRED.filter(k => parsed?.missingRequired.includes(k));
  return (
    <>
      <Note tone="info">Upload file Excel logistik (format sama dengan <i>Logistik_PTK_Jan.xlsx</i>, 46 kolom). Satu file = satu cabang. Import bersifat <b>ganti</b>: baris lama cabang tersebut pada rentang tanggal file dihapus dulu, jadi aman diimport ulang (tidak dobel). Kolom tanggal boleh berupa tanggal Excel, “dd/mm/yyyy”, atau “21 Jan 2026 13:59:05”.</Note>
      <div className="controls mt-5">
        <Control label="File Excel (.xlsx)"><input type="file" accept=".xlsx,.xls" onChange={e => onFile(e.target.files?.[0] || null)} /></Control>
      </div>
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}
      {parsed && (
        <div className="flex gap-4 flex-wrap items-start">
          <Card title="Pratinjau" className="flex-[1_1_360px]">
            <KV rows={[['Sheet', parsed.sheetName], ['Baris valid', fmt(parsed.rows.length)], ['Baris dilewati', parsed.invalid ? <span className="text-amber">{fmt(parsed.invalid)} (tanpa Order Date / FOAD)</span> : '0'],
              ['Rentang Order Date', `${fmtDate(parsed.tglMin)} – ${fmtDate(parsed.tglMax)}`], ['Kolom dikenali', `${Object.keys(parsed.mapped).length} dari ${Object.keys(COLUMN_MAP).length}`],
              ['Kolom wajib hilang', req.length ? <span className="text-red">{req.join(', ')}</span> : 'tidak ada'], ['Kolom tak dikenal', parsed.unmapped.join(', ') || '–']]} />
          </Card>
          <Card title="Simpan ke database" className="flex-[1_1_320px]">
            <div className="flex flex-col gap-3">
              <Control label="Kode cabang" hint={parsed.cabangTebakan ? `Tebakan dari kode salesman: ${parsed.cabangTebakan}` : 'Isi kode cabang, mis. PTK'}>
                <input type="text" value={cabang} onChange={e => setCabang(e.target.value.toUpperCase())} maxLength={10} />
              </Control>
              <PinInput pin={pin} setPin={setPin} />
              <button type="button" className="btn btn-primary self-start" disabled={busy || !cabang || !pin || req.length > 0 || !parsed.rows.length || !parsed.tglMin} onClick={jalankan}>
                {busy ? 'Mengimport…' : `Import ${fmt(parsed.rows.length)} baris`}
              </button>
            </div>
          </Card>
        </div>
      )}
      {log.length > 0 && <pre className="mt-4 bg-ink text-[#EDE9DF] font-mono text-[11.5px] p-4 rounded max-h-[260px] overflow-auto whitespace-pre-wrap">{log.join('\n')}</pre>}
      {hasil && <div className="mt-4"><Note tone="info"><b>Berhasil.</b> {fmt(hasil.baris)} baris · {fmt(hasil.ritase)} ritase · {fmt(hasil.sj)} SJ. Produk baru: {hasil.produk_baru}, zona baru: {hasil.zona_baru}, transporter baru: {hasil.transporter_baru}. <button type="button" className="btn btn-primary ml-2" onClick={() => { sessionStorage.removeItem('lg_period'); window.location.assign(import.meta.env.BASE_URL + 'ringkasan'); }}>Buka dashboard →</button></Note></div>}
    </>
  );
}

function ImportJ028() {
  const [grid, setGrid] = useState<{ sheet: string; header: string[]; rows: unknown[][] } | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [fname, setFname] = useState('');
  const [cabang, setCabang] = useState('PTK');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rows = useMemo(() => (grid ? buildJ028Rows(grid.rows, map) : []), [grid, map]);
  const onFile = async (f: File | null) => {
    setGrid(null); setErr(null); setMsg(null);
    if (!f) return;
    try { const g = readSheetGrid(await f.arrayBuffer()); setGrid(g); setMap(guessJ028Mapping(g.header)); setFname(f.name); }
    catch (e) { setErr('Gagal membaca file: ' + (e instanceof Error ? e.message : String(e))); }
  };
  const simpan = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await DataSource.j028Simpan(pin, cabang, fname, rows.map(x => ({ ...x, do_date: x.do_date && /^\d+(\.\d+)?$/.test(x.do_date) ? guessISO(x.do_date) : x.do_date })));
      setMsg(`Tersimpan ${fmt(r.baris)} baris DO J028 (${fmt(r.dihapus)} baris lama/dummy diganti).`); clearCache();
    } catch (e) { setErr(rpcHint(e)); } finally { setBusy(false); }
  };
  const missing = J028_FIELDS.filter(f => f.required && (map[f.key] == null || map[f.key] < 0));
  return (
    <>
      <Note tone="info">Format J028 belum saya ketahui, jadi kolomnya dipetakan manual: pilih kolom Excel untuk setiap isian (sudah ditebak otomatis). Minimal <b>No. DO</b> dan <b>Qty</b>; sertakan <b>Kode Produk</b> agar rekon per produk akurat. Data J028 dummy cabang ini akan dihapus saat file asli disimpan.</Note>
      <div className="controls mt-5"><Control label="File J028 (.xlsx/.csv)"><input type="file" accept=".xlsx,.xls,.csv" onChange={e => onFile(e.target.files?.[0] || null)} /></Control></div>
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}
      {grid && (
        <>
          <Card title={`Pemetaan kolom · sheet ${grid.sheet}`}>
            <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              {J028_FIELDS.map(f => (
                <Control key={f.key} label={f.label + (f.required ? ' *' : '')}>
                  <select value={map[f.key] ?? -1} onChange={e => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                    <option value={-1}>— tidak ada —</option>
                    {grid.header.map((h, i) => <option key={i} value={i}>{h || `(kolom ${i + 1})`}</option>)}
                  </select>
                </Control>
              ))}
            </div>
          </Card>
          <h3 className="mt-6 mb-2 text-lg">Pratinjau ({fmt(rows.length)} baris)</h3>
          <TableWrap maxH={300}><table className="tbl-dense">
            <thead><tr>{J028_FIELDS.map(f => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
            <tbody>{rows.slice(0, 15).map((r, i) => <tr key={i}>{J028_FIELDS.map(f => <td key={f.key}>{r[f.key] ?? ''}</td>)}</tr>)}</tbody>
          </table></TableWrap>
          <div className="controls mt-4">
            <Control label="Cabang"><input type="text" value={cabang} onChange={e => setCabang(e.target.value.toUpperCase())} /></Control>
            <PinInput pin={pin} setPin={setPin} />
            <button type="button" className="btn btn-primary self-end" disabled={busy || !pin || !rows.length || missing.length > 0} onClick={simpan}>{busy ? 'Menyimpan…' : 'Simpan J028'}</button>
          </div>
          {missing.length > 0 && <p className="text-red text-[12.5px]">Wajib dipetakan: {missing.map(f => f.label).join(', ')}</p>}
          {msg && <Note tone="info">{msg}</Note>}
        </>
      )}
    </>
  );
}

function Riwayat() {
  const [n, setN] = useState(0);
  const st = useAsync(() => { clearCache(); return DataSource.batches(); }, [n]);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const hapus = async (id: number) => {
    if (!confirm(`Hapus semua baris dari batch #${id}? Tidak bisa dibatalkan.`)) return;
    try { await DataSource.importHapus(pin, id); setN(x => x + 1); } catch (e) { setErr(rpcHint(e)); }
  };
  const [pl, setPl] = useState(''); const [pb, setPb] = useState(''); const [pmsg, setPmsg] = useState('');
  const gantiPin = async () => { try { await DataSource.gantiPin(pl, pb); setPmsg('PIN diganti.'); setPl(''); setPb(''); } catch (e) { setPmsg(rpcHint(e)); } };
  if (st.error) return <ErrorBox error={st.error} />;
  return (
    <>
      {err && <div className="mb-3"><ErrorBox error={err} /></div>}
      <div className="controls"><PinInput pin={pin} setPin={setPin} /></div>
      <TableWrap><table className="tbl-dense">
        <thead><tr><Th>#</Th><Th>Waktu</Th><Th>Cabang</Th><Th>Jenis</Th><Th>File</Th><Th>Rentang</Th><Th num>Baris</Th><Th num>Diganti</Th><Th>Status</Th><Th></Th></tr></thead>
        <tbody>{(st.data || []).map(b => (
          <tr key={b.id}><td className="font-mono">{b.id}</td><td className="font-mono">{String(b.created_at || '').slice(0, 16).replace('T', ' ')}</td><td>{b.cabang}</td><td>{b.jenis}</td>
            <td className="max-w-[220px] truncate" title={b.filename}>{b.filename}</td><td className="font-mono">{b.tgl_dari ? `${fmtDate(b.tgl_dari, false)} – ${fmtDate(b.tgl_sampai, false)}` : '–'}</td>
            <td className="num font-mono">{fmt(b.n_baris)}</td><td className="num font-mono">{fmt(b.n_dihapus)}</td>
            <td><Badge variant={b.status === 'selesai' ? 'good' : b.status === 'dihapus' ? 'neutral' : 'warn'}>{b.status}</Badge></td>
            <td>{b.status !== 'dihapus' && <button type="button" className="chip" disabled={!pin} onClick={() => hapus(b.id)}>Hapus</button>}</td></tr>
        ))}</tbody>
      </table></TableWrap>
      <Card title="Ganti PIN" className="mt-6 max-w-[560px]">
        <div className="controls !mb-0">
          <Control label="PIN lama"><input type="password" value={pl} onChange={e => setPl(e.target.value)} /></Control>
          <Control label="PIN baru (min 6)"><input type="password" value={pb} onChange={e => setPb(e.target.value)} /></Control>
          <button type="button" className="btn self-end" disabled={!pl || pb.length < 6} onClick={gantiPin}>Ganti</button>
        </div>
        {pmsg && <p className="text-[12.5px] mt-2">{pmsg}</p>}
      </Card>
    </>
  );
}

export default function Import() {
  const [tab, setTab] = useState<Tab>('logistik');
  return (
    <>
      <PageHeader eyebrow="Data" title="Import Data" desc="Tambah data cabang/bulan baru dari Excel, upload daftar DO J028 untuk rekon, dan lihat riwayat import. Semua penulisan data memakai PIN (bisa diganti)." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'logistik', label: 'Data logistik' }, { value: 'j028', label: 'DO J028' }, { value: 'riwayat', label: 'Riwayat & PIN' }]} />
      {tab === 'logistik' && <ImportLogistik />}
      {tab === 'j028' && <ImportJ028 />}
      {tab === 'riwayat' && <Riwayat />}
    </>
  );
}
