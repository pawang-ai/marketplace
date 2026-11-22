import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTable, toDelimited, safeText, FORMATS } from "../public/js/shopee-export.js";

const entry = { k: "Fashion Muslim", s: "Pakaian Muslim Anak" };
const ok = (price, base, total, profit, qty, L) => ({ ok: true, price, qty, modal: 60000, profit, margin: profit / price * 100, f: { base, total, net: base - total, L } });
const items = [
  { n: "Kaos, putih", entry, uk: "b", harga: 100000, diskon: 0, qty: 3, modal: 60000, notes: [], calc: ok(100000, 100000, 17000, 23000, 3, [{ k: "admin", v: 8250 }, { k: "proses", v: 1250 }, { k: "xtra", v: 7500 }]) },
  { n: "=HYPERLINK(\"x\")", entry: null, uk: "b", harga: 0, diskon: 0, qty: 1, modal: 0, notes: ["Pilih kategori."], calc: { ok: false } },
];
const S = { tipe: "nonstar", xtra: true };

test("buildTable: kolom komponen, baris tidak lengkap kosong, baris TOTAL", () => {
  const t = buildTable(items, S), c = (n) => t.head.indexOf(n);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[0][c("Biaya administrasi /unit")], 8250);
  assert.equal(t.rows[0][c("Pembayaran Mall /unit")], 0);
  assert.equal(t.rows[0][c("Laba total")], 69000);
  assert.equal(t.rows[1][c("Laba /unit")], "");
  const total = t.rows[2];
  assert.equal(total[0], "TOTAL"); assert.equal(total[c("Jumlah")], 3); assert.equal(total[c("Omzet total")], 300000); assert.equal(total[c("Laba total")], 69000);
  assert.equal(total[c("Margin %")], 23);
});

test("toDelimited: preset Indonesia (; dan koma) dan sel ber-kutip", () => {
  const out = toDelimited(buildTable(items, S), FORMATS.id.delim, FORMATS.id.decimal), lines = out.trim().split("\r\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[1].startsWith("Kaos, putih;Fashion Muslim;")); // koma biasa tidak perlu kutip pada ;
  assert.ok(lines[1].includes(";23;")); // margin 23 dibulatkan 2 desimal
});

test("toDelimited: preset internasional dan kutip untuk pemisah", () => {
  const out = toDelimited(buildTable(items, S), ",", ".");
  assert.ok(out.split("\r\n")[1].startsWith('"Kaos, putih",'));
});

test("desimal: margin pecahan memakai koma pada preset Indonesia", () => {
  const t = buildTable([{ ...items[0], calc: ok(100000, 100000, 17000, 20227, 1, []) }], S);
  assert.ok(toDelimited(t, ";", ",").includes("20,23") || toDelimited(t, ";", ",").includes("20,2"));
});

test("safeText: awalan rumus dinetralkan", () => {
  assert.equal(safeText("=1+1"), "'=1+1"); assert.equal(safeText("-5"), "'-5"); assert.equal(safeText("Kaos"), "Kaos");
  assert.ok(toDelimited(buildTable(items, S), ";", ",").includes("'=HYPERLINK"));
});
