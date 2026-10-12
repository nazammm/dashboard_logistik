import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { ErrorBox, PageSkeleton } from './components/ui';
import { PeriodProvider } from './lib/period';
import { API_CONFIGURED } from './lib/api';

const L = (f: () => Promise<{ default: ComponentType }>) => lazy(f);
const routes: [string, ReturnType<typeof lazy>][] = [
  ['/ringkasan', L(() => import('./pages/Ringkasan'))],
  ['/rekap-harian', L(() => import('./pages/RekapHarian'))],
  ['/ritase', L(() => import('./pages/Ritase'))],
  ['/ritase/:key', L(() => import('./pages/RitaseDetail'))],
  ['/transporter', L(() => import('./pages/Transporter'))],
  ['/transporter/:id', L(() => import('./pages/EntityDetail'))],
  ['/armada', L(() => import('./pages/Armada'))],
  ['/unit/:id', L(() => import('./pages/EntityDetail'))],
  ['/sopir/:id', L(() => import('./pages/EntityDetail'))],
  ['/gudang/:id', L(() => import('./pages/EntityDetail'))],
  ['/kecamatan/:id', L(() => import('./pages/EntityDetail'))],
  ['/zona/:id', L(() => import('./pages/EntityDetail'))],
  ['/peta', L(() => import('./pages/Peta'))],
  ['/rute', L(() => import('./pages/Rute'))],
  ['/toko/:code', L(() => import('./pages/TokoDetail'))],
  ['/waktu', L(() => import('./pages/Waktu'))],
  ['/muatan', L(() => import('./pages/Muatan'))],
  ['/produk/:code', L(() => import('./pages/ProdukDetail'))],
  ['/rekon-do', L(() => import('./pages/RekonDO'))],
  ['/do/:no', L(() => import('./pages/DODetail'))],
  ['/tren', L(() => import('./pages/Tren'))],
  ['/import', L(() => import('./pages/Import'))],
  ['/master', L(() => import('./pages/Master'))],
  ['/glosarium', L(() => import('./pages/Glosarium'))],
];

function Home() {
  const { search } = useLocation();
  return <Navigate to={'/ringkasan' + search} replace />;
}

export default function App() {
  if (!API_CONFIGURED) {
    return <div className="p-10 max-w-[720px]"><ErrorBox error="Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY (file .env atau Environment Variables di Vercel), lalu build ulang." /></div>;
  }
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <PeriodProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            {routes.map(([path, Page]) => (
              <Route key={path} path={path} element={<Suspense fallback={<PageSkeleton />}><Page /></Suspense>} />
            ))}
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </PeriodProvider>
    </BrowserRouter>
  );
}
