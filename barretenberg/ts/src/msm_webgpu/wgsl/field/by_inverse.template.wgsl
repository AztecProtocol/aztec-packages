// Bernstein-Yang safegcd inversion for the BN254 base field, WGSL port.
//
// This file will grow over sub-steps 1.3-1.5 of the WebGPU MSM rewrite plan
// to host the full `fr_inv_by` entrypoint. Currently it contains the inner
// `by_divsteps` primitive (sub-step 1.3) — a line-for-line transliteration
// of `Wasm9x29::divsteps` (bernstein_yang_inverse_wasm.hpp lines 147-178).
//
// REFERENCES
//   - TS port (ground truth):  src/msm_webgpu/cuzk/bernstein_yang.ts
//   - bigint helpers used here: src/msm_webgpu/wgsl/bigint/bigint_by.template.wgsl
//
// REPRESENTATIONS
//   - delta:        i32 counter (mirrors the i64 in C++; only the low value
//                   matters because BATCH=58 caps |delta| growth per call).
//   - f_lo, g_lo:   u64 carriers held as vec2<u32> (.x = low 32, .y = high 32).
//                   All u64 ops via u64_add / u64_sub / u64_shr1 helpers.
//   - u, v, q, r:   i64 matrix entries held as paired i32 (.x = low 32 unsigned
//                   bit pattern, .y = high 32 signed). After BATCH divsteps
//                   |entry| <= 2^58, fits in i64. All ops via i64_*_pair.
//
// LOOP BOUND DISCIPLINE
//   Three loops total in this file:
//     - by_divsteps inner loop:        `for ... i < BY_BATCH`     (= 58u const)
//     - by_apply_matrix_fg streaming:   `for ... i < BY_NUM_LIMBS` (= 9u const)
//     - by_apply_matrix_de streaming:   `for ... i < BY_NUM_LIMBS` (= 9u const)
//   Both bounds are compile-time WGSL `const`s defined in bigint_by, so the
//   plan's "bounded loops" rule is satisfied. The audit grep
//   `grep -nE 'for *\(' ... | grep -v -E '< [A-Z][A-Z_]*[a-z]?|< [0-9]+|...'`
//   returns no matches.

// 2x2 matrix produced by BATCH=58 divsteps. Each entry is a 64-bit signed
// integer stored as a paired (lo: i32, hi: i32) — value = u32(lo) | (i32(hi) << 32),
// interpreted as two's complement. The naming matches the C++ struct field
// names (m.u, m.v, m.q, m.r) suffixed with `_hi` for the high half.
struct Mat {
    u: i32,
    v: i32,
    q: i32,
    r: i32,
    u_hi: i32,
    v_hi: i32,
    q_hi: i32,
    r_hi: i32,
}

// by_divsteps: run BATCH = 58 branchy divsteps on the low 64 bits of (f, g);
// returns the transition matrix M and updates `*delta`.
//
// Mirrors Wasm9x29::divsteps line-for-line. The branches are variable-time
// over inputs, which is acceptable here because BN254 base-field inversion
// operates on public values in the MSM pipeline.
//
// Pre:  delta is the current divstep counter (signed i32 view).
//       f_lo, g_lo are the low 64 bits of f and g respectively (vec2<u32>).
// Post: returns the matrix M = ((u, v), (q, r)) such that
//         (f_new, g_new) = M * (f_old, g_old) / 2^BATCH
//       after BATCH=58 divsteps. *delta is updated.
//
// The TS reference uses `(g_lo - f_lo) & U64_MASK` then `>> 1` to mimic the
// C++ `(u64)(g_lo - f_lo) >> 1` semantics: u64 wrap, then unsigned shift.
// u64_sub + u64_shr1 here is exactly that.
fn by_divsteps(delta: ptr<function, i32>, f_lo_in: vec2<u32>, g_lo_in: vec2<u32>) -> Mat {
    var f_lo: vec2<u32> = f_lo_in;
    var g_lo: vec2<u32> = g_lo_in;
    // Matrix entries as paired i32 (i64). u = 1, v = 0, q = 0, r = 1.
    var u: vec2<i32> = vec2<i32>(1, 0);
    var v: vec2<i32> = vec2<i32>(0, 0);
    var q: vec2<i32> = vec2<i32>(0, 0);
    var r: vec2<i32> = vec2<i32>(1, 0);
    var d: i32 = *delta;
    for (var i: u32 = 0u; i < BY_BATCH; i = i + 1u) {
        if (u64_low_bit(g_lo) != 0u) {
            if (d > 0) {
                // (f, g) <- (g, (g - f) >> 1) using u64 wrap-sub then unsigned >> 1.
                let nf: vec2<u32> = g_lo;
                let diff: vec2<u32> = u64_sub(g_lo, f_lo);
                let ng: vec2<u32> = u64_shr1(diff);
                // (u, v, q, r) <- (q << 1, r << 1, q - u, r - v).
                let nu: vec2<i32> = i64_shl1_pair(q);
                let nv: vec2<i32> = i64_shl1_pair(r);
                let nq: vec2<i32> = i64_sub_pair(q, u);
                let nr: vec2<i32> = i64_sub_pair(r, v);
                f_lo = nf;
                g_lo = ng;
                u = nu;
                v = nv;
                q = nq;
                r = nr;
                d = 1 - d;
            } else {
                // g <- (g + f) >> 1; q += u; r += v; u <<= 1; v <<= 1; d += 1.
                let sum: vec2<u32> = u64_add(g_lo, f_lo);
                g_lo = u64_shr1(sum);
                q = i64_add_pair(q, u);
                r = i64_add_pair(r, v);
                u = i64_shl1_pair(u);
                v = i64_shl1_pair(v);
                d = d + 1;
            }
        } else {
            // g <- g >> 1; u <<= 1; v <<= 1; d += 1.
            g_lo = u64_shr1(g_lo);
            u = i64_shl1_pair(u);
            v = i64_shl1_pair(v);
            d = d + 1;
        }
    }
    *delta = d;
    return Mat(u.x, v.x, q.x, r.x, u.y, v.y, q.y, r.y);
}

// ============================================================
// apply_matrix helpers
//
// `signed_mul_split` accepts |a| <= 2^29 (one BY limb) and |b| <= 2^31 - 1
// and returns (lo29, hi) with a*b = lo29 + hi * 2^29. The streaming
// schoolbook below feeds it (m_*, x_limb) pairs whose products lie in
// [-2^58, 2^58], well inside the helper's contract.
//
// Each per-limb position i computes
//   acc <- m_lo * x_i  + m_hi * x_{i-1}  + carry_in  (+ k * p_i terms in de pass)
// then carry_out = acc >> 29 (arithmetic), with the masked low-29 bits
// landing at output position i - 2 (= exact >> BATCH = >> 58 = >> (2 * 29)).
//
// The signed_mul_split returns lo29 in [0, 2^29) and a signed hi. Adding
// four cross-products together can push the high half beyond i32 range
// only when |sum| exceeds ~2^31 — at the per-limb level this is bounded
// by the four-product sum of |2^58| / 2^29 + carry, well inside i32.

// Convert a (lo29, hi) signed-product split to a full i64 (vec2<i32>).
//
// The signed_mul_split helper returns (lo29, hi) where
//   value = lo29 + hi * 2^29     with lo29 in [0, 2^29)
// To add this into an i64 accumulator we need to re-express it as a
// (lo32, hi32) pair where
//   value = u32(lo32) + i32(hi32) * 2^32     (two's complement)
//
// Bit layout:
//   bits 0..28  of value = lo29 (from the lo29 half)
//   bits 29..31 of value = bits 0..2 of `hi`
//   bits 32..63 of value = bits 3..34 of `hi` (sign-extended)
//
// `hi << 29u` on a u32 keeps only the low 3 bits of `hi` after shifting,
// which yields exactly the contribution to bits 29..31. The high half is
// `hi >> 3u` with signed arithmetic shift, which sign-extends to fill bit
// 63 correctly when `hi` is negative.
fn by_split_to_i64(split: vec2<i32>) -> vec2<i32> {
    let lo32: u32 = u32(split.x) | (u32(split.y) << 29u);
    let hi32: i32 = split.y >> 3u;
    return vec2<i32>(i32(lo32), hi32);
}

// Add `m_lo * x_limb` (a signed 58-bit product) into an i64 accumulator.
// Helper used pervasively in the streaming schoolbook below.
fn by_add_mul(acc: vec2<i32>, m_lo: i32, x_limb: i32) -> vec2<i32> {
    let split = signed_mul_split(m_lo, x_limb);
    let prod_i64 = by_split_to_i64(split);
    return i64_add_pair(acc, prod_i64);
}

