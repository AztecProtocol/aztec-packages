// Register-footprint-reduced variant of mont_pro_product_karat_yuval.
//
// Identical Karatsuba multiply + Yuval reduction MATH as the production
// karat body. The ONLY difference: the 2N-wide accumulator that stays
// live across the entire reduction (the part the production body holds as
// 40 individually-named `var t0..t39` scalars, all simultaneously live
// through 19 unrolled Yuval iterations + the standard reduce + the final
// drain) is here a single addressable `var t: array<u32, 2N>`. An
// addressable local array is placed by the WGSL→MSL compiler in
// thread-local ("private") storage rather than in 40 live hardware
// registers, which slashes registers-per-thread and therefore RAISES the
// occupancy ceiling for every composite kernel that calls montgomery_product
// while holding its own working set live (affine formula temps, the
// batch-inverse prefix chain). It trades 40 registers for thread-local
// traffic — the opposite tradeoff to the fully-unrolled body, and the
// right one when occupancy (latency hiding), not instruction count, is the
// bottleneck. The short-lived multiply temporaries (schoolbook / inner
// combine) are unchanged — they do not survive across the reduction so
// they were never the dominant pressure source.

const NUM_WORDS: u32 = {{ num_words }}u;
const WORD_SIZE: u32 = {{ word_size }}u;
const MASK: u32      = {{ mask }}u;
const TWO_POW_WORD_SIZE: u32 = {{ two_pow_word_size }}u;
const N0: u32        = {{ n0 }}u;
const P_INV_MOD_2W: u32 = {{ p_inv_mod_2w }}u;

{{#r_inv_consts}}
const R_INV_{{idx}}: u32 = {{val}}u;
{{/r_inv_consts}}

fn get_p() -> BigInt {
    var p: BigInt;
{{{ p_limbs }}}
    return p;
}

fn montgomery_product(x_ptr: ptr<function, BigInt>, y_ptr: ptr<function, BigInt>) -> BigInt {
    var p = get_p();

{{#input_loads}}
    let {{name}}: u32 = (*{{ptr}}).limbs[{{k}}u];
{{/input_loads}}

{{#sum_lets}}
    let {{name}}: u32 = {{lhs}} + {{rhs}};
{{/sum_lets}}

{{#schoolbooks}}
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

{{#inner_combines}}
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

    var t: array<u32, {{ double_words }}>;
{{#outer_init}}
    t[{{slot}}u] = {{init_expr}};
{{/outer_init}}

{{#outer_cross}}
    t[{{slot}}u] = t[{{slot}}u] + p_cr_{{k}} - p_lo_{{k}} - p_hi_{{k}};
{{/outer_cross}}

{{#yuval_iters}}
    {
        let t_mask: u32 = t[{{i}}u] & MASK;
        let carry: u32  = t[{{i}}u] >> WORD_SIZE;
{{#writes}}
        t[{{slot}}u] = t[{{slot}}u] + t_mask * R_INV_{{r_idx}}{{#first}} + carry{{/first}};
{{/writes}}
    }
{{/yuval_iters}}

    {
        let t_mask: u32 = t[{{i_std}}u] & MASK;
        let k_std: u32  = (t_mask * N0) & MASK;
{{#standard_writes}}
        t[{{slot}}u] = t[{{slot}}u] + k_std * p.limbs[{{p_idx}}u]{{#first}} + (t[{{i_std}}u] >> WORD_SIZE){{/first}};
{{/standard_writes}}
    }

    var c: u32 = 0u;
    for (var d: u32 = 0u; d < NUM_WORDS; d = d + 1u) {
        let v: u32 = t[NUM_WORDS + d] + c;
        c = v >> WORD_SIZE;
        t[NUM_WORDS + d] = v & MASK;
    }

    var s: BigInt;
    for (var e: u32 = 0u; e < NUM_WORDS; e = e + 1u) {
        s.limbs[e] = t[NUM_WORDS + e];
    }

    return conditional_reduce(&s, &p);
}

fn conditional_reduce(x: ptr<function, BigInt>, y: ptr<function, BigInt>) -> BigInt {
    var x_gt_y = bigint_gt(x, y);
    var x_eq_y = bigint_eq(x, y);
    if (x_gt_y == 1u || x_eq_y) {
        var res: BigInt;
        bigint_sub(x, y, &res);
        return res;
    }
    return *x;
}
