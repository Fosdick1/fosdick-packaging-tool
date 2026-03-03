import { dimWeightLb } from "./scoring";

export function engineeredFit(packed, { isHazmat, hazmatClass, dimFactor }) {
  const l = packed.l;
  const w = packed.w;
  const h = packed.h;

  const volume = l * w * h;
  const dimWt = dimWeightLb(volume, dimFactor);
  const billed = Math.max(packed.actualWeightLb, dimWt);

  return {
    size: `${roundUp(l)}x${roundUp(w)}x${roundUp(h)} (custom)`,
    inner: { l: round2(l), w: round2(w), h: round2(h) },
    volumeIn3: round2(volume),
    dimWeightLb: round2(dimWt),
    billedWeightLb: round2(billed),
    notes: isHazmat
      ? [`Hazmat enabled (${hazmatClass || "unspecified"}): prefer stronger cartons + compliant labeling.`]
      : []
  };
}

function roundUp(n) {
  return Math.ceil(n);
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