// Arithmetic right shift of an i64 (vec2<i32>) by 29.
//   result.lo = (u32(acc.x) >> 29) | (u32(acc.y) << 3)
//   result.hi = acc.y >> 29 (signed arithmetic shift)
fn i64_ars29(acc: vec2<i32>) -> vec2<i32> {
    let lo_u: u32 = (u32(acc.x) >> 29u) | (u32(acc.y) << 3u);
    let hi: i32 = acc.y >> 29u;
    return vec2<i32>(i32(lo_u), hi);
}

// Low 29 bits of an i64. Returns i32 in [0, 2^29).
fn i64_low29(acc: vec2<i32>) -> i32 {
    return i32(u32(acc.x) & BY_LIMB_MASK);
}

// u64_mul_low64: low 64 bits of an unsigned u64 * u64 product.
//
// Implements via four 16x16 partials per operand half (16 partials total
// to compute the full 128-bit product), summing only the bits that
// land in the low 64. Used to evaluate `k = ((-t) * p_inv) mod 2^58`
// inside by_apply_matrix_de — the C++ does `(u64)(-(i64)t) * p_inv` and
// keeps the low 58 bits; we keep the low 64 and let the caller mask.
//
// Pre:  any a, b u64 (as vec2<u32>).
// Post: low 64 bits of a*b, two's complement-equivalent under masking.
fn u64_mul_low64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
    // Split each u32 half into 16-bit pieces:
    //   a.x = a0 + a1 * 2^16,   a.y = a2 + a3 * 2^16
    //   b.x = b0 + b1 * 2^16,   b.y = b2 + b3 * 2^16
    let MASK16: u32 = 0xFFFFu;
    let a0: u32 = a.x & MASK16;
    let a1: u32 = a.x >> 16u;
    let a2: u32 = a.y & MASK16;
    let a3: u32 = a.y >> 16u;
    let b0: u32 = b.x & MASK16;
    let b1: u32 = b.x >> 16u;
    let b2: u32 = b.y & MASK16;
    let b3: u32 = b.y >> 16u;

    // Partials landing in bits 0..15 (only one: a0*b0).
    let p00: u32 = a0 * b0;
    // Partials in bits 16..47 (a0*b1, a1*b0; we'll split further).
    let p01: u32 = a0 * b1;
    let p10: u32 = a1 * b0;
    // Partials in bits 32..63.
    let p02: u32 = a0 * b2;
    let p20: u32 = a2 * b0;
    let p11: u32 = a1 * b1;
    // Partials in bits 48..79 (we only keep the part falling in [0, 64)).
    let p03: u32 = a0 * b3;
    let p30: u32 = a3 * b0;
    let p12: u32 = a1 * b2;
    let p21: u32 = a2 * b1;
    // Partials in bits 64..95 (a1*b3, a3*b1, a2*b2) — discarded except for
    // the part that wraps into the low 64 via the cross sums below. With
    // bit-offset >= 64 the contribution is zero in the low 64.

    // Build the low 64 bits:
    //   bits 0..15:  p00 low 16
    //   bits 16..47: p00 high 16 + (p01 + p10) low 32
    //   bits 32..63: carries from above + (p02 + p20 + p11) low 32 +
    //                ((p01 + p10) >> 16) plus higher partials' low pieces
    //   bits 48..63: (p03 + p30 + p12 + p21) low 16

    // Sum bits 0..31 (the low u32 of the result).
    let lo16 = p00 & MASK16;
    let mid_a = (p00 >> 16u) + (p01 & MASK16) + (p10 & MASK16);
    let lo_u32 = lo16 | (mid_a << 16u);
    // Carry into bits 32+ from `mid_a` (the high part beyond 16 bits).
    let mid_a_hi = mid_a >> 16u;

    // Sum bits 32..63.
    // Contributions landing entirely in [32, 64):
    //   (p01 + p10) >> 16  (these are 32-bit values; the >> 16 lands them at bit 32)
    //   p02, p20, p11      (start at bit 32; whole 32 bits land in [32, 64))
    // Contributions landing partially in [32, 64) starting at bit 48:
    //   p03 << 16, p30 << 16, p12 << 16, p21 << 16
    let mid_b = (p01 >> 16u) + (p10 >> 16u) + p02 + p20 + p11;
    let mid_c = (p03 + p30 + p12 + p21) << 16u;
    let hi_u32 = mid_a_hi + mid_b + mid_c;

    return vec2<u32>(lo_u32, hi_u32);
}

