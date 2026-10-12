// Poligon kecamatan (GADM 4.1, disederhanakan) disajikan statis per provinsi di /geo/prov/<GID_1>.json.
// Pencocokan Zona Transporter ("KEC. X - RING n") -> kecamatan GADM ada di matchZona() (dipakai halaman Import & Master,
// juga dipakai untuk pemuatan awal data).

export interface KecIndex { gid: string; prov: string; kab: string; kec: string; lat: number; lng: number }
export interface GeoFeature { type: 'Feature'; properties: { gid: string; kec: string; kab: string }; geometry: { type: string; coordinates: unknown } }
export interface GeoCollection { type: 'FeatureCollection'; features: GeoFeature[] }

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const provCache = new Map<string, Promise<GeoCollection>>();
let indexCache: Promise<KecIndex[]> | null = null;

/** 'IDN.12.6.11_1' -> 'IDN_12_1' (file provinsi) */
export const provFileOf = (gid: string) => { const p = gid.split('.'); return p.length >= 2 ? `${p[0]}_${p[1].replace(/_.*/, '')}_1` : ''; };

export function loadProvince(file: string): Promise<GeoCollection> {
  if (!provCache.has(file)) {
    provCache.set(file, fetch(`${BASE}geo/prov/${file}.json`).then(r => {
      if (!r.ok) throw new Error(`Peta ${file} tidak ditemukan`);
      return r.json() as Promise<GeoCollection>;
    }).catch(e => { provCache.delete(file); throw e; }));
  }
  return provCache.get(file)!;
}

/** Muat semua poligon provinsi yang dibutuhkan oleh daftar gid. */
export async function loadGeoForGids(gids: Iterable<string>): Promise<Map<string, GeoFeature>> {
  const files = new Set<string>();
  for (const g of gids) if (g) files.add(provFileOf(g));
  const cols = await Promise.all([...files].filter(Boolean).map(loadProvince));
  const m = new Map<string, GeoFeature>();
  cols.forEach(c => c.features.forEach(f => m.set(f.properties.gid, f)));
  return m;
}

export function loadKecIndex(): Promise<KecIndex[]> {
  if (!indexCache) {
    indexCache = fetch(`${BASE}geo/kecamatan_index.json`).then(r => r.json()).then((j: { rows: [string, string, string, string, number, number][] }) =>
      j.rows.map(([gid, prov, kab, kec, lat, lng]) => ({ gid, prov, kab, kec, lat, lng })));
  }
  return indexCache;
}

/* ------------------------------------------------------------------ */
export const normName = (s?: string | null) => (s || '').toUpperCase().replace(/^\s*(KEC(AMATAN)?\.?|KAB(UPATEN)?\.?|KOTA)\s+/, '').replace(/[^A-Z0-9]/g, '');

/** Nama kecamatan di data yang berbeda dengan GADM (desa/kelurahan populer, ejaan lain). Bisa ditambah. */
export const KEC_ALIAS: Record<string, { kec: string; kab?: string; catatan: string }> = {
  JONGKAT: { kec: 'SIANTAN', kab: 'MEMPAWAH', catatan: 'Jongkat/Jungkat adalah desa di Kec. Siantan (Mempawah) — dipetakan ke poligon Kec. Siantan.' },
  JUNGKAT: { kec: 'SIANTAN', kab: 'MEMPAWAH', catatan: 'Jungkat adalah desa di Kec. Siantan (Mempawah) — dipetakan ke poligon Kec. Siantan.' },
};

export interface ZonaInput { zone_code: string; zone_name: string | null; kecamatan?: string | null; daerah?: string[]; dalam_luar?: string[]; bobot?: number }
export interface ZonaMatch {
  zone_code: string; zone_name: string | null; kecamatan: string | null; ring: number | null;
  gid: string | null; kabupaten: string | null; provinsi: string | null; lat: number | null; lng: number | null;
  match_status: 'auto' | 'ambigu' | 'tidak_ketemu'; catatan: string | null; kandidat?: KecIndex[];
}

