#!/usr/bin/env python3
"""Ekstrak tarif penjual Shopee dari index.db (Seller Edu) ke public/data/shopee.json.

Pemakaian: python3 scripts/extract-shopee.py /path/index.db [public/data/shopee.json]
Hanya stdlib. Artikel sumber: 15965 (admin per kategori), 7216 (Gratis Ongkir XTRA),
3489 (ringkasan biaya), 25787 (proses pesanan), 28672 (insentif UMK).
Tabel sumber memakai sel gabungan; baris yang kehilangan sel diwarisi dari baris
di atasnya (kategori, sub kategori, tarif), lalu hasilnya divalidasi.
"""
import collections, json, re, sqlite3, sys

DB = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/data/shopee.json"
BASE = "https://seller.shopee.co.id/edu/article/"
db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)


def page(aid):
    return db.execute("select title, markdown, updated, fetched_at from pages where url like ?", (f"%/article/{aid}",)).fetchone()


def cells(line):
    return [c.strip() for c in line.strip()[1:-1].split("|")]


def num(text):
    return float(text.replace(",", "."))


def norm(text):
    return re.sub(r"\W+", "", text.lower())


def is_data_row(line, c):
    return line.startswith("|") and not c[0].startswith("**") and not set(c[0]) <= set("- ")


# ---- Biaya administrasi per kategori (15965) ----------------------------------
PCT = re.compile(r"^(\d{1,2}(?:,\d{1,2})?)\s*%")


def parse_admin(md):
    lines = md.split("\n")
    mall_start = next(i for i, l in enumerate(lines) if "SHOPEE MALL**" in l and l.startswith("| **KATEGORI"))
    sets = {"reguler": [], "mall": []}
    group = kat = sub = fee = None
    for i, l in enumerate(lines):
        which = "reguler" if i < mall_start else "mall"
        if l.startswith("## "):
            group = re.sub(r"[*#]|^\s*Kategori\s*", "", l).strip()
            kat = sub = fee = None
            continue
        if not l.startswith("|"):
            continue
        c = cells(l)
        if not is_data_row(l, c):
            continue
        while c and c[-1] == "":
            c.pop()
        if not c:
            continue
        m = PCT.match(c[-1].replace("\\*", "").strip())
        if m:
            fee = num(m.group(1))
            c.pop()
        if len(c) >= 3:
            kat, sub, jenis = c[-3:]
        elif len(c) == 2:
            sub, jenis = c
        elif len(c) == 1:
            jenis = c[0]
        else:
            continue
        if fee is None or kat is None:
            raise SystemExit(f"baris {i}: tarif/kategori tidak ditemukan: {l[:80]}")
        sets[which].append(dict(g=group, k=kat, s=sub, j=jenis, a=fee))
    # gabungkan baris dengan (kategori, sub, tarif) sama
    merged = {}
    for which, rows in sets.items():
        d = collections.OrderedDict()
        for r in rows:
            key = (r["g"], r["k"], r["s"], r["a"])
            d.setdefault(key, []).append(r["j"])
        merged[which] = [dict(id=f"{which[0]}{n}", g=k[0], k=k[1], s=k[2], a=k[3], j="; ".join(js)) for n, (k, js) in enumerate(d.items())]
    return merged


# ---- Gratis Ongkir XTRA (7216) -------------------------------------------------
RATE = re.compile(r"^(\d{1,2}(?:,\d{1,2})?)\s*%[\s%]*\(maks\.?\s*Rp\s*([\d.]+)")