// by_apply_matrix_fg
//
// Mirrors `Wasm9x29::apply_matrix` lines 196-217 — the (f, g) streaming
// pass. After BATCH=58 divsteps we apply the 2x2 transition matrix M to
// (f, g) and divide by 2^58. The streamed schoolbook produces one (nf, ng)
// pair per source limb position i and writes the masked low-29 bits at
// output position i - 2 (= the exact >> 58 = >> (2 * 29) drop).
//
// PERF: inlined hot path. Replaces the four `by_add_mul` calls per
// accumulator with a single fused 15+14-bit partial-product schoolbook
// that sums all four products' lane-i pieces into a single i32 before
// any carry propagation. This eliminates the per-call (lo29,hi)→(lo32,hi32)
// conversion overhead and reduces 4 i64 adds to one composite extract.
//
// LANE PARTIAL-PRODUCT BOUND:
//   Each per-limb cross product (a_l, a_h) * (b_l, b_h) yields four 28-bit
//   signed pieces: pll, plh, phl, phh (each |.| < 2^28).
//   For 4 products into one accumulator: per-lane sum |.| < 4 * 2^28 = 2^30
//   (fits i32 comfortably). The combined "mid" lane (plh+phl summed across
//   4 products) is |.| < 2 * 4 * 2^28 = 2^31 — still fits i32 (signed).
//
// LOOP BOUND: `for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u)` — const.
fn by_apply_matrix_fg(m: Mat, f: ptr<function, BigIntBY>, g: ptr<function, BigIntBY>) {
    // Decompose each of the four matrix entries into low/high 29-bit halves,
    // and then split each half into (15-bit signed low, 14-bit high) chunks
    // for the partial-product schoolbook below. Hoisted out of the inner
    // loop (loop-invariant).
    let u_lo: i32 = m.u & i32(BY_LIMB_MASK);
    let v_lo: i32 = m.v & i32(BY_LIMB_MASK);
    let q_lo: i32 = m.q & i32(BY_LIMB_MASK);
    let r_lo: i32 = m.r & i32(BY_LIMB_MASK);
    let u_hi: i32 = i32((u32(m.u) >> 29u) | (u32(m.u_hi) << 3u));
    let v_hi: i32 = i32((u32(m.v) >> 29u) | (u32(m.v_hi) << 3u));
    let q_hi: i32 = i32((u32(m.q) >> 29u) | (u32(m.q_hi) << 3u));
    let r_hi: i32 = i32((u32(m.r) >> 29u) | (u32(m.r_hi) << 3u));

    let u_lo_l: i32 = (u_lo << 17u) >> 17u;
    let u_lo_h: i32 = (u_lo - u_lo_l) >> 15u;
    let v_lo_l: i32 = (v_lo << 17u) >> 17u;
    let v_lo_h: i32 = (v_lo - v_lo_l) >> 15u;
    let q_lo_l: i32 = (q_lo << 17u) >> 17u;
    let q_lo_h: i32 = (q_lo - q_lo_l) >> 15u;
    let r_lo_l: i32 = (r_lo << 17u) >> 17u;
    let r_lo_h: i32 = (r_lo - r_lo_l) >> 15u;
    let u_hi_l: i32 = (u_hi << 17u) >> 17u;
    let u_hi_h: i32 = (u_hi - u_hi_l) >> 15u;
    let v_hi_l: i32 = (v_hi << 17u) >> 17u;
    let v_hi_h: i32 = (v_hi - v_hi_l) >> 15u;
    let q_hi_l: i32 = (q_hi << 17u) >> 17u;
    let q_hi_h: i32 = (q_hi - q_hi_l) >> 15u;
    let r_hi_l: i32 = (r_hi << 17u) >> 17u;
    let r_hi_h: i32 = (r_hi - r_hi_l) >> 15u;

    // Streaming accumulator as i64 (lo, hi).
    var cf_lo: u32 = 0u;
    var cf_hi: i32 = 0;
    var cg_lo: u32 = 0u;
    var cg_hi: i32 = 0;

    // Previous limb 15/14-bit pre-splits (for u_hi * fp etc.). Start at 0;
    // slide forward each iter to avoid re-splitting next time.
    var fp_l: i32 = 0;
    var fp_h: i32 = 0;
    var gp_l: i32 = 0;
    var gp_h: i32 = 0;

    // Single loop with conditional output: the per-iter `if (i >= 2)` check
    // costs less than the duplicated loop body of a prologue/main split. The
    // compiler can predicate the store on most GPUs.
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        let fi: i32 = (*f).l[i];
        let gi: i32 = (*g).l[i];
        let fi_l: i32 = (fi << 17u) >> 17u;
        let fi_h: i32 = (fi - fi_l) >> 15u;
        let gi_l: i32 = (gi << 17u) >> 17u;
        let gi_h: i32 = (gi - gi_l) >> 15u;

        let nf_pll: i32 = u_lo_l * fi_l + v_lo_l * gi_l + u_hi_l * fp_l + v_hi_l * gp_l;
        let nf_mid: i32 =
            u_lo_l * fi_h + u_lo_h * fi_l
            + v_lo_l * gi_h + v_lo_h * gi_l
            + u_hi_l * fp_h + u_hi_h * fp_l
            + v_hi_l * gp_h + v_hi_h * gp_l;
        let nf_phh: i32 = u_lo_h * fi_h + v_lo_h * gi_h + u_hi_h * fp_h + v_hi_h * gp_h;
        let ng_pll: i32 = q_lo_l * fi_l + r_lo_l * gi_l + q_hi_l * fp_l + r_hi_l * gp_l;
        let ng_mid: i32 =
            q_lo_l * fi_h + q_lo_h * fi_l
            + r_lo_l * gi_h + r_lo_h * gi_l
            + q_hi_l * fp_h + q_hi_h * fp_l
            + r_hi_l * gp_h + r_hi_h * gp_l;
        let ng_phh: i32 = q_lo_h * fi_h + r_lo_h * gi_h + q_hi_h * fp_h + r_hi_h * gp_h;

        let nf_pll_u: u32 = u32(nf_pll);
        let nf_mid_u: u32 = u32(nf_mid);
        let nf_phh_u: u32 = u32(nf_phh);
        let nf_pll_hi: i32 = nf_pll >> 31u;
        let nf_mid_hi: i32 = nf_mid >> 17u;
        let nf_phh_hi: i32 = nf_phh >> 2u;
        let nf_s1_lo: u32 = nf_pll_u + (nf_mid_u << 15u);
        let nf_s1_c: i32 = select(0i, 1i, nf_s1_lo < nf_pll_u);
        let nf_s2_lo: u32 = nf_s1_lo + (nf_phh_u << 30u);
        let nf_s2_c: i32 = select(0i, 1i, nf_s2_lo < nf_s1_lo);
        let nf_total_lo: u32 = nf_s2_lo + cf_lo;
        let nf_total_c: i32 = select(0i, 1i, nf_total_lo < nf_s2_lo);
        let nf_total_hi: i32 = nf_pll_hi + nf_mid_hi + nf_phh_hi + nf_s1_c + nf_s2_c + nf_total_c + cf_hi;

        let ng_pll_u: u32 = u32(ng_pll);
        let ng_mid_u: u32 = u32(ng_mid);
        let ng_phh_u: u32 = u32(ng_phh);
        let ng_pll_hi: i32 = ng_pll >> 31u;
        let ng_mid_hi: i32 = ng_mid >> 17u;
        let ng_phh_hi: i32 = ng_phh >> 2u;
        let ng_s1_lo: u32 = ng_pll_u + (ng_mid_u << 15u);
        let ng_s1_c: i32 = select(0i, 1i, ng_s1_lo < ng_pll_u);
        let ng_s2_lo: u32 = ng_s1_lo + (ng_phh_u << 30u);
        let ng_s2_c: i32 = select(0i, 1i, ng_s2_lo < ng_s1_lo);
        let ng_total_lo: u32 = ng_s2_lo + cg_lo;
        let ng_total_c: i32 = select(0i, 1i, ng_total_lo < ng_s2_lo);
        let ng_total_hi: i32 = ng_pll_hi + ng_mid_hi + ng_phh_hi + ng_s1_c + ng_s2_c + ng_total_c + cg_hi;

        if (i >= 2u) {
            (*f).l[i - 2u] = i32(nf_total_lo & 0x1FFFFFFFu);
            (*g).l[i - 2u] = i32(ng_total_lo & 0x1FFFFFFFu);
        }
        cf_lo = (nf_total_lo >> 29u) | (u32(nf_total_hi) << 3u);
        cf_hi = nf_total_hi >> 29u;
        cg_lo = (ng_total_lo >> 29u) | (u32(ng_total_hi) << 3u);
        cg_hi = ng_total_hi >> 29u;

        fp_l = fi_l; fp_h = fi_h; gp_l = gi_l; gp_h = gi_h;
    }
    // Top finalisation: nf9 = u_hi * fp + v_hi * fp_prev + cf  (only 2 products
    // now, since we've consumed all the input limbs and fi=0). Same shape as
    // the inner loop body but with the *_lo terms dropped.
    let nf9_pll: i32 = u_hi_l * fp_l + v_hi_l * gp_l;
    let nf9_mid: i32 = u_hi_l * fp_h + u_hi_h * fp_l + v_hi_l * gp_h + v_hi_h * gp_l;
    let nf9_phh: i32 = u_hi_h * fp_h + v_hi_h * gp_h;
    let ng9_pll: i32 = q_hi_l * fp_l + r_hi_l * gp_l;
    let ng9_mid: i32 = q_hi_l * fp_h + q_hi_h * fp_l + r_hi_l * gp_h + r_hi_h * gp_l;
    let ng9_phh: i32 = q_hi_h * fp_h + r_hi_h * gp_h;

    let nf9_pll_u: u32 = u32(nf9_pll);
    let nf9_mid_u: u32 = u32(nf9_mid);
    let nf9_phh_u: u32 = u32(nf9_phh);
    let nf9_pll_hi: i32 = nf9_pll >> 31u;
    let nf9_mid_hi: i32 = nf9_mid >> 17u;
    let nf9_phh_hi: i32 = nf9_phh >> 2u;
    let nf9_s1_lo: u32 = nf9_pll_u + (nf9_mid_u << 15u);
    let nf9_s1_c: i32 = select(0i, 1i, nf9_s1_lo < nf9_pll_u);
    let nf9_s2_lo: u32 = nf9_s1_lo + (nf9_phh_u << 30u);
    let nf9_s2_c: i32 = select(0i, 1i, nf9_s2_lo < nf9_s1_lo);
    let nf9_total_lo: u32 = nf9_s2_lo + cf_lo;
    let nf9_total_c: i32 = select(0i, 1i, nf9_total_lo < nf9_s2_lo);
    let nf9_total_hi: i32 = nf9_pll_hi + nf9_mid_hi + nf9_phh_hi + nf9_s1_c + nf9_s2_c + nf9_total_c + cf_hi;

    let ng9_pll_u: u32 = u32(ng9_pll);
    let ng9_mid_u: u32 = u32(ng9_mid);
    let ng9_phh_u: u32 = u32(ng9_phh);
    let ng9_pll_hi: i32 = ng9_pll >> 31u;
    let ng9_mid_hi: i32 = ng9_mid >> 17u;
    let ng9_phh_hi: i32 = ng9_phh >> 2u;
    let ng9_s1_lo: u32 = ng9_pll_u + (ng9_mid_u << 15u);
    let ng9_s1_c: i32 = select(0i, 1i, ng9_s1_lo < ng9_pll_u);
    let ng9_s2_lo: u32 = ng9_s1_lo + (ng9_phh_u << 30u);
    let ng9_s2_c: i32 = select(0i, 1i, ng9_s2_lo < ng9_s1_lo);
    let ng9_total_lo: u32 = ng9_s2_lo + cg_lo;
    let ng9_total_c: i32 = select(0i, 1i, ng9_total_lo < ng9_s2_lo);
    let ng9_total_hi: i32 = ng9_pll_hi + ng9_mid_hi + ng9_phh_hi + ng9_s1_c + ng9_s2_c + ng9_total_c + cg_hi;

    (*f).l[BY_NUM_LIMBS - 2u] = i32(nf9_total_lo & 0x1FFFFFFFu);
    (*g).l[BY_NUM_LIMBS - 2u] = i32(ng9_total_lo & 0x1FFFFFFFu);
    // Top limb: the value above bit 29 of (nf9_total_lo, nf9_total_hi).
    (*f).l[BY_NUM_LIMBS - 1u] = i32((nf9_total_lo >> 29u) | (u32(nf9_total_hi) << 3u));
    (*g).l[BY_NUM_LIMBS - 1u] = i32((ng9_total_lo >> 29u) | (u32(ng9_total_hi) << 3u));
    // by_normalise is a no-op: all lower limbs already masked to [0, 2^29).
}

