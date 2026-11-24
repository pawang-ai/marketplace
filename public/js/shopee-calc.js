/**
 * Mesin hitung biaya penjual Shopee. Fungsi murni: tidak menyentuh DOM,
 * dipakai oleh form satu produk, tabel banyak produk, ekspor, dan tes.
 *
 * Semua biaya dihitung per 1 unit dari harga setelah diskon & voucher penjual.
 */

/** @param {number} n */
export const rp = (n) => (n < 0 ? "-Rp" : "Rp") + Math.round(Math.abs(n)).toLocaleString("id-ID");
/** @param {number} n */
export const pc = (n) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";

/**
 * @typedef {object} Opts
 * @property {"nonstar"|"star"|"mall"} tipe
 * @property {number} diskon  persen, 0-100
 * @property {number} order   nilai total pesanan (0 = 1 produk per pesanan)
 * @property {boolean} umk
 * @property {{on: boolean, jadwal: "n"|"d", vi: number, ukuran: "b"|"x"}} xtra
 * @property {""|"x"|"xp"} promo
 * @property {boolean} live
 * @property {boolean} video
 * @property {""|"3"|"6"} spay
 * @property {boolean} pre
 */

/** Varian tarif XTRA terpilih untuk entri kategori, atau undefined. */
export function xtraVariant(entry, xtra) {
  const vs = entry?.[xtra.jadwal === "d" ? "xd" : "xn"] ?? [];
  return vs[Math.min(xtra.vi || 0, vs.length - 1)];
}

/**
 * Rincian biaya satu unit pada harga asli `price`.
 * @param {any} D data dari shopee.json
 * @param {any} entry entri kategori (null = biaya administrasi belum dihitung)
 * @param {Opts} o
 * @param {number} price harga asli sebelum diskon
 * @returns {{base: number, L: {k: string, label: string, v: number, note: string}[], total: number, net: number}}
 */
export function fees(D, entry, o, price) {
  const T = D.tetap, disc = Math.min(Math.max(o.diskon, 0), 100) / 100, base = price * (1 - disc), L = [];
  const add = (k, label, v, note = "") => { if (v > 0) L.push({ k, label, v, note }); };
  if (entry) add("admin", "Biaya administrasi", base * entry.a / 100 * (o.umk ? 0.5 : 1), pc(entry.a) + (o.umk ? " ×50% UMK" : ""));
  if (o.tipe === "mall") add("pay", "Biaya pembayaran Shopee Mall", Math.min(base * T.mallPembayaran.persen / 100, T.mallPembayaran.maks), `${pc(T.mallPembayaran.persen)}, maks. ${rp(T.mallPembayaran.maks)}`);
  const share = o.order > base && base > 0 ? base / o.order : 1;
  add("proses", "Biaya proses pesanan", T.prosesPesanan * share, o.order > base ? "dibagi proporsional" : "per pesanan");
  if (o.xtra.on && entry) {
    const v = xtraVariant(entry, o.xtra);
    if (v) { const [p, cap] = o.xtra.ukuran === "x" ? v.x : v.b; add("xtra", "Gratis Ongkir XTRA", Math.min(base * p / 100, cap), `${pc(p)}, maks. ${rp(cap)}`); }
  }
  if (o.promo) { const c = o.promo === "xp" ? T.promoXtraPlus : T.promoXtra; add("promo", o.promo === "xp" ? "Promo XTRA+" : "Promo XTRA", Math.min(base * c.persen / 100, c.maks), `${pc(c.persen)}, maks. ${rp(c.maks)}`); }
  for (const [on, key, label] of [[o.live, "live", "Live XTRA"], [o.video, "video", "Video XTRA"]]) {
    if (on) { const c = T[key], p = o.promo ? c.persenDenganPromo : c.persen; add(key, label, Math.min(base * p / 100, c.maks), `${pc(p)}, maks. ${rp(c.maks)}`); }
  }
  if (o.spay) add("spay", "SPayLater XTRA 0%", base * T.spaylater[o.spay] / 100, pc(T.spaylater[o.spay]));
  if (o.pre) add("pre", "Biaya produk Pre-Order", base * T.preorder / 100, pc(T.preorder));
  const total = L.reduce((s, x) => s + x.v, 0);
  return { base, L, total, net: base - total };
}

/**
 * Harga asli minimal (dibulatkan ke atas Rp100) agar margin laba >= `margin` persen.
 * @returns {number|null} null jika target tidak mungkin dicapai
 */
export function solve(D, entry, o, margin, modal) {
  const f = (p) => fees(D, entry, o, p).net - modal - (margin / 100) * p;
  let lo = 0, hi = 1e10;
  if (f(hi) <= 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; (f(mid) > 0 ? (hi = mid) : (lo = mid)); }
  return Math.ceil(hi / 100) * 100;
}

/** Entri pada set `tipe` yang setara dengan `entry` dari set lain (kategori+sub sama, jenis beririsan). */
export function remapEntry(D, entry, tipe) {
  if (!entry) return null;
  const items = (s) => new Set(s.toLowerCase().split(/,\s*|;\s*/));
  const same = D.kategori[tipe === "mall" ? "mall" : "reguler"].filter((e) => e.k === entry.k && e.s === entry.s), mine = items(entry.j);
  return same.find((e) => [...items(e.j)].some((x) => mine.has(x))) || same[0] || null;
}

/** Cari kategori: semua kata harus ada di kategori/sub/jenis. */
export function searchCategories(D, tipe, query, limit = 8) {
  const t = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!t.length) return [];
  return D.kategori[tipe === "mall" ? "mall" : "reguler"].map((e) => ({ e, h: `${e.k} ${e.s} ${e.j}`.toLowerCase(), n: `${e.k} ${e.s}`.toLowerCase() }))
    .filter((x) => t.every((w) => x.h.includes(w)))
    .sort((a, b) => t.filter((w) => b.n.includes(w)).length - t.filter((w) => a.n.includes(w)).length)
    .slice(0, limit).map((x) => x.e);
}

/** Kunci kode pesanan: tanpa spasi tepi dan huruf besar/kecil diabaikan. Kosong = tanpa pesanan campuran. */
export const orderKey = (text) => String(text ?? "").trim().toLowerCase();

/**
 * Total nilai tiap pesanan campuran (jumlah nilai baris yang berkode sama).
 * Dipakai sebagai `Opts.order` sehingga biaya proses pesanan dibagi proporsional.
 * @param {{key: string, value: number}[]} lines value = harga setelah diskon x jumlah; baris tak valid bernilai 0
 * @returns {Map<string, number>}
 */
export function orderTotals(lines) {
  const m = new Map();
  for (const { key, value } of lines) { const k = orderKey(key); if (k && value > 0) m.set(k, (m.get(k) ?? 0) + value); }
  return m;
}
