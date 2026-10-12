import { useState, type ReactNode } from 'react';
import { Badge, Card, Note, PageHeader, Search, TableWrap, Th, cx } from '../components/ui';

interface Term { id: string; t: string; tag: string; body: ReactNode; dari?: string }

const FLOW = [
  { k: 'DO', d: 'Delivery Order dari penjualan (J028). Isi: toko, produk, qty, tanggal DO.' },
  { k: 'SOM', d: 'Perintah keluar/muat barang per DO + rute (jenis SOM).' },
  { k: 'FOAD', d: '1 truk berangkat = 1 FOAD = 1 ritase. Mengikat beberapa SOM/SJ.' },
  { k: 'SJ', d: 'Surat Jalan per toko (titik bongkar). Ditandatangani toko.' },
  { k: 'Terima toko', d: 'Tgl Terima SJ Toko = barang sampai.' },
  { k: 'SJ balik', d: 'Tgl Terima SJ DoPlanner = dokumen kembali ke admin.' },
];

const TERMS: Term[] = [
  { id: 'sj', t: 'SJ — Surat Jalan (toko, DO Planner, terminal)', tag: 'Dokumen', body: <>
    <p><b>SJ</b> adalah dokumen yang ikut bersama barang dan ditandatangani penerima. Di data ini ada <b>satu nomor SJ per titik bongkar</b> (per toko per ritase) — kolom <i>SJ No.</i>, mis. <code>26A00479</code>. Awalan nomornya menunjukkan asal: <b>26A</b> = Gudang WAJOK, <b>26B</b> = Gudang BUMIRAYA, <b>26X</b> = curah dari pabrik, <b>26V</b> = dari pelabuhan/terminal (2026 = tahun).</p>
    <p>“SJ toko”, “SJ DO Planner”, dan “SJ terminal” <b>bukan tiga SJ berbeda</b>, melainkan tahap/salinan dokumen yang sama:</p>
    <ul>
      <li><b>Tgl Terima SJ Toko</b> — tanggal toko menerima barang & menandatangani SJ. Di Januari tanggal ini selalu sama dengan tanggal kirim (Order Date), jadi dipakai sebagai tanggal “sampai”.</li>
      <li><b>Tgl Terima SJ DoPlanner</b> — tanggal lembar SJ yang sudah ditandatangani <b>kembali</b> ke DO Planner (admin pengiriman) sebagai bukti kirim. Selisihnya dengan terima toko = kecepatan dokumen balik (umumnya 1–5 hari; lihat halaman Waktu).</li>
      <li><b>No / Tgl SJ Terminal</b> — hanya terisi untuk <b>Pelabuhan → Toko</b>: SJ yang terbit di terminal/pelabuhan saat kontainer diambil. Di data Januari nomornya sama dengan SJ No. (26V…), jadi SJ terminal = SJ yang berlaku untuk pengiriman dari pelabuhan.</li>
    </ul></> },
  { id: 'som', t: 'SOM & jenis SOM', tag: 'Dokumen', body: <>
    <p><b>SOM</b> (kolom <i>SOM Code</i>, mis. <code>SOM2601371</code>) adalah perintah pengeluaran/muat barang yang dibuat dari DO — dokumen yang dipakai gudang untuk menyiapkan muatan. Kepanjangan resminya tidak ada di file; secara fungsi ia adalah “order muat”. Satu DO bisa punya beberapa SOM (kirim bertahap), satu SOM menghasilkan satu SJ.</p>
    <p><b>SOM Type</b> menentukan rute dan dipakai web ini sebagai <b>jenis kirim</b>: <code>GUDANG - TOKO (04)</code>, <code>GUDANG - GUDANG (02)</code> (mutasi stok, tanpa DO/SJ), <code>PABRIK - TOKO (03)</code> (curah, pakai PO), <code>PELABUHAN - TOKO (06)</code> (kontainer).</p></> },
  { id: 'status-som', t: 'Status SOM-SJ: “FINISH” dan “-”', tag: 'Status', body: <>
    <p><b>FINISH</b> = SOM sudah dibuatkan SJ dan siklusnya selesai (barang keluar). Ini status untuk semua Gudang→Toko, Gudang→Gudang, dan Pelabuhan→Toko di Januari.</p>
    <p><b>“-”</b> = SOM ini <b>tidak melalui alur SOM→SJ gudang</b>. Di data, “-” hanya muncul pada <b>Pabrik → Toko (curah)</b>: barang diambil langsung dari pabrik berdasarkan <b>PO</b>, jadi statusnya dipantau lewat <i>Status SOM-PO</i>, bukan SOM-SJ. “-” bukan berarti gagal/belum.</p></> },
  { id: 'status-po', t: 'Status SOM-PO: “-” dan “APPROVE”', tag: 'Status', body: <>
    <p>Kebalikan dari atas: <b>APPROVE</b> = SOM terkait PO pembelian ke pabrik dan PO tersebut sudah disetujui → hanya pada Pabrik → Toko (curah, 40 baris Januari, semua punya PO No.). <b>“-”</b> = SOM tidak memakai PO (semua pengiriman dari gudang dan pelabuhan).</p></> },
  { id: 'foad', t: 'FOAD & FOAD Type (Bulk / Non-Bulk)', tag: 'Ritase', body: <>
    <p><b>FOAD</b> (kolom <i>FOAD No.</i>) adalah dokumen perjalanan armada: <b>satu FOAD = satu truk berangkat sekali dari satu gudang asal</b>, berisi satu atau beberapa SOM/SJ (multi-drop). Web ini memakai <b>FOAD sebagai definisi 1 ritase</b> (kunci = cabang + tipe + No. FOAD, karena nomor FOAD Bulk & Non-Bulk punya urutan sendiri).</p>
    <p><b>Bulk</b> = muatan <b>curah</b> (semen tanpa kemasan, satuan TON, truk tangki/bulk) — di Januari semuanya Pabrik → Toko, rata-rata ±24,6 ton per ritase. <b>Non-Bulk</b> = muatan kemasan (zak 40/50 kg) dan barang non-semen (pcs) — truk biasa.</p></> },
  { id: 'ritase', t: 'Ritase', tag: 'Ritase', body: <>
    <p>Jumlah perjalanan pengiriman. 1 ritase = 1 FOAD. Kolom <b>Rit ke</b> = urutan ritase unit itu pada hari yang sama (diurutkan dari jam selesai muat). Rata-rata <b>ton/ritase</b> dihitung hanya dari ritase yang membawa semen, supaya ritase non-semen saja tidak menurunkan rata-rata.</p></> },
  { id: 'po', t: 'PO — Purchase Order', tag: 'Dokumen', body: <><p>Pesanan pembelian ke pabrik. Hanya terisi untuk Pabrik → Toko (curah), mis. PO <code>2500028…</code>. Status persetujuannya di kolom <i>Status SOM-PO</i>.</p></> },
  { id: 'sdo', t: 'SDO', tag: 'Dokumen', body: <><p>Kolom <i>SDO No.</i> <b>kosong 100%</b> di data Januari PTK. Biasanya SDO = Sub/Split DO (pecahan DO untuk kirim bertahap/beda sumber). Karena tidak ada isinya, belum dipakai di analisis; bila cabang lain mengisi, tinggal ditambahkan.</p></> },
  { id: 'dos', t: 'DO berawalan “DOS”', tag: 'Dokumen', body: <><p>Sebagian kecil DO (51 DO, 57 baris di Januari) bernomor <code>DOS26…</code>: qty kecil (1–8 unit), tanpa Tanggal DO dan salesman, tetapi punya SJ sendiri. Dugaan: DO susulan/pengganti (kurang kirim, zak pecah) atau DO khusus. <b>Perlu konfirmasi</b> — di Rekon DO dipisahkan lewat filter “Jenis DO”.</p></> },
  { id: 'kontainer', t: 'Nomor kontainer & seal', tag: 'Pelabuhan', body: <>
    <p>Hanya pada <b>Pelabuhan → Toko</b> (20 ritase Januari). <b>No. Kontainer</b> (mis. <code>TEGU 2868759</code>: 4 huruf kode pemilik + 7 digit) = identitas peti kemas yang dibawa dari pelabuhan. <b>No. Seal</b> = nomor segel pengaman yang dipasang saat stuffing; dicek utuh saat dibuka di toko sebagai bukti isi tidak berubah. Satu kontainer = satu ritase, umumnya <b>560 zak (28 ton)</b> dengan ongkos borongan per kontainer.</p></> },
  { id: 'kosong', t: 'Kenapa sebagian tanggal kosong?', tag: 'Data', body: <>
    <TableWrap><table className="tbl-dense !min-w-0">
      <thead><tr><Th>Jenis kirim</Th><Th>Kosong</Th><Th>Alasan</Th></tr></thead>
      <tbody>
        <tr><td>Gudang → Gudang</td><td>DO, DO Date, Est. Delv., SJ, SJ Date, Terbit SJ, Kirim, Terima SJ Toko/DoPlanner, Toko, Tanggal Order</td><td>Mutasi stok antar gudang tidak punya pembeli → tidak ada DO maupun SJ toko; dokumennya hanya SOM + FOAD.</td></tr>
        <tr><td>Pabrik → Toko (curah)</td><td>Selesai Muat</td><td>Dimuat di pabrik, bukan gudang cabang → jam muat tidak tercatat di sistem gudang.</td></tr>
        <tr><td>Pelabuhan → Toko</td><td>Selesai Muat</td><td>Kontainer diambil di pelabuhan, tidak dimuat di gudang.</td></tr>
        <tr><td>DO “DOS”</td><td>DO Date, Salesman</td><td>Lihat penjelasan DOS.</td></tr>
        <tr><td>Semua</td><td>SDO No.</td><td>Tidak dipakai cabang PTK.</td></tr>
      </tbody>
    </table></TableWrap></> },
  { id: 'tanggal', t: 'Arti kolom tanggal', tag: 'Data', body: <>
    <ul>
      <li><b>DO Date</b> — pesanan dibuat (awal lead time). Ada DO lama dari 2022–2025 yang baru dikirim.</li>
      <li><b>SOM Date</b> — perintah muat dibuat. ±90% sama dengan SJ Date (sisanya 1–2 hari sebelum).</li>
      <li><b>SJ Date = Terbit SJ</b> — SJ diterbitkan (selalu sama).</li>
      <li><b>Selesai Muat</b> — jam truk selesai dimuat di gudang (satu-satunya kolom dengan jam).</li>
      <li><b>Order Date = Kirim = Tgl Terima SJ Toko</b> — di Januari ketiganya selalu sama: barang dikirim dan diterima di hari yang sama.</li>
      <li><b>Est. Delv. Date</b> — mengumpul di beberapa tanggal saja (31 Jan, 7 Feb, 14 Mar, 4 Apr) → lebih mirip batas program/masa berlaku DO daripada janji kirim per order.</li>
      <li><b>Tgl Terima SJ DoPlanner</b> — SJ kembali ke admin.</li>
    </ul></> },
  { id: 'zona', t: 'Zona transporter, ring, dalam/luar kota', tag: 'Wilayah', body: <>
    <p><b>Zone Trans</b> (mis. <code>T001016 · KEC. SUNGAI RAYA - RING 1.0</code>) = zona tarif angkutan: kecamatan tujuan + <b>ring</b> (lapisan jarak; ring 1 paling dekat). Web ini memetakan setiap zona ke poligon kecamatan sehingga cakupan tampil sebagai area. <b>Ket. Dalam/Luar Kota</b> dipakai apa adanya dari data.</p></> },
  { id: 'jenis-kirim', t: 'Gudang–toko, gudang–gudang, pabrik–toko, pelabuhan–toko', tag: 'Wilayah', body: <>
    <ul>
      <li><b>Gudang → Toko</b> (82% ritase): dari gudang BUMIRAYA/WAJOK ke toko, sering multi-drop & campur semen + non-semen.</li>
      <li><b>Gudang → Gudang</b>: mutasi stok BUMIRAYA ↔ WAJOK (dan gudang lain).</li>
      <li><b>Pabrik → Toko</b>: curah (bulk) langsung dari pabrik, ±24,6 t/ritase.</li>
      <li><b>Pelabuhan → Toko</b>: kontainer 28 t dari pelabuhan langsung ke toko.</li>
    </ul></> },
  { id: 'lead', t: 'Lama order sampai tujuan & lama muat', tag: 'Metrik', body: <>
    <p><b>Lead time</b> = Tgl Terima SJ Toko − DO Date (hari). Median Januari ±2 hari, tapi ada ekor panjang dari DO lama. <b>Lama muat</b> belum bisa dihitung langsung karena tidak ada jam masuk/mulai muat; web memakai <b>jeda antar-selesai-muat</b> di gudang yang sama sebagai pendekatan (BUMIRAYA ±19 menit, WAJOK ±41 menit per truk).</p></> },
];