// by_apply_matrix_de
//
// Mirrors `Wasm9x29::apply_matrix` lines 222-254 — the (d, e) pass with
// the 2-adic k·p correction. The first two output limbs are zero by
// construction (k chosen to clear the low 58 bits of (M · (d, e)) mod 2^58),
// so the streaming pass folds k·p in from position 2 onward.
//
// `p_inv_lo`, `p_inv_hi`: the 58-bit constant p^(-1) mod 2^58 split as the
// low 32 bits and the high 32 bits respectively. The WASM C++ stores it as
// a single u64 `p_inv`; the WGSL caller pre-splits it because WGSL has no
// native u64. Naming reflects the split: `p_inv = p_inv_lo + (p_inv_hi << 32)`.
//
// Loop bound is `BY_NUM_LIMBS` — const, satisfying the plan rule.
fn by_apply_matrix_de(
    m: Mat,
    d: ptr<function, BigIntBY>,
    e: ptr<function, BigIntBY>,
    p: ptr<function, BigIntBY>,
    p_inv_lo: u32,
    p_inv_hi: u32,
) {
    // Same matrix split as the f/g pass, with 15+14-bit pre-splits hoisted
    // out of the inner loop (loop-invariant).
    let u_lo: i32 = m.u & i32(BY_LIMB_MASK);
    let v_lo: i32 = m.v & i32(BY_LIMB_MASK);
    let q_lo: i32 = m.q & i32(BY_LIMB_MASK);
    let r_lo: i32 = m.r & i32(BY_LIMB_MASK);
    let u_hi: i32 = i32((u32(m.u) >> 29u) | (u32(m.u_hi) << 3u));
    let v_hi: i32 = i32((u32(m.v) >> 29u) | (u32(m.v_hi) << 3u));
    let q_hi: i32 = i32((u32(m.q) >> 29u) | (u32(m.q_hi) << 3u));
    let r_hi: i32 = i32((u32(m.r) >> 29u) | (u32(m.r_hi) << 3u));

    let u_lo_l: i32 = (u_lo << 17u) >> 17u;
    let u_lo_h: i32 = (u_lo - u_lo_l) >> 15u;
    let v_lo_l: i32 = (v_lo << 17u) >> 17u;
    let v_lo_h: i32 = (v_lo - v_lo_l) >> 15u;
    let q_lo_l: i32 = (q_lo << 17u) >> 17u;
    let q_lo_h: i32 = (q_lo - q_lo_l) >> 15u;
    let r_lo_l: i32 = (r_lo << 17u) >> 17u;
    let r_lo_h: i32 = (r_lo - r_lo_l) >> 15u;
    let u_hi_l: i32 = (u_hi << 17u) >> 17u;
    let u_hi_h: i32 = (u_hi - u_hi_l) >> 15u;
    let v_hi_l: i32 = (v_hi << 17u) >> 17u;
    let v_hi_h: i32 = (v_hi - v_hi_l) >> 15u;
    let q_hi_l: i32 = (q_hi << 17u) >> 17u;
    let q_hi_h: i32 = (q_hi - q_hi_l) >> 15u;
    let r_hi_l: i32 = (r_hi << 17u) >> 17u;
    let r_hi_h: i32 = (r_hi - r_hi_l) >> 15u;

    let d0: i32 = (*d).l[0];
    let e0: i32 = (*e).l[0];
    let d1: i32 = (*d).l[1];
    let e1: i32 = (*e).l[1];

    let d0_l: i32 = (d0 << 17u) >> 17u;
    let d0_h: i32 = (d0 - d0_l) >> 15u;
    let e0_l: i32 = (e0 << 17u) >> 17u;
    let e0_h: i32 = (e0 - e0_l) >> 15u;
    let d1_l: i32 = (d1 << 17u) >> 17u;
    let d1_h: i32 = (d1 - d1_l) >> 15u;
    let e1_l: i32 = (e1 << 17u) >> 17u;
    let e1_h: i32 = (e1 - e1_l) >> 15u;

    // nd0 = u_lo * d0 + v_lo * e0  (2 products) — inline the 15+14 schoolbook.
    let nd0_pll: i32 = u_lo_l * d0_l + v_lo_l * e0_l;
    let nd0_mid: i32 =
        u_lo_l * d0_h + u_lo_h * d0_l
        + v_lo_l * e0_h + v_lo_h * e0_l;
    let nd0_phh: i32 = u_lo_h * d0_h + v_lo_h * e0_h;
    let ne0_pll: i32 = q_lo_l * d0_l + r_lo_l * e0_l;
    let ne0_mid: i32 =
        q_lo_l * d0_h + q_lo_h * d0_l
        + r_lo_l * e0_h + r_lo_h * e0_l;
    let ne0_phh: i32 = q_lo_h * d0_h + r_lo_h * e0_h;

    // nd1 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0  (4 products).
    let nd1_pll: i32 = u_lo_l * d1_l + v_lo_l * e1_l + u_hi_l * d0_l + v_hi_l * e0_l;
    let nd1_mid: i32 =
        u_lo_l * d1_h + u_lo_h * d1_l
        + v_lo_l * e1_h + v_lo_h * e1_l
        + u_hi_l * d0_h + u_hi_h * d0_l
        + v_hi_l * e0_h + v_hi_h * e0_l;
    let nd1_phh: i32 = u_lo_h * d1_h + v_lo_h * e1_h + u_hi_h * d0_h + v_hi_h * e0_h;
    let ne1_pll: i32 = q_lo_l * d1_l + r_lo_l * e1_l + q_hi_l * d0_l + r_hi_l * e0_l;
    let ne1_mid: i32 =
        q_lo_l * d1_h + q_lo_h * d1_l
        + r_lo_l * e1_h + r_lo_h * e1_l
        + q_hi_l * d0_h + q_hi_h * d0_l
        + r_hi_l * e0_h + r_hi_h * e0_l;
    let ne1_phh: i32 = q_lo_h * d1_h + r_lo_h * e1_h + q_hi_h * d0_h + r_hi_h * e0_h;

    // Helper-equivalent extraction: convert (pll, mid, phh) → i64 (lo, hi).
    // Inlined to avoid function-call overhead.
    let nd0_pll_u: u32 = u32(nd0_pll);
    let nd0_mid_u: u32 = u32(nd0_mid);
    let nd0_phh_u: u32 = u32(nd0_phh);
    let nd0_pll_hi: i32 = nd0_pll >> 31u;
    let nd0_mid_hi: i32 = nd0_mid >> 17u;
    let nd0_phh_hi: i32 = nd0_phh >> 2u;
    let nd0_s1: u32 = nd0_pll_u + (nd0_mid_u << 15u);
    let nd0_s1c: i32 = select(0i, 1i, nd0_s1 < nd0_pll_u);
    let nd0_lo: u32 = nd0_s1 + (nd0_phh_u << 30u);
    let nd0_s2c: i32 = select(0i, 1i, nd0_lo < nd0_s1);
    let nd0_hi: i32 = nd0_pll_hi + nd0_mid_hi + nd0_phh_hi + nd0_s1c + nd0_s2c;

    let ne0_pll_u: u32 = u32(ne0_pll);
    let ne0_mid_u: u32 = u32(ne0_mid);
    let ne0_phh_u: u32 = u32(ne0_phh);
    let ne0_pll_hi: i32 = ne0_pll >> 31u;
    let ne0_mid_hi: i32 = ne0_mid >> 17u;
    let ne0_phh_hi: i32 = ne0_phh >> 2u;
    let ne0_s1: u32 = ne0_pll_u + (ne0_mid_u << 15u);
    let ne0_s1c: i32 = select(0i, 1i, ne0_s1 < ne0_pll_u);
    let ne0_lo: u32 = ne0_s1 + (ne0_phh_u << 30u);
    let ne0_s2c: i32 = select(0i, 1i, ne0_lo < ne0_s1);
    let ne0_hi: i32 = ne0_pll_hi + ne0_mid_hi + ne0_phh_hi + ne0_s1c + ne0_s2c;

    let nd1_pll_u: u32 = u32(nd1_pll);
    let nd1_mid_u: u32 = u32(nd1_mid);
    let nd1_phh_u: u32 = u32(nd1_phh);
    let nd1_pll_hi: i32 = nd1_pll >> 31u;
    let nd1_mid_hi: i32 = nd1_mid >> 17u;
    let nd1_phh_hi: i32 = nd1_phh >> 2u;
    let nd1_s1: u32 = nd1_pll_u + (nd1_mid_u << 15u);
    let nd1_s1c: i32 = select(0i, 1i, nd1_s1 < nd1_pll_u);
    let nd1_lo: u32 = nd1_s1 + (nd1_phh_u << 30u);
    let nd1_s2c: i32 = select(0i, 1i, nd1_lo < nd1_s1);
    let nd1_hi: i32 = nd1_pll_hi + nd1_mid_hi + nd1_phh_hi + nd1_s1c + nd1_s2c;

    let ne1_pll_u: u32 = u32(ne1_pll);
    let ne1_mid_u: u32 = u32(ne1_mid);
    let ne1_phh_u: u32 = u32(ne1_phh);
    let ne1_pll_hi: i32 = ne1_pll >> 31u;
    let ne1_mid_hi: i32 = ne1_mid >> 17u;
    let ne1_phh_hi: i32 = ne1_phh >> 2u;
    let ne1_s1: u32 = ne1_pll_u + (ne1_mid_u << 15u);
    let ne1_s1c: i32 = select(0i, 1i, ne1_s1 < ne1_pll_u);
    let ne1_lo: u32 = ne1_s1 + (ne1_phh_u << 30u);
    let ne1_s2c: i32 = select(0i, 1i, ne1_lo < ne1_s1);
    let ne1_hi: i32 = ne1_pll_hi + ne1_mid_hi + ne1_phh_hi + ne1_s1c + ne1_s2c;

    // Reconstruct low 58 bits of nd and ne for k computation.
    // td = (nd0_low29 + (nd1_plus_low29 << 29))  where nd1_plus = nd1 + (nd0 >> 29).
    let nd0_low29: u32 = nd0_lo & BY_LIMB_MASK;
    let ne0_low29: u32 = ne0_lo & BY_LIMB_MASK;
    // nd0 >> 29 arithmetic shift, as i64 (lo, hi):
    let nd0_ars_lo: u32 = (nd0_lo >> 29u) | (u32(nd0_hi) << 3u);
    let nd0_ars_hi: i32 = nd0_hi >> 29u;
    let ne0_ars_lo: u32 = (ne0_lo >> 29u) | (u32(ne0_hi) << 3u);
    let ne0_ars_hi: i32 = ne0_hi >> 29u;
    let nd1p_lo: u32 = nd1_lo + nd0_ars_lo;
    let nd1p_c: i32 = select(0i, 1i, nd1p_lo < nd1_lo);
    let nd1p_hi: i32 = nd1_hi + nd0_ars_hi + nd1p_c;
    let ne1p_lo: u32 = ne1_lo + ne0_ars_lo;
    let ne1p_c: i32 = select(0i, 1i, ne1p_lo < ne1_lo);
    let ne1p_hi: i32 = ne1_hi + ne0_ars_hi + ne1p_c;
    let nd1_low29: u32 = nd1p_lo & BY_LIMB_MASK;
    let ne1_low29: u32 = ne1p_lo & BY_LIMB_MASK;

    let td: vec2<u32> = vec2<u32>(nd0_low29 | (nd1_low29 << 29u), nd1_low29 >> 3u);
    let te: vec2<u32> = vec2<u32>(ne0_low29 | (ne1_low29 << 29u), ne1_low29 >> 3u);

    // k_d = ((-t_d) * p_inv) & MASK_BATCH.
    let neg_td: vec2<u32> = u64_neg(td);
    let neg_te: vec2<u32> = u64_neg(te);
    let p_inv: vec2<u32> = vec2<u32>(p_inv_lo, p_inv_hi);
    let kd_prod: vec2<u32> = u64_mul_low64(neg_td, p_inv);
    let ke_prod: vec2<u32> = u64_mul_low64(neg_te, p_inv);

    let MASK_BATCH_HI: u32 = (1u << 26u) - 1u;
    let kd_lo32: u32 = kd_prod.x;
    let kd_hi26: u32 = kd_prod.y & MASK_BATCH_HI;
    let ke_lo32: u32 = ke_prod.x;
    let ke_hi26: u32 = ke_prod.y & MASK_BATCH_HI;

    let kd_lo: i32 = i32(kd_lo32 & BY_LIMB_MASK);
    let kd_hi: i32 = i32((kd_lo32 >> 29u) | (kd_hi26 << 3u));
    let ke_lo: i32 = i32(ke_lo32 & BY_LIMB_MASK);
    let ke_hi: i32 = i32((ke_lo32 >> 29u) | (ke_hi26 << 3u));

    // Split k_*_lo, k_*_hi into 15+14 chunks for the inner loop.
    let kd_lo_l: i32 = (kd_lo << 17u) >> 17u;
    let kd_lo_h: i32 = (kd_lo - kd_lo_l) >> 15u;
    let kd_hi_l: i32 = (kd_hi << 17u) >> 17u;
    let kd_hi_h: i32 = (kd_hi - kd_hi_l) >> 15u;
    let ke_lo_l: i32 = (ke_lo << 17u) >> 17u;
    let ke_lo_h: i32 = (ke_lo - ke_lo_l) >> 15u;
    let ke_hi_l: i32 = (ke_hi << 17u) >> 17u;
    let ke_hi_h: i32 = (ke_hi - ke_hi_l) >> 15u;

    // Initial seed: nd0_plus = nd0 + kd_lo*p[0], cd_acc = nd1 + kd_lo*p[1] + kd_hi*p[0] + (nd0_plus >> 29).
    // p[0] and p[1] are small (the BN254 modulus); we still split for correctness.
    let p0: i32 = (*p).l[0];
    let p1: i32 = (*p).l[1];
    let p0_l: i32 = (p0 << 17u) >> 17u;
    let p0_h: i32 = (p0 - p0_l) >> 15u;
    let p1_l: i32 = (p1 << 17u) >> 17u;
    let p1_h: i32 = (p1 - p1_l) >> 15u;

    // nd0_plus = nd0 + kd_lo*p[0]
    let np0_pll: i32 = kd_lo_l * p0_l;
    let np0_mid: i32 = kd_lo_l * p0_h + kd_lo_h * p0_l;
    let np0_phh: i32 = kd_lo_h * p0_h;
    let np0_pll_u: u32 = u32(np0_pll);
    let np0_mid_u: u32 = u32(np0_mid);
    let np0_phh_u: u32 = u32(np0_phh);
    let np0_pll_hi: i32 = np0_pll >> 31u;
    let np0_mid_hi: i32 = np0_mid >> 17u;
    let np0_phh_hi: i32 = np0_phh >> 2u;
    let np0_s1: u32 = np0_pll_u + (np0_mid_u << 15u);
    let np0_s1c: i32 = select(0i, 1i, np0_s1 < np0_pll_u);
    let np0_lo: u32 = np0_s1 + (np0_phh_u << 30u);
    let np0_s2c: i32 = select(0i, 1i, np0_lo < np0_s1);
    let np0_hi: i32 = np0_pll_hi + np0_mid_hi + np0_phh_hi + np0_s1c + np0_s2c;
    // nd0_plus = nd0 + np0
    let nd0p_lo: u32 = nd0_lo + np0_lo;
    let nd0p_c: i32 = select(0i, 1i, nd0p_lo < nd0_lo);
    let nd0p_hi: i32 = nd0_hi + np0_hi + nd0p_c;
    // (nd0_plus >> 29) signed arithmetic
    let nd0p_ars_lo: u32 = (nd0p_lo >> 29u) | (u32(nd0p_hi) << 3u);
    let nd0p_ars_hi: i32 = nd0p_hi >> 29u;

    let ne0p_pll: i32 = ke_lo_l * p0_l;
    let ne0p_mid: i32 = ke_lo_l * p0_h + ke_lo_h * p0_l;
    let ne0p_phh: i32 = ke_lo_h * p0_h;
    let ne0p_pll_u: u32 = u32(ne0p_pll);
    let ne0p_mid_u: u32 = u32(ne0p_mid);
    let ne0p_phh_u: u32 = u32(ne0p_phh);
    let ne0p_pll_hi: i32 = ne0p_pll >> 31u;
    let ne0p_mid_hi: i32 = ne0p_mid >> 17u;
    let ne0p_phh_hi: i32 = ne0p_phh >> 2u;
    let ne0p_s1: u32 = ne0p_pll_u + (ne0p_mid_u << 15u);
    let ne0p_s1c: i32 = select(0i, 1i, ne0p_s1 < ne0p_pll_u);
    let ne0p_lo: u32 = ne0p_s1 + (ne0p_phh_u << 30u);
    let ne0p_s2c: i32 = select(0i, 1i, ne0p_lo < ne0p_s1);
    let ne0p_hi: i32 = ne0p_pll_hi + ne0p_mid_hi + ne0p_phh_hi + ne0p_s1c + ne0p_s2c;
    let ne0pa_lo: u32 = ne0_lo + ne0p_lo;
    let ne0pa_c: i32 = select(0i, 1i, ne0pa_lo < ne0_lo);
    let ne0pa_hi: i32 = ne0_hi + ne0p_hi + ne0pa_c;
    let ne0pa_ars_lo: u32 = (ne0pa_lo >> 29u) | (u32(ne0pa_hi) << 3u);
    let ne0pa_ars_hi: i32 = ne0pa_hi >> 29u;

    // cd_acc = nd1 + kd_lo*p[1] + kd_hi*p[0] + (nd0_plus >> 29)
    let cda_pll: i32 = kd_lo_l * p1_l + kd_hi_l * p0_l;
    let cda_mid: i32 =
        kd_lo_l * p1_h + kd_lo_h * p1_l
        + kd_hi_l * p0_h + kd_hi_h * p0_l;
    let cda_phh: i32 = kd_lo_h * p1_h + kd_hi_h * p0_h;
    let cda_pll_u: u32 = u32(cda_pll);
    let cda_mid_u: u32 = u32(cda_mid);
    let cda_phh_u: u32 = u32(cda_phh);
    let cda_pll_hi: i32 = cda_pll >> 31u;
    let cda_mid_hi: i32 = cda_mid >> 17u;
    let cda_phh_hi: i32 = cda_phh >> 2u;
    let cda_s1: u32 = cda_pll_u + (cda_mid_u << 15u);
    let cda_s1c: i32 = select(0i, 1i, cda_s1 < cda_pll_u);
    let cda_p_lo: u32 = cda_s1 + (cda_phh_u << 30u);
    let cda_s2c: i32 = select(0i, 1i, cda_p_lo < cda_s1);
    let cda_p_hi: i32 = cda_pll_hi + cda_mid_hi + cda_phh_hi + cda_s1c + cda_s2c;
    // cda = nd1 + cda_p + nd0p_ars
    let cda_a_lo: u32 = nd1_lo + cda_p_lo;
    let cda_a_c: i32 = select(0i, 1i, cda_a_lo < nd1_lo);
    let cda_a_hi: i32 = nd1_hi + cda_p_hi + cda_a_c;
    let cda_b_lo: u32 = cda_a_lo + nd0p_ars_lo;
    let cda_b_c: i32 = select(0i, 1i, cda_b_lo < cda_a_lo);
    let cda_b_hi: i32 = cda_a_hi + nd0p_ars_hi + cda_b_c;
    // cd = cda >> 29 (signed arithmetic)
    var cd_lo: u32 = (cda_b_lo >> 29u) | (u32(cda_b_hi) << 3u);
    var cd_hi: i32 = cda_b_hi >> 29u;

    let cea_pll: i32 = ke_lo_l * p1_l + ke_hi_l * p0_l;
    let cea_mid: i32 =
        ke_lo_l * p1_h + ke_lo_h * p1_l
        + ke_hi_l * p0_h + ke_hi_h * p0_l;
    let cea_phh: i32 = ke_lo_h * p1_h + ke_hi_h * p0_h;
    let cea_pll_u: u32 = u32(cea_pll);
    let cea_mid_u: u32 = u32(cea_mid);
    let cea_phh_u: u32 = u32(cea_phh);
    let cea_pll_hi: i32 = cea_pll >> 31u;
    let cea_mid_hi: i32 = cea_mid >> 17u;
    let cea_phh_hi: i32 = cea_phh >> 2u;
    let cea_s1: u32 = cea_pll_u + (cea_mid_u << 15u);
    let cea_s1c: i32 = select(0i, 1i, cea_s1 < cea_pll_u);
    let cea_p_lo: u32 = cea_s1 + (cea_phh_u << 30u);
    let cea_s2c: i32 = select(0i, 1i, cea_p_lo < cea_s1);
    let cea_p_hi: i32 = cea_pll_hi + cea_mid_hi + cea_phh_hi + cea_s1c + cea_s2c;
    let cea_a_lo: u32 = ne1_lo + cea_p_lo;
    let cea_a_c: i32 = select(0i, 1i, cea_a_lo < ne1_lo);
    let cea_a_hi: i32 = ne1_hi + cea_p_hi + cea_a_c;
    let cea_b_lo: u32 = cea_a_lo + ne0pa_ars_lo;
    let cea_b_c: i32 = select(0i, 1i, cea_b_lo < cea_a_lo);
    let cea_b_hi: i32 = cea_a_hi + ne0pa_ars_hi + cea_b_c;
    var ce_lo: u32 = (cea_b_lo >> 29u) | (u32(cea_b_hi) << 3u);
    var ce_hi: i32 = cea_b_hi >> 29u;

    // Slide-forward previous-limb splits for the inner loop. `pc_l`/`pc_h`
    // hold p[i-1] entering iter i; after the body we set pc = p[i].
    var dp_l: i32 = d1_l;
    var dp_h: i32 = d1_h;
    var ep_l: i32 = e1_l;
    var ep_h: i32 = e1_h;
    var pc_l: i32 = p1_l;
    var pc_h: i32 = p1_h;

    for (var i: u32 = 2u; i < BY_NUM_LIMBS; i = i + 1u) {
        let di: i32 = (*d).l[i];
        let ei: i32 = (*e).l[i];
        let pi: i32 = (*p).l[i];
        let di_l: i32 = (di << 17u) >> 17u;
        let di_h: i32 = (di - di_l) >> 15u;
        let ei_l: i32 = (ei << 17u) >> 17u;
        let ei_h: i32 = (ei - ei_l) >> 15u;
        let pi_l: i32 = (pi << 17u) >> 17u;
        let pi_h: i32 = (pi - pi_l) >> 15u;

        // nd = u_lo*di + v_lo*ei + u_hi*dp + v_hi*ep + kd_lo*p[i] + kd_hi*p[i-1] + cd
        // 6 products. Bound check: each pll/phh < 2^28, sum < 6*2^28 < 2^31 ✓
        //                          each plh+phl < 2*2^28 = 2^29, sum < 6*2^29 < 2^32 ✗ overflow !
        // The "mid" lane needs care. Split: sum 6 lh-products and 6 hl-products SEPARATELY,
        // each < 6*2^28 < 2^31. Then combine in i64 via two adds.
        let nd_pll: i32 =
            u_lo_l * di_l + v_lo_l * ei_l
            + u_hi_l * dp_l + v_hi_l * ep_l
            + kd_lo_l * pi_l + kd_hi_l * pc_l;
        // Two mid sub-lanes: low_high_products + high_low_products.
        let nd_mid_lh: i32 =
            u_lo_l * di_h + v_lo_l * ei_h
            + u_hi_l * dp_h + v_hi_l * ep_h
            + kd_lo_l * pi_h + kd_hi_l * pc_h;
        let nd_mid_hl: i32 =
            u_lo_h * di_l + v_lo_h * ei_l
            + u_hi_h * dp_l + v_hi_h * ep_l
            + kd_lo_h * pi_l + kd_hi_h * pc_l;
        let nd_phh: i32 =
            u_lo_h * di_h + v_lo_h * ei_h
            + u_hi_h * dp_h + v_hi_h * ep_h
            + kd_lo_h * pi_h + kd_hi_h * pc_h;

        let ne_pll: i32 =
            q_lo_l * di_l + r_lo_l * ei_l
            + q_hi_l * dp_l + r_hi_l * ep_l
            + ke_lo_l * pi_l + ke_hi_l * pc_l;
        let ne_mid_lh: i32 =
            q_lo_l * di_h + r_lo_l * ei_h
            + q_hi_l * dp_h + r_hi_l * ep_h
            + ke_lo_l * pi_h + ke_hi_l * pc_h;
        let ne_mid_hl: i32 =
            q_lo_h * di_l + r_lo_h * ei_l
            + q_hi_h * dp_l + r_hi_h * ep_l
            + ke_lo_h * pi_l + ke_hi_h * pc_l;
        let ne_phh: i32 =
            q_lo_h * di_h + r_lo_h * ei_h
            + q_hi_h * dp_h + r_hi_h * ep_h
            + ke_lo_h * pi_h + ke_hi_h * pc_h;

        // Combine nd_pll + (nd_mid_lh + nd_mid_hl) << 15 + nd_phh << 30 + cd into i64.
        // First fold nd_mid_lh + nd_mid_hl as i64 (mid lane could overflow i32 if combined).
        // Each is < 2^31; sum needs 33 bits.
        let nd_pll_u: u32 = u32(nd_pll);
        let nd_mlh_u: u32 = u32(nd_mid_lh);
        let nd_mhl_u: u32 = u32(nd_mid_hl);
        let nd_phh_u: u32 = u32(nd_phh);
        let nd_pll_hi: i32 = nd_pll >> 31u;
        let nd_mlh_hi: i32 = nd_mid_lh >> 17u;
        let nd_mhl_hi: i32 = nd_mid_hl >> 17u;
        let nd_phh_hi: i32 = nd_phh >> 2u;

        // s = pll + mlh<<15 + mhl<<15 + phh<<30 + cd
        let nd_a_lo: u32 = nd_pll_u + (nd_mlh_u << 15u);
        let nd_a_c: i32 = select(0i, 1i, nd_a_lo < nd_pll_u);
        let nd_b_lo: u32 = nd_a_lo + (nd_mhl_u << 15u);
        let nd_b_c: i32 = select(0i, 1i, nd_b_lo < nd_a_lo);
        let nd_c_lo: u32 = nd_b_lo + (nd_phh_u << 30u);
        let nd_c_c: i32 = select(0i, 1i, nd_c_lo < nd_b_lo);
        let nd_d_lo: u32 = nd_c_lo + cd_lo;
        let nd_d_c: i32 = select(0i, 1i, nd_d_lo < nd_c_lo);
        let nd_d_hi: i32 = nd_pll_hi + nd_mlh_hi + nd_mhl_hi + nd_phh_hi + nd_a_c + nd_b_c + nd_c_c + nd_d_c + cd_hi;

        let ne_pll_u: u32 = u32(ne_pll);
        let ne_mlh_u: u32 = u32(ne_mid_lh);
        let ne_mhl_u: u32 = u32(ne_mid_hl);
        let ne_phh_u: u32 = u32(ne_phh);
        let ne_pll_hi: i32 = ne_pll >> 31u;
        let ne_mlh_hi: i32 = ne_mid_lh >> 17u;
        let ne_mhl_hi: i32 = ne_mid_hl >> 17u;
        let ne_phh_hi: i32 = ne_phh >> 2u;

        let ne_a_lo: u32 = ne_pll_u + (ne_mlh_u << 15u);
        let ne_a_c: i32 = select(0i, 1i, ne_a_lo < ne_pll_u);
        let ne_b_lo: u32 = ne_a_lo + (ne_mhl_u << 15u);
        let ne_b_c: i32 = select(0i, 1i, ne_b_lo < ne_a_lo);
        let ne_c_lo: u32 = ne_b_lo + (ne_phh_u << 30u);
        let ne_c_c: i32 = select(0i, 1i, ne_c_lo < ne_b_lo);
        let ne_d_lo: u32 = ne_c_lo + ce_lo;
        let ne_d_c: i32 = select(0i, 1i, ne_d_lo < ne_c_lo);
        let ne_d_hi: i32 = ne_pll_hi + ne_mlh_hi + ne_mhl_hi + ne_phh_hi + ne_a_c + ne_b_c + ne_c_c + ne_d_c + ce_hi;

        (*d).l[i - 2u] = i32(nd_d_lo & BY_LIMB_MASK);
        (*e).l[i - 2u] = i32(ne_d_lo & BY_LIMB_MASK);
        cd_lo = (nd_d_lo >> 29u) | (u32(nd_d_hi) << 3u);
        cd_hi = nd_d_hi >> 29u;
        ce_lo = (ne_d_lo >> 29u) | (u32(ne_d_hi) << 3u);
        ce_hi = ne_d_hi >> 29u;

        // Slide previous-limb splits.
        dp_l = di_l; dp_h = di_h;
        ep_l = ei_l; ep_h = ei_h;
        pc_l = pi_l; pc_h = pi_h;
    }

    // Top-limb finalisation:
    //   nd9 = u_hi * dp + v_hi * ep + kd_hi * p[N-1] + cd  (3 products)
    //   ne9 = q_hi * dp + r_hi * ep + ke_hi * p[N-1] + ce
    let p_top: i32 = (*p).l[BY_NUM_LIMBS - 1u];
    let pt_l: i32 = (p_top << 17u) >> 17u;
    let pt_h: i32 = (p_top - pt_l) >> 15u;

    let nd9_pll: i32 = u_hi_l * dp_l + v_hi_l * ep_l + kd_hi_l * pt_l;
    let nd9_mid: i32 =
        u_hi_l * dp_h + u_hi_h * dp_l
        + v_hi_l * ep_h + v_hi_h * ep_l
        + kd_hi_l * pt_h + kd_hi_h * pt_l;
    let nd9_phh: i32 = u_hi_h * dp_h + v_hi_h * ep_h + kd_hi_h * pt_h;

    let ne9_pll: i32 = q_hi_l * dp_l + r_hi_l * ep_l + ke_hi_l * pt_l;
    let ne9_mid: i32 =
        q_hi_l * dp_h + q_hi_h * dp_l
        + r_hi_l * ep_h + r_hi_h * ep_l
        + ke_hi_l * pt_h + ke_hi_h * pt_l;
    let ne9_phh: i32 = q_hi_h * dp_h + r_hi_h * ep_h + ke_hi_h * pt_h;

    // For 3 products, mid sum ≤ 3 * 2 * 2^28 = 3 * 2^29 = 1.5 * 2^30 < 2^31 ✓
    let nd9_pll_u: u32 = u32(nd9_pll);
    let nd9_mid_u: u32 = u32(nd9_mid);
    let nd9_phh_u: u32 = u32(nd9_phh);
    let nd9_pll_hi: i32 = nd9_pll >> 31u;
    let nd9_mid_hi: i32 = nd9_mid >> 17u;
    let nd9_phh_hi: i32 = nd9_phh >> 2u;
    let nd9_s1: u32 = nd9_pll_u + (nd9_mid_u << 15u);
    let nd9_s1c: i32 = select(0i, 1i, nd9_s1 < nd9_pll_u);
    let nd9_s2: u32 = nd9_s1 + (nd9_phh_u << 30u);
    let nd9_s2c: i32 = select(0i, 1i, nd9_s2 < nd9_s1);
    let nd9_total_lo: u32 = nd9_s2 + cd_lo;
    let nd9_total_c: i32 = select(0i, 1i, nd9_total_lo < nd9_s2);
    let nd9_total_hi: i32 = nd9_pll_hi + nd9_mid_hi + nd9_phh_hi + nd9_s1c + nd9_s2c + nd9_total_c + cd_hi;

    let ne9_pll_u: u32 = u32(ne9_pll);
    let ne9_mid_u: u32 = u32(ne9_mid);
    let ne9_phh_u: u32 = u32(ne9_phh);
    let ne9_pll_hi: i32 = ne9_pll >> 31u;
    let ne9_mid_hi: i32 = ne9_mid >> 17u;
    let ne9_phh_hi: i32 = ne9_phh >> 2u;
    let ne9_s1: u32 = ne9_pll_u + (ne9_mid_u << 15u);
    let ne9_s1c: i32 = select(0i, 1i, ne9_s1 < ne9_pll_u);
    let ne9_s2: u32 = ne9_s1 + (ne9_phh_u << 30u);
    let ne9_s2c: i32 = select(0i, 1i, ne9_s2 < ne9_s1);
    let ne9_total_lo: u32 = ne9_s2 + ce_lo;
    let ne9_total_c: i32 = select(0i, 1i, ne9_total_lo < ne9_s2);
    let ne9_total_hi: i32 = ne9_pll_hi + ne9_mid_hi + ne9_phh_hi + ne9_s1c + ne9_s2c + ne9_total_c + ce_hi;

    (*d).l[BY_NUM_LIMBS - 2u] = i32(nd9_total_lo & BY_LIMB_MASK);
    (*e).l[BY_NUM_LIMBS - 2u] = i32(ne9_total_lo & BY_LIMB_MASK);
    (*d).l[BY_NUM_LIMBS - 1u] = i32((nd9_total_lo >> 29u) | (u32(nd9_total_hi) << 3u));
    (*e).l[BY_NUM_LIMBS - 1u] = i32((ne9_total_lo >> 29u) | (u32(ne9_total_hi) << 3u));
    // by_normalise no-op: lower limbs already masked.
}

