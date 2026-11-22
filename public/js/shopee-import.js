/** Parser tempel/impor untuk tabel banyak produk. Fungsi murni, diuji di tests/. */
import { searchCategories } from "./shopee-calc.js";

/**
 * Angka gaya Indonesia: "100.000", "12,5", "Rp 1.250.000", "20%". "100,000" dibaca ribuan.
 * @returns {number} NaN jika bukan angka
 */
export function parseNum(text) {
  let s = String(text ?? "").replace(/rp|%|\s/gi, "");
  if (!s) return NaN;
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}

/** Pecah teks tabel (TSV dari Excel/Sheets, atau CSV dengan ; atau ,). Mendukung sel ber-kutip. */
export function parseTable(text) {
  const t = text.replace(/^\uFEFF/, ""), first = t.split(/\r?\n/, 1)[0];
  const d = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Cocokkan teks kategori ke entri. Tepat satu kecocokan = dipilih; lebih dari satu = ambigu.
 * @returns {{entry: any|null, n: number}} n = jumlah kecocokan
 */
export function matchCategory(D, tipe, text) {
  const q = norm(text);
  if (!q) return { entry: null, n: 0 };
  const all = D.kategori[tipe === "mall" ? "mall" : "reguler"];
  let c = all.filter((e) => norm(`${e.k} ${e.s}`) === q || norm(e.s) === q);
  if (!c.length) c = searchCategories(D, tipe, text, 50);
  return { entry: c.length === 1 ? c[0] : null, n: c.length };
}

/**
 * Kolom: Nama, Kategori, Harga asli, Diskon %, Modal, Jumlah. Baris judul dilewati otomatis.
 * @returns {{n: string, kat: string, harga: string, diskon: string, modal: string, qty: string}[]}
 */
export function rowsFromTable(table) {
  const rows = table.filter((r) => r.length > 1);
  if (rows.length && Number.isNaN(parseNum(rows[0][2]))) rows.shift();
  const f = (x) => (Number.isNaN(parseNum(x)) ? "" : String(parseNum(x)));
  return rows.map((r) => ({ n: r[0] ?? "", kat: r[1] ?? "", harga: f(r[2]), diskon: f(r[3]), modal: f(r[4]), qty: f(r[5]) || "1" }));
}
