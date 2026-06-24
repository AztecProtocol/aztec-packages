// 22-bit-limb sibling of `mulhilo.wgsl`. Same FMA-bias trick, different
// constants (W = 2^22, BIAS = 2^44). The two files are never compiled
// into the same WGSL module — callers pick one bundle or the other.
//
// Inputs:  a, b in [0, 2^22) stored as f32 (integer-valued).
// Output:  vec2(hi, lo) with a*b == hi * 2^22 + lo,  hi, lo in [0, 2^22).
//
// Math (load-bearing):
//   fma(a, b, BIAS) computes a*b + 2^44 with infinite intermediate
//   precision and rounds ONCE to f32. Inside [2^44, 2^45) the f32 ULP is
//   exactly 2^21, so the rounded result lies on a multiple of 2^21
//   (not 2^22!). Dividing by W and flooring effectively rounds to W,
//   giving a non-negative integer q/W < W. The lo correction follows the
//   same step()-based underflow scheme as the 23-bit variant.
//
// Important difference from 23-bit: at 22-bit, a*b in [0, 2^44) plus
// BIAS = 2^44 sits exactly at the boundary [2^44, 2^45]. Inside that
// range ULP is 2^21, so `floor(abp * W_INV)` rounds to the nearest
// multiple of W/2 — but then `lo0 = fma(a, b, -hi_pre * W)` recovers
// exactly. The step() correction handles the half-W slop.
const BIAS: f32 = 17592186044416.0;            // 2^44
const W: f32    = 4194304.0;                   // 2^22
const W_INV: f32 = 2.384185791015625e-7;       // 2^-22

fn mulhilo(a: f32, b: f32) -> vec2<f32> {
    let abp = fma(a, b, BIAS);
    let hi_pre = floor(abp * W_INV) - W;
    let lo0 = fma(a, b, -hi_pre * W);
    let underflow = step(lo0, -0.5);
    let hi = hi_pre - underflow;
    let lo = lo0 + underflow * W;
    return vec2<f32>(hi, lo);
}

fn mulhilo2(a: vec2<f32>, b: vec2<f32>) -> vec4<f32> {
    let abp = fma(a, b, vec2<f32>(BIAS, BIAS));
    let hi_pre = floor(abp * W_INV) - vec2<f32>(W, W);
    let lo0 = fma(a, b, -hi_pre * W);
    let underflow = step(lo0, vec2<f32>(-0.5, -0.5));
    let hi = hi_pre - underflow;
    let lo = lo0 + underflow * W;
    return vec4<f32>(hi.x, lo.x, hi.y, lo.y);
}