// ============================================================
// fr_inv_by driver helpers
// ============================================================

// by_is_zero: returns true iff every limb of x is zero.
// Pre: any state (need not be canonical). Post: bool.
fn by_is_zero(x: ptr<function, BigIntBY>) -> bool {
    var a: i32 = 0;
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        a = a | (*x).l[i];
    }
    return a == 0;
}

// by_is_negative: top-limb sign check on a normalised BigIntBY.
// Pre: x normalised so the top limb carries the sign. Post: bool.
fn by_is_negative(x: ptr<function, BigIntBY>) -> bool {
    return (*x).l[BY_NUM_LIMBS - 1u] < 0;
}

// by_neg_inplace: negate x then re-normalise so lower limbs are in
// [0, 2^29) again. Mirrors `neg(x)` in bernstein_yang.ts.
fn by_neg_inplace(x: ptr<function, BigIntBY>) {
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        (*x).l[i] = -(*x).l[i];
    }
    by_normalise(x);
}

// by_add_p_inplace: x <- x + p (limbwise) then normalise.
fn by_add_p_inplace(x: ptr<function, BigIntBY>, p: ptr<function, BigIntBY>) {
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        (*x).l[i] = (*x).l[i] + (*p).l[i];
    }
    by_normalise(x);
}

// by_sub_p_inplace: x <- x - p (limbwise) then normalise.
fn by_sub_p_inplace(x: ptr<function, BigIntBY>, p: ptr<function, BigIntBY>) {
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        (*x).l[i] = (*x).l[i] - (*p).l[i];
    }
    by_normalise(x);
}

