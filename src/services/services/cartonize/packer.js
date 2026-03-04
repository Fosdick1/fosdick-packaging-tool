// src/services/services/cartonize/packer.js
// Upgraded packer: MaxRects layer packing (2D gap-filling) + stacked layers (3D).
// This replaces the simplistic "shelf" behavior while preserving your existing API:
//    export function packItemsShelf3D(items) { ... }
//
// items format expected by your index.js:
//   [{ name, l, w, h, wt, qty }]
//
// Output format expected by your index.js:
//   { l, w, h, actualWeightLb }

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}
function i(v) {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) ? x : 0;
}
function roundUp(x, step = 0.25) {
  return Math.ceil(x / step) * step;
}

function rectArea(r) {
  return r.w * r.h;
}
function fitsRect(fr, w, h) {
  return w <= fr.w && h <= fr.h;
}

// Split a free rectangle by a placed rectangle (standard MaxRects split)
function splitFreeRect(free, placed) {
  const out = [];

  const fx = free.x, fy = free.y, fw = free.w, fh = free.h;
  const px = placed.x, py = placed.y, pw = placed.w, ph = placed.h;

  const freeR = fx + fw;
  const freeB = fy + fh;
  const placedR = px + pw;
  const placedB = py + ph;

  // no overlap
  if (placedR <= fx || px >= freeR || placedB <= fy || py >= freeB) return [free];

  // top
  if (py > fy) out.push({ x: fx, y: fy, w: fw, h: py - fy });
  // bottom
  if (placedB < freeB) out.push({ x: fx, y: placedB, w: fw, h: freeB - placedB });
  // left
  if (px > fx) out.push({ x: fx, y: fy, w: px - fx, h: fh });
  // right
  if (placedR < freeR) out.push({ x: placedR, y: fy, w: freeR - placedR, h: fh });

  return out;
}

function pruneFreeRects(freeRects) {
  const pruned = [];
  for (let aIdx = 0; aIdx < freeRects.length; aIdx++) {
    const a = freeRects[aIdx];
    let contained = false;
    for (let bIdx = 0; bIdx < freeRects.length; bIdx++) {
      if (aIdx === bIdx) continue;
      const b = freeRects[bIdx];
      if (
        a.x >= b.x &&
        a.y >= b.y &&
        a.x + a.w <= b.x + b.w &&
        a.y + a.h <= b.y + b.h
      ) {
        contained = true;
        break;
      }
    }
    if (!contained) pruned.push(a);
  }
  return pruned;
}

// Best Short Side Fit (BSSF)
function findBestPlacement(freeRects, w, h) {
  let best = null;

  for (const fr of freeRects) {
    if (!fitsRect(fr, w, h)) continue;

    const leftoverW = fr.w - w;
    const leftoverH = fr.h - h;
    const shortSide = Math.min(leftoverW, leftoverH);
    const longSide = Math.max(leftoverW, leftoverH);

    const score = { shortSide, longSide, area: rectArea(fr) };

    if (!best) {
      best = { fr, w, h, score };
      continue;
    }

    if (
      score.shortSide < best.score.shortSide ||
      (score.shortSide === best.score.shortSide && score.longSide < best.score.longSide) ||
      (score.shortSide === best.score.shortSide &&
        score.longSide === best.score.longSide &&
        score.area < best.score.area)
    ) {
      best = { fr, w, h, score };
    }
  }

  return best;
}

function placeRect(freeRects, placed) {
  let next = [];
  for (const fr of freeRects) next = next.concat(splitFreeRect(fr, placed));
  next = next.filter((r) => r.w > 0 && r.h > 0);
  next = pruneFreeRects(next);
  return next;
}

function rotations2D(l, w) {
  return [
    { w: l, l: w }, // treat as width/length
    { w: w, l: l },
  ];
}

