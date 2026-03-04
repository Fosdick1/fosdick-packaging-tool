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
  return (l * w * h) / dimFactor;
}

function hazmatRules(hazmatClass) {
  const notes = [];
  const forceRigidBox = true;

  if (/Class 3|Class 8/.test(hazmatClass))
    notes.push("Use leakproof primary + sealed polybag + absorbent.");

  notes.push(
    "Hazmat flagged — restrict to rigid box packaging and follow carrier acceptance rules."
  );

  return { forceRigidBox, notes };
}

function expandUnits(items) {
  const units = [];

  for (const it of items) {
    for (let i = 0; i < it.qty; i++) {
      units.push({
        dims: [it.l, it.w, it.h],
        wt: it.wt,
        vol: it.l * it.w * it.h,
      });
    }
  }

  units.sort((a, b) => b.vol - a.vol);
  return units;
}

function packGreedyShelves(units, baseL, baseW) {
  let x = 0;
  let y = 0;
  let rowDepth = 0;
  let layerHeight = 0;
  let totalHeight = 0;
  let layers = 1;

  for (const u of units) {
    const perms = permutations3(u.dims);
    let placed = false;

    for (let attempt = 0; attempt < 3 && !placed; attempt++) {
      if (attempt === 1) {
        x = 0;
        y += rowDepth;
        rowDepth = 0;
      }

      if (attempt === 2) {
        totalHeight += layerHeight;
        layers++;
        x = 0;
        y = 0;
        rowDepth = 0;
        layerHeight = 0;
      }

      const remainingL = baseL - x;
      const remainingW = baseW - y;

      const fits = [];

      for (const [pl, pw, ph] of perms) {
        if (pl <= remainingL && pw <= remainingW) {
          fits.push({ pl, pw, ph });
        }
      }

      if (!fits.length) continue;

      fits.sort((a, b) => a.ph - b.ph);

      const best = fits[0];

      x += best.pl;
      rowDepth = Math.max(rowDepth, best.pw);
      layerHeight = Math.max(layerHeight, best.ph);

      placed = true;
    }

    if (!placed) return { ok: false };
  }

  return {
    ok: true,
    usedH: totalHeight + layerHeight,
    layers,
  };
}

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

    const cand = { L, W, H, vol, maxSide, layers: res.layers };

    if (!best) best = cand;
    else if (cand.vol < best.vol) best = cand;
    else if (cand.vol === best.vol && cand.maxSide < best.maxSide) best = cand;
  }

  return best;
}

