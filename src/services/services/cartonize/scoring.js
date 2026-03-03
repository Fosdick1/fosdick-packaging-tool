export function dimWeightLb(volumeIn3, dimFactor) {
  const df = Number(dimFactor) || 139;
  return volumeIn3 / df;
}

export function scoreOption({ option, packed, dimFactor, billedWeightLb, dimWeightLb, volumeIn3 }) {
  return {
    id: option.id,
    name: option.name,
    kind: option.kind || option.type || "box",
    wall: option.wall || null,
    inner: option.inner,
    volumeIn3,
    dimWeightLb: round2(dimWeightLb),
    billedWeightLb: round2(billedWeightLb),
    actualWeightLb: round2(packed.actualWeightLb),
    dimFactor
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
