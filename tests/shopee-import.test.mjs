import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNum, parseTable, matchCategory, rowsFromTable } from "../public/js/shopee-import.js";

const D = JSON.parse(readFileSync(new URL("../public/data/shopee.json", import.meta.url)));

test("parseNum membaca format Indonesia", () => {
  assert.equal(parseNum("100.000"), 100000);
  assert.equal(parseNum("Rp 1.250.000"), 1250000);
  assert.equal(parseNum("12,5"), 12.5);
  assert.equal(parseNum("1.234,5"), 1234.5);
  assert.equal(parseNum("100,000"), 100000);
  assert.equal(parseNum("20%"), 20);
  assert.equal(parseNum("12.5"), 12.5);
  assert.ok(Number.isNaN(parseNum("abc")));
  assert.ok(Number.isNaN(parseNum("")));
});

test("parseTable: TSV, titik koma, dan sel ber-kutip", () => {
  assert.deepEqual(parseTable("a\tb\tc\n1\t2\t3\n"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(parseTable("a;b\r\n1;2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseTable('nama,harga\n"Kaos, putih",100000'), [["nama", "harga"], ["Kaos, putih", "100000"]]);
  assert.deepEqual(parseTable('"a ""b"""\n'), [['a "b"']]);
});

test("matchCategory: tepat satu cocok, ambigu, dan tidak ada", () => {
  const ok = matchCategory(D, "nonstar", "Pakaian Muslim Anak");
  assert.ok(ok.entry && ok.entry.s === "Pakaian Muslim Anak");
  const amb = matchCategory(D, "nonstar", "hijab");
  assert.equal(amb.entry, null); assert.ok(amb.n > 1);
  assert.deepEqual(matchCategory(D, "nonstar", "zzzz tidak ada"), { entry: null, n: 0 });
});

test("rowsFromTable melewati judul dan menormalkan angka", () => {
  const r = rowsFromTable(parseTable("Nama;Kategori;Harga;Diskon;Modal;Jumlah\nKaos;Pakaian Muslim Anak;100.000;10;60.000;3\nTopi;Topi;50000;;20000;"));
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { n: "Kaos", kat: "Pakaian Muslim Anak", harga: "100000", diskon: "10", modal: "60000", qty: "3" });
  assert.equal(r[1].qty, "1"); assert.equal(r[1].diskon, "");
});