export default function App() {
  const [items, setItems] = useState([
    { id: crypto.randomUUID(), sku: "", l: "", w: "", h: "", wt: "", qty: "1" },
  ]);

  const [padding, setPadding] = useState("0.5");
  const [dimFactor, setDimFactor] = useState("139");

  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState("");

  const [output, setOutput] = useState(null);
  const [error, setError] = useState("");

  const catalog = useMemo(() => {
    const boxes = boxCatalog?.boxes || [];
    const mailers = boxCatalog?.mailers || [];
    return { boxes, mailers };
  }, []);

  const resetResult = () => {
    setOutput(null);
    setError("");
  };

  const updateItem = (id, patch) => {
    resetResult();
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const addItem = () => {
    resetResult();
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sku: "", l: "", w: "", h: "", wt: "", qty: "1" },
    ]);
  };

  const removeItem = (id) => {
    resetResult();
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const onSubmit = (e) => {
    e.preventDefault();

    const pad = toNum(padding);
    const df = toNum(dimFactor);

    if (!Number.isFinite(pad) || !Number.isFinite(df)) {
      setError("Invalid padding or DIM factor.");
      return;
    }

    const normalized = [];
    let totalWeight = 0;

    let maxL = 0,
      maxW = 0,
      maxH = 0;

    for (const it of items) {
      const l = toNum(it.l);
      const w = toNum(it.w);
      const h = toNum(it.h);
      const wt = toNum(it.wt);
      const qty = Math.max(1, Number(it.qty));

      if (![l, w, h, wt].every(Number.isFinite)) {
        setError("Invalid item dimensions.");
        return;
      }

      totalWeight += wt * qty;

      maxL = Math.max(maxL, l);
      maxW = Math.max(maxW, w);
      maxH = Math.max(maxH, h);

      normalized.push({ ...it, l, w, h, wt, qty });
    }

    const units = expandUnits(normalized);

    const baseCandidates = [
      { L: maxL, W: maxW },
      { L: maxL * 1.25, W: maxW },
      { L: maxL, W: maxW * 1.25 },
    ];

    const engineeredCore = chooseBestEngineered(units, baseCandidates);

    if (!engineeredCore) {
      setError("Unable to pack items.");
      return;
    }

    const packed = {
      l: roundUpTo(engineeredCore.L + pad * 2),
      w: roundUpTo(engineeredCore.W + pad * 2),
      h: roundUpTo(engineeredCore.H + pad * 2),
      actualWeightLb: roundUpTo(totalWeight, 0.01),
    };

    const packedDimsArr = [packed.l, packed.w, packed.h];

    const candidates = [];

    for (const b of catalog.boxes) {
      const inner = b.inner;
      const innerDims = [inner.l, inner.w, inner.h];

      if (!fitsWithRotation(packedDimsArr, innerDims)) continue;

      const dimW = dimWeightLb({
        l: inner.l,
        w: inner.w,
        h: inner.h,
        dimFactor: df,
      });

      const billed = Math.max(dimW, packed.actualWeightLb);

      candidates.push({
        id: b.id,
        name: b.name,
        inner,
        billedWeightLb: billed,
        dimWeightLb: dimW,
        volumeIn3: containerVolume(inner),
      });
    }

    candidates.sort((a, b) => a.billedWeightLb - b.billedWeightLb);

    setOutput({
      ok: true,
      items: normalized,
      packed,
      stockOptions: candidates.slice(0, 3),
    });
  };

  return (
    <div style={{ padding: 24, fontFamily: "Open Sans, Arial, sans-serif" }}>
      <h1>Fosdick Packaging Tool</h1>

      <form onSubmit={onSubmit} style={{ maxWidth: 900 }}>
        {items.map((it, idx) => (
          <div
            key={it.id}
            style={{
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              background: "white",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              <strong>Item {idx + 1}</strong>

              <input
                type="text"
                placeholder="SKU"
                value={it.sku}
                onChange={(e) => updateItem(it.id, { sku: e.target.value })}
                style={{ flex: 1, padding: 8 }}
              />

              <button type="button" onClick={() => removeItem(it.id)}>
                Remove
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <input
                type="number"
                placeholder="Length"
                value={it.l}
                onChange={(e) => updateItem(it.id, { l: e.target.value })}
                style={{ flex: 1, padding: 8 }}
              />

              <input
                type="number"
                placeholder="Width"
                value={it.w}
                onChange={(e) => updateItem(it.id, { w: e.target.value })}
                style={{ flex: 1, padding: 8 }}
              />

              <input
                type="number"
                placeholder="Height"
                value={it.h}
                onChange={(e) => updateItem(it.id, { h: e.target.value })}
                style={{ flex: 1, padding: 8 }}
              />

              <input
                type="number"
                placeholder="Weight"
                value={it.wt}
                onChange={(e) => updateItem(it.id, { wt: e.target.value })}
                style={{ flex: 1, padding: 8 }}
              />

              <input
                type="number"
                placeholder="Qty"
                value={it.qty}
                onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                style={{ width: 90, padding: 8, flexShrink: 0 }}
              />
            </div>
          </div>
        ))}

        <button type="button" onClick={addItem}>
          Add Item
        </button>

        <div style={{ marginTop: 20 }}>
          <button type="submit">Recommend Packaging</button>
        </div>

        {output && (
          <div style={{ marginTop: 20 }}>
            <h3>Results</h3>
            Packed: {output.packed.l} × {output.packed.w} × {output.packed.h}
            <br />
            Weight: {output.packed.actualWeightLb} lb
          </div>
        )}
      </form>
    </div>
  );
}