export const parseZona = (name?: string | null) => {
  const up = (name || '').toUpperCase();
  const ringM = up.match(/RING\s*([0-9]+(?:[.,][0-9]+)?)/);
  const kec = up.replace(/\s*-\s*RING\s*[0-9.,]+\s*$/, '').replace(/^\s*(KEC(AMATAN)?\.?)\s*/, '').trim();
  return { kecamatan: kec || null, ring: ringM ? Number(ringM[1].replace(',', '.')) : null };
};

const dist2 = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;

/**
 * Cocokkan zona ke kecamatan GADM.
 * 1) nama kecamatan sama persis (setelah normalisasi) di provinsi cabang;  2) alias;
 * 3) kalau ada >1 kandidat: pakai petunjuk kolom Daerah (mis. 'KUBU RAYA 2' -> Kab. Kubu Raya),
 *    lalu kandidat terdekat ke pusat zona lain yang sudah cocok (bobot = jumlah baris).
 */
export function matchZona(zonas: ZonaInput[], index: KecIndex[], provinsi: string[] = []): ZonaMatch[] {
  const provSet = new Set(provinsi.map(normName));
  const pool = provSet.size ? index.filter(r => provSet.has(normName(r.prov))) : index;
  const byKec = new Map<string, KecIndex[]>();
  pool.forEach(r => { const k = normName(r.kec); byKec.set(k, [...(byKec.get(k) || []), r]); });

  const first: (ZonaMatch & { _cands: KecIndex[]; _in: ZonaInput })[] = zonas.map(z => {
    const p = parseZona(z.zone_name);
    const kecName = z.kecamatan || p.kecamatan;
    let key = normName(kecName);
    let catatan: string | null = null;
    let cands = byKec.get(key) || [];
    if (!cands.length && KEC_ALIAS[key]) {
      const al = KEC_ALIAS[key];
      cands = (byKec.get(normName(al.kec)) || []).filter(c => !al.kab || normName(c.kab) === normName(al.kab));
      catatan = al.catatan;
      key = normName(al.kec);
    }
    if (cands.length > 1 && z.daerah?.length) {
      const hints = z.daerah.map(d => normName(d.replace(/\d+/g, ''))).filter(h => h.length >= 4);
      const byHint = cands.filter(c => hints.some(h => normName(c.kab).includes(h) || h.includes(normName(c.kab))));
      if (byHint.length >= 1) cands = byHint;
    }
    const base: ZonaMatch = { zone_code: z.zone_code, zone_name: z.zone_name, kecamatan: kecName, ring: p.ring, gid: null, kabupaten: null, provinsi: null, lat: null, lng: null, match_status: 'tidak_ketemu', catatan };
    return { ...base, _cands: cands, _in: z };
  });

  // pusat tertimbang dari zona yang kandidatnya tunggal
  let sw = 0, slat = 0, slng = 0;
  first.forEach(f => { if (f._cands.length === 1) { const w = f._in.bobot || 1; sw += w; slat += f._cands[0].lat * w; slng += f._cands[0].lng * w; } });
  const center = sw > 0 ? { lat: slat / sw, lng: slng / sw } : null;

  return first.map(f => {
    const { _cands, _in, ...m } = f; void _in;
    let pick: KecIndex | null = null;
    if (_cands.length === 1) { pick = _cands[0]; m.match_status = 'auto'; }
    else if (_cands.length > 1) {
      if (center) {
        pick = [..._cands].sort((a, b) => dist2(a, center) - dist2(b, center))[0];
        m.match_status = 'auto';
        m.catatan = [m.catatan, `Nama kecamatan ada di ${_cands.length} kabupaten (${_cands.map(c => c.kab).join(', ')}); dipilih yang terdekat dengan area layanan: ${pick.kab}.`].filter(Boolean).join(' ');
      } else { m.match_status = 'ambigu'; m.kandidat = _cands; m.catatan = `Ada ${_cands.length} kandidat: ${_cands.map(c => c.kab).join(', ')}`; }
    } else {
      m.catatan = m.catatan || 'Nama kecamatan tidak ditemukan di peta (cek ejaan / pilih manual di Master Data).';
    }
    if (pick) Object.assign(m, { gid: pick.gid, kabupaten: pick.kab, provinsi: pick.prov, lat: pick.lat, lng: pick.lng });
    return m;
  });
}
