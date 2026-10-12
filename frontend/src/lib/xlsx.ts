import { xlsxSafeCell } from './format';

// Library xlsx (~400 kB) dimuat hanya saat tombol export diklik.
const lib = () => import('xlsx');

/** Export beberapa <table> DOM ke satu .xlsx (1 sheet per tabel), mengikuti filter yang sedang tampil. */
export async function exportTablesToExcel(tables: { name: string; el: HTMLTableElement | null | undefined }[], filename: string) {
  const XLSX = await lib();
  const wb = XLSX.utils.book_new();
  tables.forEach(({ name, el }) => {
    if (!el) return;
    const aoa: string[][] = [];
    el.querySelectorAll('thead tr, tbody tr, tfoot tr').forEach(tr => {
      aoa.push([...tr.children].map(td => xlsxSafeCell((td.textContent || '').replace(/→/g, '').trim())));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), (name || 'Sheet').slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

/** Export array objek langsung (untuk data mentah). */
export async function exportRowsToExcel(sheets: { name: string; rows: Record<string, unknown>[] }[], filename: string) {
  const XLSX = await lib();
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const safe = s.rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? xlsxSafeCell(v) : Array.isArray(v) ? v.join(', ') : v])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safe), s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}
