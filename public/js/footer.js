/** Footer bersama: membaca /data/meta.json (ditulis scripts/extract-shopee.py). */
const dmy = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
let cache;

/** @returns {Promise<{marketplaces: Record<string, any>} | null>} null jika gagal dimuat */
export function loadMeta() {
  cache ??= fetch("/data/meta.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cache;
}

/** Mengisi segmen status bar dari data. Segmen yang datanya tidak ada tetap tersembunyi. */
export async function initFooter() {
  const bar = document.querySelector("[data-footer]"), meta = await loadMeta();
  if (!bar || !meta) return;
  const all = Object.entries(meta.marketplaces), key = bar.dataset.mp, own = key && meta.marketplaces[key];
  const scope = bar.querySelector('[data-f="scope"]'), data = bar.querySelector('[data-f="data"]');
  scope.textContent = own ? `${key} ✓` : `${all.length} marketplace ✓`;
  const per = (own ? [own] : all.map(([, m]) => m)).map((m) => m.tarifPer).sort().at(-1);
  data.textContent = `tarif per ${dmy(per)}`;
  data.title = (own ? [own] : all.map(([, m]) => m)).map((m) => `${m.nama}: diambil ${dmy(m.diambil)}`).join(" · ");
  scope.hidden = data.hidden = false;
}
initFooter();
