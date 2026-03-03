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

function expandUnits(items) {
  const units = [];
  for (const it of items) {
    for (let i = 0; i < it.qty; i++) {
      units.push({ name: it.name, l: it.l, w: it.w, h: it.h, wt: it.wt });
    }
  }
  return units;
}

/**
 * Simple shelf packing in a layer:
 * - We pack "rows" across width, rows accumulate along length.
 * - Layers stack by height.
 *
 * We don't know bin dims, so we run multiple strategies and choose smallest volume.
 */
function shelfPack(units, pad, orientPick) {
  // orientPick: function(unit) -> {l,w,h}
  const packedUnits = units.map((u) => orientPick(u));

  // Sort by footprint desc (helps stable shapes like bottles)
  packedUnits.sort((a, b) => (b.l * b.w) - (a.l * a.w));

  // We'll build a "free-form" layer: keep rows, each row has width sum and max length/height.
  const layers = [];
  let currentLayer = { rows: [], layerH: 0, layerL: 0, layerW: 0 };

  let currentRow = { rowW: 0, rowL: 0, rowH: 0 };

  function closeRow() {
    if (currentRow.rowW === 0) return;
    currentLayer.rows.push(currentRow);
    currentLayer.layerL += currentRow.rowL;
    currentLayer.layerW = Math.max(currentLayer.layerW, currentRow.rowW);
    currentLayer.layerH = Math.max(currentLayer.layerH, currentRow.rowH);
    currentRow = { rowW: 0, rowL: 0, rowH: 0 };
  }

  function closeLayer() {
    closeRow();
    if (currentLayer.rows.length === 0) return;
    layers.push(currentLayer);
    currentLayer = { rows: [], layerH: 0, layerL: 0, layerW: 0 };
  }

  // We need a “soft limit” to decide when to break rows/layers.
  // Use a dynamic target based on average footprint to avoid absurdly long layers.
  const avgL = packedUnits.reduce((s, u) => s + u.l, 0) / packedUnits.length;
  const avgW = packedUnits.reduce((s, u) => s + u.w, 0) / packedUnits.length;
  const targetW = Math.max(8, avgW * 4); // tweakable
  const targetL = Math.max(8, avgL * 4);

  for (const u of packedUnits) {
    // Row fill across width
    if (currentRow.rowW + u.w <= targetW || currentRow.rowW === 0) {
      currentRow.rowW += u.w;
      currentRow.rowL = Math.max(currentRow.rowL, u.l);
      currentRow.rowH = Math.max(currentRow.rowH, u.h);
    } else {
      // Start new row
      closeRow();
      // If adding this row makes layer too long, start a new layer
      if (currentLayer.layerL + u.l > targetL && currentLayer.rows.length > 0) {
        closeLayer();
      }
      // Put into new row
      currentRow.rowW = u.w;
      currentRow.rowL = u.l;
      currentRow.rowH = u.h;
    }
  }

  closeLayer();

  const packedL = Math.max(...layers.map((ly) => ly.layerL), 0) + pad;
  const packedW = Math.max(...layers.map((ly) => ly.layerW), 0) + pad;
  const packedH = layers.reduce((sum, ly) => sum + ly.layerH, 0) + pad;

  return {
    packedL,
    packedW,
    packedH,
    vol: packedL * packedW * packedH,
    strategy: "shelfPack",
  };
}

export function estimatePackedDims(items, pad) {
  const units = expandUnits(items);

  // Try multiple orientation strategies and choose best volume
  const strategies = [
    // Prefer keeping height smallest (good for bottles/mailers)
    (u) => {
      const perms = permutations3(u.l, u.w, u.h);
      perms.sort((a, b) => a[2] - b[2]); // smallest height
      return { l: perms[0][0], w: perms[0][1], h: perms[0][2] };
    },
    // Prefer smallest footprint
    (u) => {
      const perms = permutations3(u.l, u.w, u.h);
      perms.sort((a, b) => (a[0] * a[1]) - (b[0] * b[1]));
      return { l: perms[0][0], w: perms[0][1], h: perms[0][2] };
    },
    // Prefer longest dimension aligned as length (for kits)
    (u) => {
      const perms = permutations3(u.l, u.w, u.h);
      perms.sort((a, b) => b[0] - a[0]); // longest length
      return { l: perms[0][0], w: perms[0][1], h: perms[0][2] };
    },
  ];

  let best = null;
  for (const orientPick of strategies) {
    const packed = shelfPack(units, pad, orientPick);
    if (!best || packed.vol < best.vol) best = packed;
  }

  return best;
}
