// u32 Montgomery product via recursive KARATSUBA + YUVAL reduction.
// Packed 8xu32 interface (montgomery_product_f8): operands and result are
// the packed 256-bit form; 13-bit limbs are extracted inline with
// compile-time funnel shifts and the canonical result is packed + reduced
// in place (P8_* constants come from field8, included in every consumer).
// Fully unrolled — all indices compile-time constants so WGSL→MSL can
// SROA the temp slots into registers instead of thread-local memory.
//
// === Register-light grouped emit ===
// The multiply is emitted grouped by half-product: each of P_lo, P_hi,
// P_cr gets one scoped block that computes its 3 schoolbook sub-products
// and folds the Karatsuba-combined result straight into the 40-limb
// accumulator t. Only one group's 27 schoolbook outputs are live at a
// time (not all 81) — identical arithmetic, same 225 multiplies, same
// combine adds; just a tighter live-range schedule that roughly halves
// the register peak, keeping small-register-file GPUs off the spill cliff.
//
// === Layout ===
// 4 input chunks per operand (5 limbs each, named locals):
//   x_lo_lo = x[0..4],  x_lo_hi = x[5..9]
//   x_hi_lo = x[10..14], x_hi_hi = x[15..19]
//   (same naming for y)
//
// 9 sub-sub-products (each 5×5 schoolbook → 9 output limbs):
//   For P_lo  = x[0..9]·y[0..9]:    pp_lo_LL, pp_lo_HH, pp_lo_C
//   For P_hi  = x[10..19]·y[10..19]: pp_hi_LL, pp_hi_HH, pp_hi_C
//   For P_cr  = (x[0..9]+x[10..19])·(y[0..9]+y[10..19]):
//                                    pp_cr_LL, pp_cr_HH, pp_cr_C
//
// 3 outer sub-products (inner Karat combine):
//   P_lo[k]  = pp_lo_LL[k]  + (pp_lo_C[k-5] - pp_lo_LL[k-5] - pp_lo_HH[k-5]) + pp_lo_HH[k-10]
//   P_hi[k]  = pp_hi_LL[k]  + (pp_hi_C[k-5] - pp_hi_LL[k-5] - pp_hi_HH[k-5]) + pp_hi_HH[k-10]
//   P_cr[k]  = pp_cr_LL[k]  + (pp_cr_C[k-5] - pp_cr_LL[k-5] - pp_cr_HH[k-5]) + pp_cr_HH[k-10]
//
// Outer combine into temp[0..38]:
//   temp[k]      += P_lo[k]                                   for k in [0, 18]
//   temp[k+20]   += P_hi[k]                                   for k in [0, 18]
//   temp[k+10]   += P_cr[k] - P_lo[k] - P_hi[k]               for k in [0, 18]
//
// Yuval reduce (N-1 calls + 1 standard):
//   for i in 0..N-1:
//     t_mask = temp[i] & MASK; carry = temp[i] >> WORD_SIZE
//     temp[i+1] += t_mask·R_INV[0] + carry
//     temp[i+1+j] += t_mask·R_INV[j]                          for j in [1, N)
//   standard reduce at i=N-1: k = (temp[i]&MASK)·N0 & MASK;
//     temp[i+j] += k·p[j]                                     for j in [0, N)
//     plus the (temp[i]>>WORD_SIZE) carry folded into temp[i+1]
//
// Final canonicalization: single carry pass over the upper N slots.
//
// === Why no drains in the multiply phase ===
// One inner sub-product (pp_cr_C slot 4 = 80·W² = 2³²·³²) wraps u32 by
// ~1.25×. This wrap is HARMLESS: the subsequent `pp_cr_C - pp_cr_LL -
// pp_cr_HH` subtraction unwinds the wrap via modular arithmetic, giving
// the correct (mathematically non-negative) pp_cr_mid value, which fits
// u32. Every other intermediate fits u32 directly. See
// karat_intermediate_check.mjs for the per-slot proof.
//
// Final temp[k] math bound: 40·W² = 2³¹·³² < 2³². ✓ Zero drains needed.

