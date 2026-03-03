import { validateInputs } from "./validators";
import { packItemsShelf3D } from "./packer";
import { scoreOption, dimWeightLb } from "./scoring";
import { engineeredFit } from "./engineered";

/**
 * Main cartonization entry point
 * @param {Object} params
 * @param {Array}  params.items  [{name,l,w,h,wt,qty}]
 * @param {number} params.padInches  global padding added around packed config (in)
 * @param {number} params.dimFactor  DIM divisor (e.g., 139)
 * @param {Object} params.catalog  boxCatalog.json import
 * @param {Object} params.hazmat {isHazmat:boolean, hazmatClass:string}
 */
export function cartonize({ items, padInches = 1, dimFactor = 139, catalog, hazmat }) {
  const v = validateInputs({ items, padInches, dimFactor, catalog });
  if (!v.ok) return v;

  const isHazmat = !!hazmat?.isHazmat;
  const hazmatClass = (hazmat?.hazmatClass || "").trim();

  // Pack the configuration into a single "packed" cuboid (heuristic)
  const packed = packItemsShelf3D(items);

  // Apply global padding around the packed result
  const packedWithPad = {
    l: packed.l + 2 * padInches,
    w: packed.w + 2 * padInches,
    h: packed.h + 2 * padInches,
    actualWeightLb: packed.actualWeightLb
  };

  // Engineered (custom) option always exists
  const engineered = engineeredFit(packedWithPad, { isHazmat, hazmatClass, dimFactor });

  // Build stock candidates from catalog
  const boxes = Array.isArray(catalog?.boxes) ? catalog.boxes : [];
  const mailers = Array.isArray(catalog?.mailers) ? catalog.mailers : [];

  // Hazmat rule (simple for now): no mailers, boxes only
  const eligibleMailers = isHazmat ? [] : mailers;

  const candidates = [
    ...boxes.map((b) => ({ ...b, kind: "box" })),
    ...eligibleMailers.map((m) => ({ ...m, kind: "mailer" }))
  ];

  // Filter by true fit (all dimensions) with rotation allowed
  const fits = candidates
    .map((opt) => {
      const inner = opt.inner;
      const fit = fitsWithRotation(packedWithPad, inner, opt.kind);
      if (!fit.ok) return null;

      const volumeIn3 = inner.l * inner.w * inner.h;
      const dimWt = dimWeightLb(volumeIn3, dimFactor);
      const billed = Math.max(packedWithPad.actualWeightLb, dimWt);

      const scored = scoreOption({
        option: opt,
        packed: packedWithPad,
        dimFactor,
        billedWeightLb: billed,
        dimWeightLb: dimWt,
        volumeIn3
      });

      return {
        ...scored,
        fitOrientation: fit.orientation
      };
    })
    .filter(Boolean);

  // If none fit, return engineered + empty stock list
  if (fits.length === 0) {
    return {
      ok: true,
      packed: packedWithPad,
      engineered,
      bestStock: null,
      stockOptions: [],
      notes: stockNotes({ isHazmat, hazmatClass })
    };
  }

  // Sort by smallest billed weight, then smallest volume (then tie-break by name)
  fits.sort((a, b) => {
    if (a.billedWeightLb !== b.billedWeightLb) return a.billedWeightLb - b.billedWeightLb;
    if (a.volumeIn3 !== b.volumeIn3) return a.volumeIn3 - b.volumeIn3;
    return (a.name || "").localeCompare(b.name || "");
  });

  const top = fits.slice(0, 3);

  return {
    ok: true,
    packed: packedWithPad,
    engineered,
    bestStock: top[0] || null,
    stockOptions: top,
    notes: stockNotes({ isHazmat, hazmatClass })
  };
}

function stockNotes({ isHazmat, hazmatClass }) {
  if (!isHazmat) return [];
  return [
    `Hazmat enabled (${hazmatClass || "unspecified class"}): mailers excluded; boxes only.`
  ];
}

/**
 * Must fit all dimensions. Rotation allowed.
 * Mailer rule: packed height must be <= mailer inner height AND "slim" (<= 2 inches) to prefer mailers.
 */
function fitsWithRotation(packed, inner, kind) {
  const perms = permutations([packed.l, packed.w, packed.h]);

  for (const [L, W, H] of perms) {
    const ok = L <= inner.l && W <= inner.w && H <= inner.h;
    if (!ok) continue;

    if (kind === "mailer") {
      // Slim rule (adjust later): if too thick, don't treat as mailer-fit
      if (H > inner.h) continue;
      if (H > 2) continue;
    }

    return { ok: true, orientation: { l: L, w: W, h: H } };
  }

  return { ok: false };
}

function permutations([a, b, c]) {
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a]
  ];
}
