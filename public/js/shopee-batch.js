/** Tabel banyak produk: satu tipe penjual & program untuk semua baris, hitung per baris. */
import { rp, pc, fees, solve, remapEntry, searchCategories, xtraVariant } from "/js/shopee-calc.js";
import { parseNum, parseTable, matchCategory, rowsFromTable } from "/js/shopee-import.js";

const KEY = "mp.shopee.batch.v1", MAX_ROWS = 200;
const $ = (id) => document.getElementById(id);
const num = (x) => parseNum(x);
const sel = (n) => document.querySelector(`[name=${n}]:checked`).value;
const fmt = (v) => { const n = parseInt(String(v).replace(/\D/g, ""), 10); return Number.isNaN(n) || !/^[\d.]+$/.test(String(v)) ? v : n.toLocaleString("id-ID"); };
const money = (el) => { const n = parseInt(el.value.replace(/\D/g, ""), 10); el.value = Number.isNaN(n) ? "" : n.toLocaleString("id-ID"); };
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

export function initBatch(D) {
  /** @type {any[]} */ let rows = [];
  let S = readSettings(), cur = null, saveT;

  function readSettings() {
    return {
      tipe: sel("btipe"), mode: sel("bmode"), target: $("b-target").value, jadwal: $("b-jadwal").value,
      xtra: $("b-xtra").checked, live: $("b-live").checked, video: $("b-video").checked, pre: $("b-pre").checked, umk: $("b-umk").checked,
      promo: $("b-promo").value, spay: $("b-spay").value,
    };
  }
  const blank = () => ({ n: "", entry: null, hint: "", vi: 0, uk: "b", harga: "", diskon: "0", modal: "", qty: "1" });
  const optsFor = (r) => ({
    tipe: S.tipe, diskon: num(r.diskon) || 0, order: 0, umk: S.umk, xtra: { on: S.xtra, jadwal: S.jadwal, vi: r.vi, ukuran: r.uk },
    promo: S.promo, live: S.live, video: S.video, spay: S.spay, pre: S.pre,
  });

  /* ---------- hitung satu baris ---------- */
  function compute(r) {
    const issues = [], E = (f, m) => issues.push({ f, level: "err", m }), W = (f, m) => issues.push({ f, level: "warn", m });
    const modal = num(r.modal), qty = num(r.qty || "1"), disc = num(r.diskon || "0"), laba = S.mode === "laba", tg = num(S.target);
    if (!r.entry) E("k", r.hint ? `Pilih kategori (${r.hint}).` : "Pilih kategori.");
    if (laba && !(num(r.harga) > 0)) E("h", "Isi harga asli.");
    if (!laba && !(tg >= 0 && tg < 100)) E("h", "Isi target margin (0 sampai di bawah 100) di setelan.");
    if (Number.isNaN(modal)) E("m", "Isi modal, isi 0 jika tidak ada.");
    if (Number.isNaN(disc) || disc < 0 || disc > 100) E("d", "Diskon 0 sampai 100%.");
    if (!(qty >= 1) || !Number.isInteger(qty)) E("q", "Jumlah minimal 1, bilangan bulat.");
    if (issues.length) return { issues, ok: false };
    const o = optsFor(r);
    const price = laba ? num(r.harga) : solve(D, r.entry, o, tg, modal);
    if (price == null) { E("h", "Target margin tidak mungkin dicapai."); return { issues, ok: false }; }
    const f = fees(D, r.entry, o, price), profit = f.net - modal, margin = price > 0 ? profit / price * 100 : 0;
    if (S.xtra && !xtraVariant(r.entry, o.xtra)) W("k", "Gratis Ongkir XTRA tidak tersedia untuk kategori atau jadwal ini, tidak dihitung.");
    if (laba && f.base < modal) W("h", "Harga setelah diskon di bawah modal.");
    if (profit < 0) W("m", `Laba minus ${rp(-profit)} per unit.`);
    else if (margin < 5) W("m", `Margin hanya ${pc(margin)}.`);
    return { issues, ok: true, price, f, profit, margin, qty, modal };
  }

  /* ---------- tampilan satu baris ---------- */
  function paint(r) {
    const c = compute(r), x = r.el;
    r.calc = c;
    const by = {}; for (const i of c.issues) by[i.f] ??= i;
    for (const [f, node] of [["k", x.kat], ["h", x.harga], ["m", x.modal], ["d", x.diskon], ["q", x.qty]]) {
      const i = by[f];
      if (i?.level === "err") node.setAttribute("aria-invalid", "true"); else node.removeAttribute("aria-invalid");
      node.toggleAttribute("data-warn", i?.level === "warn");
    }
    const first = c.issues.find((i) => i.level === "err") ?? c.issues[0];
    x.note.replaceChildren();
    if (first) {
      const m = el("span", { className: "fmsg " + first.level, textContent: first.m + (c.issues.length > 1 ? ` (+${c.issues.length - 1})` : "") });
      m.title = c.issues.map((i) => i.m).join("\n"); x.note.append(m);
    }
    const hm = S.mode === "harga";
    x.harga.hidden = hm; x.hargaOut.hidden = !hm; x.hargaOut.textContent = c.ok ? rp(c.price) : "—";
    x.laba.replaceChildren(c.ok ? el("span", { className: c.profit < 0 ? "neg" : "", textContent: rp(c.profit) }) : "—");
    x.margin.textContent = c.ok ? pc(c.margin) : "—";
    x.total.replaceChildren(c.ok ? el("span", { className: c.profit < 0 ? "neg" : "", textContent: rp(c.profit * c.qty) }) : "—");
  }
  function totals() {
    const ok = rows.filter((r) => r.calc?.ok), sum = (fn) => ok.reduce((s, r) => s + fn(r.calc) * r.calc.qty, 0);
    const omzet = sum((c) => c.f.base), biaya = sum((c) => c.f.total), modal = sum((c) => c.modal), laba = sum((c) => c.profit);
    const t = (label, val, neg) => { const d = el("div"); d.append(el("small", { textContent: label }), el("b", { textContent: val, className: neg ? "neg" : "" })); return d; };
    $("bsum").replaceChildren(
      t("Baris lengkap", `${ok.length} dari ${rows.length}`), t("Omzet (setelah diskon)", rp(omzet)), t("Biaya platform", rp(biaya)),
      t("Modal", rp(modal)), t("Laba bersih", rp(laba), laba < 0), t("Margin", omzet > 0 ? pc(laba / omzet * 100) : "—"));
  }
  function refreshXtra(r) {
    const vs = r.entry?.[S.jadwal === "d" ? "xd" : "xn"] ?? [], x = r.el;
    x.uk.disabled = !S.xtra; x.uk.value = r.uk;
    x.vsel.hidden = !(S.xtra && vs.length > 1);
    x.vsel.replaceChildren(...vs.map((v, i) => el("option", { value: i, textContent: v.j || "Semua jenis" })));
    x.vsel.value = Math.min(r.vi, Math.max(vs.length - 1, 0));
  }
  function showCat(r) {
    r.el.kat.textContent = r.entry ? `${r.entry.k} › ${r.entry.s}` : "";
    r.el.kat.title = r.entry ? `${r.entry.k} › ${r.entry.s} · admin ${pc(r.entry.a)}\n${r.entry.j}` : "";
  }
  function update(r) { refreshXtra(r); showCat(r); paint(r); totals(); save(); }
  function refreshAll() { rows.forEach((r) => { refreshXtra(r); paint(r); }); totals(); save(); }

  /* ---------- DOM baris ---------- */
  function build(r) {
    const i = () => rows.indexOf(r) + 1;
    const inp = (extra) => el("input", { type: "text", ...extra });
    const x = r.el = {
      n: inp({ value: r.n, autocomplete: "off" }), kat: el("button", { type: "button", className: "katbtn" }), vsel: el("select", { className: "vsel", hidden: true }),
      uk: el("select"), harga: inp({ inputMode: "numeric", className: "m", value: (r.harga = fmt(r.harga)) }), hargaOut: el("output", { hidden: true }), diskon: inp({ inputMode: "decimal", value: r.diskon }),
      modal: inp({ inputMode: "numeric", className: "m", value: (r.modal = fmt(r.modal)) }), qty: inp({ inputMode: "numeric", value: r.qty }),
      laba: el("td", { className: "num" }), margin: el("td", { className: "num" }), total: el("td", { className: "num" }), note: el("td"),
    };
    x.vsel.setAttribute("aria-label", "Jenis produk untuk tarif XTRA");
    x.uk.append(el("option", { value: "b", textContent: "Biasa" }), el("option", { value: "x", textContent: "Khusus" }));
    x.uk.setAttribute("aria-label", "Ukuran XTRA");
    const td = (label, ...k) => { const t = el("td"); t.dataset.label = label; t.append(...k); return t; };
    const act = (text, label, fn) => { const b = el("button", { type: "button", textContent: text, title: label }); b.addEventListener("click", fn); b.dataset.label = label; return b; };
    x.dup = act("⧉", "Duplikat baris", () => dup(r)); x.del = act("✕", "Hapus baris", () => remove(r));
    const th = el("th", { scope: "row" }, x.n);
    x.tr = el("tr", {}, th, td("Kategori", x.kat, x.vsel), td("Ukuran XTRA", x.uk), td("Harga asli", x.harga, x.hargaOut), td("Diskon %", x.diskon), td("Modal", x.modal), td("Jumlah", x.qty), x.laba, x.margin, x.total, x.note, el("td", {}, el("div", { className: "acts" }, x.dup, x.del)));
    x.laba.dataset.label = "Laba / unit"; x.margin.dataset.label = "Margin"; x.total.dataset.label = "Laba total"; x.note.dataset.label = "Catatan";
    x.harga.setAttribute("aria-required", "true"); x.modal.setAttribute("aria-required", "true");
    const names = [[x.n, "Nama atau SKU"], [x.kat, "Pilih kategori"], [x.harga, "Harga asli"], [x.diskon, "Diskon persen"], [x.modal, "Modal"], [x.qty, "Jumlah"], [x.dup, "Duplikat"], [x.del, "Hapus"], [x.uk, "Ukuran XTRA"], [x.vsel, "Jenis produk XTRA"]];
    r.label = () => names.forEach(([n, t]) => n.setAttribute("aria-label", `${t}, baris ${i()}`));
    x.tr.addEventListener("input", (e) => {
      const k = new Map([[x.n, "n"], [x.harga, "harga"], [x.diskon, "diskon"], [x.modal, "modal"], [x.qty, "qty"]]).get(e.target);
      if (k) { r[k] = e.target.value; paint(r); totals(); save(); }
    });
    x.tr.addEventListener("change", (e) => { if (e.target === x.uk) r.uk = x.uk.value; if (e.target === x.vsel) r.vi = +x.vsel.value; if (e.target === x.uk || e.target === x.vsel) update(r); });
    for (const k of ["harga", "modal"]) x[k].addEventListener("blur", () => { money(x[k]); r[k] = x[k].value; paint(r); totals(); save(); });
    x.kat.addEventListener("click", () => openPicker(r));
    return x.tr;
  }
  function addRow(r = blank(), after = null) {
    if (rows.length >= MAX_ROWS) { say(`Maksimal ${MAX_ROWS} baris.`); return null; }
    const tr = build(r), at = after ? rows.indexOf(after) + 1 : rows.length;
    rows.splice(at, 0, r); const ref = $("brows").children[at]; $("brows").insertBefore(tr, ref ?? null);
    rows.forEach((x) => x.label()); update(r); return r;
  }
  function dup(r) { const c = { ...r, el: undefined, calc: undefined }; const n = addRow(c, r); n?.el.n.focus(); }
  function remove(r) {
    const i = rows.indexOf(r); r.el.tr.remove(); rows.splice(i, 1);
    if (!rows.length) addRow(); rows.forEach((x) => x.label()); totals(); save();
    (rows[Math.min(i, rows.length - 1)].el.n).focus();
  }
  const say = (t) => { $("bmsg").textContent = t; };

  /* ---------- picker kategori (dialog) ---------- */
  function renderResults(ul, list, pick) {
    ul.replaceChildren(...(list.length ? list.map((e) => {
      const b = el("button", { type: "button" }), t = el("span", { className: "t", textContent: `${e.k} › ${e.s}` }), f = el("span", { className: "f", textContent: pc(e.a) }), s = el("small", { textContent: e.j, title: e.j });
      b.append(t, f, s); b.addEventListener("click", () => pick(e)); return el("li", {}, b);
    }) : [el("li", { className: "none", textContent: "Tidak ada kategori yang cocok." })]));
  }
  function openPicker(r) { cur = r; $("cq").value = ""; $("cres").replaceChildren(); $("cstat").textContent = ""; $("cdlg").showModal(); }
  $("cq").addEventListener("input", () => {
    const q = $("cq").value.trim(), list = q ? searchCategories(D, S.tipe, q, 12) : [];
    if (!q) { $("cres").replaceChildren(); $("cstat").textContent = ""; return; }
    renderResults($("cres"), list, (e) => { cur.entry = e; cur.hint = ""; cur.vi = 0; $("cdlg").close(); update(cur); cur.el.kat.focus(); });
    $("cstat").textContent = list.length ? `${list.length} kategori ditemukan.` : "Tidak ada kategori yang cocok.";
  });

  /* ---------- tempel / impor ---------- */
  function importText(text) {
    const parsed = rowsFromTable(parseTable(text));
    if (!parsed.length) return "Tidak ada baris yang bisa dibaca. Pastikan ada minimal Nama dan Kategori, dipisah tab, titik koma, atau koma.";
    if (rows.length === 1 && !rows[0].n && !rows[0].entry && !rows[0].harga && !rows[0].modal) { rows[0].el.tr.remove(); rows = []; }
    let unmatched = 0, added = 0;
    for (const p of parsed) {
      const m = matchCategory(D, S.tipe, p.kat), r = { ...blank(), n: p.n, entry: m.entry, harga: p.harga, diskon: p.diskon || "0", modal: p.modal, qty: p.qty };
      if (!m.entry) { unmatched++; r.hint = m.n ? `${m.n} kecocokan untuk "${p.kat}"` : `"${p.kat}" tidak ditemukan`; }
      if (!addRow(r)) break; added++;
    }
    say(`${added} baris ditambahkan${unmatched ? `, ${unmatched} kategori perlu dipilih manual` : ""}.`);
    return "";
  }
  $("pgo").addEventListener("click", () => {
    const msg = importText($("ptext").value);
    $("pmsg").hidden = !msg; $("pmsg").textContent = msg;
    if (!msg) { $("ptext").value = ""; $("pdlg").close(); }
  });
  $("pfile").addEventListener("change", async () => { const f = $("pfile").files[0]; if (f) { $("ptext").value = await f.text(); $("pfile").value = ""; } });
  /* Invoker Commands: tanpa dukungan native, buka dialog lewat klik biasa */
  if (!("commandForElement" in HTMLButtonElement.prototype)) document.querySelectorAll("[commandfor]").forEach((b) => b.addEventListener("click", () => $(b.getAttribute("commandfor")).showModal()));

  /* ---------- toolbar ---------- */
  $("b-add").addEventListener("click", () => addRow()?.el.n.focus());
  $("b-clear").addEventListener("click", () => $("kdlg").showModal());
  $("kdlg").addEventListener("close", () => {
    if ($("kdlg").returnValue === "ok") { $("brows").replaceChildren(); rows = []; addRow(); say("Semua baris dihapus."); }
    $("kdlg").returnValue = "";
  });
  $("pdlg").addEventListener("close", () => { $("pmsg").hidden = true; });

  /* ---------- setelan ---------- */
  $("bf").addEventListener("change", () => {
    const prev = S.tipe; S = readSettings();
    if (S.tipe !== prev) rows.forEach((r) => { if (r.entry) { r.entry = remapEntry(D, r.entry, S.tipe); r.vi = 0; } showCat(r); });
    $("b-jadwal").options[1].textContent = `Tarif mulai ${S.tipe === "mall" ? "1 Jan 2027" : "1 Des 2026"}`;
    $("b-targetBox").hidden = S.mode !== "harga";
    $("bth-harga").replaceChildren(...(S.mode === "harga" ? ["Harga jual minimal"] : ["Harga asli", el("span", { className: "req", textContent: "*", ariaHidden: "true" })]));
    refreshAll();
  });
  $("b-target").addEventListener("input", () => { S = readSettings(); const bad = $("b-target").value.trim() === "" || !(num(S.target) >= 0 && num(S.target) < 100); $("b-etarget").hidden = !bad; $("b-etarget").className = "fmsg err"; $("b-etarget").textContent = bad ? "Isi target margin antara 0 dan di bawah 100." : ""; $("b-target").toggleAttribute("aria-invalid", bad); refreshAll(); });

  /* ---------- simpan di browser ---------- */
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ v: 1, S, rows: rows.map((r) => ({ n: r.n, c: r.entry && { k: r.entry.k, s: r.entry.s, j: r.entry.j.split(/;\s*/)[0] }, vi: r.vi, uk: r.uk, harga: r.harga, diskon: r.diskon, modal: r.modal, qty: r.qty })) })); } catch { /* penyimpanan penuh/diblokir: abaikan */ }
    }, 300);
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!d || d.v !== 1) return false;
      const set = { btipe: d.S.tipe, bmode: d.S.mode };
      for (const [n, v] of Object.entries(set)) { const i = document.querySelector(`[name=${n}][value=${v}]`); if (i) i.checked = true; }
      $("b-target").value = d.S.target; $("b-jadwal").value = d.S.jadwal; $("b-promo").value = d.S.promo; $("b-spay").value = d.S.spay;
      for (const k of ["xtra", "live", "video", "pre", "umk"]) $("b-" + k).checked = !!d.S[k];
      S = readSettings(); $("bf").dispatchEvent(new Event("change"));
      const all = D.kategori[S.tipe === "mall" ? "mall" : "reguler"];
      for (const p of d.rows.slice(0, MAX_ROWS)) {
        const cands = p.c ? all.filter((e) => e.k === p.c.k && e.s === p.c.s) : [];
        const entry = cands.find((e) => e.j.includes(p.c.j)) || cands[0] || null;
        addRow({ ...blank(), n: p.n, entry, vi: p.vi, uk: p.uk, harga: p.harga, diskon: p.diskon, modal: p.modal, qty: p.qty });
      }
      return rows.length > 0;
    } catch { return false; }
  }

  if (!load()) { S = readSettings(); addRow(); }
  totals();
}
