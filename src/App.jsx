import React, { useMemo, useState } from "react";
import boxCatalog from "./boxCatalog.json";

/**
 * Fosdick Packaging Tool (frontend-only cartonization)
 *
 * Restored features:
 * - Multi-SKU order entry (each line has its own dims/weight/qty)
 * - Padding + DIM factor (default 139)
 * - Hazmat/ORMD toggle + class dropdown
 * - Engineered (custom fit) + Stock options from boxCatalog.json
 * - Best option scoring: smallest billed weight, then smallest container volume
 * - Capacity utilization % and notes explaining methodology
 *
 * Notes:
 * - This is a heuristic cartonization (fast + practical), not a perfect 3D bin-pack solver.
 * - For Hazmat/ORMD, we restrict to rigid boxes only + add conservative handling notes.
 */

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

function clampInt(v, min = 1) {
  const n = Math.floor(toNum(v));
  return Number.isFinite(n) ? Math.max(min, n) : NaN;
}

function roundUpTo(x, step = 0.25) {
  return Math.ceil(x / step) * step;
}

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
  // DIM (lb) = (in^3) / dimFactor
  return (l * w * h) / dimFactor;
}

function hazmatRules(hazmatClass) {
  // Conservative scaffold (NOT a full USPS compliance engine)
  const notes = [];
  const forceRigidBox = true;

  if (/Class 3|Class 8/.test(hazmatClass)) {
    notes.push("Liquids/Corrosives: use leakproof primary + sealed polybag; add absorbent as needed.");
  }
  if (/Class 1/.test(hazmatClass)) {
    notes.push("Explosives: special permitting/acceptance required; review carrier restrictions.");
  }
  if (/Class 7/.test(hazmatClass)) {
    notes.push("Radioactive: special marking/acceptance required; review carrier restrictions.");
  }
  if (/ORM-D/.test(hazmatClass)) {
    notes.push("ORM-D legacy designation; confirm current marking/acceptance rules with carrier.");
  }

  notes.push("Hazmat/ORMD flagged: restrict to rigid boxes only + follow carrier acceptance rules.");

  return { forceRigidBox, notes };
}

/**
 * Heuristic cartonization for mixed SKUs:
 * - Expand items by quantity into unit list
 * - Pack in layers using a simple shelf algorithm (2D base packing),
 *   stacking layers in height.
 *
 * Returns packed dims (L, W, H) and some packing notes.
 */
