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

export function fits(packed, pkg) {
  const L = pkg.inner_l ?? pkg.l;
  const W = pkg.inner_w ?? pkg.w;
  const H = pkg.inner_h ?? pkg.h;

  for (const [pl, pw, ph] of permutations3(packed.packedL, packed.packedW, packed.packedH)) {
    if (L >= pl && W >= pw && H >= ph) return true;
  }
  return false;
}

export function packageVolume(pkg) {
  const L = pkg.inner_l ?? pkg.l;
  const W = pkg.inner_w ?? pkg.w;
  const H = pkg.inner_h ?? pkg.h;
  return L * W * H;
}

export function billedWeightBox(pkg, dimFactor, actualTotalWeight) {
  const L = pkg.inner_l ?? pkg.l;
  const W = pkg.inner_w ?? pkg.w;
  const H = pkg.inner_h ?? pkg.h;
  const dimWeight = (L * W * H) / dimFactor;
  const billedRaw = Math.max(actualTotalWeight, dimWeight);
  return {
    dimWeight: Math.round(dimWeight * 1000) / 1000,
    billedWeight: Math.ceil(billedRaw),
  };
}

export function billedWeightMailer(actualTotalWeight) {
  return {
    dimWeight: null,
    billedWeight: Math.ceil(actualTotalWeight),
  };
}

export function rankByBilledThenVolume(a, b) {
  const d = a.billedWeight - b.billedWeight;
  if (d !== 0) return d;
  return a.packageVol - b.packageVol;
}
