// Akses Supabase lewat REST (PostgREST) murni — kontraknya sama dengan API web semen (GET {view}?eq./gte./lte., POST rpc/{fn}),
// jadi kalau nanti pindah ke PostgreSQL kantor + backend sendiri, cukup ganti BASE_URL & header di file ini.
import type { Row } from './types';

const URL_ENV = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
const KEY_ENV = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const API_CONFIGURED = !!(URL_ENV && KEY_ENV);
const REST = `${URL_ENV}/rest/v1`;
const PAGE = 1000; // batas max-rows bawaan Supabase

function headers(extra?: Record<string, string>): Record<string, string> {
  return { apikey: KEY_ENV || '', Authorization: `Bearer ${KEY_ENV || ''}`, Accept: 'application/json', ...extra };
}

async function asError(res: Response): Promise<Error> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = await res.json();
    msg = j.message || j.error || j.hint || msg;
    if (j.details) msg += ` — ${j.details}`;
  } catch { /* bukan JSON */ }
  if (res.status === 401 || res.status === 403) msg = `Akses ditolak (${res.status}). Cek VITE_SUPABASE_ANON_KEY. ${msg}`;
  return new Error(msg);
}

function ensureConfigured() {
  if (!API_CONFIGURED) throw new Error('Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env lalu build ulang.');
}

/** GET satu halaman. `path` contoh: "v_ritase?select=*&cabang=eq.PTK". */
export async function apiGet<T = Row[]>(path: string): Promise<T> {
  ensureConfigured();
  let res: Response;
  try { res = await fetch(`${REST}/${path}`, { headers: headers() }); }
  catch (e) { throw new Error('Tidak bisa terhubung ke Supabase (jaringan/firewall?). ' + (e instanceof Error ? e.message : '')); }
  if (!res.ok) throw await asError(res);
  return res.json() as Promise<T>;
}

/** GET semua baris (otomatis paging per 1000, paralel). */
export async function apiGetAll(view: string, query: string): Promise<Row[]> {
  ensureConfigured();
  const q = query.startsWith('?') ? query.slice(1) : query;
  const first = await fetch(`${REST}/${view}?${q}&limit=${PAGE}&offset=0`, { headers: headers({ Prefer: 'count=exact' }) })
    .catch(e => { throw new Error('Tidak bisa terhubung ke Supabase (jaringan/firewall?). ' + (e instanceof Error ? e.message : '')); });
  if (!first.ok) throw await asError(first);
  const rows: Row[] = await first.json();
  const total = Number((first.headers.get('content-range') || '').split('/')[1] || rows.length);
  if (!Number.isFinite(total) || total <= rows.length) return rows;
  const offsets: number[] = [];
  for (let off = PAGE; off < total; off += PAGE) offsets.push(off);
  const pages = await Promise.all(offsets.map(async off => {
    const r = await fetch(`${REST}/${view}?${q}&limit=${PAGE}&offset=${off}`, { headers: headers() });
    if (!r.ok) throw await asError(r);
    return r.json() as Promise<Row[]>;
  }));
  return rows.concat(...pages);
}

/** Panggil fungsi RPC (POST /rest/v1/rpc/{fn}). */
export async function apiRpc<T = unknown>(fn: string, body: Record<string, unknown>): Promise<T> {
  ensureConfigured();
  let res: Response;
  try {
    res = await fetch(`${REST}/rpc/${fn}`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  } catch (e) { throw new Error('Tidak bisa terhubung ke Supabase. ' + (e instanceof Error ? e.message : '')); }
  if (!res.ok) throw await asError(res);
  const txt = await res.text();
  return (txt ? JSON.parse(txt) : null) as T;
}

/** Encode nilai untuk filter PostgREST (eq., in.) */
export const enc = (v: string | number) => encodeURIComponent(String(v));
/** Filter in.(...) dengan kutip ganda (aman untuk nilai berisi koma/spasi). */
export const inList = (vals: (string | number)[]) => `in.(${vals.map(v => `"${String(v).replace(/"/g, '\\"')}"`).map(encodeURIComponent).join(',')})`;