def parse_xtra(md):
    lines = md.split("\n")
    split = next(i for i, l in enumerate(lines) if l.startswith("## ") and "per per 1 Des 2026" in l)
    out = {"now": [], "des": []}
    kat = letter = sub = rates = None
    for i, l in enumerate(lines):
        which = "now" if i < split else "des"
        if l.startswith("## ") or not l.startswith("|"):
            continue
        c = cells(l)
        if not is_data_row(l, c):
            continue
        while c and c[-1] == "":
            c.pop()
        if not c:
            continue
        found = []
        while c and RATE.match(c[-1]):
            m = RATE.match(c.pop())
            cap = int(m.group(2).replace(".", ""))
            if cap == 400000:  # salah ketik di sumber ("Rp40.0000")
                cap = 40000
            found.insert(0, [num(m.group(1)), cap])
        letters = [j for j, x in enumerate(c) if re.fullmatch(r"[A-Z]", x)]
        if letters:
            j = letters[0]
            if c[:j]:
                kat = c[j - 1]
            post = c[j + 1:]
            if len(post) >= 2:
                sub, jenis = post[-2:]
            elif post:
                jenis = post[0]
            else:
                continue
        elif len(c) >= 3:
            kat, sub, jenis = c[-3:]
        elif len(c) == 2:
            sub, jenis = c
        else:
            continue
        if found:
            if len(found) != 2:
                raise SystemExit(f"baris {i}: XTRA tarif tidak lengkap: {l[:90]}")
            rates = found
        out[which].append(dict(k=kat, s=sub, j=jenis, b=rates[0], x=rates[1]))
    return out


def items(text):
    return {norm(x) for x in re.split(r",\s*|;\s*", text) if norm(x)}


def xtra_variants(rows, kat, sub, jenis):
    """Varian tarif XTRA untuk (kategori, sub), dibatasi ke jenis produk yang
    beririsan dengan entri administrasi. Dedup per pasangan tarif."""
    hits = [r for r in rows if norm(r["k"]) == norm(kat) and norm(r["s"]) == norm(sub)]
    if not hits:  # sebagian nama kategori beda antar tabel: cocokkan lewat sub kategori saja
        hits = [r for r in rows if norm(r["s"]) == norm(sub)]
    mine = items(jenis)
    hits = [r for r in hits if items(r["j"]) & mine] or hits
    d = collections.OrderedDict()
    for r in hits:
        d.setdefault((tuple(r["b"]), tuple(r["x"])), []).append(r["j"])
    one = len(d) == 1
    return [dict(b=list(k[0]), x=list(k[1]), **({} if one else {"j": "; ".join(js)})) for k, js in d.items()]


def main():
    admin_title, admin_md, admin_upd, fetched = page("15965")
    xtra_title, xtra_md, xtra_upd, _ = page("7216")
    admin = parse_admin(admin_md)
    xtra = parse_xtra(xtra_md)
    stats = collections.Counter()
    for which, rows in admin.items():
        for r in rows:
            r["xn"] = xtra_variants(xtra["now"], r["k"], r["s"], r["j"])
            r["xd"] = xtra_variants(xtra["des"], r["k"], r["s"], r["j"])
            stats[which, "xn_kosong"] += not r["xn"]
            stats[which, "xd_kosong"] += not r["xd"]
            stats[which, "xn_ambigu"] += len(r["xn"]) > 1
    data = {
        "meta": {
            "diambil": fetched[:10],
            "diperbarui": {"admin": admin_upd, "xtra": xtra_upd},
            "sumber": {k: BASE + v for k, v in dict(admin="15965", xtra="7216", ringkasan="3489", prosesPesanan="25787", umk="28672").items()},
            "xtraMulai": {"nonMall": "2026-12-01", "mall": "2027-01-01"},
        },
        "tetap": {
            "prosesPesanan": 1250,
            "mallPembayaran": {"persen": 1.8, "maks": 50000},
            "promoXtra": {"persen": 4.5, "maks": 60000},
            "promoXtraPlus": {"persen": 6.5, "maks": 80000},
            "live": {"persen": 3, "persenDenganPromo": 2, "maks": 20000},
            "video": {"persen": 3, "persenDenganPromo": 2, "maks": 20000},
            "spaylater": {"3": 2.5, "6": 4.0},
            "preorder": 3,
            "umk": {"persen": 50, "mulai": "2026-11-13"},
        },
        "kategori": admin,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{OUT}: reguler={len(admin['reguler'])} mall={len(admin['mall'])}", dict(stats))


main()
