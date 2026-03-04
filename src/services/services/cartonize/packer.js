// src/services/services/cartonize/packer.js
// MaxRects-based layer packing for mixed-SKU cartonization
//
// Goal: produce realistic "packed outer dims" for a mixed-item order.
// Approach:
// - Expand items by quantity into units.
// - Try multiple candidate container base widths.
// - For each width, pack items into layers using MaxRects 2D packing (gap-filling).
// - Each layer's height = max item height in that layer.
// - Total height = sum of layer heights.
// - Pick the best result by smallest total volume (L*W*H).
//
// Notes:
// - This is still a heuristic (not an exact solver), but MaxRects generally
//   outperforms basic shelf packing in real mixed-SKU scenarios.

function permutations2([a, b]) {
  return [
    [a, b],
    [b, a],
  ];
}

function clampNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function rectArea(r) {
  return r.w * r.h;
}

function fitsRect(free, w, h) {
  return w <= free.w && h <= free.h;
}

function splitFreeRect(free, placed) {
  // free: {x,y,w,h}, placed: {x,y,w,h} that is within free
  const out = [];

  const fx = free.x,
    fy = free.y,
    fw = free.w,
    fh = free.h;

  const px = placed.x,
    py = placed.y,
    pw = placed.w,
    ph = placed.h;

  const freeRight = fx + fw;
  const freeBottom = fy + fh;
  const placedRight = px + pw;
  const placedBottom = py + ph;

  // No overlap => return original
  if (
    placedRight <= fx ||
    px >= freeRight ||
    placedBottom <= fy ||
    py >= freeBottom
  ) {
    return [free];
  }

  // Top slice
  if (py > fy) {
    out.push({ x: fx, y: fy, w: fw, h: py - fy });
  }
  // Bottom slice
  if (placedBottom < freeBottom) {
    out.push({ x: fx, y: placedBottom, w: fw, h: freeBottom - placedBottom });
  }
  // Left slice
  if (px > fx) {
    out.push({ x: fx, y: fy, w: px - fx, h: fh });
  }
  // Right slice
  if (placedRight < freeRight) {
    out.push({ x: placedRight, y: fy, w: freeRight - placedRight, h: fh });
  }

  return out;
}

