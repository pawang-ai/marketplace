import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fees, solve, remapEntry, searchCategories, orderKey, orderTotals } from "../public/js/shopee-calc.js";

const D = JSON.parse(readFileSync(new URL("../public/data/shopee.json", import.meta.url)));
const find = (set, k, s) => D.kategori[set].find((e) => e.k === k && e.s === s);
const base = { tipe: "nonstar", diskon: 0, order: 0, umk: false, xtra: { on: false, jadwal: "n", vi: 0, ukuran: "b" }, promo: "", live: false, video: false, spay: "", pre: false };
const o = (x = {}) => ({ ...base, ...x, xtra: { ...base.xtra, ...(x.xtra || {}) } });
const line = (r, k) => r.L.find((x) => x.k === k)?.v;
const anak = find("reguler", "Fashion Muslim", "Pakaian Muslim Anak");

test("data kategori ada dan tarif admin 8,25%", () => assert.equal(anak.a, 8.25));

test("Rp100.000: admin + proses pesanan + XTRA 7,5%", () => {
  const r = fees(D, anak, o({ xtra: { on: true } }), 100000);
  assert.equal(line(r, "admin"), 8250);
  assert.equal(line(r, "proses"), 1250);
  assert.equal(line(r, "xtra"), 7500);
  assert.equal(r.total, 17000);
  assert.equal(r.net, 83000);
});

test("diskon penjual mengurangi dasar biaya persen", () => {
  const r = fees(D, anak, o({ diskon: 10 }), 100000);
  assert.equal(r.base, 90000);
  assert.ok(Math.abs(line(r, "admin") - 7425) < 1e-6);
});

test("UMK memotong 50% biaya administrasi", () => {
  assert.equal(line(fees(D, anak, o({ umk: true }), 100000), "admin"), 4125);
});

test("Shopee Mall: biaya pembayaran 1,8% dengan batas Rp50.000", () => {
  const m = find("mall", "Fashion Muslim", "Pakaian Muslim Anak");
  assert.equal(line(fees(D, m, o({ tipe: "mall" }), 1000000), "pay"), 18000);
  assert.equal(line(fees(D, m, o({ tipe: "mall" }), 5000000), "pay"), 50000);
});

test("Promo XTRA 4,5% dibatasi Rp60.000; Live XTRA turun ke 2% saat promo", () => {
  assert.equal(line(fees(D, anak, o({ promo: "x" }), 5000000), "promo"), 60000);
  assert.equal(line(fees(D, anak, o({ promo: "x", live: true }), 100000), "live"), 2000);
  assert.equal(line(fees(D, anak, o({ live: true }), 100000), "live"), 3000);
});

test("nilai pesanan lebih besar membagi biaya proses pesanan", () => {
  assert.equal(line(fees(D, anak, o({ order: 200000 }), 100000), "proses"), 625);
});

test("SPayLater dan Pre-Order", () => {
  const r = fees(D, anak, o({ spay: "6", pre: true }), 100000);
  assert.equal(line(r, "spay"), 4000);
  assert.equal(line(r, "pre"), 3000);
});

test("tanpa kategori: biaya administrasi tidak dihitung", () => {
  assert.equal(line(fees(D, null, o(), 100000), "admin"), undefined);
});

test("solve: harga minimal memenuhi margin, Rp100 di bawahnya tidak", () => {
  const modal = 60000, p = solve(D, anak, o(), 20, modal);
  const m = (x) => (fees(D, anak, o(), x).net - modal) / x * 100;
  assert.ok(m(p) >= 20 && m(p - 100) < 20);
});

test("solve: target mustahil mengembalikan null", () => assert.equal(solve(D, anak, o(), 99.9, 0), null));

test("remapEntry memetakan kategori ke set Mall; pencarian menemukan hijab", () => {
  assert.equal(remapEntry(D, anak, "mall").a, 9.95);
  assert.ok(searchCategories(D, "nonstar", "hijab").length > 0);
});

test("orderTotals menjumlah nilai per kode pesanan, mengabaikan kode kosong dan nilai 0", () => {
  const t = orderTotals([{ key: "P1", value: 100000 }, { key: " p1 ", value: 100000 }, { key: "", value: 5000 }, { key: "P2", value: 0 }]);
  assert.equal(t.get("p1"), 200000); assert.equal(t.has("p2"), false); assert.equal(t.size, 1);
  assert.equal(orderKey("  AbC "), "abc");
});

test("pesanan campuran: biaya proses Rp1.250 terbagi tepat antar baris", () => {
  const rows = [{ base: 100000, qty: 1 }, { base: 50000, qty: 2 }], V = rows.reduce((s, r) => s + r.base * r.qty, 0);
  const proses = rows.map((r) => line(fees(D, anak, o({ order: V }), r.base), "proses"));
  assert.equal(proses[0], 625); assert.equal(proses[1], 312.5);
  assert.equal(proses.reduce((s, p, i) => s + p * rows[i].qty, 0), 1250);
});

test("pesanan campuran: satu baris berjumlah 3 dalam satu pesanan membayar Rp1.250 sekali", () => {
  const V = 100000 * 3;
  assert.ok(Math.abs(line(fees(D, anak, o({ order: V }), 100000), "proses") * 3 - 1250) < 1e-9);
});