const NUM_WORDS: u32 = {{ num_words }}u;
const WORD_SIZE: u32 = {{ word_size }}u;
const MASK: u32      = {{ mask }}u;
const TWO_POW_WORD_SIZE: u32 = {{ two_pow_word_size }}u;
const N0: u32        = {{ n0 }}u;
const P_INV_MOD_2W: u32 = {{ p_inv_mod_2w }}u;

// r_inv = 2^{-WORD_SIZE} mod p, as N individual constants (NOT array —
// naga rejects runtime indexing into a const array, and the unrolled
// Yuval below uses each limb at a compile-time position anyway).
{{#r_inv_consts}}
const R_INV_{{idx}}: u32 = {{val}}u;
{{/r_inv_consts}}

// The modulus limbs, in the same individual-const form. montgomery_product_f8
// reads these only at compile-time-constant positions (the fully-unrolled
// standard Montgomery reduce), so the compiler folds them to immediates
// instead of holding p as a 20-register value live across the whole
// multiply.
{{#p_limbs_consts}}
const P_LIMB_{{idx}}: u32 = {{val}}u;
{{/p_limbs_consts}}

fn montgomery_product_f8(x: array<u32, 8>, y: array<u32, 8>) -> array<u32, 8> {
    // === Grouped Karatsuba multiply + combine (generated). ===
    // Per half-product (lo / hi / cr) a scoped block computes 3 schoolbook
    // 5×5 sub-products and folds the Karatsuba-combined result straight
    // into the 40-limb accumulator t0..t39. See renderKaratYuvalMont.
{{{ multiply_body }}}

    // === Yuval reduce: 19 Yuval calls + 1 standard. ===
    // Each call extracts t_mask & carry from t{i}, then accumulates
    // t_mask·R_INV[j] into t{i+1+j} for j=0..N-1 (the carry folds into
    // the j=0 write).
{{#yuval_iters}}
    {
        let t_mask: u32 = t{{i}} & MASK;
        let carry: u32  = t{{i}} >> WORD_SIZE;
{{#writes}}
        t{{slot}} = t{{slot}} + t_mask * R_INV_{{r_idx}}{{#first}} + carry{{/first}};
{{/writes}}
    }
{{/yuval_iters}}

    // Standard Mont reduce for the last iter (i = N-1 = 19).
    {
        let t_mask: u32 = t{{i_std}} & MASK;
        let k_std: u32  = (t_mask * N0) & MASK;
{{#standard_writes}}
        t{{slot}} = t{{slot}} + k_std * P_LIMB_{{p_idx}}{{#first}} + (t{{i_std}} >> WORD_SIZE){{/first}};
{{/standard_writes}}
    }

    // === Final canonicalization (single carry pass over t20..t39). ===
    var c: u32 = 0u;
{{#final_drain}}
    {
        let v: u32 = t{{slot}} + c;
        c = v >> WORD_SIZE;
        t{{slot}} = v & MASK;
    }
{{/final_drain}}

    // === Pack the carry-normalised limbs straight into 8x u32. BN254 @
    // 20x13. NO final conditional reduce (lazy contract, field8 header):
    // with R = 2^260 and p ≈ 0.189*2^256 the value here is < 1.34p for ANY
    // 8x u32 inputs, satisfying the [0, 2p) storage invariant. ===
    var out: array<u32, 8>;
    out[0u] = t20 | (t21 << 13u) | (t22 << 26u);
    out[1u] = (t22 >> 6u) | (t23 << 7u) | (t24 << 20u);
    out[2u] = (t24 >> 12u) | (t25 << 1u) | (t26 << 14u) | (t27 << 27u);
    out[3u] = (t27 >> 5u) | (t28 << 8u) | (t29 << 21u);
    out[4u] = (t29 >> 11u) | (t30 << 2u) | (t31 << 15u) | (t32 << 28u);
    out[5u] = (t32 >> 4u) | (t33 << 9u) | (t34 << 22u);
    out[6u] = (t34 >> 10u) | (t35 << 3u) | (t36 << 16u) | (t37 << 29u);
    out[7u] = (t37 >> 3u) | (t38 << 10u) | (t39 << 23u);
    return out;
}
