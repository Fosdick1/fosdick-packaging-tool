import React, { useMemo, useState } from "react";
import "./App.css";

export default function App() {
  // Inputs
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState(""); // avg item weight (lbs)
  const [multiplier, setMultiplier] = useState("");

  // DIM modeling inputs
  const [dimFactor, setDimFactor] = useState("139"); // default
  const [padInches, setPadInches] = useState("1"); // add to each dimension

  // Hazmat UI (placeholder logic for now)
  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState("");

  // Output
  const [result, setResult] = useState(null);

  const hazmatClasses = [
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

  // Expandable “common” box list (inches) — we can keep adding over time
  const standardBoxes = useMemo(
    () => [
      { label: "6x4x4 Remailer", l: 6, w: 4, h: 4 },
      { label: "8x6x4 Box", l: 8, w: 6, h: 4 },
      { label: "10x8x6 Box", l: 10, w: 8, h: 6 },
      { label: "12x10x8 Box", l: 12, w: 10, h: 8 },
      { label: "14x10x10 Box", l: 14, w: 10, h: 10 },
      { label: "16x12x10 Box", l: 16, w: 12, h: 10 },
      { label: "18x14x12 Box", l: 18, w: 14, h: 12 },
      { label: "20x16x14 Box", l: 20, w: 16, h: 14 },
      { label: "22x18x16 Box", l: 22, w: 18, h: 16 },
      { label: "24x18x18 Box", l: 24, w: 18, h: 18 },
      { label: "24x20x20 Box", l: 24, w: 20, h: 20 },
      { label: "26x20x18 Box", l: 26, w: 20, h: 18 },
      { label: "28x20x20 Box", l: 28, w: 20, h: 20 },
      { label: "30x24x24 Box", l: 30, w: 24, h: 24 },
    ],
    []
  );

  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function ceilLb(x) {
    return Math.ceil(x * 1000) / 1000; // keep dim weight readable
  }

  // Generate factor triples (nx, ny, nz) such that nx*ny*nz >= q with reasonable bounds
  function generateTriples(q) {
    const triples = [];
    const max = Math.max(1, Math.ceil(Math.cbrt(q)) + 6); // small search space
    for (let nx = 1; nx <= max; nx++) {
      for (let ny = 1; ny <= max; ny++) {
        for (let nz = 1; nz <= max; nz++) {
          const count = nx * ny * nz;
          if (count >= q) triples.push({ nx, ny, nz, count });
        }
      }
    }
    // prefer tighter packs (less “wasted slots”)
    triples.sort((a, b) => a.count - b.count);
    return triples.slice(0, 60); // keep compute fast
  }

  function permutations3(a, b, c) {
    return [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ];
  }

  // Compute best packed dims given q, allowing rotations + grid stacking
  function bestPackedDims(l, w, h, q, pad) {
    const triples = generateTriples(q);
    let best = null;

    // Try all rotations of the item dimensions
    for (const [il, iw, ih] of permutations3(l, w, h)) {
      for (const t of triples) {
        const packedL = il * t.nx + pad;
        const packedW = iw * t.ny + pad;
        const packedH = ih * t.nz + pad;

        // Score: smallest volume first, then smallest max dimension
        const vol = packedL * packedW * packedH;
        const maxDim = Math.max(packedL, packedW, packedH);

        const candidate = {
          packedL,
          packedW,
          packedH,
          vol,
          maxDim,
          layout: `${t.nx}×${t.ny}×${t.nz}`,
          rotation: `${il}×${iw}×${ih}`,
          count: t.count,
        };

        if (!best) best = candidate;
        else {
          if (candidate.vol < best.vol) best = candidate;
          else if (candidate.vol === best.vol && candidate.maxDim < best.maxDim) best = candidate;
        }
      }
    }
    return best;
  }

  function fitsBox(packed, box) {
    // allow rotating packed dims to fit box dims
    for (const [pl, pw, ph] of permutations3(packed.packedL, packed.packedW, packed.packedH)) {
      if (box.l >= pl && box.w >= pw && box.h >= ph) {
        return { fits: true, oriented: { l: pl, w: pw, h: ph } };
      }
    }
    return { fits: false, oriented: null };
  }

  function selectMaterial(totalActualWeight, packedVol) {
    // very simple placeholder: we’ll refine with fragility rules later
    if (packedVol > 1728 || totalActualWeight >= 10) return "Double-wall corrugated carton";
    if (packedVol < 300 && totalActualWeight <= 1) return "Padded mailer (or poly mailer if non-fragile)";
    return "Standard single-wall carton";
  }

  function handleSubmit(e) {
    e.preventDefault();

    const l = toNum(length);
    const w = toNum(width);
    const h = toNum(height);
    const wt = toNum(weight);
    const q = Math.max(1, Math.floor(toNum(multiplier)));
    const dimDiv = toNum(dimFactor);
    const pad = Math.max(0, toNum(padInches));

    if ([l, w, h, wt, q, dimDiv, pad].some((x) => Number.isNaN(x)) || dimDiv <= 0) {
      setResult({ error: "Please enter valid dimensions, weight, multiplier, and DIM factor." });
      return;
    }

    const totalActualWeight = wt * q;

    const packed = bestPackedDims(l, w, h, q, pad);
    const packedVol = packed.packedL * packed.packedW * packed.packedH;

    // Filter boxes that fit (true fit, all dims)
    const fits = standardBoxes
      .map((box) => {
        const fit = fitsBox(packed, box);
        if (!fit.fits) return null;

        const dimWeight = (box.l * box.w * box.h) / dimDiv;
        const billed = Math.max(totalActualWeight, dimWeight);

        return {
          ...box,
          fitDims: fit.oriented,
          dimWeight: ceilLb(dimWeight),
          billedWeight: Math.ceil(billed), // typical rating uses rounded-up lb
          billedRaw: billed,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        // Sort by billed weight, then by box volume
        const aw = a.billedWeight - b.billedWeight;
        if (aw !== 0) return aw;
        const av = a.l * a.w * a.h;
        const bv = b.l * b.w * b.h;
        return av - bv;
      });

    const top = fits.slice(0, 3);

    const material = selectMaterial(totalActualWeight, packedVol);

    // Hazmat note (rules engine later)
    const hazmatNote =
      isHazmat && hazmatClass
        ? `Hazmat/ORMD noted: ${hazmatClass}. Packaging must follow applicable rules (rules engine pending).`
        : null;

    setResult({
      material,
      packed,
      totalActualWeight,
      dimDiv,
      top,
      hazmatNote,
      fallback: top.length === 0,
    });
  }

  return (
    <div className="page">
      <div className="card">
        <div className="header">
          <img className="logo" src="/logo.png" alt="Fosdick" onError={(e) => (e.currentTarget.style.display = "none")} />
          <div>
            <h1 className="title">Fosdick Packaging Tool</h1>
            <p className="subtitle">Enter item averages + multiplier. We’ll suggest common box sizes + billed weight.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="row">
            <div className="field">
              <label>Avg Item Length (in)</label>
              <input value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g., 10" inputMode="decimal" />
            </div>
            <div className="field">
              <label>Avg Item Width (in)</label>
              <input value={width} onChange={(e) => setWidth(e.target.value)} placeholder="e.g., 8" inputMode="decimal" />
            </div>
            <div className="field">
              <label>Avg Item Height (in)</label>
              <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g., 6" inputMode="decimal" />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Avg Item Weight (lb)</label>
              <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g., 2.5" inputMode="decimal" />
            </div>
            <div className="field">
              <label>Item Multiplier</label>
              <input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="e.g., 3" inputMode="numeric" />
            </div>
            <div className="field">
              <label>DIM Factor</label>
              <input value={dimFactor} onChange={(e) => setDimFactor(e.target.value)} placeholder="139" inputMode="numeric" />
            </div>
            <div className="field">
              <label>Padding Allowance (in)</label>
              <input value={padInches} onChange={(e) => setPadInches(e.target.value)} placeholder="1" inputMode="decimal" />
            </div>
          </div>

          <div className="hazmat">
            <div className="hazmatTop">
              <div className="hazmatLabel">Special Handling — Hazmat/ORMD?</div>
              <div className="hazmatControls">
                <label className="check">
                  <input type="radio" name="haz" checked={isHazmat === true} onChange={() => setIsHazmat(true)} />
                  Yes
                </label>
                <label className="check">
                  <input type="radio" name="haz" checked={isHazmat === false} onChange={() => setIsHazmat(false)} />
                  No
                </label>
              </div>
            </div>

            {isHazmat && (
              <div className="field">
                <label>Hazmat/ORMD Class</label>
                <select value={hazmatClass} onChange={(e) => setHazmatClass(e.target.value)}>
                  <option value="">Select…</option>
                  {hazmatClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button className="btn" type="submit">
            Recommend Packaging
          </button>
        </form>

        {result?.error && <div className="error">{result.error}</div>}

        {result && !result.error && (
          <div className="results">
            <div className="resultsHeader">
              <h2>Recommendation</h2>
              <div className="pill">{result.material}</div>
            </div>

            <div className="meta">
              <div>
                <strong>Packed dims (est):</strong>{" "}
                {result.packed.packedL.toFixed(1)} × {result.packed.packedW.toFixed(1)} × {result.packed.packedH.toFixed(1)} in
              </div>
              <div>
                <strong>Layout:</strong> {result.packed.layout} (rotation {result.packed.rotation})
              </div>
              <div>
                <strong>Total actual weight:</strong> {result.totalActualWeight.toFixed(2)} lb
              </div>
              <div>
                <strong>DIM factor:</strong> {result.dimDiv}
              </div>
              {result.hazmatNote && <div className="hazNote">{result.hazmatNote}</div>}
            </div>

            {result.fallback ? (
              <div className="warn">
                No box in the current “common sizes” list fits this packed estimate. Add larger boxes to the list, or treat as custom.
              </div>
            ) : (
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Option</th>
                      <th>Box size</th>
                      <th>DIM wt</th>
                      <th>Billed wt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.top.map((b, idx) => (
                      <tr key={b.label}>
                        <td>{idx + 1}</td>
                        <td>{b.label}</td>
                        <td>{b.dimWeight} lb</td>
                        <td>{b.billedWeight} lb</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="note">
                  Billed weight uses <strong>max(actual, DIM)</strong> and rounds up to the nearest lb (configurable later).
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
