// 22-bit-limb f32 Montgomery product, WASM-style: SOS structure with i32
// accumulators and deferred drain.
//
// === Architecture (mirrors the bb wasm `montgomery_mul` algorithm) ===
//
// Storage: 25 named i32 locals T0..T24 (= 2N + 1 slots).
//   - 22-bit limbs in 32-bit accumulators → 10 bits of headroom per slot.
//   - Each slot can absorb ~1000 contributions before overflow; our worst
//     case is ~48 contributions per slot. Comfortable margin.
//
// Phase 1 (schoolbook multiply T = x*y):
//   - 144 mulhilos (12×12). All independent.
//   - Per-pair: vec2-paired mulhilo + vec4 f32→i32 conversion + 3 i32 adds.
//   - ZERO drains. Pure accumulation.
//
// Phase 2 (Mont reduce):
//   - 12 iters. Each iter:
//     - qi = (T[i] & 0x3FFFFF) * N0_INT & 0x3FFFFF  (pure u32 ops, signed-safe
//       because masking gives low 22 bits regardless of sign)
//     - Accumulate qi*p[j] (vec2-paired) into T[i..i+12]. NO inter-j drain.
//     - SINGLE carry propagation step: T[i+1] += T[i] >> 22.
//
// Final drain (after all reduce iters):
//   - Serial across T[12..23]: residue → s.limbs[k-12], carry to T[k+1].
//
// === Note on the unrolling ===
//
// Outer i loops, inner-j pair loops, slot inits, and final drain are
// expanded via mustache `{{#…}}…{{/…}}` sections below. The render produces
// straight-line WGSL with named `T0..T24` locals (no array indexing) so
// Metal keeps the slot state in registers — dynamic indexing into a
// function-local array would force thread-private memory and lose ~3-4×.

const NUM_LIMBS: u32 = {{ num_limbs }}u;
const N0: f32        = {{ n0 }};
const N0_SCALED: f32 = {{ n0_scaled }};
const N0_INT: u32    = {{ n0_int }}u;
const MASK_22: u32   = 0x3FFFFFu;

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

// Same algorithm as mulhilo_sos3_2_v2 but returns vec4<i32> directly.
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

    // ===== Slot init: 25 i32 named locals (2N+1 = 25 for N=12). =====
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
        // pair j={{j}}, j+1={{jp}}  ->  T{{slot_mid}} += hi(j) + lo(j+1);
        //                                T{{slot_lo}}  += lo(j);
        //                                T{{slot_hi}}  += hi(j+1)
        {
            let mh = mulhilo_sos3_2_i32(xv, xvs, vec2<f32>((*y).limbs[{{j}}u], (*y).limbs[{{jp}}u]));
            T{{slot_mid}} = (T{{slot_mid}} + mh.x) + mh.w;
            T{{slot_hi}}  = T{{slot_hi}}  + mh.z;
            T{{slot_lo}}  = T{{slot_lo}}  + mh.y;
        }
{{/pairs}}
    }
{{/phase1_iters}}

    // ===== Phase 2: Mont reduce. qi from low 22 bits of T[i] (mask trick =====
    // is signed-safe since lo bits of bias 0x4B000000 are zero). Single
    // carry shift T[i+1] += T[i] >> 22 propagates the slot-i quotient.
{{#phase2_iters}}
    // outer iter i={{i}}
    {
        let t_mask: u32 = bitcast<u32>(T{{i}}) & MASK_22;
        let qi_int: u32 = (t_mask * N0_INT) & MASK_22;
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
        T{{i_plus_1}} = T{{i_plus_1}} + (T{{i}} >> 22u);
    }
{{/phase2_iters}}

    // ===== Final drain: cols T[N..2N-1] -> s.limbs[0..N-1]. =====
    var s: BigIntF32;
    var carry: i32 = 0;
{{#drain_cols}}
    {
        let sum       = T{{k}} + carry;
        let new_carry = sum >> 22u;
        s.limbs[{{out_idx}}u] = f32(sum - (new_carry << 22u));
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