// by_gte_p: true iff x >= p, assuming both x and p are non-negative
// canonical-limb 9-limb BigIntBY values (lower limbs in [0, 2^29), top limb
// non-negative). Walks limbs from high to low.
fn by_gte_p(x: ptr<function, BigIntBY>, p: ptr<function, BigIntBY>) -> bool {
    var gt: bool = false;
    var lt: bool = false;
    for (var ii: u32 = 0u; ii < BY_NUM_LIMBS; ii = ii + 1u) {
        let i: u32 = BY_NUM_LIMBS - 1u - ii;
        let a: i32 = (*x).l[i];
        let b: i32 = (*p).l[i];
        let still_undecided: bool = !(gt || lt);
        if (still_undecided) {
            if (a > b) { gt = true; }
            else if (a < b) { lt = true; }
        }
    }
    return gt || !lt;
}

// by_reduce_to_canonical: bring x into [0, p) using at most BY_RTC_MAX_ITERS
// (= 36) add-p / sub-p passes. Mirrors `reduceToCanonical` in
// bernstein_yang.ts exactly: if x is negative, add p; else if x >= p,
// subtract p; else break. The 36-iter bound suffices for |x| <= 32 p under
// REDUCE_INTERVAL = 4 (see Wasm9x29 docs).
//
// LOOP BOUND: `for (var it: u32 = 0u; it < BY_RTC_MAX_ITERS; ...)` — const.
//
// Pre:  x is a possibly-non-canonical signed BigIntBY (post-by_normalise:
//       lower limbs in [0, 2^29), top limb carries sign). p is the modulus
//       in BigIntBY form (positive, canonical).
// Post: x in [0, p), canonical.
fn by_reduce_to_canonical(x: ptr<function, BigIntBY>, p: ptr<function, BigIntBY>) {
    by_normalise(x);
    var done: bool = false;
    for (var it: u32 = 0u; it < BY_RTC_MAX_ITERS; it = it + 1u) {
        if (done) { continue; }
        if (by_is_negative(x)) {
            by_add_p_inplace(x, p);
        } else if (by_gte_p(x, p)) {
            by_sub_p_inplace(x, p);
        } else {
            done = true;
        }
    }
}

