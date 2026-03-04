import React, { useMemo, useState } from "react";
import "./App.css";
import boxCatalog from "./boxCatalog.json";

const HAZMAT_CLASSES = [
  "Class 1: Explosives",
  "Class 2: Gases",
  "Class 3: Flammable Liquids",
  "Class 4: Flammable Solids",
  "Class 5: Oxidizers & Organic Peroxides",
  "Class 6: Toxic & Infectious Substances",
  "Class 7: Radioactive Materials",
  "Class 8: Corrosives",
  "Class 9: Miscellaneous",
  "ORM-D: Other Regulated Materials – Domestic",
];

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function roundUpTo(x, step = 0.25) {
  return Math.ceil(x / step) * step;
}

// All axis-aligned permutations of dims [l,w,h]
function permutations3([a, b, c]) {
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
}

// Fit item dims inside container inner dims with rotation allowed
function fitsWithRotation(itemDims, innerDims) {
  const itemPerms = permutations3(itemDims);
  for (const [il, iw, ih] of itemPerms) {
    if (il <= innerDims[0] && iw <= innerDims[1] && ih <= innerDims[2]) return true;
  }
  return false;
}

function containerVolume(inner) {
  return inner.l * inner.w * inner.h;
}

function dimWeightLb({ l, w, h, dimFactor }) {
  return (l * w * h) / dimFactor;
}

function hazmatRules(hazmatClass) {
  const notes = [];
  const forceRigidBox = true;

  const requiresLeakproof = /Class 3|Class 8/.test(hazmatClass);
  if (requiresLeakproof) notes.push("Use leakproof primary + sealed polybag + absorbent as needed.");

  if (/Class 1/.test(hazmatClass)) notes.push("Explosives: special permitting/acceptance required (review carrier restrictions).");
  if (/Class 7/.test(hazmatClass)) notes.push("Radioactive: special marking/acceptance required (review carrier restrictions).");
  if (/ORM-D/.test(hazmatClass)) notes.push("ORM-D legacy designation; confirm current marking/acceptance rules with carrier.");

  notes.push("Hazmat/ORMD flagged: restrict to rigid box packaging and follow carrier acceptance rules.");
  return { forceRigidBox, notes };
}

/**
 * Expand multi-SKU items into unit list (each unit has dims l,w,h and wt)
 */
function expandUnits(items) {
  const units = [];
  for (const it of items) {
    for (let i = 0; i < it.qty; i++) {
      units.push({
        id: `${it.id}__${i}`,
        sku: it.sku,
        dims: [it.l, it.w, it.h],
        wt: it.wt,
        vol: it.l * it.w * it.h,
      });
    }
  }
  // Largest-first packing tends to behave better
  units.sort((a, b) => b.vol - a.vol);
  return units;
}

/**
 * Greedy shelf packer on a fixed base (baseL x baseW):
 * - Packs units into rows (x direction), rows stack along W (y direction)
 * - When W filled, starts a new layer (adds layerHeight to totalHeight)
 * - Each unit can be rotated; we choose an orientation that fits and “best” fills remaining.
 *
 * Returns { ok, usedL, usedW, usedH, layers, placements? }
 */
