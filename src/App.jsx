// src/App.jsx
import React, { useMemo, useState } from "react";
import "./App.css";
import logo from "./Logo.png";
import boxCatalog from "./boxCatalog.json";

/**
 * Fosdick Packaging Tool (frontend-only cartonization)
 * - Picks “best option” by: smallest billed weight, then smallest container volume
 * - Shows Engineered (custom fit) + Stock options (from boxCatalog.json)
 * - Supports simple multi-pack (same item * multiplier) via best 3D arrangement
 * - Hazmat toggle: restricts to rigid boxes; adds handling notes (light rules scaffold)
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

// Compute best 3D arrangement for n identical items to minimize packed volume.
// We try all factorizations a*b*c = n (integer) and pick smallest volume.
function bestArrangementPackedDims({ l, w, h, n }) {
  let best = null;

  for (let a = 1; a <= n; a++) {
    if (n % a !== 0) continue;
    const n2 = n / a;
    for (let b = 1; b <= n2; b++) {
      if (n2 % b !== 0) continue;
      const c = n2 / b;

      const L = l * a;
      const W = w * b;
      const H = h * c;

      const vol = L * W * H;
      if (!best || vol < best.vol) best = { L, W, H, vol, a, b, c };
    }
  }

  // If n is prime, we still get (1,1,n) etc — above covers it.
  return best || { L: l * n, W: w, H: h, vol: l * n * w * h, a: n, b: 1, c: 1 };
}

function containerVolume(inner) {
  return inner.l * inner.w * inner.h;
}

function dimWeightLb({ l, w, h, dimFactor }) {
  // inches / dimFactor -> lbs (common parcel DIM formula)
  return (l * w * h) / dimFactor;
}

// Simple hazmat rule scaffold (NOT a full USPS compliance engine)
function hazmatRules(hazmatClass) {
  // Keep this conservative: force rigid box for all hazmat/ormd for now.
  // You can refine later with class-specific packaging constraints.
  const notes = [];
  const forceRigidBox = true;

  // Slightly stricter for liquids/corrosives:
  const requiresLeakproof = /Class 3|Class 8/.test(hazmatClass);
  if (requiresLeakproof) notes.push("Use leakproof primary + sealed polybag + absorbent as needed.");

  // Explosives/Radioactive: add caution note (still force box)
  if (/Class 1/.test(hazmatClass)) notes.push("Explosives: special permitting/acceptance required (review USPS restrictions).");
  if (/Class 7/.test(hazmatClass)) notes.push("Radioactive: special marking/acceptance required (review USPS restrictions).");

  // ORM-D (legacy): note transition
  if (/ORM-D/.test(hazmatClass)) notes.push("ORM-D legacy designation; confirm current marking/acceptance rules with carrier.");

  // Add generic note:
  notes.push("Hazmat/ORMD flagged: restrict to rigid box packaging and follow carrier acceptance rules.");

  return { forceRigidBox, notes };
}

export default function App() {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [multiplier, setMultiplier] = useState("1");

  const [padding, setPadding] = useState("0.5"); // inches
  const [dimFactor, setDimFactor] = useState("139"); // default populated as requested

  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState("");

  const [output, setOutput] = useState(null);
  const [error, setError] = useState("");

  const catalog = useMemo(() => {
    const boxes = Array.isArray(boxCatalog?.boxes) ? boxCatalog.boxes : [];
    const mailers = Array.isArray(boxCatalog?.mailers) ? boxCatalog.mailers : [];
    return { boxes, mailers };
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    setError("");
    setOutput(null);

    const l = toNum(length);
    const w = toNum(width);
    const h = toNum(height);
    const wt = toNum(weight);
    const n = Math.max(1, Math.floor(toNum(multiplier)));

    const pad = toNum(padding);
    const df = toNum(dimFactor);

    if (![l, w, h, wt, pad, df].every((v) => Number.isFinite(v)) || !Number.isFinite(n)) {
      setError("Please enter valid numbers for all fields.");
      return;
    }
    if (l <= 0 || w <= 0 || h <= 0 || wt < 0 || pad < 0 || df <= 0) {
      setError("Dimensions must be > 0. Weight >= 0. Padding >= 0. Dim factor > 0.");
      return;
    }

    // Best arrangement for identical items
    const arranged = bestArrangementPackedDims({ l, w, h, n });

    // Add padding to all sides (2*pad each dimension)
    const packed = {
      l: roundUpTo(arranged.L + 2 * pad, 0.25),
      w: roundUpTo(arranged.W + 2 * pad, 0.25),
      h: roundUpTo(arranged.H + 2 * pad, 0.25),
      arrangement: { a: arranged.a, b: arranged.b, c: arranged.c },
      actualWeightLb: roundUpTo(wt * n, 0.01),
    };

    const notes = [];
    if (n > 1) notes.push(`Assumed arrangement: ${arranged.a} × ${arranged.b} × ${arranged.c} (L×W×H item grid), plus padding.`);
    notes.push(`Padding applied: ${pad}" each side (adds ${2 * pad}" per dimension).`);
    notes.push(`DIM factor used: ${df}.`);

    // Hazmat rules scaffold
    let haz = { forceRigidBox: false, notes: [] };
    if (isHazmat) {
      if (!hazmatClass) {
        setError("Please select a Hazmat/ORMD class.");
        return;
      }
      haz = hazmatRules(hazmatClass);
      notes.push(...haz.notes);
    }

    // ENGINEERED (custom fit): just the packed dims (already padded), rounded up
    const engineered = {
      size: `${packed.l}×${packed.w}×${packed.h} (Custom/Engineered)`,
      dimWeightLb: roundUpTo(dimWeightLb({ l: packed.l, w: packed.w, h: packed.h, dimFactor: df }), 0.01),
      billedWeightLb: 0,
    };
    engineered.billedWeightLb = roundUpTo(Math.max(engineered.dimWeightLb, packed.actualWeightLb), 0.01);

    // STOCK OPTIONS:
    // boxes: must fit packed dims with rotation. mailers: fit as slim pack (h <= inner.h)
    const packedDimsArr = [packed.l, packed.w, packed.h];

    const candidates = [];

    // Boxes
    for (const b of catalog.boxes) {
      const inner = b?.inner;
      if (!inner) continue;

      // If hazmat forced rigid box: OK. If not hazmat: OK.
      // (We still allow boxes always.)
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

        // Only allow if packed height is slim enough
        if (packed.h > inner.h) continue;

        // Fit in L/W with rotation (treat mailer as l,w plane)
        const fit2D =
          (packed.l <= inner.l && packed.w <= inner.w) || (packed.w <= inner.l && packed.l <= inner.w);
        if (!fit2D) continue;

        // For mailers, we’ll score billed weight using a pseudo DIM off inner volume too (keeps scoring consistent)
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

    // Sort by: smallest billed weight, then smallest volume
    candidates.sort((a, b) => {
      if (a.billedWeightLb !== b.billedWeightLb) return a.billedWeightLb - b.billedWeightLb;
      return a.volumeIn3 - b.volumeIn3;
    });

    // Always produce a “next size up” fallback: if nothing fits, show engineered only
    const stockOptions = candidates.slice(0, 3);

    const ok = true;
    setOutput({
      ok,
      packed,
      engineered,
      stockOptions,
      notes,
      hazmat: isHazmat ? { enabled: true, hazmatClass } : { enabled: false },
    });
  };

  return (
    <div className="app-container" style={{ padding: 24, fontFamily: "Open Sans, Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <img
          src={logo}
          alt="Fosdick"
          style={{ height: 40, width: "auto", display: "block" }}
          onError={(e) => {
            // If logo missing, hide it rather than breaking build in dev
            e.currentTarget.style.display = "none";
          }}
        />
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>Fosdick Packaging Tool</div>
          <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>
            Stock fit from catalog + engineered (custom) option
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} style={{ maxWidth: 720 }}>
        {/* Row 1: dims */}
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <input
            type="number"
            step="0.01"
            placeholder="Avg Item Length"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Avg Item Width"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Avg Item Height"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
        </div>

        {/* Row 2: weight + multiplier */}
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <input
            type="number"
            step="0.01"
            placeholder="Avg Item Weight (lbs)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
          <input
            type="number"
            step="1"
            placeholder="Item Multiplier"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
        </div>

        {/* Row 3: padding + dim factor */}
        <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.8 }}>Padding (in)</div>
            <input
              type="number"
              step="0.01"
              value={padding}
              onChange={(e) => setPadding(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.8 }}>DIM Factor</div>
            <input
              type="number"
              step="1"
              value={dimFactor}
              onChange={(e) => setDimFactor(e.target.value)}
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
                onChange={() => setIsHazmat(true)}
              />
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
              <select
                value={hazmatClass}
                onChange={(e) => setHazmatClass(e.target.value)}
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

        {/* ===================== RESULTS BLOCK (PLACED HERE) ===================== */}
        {output?.ok === true && (
          <div className="results" style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Results</h2>

            <div style={{ marginBottom: "1rem" }}>
              <strong>Packed (with padding):</strong>
              <br />
              {output.packed.l} × {output.packed.w} × {output.packed.h} in
              <br />
              Actual weight: {output.packed.actualWeightLb} lb
              <br />
              Arrangement: {output.packed.arrangement.a} × {output.packed.arrangement.b} × {output.packed.arrangement.c}
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
                        {o.name}{" "}
                        <span style={{ fontWeight: 600, opacity: 0.75 }}>
                          ({o.kind})
                        </span>
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
                <div>
                  No stock option fits from the current catalog. Use engineered/custom size.
                </div>
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
        {/* =================== END RESULTS BLOCK =================== */}
      </form>
    </div>
  );
}