// 58-bit p_inv split as low 32 / high (<=26) bits. Mustache-injected by
// `gen_fr_inv_bench_shader` (and the production wiring in step 1.7) from
// `compute_by_p_inv_split` in cuzk/utils.ts. Matching pair to the
// `P_INV_BY_LO` / `P_INV_BY_HI` constants the apply_matrix bench uses.
const FR_INV_BY_P_INV_LO: u32 = {{ p_inv_by_lo }}u;
const FR_INV_BY_P_INV_HI: u32 = {{ p_inv_by_hi }}u;

// fr_inv_by: Bernstein-Yang safegcd inverse driver, mirroring
// `invert_bernsteinyang19<S>` (bernstein_yang_inverse.hpp lines 290-326)
// and the TS reference `Wasm9x29.invert` (bernstein_yang.ts:409-440).
//
// Input  `a` is in Montgomery form: bigint_value(a) = A * R mod p.
// Output is in Montgomery form: bigint_value(output) = A^(-1) * R mod p.
//
// Algorithm sketch:
//   1. Convert (a, p) to 9 x 29-bit BigIntBY representation.
//   2. Run NUM_OUTER = 13 outer iterations. Each outer iter:
//        a. Compute low-64-bit views (f_lo, g_lo) of (f, g).
//        b. by_divsteps(&delta, f_lo, g_lo) -> Mat (BATCH = 58 inner).
//        c. by_apply_matrix_fg(M, &f, &g) — folds 58 divsteps into f, g.
//        d. by_apply_matrix_de(M, &d, &e, &p, p_inv) — same on (d, e).
//        e. Every BY_REDUCE_INTERVAL = 4 iters, reduce_to_canonical(d, e).
//        f. Early break on `by_is_zero(g)` — the const NUM_OUTER bound is
//           still respected by the WGSL emitter via a guard flag, not by
//           shrinking the loop count.
//   3. After the loop, reduce_to_canonical(d) and, if f is negative,
//      negate d mod p (mirrors the C++ `sign(f) * d` step).
//   4. The BY output is `inv_native = (A * R)^(-1) mod p = A^(-1) * R^(-1)`
//      in canonical [0, p). Apply the standard Mont correction via
//      `montgomery_product(inv_native, R^3)` =
//      inv_native * R^3 * R^(-1) = inv_native * R^2 = A^(-1) * R, in
//      Montgomery form. Pattern matches `fr_inv` in fr_pow.template.wgsl.
//   5. Convert back to 20 x 13-bit BigInt and return.
//
// LOOP BOUND DISCIPLINE:
//   - outer loop:               `for (... iter < BY_NUM_OUTER; ...)` (const 13).
//   - by_divsteps:              `for (... i < BY_BATCH; ...)`        (const 58).
//   - by_apply_matrix_*:        `for (... i < BY_NUM_LIMBS; ...)`    (const 9).
//   - by_reduce_to_canonical:   `for (... it < BY_RTC_MAX_ITERS; ...)`(const 36).
//   - by_normalise / by_neg:    `for (... i < BY_NUM_LIMBS; ...)`    (const 9).
//   - by_from_bigint / by_to_bigint loops bounded by const BY_NUM_LIMBS
//     and Mustache-const `{{ num_words }}`.
// No data-dependent loop bounds anywhere on the inversion path.
fn fr_inv_by(a: BigInt) -> BigInt {
    // Modulus p in BigIntBY form. Use the same Mustache-injected initializer
    // as the apply_matrix bench; this gates fr_inv_by's behaviour on the
    // ShaderManager-supplied p_limbs_by, matching the rest of the BY surface.
    var p_by: BigIntBY = BigIntBY(array<i32, 9>({{{ p_limbs_by }}}));
    var f: BigIntBY = BigIntBY(array<i32, 9>({{{ p_limbs_by }}}));
    var g: BigIntBY = by_from_bigint(a);

    var d: BigIntBY;
    var e: BigIntBY;
    for (var k: u32 = 0u; k < BY_NUM_LIMBS; k = k + 1u) {
        d.l[k] = 0;
        e.l[k] = 0;
    }
    e.l[0] = 1;

    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BY_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        // low_64 view of f and g for divsteps. Inlined by_low_u64_lohi.
        let f_l0: u32 = u32(f.l[0]) & BY_LIMB_MASK;
        let f_l1: u32 = u32(f.l[1]) & BY_LIMB_MASK;
        let f_l2: u32 = u32(f.l[2]) & 0x3Fu;
        let f_lo: vec2<u32> = vec2<u32>(f_l0 | ((f_l1 & 0x7u) << 29u), (f_l1 >> 3u) | (f_l2 << 26u));
        let g_l0: u32 = u32(g.l[0]) & BY_LIMB_MASK;
        let g_l1: u32 = u32(g.l[1]) & BY_LIMB_MASK;
        let g_l2: u32 = u32(g.l[2]) & 0x3Fu;
        let g_lo: vec2<u32> = vec2<u32>(g_l0 | ((g_l1 & 0x7u) << 29u), (g_l1 >> 3u) | (g_l2 << 26u));
        let m: Mat = by_divsteps(&delta, f_lo, g_lo);
        by_apply_matrix_fg(m, &f, &g);
        by_apply_matrix_de(m, &d, &e, &p_by, FR_INV_BY_P_INV_LO, FR_INV_BY_P_INV_HI);
        if (((iter + 1u) % BY_REDUCE_INTERVAL) == 0u) {
            by_reduce_to_canonical(&d, &p_by);
            by_reduce_to_canonical(&e, &p_by);
        }
        if (by_is_zero(&g)) {
            done = true;
        }
    }

    by_reduce_to_canonical(&d, &p_by);
    if (by_is_negative(&f)) {
        by_neg_inplace(&d);
        by_reduce_to_canonical(&d, &p_by);
    }

    // inv_native = A^(-1) * R^(-1) mod p (canonical [0, p)). Mont correction
    // via `montgomery_product(inv_native, R^3)` lands at A^(-1) * R, matching
    // the pattern used by fr_inv in fr_pow.template.wgsl.
    var inv_native: BigInt = by_to_bigint(d);
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&inv_native, &r_cubed);
}