function packGreedyShelves(units, baseL, baseW) {
  if (baseL <= 0 || baseW <= 0) return { ok: false, reason: "Invalid base" };

  let x = 0;             // current x position within row
  let y = 0;             // current y position within layer
  let rowDepth = 0;      // max footprint depth (along W) in the current row
  let layerHeight = 0;   // max item height in the current layer
  let totalHeight = 0;   // sum of completed layers
  let layers = 1;

  let usedL = 0;
  let usedW = 0;

  // For debugging you can store placements; keep off for speed/clean
  // const placements = [];

  const startNewRow = () => {
    x = 0;
    y += rowDepth;
    rowDepth = 0;
  };

  const startNewLayer = () => {
    totalHeight += layerHeight;
    layers += 1;
    x = 0;
    y = 0;
    rowDepth = 0;
    layerHeight = 0;
  };

  for (const u of units) {
    // Quick reject: if unit cannot fit on base in ANY orientation
    const perms = permutations3(u.dims);

    // Try to place this unit. We will attempt:
    // 1) Current row
    // 2) New row (same layer)
    // 3) New layer
    // Each attempt picks best orientation that fits remaining area.
    let placed = false;

    for (let attempt = 0; attempt < 3 && !placed; attempt++) {
      if (attempt === 1) {
        // new row
        startNewRow();
      } else if (attempt === 2) {
        // if new row didn't help, start a new layer
        // but only if there was something in the current layer
        if (layerHeight > 0) startNewLayer();
      }

      const remainingL = baseL - x;
      const remainingW = baseW - y;

      // Collect all orientations that fit in the remaining rectangle
      const fits = [];
      for (const [pl, pw, ph] of perms) {
        if (pl <= remainingL && pw <= remainingW) {
          // Score: prefer smallest leftover L, then smallest leftover W, then smallest height
          const score =
            (remainingL - pl) * 1000000 +
            (remainingW - pw) * 1000 +
            ph;
          fits.push({ pl, pw, ph, score });
        }
      }

      if (fits.length === 0) continue;

      fits.sort((a, b) => a.score - b.score);
      const best = fits[0];

      // Place it
      // placements.push({ unit: u.id, x, y, l: best.pl, w: best.pw, h: best.ph, layer: layers });

      x += best.pl;
      rowDepth = Math.max(rowDepth, best.pw);
      layerHeight = Math.max(layerHeight, best.ph);

      usedL = Math.max(usedL, x);
      usedW = Math.max(usedW, y + rowDepth);

      placed = true;
    }

    if (!placed) {
      // Even after starting a new layer, could not place (means unit > base in all orientations)
      return { ok: false, reason: "Unit does not fit base footprint", baseL, baseW };
    }
  }

  const usedH = totalHeight + layerHeight;

  return {
    ok: true,
    usedL: Math.min(baseL, usedL),
    usedW: Math.min(baseW, usedW),
    usedH,
    layers,
  };
}

/**
 * Choose engineered dims by trying a small candidate set of base footprints.
 * We pick the smallest resulting volume (L*W*H), tie-breaker: smallest max side.
 */
function chooseBestEngineered(units, baseCandidates) {
  let best = null;

  for (const c of baseCandidates) {
    const res = packGreedyShelves(units, c.L, c.W);
    if (!res.ok) continue;

    const L = c.L;
    const W = c.W;
    const H = res.usedH;

    const vol = L * W * H;
    const maxSide = Math.max(L, W, H);

    const cand = { L, W, H, vol, maxSide, layers: res.layers, label: c.label };

    if (!best) best = cand;
    else if (cand.vol < best.vol) best = cand;
    else if (cand.vol === best.vol && cand.maxSide < best.maxSide) best = cand;
  }

  return best;
}

