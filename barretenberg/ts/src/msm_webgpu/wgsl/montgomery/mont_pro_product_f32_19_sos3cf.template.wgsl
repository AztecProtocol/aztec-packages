// 19-bit-limb Mont product. SOS structure, deferred drain.
//
// Carry handling: Mont reduction REQUIRES one carry per outer iter (T[i]/W
// → T[i+1]) to feed qi_{i+1} correctly — without it the final result is
// wrong. What this variant DOES avoid: any per-inner-limb drain chain.
// The inner-j loop is pure accumulation; only the outer iter has one carry.
//
// Slot capacity:
//   - 19-bit limbs, N=14 -> 28 slots T0..T27.
//   - Per slot accumulates up to 2N pair contribs of < 2W each = 4NW = 29M.
//   - That exceeds f32's 24-bit exact range (16.7M), so slots are i32.
//   - i32 has 31 bits, leaves plenty of headroom (~2 bits / 4×) — same idea
//     as sos3wasm but with smaller limbs (more limbs, less per-slot work).
//
// Note this is essentially `sos3wasm` reparametrized for 19-bit limbs.
// The structure (i32 slot, vec4 conversion per mulhilo, single carry shift)
// is the only known Mont scheme that's both correct AND avoids inner-loop
// drain on Apple GPU.

const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};
const N0_SCALED: f32 = {{ n0_scaled }};
const N0_INT: u32    = {{ n0_int }}u;
const W: f32         = 524288.0;            // 2^19
const W_INV: f32     = 1.9073486328125e-6;  // 2^-19
const BIAS: f32      = 274877906944.0;      // 2^38
const MASK_19: u32   = 0x7FFFFu;

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
{{{ p_limbs_f32 }}}
    return p;
}

fn mulhilo_sos3_2_v2(a: vec2<f32>, a_scaled: vec2<f32>, b: vec2<f32>) -> vec4<f32> {
    let hi_off_inner = fma(a_scaled, b, vec2<f32>(W, W));
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(vec2<f32>(-W, -W), hi_off, vec2<f32>(BIAS, BIAS));
    let lo           = fma(a, b, neg_hi_w);
    return vec4<f32>(hi_off.x, lo.x, hi_off.y, lo.y);
}

fn mulhilo_sos3_2_i32(a: vec2<f32>, a_scaled: vec2<f32>, b: vec2<f32>) -> vec4<i32> {
    let hi_off_inner = fma(a_scaled, b, vec2<f32>(W, W));
    let hi_off       = floor(hi_off_inner);
    let neg_hi_w     = fma(vec2<f32>(-W, -W), hi_off, vec2<f32>(BIAS, BIAS));
    let lo           = fma(a, b, neg_hi_w);
    let hi           = hi_off - vec2<f32>(W, W);
    return vec4<i32>(vec4<f32>(hi.x, lo.x, hi.y, lo.y));
}

fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var p = get_p_f32();

    // ===== Slot init: 2N i32 named locals T0..T(2N-1). =====
{{#slots}}
    var T{{k}}: i32 = 0;
{{/slots}}

    // ===== Phase 1: T = x*y schoolbook, no drain. =====
{{#phase1_iters}}
    // outer iter i={{i}}
    {
        let x_i        = (*x).limbs[{{i}}u];
        let x_i_scaled = x_i * W_INV;
        let xv         = vec2<f32>(x_i, x_i);
        let xvs        = vec2<f32>(x_i_scaled, x_i_scaled);
{{#pairs}}
        {
            let mh = mulhilo_sos3_2_i32(xv, xvs, vec2<f32>((*y).limbs[{{j}}u], (*y).limbs[{{jp}}u]));
            T{{slot_mid}} = (T{{slot_mid}} + mh.x) + mh.w;
            T{{slot_hi}}  = T{{slot_hi}}  + mh.z;
            T{{slot_lo}}  = T{{slot_lo}}  + mh.y;
        }
{{/pairs}}
    }
{{/phase1_iters}}

    // ===== Phase 2: Mont reduce. qi from low 19 bits of T[i]; one carry =====
    // shift T[i+1] += T[i] >> 19 per iter. No inner-j drain.
{{#phase2_iters}}
    // outer iter i={{i}}
    {
        let t_mask: u32 = bitcast<u32>(T{{i}}) & MASK_19;
        let qi_int: u32 = (t_mask * N0_INT) & MASK_19;
        let qi          = f32(qi_int);
        let qi_scaled   = qi * W_INV;
        let qv          = vec2<f32>(qi, qi);
        let qvs         = vec2<f32>(qi_scaled, qi_scaled);
{{#pairs}}
        {
            let mh = mulhilo_sos3_2_i32(qv, qvs, vec2<f32>(p.limbs[{{j}}u], p.limbs[{{jp}}u]));
            T{{slot_mid}} = (T{{slot_mid}} + mh.x) + mh.w;
            T{{slot_hi}}  = T{{slot_hi}}  + mh.z;
            T{{slot_lo}}  = T{{slot_lo}}  + mh.y;
        }
{{/pairs}}
        T{{i_plus_1}} = T{{i_plus_1}} + (T{{i}} >> 19u);
    }
{{/phase2_iters}}

    // ===== Final drain: cols T[N..2N-1] -> s.limbs[0..N-1]. =====
    var s: BigIntF32;
    var carry: i32 = 0;
{{#drain_cols}}
    {
        let sum       = T{{k}} + carry;
        let new_carry = sum >> 19u;
        s.limbs[{{out_idx}}u] = f32(sum - (new_carry << 19u));
        carry = new_carry;
    }
{{/drain_cols}}

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