function pruneFreeRects(freeRects) {
  // Remove any free rect that is fully contained within another
  const pruned = [];
  for (let i = 0; i < freeRects.length; i++) {
    const a = freeRects[i];
    let contained = false;
    for (let j = 0; j < freeRects.length; j++) {
      if (i === j) continue;
      const b = freeRects[j];
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

// MaxRects placement: Best Short Side Fit (BSSF) with tie-breaker on area
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

    // Prefer smaller short side, then smaller long side, then smaller free rect area
    if (
      score.shortSide < best.score.shortSide ||
      (score.shortSide === best.score.shortSide &&
        score.longSide < best.score.longSide) ||
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
  // Split all free rects by the placed rect
  let newFree = [];
  for (const fr of freeRects) {
    newFree = newFree.concat(splitFreeRect(fr, placed));
  }

  // Remove degenerates
  newFree = newFree.filter((r) => r.w > 0 && r.h > 0);

  // Prune contained rectangles
  newFree = pruneFreeRects(newFree);

  return newFree;
}

function maxRectPackLayer({ units, binW, binL }) {
  // Pack as many units as possible into a single layer (2D base),
  // allowing rotation in the base plane. Returns placed + remaining.

  // We represent the bin as width (X) and length (Y)
  let freeRects = [{ x: 0, y: 0, w: binW, h: binL }];
  const placed = [];
  const remaining = [];

  // Sort by max footprint desc (helps MaxRects)
  const sorted = [...units].sort((a, b) => {
    const af = Math.max(a.l, a.w) * Math.min(a.l, a.w);
    const bf = Math.max(b.l, b.w) * Math.min(b.l, b.w);
    return bf - af;
  });

  for (const u of sorted) {
    const options = permutations2([u.l, u.w]); // rotation in base plane
    let bestPlacement = null;

    for (const [pw, pl] of options) {
      const candidate = findBestPlacement(freeRects, pw, pl);
      if (!candidate) continue;

      // Choose best among rotations using same scoring
      if (!bestPlacement) {
        bestPlacement = { ...candidate, pw, pl };
      } else {
        const s = candidate.score;
        const b = bestPlacement.score;
        if (
          s.shortSide < b.shortSide ||
          (s.shortSide === b.shortSide && s.longSide < b.longSide) ||
          (s.shortSide === b.shortSide &&
            s.longSide === b.longSide &&
            s.area < b.area)
        ) {
          bestPlacement = { ...candidate, pw, pl };
        }
      }
    }

    if (!bestPlacement) {
      remaining.push(u);
      continue;
    }

    const fr = bestPlacement.fr;
    const rect = { x: fr.x, y: fr.y, w: bestPlacement.pw, h: bestPlacement.pl };
    freeRects = placeRect(freeRects, rect);
    placed.push({ ...u, packedW: rect.w, packedL: rect.h, x: rect.x, y: rect.y });
  }

  // Preserve original order of remaining (optional)
  return { placed, remaining };
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function cartonizeMixedItems({
  items, // [{ sku, l,w,h, weightLb, qty }]
  padding = 0.5,
  step = 0.25,
  candidateWidths = [6, 8, 10, 12, 14, 16, 18, 20],
}) {
  // Expand to units, apply padding to each item on all sides (2*padding per dimension)
  const units = [];
  for (const it of items || []) {
    const l = clampNum(it.l);
    const w = clampNum(it.w);
    const h = clampNum(it.h);
    const wt = clampNum(it.weightLb, 0);
    const qty = Math.max(0, Math.floor(clampNum(it.qty, 0)));

    for (let i = 0; i < qty; i++) {
      units.push({
        sku: it.sku || "SKU",
        l: roundUpTo(l + 2 * padding, step),
        w: roundUpTo(w + 2 * padding, step),
        h: roundUpTo(h + 2 * padding, step),
        weightLb: wt,
      });
    }
  }

  if (units.length === 0) {
    return {
      ok: false,
      error: "Add at least one item with qty >= 1",
    };
  }

  // Candidate bin widths should be at least as large as the largest item min-dimension
  const maxMinBase = Math.max(...units.map((u) => Math.min(u.l, u.w)));
  const widths = [...new Set(candidateWidths)]
    .filter((x) => x >= maxMinBase)
    .sort((a, b) => a - b);

  // If no widths left, add a fallback width = max of item bases
  if (widths.length === 0) {
    widths.push(roundUpTo(Math.max(...units.map((u) => Math.max(u.l, u.w))), step));
  }

  let best = null;

  // Try each width; bin length is grown dynamically by packing multiple layers
  for (const binW of widths) {
    let remaining = [...units];

    let layers = [];
    let totalHeight = 0;
    let usedMaxL = 0;

    // We need an initial bin length guess. We'll grow it if needed by retrying.
    // Start with a reasonable length: sum of max length-ish over sqrt(n)
    const avgL = sum(remaining.map((u) => Math.max(u.l, u.w))) / remaining.length;
    let binL = roundUpTo(Math.max(avgL * Math.ceil(Math.sqrt(remaining.length)), maxMinBase), step);

    // Attempt packing with incremental length growth if the layer packs too little.
    // We'll cap growth loops for safety.
    let growthLoops = 0;

    while (remaining.length > 0 && growthLoops < 12) {
      const { placed, remaining: rem } = maxRectPackLayer({ units: remaining, binW, binL });

      // If we couldn't place anything, grow binL and retry
      if (placed.length === 0) {
        binL = roundUpTo(binL * 1.25, step);
        growthLoops++;
        continue;
      }

      // Layer height = max h among placed in this layer
      const layerH = Math.max(...placed.map((p) => p.h));
      totalHeight += layerH;

      // Layer base usage: max x+w, y+h
      const layerUsedW = Math.max(...placed.map((p) => p.x + p.packedW));
      const layerUsedL = Math.max(...placed.map((p) => p.y + p.packedL));
      usedMaxL = Math.max(usedMaxL, layerUsedL);

      layers.push({
        layerH,
        binW,
        binL,
        usedW: roundUpTo(layerUsedW, step),
        usedL: roundUpTo(layerUsedL, step),
        count: placed.length,
      });

      remaining = rem;
      growthLoops = 0; // reset for next layer
    }

    if (remaining.length > 0) {
      // Failed to pack all within growth cap — treat as not viable
      continue;
    }

    const packed = {
      l: roundUpTo(usedMaxL, step),
      w: roundUpTo(binW, step),
      h: roundUpTo(totalHeight, step),
      layers,
    };

    const vol = packed.l * packed.w * packed.h;
    if (!best || vol < best.vol) {
      best = { packed, vol };
    }
  }

  if (!best) {
    // fallback: naive stacking along length
    const totalL = sum(units.map((u) => u.l));
    const maxW = Math.max(...units.map((u) => u.w));
    const maxH = Math.max(...units.map((u) => u.h));
    return {
      ok: true,
      packed: {
        l: roundUpTo(totalL, step),
        w: roundUpTo(maxW, step),
        h: roundUpTo(maxH, step),
        layers: [{ layerH: maxH, binW: maxW, binL: totalL, usedW: maxW, usedL: totalL, count: units.length }],
      },
      notes: ["Fallback pack used (could not complete MaxRects search)."],
    };
  }

  return {
    ok: true,
    packed: best.packed,
    notes: [
      "Packed using MaxRects layer packing (gap-filling) across candidate base widths.",
      `Padding applied per item: ${padding}" each side (adds ${2 * padding}" per dimension).`,
      `Candidate widths tried: ${widths.join(", ")}`,
    ],
  };
}

function roundUpTo(x, step = 0.25) {
  return Math.ceil(x / step) * step;
}