export default function App() {
  const [items, setItems] = useState([
    { id: crypto?.randomUUID?.() || "item-1", sku: "", l: "", w: "", h: "", wt: "", qty: "1" },
  ]);

  const [padding, setPadding] = useState("0.5"); // inches per side
  const [dimFactor, setDimFactor] = useState("139");

  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState("");

  const [output, setOutput] = useState(null);
  const [error, setError] = useState("");

  const catalog = useMemo(() => {
    const boxes = Array.isArray(boxCatalog?.boxes) ? boxCatalog.boxes : [];
    const mailers = Array.isArray(boxCatalog?.mailers) ? boxCatalog.mailers : [];
    return { boxes, mailers };
  }, []);

  const resetResultOnEdit = () => {
    setOutput(null);
    setError("");
  };

  const addItemRow = () => {
    resetResultOnEdit();
    setItems((prev) => [
      ...prev,
      { id: crypto?.randomUUID?.() || `item-${prev.length + 1}`, sku: "", l: "", w: "", h: "", wt: "", qty: "1" },
    ]);
  };

  const removeItemRow = (id) => {
    resetResultOnEdit();
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((x) => x.id !== id)));
  };

  const updateItem = (id, patch) => {
    resetResultOnEdit();
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setError("");
    setOutput(null);

    const pad = toNum(padding);
    const df = toNum(dimFactor);

    if (![pad, df].every((v) => Number.isFinite(v))) {
      setError("Please enter valid numbers for Padding and DIM Factor.");
      return;
    }
    if (pad < 0 || df <= 0) {
      setError("Padding must be >= 0. DIM Factor must be > 0.");
      return;
    }

    // Validate items
    const normalizedItems = [];
    let totalActualWt = 0;

    let maxL = 0, maxW = 0, maxH = 0;

    for (const it of items) {
      const l = toNum(it.l);
      const w = toNum(it.w);
      const h = toNum(it.h);
      const wt = toNum(it.wt);
      const qty = Math.max(1, Math.floor(toNum(it.qty)));

      if (![l, w, h, wt].every((v) => Number.isFinite(v))) {
        setError("Please enter valid numeric L/W/H/Weight for all item rows.");
        return;
      }
      if (l <= 0 || w <= 0 || h <= 0 || wt < 0) {
        setError("Item dimensions must be > 0, and weight must be >= 0.");
        return;
      }

      totalActualWt += wt * qty;

      maxL = Math.max(maxL, l);
      maxW = Math.max(maxW, w);
      maxH = Math.max(maxH, h);

      normalizedItems.push({ ...it, l, w, h, wt, qty });
    }

    if (normalizedItems.length === 0) {
      setError("Add at least one item.");
      return;
    }

    // Hazmat
    let haz = { forceRigidBox: false, notes: [] };
    const notes = [];

    if (isHazmat) {
      if (!hazmatClass) {
        setError("Please select a Hazmat/ORMD class.");
        return;
      }
      haz = hazmatRules(hazmatClass);
      notes.push(...haz.notes);
    }

    // Expand units and pack
    const units = expandUnits(normalizedItems);

    // Candidate base footprints:
    // 1) A few computed bases near the max dims
    // 2) A handful of stock box bases (helps produce realistic bases)
    const computedBases = [
      { L: roundUpTo(maxL, 0.25), W: roundUpTo(maxW, 0.25), label: "Base = maxL × maxW" },
      { L: roundUpTo(maxL, 0.25), W: roundUpTo(maxH, 0.25), label: "Base = maxL × maxH" },
      { L: roundUpTo(maxW, 0.25), W: roundUpTo(maxH, 0.25), label: "Base = maxW × maxH" },
      // Slightly expanded bases to allow better row packing
      { L: roundUpTo(maxL * 1.25, 0.25), W: roundUpTo(maxW * 1.25, 0.25), label: "Base = 1.25× maxL/maxW" },
      { L: roundUpTo(maxL * 1.5, 0.25), W: roundUpTo(maxW, 0.25), label: "Base = 1.5× maxL, maxW" },
      { L: roundUpTo(maxL, 0.25), W: roundUpTo(maxW * 1.5, 0.25), label: "Base = maxL, 1.5× maxW" },
    ];

    const stockBoxBases = catalog.boxes
      .slice()
      .sort((a, b) => containerVolume(a.inner) - containerVolume(b.inner))
      .slice(0, 12)
      .map((b) => ({
        L: roundUpTo(b.inner.l, 0.25),
        W: roundUpTo(b.inner.w, 0.25),
        label: `Base from stock: ${b.name}`,
      }));

    const baseCandidates = [...computedBases, ...stockBoxBases];

    const engineeredCore = chooseBestEngineered(units, baseCandidates);

    if (!engineeredCore) {
      setError("Could not find an engineered base footprint that packs all units. Increase catalog sizes or add larger stock boxes.");
      return;
    }

    // Apply padding to all dims (both sides)
    const packed = {
      l: roundUpTo(engineeredCore.L + 2 * pad, 0.25),
      w: roundUpTo(engineeredCore.W + 2 * pad, 0.25),
      h: roundUpTo(engineeredCore.H + 2 * pad, 0.25),
      actualWeightLb: roundUpTo(totalActualWt, 0.01),
      layers: engineeredCore.layers,
      method: `Greedy shelves (${engineeredCore.label})`,
    };

    notes.unshift(`Packed dims computed via greedy shelf packing on base footprint, then padding added.`);
    notes.push(`Method: ${packed.method}`);
    notes.push(`Layers used: ${packed.layers}`);
    notes.push(`Padding applied: ${pad}" each side (adds ${2 * pad}" per dimension).`);
    notes.push(`DIM factor used: ${df}.`);
    notes.push(`Max single-item dims constraint (input): ${maxL}×${maxW}×${maxH} in.`);

    const engineered = {
      size: `${packed.l}×${packed.w}×${packed.h} (Custom/Engineered)`,
      dimWeightLb: roundUpTo(dimWeightLb({ l: packed.l, w: packed.w, h: packed.h, dimFactor: df }), 0.01),
      billedWeightLb: 0,
    };
    engineered.billedWeightLb = roundUpTo(Math.max(engineered.dimWeightLb, packed.actualWeightLb), 0.01);

    // STOCK OPTIONS (fit packed dims)
    const packedDimsArr = [packed.l, packed.w, packed.h];
    const candidates = [];

    // Boxes
    for (const b of catalog.boxes) {
      const inner = b?.inner;
      if (!inner) continue;

      const innerDims = [inner.l, inner.w, inner.h];
      if (!fitsWithRotation(packedDimsArr, innerDims)) continue;

      const dimW = dimWeightLb({ l: inner.l, w: inner.w, h: inner.h, dimFactor: df });
      const billed = Math.max(dimW, packed.actualWeightLb);

      candidates.push({
        id: b.id,
        name: b.name,
        kind: "box",
        inner,
        volumeIn3: roundUpTo(containerVolume(inner), 1),
        dimWeightLb: roundUpTo(dimW, 0.01),
        billedWeightLb: roundUpTo(billed, 0.01),
      });
    }

    // Mailers (only if NOT hazmat)
    if (!haz.forceRigidBox) {
      for (const m of catalog.mailers) {
        const inner = m?.inner;
        if (!inner) continue;

        // Slim logic: require packed height <= inner height
        if (packed.h > inner.h) continue;

        // 2D fit for L/W
        const fit2D =
          (packed.l <= inner.l && packed.w <= inner.w) || (packed.w <= inner.l && packed.l <= inner.w);
        if (!fit2D) continue;

        const dimW = dimWeightLb({ l: inner.l, w: inner.w, h: inner.h, dimFactor: df });
        const billed = Math.max(dimW, packed.actualWeightLb);

        candidates.push({
          id: m.id,
          name: m.name,
          kind: m.type || "mailer",
          inner,
          volumeIn3: roundUpTo(containerVolume(inner), 1),
          dimWeightLb: roundUpTo(dimW, 0.01),
          billedWeightLb: roundUpTo(billed, 0.01),
        });
      }
    }

    // Score: smallest billed weight, then smallest volume
    candidates.sort((a, b) => {
      if (a.billedWeightLb !== b.billedWeightLb) return a.billedWeightLb - b.billedWeightLb;
      return a.volumeIn3 - b.volumeIn3;
    });

    const stockOptions = candidates.slice(0, 3);

    setOutput({
      ok: true,
      items: normalizedItems,
      packed,
      engineered,
      stockOptions,
      notes,
      hazmat: isHazmat ? { enabled: true, hazmatClass } : { enabled: false },
    });
  };

  return (
    <div className="app-container" style={{ padding: 24, fontFamily: "Open Sans, Arial, sans-serif" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>Fosdick Packaging Tool</div>
        <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>
          Stock fit from catalog + engineered (custom) option
        </div>
      </div>

      <form onSubmit={onSubmit} style={{ maxWidth: 880 }}>
        {/* ITEM ROWS */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Order Items</div>
            <button type="button" onClick={addItemRow} style={{ padding: "8px 10px", fontWeight: 800 }}>
              + Add Item
            </button>
          </div>

          {items.map((it, idx) => (
            <div
              key={it.id}
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
                background: "white",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 800, opacity: 0.8 }}>Item {idx + 1}</div>
                <input
                  type="text"
                  placeholder="SKU / Name (optional)"
                  value={it.sku}
                  onChange={(e) => updateItem(it.id, { sku: e.target.value })}
                  style={{ flex: 1, padding: 10 }}
                />
                <button
                  type="button"
                  onClick={() => removeItemRow(it.id)}
                  style={{ padding: "8px 10px", fontWeight: 800, opacity: items.length === 1 ? 0.4 : 1 }}
                  disabled={items.length === 1}
                  title={items.length === 1 ? "Need at least one item" : "Remove item"}
                >
                  Remove
                </button>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Length (in)"
                  value={it.l}
                  onChange={(e) => updateItem(it.id, { l: e.target.value })}
                  style={{ flex: 1, padding: 10 }}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Width (in)"
                  value={it.w}
                  onChange={(e) => updateItem(it.id, { w: e.target.value })}
                  style={{ flex: 1, padding: 10 }}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Height (in)"
                  value={it.h}
                  onChange={(e) => updateItem(it.id, { h: e.target.value })}
                  style={{ flex: 1, padding: 10 }}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Weight (lb)"
                  value={it.wt}
                  onChange={(e) => updateItem(it.id, { wt: e.target.value })}
                  style={{ flex: 1, padding: 10 }}
                />
                <input
                  type="number"
                  step="1"
                  placeholder="Qty"
                  value={it.qty}
                  onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                  style={{ width: 110, padding: 10 }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* PACK RULE INPUTS */}
        <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.8 }}>Padding (in)</div>
            <input
              type="number"
              step="0.01"
              value={padding}
              onChange={(e) => {
                resetResultOnEdit();
                setPadding(e.target.value);
              }}
              style={{ width: "100%", padding: 10 }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.8 }}>DIM Factor</div>
            <input
              type="number"
              step="1"
              value={dimFactor}
              onChange={(e) => {
                resetResultOnEdit();
                setDimFactor(e.target.value);
              }}
              style={{ width: "100%", padding: 10 }}
            />
          </div>
        </div>

        {/* Hazmat */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Special Handling — Hazmat/ORMD?</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="hazmat"
                checked={isHazmat === true}
                onChange={() => {
                  resetResultOnEdit();
                  setIsHazmat(true);
                }}
              />
              Yes
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="hazmat"
                checked={isHazmat === false}
                onChange={() => {
                  resetResultOnEdit();
                  setIsHazmat(false);
                  setHazmatClass("");
                }}
              />
              No
            </label>
          </div>

          {isHazmat && (
            <div style={{ marginTop: 10 }}>
              <select
                value={hazmatClass}
                onChange={(e) => {
                  resetResultOnEdit();
                  setHazmatClass(e.target.value);
                }}
                style={{ width: "100%", padding: 10 }}
              >
                <option value="">Select Hazmat/ORMD Class</option>
                {HAZMAT_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button type="submit" style={{ padding: "10px 14px", fontWeight: 800 }}>
          Recommend Packaging
        </button>

        {error && (
          <div style={{ marginTop: 14, padding: 12, border: "1px solid #f5c2c7", background: "#f8d7da" }}>
            {error}
          </div>
        )}

        {/* RESULTS */}
        {output?.ok === true && (
          <div className="results" style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Results</h2>

            <div style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Order Summary</h3>
              <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                {output.items.map((it) => (
                  <li key={it.id}>
                    <strong>{it.sku?.trim() ? it.sku : "Item"}</strong>{" "}
                    — {it.qty} × {it.l}×{it.w}×{it.h} in, {it.wt} lb ea
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <strong>Packed (with padding):</strong>
              <br />
              {output.packed.l} × {output.packed.w} × {output.packed.h} in
              <br />
              Actual weight: {output.packed.actualWeightLb} lb
              <br />
              Method: {output.packed.method}
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Engineered (Custom Fit)</h3>
              <div>
                <strong>{output.engineered.size}</strong>
              </div>
              <div>
                Billed: {output.engineered.billedWeightLb} lb (DIM {output.engineered.dimWeightLb} lb)
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Best Stock Options</h3>
              {output.stockOptions?.length ? (
                <ol style={{ paddingLeft: 18, margin: 0 }}>
                  {output.stockOptions.map((o) => (
                    <li key={o.id} style={{ marginBottom: 10 }}>
                      <strong>
                        {o.name} <span style={{ fontWeight: 600, opacity: 0.75 }}>({o.kind})</span>
                      </strong>
                      <br />
                      Inner: {o.inner.l}×{o.inner.w}×{o.inner.h} in
                      <br />
                      Billed: {o.billedWeightLb} lb (DIM {o.dimWeightLb} lb)
                      <br />
                      Volume: {o.volumeIn3} in³
                    </li>
                  ))}
                </ol>
              ) : (
                <div>No stock option fits from the current catalog. Use engineered/custom size.</div>
              )}
            </div>

            {output.notes?.length ? (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Notes</h4>
                <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                  {output.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </form>
    </div>
  );
}
