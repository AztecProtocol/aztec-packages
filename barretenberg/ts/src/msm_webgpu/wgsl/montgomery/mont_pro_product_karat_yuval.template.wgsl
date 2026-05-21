// u32 Montgomery product via recursive KARATSUBA + YUVAL reduction.
// Fully unrolled — all indices compile-time constants so WGSL→MSL can
// SROA the temp slots into registers instead of thread-local memory.
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

// Modulus limbs as individual compile-time constants. Used directly (no
// per-thread `get_p()` BigInt in scratch) by the standard Mont reduce and
// the const-modulus conditional reduce below. Also visible module-scope to
// the field ops and the inverse partials.
{{#p_consts}}
const P_{{idx}}: u32 = {{val}}u;
{{/p_consts}}

fn get_p() -> BigInt {
    var p: BigInt;
{{{ p_limbs }}}
    return p;
}

fn montgomery_product(x_ptr: ptr<function, BigInt>, y_ptr: ptr<function, BigInt>) -> BigInt {
    // === Input load: 40 named locals, one per limb. ===
{{#input_loads}}
    let {{name}}: u32 = (*{{ptr}}).limbs[{{k}}u];
{{/input_loads}}

    // === Sums for inner Karatsuba: ===
    // a_lo_sum[k] = x_lo_lo[k] + x_lo_hi[k], a_hi_sum = x_hi_lo + x_hi_hi.
    // For P_cross outer: a_cr_lo[k] = x_lo_lo[k] + x_hi_lo[k], a_cr_hi =
    // x_lo_hi + x_hi_hi. Then inner cross sum: a_cr_sum = a_cr_lo + a_cr_hi.
{{#sum_lets}}
    let {{name}}: u32 = {{lhs}} + {{rhs}};
{{/sum_lets}}

    // === 9 sub-sub-products (5×5 schoolbook each). ===
    // Each output slot is a single `let` with a sum-of-products expression.
{{#schoolbooks}}
    // --- {{label}}: out_prefix={{out_prefix}}, a={{a_prefix}}, b={{b_prefix}} ---
    let {{out_prefix}}_0: u32 = {{a_prefix}}_0 * {{b_prefix}}_0;
    let {{out_prefix}}_1: u32 = {{a_prefix}}_0 * {{b_prefix}}_1 + {{a_prefix}}_1 * {{b_prefix}}_0;
    let {{out_prefix}}_2: u32 = {{a_prefix}}_0 * {{b_prefix}}_2 + {{a_prefix}}_1 * {{b_prefix}}_1 + {{a_prefix}}_2 * {{b_prefix}}_0;
    let {{out_prefix}}_3: u32 = {{a_prefix}}_0 * {{b_prefix}}_3 + {{a_prefix}}_1 * {{b_prefix}}_2 + {{a_prefix}}_2 * {{b_prefix}}_1 + {{a_prefix}}_3 * {{b_prefix}}_0;
    let {{out_prefix}}_4: u32 = {{a_prefix}}_0 * {{b_prefix}}_4 + {{a_prefix}}_1 * {{b_prefix}}_3 + {{a_prefix}}_2 * {{b_prefix}}_2 + {{a_prefix}}_3 * {{b_prefix}}_1 + {{a_prefix}}_4 * {{b_prefix}}_0;
    let {{out_prefix}}_5: u32 = {{a_prefix}}_1 * {{b_prefix}}_4 + {{a_prefix}}_2 * {{b_prefix}}_3 + {{a_prefix}}_3 * {{b_prefix}}_2 + {{a_prefix}}_4 * {{b_prefix}}_1;
    let {{out_prefix}}_6: u32 = {{a_prefix}}_2 * {{b_prefix}}_4 + {{a_prefix}}_3 * {{b_prefix}}_3 + {{a_prefix}}_4 * {{b_prefix}}_2;
    let {{out_prefix}}_7: u32 = {{a_prefix}}_3 * {{b_prefix}}_4 + {{a_prefix}}_4 * {{b_prefix}}_3;
    let {{out_prefix}}_8: u32 = {{a_prefix}}_4 * {{b_prefix}}_4;
{{/schoolbooks}}

    // === Inner Karatsuba combine: form P_lo, P_hi, P_cross as named locals. ===
    // For each, 19 outputs combining the 3 sub-sub-products. The mid term
    // uses unsigned subtraction; underflow is impossible because the
    // algebraic identity P_mid[m] = Σ a_lo·b_hi + a_hi·b_lo is non-neg
    // per-limb at the lazy values.
{{#inner_combines}}
    // --- {{label}}: out_prefix={{out_prefix}}, ll={{ll_prefix}}, hh={{hh_prefix}}, c={{c_prefix}} ---
    let {{out_prefix}}_0:  u32 = {{ll_prefix}}_0;
    let {{out_prefix}}_1:  u32 = {{ll_prefix}}_1;
    let {{out_prefix}}_2:  u32 = {{ll_prefix}}_2;
    let {{out_prefix}}_3:  u32 = {{ll_prefix}}_3;
    let {{out_prefix}}_4:  u32 = {{ll_prefix}}_4;
    let {{out_prefix}}_5:  u32 = {{ll_prefix}}_5 + {{c_prefix}}_0 - {{ll_prefix}}_0 - {{hh_prefix}}_0;
    let {{out_prefix}}_6:  u32 = {{ll_prefix}}_6 + {{c_prefix}}_1 - {{ll_prefix}}_1 - {{hh_prefix}}_1;
    let {{out_prefix}}_7:  u32 = {{ll_prefix}}_7 + {{c_prefix}}_2 - {{ll_prefix}}_2 - {{hh_prefix}}_2;
    let {{out_prefix}}_8:  u32 = {{ll_prefix}}_8 + {{c_prefix}}_3 - {{ll_prefix}}_3 - {{hh_prefix}}_3;
    let {{out_prefix}}_9:  u32 = {{c_prefix}}_4 - {{ll_prefix}}_4 - {{hh_prefix}}_4;
    let {{out_prefix}}_10: u32 = {{c_prefix}}_5 - {{ll_prefix}}_5 - {{hh_prefix}}_5 + {{hh_prefix}}_0;
    let {{out_prefix}}_11: u32 = {{c_prefix}}_6 - {{ll_prefix}}_6 - {{hh_prefix}}_6 + {{hh_prefix}}_1;
    let {{out_prefix}}_12: u32 = {{c_prefix}}_7 - {{ll_prefix}}_7 - {{hh_prefix}}_7 + {{hh_prefix}}_2;
    let {{out_prefix}}_13: u32 = {{c_prefix}}_8 - {{ll_prefix}}_8 - {{hh_prefix}}_8 + {{hh_prefix}}_3;
    let {{out_prefix}}_14: u32 = {{hh_prefix}}_4;
    let {{out_prefix}}_15: u32 = {{hh_prefix}}_5;
    let {{out_prefix}}_16: u32 = {{hh_prefix}}_6;
    let {{out_prefix}}_17: u32 = {{hh_prefix}}_7;
    let {{out_prefix}}_18: u32 = {{hh_prefix}}_8;
{{/inner_combines}}

    // === Outer combine: initialize temp[0..39]. ===
    // Slots [0,18] = P_lo. Slots [20,38] = P_hi. Slots [10,28] += P_cr - P_lo - P_hi.
    // We initialize as `var` (mutable) so the Yuval phase can mutate.
{{#outer_init}}
    var t{{slot}}: u32 = {{init_expr}};
{{/outer_init}}

    // === Outer Karatsuba cross combine: temp[k+10] += P_cr[k] - P_lo[k] - P_hi[k]. ===
    // Unsigned subtraction is safe per the outer-level algebraic identity:
    // P_mid_outer[k] = Σ x_lo·y_hi + x_hi·y_lo is non-neg per-limb.
{{#outer_cross}}
    t{{slot}} = t{{slot}} + p_cr_{{k}} - p_lo_{{k}} - p_hi_{{k}};
{{/outer_cross}}

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
        t{{slot}} = t{{slot}} + k_std * P_{{p_idx}}{{#first}} + (t{{i_std}} >> WORD_SIZE){{/first}};
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

    // === Repack canonical limbs into BigInt and return. ===
    var s: BigInt;
{{#extract}}
    s.limbs[{{out_k}}u] = t{{src_slot}};
{{/extract}}

    return conditional_reduce_constp(&s);
}

// x in [0, 2p): subtract the modulus iff x >= p, using P_i immediates (no
// per-thread modulus in memory). Single unrolled borrow chain: if it never
// underflows, x >= p and (x - p) is canonical; otherwise return x unchanged.
fn conditional_reduce_constp(x: ptr<function, BigInt>) -> BigInt {
    var res: BigInt;
    var borrow: i32 = 0;
{{#p_consts}}
    {
        let d: i32 = i32((*x).limbs[{{idx}}u]) - i32(P_{{idx}}) - borrow;
        res.limbs[{{idx}}u] = u32(d) & MASK;
        borrow = select(0, 1, d < 0);
    }
{{/p_consts}}
    if (borrow == 0) { return res; }
    return *x;
}

// a + p (full width, no reduce) using P_i immediates. a in [0, p) so the
// result is in [p, 2p) and fits the 20x13-bit representation.
fn bigint_add_const_p(a: ptr<function, BigInt>) -> BigInt {
    var res: BigInt;
    var carry: u32 = 0u;
{{#p_consts}}
    {
        let s: u32 = (*a).limbs[{{idx}}u] + P_{{idx}} + carry;
        res.limbs[{{idx}}u] = s & MASK;
        carry = s >> WORD_SIZE;
    }
{{/p_consts}}
    return res;
}
