// 22-bit-limb f32 Montgomery product, sos3uv3 — chain breaking via
// SEPARATE per-slot f32 accumulators (lo and hi).
//
// Inside the inner-j loop:
//   - sos3uv2 had a single chain c_hi/c_lo flowing j → j+1 (serial).
//   - sos3u32 used i32 accumulators (broken chain but slow int ops).
//   - sos3uv3 uses TWO per-slot f32 accumulators (tlo[k], thi[k]).
//     Each j writes UNIQUE tlo[j-1] and thi[j] — no overlap across j's,
//     no carry chain. Stays in f32 throughout (no int conversions).
//
// Per-slot bound: tlo[k] = s_old[k+1] + 1 lo (≤ 2.5W). thi[k] = 1 hi
// (≤ W). Combined at drain: 3.5W < 2²³·⁸ < 2²⁴ — fits f32 exactly.
//
// Drain at end of each outer iter: combine tlo[k] + thi[k] + carry,
// floor-based bias_split, write canonical s[k]. Serial across cols.
//
// === Structure ===
// Outer iter i=0 is unrolled (no shifted-in s values to read). Iters
// 1..N-1 are in a runtime `for` loop with a separate slot_init that pulls
// in s1..s11. Inner-j pairs and drain cols are mustache-expanded — keeps
// the named locals (tlo0..tlo11, thi0..thi11) which Metal can register-
// allocate instead of spilling to thread-private memory.

const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};
const N0_SCALED: f32 = {{ n0_scaled }};
// W (2^b), W_INV (2^-b), BIAS (2^2b), TWO_W (2^(b+1)) are emitted by the generator
// (shader_manager renderSos3uv3Mont) from the f32 limb width, ahead of this body.

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

fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
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
{{#s_decls}}
    var s{{idx}}: f32 = 0.0;
{{/s_decls}}

    var p = get_p_f32();

    // ===== Outer iter i=0 (unrolled — s[*] all zero, no shift-in). =====
    {
        let x_i        = (*x).limbs[0];
        let x_i_scaled = x_i * W_INV;
        let xy0        = mulhilo_sos3_corr(x_i, x_i_scaled, (*y).limbs[0]);
        let qi         = mulhilo_sos3_qi_lo(xy0.y, N0_SCALED, N0);
        let qi_scaled  = qi * W_INV;

        let c_cancel = step(0.5, xy0.y);
        let qp0_lo   = c_cancel * (W - xy0.y);
        let qp0_hi   = fma(qi, p.limbs[0], -qp0_lo) * W_INV;

        // j=0's contribution to slot 0 (= position 1 unshifted).
        let init_slot0 = xy0.x + qp0_hi + c_cancel;

        // Slot init for iter 0: tlo[0] gets init_slot0; everything else 0.
{{#slot_inits_i0}}
        var {{name}}: f32 = {{init_expr}};
{{/slot_inits_i0}}

        let xq_scaled = vec2<f32>(x_i_scaled, qi_scaled);
        let xq        = vec2<f32>(x_i, qi);

        // Inner-j writes: pair (y[j], p[j]) mulhilo, lo to tlo[j-1], hi to thi[j].
{{#inner_pairs}}
        {
            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[{{j}}u], p.limbs[{{j}}u]));
            let lo_sum = mh.y + mh.w;
            let hi_sum = mh.x + mh.z - TWO_W;
            tlo{{km1}} = tlo{{km1}} + lo_sum;
            thi{{k}}   = thi{{k}}   + hi_sum;
        }
{{/inner_pairs}}

        // Drain: combine tlo[k]+thi[k]+carry, split. Serial across cols.
        var carry: f32 = 0.0;
{{#drain_cols}}
        {
            let sum = tlo{{k}} + thi{{k}} + carry;
            let split = bias_split_f32_le4w(sum);
            s{{k}} = split.y;
            carry = split.x;
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

        // j=0's contribution to slot 0 + s_old[1] shifted in.
        let init_slot0 = xy0.x + qp0_hi + c_cancel + sum0_s.x;

        // Slot init for i>=1: tlo[k] pulls in s[k+1] as the shifted carry.
{{#slot_inits_general}}
        var {{name}}: f32 = {{init_expr}};
{{/slot_inits_general}}

        let xq_scaled = vec2<f32>(x_i_scaled, qi_scaled);
        let xq        = vec2<f32>(x_i, qi);

{{#inner_pairs}}
        {
            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[{{j}}u], p.limbs[{{j}}u]));
            let lo_sum = mh.y + mh.w;
            let hi_sum = mh.x + mh.z - TWO_W;
            tlo{{km1}} = tlo{{km1}} + lo_sum;
            thi{{k}}   = thi{{k}}   + hi_sum;
        }
{{/inner_pairs}}

        var carry: f32 = 0.0;
{{#drain_cols}}
        {
            let sum = tlo{{k}} + thi{{k}} + carry;
            let split = bias_split_f32_le4w(sum);
            s{{k}} = split.y;
            carry = split.x;
        }
{{/drain_cols}}
    }

    var s: BigIntF32;
{{#s_finals}}
    s.limbs[{{idx}}] = s{{idx}};
{{/s_finals}}
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
