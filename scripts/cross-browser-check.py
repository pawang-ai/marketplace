#!/usr/bin/env python3
"""Uji lintas browser (Chromium, Firefox, WebKit) untuk kalkulator Shopee.

Pemakaian:
  python3 scripts/cross-browser-check.py                       # menyajikan ./public secara lokal
  python3 scripts/cross-browser-check.py --url https://pr-3-marketplace.pawangdev.workers.dev
  python3 scripts/cross-browser-check.py --engines firefox,webkit
  python3 scripts/cross-browser-check.py --engines chromium --simulate-fallback
      (menghapus interestfor, Invoker Commands, closedBy, dan anchor positioning agar jalur
       fallback yang dipakai Firefox/Safari lama ikut teruji di Chromium)

Prasyarat, di luar repo (bukan dependency proyek):
  pip install playwright && playwright install chromium firefox webkit

Keluar dengan kode 1 jika ada pemeriksaan GAGAL. Baris "info" hanya laporan dukungan fitur.
"""
import argparse, functools, http.server, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
FEATURES = {
    "popover": "'popover' in HTMLElement.prototype",
    "popover=hint": "(()=>{const d=document.createElement('div');d.setAttribute('popover','hint');return d.popover==='hint'})()",
    "interestfor": "'interestForElement' in HTMLButtonElement.prototype",
    "invoker commands": "'commandForElement' in HTMLButtonElement.prototype",
    "anchor positioning": "CSS.supports('position-area: block-start')",
    "container queries": "CSS.supports('container-type: inline-size')",
    "light-dark()": "CSS.supports('color: light-dark(red, blue)')",
    "dialog closedby": "'closedBy' in HTMLDialogElement.prototype",
    "async clipboard": "!!(navigator.clipboard && navigator.clipboard.writeText)",
}
IGNORE = ("ERR_NAME_NOT_RESOLVED", "fonts.g", "Failed to load resource", "NS_ERROR", "Load failed")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def run(engine, base, out, sim=False):
    def rec(name, ok, detail=""):
        out.append((name, "ok" if ok else "GAGAL", detail))
    with sync_playwright() as p:
        b = getattr(p, engine).launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
        if sim:
            ctx.add_init_script("""delete HTMLButtonElement.prototype.interestForElement; delete HTMLButtonElement.prototype.commandForElement; delete HTMLDialogElement.prototype.closedBy;
              const cs = CSS.supports.bind(CSS); CSS.supports = (...a) => (String(a[0]).includes('position-area') ? false : cs(...a));""")
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and not any(x in m.text for x in IGNORE) and errs.append(m.text))
        pg.goto(base + "/shopee/"); pg.wait_for_timeout(1200)
        for k, js in FEATURES.items():
            out.append((k, "info", "ya" if pg.evaluate(js) else "tidak (ada fallback)"))
        tip = lambda k: pg.evaluate(f"document.getElementById('h-{k}').matches(':popover-open')")
        btn = "button.help[aria-label='Penjelasan Tipe penjual']"
        pg.click(btn); pg.wait_for_timeout(300)
        r = pg.evaluate("""(()=>{const t=document.getElementById('h-tipe').getBoundingClientRect(), b=document.querySelector("button.help[aria-label='Penjelasan Tipe penjual']").getBoundingClientRect();
          const gap=Math.max(b.left-t.right, t.left-b.right, b.top-t.bottom, t.top-b.bottom, 0);
          return [t.left,t.top,t.right,t.bottom,innerWidth,innerHeight,gap,Math.abs((t.left+t.right)/2-innerWidth/2),Math.abs((t.top+t.bottom)/2-innerHeight/2)]})()""")
        rec("tooltip terbuka lewat klik", tip("tipe"))
        inside = r[0] >= 0 and r[2] <= r[4] and r[3] <= r[5]
        rec("tooltip di dalam layar, menempel ke tombol atau terpusat", inside and (r[6] < 40 or (r[7] < 12 and r[8] < 12)), f"jarak ke tombol {r[6]:.0f}px, posisi {r[0]:.0f},{r[1]:.0f}")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200); rec("Escape menutup tooltip", not tip("tipe"))
        pg.hover("button.help[aria-label='Penjelasan Kategori produk']"); pg.wait_for_timeout(600); rec("tooltip terbuka lewat hover", tip("kategori"))
        pg.mouse.move(5, 5); pg.wait_for_timeout(600); rec("tooltip tertutup saat kursor pergi", not tip("kategori"))
        pg.focus(btn); pg.keyboard.press("Enter"); pg.wait_for_timeout(300); rec("tooltip terbuka lewat keyboard (Enter)", tip("tipe")); pg.keyboard.press("Escape")
        pg.fill("#q", "kaos"); pg.wait_for_timeout(300); n = pg.locator("#res button").count()
        rec("pencarian kategori menampilkan hasil", n > 0, f"{n} hasil")
        pg.locator("#res button").first.click(); pg.wait_for_timeout(200)
        rec("memilih kategori mengisi biaya administrasi", "Biaya administrasi" in pg.inner_text("#chosen"))
        rec("footer memuat tanggal tarif", "tarif per" in pg.inner_text(".status"))
        m = ctx.new_page(); m.set_viewport_size({"width": 390, "height": 800}); m.goto(base + "/shopee/"); m.wait_for_timeout(900)
        m.fill("#q", "kaos"); m.wait_for_timeout(300)
        rec("tanpa scroll horizontal di 390px saat mencari", m.evaluate("document.documentElement.scrollWidth<=innerWidth")); m.close()
        pg.goto(base + "/shopee/#banyak"); pg.wait_for_timeout(1000); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(1000)
        pg.click("#brows tr .katbtn"); pg.wait_for_timeout(300); rec("dialog kategori terbuka", pg.evaluate("document.getElementById('cdlg').open"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200); rec("Escape menutup dialog kategori", not pg.evaluate("document.getElementById('cdlg').open"))
        pg.click("text=Tempel / impor"); pg.wait_for_timeout(300); rec("dialog impor terbuka lewat tombol", pg.evaluate("document.getElementById('pdlg').open"))
        dr = pg.evaluate("(()=>{const r=document.getElementById('pdlg').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]})()")
        rec("dialog berada di tengah layar", abs((dr[0] + dr[2]) / 2 - dr[4] / 2) < 8 and abs((dr[1] + dr[3]) / 2 - dr[5] / 2) < 8, f"kotak {dr[0]:.0f},{dr[1]:.0f}-{dr[2]:.0f},{dr[3]:.0f}")
        pg.mouse.click(4, 4); pg.wait_for_timeout(300); rec("klik di luar menutup dialog", not pg.evaluate("document.getElementById('pdlg').open"))
        pg.click("text=Tempel / impor"); pg.fill("#ptext", "Kaos, putih\tPakaian Muslim Anak\t100.000\t0\t60.000\t3"); pg.click("#pgo"); pg.wait_for_timeout(400)
        rec("impor tempel menghitung laba (Rp30.500/unit)", "30.500" in pg.inner_text("#brows tr")); rec("ringkasan total tampil", "Laba bersih" in pg.inner_text("#bsum"))
        with pg.expect_download() as d: pg.click("#b-csv")
        raw = open(d.value.path(), "rb").read(); rec("unduh CSV: BOM UTF-8 dan pemisah ;", raw[:3] == b"\xef\xbb\xbf" and b";" in raw, d.value.suggested_filename)
        pg.click("#b-copy"); pg.wait_for_timeout(500); out.append(("salin ke clipboard", "info", pg.inner_text("#bmsg")[:60]))
        pg.emulate_media(media="print"); pg.wait_for_timeout(200)
        rec("mode cetak menyembunyikan setelan & menampilkan tabel", pg.evaluate("getComputedStyle(document.querySelector('.bset')).display==='none' && getComputedStyle(document.getElementById('bt')).display!=='none'"))
        rec("tanpa galat JavaScript/konsol", not errs, "; ".join(errs)[:120]); b.close()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--url"); ap.add_argument("--engines", default="chromium,firefox,webkit"); ap.add_argument("--simulate-fallback", action="store_true")
    a = ap.parse_args(); srv = None
    base = a.url.rstrip("/") if a.url else None
    if not base: srv, base = serve()
    failed = False
    for e in a.engines.split(","):
        out = []
        try: run(e, base, out, a.simulate_fallback)
        except Exception as ex: out.append(("pengujian berhenti", "GAGAL", str(ex).splitlines()[0][:110]))
        print(f"\n== {e} ==")
        for n, s, d in out: print(f"  [{s:5}] {n}" + (f"  ({d})" if d else ""))
        failed |= any(s == "GAGAL" for _, s, _ in out)
    if srv: srv.shutdown()
    raise SystemExit(1 if failed else 0)


main()