// Pack one layer using MaxRects (2D). Returns placed + remaining.
function packLayerMaxRects(units, binW, binL) {
  let freeRects = [{ x: 0, y: 0, w: binW, h: binL }];
  const placed = [];
  const remaining = [];

  // sort by footprint desc helps
  const sorted = [...units].sort((a, b) => (b.l * b.w) - (a.l * a.w));

  for (const u of sorted) {
    let best = null;

    for (const rot of rotations2D(u.l, u.w)) {
      const cand = findBestPlacement(freeRects, rot.w, rot.l);
      if (!cand) continue;

      if (!best) best = { ...cand, rot };
      else {
        const s = cand.score, b = best.score;
        if (
          s.shortSide < b.shortSide ||
          (s.shortSide === b.shortSide && s.longSide < b.longSide) ||
          (s.shortSide === b.shortSide && s.longSide === b.longSide && s.area < b.area)
        ) {
          best = { ...cand, rot };
        }
      }
    }

    if (!best) {
      remaining.push(u);
      continue;
    }

    const fr = best.fr;
    const rect = { x: fr.x, y: fr.y, w: best.rot.w, h: best.rot.l };
    freeRects = placeRect(freeRects, rect);

    placed.push({
      ...u,
      x: rect.x,
      y: rect.y,
      packedW: rect.w,
      packedL: rect.h,
    });
  }

  return { placed, remaining };
}

// Choose a reasonable set of candidate base widths (inches)
function candidateWidthsFromUnits(units) {
  const maxBase = Math.max(...units.map(u => Math.max(u.l, u.w)));
  // You can tune this list later; kept intentionally small for speed
  const widths = [6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36].filter(w => w >= maxBase);
  return widths.length ? widths : [roundUp(maxBase, 0.25)];
}

// Try MaxRects packing across candidate widths; pick smallest volume result.
// Returns { l, w, h, actualWeightLb }
function packItemsMaxRects3D(items) {
  // Expand items by qty into units
  const units = [];
  let totalWt = 0;

  for (const it of items || []) {
    const L = n(it.l), W = n(it.w), H = n(it.h);
    const WT = n(it.wt);
    const Q = Math.max(0, i(it.qty));

    if (!Number.isFinite(L) || !Number.isFinite(W) || !Number.isFinite(H)) continue;
    const wtEach = Number.isFinite(WT) ? WT : 0;

    for (let k = 0; k < Q; k++) {
      units.push({ l: L, w: W, h: H, wt: wtEach, name: it.name || "SKU" });
      totalWt += wtEach;
    }
  }

  if (units.length === 0) {
    return { l: 0, w: 0, h: 0, actualWeightLb: 0 };
  }

  const widths = candidateWidthsFromUnits(units);
  let best = null;

  // Try each width; layer length grows as needed
  for (const binW of widths) {
    let remaining = [...units];
    let totalH = 0;
    let usedMaxL = 0;

    // initial length guess
    const avgLen = remaining.reduce((s, u) => s + Math.max(u.l, u.w), 0) / remaining.length;
    let binL = roundUp(Math.max(avgLen * Math.ceil(Math.sqrt(remaining.length)), Math.min(...widths)), 0.25);

    let safety = 0;
    while (remaining.length > 0 && safety < 50) {
      const { placed, remaining: rem } = packLayerMaxRects(remaining, binW, binL);

      // if nothing placed, grow length and retry
      if (placed.length === 0) {
        binL = roundUp(binL * 1.25, 0.25);
        safety++;
        continue;
      }

      const layerH = Math.max(...placed.map(p => p.h));
      totalH += layerH;

      const layerUsedL = Math.max(...placed.map(p => p.y + p.packedL));
      usedMaxL = Math.max(usedMaxL, layerUsedL);

      remaining = rem;
      safety = 0; // reset after successful layer
    }

    if (remaining.length > 0) {
      // couldn't complete under limits; skip this width
      continue;
    }

    const packed = {
      l: roundUp(usedMaxL, 0.25),
      w: roundUp(binW, 0.25),
      h: roundUp(totalH, 0.25),
      actualWeightLb: roundUp(totalWt, 0.01),
    };

    const vol = packed.l * packed.w * packed.h;
    if (!best || vol < best.vol) best = { packed, vol };
  }

  // Fallback (should be rare)
  if (!best) {
    const maxW = Math.max(...units.map(u => u.w));
    const maxH = Math.max(...units.map(u => u.h));
    const sumL = units.reduce((s, u) => s + u.l, 0);
    return {
      l: roundUp(sumL, 0.25),
      w: roundUp(maxW, 0.25),
      h: roundUp(maxH, 0.25),
      actualWeightLb: roundUp(totalWt, 0.01),
    };
  }

  return best.packed;
}

/**
 * Keep your existing index.js working:
 * index.js calls packItemsShelf3D(items)
 * We preserve that export but route to MaxRects.
 */
export function packItemsShelf3D(items) {
  return packItemsMaxRects3D(items);
}
