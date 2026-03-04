import React, { useMemo, useState } from "react";
import "./App.css";
import boxCatalog from "./boxCatalog.json";

/**
 * Fosdick Packaging Tool (frontend-only cartonization)
 * Multi-SKU support (different dims per item):
 * - “Engineered” packed dims are computed via a conservative heuristic:
 *   Use total volume + max dimension constraints to produce a bounding box that will always fit by volume.
 * - Stock options from boxCatalog.json are filtered by fit-with-rotation.
 * - Best option scoring: smallest billed weight, then smallest container volume.
 * - Hazmat/ORMD: restrict to rigid boxes; add handling notes scaffold.
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

function roundUpTo(x, step = 0.25) {
  return Math.ceil(x / step) * step;
}

// Returns all axis-aligned permutations of dims [l,w,h]
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

// Check if item dims fit in container inner dims with rotation allowed
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

// Simple hazmat rule scaffold (NOT full USPS compliance)
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
 * Multi-SKU “always fits” engineered packing heuristic:
 * - totalVol = sum(itemVol * qty)
 * - maxL,maxW,maxH = max single-item dims across all SKUs
 * - We try 3 base footprint options using the max dims as constraints, then compute required third dim by volume.
 * - Choose the option with smallest resulting bounding volume (tie-breaker: smallest max side).
 *
 * This is conservative (not perfect cartonization), but prevents impossible suggestions and always yields a fit.
 */
function engineeredPackedDimsFromVolume({ totalVol, maxL, maxW, maxH }) {
  const bases = [
    // base uses two max dimensions; compute third by volume; enforce >= remaining max
    { baseA: maxL, baseB: maxW, minC: maxH, label: "L×W base" },
    { baseA: maxL, baseB: maxH, minC: maxW, label: "L×H base" },
    { baseA: maxW, baseB: maxH, minC: maxL, label: "W×H base" },
  ];

  let best = null;

  for (const b of bases) {
    const baseArea = b.baseA * b.baseB;
    if (baseArea <= 0) continue;

    const rawC = totalVol / baseArea;
    const c = Math.max(b.minC, rawC);

    // Build dims; (A,B,C) are the bounding box sides
    const L = b.baseA;
    const W = b.baseB;
    const H = c;

    const vol = L * W * H;
    const maxSide = Math.max(L, W, H);

    const candidate = { L, W, H, vol, maxSide, label: b.label };

    if (!best) best = candidate;
    else {
      // choose smallest volume; tie-breaker smallest max side
      if (candidate.vol < best.vol) best = candidate;
      else if (candidate.vol === best.vol && candidate.maxSide < best.maxSide) best = candidate;
    }
  }

  // Fallback: cubic-ish using max dims constraints
  if (!best) {
    const side = Math.max(maxL, maxW, maxH, Math.cbrt(totalVol));
    best = { L: side, W: side, H: side, vol: side ** 3, maxSide: side, label: "Cube fallback" };
  }

  return best;
}

export default function App() {
  const [items, setItems] = useState([
    { id: crypto?.randomUUID?.() || "item-1", sku: "", l: "", w: "", h: "", wt: "", qty: "1" },
  ]);

  const [padding, setPadding] = useState("0.5"); // inches (per side)
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

    // Validate items and compute totals
    let totalVol = 0;
    let totalActualWt = 0;

    let maxL = 0, maxW = 0, maxH = 0;

    const normalizedItems = [];

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

      const volEach = l * w * h;
      totalVol += volEach * qty;
      totalActualWt += wt * qty;

      maxL = Math.max(maxL, l);
      maxW = Math.max(maxW, w);
      maxH = Math.max(maxH, h);

      normalizedItems.push({ ...it, l, w, h, wt, qty, volEach });
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

    // Compute engineered packed dims (pre-padding), then add padding
    const engineeredCore = engineeredPackedDimsFromVolume({ totalVol, maxL, maxW, maxH });

    const packed = {
      // Add padding on both sides => +2*pad
      l: roundUpTo(engineeredCore.L + 2 * pad, 0.25),
      w: roundUpTo(engineeredCore.W + 2 * pad, 0.25),
      h: roundUpTo(engineeredCore.H + 2 * pad, 0.25),
      actualWeightLb: roundUpTo(totalActualWt, 0.01),
      totalVolumeIn3: roundUpTo(totalVol, 1),
      method: engineeredCore.label,
    };

    notes.unshift(`Packed dims computed using conservative volume heuristic (${engineeredCore.label}).`);
    notes.push(`Total item volume: ${packed.totalVolumeIn3} in³.`);
    notes.push(`Max single-item dims constraint: ${maxL}×${maxW}×${maxH} in (used to prevent impossible packs).`);
    notes.push(`Padding applied: ${pad}" each side (adds ${2 * pad}" per dimension).`);
    notes.push(`DIM factor used: ${df}.`);

    // Engineered option billing uses ENGINEERED packed dims
    const engineered = {
      size: `${packed.l}×${packed.w}×${packed.h} (Custom/Engineered)`,
      dimWeightLb: roundUpTo(dimWeightLb({ l: packed.l, w: packed.w, h: packed.h, dimFactor: df }), 0.01),
      billedWeightLb: 0,
    };
    engineered.billedWeightLb = roundUpTo(Math.max(engineered.dimWeightLb, packed.actualWeightLb), 0.01);

    // STOCK OPTIONS
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
