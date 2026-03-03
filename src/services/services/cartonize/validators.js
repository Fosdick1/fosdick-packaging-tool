export function validateInputs({ items, padInches, dimFactor, catalog }) {
  if (!catalog) return { ok: false, error: "Missing box catalog." };

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Add at least one item." };
  }

  const pad = Number(padInches);
  const df = Number(dimFactor);

  if (!Number.isFinite(pad) || pad < 0) return { ok: false, error: "Padding must be 0 or greater." };
  if (!Number.isFinite(df) || df <= 0) return { ok: false, error: "DIM factor must be a positive number." };

  for (const it of items) {
    const l = Number(it.l);
    const w = Number(it.w);
    const h = Number(it.h);
    const wt = Number(it.wt);
    const qty = Number(it.qty);

    if (!Number.isFinite(l) || l <= 0) return { ok: false, error: "All item lengths must be > 0." };
    if (!Number.isFinite(w) || w <= 0) return { ok: false, error: "All item widths must be > 0." };
    if (!Number.isFinite(h) || h <= 0) return { ok: false, error: "All item heights must be > 0." };
    if (!Number.isFinite(wt) || wt < 0) return { ok: false, error: "All item weights must be ≥ 0." };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "All quantities must be > 0." };
  }

  return { ok: true };
}