const KEBUTUHAN: [string, string, string][] = [
  ['Jam masuk gudang / mulai muat per FOAD', 'Lama muat sebenarnya & antrean gudang', 'Sistem gudang / pos satpam'],
  ['Area kontrak tiap transporter (daftar kecamatan/kota + ring)', 'Cakupan resmi vs aktual di peta, deteksi kirim di luar kontrak', 'Kontrak transporter'],
  ['Master transporter: grup, jenis, kapasitas armada, kontak', 'Utilisasi armada (ton terangkut vs kapasitas), grup LAM vs LAM-Trucking', 'Tim logistik'],
  ['Kapasitas tiap unit (ton/zak) & jenis truk', 'Load factor per ritase', 'Transporter'],
  ['Koordinat gudang asli (BUMIRAYA, WAJOK, titik virtual)', 'Garis arus & jarak di peta (sekarang dummy)', 'Tim gudang'],
  ['Export J028 (DO No., tanggal, toko, produk, qty)', 'Rekon DO yang sebenarnya (sekarang dummy)', 'Sistem penjualan'],
  ['Koordinat toko (opsional)', 'Peta titik toko + jarak tempuh', 'Sales / CRM'],
  ['Konfirmasi arti DOS, SDO, Est. Delv. Date', 'Interpretasi rekon & ketepatan kirim', 'DO Planner'],
  ['Batas wilayah ring (bila ada peta tarif)', 'Peta cakupan per ring yang presisi', 'Transporter / tim tarif'],
];

