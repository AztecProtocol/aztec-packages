// Branchless 23-bit hi/lo split of an integer product, in f32 FMA.
//
// Inputs:  a, b in [0, 2^23) stored as f32 (integer-valued).
// Output:  vec2(hi, lo) with a*b == hi * 2^23 + lo,  hi, lo in [0, 2^23).
//
// Math (load-bearing):
//   fma(a, b, BIAS) computes a*b + 2^46 with infinite intermediate
//   precision and rounds ONCE to f32. Inside [2^46, 2^47) the f32 ULP is
//   exactly 2^23, so the rounded result lies on a multiple of 2^23. We
//   then divide by W (exact since the result is a multiple of W),
//   subtract W = BIAS / W (exact integer constant), and floor — this
//   yields q/W rounded to nearest integer. The second FMA exactly
//   evaluates lo0 = a*b - hi_pre*W, integer-valued in [-2^22, 2^22].
//   The step() correction canonicalises lo to [0, 2^23) and decrements
//   hi by 1 on the underflow branch (lo0 < 0).
//
// Why not `(fma(a, b, BIAS) - BIAS)` directly. Apple Metal's MSL
// backend defaults to `-ffast-math`, which is permitted to rewrite
// `(x + BIAS) - BIAS` to `x` algebraically. When `b == 1.0` (which
// occurs for the top limb of the BN254 modulus, p.limbs[NUM_LIMBS-1]
// == 1), `fma(a, 1.0, BIAS)` reduces to `a + BIAS` and then the
// subtraction collapses to `a`, breaking the rounding-to-2^23 step
// that the algorithm depends on. The floor-based `q/W` extraction
// below is opaque to fast-math reassociation: even when fast-math
// distributes `(a + BIAS) * W_INV` to `a*W_INV + BIAS*W_INV`, the
// surrounding `floor(...) - W` recovers `floor(a*W_INV)` correctly.
const BIAS: f32 = 70368744177664.0;            // 2^46
const W: f32    = 8388608.0;                   // 2^23
const W_INV: f32 = 1.1920928955078125e-7;      // 2^-23

fn mulhilo(a: f32, b: f32) -> vec2<f32> {
    let abp = fma(a, b, BIAS);
    // abp/W is an exact integer in [W, 2W] (since abp is a multiple of W
    // and a*b in [0, 2^46) gives abp in [2^46, 2^47]). Subtracting W gives
    // (abp - BIAS) / W, which is `a*b` rounded to nearest multiple of W
    // and then divided by W (a non-negative integer < W).
    let hi_pre = floor(abp * W_INV) - W;
    let lo0 = fma(a, b, -hi_pre * W);
    // Branchless underflow correction: 1.0 iff lo0 < 0 (then hi -= 1, lo += W).
    let underflow = step(lo0, -0.5);
    let hi = hi_pre - underflow;
    let lo = lo0 + underflow * W;
    return vec2<f32>(hi, lo);
}

// Vec2 variant: computes mulhilo(a.x, b.x) and mulhilo(a.y, b.y) in
// parallel. Returns vec4<f32> = (hi_x, lo_x, hi_y, lo_y). Each element
// follows the same identity a*b = hi * W + lo with hi, lo in [0, W).
// Gives the MSL backend the chance to vectorize the two FMAs across the
// scalar lanes Apple Silicon GPUs use for parallel FMA throughput.
fn mulhilo2(a: vec2<f32>, b: vec2<f32>) -> vec4<f32> {
    let abp = fma(a, b, vec2<f32>(BIAS, BIAS));
    let hi_pre = floor(abp * W_INV) - vec2<f32>(W, W);
    let lo0 = fma(a, b, -hi_pre * W);
    let underflow = step(lo0, vec2<f32>(-0.5, -0.5));
    let hi = hi_pre - underflow;
    let lo = lo0 + underflow * W;
    return vec4<f32>(hi.x, lo.x, hi.y, lo.y);
}
