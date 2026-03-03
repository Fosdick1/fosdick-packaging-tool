/**
 * Simple 3D shelf-packing heuristic.
 * Packs items into rows across L, then rows across W, then layers across H.
 * Each item can be rotated; we choose a rotation that best fits the current row/layer.
 */
export function packItemsShelf3D(items) {
  // Expand qty to individual units
  const units = [];
  let totalWeight = 0;

  for (const it of items) {
    const qty = Math.round(Number(it.qty));
    const wt = Number(it.wt) || 0;
    totalWeight += wt * qty;

    for (let i = 0; i < qty; i++) {
      units.push({
        name: it.name || "",
        dims: [Number(it.l), Number(it.w), Number(it.h)]
      });
    }
  }

  // Sort largest-first to improve packing
  units.sort((a, b) => volume(b.dims) - volume(a.dims));

  // We don’t know the container in advance, so we build a packed bounding box from placement.
  // Maintain used space in a "virtual container": we grow the container as needed.
  let containerL = 0;
  let containerW = 0;
  let containerH = 0;

  // Current layer
  let x = 0;            // used length in current row
  let y = 0;            // used width in current layer
  let rowDepth = 0;     // max width in the row
  let layerHeight = 0;  // max height in the layer

  let maxLInLayer = 0;  // track layer length requirement

  for (const u of units) {
    const rots = rotations(u.dims);

    // Try to place in current row; if not, new row; if not, new layer.
    let placed = false;

    // Choose rotation that fits best in current row first (minimizes growth)
    const candidates = rots
      .map(([l, w, h]) => ({ l, w, h }))
      .sort((a, b) => {
        // prefer smaller height increase then smaller rowDepth increase then smaller length
        const aDH = Math.max(layerHeight, a.h) - layerHeight;
        const bDH = Math.max(layerHeight, b.h) - layerHeight;
        if (aDH !== bDH) return aDH - bDH;

        const aDD = Math.max(rowDepth, a.w) - rowDepth;
        const bDD = Math.max(rowDepth, b.w) - rowDepth;
        if (aDD !== bDD) return aDD - bDD;

        return a.l - b.l;
      });

    for (const c of candidates) {
      // Place in current row by extending length
      // (virtual container grows; we track max dimensions reached)
      // So we always "fit", but the packed result is the bounding box produced by the heuristic.
      const newX = x + c.l;
      const newRowDepth = Math.max(rowDepth, c.w);
      const newLayerHeight = Math.max(layerHeight, c.h);

      // if row gets too long relative to current containerL, we allow growth
      // but if row becomes extremely long compared to current best, it's still fine—it's a heuristic.
      x = newX;
      rowDepth = newRowDepth;
      layerHeight = newLayerHeight;
      maxLInLayer = Math.max(maxLInLayer, x);

      containerL = Math.max(containerL, maxLInLayer);
      containerW = Math.max(containerW, y + rowDepth);
      containerH = Math.max(containerH, containerH + 0); // updated at layer end
      placed = true;
      break;
    }

    if (!placed) {
      // Fallback: shouldn't happen because we allow growth
    }

    // Heuristic: if current row length got much larger than width, start a new row
    if (x > 24 && rowDepth < 6) {
      y += rowDepth;
      x = 0;
      rowDepth = 0;
      maxLInLayer = Math.max(maxLInLayer, containerL);
      containerW = Math.max(containerW, y);
    }

    // Heuristic: if layer becomes wide, start a new layer
    if (y > 18) {
      containerH += layerHeight;
      containerL = Math.max(containerL, maxLInLayer);
      containerW = Math.max(containerW, y);
      x = 0;
      y = 0;
      rowDepth = 0;
      layerHeight = 0;
      maxLInLayer = 0;
    }
  }

  // Close out remaining row/layer
  containerL = Math.max(containerL, maxLInLayer);
  containerW = Math.max(containerW, y + rowDepth);
  containerH = containerH + layerHeight;

  // Safety minimums
  containerL = Math.max(containerL, 0.01);
  containerW = Math.max(containerW, 0.01);
  containerH = Math.max(containerH, 0.01);

  return {
    l: round2(containerL),
    w: round2(containerW),
    h: round2(containerH),
    actualWeightLb: round2(totalWeight)
  };
}

function rotations([l, w, h]) {
  return [
    [l, w, h],
    [l, h, w],
    [w, l, h],
    [w, h, l],
    [h, l, w],
    [h, w, l]
  ];
}

function volume([l, w, h]) {
  return l * w * h;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
