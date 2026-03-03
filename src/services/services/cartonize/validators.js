export function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function normalizeItems(items) {
  const norm = [];

  for (const it of items) {
    const name = (it.name || "").trim() || "Item";
    const l = toNum(it.l);
    const w = toNum(it.w);
    const h = toNum(it.h);
    const wt = toNum(it.wt);
    const qty = Math.max(1, Math.floor(toNum(it.qty)));

    if ([l, w, h, wt, qty].some((x) => Number.isNaN(x)) || l <= 0 || w <= 0 || h <= 0 || wt < 0) {
      return { ok: false, error: `Invalid item: ${name}. Check L/W/H/Weight/Qty.` };
    }

    norm.push({ name, l, w, h, wt, qty });
  }

  if (norm.length === 0) return { ok: false, error: "Add at least one item." };

  return { ok: true, items: norm };
}

export function totalActualWeight(items) {
  return items.reduce((sum, it) => sum + it.wt * it.qty, 0);
}