function cartonizeMixedItems(units) {
  // Each unit: { l, w, h, weight, sku }
  // We'll treat "height" as h and rotate in base (l/w).
  // We create layers; each layer is shelf-packed in a width candidate.
  const notes = [];
  if (!units.length) return { L: 0, W: 0, H: 0, notes };

  // Sort by largest footprint (max(l,w) * min(l,w)) descending
  const sorted = [...units].sort((a, b) => {
    const a1 = Math.max(a.l, a.w) * Math.min(a.l, a.w);
    const b1 = Math.max(b.l, b.w) * Math.min(b.l, b.w);
    return b1 - a1;
  });

  const totalArea = sorted.reduce((sum, u) => sum + u.l * u.w, 0);
  const maxSide = sorted.reduce((m, u) => Math.max(m, u.l, u.w), 0);

  // Candidate widths to try (in inches)
  const candidatesW = [
    maxSide,
    Math.max(maxSide, Math.sqrt(totalArea) * 0.9),
    Math.max(maxSide, Math.sqrt(totalArea) * 1.0),
    Math.max(maxSide, Math.sqrt(totalArea) * 1.15),
    Math.max(maxSide, Math.sqrt(totalArea) * 1.3),
  ].map((x) => roundUpTo(x, 0.25));

  function packOneLayer(widthLimit, items) {
    // Shelf algorithm: place rectangles in rows across widthLimit; rows accumulate "length"
    // Return { usedW, usedL, layerH, placedCount, remainingItems }
    let rowRemainingW = widthLimit;
    let rowDepth = 0; // row "length" contribution (max rect depth in row)
    let usedL = 0;
    let usedW = widthLimit;
    let layerH = 0;

    const remaining = [];
    for (const u of items) {
      // choose orientation that fits remaining width best, else new row
      const opts = [
        { baseW: u.l, baseD: u.w },
        { baseW: u.w, baseD: u.l },
      ];

      let placed = false;

      // try current row
      for (const o of opts) {
        if (o.baseW <= rowRemainingW) {
          // place
          rowRemainingW -= o.baseW;
          rowDepth = Math.max(rowDepth, o.baseD);
          layerH = Math.max(layerH, u.h);
          placed = true;
          break;
        }
      }

      if (!placed) {
        // start new row
        usedL += rowDepth;
        rowRemainingW = widthLimit;
        rowDepth = 0;

        // try again in new row
        let placed2 = false;
        for (const o of opts) {
          if (o.baseW <= rowRemainingW) {
            rowRemainingW -= o.baseW;
            rowDepth = Math.max(rowDepth, o.baseD);
            layerH = Math.max(layerH, u.h);
            placed2 = true;
            break;
          }
        }

        if (!placed2) {
          // can't fit even in an empty row — widthLimit too small
          remaining.push(u);
        }
      }
    }

    usedL += rowDepth;

    return { usedW, usedL, layerH, remainingItems: remaining };
  }

  // We will choose the best packing among candidate widths, allowing multiple layers:
  // For each width candidate, we repeatedly pack layers until all items placed.
  let best = null;

  for (const W of candidatesW) {
    let remaining = [...sorted];
    let totalH = 0;
    let maxUsedL = 0;
    let layerCount = 0;

    // Safety break (shouldn't hit in normal use)
    let guard = 0;

    while (remaining.length && guard < 200) {
      guard += 1;
      const { usedL, layerH, remainingItems } = packOneLayer(W, remaining);

      // if no progress, abandon this width
      if (remainingItems.length === remaining.length) break;

      totalH += layerH;
      maxUsedL = Math.max(maxUsedL, usedL);
      remaining = remainingItems;
      layerCount += 1;
    }

    if (remaining.length) continue; // didn't pack all items for this W

    const L = roundUpTo(maxUsedL, 0.25);
    const vol = L * W * totalH;

    if (!best || vol < best.vol) {
      best = { L, W, H: totalH, vol, layerCount };
    }
  }

  // Fallback: stack along length (always works)
  if (!best) {
    const L = roundUpTo(sorted.reduce((sum, u) => sum + u.l, 0), 0.25);
    const W = roundUpTo(sorted.reduce((m, u) => Math.max(m, u.w), 0), 0.25);
    const H = roundUpTo(sorted.reduce((m, u) => Math.max(m, u.h), 0), 0.25);
    best = { L, W, H, vol: L * W * H, layerCount: 1 };
    notes.push("Fallback packing used (stack-along-length). Consider increasing catalog or refining pack rules.");
  } else {
    notes.push(`Heuristic packing: shelf-pack base + stacked layers (${best.layerCount} layer(s)).`);
  }

  return { L: best.L, W: best.W, H: best.H, notes };
}

