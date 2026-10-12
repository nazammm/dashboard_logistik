// Peta cakupan: poligon kecamatan (bukan titik). Warna = intensitas metrik / kategori, garis = arus gudang -> kecamatan.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { loadGeoForGids, loadProvince, provFileOf, type GeoFeature } from '../lib/geo';
import { fmt } from '../lib/format';

export interface GudangPin { nama: string; lat: number | null; lng: number | null; is_dummy?: boolean; jenis?: string | null }
export interface Flow { from: string; gid: string; value: number; color?: string }

interface Props {
  values: Map<string, number>;                 // gid -> nilai (dasar warna & tooltip)
  unit?: string;                               // satuan tooltip
  highlight?: Set<string> | null;              // kalau ada: hanya gid ini berwarna, lainnya abu-abu
  categoryColor?: Map<string, string>;         // gid -> warna (mode kategori, mis. transporter dominan)
  tooltip?: (gid: string, feat: GeoFeature | undefined) => string;
  gudang?: GudangPin[];
  flows?: Flow[];
  onClickGid?: (gid: string) => void;
  height?: number;
  baseProvinces?: string[];                    // file provinsi (IDN_12_1) untuk latar semua kecamatan
  fitTo?: 'values' | 'highlight';
}

function addBasemap(map: L.Map) {
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri · Batas kecamatan: GADM 4.1', maxZoom: 18, opacity: 0.55,
  }).addTo(map);
}

/** Skala warna oranye berurutan (5 kelas, kuantil). */
function makeScale(vals: number[]) {
  const a = vals.filter(v => v > 0).sort((x, y) => x - y);
  const q = (p: number) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  const breaks = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const colors = ['#FDE3D3', '#FBB48E', '#F98451', '#E8591F', '#A83A10'];
  const flat = !a.length || a[0] === a[a.length - 1];
  return { color: (v: number) => (flat ? colors[3] : colors[breaks.filter(b => v > b).length]), breaks, colors, flat };
}

