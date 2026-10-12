const ICONS = {
  ringkasan: '<path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/><path d="M10 19v-6h4v6"/>',
  harian: '<rect x="3.5" y="4" width="17" height="16" rx="1"/><path d="M3.5 9h17"/><path d="M8 4v-1.5M16 4v-1.5"/><path d="M7 13h2M11 13h2M15 13h2M7 16.5h2M11 16.5h2"/>',
  ritase: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>',
  transporter: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M4 12h16"/>',
  armada: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="9" r="2.3"/><path d="M15.5 20c.3-2.6 2-4.5 4.3-4.9"/>',
  peta: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/>',
  zona: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 6h6a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h6" transform="translate(0 -2)"/>',
  waktu: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  muatan: '<path d="M4 8 12 4l8 4-8 4Z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>',
  rekon: '<path d="M7 4h10v16H7z"/><path d="M10 9h4M10 12.5h4M10 16h2"/><path d="m3 12 2 2 3-4" stroke-width="1.4"/>',
  tren: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  import: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 18v2h16v-2"/>',
  master: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9.5h16M4 14.5h16M9.5 4v16"/>',
  glosarium: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
};

export const NAV_GROUPS = [
  { label: 'Operasional', items: [
    { id: 'ringkasan', label: 'Ringkasan', icon: ICONS.ringkasan },
    { id: 'rekap-harian', label: 'Rekap Harian', icon: ICONS.harian },
    { id: 'ritase', label: 'Ritase', icon: ICONS.ritase },
  ] },
  { label: 'Armada & Mitra', items: [
    { id: 'transporter', label: 'Transporter', icon: ICONS.transporter },
    { id: 'armada', label: 'Unit & Sopir', icon: ICONS.armada },
  ] },
  { label: 'Wilayah', items: [
    { id: 'peta', label: 'Peta Cakupan', icon: ICONS.peta },
    { id: 'rute', label: 'Rute & Zona', icon: ICONS.zona },
  ] },
  { label: 'Analisis', items: [
    { id: 'waktu', label: 'Waktu & Lead Time', icon: ICONS.waktu },
    { id: 'muatan', label: 'Komposisi Muatan', icon: ICONS.muatan },
    { id: 'rekon-do', label: 'Rekon DO J028', icon: ICONS.rekon },
    { id: 'tren', label: 'Tren Bulanan', icon: ICONS.tren },
  ] },
  { label: 'Data', items: [
    { id: 'import', label: 'Import Data', icon: ICONS.import },
    { id: 'master', label: 'Master Data', icon: ICONS.master },
    { id: 'glosarium', label: 'Glosarium', icon: ICONS.glosarium },
  ] },
];

export const PAGE_LABEL: Record<string, string> = Object.fromEntries(NAV_GROUPS.flatMap(g => g.items).map(p => [p.id, p.label]));