export default function Glosarium() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>('sj');
  const list = TERMS.filter(x => !q || (x.t + ' ' + x.tag).toUpperCase().includes(q.toUpperCase()));
  return (
    <>
      <PageHeader eyebrow="Data" title="Glosarium & Panduan" desc="Arti istilah logistik di data, alur dokumen, kenapa ada kolom kosong, dan data apa yang masih dibutuhkan. Penjelasan diturunkan dari pola data Januari PTK — bagian bertanda “dugaan” perlu dikonfirmasi tim." />

      <Card title="Alur dokumen">
        <div className="flex flex-wrap items-stretch gap-2 mt-2">
          {FLOW.map((f, i) => (
            <div key={f.k} className="flex items-center gap-2">
              <div className="border border-line-strong rounded-sm px-3 py-2 bg-surface2 w-[170px] min-h-[86px]">
                <div className="font-disp uppercase font-extrabold text-lg text-accent-ink">{f.k}</div>
                <div className="text-[11.5px] text-soft leading-snug">{f.d}</div>
              </div>
              {i < FLOW.length - 1 && <span className="text-faint font-mono" aria-hidden="true">→</span>}
            </div>
          ))}
        </div>
      </Card>

      <div className="controls mt-6"><Search value={q} onChange={setQ} placeholder="Cari istilah…" /></div>
      <div className="flex flex-col gap-2.5">
        {list.map(x => (
          <div key={x.id} className="card plain !p-0">
            <button type="button" className="w-full text-left px-5 py-3.5 flex items-center gap-3" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>
              <Badge>{x.tag}</Badge><span className="font-semibold text-[14.5px] flex-1">{x.t}</span><span className={cx('font-mono text-faint transition-transform', open === x.id && 'rotate-90')}>›</span>
            </button>
            {open === x.id && <div className="px-5 pb-4 text-[13.5px] leading-relaxed text-ink [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-surface2 [&_code]:px-1 [&_code]:rounded-sm">{x.body}</div>}
          </div>
        ))}
      </div>

      <h2 className="section-title">Data yang masih dibutuhkan</h2>
      <TableWrap>
        <table className="tbl-dense">
          <thead><tr><Th>Data</Th><Th>Untuk apa</Th><Th>Sumber</Th></tr></thead>
          <tbody>{KEBUTUHAN.map(([a, b, c]) => <tr key={a}><td className="!whitespace-normal font-semibold">{a}</td><td className="!whitespace-normal">{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </TableWrap>
      <div className="mt-4"><Note tone="warn">Yang saat ini <b>dummy</b> dan ditandai di web: koordinat gudang, data J028. Pemetaan zona → kecamatan otomatis (nama) — sudah dicek, tapi Jongkat dipetakan ke Kec. Siantan dan Sungai Raya ke Kubu Raya (bukan Bengkayang).</Note></div>
    </>
  );
}