function percent(n) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export default function App() {
  // Items array: each item has sku, l, w, h, weight, qty
  const [items, setItems] = useState([
    { sku: "SKU", l: "", w: "", h: "", weight: "", qty: "1" },
  ]);

  const [padding, setPadding] = useState("0.5"); // inches
  const [dimFactor, setDimFactor] = useState("139"); // default populated

  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState("");

  const [output, setOutput] = useState(null);
  const [error, setError] = useState("");

  const catalog = useMemo(() => {
    const boxes = Array.isArray(boxCatalog?.boxes) ? boxCatalog.boxes : [];
    const mailers = Array.isArray(boxCatalog?.mailers) ? boxCatalog.mailers : [];
    return { boxes, mailers };
  }, []);

  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { sku: "SKU", l: "", w: "", h: "", weight: "", qty: "1" }]);
  }

  function removeItem(idx) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

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

    // Hazmat selection check
    let haz = { forceRigidBox: false, notes: [] };
    if (isHazmat) {
      if (!hazmatClass) {
        setError("Please select a Hazmat/ORMD class.");
        return;
      }
      haz = hazmatRules(hazmatClass);
    }

    // Build unit list expanded by qty
    const units = [];
    let totalActualWeight = 0;
    let totalItemVolume = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const l = toNum(it.l);
      const w = toNum(it.w);
      const h = toNum(it.h);
      const wt = toNum(it.weight);
      const qty = clampInt(it.qty, 1);

      if (![l, w, h, wt, qty].every((v) => Number.isFinite(v))) {
        setError(`Item ${i + 1}: please enter valid L/W/H/Weight/Qty.`);
        return;
      }
      if (l <= 0 || w <= 0 || h <= 0 || wt < 0 || qty <= 0) {
        setError(`Item ${i + 1}: dimensions must be > 0. Weight >= 0. Qty >= 1.`);
        return;
      }

      for (let q = 0; q < qty; q++) {
        units.push({ sku: it.sku || `Item ${i + 1}`, l, w, h, weight: wt });
      }

      totalActualWeight += wt * qty;
      totalItemVolume += l * w * h * qty;
    }

    // Cartonize the mixed units (engineered, before padding)
    const packedRaw = cartonizeMixedItems(units);

    // Apply padding to all sides => + 2*pad per dimension
    const packed = {
      l: roundUpTo(packedRaw.L + 2 * pad, 0.25),
      w: roundUpTo(packedRaw.W + 2 * pad, 0.25),
      h: roundUpTo(packedRaw.H + 2 * pad, 0.25),
      actualWeightLb: roundUpTo(totalActualWeight, 0.01),
    };

    const engineeredVol = packed.l * packed.w * packed.h;
    const utilization = totalItemVolume / engineeredVol;

    const notes = [];
    notes.push("Method: heuristic shelf-pack base + stacked layers (fast approximation for mixed SKUs).");
    notes.push(...packedRaw.notes);
    notes.push(`Padding applied: ${pad}" each side (adds ${2 * pad}" per dimension).`);
    notes.push(`DIM factor used: ${df}.`);
    if (isHazmat) notes.push(...haz.notes);

    // Engineered option (custom fit)
    const engineered = {
      size: `${packed.l}×${packed.w}×${packed.h} (Engineered/Custom)`,
      dimWeightLb: roundUpTo(dimWeightLb({ l: packed.l, w: packed.w, h: packed.h, dimFactor: df }), 0.01),
      billedWeightLb: 0,
      volumeIn3: roundUpTo(engineeredVol, 1),
    };
    engineered.billedWeightLb = roundUpTo(Math.max(engineered.dimWeightLb, packed.actualWeightLb), 0.01);

    // Stock candidates
    const packedDimsArr = [packed.l, packed.w, packed.h];
    const candidates = [];

    // Boxes (always allowed; for hazmat required)
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
        kind: b.wall ? `${b.wall}-wall box` : "box",
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

        // "Slim" rule: packed height must fit mailer thickness
        if (packed.h > inner.h) continue;

        // Fit in 2D plane with rotation
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

    // Best option scoring: smallest billed weight, then smallest volume
    candidates.sort((a, b) => {
      if (a.billedWeightLb !== b.billedWeightLb) return a.billedWeightLb - b.billedWeightLb;
      return a.volumeIn3 - b.volumeIn3;
    });

    const stockOptions = candidates.slice(0, 5);

    setOutput({
      packed,
      engineered,
      utilization,
      stockOptions,
      notes,
      hazmat: isHazmat ? { enabled: true, hazmatClass } : { enabled: false },
    });
  };

  // ========= Styles (inline + a tiny global reset for border-box) =========
  const styles = {
    page: {
      padding: 24,
      maxWidth: 980,
      fontFamily: "Open Sans, Arial, sans-serif",
    },
    title: { fontSize: 34, fontWeight: 800, lineHeight: 1.1, marginBottom: 6 },
    subtitle: { fontSize: 14, opacity: 0.7, marginBottom: 18 },
    sectionTitle: { fontSize: 14, fontWeight: 800, marginTop: 18, marginBottom: 10 },
    btnRow: { display: "flex", gap: 10, alignItems: "center", marginTop: 10 },
    btn: { padding: "10px 14px", fontWeight: 800, cursor: "pointer" },
    ghostBtn: { padding: "8px 10px", fontWeight: 700, cursor: "pointer" },
    error: { marginTop: 14, padding: 12, border: "1px solid #f5c2c7", background: "#f8d7da" },
    card: {
      border: "1px solid #e5e7eb",
      background: "#fff",
      borderRadius: 10,
      padding: 14,
      marginBottom: 12,
      boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
    },
    cardTop: {
      display: "grid",
      gridTemplateColumns: "80px 1fr 90px",
      gap: 10,
      alignItems: "center",
      marginBottom: 10,
    },
    label: { fontWeight: 800, opacity: 0.8 },
    input: {
      width: "100%",
      padding: 10,
      border: "1px solid #666",
      borderRadius: 2,
      fontSize: 14,
    },
    // Key fix: columns are shrinkable (minmax(0,1fr)) so they don't overflow the card.
    dimsRow: {
      display: "grid",
      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
      gap: 10,
      alignItems: "center",
    },
    twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 },
    smallLabel: { fontSize: 12, fontWeight: 800, marginBottom: 6, opacity: 0.8 },
    results: { marginTop: 22 },
    resultsBox: { padding: 14, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fafafa" },
    pill: {
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      background: "#eef2ff",
      border: "1px solid #c7d2fe",
      marginLeft: 8,
    },
  };

  return (
    <div style={styles.page}>
      {/* Global border-box fix */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        input, select, button { box-sizing: border-box; }
      `}</style>

      <div style={styles.title}>Fosdick Packaging Tool</div>
      <div style={styles.subtitle}>Stock fit from catalog + engineered (custom) option</div>

      <form onSubmit={onSubmit}>
        {/* Items */}
        {items.map((it, idx) => (
          <div key={idx} style={styles.card}>
            <div style={styles.cardTop}>
              <div style={styles.label}>Item {idx + 1}</div>
              <input
                style={styles.input}
                placeholder="SKU / Item Name"
                value={it.sku}
                onChange={(e) => updateItem(idx, { sku: e.target.value })}
              />
              <button type="button" style={styles.ghostBtn} onClick={() => removeItem(idx)}>
                Remove
              </button>
            </div>

            {/* dims/weight/qty row */}
            <div style={styles.dimsRow}>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                placeholder="Length"
                value={it.l}
                onChange={(e) => updateItem(idx, { l: e.target.value })}
              />
              <input
                style={styles.input}
                type="number"
                step="0.01"
                placeholder="Width"
                value={it.w}
                onChange={(e) => updateItem(idx, { w: e.target.value })}
              />
              <input
                style={styles.input}
                type="number"
                step="0.01"
                placeholder="Height"
                value={it.h}
                onChange={(e) => updateItem(idx, { h: e.target.value })}
              />
              <input
                style={styles.input}
                type="number"
                step="0.01"
                placeholder="Weight (lb)"
                value={it.weight}
                onChange={(e) => updateItem(idx, { weight: e.target.value })}
              />
              <input
                style={styles.input}
                type="number"
                step="1"
                placeholder="Qty"
                value={it.qty}
                onChange={(e) => updateItem(idx, { qty: e.target.value })}
              />
            </div>
          </div>
        ))}

        <div style={styles.btnRow}>
          <button type="button" style={styles.ghostBtn} onClick={addItem}>
            Add Item
          </button>
        </div>

        {/* Padding + DIM Factor */}
        <div style={styles.twoCol}>
          <div>
            <div style={styles.smallLabel}>Padding (in)</div>
            <input
              style={styles.input}
              type="number"
              step="0.01"
              value={padding}
              onChange={(e) => setPadding(e.target.value)}
            />
          </div>
          <div>
            <div style={styles.smallLabel}>DIM Factor</div>
            <input
              style={styles.input}
              type="number"
              step="1"
              value={dimFactor}
              onChange={(e) => setDimFactor(e.target.value)}
            />
          </div>
        </div>

        {/* Hazmat */}
        <div style={{ marginTop: 16 }}>
          <div style={styles.sectionTitle}>Special Handling — Hazmat/ORMD?</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="hazmat" checked={isHazmat === true} onChange={() => setIsHazmat(true)} />
              Yes
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="hazmat"
                checked={isHazmat === false}
                onChange={() => {
                  setIsHazmat(false);
                  setHazmatClass("");
                }}
              />
              No
            </label>
          </div>

          {isHazmat && (
            <div style={{ marginTop: 10 }}>
              <select style={styles.input} value={hazmatClass} onChange={(e) => setHazmatClass(e.target.value)}>
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

        <div style={styles.btnRow}>
          <button type="submit" style={styles.btn}>
            Recommend Packaging
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Results */}
        {output && (
          <div style={styles.results}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Results</div>

            <div style={styles.resultsBox}>
              <div style={{ marginBottom: 10 }}>
                <strong>Packed (with padding):</strong> {output.packed.l} × {output.packed.w} × {output.packed.h} in
                <span style={styles.pill}>Utilization {percent(output.utilization)}</span>
                <div>Actual weight: {output.packed.actualWeightLb} lb</div>
                <div>DIM factor: {dimFactor}</div>
                {output.hazmat?.enabled ? <div>Hazmat/ORMD: {output.hazmat.hazmatClass}</div> : <div>Hazmat/ORMD: No</div>}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Engineered (Custom Fit)</div>
                <div>
                  <strong>{output.engineered.size}</strong>
                </div>
                <div>
                  Billed: {output.engineered.billedWeightLb} lb (DIM {output.engineered.dimWeightLb} lb) · Volume{" "}
                  {output.engineered.volumeIn3} in³
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Best Stock Options</div>
                {output.stockOptions?.length ? (
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    {output.stockOptions.map((o) => (
                      <li key={o.id} style={{ marginBottom: 10 }}>
                        <strong>{o.name}</strong>
                        <span style={{ fontWeight: 600, opacity: 0.75 }}> ({o.kind})</span>
                        <div>
                          Inner: {o.inner.l}×{o.inner.w}×{o.inner.h} in · Volume: {o.volumeIn3} in³
                        </div>
                        <div>
                          Billed: {o.billedWeightLb} lb (DIM {o.dimWeightLb} lb)
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div>No stock option fits from the current catalog. Use engineered/custom size.</div>
                )}
              </div>

              {output.notes?.length ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Notes / Methodology</div>
                  <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                    {output.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
