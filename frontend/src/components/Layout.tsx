import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NAV_GROUPS, PAGE_LABEL } from '../lib/pages';
import { usePeriod } from '../lib/period';
import { fmtBulan, fmtDate } from '../lib/format';
import { cx, useTo } from './ui';

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-[17px] h-[17px] shrink-0 opacity-85" dangerouslySetInnerHTML={{ __html: d }} />;
}

/** Halaman yang tidak memakai periode (bar periode disembunyikan / hanya cabang). */
const NO_PERIOD = new Set(['import', 'master', 'glosarium']);
const CABANG_ONLY = new Set(['tren']);

export function PeriodBar({ compact }: { compact?: boolean }) {
  const p = usePeriod();
  const months = [...new Set(p.periode.map(x => x.bulan))].sort().reverse();
  const minT = p.periode.map(x => x.tgl_min).sort()[0];
  const maxT = p.periode.map(x => x.tgl_max).sort().pop();
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      {(p.cabangList.length > 1 || p.cabang) && (
        <div className="control">
          <label htmlFor="pbCabang">Cabang</label>
          <select id="pbCabang" value={p.cabang} onChange={e => p.set({ cabang: e.target.value })} className="!min-w-[120px]">
            {p.cabangList.length > 1 && <option value="">Semua cabang</option>}
            {p.cabangList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      {!compact && (
        <>
          <div className="control">
            <label>Periode</label>
            <div className="pill-row" role="group" aria-label="Mode periode">
              <button type="button" className={cx('chip !py-2', p.mode === 'harian' && 'active')} aria-pressed={p.mode === 'harian'} onClick={() => p.set({ mode: 'harian' })}>Harian</button>
              <button type="button" className={cx('chip !py-2', p.mode === 'bulanan' && 'active')} aria-pressed={p.mode === 'bulanan'} onClick={() => p.set({ mode: 'bulanan' })}>Bulanan</button>
            </div>
          </div>
          <div className="control">
            <label htmlFor="pbTgl">{p.mode === 'harian' ? 'Tanggal' : 'Bulan'}</label>
            <div className="flex gap-1">
              <button type="button" className="btn !px-2.5 !py-[7px]" aria-label="Sebelumnya" onClick={() => p.geser(-1)}>‹</button>
              {p.mode === 'harian'
                ? <input id="pbTgl" type="date" value={p.tgl} min={minT} max={maxT} onChange={e => e.target.value && p.set({ tgl: e.target.value })} />
                : (
                  <select id="pbTgl" value={p.tgl} onChange={e => p.set({ tgl: e.target.value })} className="!min-w-[130px]">
                    {!months.includes(p.tgl) && <option value={p.tgl}>{fmtBulan(p.tgl)} (kosong)</option>}
                    {months.map(m => <option key={m} value={m}>{fmtBulan(m, true)}</option>)}
                  </select>
                )}
              <button type="button" className="btn !px-2.5 !py-[7px]" aria-label="Berikutnya" onClick={() => p.geser(1)}>›</button>
            </div>
          </div>
        </>
      )}
      {maxT && <div className="font-mono text-[10.5px] text-faint pb-2.5 ml-auto">Data s.d. {fmtDate(maxT)}</div>}
    </div>
  );
}

export default function Layout() {
  const loc = useLocation();
  const to = useTo();
  const period = usePeriod();
  const pageId = loc.pathname.split('/').filter(Boolean)[0] || 'ringkasan';
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [loc.pathname]);
  useEffect(() => { document.title = `${PAGE_LABEL[pageId] || 'Detail'} — Dashboard Logistik`; }, [pageId]);
  const items = NAV_GROUPS.flatMap(g => g.items);
  const showBar = !NO_PERIOD.has(pageId);

  return (
    <>
      <nav className="hidden max-[880px]:flex fixed top-0 inset-x-0 h-14 bg-ink z-[1000] items-center px-4 gap-3.5 overflow-x-auto border-b border-[#100f0c]" aria-label="Navigasi utama (mobile)">
        {items.map(p => (
          <NavLink key={p.id} to={to('/' + p.id)} className={({ isActive }) => `font-mono text-[11.5px] tracking-wider whitespace-nowrap py-1.5 px-0.5 no-underline ${isActive ? 'text-accent' : 'text-[#C9C3B4]'}`}>{p.label}</NavLink>
        ))}
      </nav>

      <aside className="fixed top-0 left-0 bottom-0 w-sidebar bg-ink text-[#EDE9DF] flex flex-col z-[1000] border-r border-[#100F0C] max-[880px]:hidden">
        <div className="px-[22px] pt-6 pb-5 border-b border-white/10 flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}assets/logo.svg`} alt="Logo" className="w-14 h-14 object-contain shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="font-extrabold text-xl text-white leading-tight" style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif', letterSpacing: '-.01em' }}>DASHBOARD<br />LOGISTIK</div>
        </div>
        <nav className="px-3 py-3.5 flex flex-col flex-1 overflow-y-auto" aria-label="Navigasi utama">
          {NAV_GROUPS.map(g => (
            <div key={g.label} className="mb-3">
              <div className="font-mono text-[9.5px] uppercase text-[#847D6C] px-3 mb-[5px] font-semibold" style={{ letterSpacing: '.1em' }}>{g.label}</div>
              {g.items.map(p => (
                <NavLink key={p.id} to={to('/' + p.id)}
                  className={() => `flex items-center gap-3 px-3 py-[9px] rounded-sm no-underline text-[13.5px] font-medium border-l-2 transition-colors ${pageId === p.id ? 'bg-accent/15 text-white border-accent' : 'text-[#C9C3B4] border-transparent hover:bg-white/5 hover:text-white'}`}>
                  <Icon d={p.icon} /><span>{p.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-[22px] pt-3 pb-4 border-t border-white/10 font-mono text-[10px] text-[#847D6C]" style={{ letterSpacing: '.04em' }}>
          SUMBER: SUPABASE · LOGISTIK
        </div>
      </aside>

      <main className="ml-sidebar min-h-screen relative max-w-full max-[880px]:ml-0 max-[880px]:mt-14 max-[880px]:max-w-[100vw]">
        {showBar && !period.kosong && (
          <div className="sticky top-0 max-[880px]:top-14 z-[900] bg-bg/95 backdrop-blur border-b border-line px-11 max-[880px]:px-[18px] py-3">
            <div className="max-w-[1360px]"><PeriodBar compact={CABANG_ONLY.has(pageId)} /></div>
          </div>
        )}
        <div className="px-11 pt-8 pb-[90px] max-w-[1360px] max-[880px]:px-[18px] max-[880px]:pt-[22px] max-[880px]:pb-[70px]">
          {showBar && period.kosong ? (
            <div className="card max-w-[640px]">
              <div className="card-title">Belum ada data</div>
              <h2 className="text-2xl mb-2">Database masih kosong</h2>
              <p className="text-soft text-[14px] leading-relaxed mb-4">Import file Excel logistik (mis. Logistik_PTK_Jan.xlsx) di halaman Import Data. Setelah selesai, semua halaman dashboard langsung terisi.</p>
              <NavLink to="/import" className="btn btn-primary no-underline">Buka Import Data →</NavLink>
            </div>
          ) : <Outlet />}
        </div>
      </main>
    </>
  );
}
