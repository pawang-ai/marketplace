/** Ekspor tabel banyak produk: susun kolom, lalu ubah ke TSV/CSV. Fungsi murni, diuji di tests/. */

/** Komponen biaya, urutan kolom ekspor (kunci sama dengan hasil fees()). */
export const COMPONENTS = [
  ["admin", "Biaya administrasi"], ["pay", "Pembayaran Mall"], ["proses", "Proses pesanan"], ["xtra", "Gratis Ongkir XTRA"],
  ["promo", "Promo XTRA"], ["live", "Live XTRA"], ["video", "Video XTRA"], ["spay", "SPayLater"], ["pre", "Pre-Order"],
];
export const TIPE = { nonstar: "Non-Star", star: "Star/Star+", mall: "Shopee Mall" };
/** Preset angka: pemisah kolom dan desimal. */
export const FORMATS = { id: { delim: ";", decimal: "," }, intl: { delim: ",", decimal: "." } };

/**
 * @param {{n: string, entry: any, uk: string, harga: number, diskon: number, qty: number, modal: number, calc: any, notes: string[]}[]} items
 * @param {{tipe: string, xtra: boolean}} S
 * @returns {{head: string[], rows: (string|number)[][]}} baris terakhir = TOTAL
 */
export function buildTable(items, S) {
  const head = ["Nama / SKU", "Kategori", "Sub kategori", "Tipe penjual", "Ukuran XTRA", "Harga asli", "Diskon %", "Harga setelah diskon", "Modal", "Jumlah",
    ...COMPONENTS.map(([, l]) => l + " /unit"), "Total biaya /unit", "Dana diterima /unit", "Laba /unit", "Margin %", "Omzet total", "Biaya total", "Laba total", "Catatan"];
  const tot = { qty: 0, omzet: 0, biaya: 0, laba: 0 };
  const rows = items.map((it) => {
    const c = it.calc, ok = c?.ok, f = c?.f, q = ok ? c.qty : 0;
    if (ok) { tot.qty += q; tot.omzet += f.base * q; tot.biaya += f.total * q; tot.laba += c.profit * q; }
    return [it.n, it.entry?.k ?? "", it.entry?.s ?? "", TIPE[S.tipe] ?? S.tipe, S.xtra ? (it.uk === "x" ? "Khusus" : "Biasa") : "-",
      ok ? c.price : "", it.diskon, ok ? f.base : "", ok ? c.modal : "", ok ? q : "",
      ...COMPONENTS.map(([k]) => (ok ? f.L.find((x) => x.k === k)?.v ?? 0 : "")),
      ok ? f.total : "", ok ? f.net : "", ok ? c.profit : "", ok ? c.margin : "", ok ? f.base * q : "", ok ? f.total * q : "", ok ? c.profit * q : "", (it.notes ?? []).join(" | ")];
  });
  const blank = head.map(() => "");
  const at = (name) => head.indexOf(name);
  const total = [...blank]; total[0] = "TOTAL"; total[at("Jumlah")] = tot.qty; total[at("Omzet total")] = tot.omzet; total[at("Biaya total")] = tot.biaya; total[at("Laba total")] = tot.laba;
  total[at("Margin %")] = tot.omzet > 0 ? tot.laba / tot.omzet * 100 : "";
  return { head, rows: [...rows, total] };
}

/** Sel teks yang diawali = + - @ dibaca Excel sebagai rumus; beri awalan ' agar tetap teks. */
export const safeText = (s) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

/** Angka rupiah dibulatkan; kolom persen 2 desimal. Desimal mengikuti preset. */
function cell(v, head, decimal) {
  if (typeof v !== "number") return safeText(String(v));
  const pct = /%/.test(head), n = pct ? Math.round(v * 100) / 100 : Math.round(v);
  return String(n).replace(".", decimal);
}
const quote = (s, delim) => (s.includes(delim) || /["\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);

/** @param {string} delim "\t" untuk salin ke Sheets, atau ";" / "," untuk CSV */
export function toDelimited({ head, rows }, delim, decimal) {
  const line = (r, h) => r.map((v, i) => quote(cell(v, h[i], decimal), delim)).join(delim);
  return [head.map((h) => quote(h, delim)).join(delim), ...rows.map((r) => line(r, head))].join("\r\n") + "\r\n";
}
