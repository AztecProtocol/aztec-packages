// 19-bit-limb f32 Montgomery product — sos3uv3 SHAPE without per-iter drain.
// PURE F32. No i32 anywhere in the multiply phase.
//
// === Why no carry_in scalar ===
// u32 mont (mont_pro_product.template.wgsl) doesn't track a separate
// carry between iters — the slot-zeroing carry `c` is folded into the
// next iter's slot 0 write. We do the same here, in two parts:
//   - `s_low` (f32 < W): canonical low of next iter's T[i] (used for qi).
//     Replaces sos3uv3's `s0`, but without computing s_1..s_{N-1}.
//   - high carry from this iter's slot-i+1 extraction: added directly to
//     `tlo1` before the shift, which becomes `tlo0` of next iter.
//
// === Bounds (pure f32) ===
//   - tlo[k], thi[k]: each accumulates over iters via shift. Max value:
//     N · 2W + small high-carry contribs ≤ 14.7M < 2²⁴. Fits f32 exactly.
//   - s_low: always < W. Fits trivially.
//   - high carry per iter ≈ T[i+1]/W ≤ 60. Fits trivially.
//   - We never sum tlo[k]+thi[k] directly (would exceed 2²⁴). All
//     combines use per-component floor decomposition: each remainder is
//     < W, the residue sum stays < 3W, exact in f32.
//
// === Final drain (also pure f32) ===
// Per slot at drain time, tlo[k]+thi[k] sum may exceed 2²⁴. So drain
// uses the same per-component floor decomposition trick as the per-iter
// qi extraction. No i32 anywhere.

const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};
const N0_SCALED: f32 = {{ n0_scaled }};
const W: f32         = 524288.0;            // 2^19
const W_INV: f32     = 1.9073486328125e-6;  // 2^-19
const BIAS: f32      = 274877906944.0;      // 2^38
const TWO_W: f32     = 1048576.0;           // 2*W = 2^20

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
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
    // Split per-slot f32 accumulators, sos3uv3 layout.
{{#slots}}
    var tlo{{k}}: f32 = 0.0;
    var thi{{k}}: f32 = 0.0;
{{/slots}}
    // Canonical low of current T[i] for qi extraction. Plays the same
    // role as sos3uv3's `s0`; iter 0 starts with s_low = 0.
    var s_low: f32 = 0.0;
    var p = get_p_f32();

    for (var i = 0u; i < NUM_LIMBS; i = i + 1u) {
        let x_i        = (*x).limbs[i];
        let x_i_scaled = x_i * W_INV;
        let xy0        = mulhilo_sos3_corr(x_i, x_i_scaled, (*y).limbs[0]);
        let sum0       = s_low + xy0.y;
        let sum0_q     = floor(sum0 * W_INV);
        let sum0_r     = sum0 - sum0_q * W;
        let qi         = mulhilo_sos3_qi_lo(sum0_r, N0_SCALED, N0);
        let qi_scaled  = qi * W_INV;
        let qp0        = mulhilo_sos3_corr(qi, qi_scaled, p.limbs[0]);
        let c_cancel   = step(0.5, sum0_r);
        // init_slot0 = total j=0 hi contribs + qi-zeroing overflows, all
        // bound for absolute slot i+1 (= physical slot 0 in iter i frame).
        let init_slot0 = xy0.x + qp0.x + c_cancel + sum0_q;

        // Inner-j: vec2 mulhilo (x_i, qi) × (y[j], p[j]) writes tlo[j-1], thi[j].
        let xq        = vec2<f32>(x_i, qi);
        let xq_scaled = vec2<f32>(x_i_scaled, qi_scaled);
{{#inner_pairs}}
        {
            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[{{j}}u], p.limbs[{{j}}u]));
            let lo_sum = mh.y + mh.w;
            let hi_sum = mh.x + mh.z - TWO_W;
            tlo{{km1}} = tlo{{km1}} + lo_sum;
            thi{{k}}   = thi{{k}}   + hi_sum;
        }
{{/inner_pairs}}

        // Extract canonical low of NEXT iter's T[i+1] = tlo0 + thi0 + init_slot0.
        // tlo0 + thi0 alone may exceed 2²⁴, so we decompose each via floor
        // before summing (the residues are < W each, sum stays < 3W).
        let t_lo_q = floor(tlo0 * W_INV);
        let t_lo_r = tlo0 - t_lo_q * W;
        let t_hi_q = floor(thi0 * W_INV);
        let t_hi_r = thi0 - t_hi_q * W;
        let r_sum  = t_lo_r + t_hi_r + init_slot0;
        let r_q    = floor(r_sum * W_INV);
        s_low      = r_sum - r_q * W;                // canonical T[i+1] mod W (for next qi)
        let high_carry = t_lo_q + t_hi_q + r_q;      // overflow → goes to abs slot i+2

        // Add overflow to tlo1 (= abs slot i+2 in current frame). After
        // shift this becomes tlo0 of next iter — same destination as u32
        // mont's `s.limbs[0] = s.limbs[1] + ... + c` pattern.
        tlo1 = tlo1 + high_carry;

        // SHIFT: physical slot k of iter i+1 ← slot k+1 of iter i.
{{#shift_pairs}}
        tlo{{dst}} = tlo{{src}};
        thi{{dst}} = thi{{src}};
{{/shift_pairs}}
        tlo{{last_slot}} = 0.0;
        thi{{last_slot}} = 0.0;
    }

    // Final drain (pure f32). After last shift: tlo_k / thi_k hold contribs
    // for abs slots N+1+k (k=0..N-2); s_low holds canonical abs slot N.
    // Same floor-decomposition trick as the per-iter qi extraction since
    // tlo+thi may exceed 2²⁴.
    var s: BigIntF32;
    s.limbs[0u] = s_low;
    var carry: f32 = 0.0;
{{#drain_slots}}
    {
        let t_lo_q = floor(tlo{{src_k}} * W_INV);
        let t_lo_r = tlo{{src_k}} - t_lo_q * W;
        let t_hi_q = floor(thi{{src_k}} * W_INV);
        let t_hi_r = thi{{src_k}} - t_hi_q * W;
        let r_sum  = t_lo_r + t_hi_r + carry;
        let r_q    = floor(r_sum * W_INV);
        s.limbs[{{dst_k}}u] = r_sum - r_q * W;
        carry = t_lo_q + t_hi_q + r_q;
    }
{{/drain_slots}}
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
