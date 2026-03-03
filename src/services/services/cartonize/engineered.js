export function engineeredCarton(packed, pad, rounding = 0.5) {
  // Perfect fit carton dimensions = packed dims rounded up
  const roundUp = (x) => Math.ceil(x / rounding) * rounding;

  const L = roundUp(packed.packedL);
  const W = roundUp(packed.packedW);
  const H = roundUp(packed.packedH);

  return {
    name: "Engineered (Perfect Fit) Carton",
    size: `${L}x${W}x${H}`,
    inner_l: L,
    inner_w: W,
    inner_h: H,
    notes: `Rounded up to nearest ${rounding}\" with padding included (${pad}\").`,
  };
}
