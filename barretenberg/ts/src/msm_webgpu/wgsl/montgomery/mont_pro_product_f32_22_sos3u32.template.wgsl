// 22-bit-limb f32 Montgomery product with i32 accumulators — breaks the
// per-j carry chain via SEPARATE per-slot i32 accumulators.
//
// Same outer skeleton as sos3uv3 (CIOS, named locals s0..s11, shifted s
// indexing across iters). The inner-j loop accumulates lo and hi into
// SEPARATE per-slot i32 accumulators (tlo0..tlo11 and thi0..thi11).
// Different j's never touch the same slot — j writes tlo[j-1] and thi[j],
// and these are unique. All 11 inner-j operations are independent.
//
// === Why i32 not u32 bit-pattern accumulation ===
//
// sos3 mulhilo's lo is signed in (-1.5W, 1.5W) under fast-math. For
// bit-pattern u32 accumulation à la Emmart, we'd need to bias lo into a
// known binade where ULP=1 — but the lo range crosses binade boundaries
// for any bias choice. i32 sidesteps the problem: signed integer add is
// well-defined for negative lo, no bias needed.
//
// === Per-slot drain ===
//
// At end of outer iter, drain in i32 arithmetic:
//   carry = sum >> 22         // arithmetic shift, handles signed
//   residue = sum - (carry << 22)   // residue in [0, W)
//   s_new[k] = f32(residue)         // exact: residue < 2²² < 2²⁴

const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};
const N0_SCALED: f32 = {{ n0_scaled }};
const TWO_W: f32     = 8388608.0;          // 2 * 2^22

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

fn mulhilo_sos3_corr(a: f32, a_scaled: f32, b: f32) -> vec2<f32> {
    let hi_off_inner = fma(a_scaled, b, W);
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(-W, hi_off, BIAS);
    let lo0          = fma(a, b, neg_hi_w);
    let hi_pre       = hi_off - W;
    let underflow    = step(lo0, -0.5);
    let hi           = hi_pre - underflow;
    let lo           = fma(underflow, W, lo0);
    return vec2<f32>(hi, lo);
}

fn mulhilo_sos3_qi_lo(a: f32, b_scaled: f32, b: f32) -> f32 {
    let hi_off_inner = fma(a, b_scaled, W);
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(-W, hi_off, BIAS);
    let lo0          = fma(a, b, neg_hi_w);
    let underflow    = step(lo0, -0.5);
    let lo           = fma(underflow, W, lo0);
    return lo;
}

fn mulhilo_sos3_2_v2(a: vec2<f32>, a_scaled: vec2<f32>, b: vec2<f32>) -> vec4<f32> {
    let hi_off_inner = fma(a_scaled, b, vec2<f32>(W, W));
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(vec2<f32>(-W, -W), hi_off, vec2<f32>(BIAS, BIAS));
    let lo           = fma(a, b, neg_hi_w);
    return vec4<f32>(hi_off.x, lo.x, hi_off.y, lo.y);
}

fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
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

    // ===== Outer iter i=0 (unrolled — s[*] all zero). =====
    {
        let x_i        = (*x).limbs[0];
        let x_i_scaled = x_i * W_INV;
        let xy0        = mulhilo_sos3_corr(x_i, x_i_scaled, (*y).limbs[0]);
        let qi         = mulhilo_sos3_qi_lo(xy0.y, N0_SCALED, N0);
        let qi_scaled  = qi * W_INV;

        let c_cancel = step(0.5, xy0.y);
        let qp0_lo   = c_cancel * (W - xy0.y);
        let qp0_hi   = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let init_slot0 = xy0.x + qp0_hi + c_cancel;

{{#slot_inits_i0}}
        var {{name}}: i32 = {{init_expr}};
{{/slot_inits_i0}}

        let xq_scaled = vec2<f32>(x_i_scaled, qi_scaled);
        let xq        = vec2<f32>(x_i, qi);

{{#inner_pairs}}
        {
            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[{{j}}u], p.limbs[{{j}}u]));
            let lo_sum = mh.y + mh.w;
            let hi_sum = mh.x + mh.z - TWO_W;
            tlo{{km1}} = tlo{{km1}} + i32(lo_sum);
            thi{{k}}   = thi{{k}}   + i32(hi_sum);
        }
{{/inner_pairs}}

        var carry: i32 = 0;
{{#drain_cols}}
        {
            let sum       = tlo{{k}} + thi{{k}} + carry;
            let new_carry = sum >> 22u;
            s{{k}} = f32(sum - (new_carry << 22u));
            carry = new_carry;
        }
{{/drain_cols}}
    }

    // ===== Outer iter i=1..NUM_LIMBS-1 (runtime loop). =====
    for (var i = 1u; i < NUM_LIMBS; i = i + 1u) {
        let x_i        = (*x).limbs[i];
        let x_i_scaled = x_i * W_INV;

        let xy0       = mulhilo_sos3_corr(x_i, x_i_scaled, (*y).limbs[0]);
        let sum0      = s0 + xy0.y;
        let sum0_s    = bias_split_f32_le2w(sum0);
        let qi        = mulhilo_sos3_qi_lo(sum0_s.y, N0_SCALED, N0);
        let qi_scaled = qi * W_INV;

        let c_cancel = step(0.5, sum0_s.y);
        let qp0_lo   = c_cancel * (W - sum0_s.y);
        let qp0_hi   = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        let init_slot0 = xy0.x + qp0_hi + c_cancel + sum0_s.x;

{{#slot_inits_general}}
        var {{name}}: i32 = {{init_expr}};
{{/slot_inits_general}}

        let xq_scaled = vec2<f32>(x_i_scaled, qi_scaled);
        let xq        = vec2<f32>(x_i, qi);

{{#inner_pairs}}
        {
            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[{{j}}u], p.limbs[{{j}}u]));
            let lo_sum = mh.y + mh.w;
            let hi_sum = mh.x + mh.z - TWO_W;
            tlo{{km1}} = tlo{{km1}} + i32(lo_sum);
            thi{{k}}   = thi{{k}}   + i32(hi_sum);
        }
{{/inner_pairs}}

        var carry: i32 = 0;
{{#drain_cols}}
        {
            let sum       = tlo{{k}} + thi{{k}} + carry;
            let new_carry = sum >> 22u;
            s{{k}} = f32(sum - (new_carry << 22u));
            carry = new_carry;
        }
{{/drain_cols}}
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