export default function CoverageMap({ values, unit = 'ton', highlight, categoryColor, tooltip, gudang = [], flows = [], onClickGid, height = 460, baseProvinces = [], fitTo = 'values' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ breaks: number[]; colors: string[] } | null>(null);
  const lastFit = useRef('');

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, preferCanvas: false, scrollWheelZoom: false }).setView([0, 110], 7);
    addBasemap(m);
    m.on('focus', () => m.scrollWheelZoom.enable());
    m.on('blur', () => m.scrollWheelZoom.disable());
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => { m.remove(); map.current = null; };
  }, []);

  const valKey = [...values.entries()].map(([k, v]) => k + v.toFixed(2)).join(',') + '|' + [...(highlight || [])].join(',') + '|' + [...(categoryColor || [])].join(',') + '|' + flows.length + '|' + gudang.length;

  useEffect(() => {
    let alive = true;
    const m = map.current, lg = layer.current;
    if (!m || !lg) return;
    const gids = new Set([...values.keys(), ...(highlight || []), ...flows.map(f => f.gid)]);
    Promise.all([loadGeoForGids(gids), ...[...new Set([...baseProvinces, ...[...gids].map(provFileOf)])].filter(Boolean).map(f => loadProvince(f).catch(() => null))])
      .then(([geo, ...bases]) => {
        if (!alive) return;
        setErr(null);
        lg.clearLayers();
        const scale = makeScale([...values.entries()].filter(([g]) => !highlight || highlight.has(g)).map(([, v]) => v));
        setLegend(categoryColor || scale.flat ? null : { breaks: scale.breaks, colors: scale.colors });
        // latar: semua kecamatan di provinsi terkait
        bases.forEach(col => col && L.geoJSON(col as never, { style: { color: '#AFA790', weight: 0.5, fillColor: '#F1EEE5', fillOpacity: 0.25 }, interactive: false }).addTo(lg));
        const bounds = L.latLngBounds([]);
        const hlBounds = L.latLngBounds([]);
        const centers = new Map<string, L.LatLng>();
        gids.forEach(gid => {
          const f = geo.get(gid);
          if (!f) return;
          const v = values.get(gid) || 0;
          const isHl = !highlight || highlight.has(gid);
          const fill = categoryColor?.get(gid) || (isHl ? scale.color(v) : '#CFC9BB');
          const gj = L.geoJSON(f as never, {
            style: { color: isHl ? '#211E19' : '#9C9585', weight: isHl ? 1 : 0.6, fillColor: fill, fillOpacity: isHl ? 0.78 : 0.35 },
          });
          const tip = tooltip ? tooltip(gid, f) : `<b>${f.properties.kec}</b><br>${f.properties.kab}<br>${fmt(v, 1)} ${unit}`;
          gj.bindTooltip(tip, { sticky: true });
          if (onClickGid) gj.on('click', () => onClickGid(gid));
          gj.on('mouseover', () => gj.setStyle({ weight: 2.5 }));
          gj.on('mouseout', () => gj.setStyle({ weight: isHl ? 1 : 0.6 }));
          gj.addTo(lg);
          const b = gj.getBounds();
          if (b.isValid()) { bounds.extend(b); if (isHl && highlight) hlBounds.extend(b); centers.set(gid, b.getCenter()); }
        });
        // gudang + arus
        const gudPos = new Map<string, L.LatLng>();
        gudang.forEach(g => {
          if (g.lat == null || g.lng == null) return;
          const ll = L.latLng(g.lat, g.lng);
          gudPos.set(g.nama, ll);
          L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#204A63', fillOpacity: 1 })
            .bindTooltip(`<b>${g.nama}</b>${g.jenis ? '<br>' + g.jenis : ''}${g.is_dummy ? '<br><i>koordinat dummy</i>' : ''}`, { direction: 'top' }).addTo(lg);
          bounds.extend(ll);
        });
        const maxF = Math.max(1, ...flows.map(f => f.value));
        flows.forEach(f => {
          const a = gudPos.get(f.from), b = centers.get(f.gid);
          if (!a || !b) return;
          if (highlight) hlBounds.extend(a);
          L.polyline([a, b], { color: f.color || '#204A63', weight: 1 + 5 * (f.value / maxF), opacity: 0.55, dashArray: '4 4', interactive: false }).addTo(lg);
        });
        const target = fitTo === 'highlight' && hlBounds.isValid() ? hlBounds : bounds;
        const key = target.isValid() ? target.toBBoxString() : '';
        if (key && key !== lastFit.current) { m.fitBounds(target.pad(0.08), { maxZoom: 11 }); lastFit.current = key; }
      })
      .catch(e => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valKey]);

  return (
    <div>
      <div ref={el} style={{ height }} className="rounded border border-line bg-surface2 z-0" role="region" aria-label="Peta cakupan kecamatan" />
      {err && <div className="error-box mt-2">{err}</div>}
      {legend && legend.breaks.some(b => b > 0) && (
        <div className="flex flex-wrap items-center gap-3 mt-2 font-mono text-[10.5px] text-soft">
          <span className="uppercase text-faint">Intensitas ({unit})</span>
          {legend.colors.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1">
              <i className="inline-block w-3 h-3 rounded-[2px] border border-line" style={{ background: c }} />
              {i === 0 ? `≤ ${fmt(legend.breaks[0], 1)}` : i === legend.colors.length - 1 ? `> ${fmt(legend.breaks[3], 1)}` : `${fmt(legend.breaks[i - 1], 1)}–${fmt(legend.breaks[i], 1)}`}
            </span>
          ))}
          {highlight && <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-[2px]" style={{ background: '#CFC9BB' }} />di luar pilihan</span>}
          <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-full" style={{ background: '#204A63' }} />gudang</span>
        </div>
      )}
    </div>
  );
}
