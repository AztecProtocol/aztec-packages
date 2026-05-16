// 22-bit-limb f32 Montgomery product, UNROLLED variant of V1.
//
// Identical algorithm to `mont_pro_product_f32_22.template.wgsl` (3-stage
// cascade per inner iter, c_hi/c_lo carry pair, mulhilo2-based xy/qp
// fused), with one mechanical change: the inner-j loops are manually
// unrolled into straight-line code over 12 named f32 locals
// (`s0, s1, ..., s11`) instead of the array-indexed `s.limbs[j]`.
//
// Why: Apple Metal's WGSL backend doesn't always scalar-replace small
// arrays under runtime indexing — `s.limbs[j]` with `j` as a loop
// variable can spill the 12-limb accumulator into thread-private memory
// (10–50× slower on Apple Silicon than register access). Unrolling forces
// the indices into compile-time constants and lets the compiler keep all
// 12 accumulator slots in registers.
//
// The outer-i loop is left as a runtime `for` — `x.limbs[i]` is read once
// per outer iter and stored in a local, so the only dynamic index here is
// a single load. (s.limbs is never indexed by `i`.)
//
// W, W_INV, BIAS come from `mulhilo_22.wgsl`. Mustache substitutions
// (same as V1) plus two unrolled-body slots:
//   inner_body_i0       — straight-line inner-j for outer iter i=0.
//   inner_body_general  — straight-line inner-j for outer i=1..N-1.
const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
}

fn bias_split_f32_le2w(x: f32) -> vec2<f32> {
    let hi = step(W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn bias_split_f32_le3w(x: f32) -> vec2<f32> {
    let hi = step(W, x) + step(2.0 * W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// CIOS Montgomery product over 22-bit f32 limbs, returning the result
// in [0, 2p). Inner-j loops are manually unrolled.
fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    // 12 named accumulator slots. Kept in registers under unroll.
    var s0: f32  = 0.0;
    var s1: f32  = 0.0;
    var s2: f32  = 0.0;
    var s3: f32  = 0.0;
    var s4: f32  = 0.0;
    var s5: f32  = 0.0;
    var s6: f32  = 0.0;
    var s7: f32  = 0.0;
    var s8: f32  = 0.0;
    var s9: f32  = 0.0;
    var s10: f32 = 0.0;
    var s11: f32 = 0.0;

    var p = get_p_f32();

    // === Outer iter i=0: s.limbs[*] treated as zero. ===
    {
        let x_i = (*x).limbs[0];
        let xy0 = mulhilo(x_i, (*y).limbs[0]);
        let qi = mulhilo(xy0.y, N0).y;

        let c_cancel = step(0.5, xy0.y);
        let qp0_lo = c_cancel * (W - xy0.y);
        let qp0_hi = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let hi_pair = xy0.x + qp0_hi;
        let carry_full = hi_pair + c_cancel;
        let carry_s = bias_split_f32_le2w(carry_full);
        var c_hi = carry_s.x;
        var c_lo = carry_s.y;

{{{ inner_body_i0 }}}

        s11 = fma(c_hi, W, c_lo);
    }

    // === Outer iter i=1..NUM_LIMBS-1 ===
    for (var i = 1u; i < NUM_LIMBS; i = i + 1u) {
        let x_i = (*x).limbs[i];

        let xy0 = mulhilo(x_i, (*y).limbs[0]);
        let sum0 = s0 + xy0.y;
        let sum0_s = bias_split_f32_le2w(sum0);
        let qi = mulhilo(sum0_s.y, N0).y;

        let c_cancel = step(0.5, sum0_s.y);
        let qp0_lo = c_cancel * (W - sum0_s.y);
        let qp0_hi = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let c_small = c_cancel + sum0_s.x;
        let hi_pair = xy0.x + qp0_hi;
        let carry_full = hi_pair + c_small;
        let carry_s = bias_split_f32_le3w(carry_full);
        var c_hi = carry_s.x;
        var c_lo = carry_s.y;

{{{ inner_body_general }}}

        s11 = fma(c_hi, W, c_lo);
    }

    var s: BigIntF32;
    s.limbs[0]  = s0;
    s.limbs[1]  = s1;
    s.limbs[2]  = s2;
    s.limbs[3]  = s3;
    s.limbs[4]  = s4;
    s.limbs[5]  = s5;
    s.limbs[6]  = s6;
    s.limbs[7]  = s7;
    s.limbs[8]  = s8;
    s.limbs[9]  = s9;
    s.limbs[10] = s10;
    s.limbs[11] = s11;
    return s;
}

fn montgomery_product_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s = montgomery_product_f32_unreduced(x, y);
    var p = get_p_f32();
    return conditional_reduce_f32(&s, &p);
}

fn conditional_reduce_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    if (bigint_f32_gt(x, y) || bigint_f32_eq(x, y)) {
        var res: BigIntF32;
        let _borrow = bigint_f32_sub(x, y, &res);
        return res;
    }
    return *x;
}
