// f32 to IEEE half-precision bits, rounding to nearest even, for textures in r16float, which every WebGPU
// device can filter. Out-of-range values become ±Infinity and NaN stays NaN.

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

export function toHalf(value: number): number {
  f32[0] = value;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exponent = (x >>> 23) & 0xff;
  const mantissa = x & 0x7fffff;
  if (exponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  const e = exponent - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;
  if (e <= 0) {
    // A subnormal half, or zero.
    if (e < -10) return sign;
    const m = mantissa | 0x800000;
    const shift = 14 - e;
    const half = m >>> shift;
    const rest = m & ((1 << shift) - 1);
    const midpoint = 1 << (shift - 1);
    return sign | (half + (rest > midpoint || (rest === midpoint && half & 1) ? 1 : 0));
  }
  const half = (e << 10) | (mantissa >>> 13);
  const rest = mantissa & 0x1fff;
  // Rounding may carry into the exponent, which is still correct, up to Infinity.
  return sign | (half + (rest > 0x1000 || (rest === 0x1000 && half & 1) ? 1 : 0));
}

export function toHalves(values: ArrayLike<number>): Uint16Array {
  return Uint16Array.from({ length: values.length }, (_, k) => toHalf(values[k]));
}
