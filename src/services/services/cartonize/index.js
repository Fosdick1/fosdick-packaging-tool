import { normalizeItems, totalActualWeight } from "./validators";
import { estimatePackedDims } from "./packer";
import { billedWeightBox, billedWeightMailer, fits, packageVolume, rankByBilledThenVolume } from "./scoring";
import { engineeredCarton } from "./engineered";

export function cartonize({
  items,
  padInches,
  dimFactor,
  catalog,
  hazmat,
}) {
  const norm = normalizeItems(items);
  if (!norm.ok) return { ok: false, error: norm.error };

  const pad = padInches;
  const packed = estimatePackedDims(norm.items, pad);
  const actualTotalWeight = totalActualWeight(norm.items);

  const all = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const boxes = all.filter((p) => p.type === "box");
  const mailers = all.filter((p) => p.type === "mailer");

  const engineered = engineeredCarton(packed, pad, 0.5);

  const engineeredBW = billedWeightBox(engineered, dimFactor, actualTotalWeight);
  const engineeredOut = {
    ...engineered,
    packageVol: packageVolume(engineered),
    ...engineeredBW,
    kind: "engineered",
  };

  const slimMax = catalog?.mailer_rules?.max_packed_height_in ?? 2.0;
  const slimForMailer = packed.packedH <= slimMax;

  const stockBoxes = boxes
    .map((b) => {
      if (!fits(packed, b)) return null;
      return {
        ...b,
        packageVol: packageVolume(b),
        ...billedWeightBox(b, dimFactor, actualTotalWeight),
        kind: "box",
      };
    })
    .filter(Boolean)
    .sort(rankByBilledThenVolume);

  const stockMailers = slimForMailer
    ? mailers
        .map((m) => {
          if (!fits(packed, m)) return null;
          return {
            ...m,
            packageVol: packageVolume(m),
            ...billedWeightMailer(actualTotalWeight),
            kind: "mailer",
          };
        })
        .filter(Boolean)
        .sort(rankByBilledThenVolume)
    : [];

  const topBoxes = stockBoxes.slice(0, 3);
  const topMailers = stockMailers.slice(0, 3);

  const bestStock = [...topMailers, ...topBoxes].sort(rankByBilledThenVolume)[0] || null;

  return {
    ok: true,
    packed,
    actualTotalWeight,
    engineered: engineeredOut,
    slimForMailer,
    bestStock,
    topBoxes,
    topMailers,
    hazmatNote: hazmat?.isHazmat && hazmat?.hazmatClass
      ? `Hazmat/ORMD noted: ${hazmat.hazmatClass} (rules engine pending).`
      : null,
  };
}
