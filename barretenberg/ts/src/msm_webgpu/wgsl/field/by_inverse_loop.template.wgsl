// ============================================================================
// Option "loop": register-minimal Bernstein-Yang safegcd field inverse.
//
// Drop-in alternative to `fr_inv_by_a`. Same signature / contract:
//   fr_inv_by_loop(a: BigInt) -> BigInt  — Montgomery-form inverse of `a`.
//
// This is `by_inverse_a`'s algorithm — BATCH=26, NUM_OUTER=29, the identical
// divstep sequence and k*p trick — with apply_matrix rewritten from a fully
// unrolled flat expression (~150-230 live i32 locals, the inverse's register
// peak) into a ROLLING LOOP (~20-25 live values). Same arithmetic, an order
// of magnitude fewer registers.
//
// The rolling apply_matrix is a faithful transliteration of `applyMatrix` in
// the tested TS reference `src/msm_webgpu/cuzk/bernstein_yang_a.ts`:
//   - BATCH=26 = 2*WORD_SIZE, so >>26 is a clean two-limb drop:
//     out[j] = product-limb[j+2]. No bit-recombination.
//   - Each matrix entry splits m = m_lo + m_hi*2^13; base-2^13 product limb i
//     reads input limbs i and i-1, so the loop carries a one-limb input
//     window (fp/gp) plus the running carry.
//   - In place: the loop writes out[i-2] only after reading in[i], so the
//     write trails the read by two limbs — no input snapshot needed.
//
// All identifiers are namespaced byl_/BYL_ so this coexists with by_inverse_a.
// Relies on the same external helpers: montgomery_product, get_p,
// get_r_cubed, bigint_is_neg_2c, bigint_gte, the u64_* helpers (bigint_by),
// the constants MASK / WORD_SIZE, and context vars num_words / p_inv_by_a_lo.
//
// NOTE: never write Mustache tags inside these comments — Mustache renders
// them regardless of WGSL comment syntax and a partial tag would inline a
// whole partial mid-comment.
// ============================================================================

// Bernstein-Yang divstep bound for a 256-bit modulus is 735 divsteps.
// BATCH=26 -> NUM_OUTER = ceil(735/26) = 29.
const BYL_BATCH: u32 = 26u;
const BYL_NUM_OUTER: u32 = 29u;
const BYL_REDUCE_INTERVAL: u32 = 4u;
const BYL_RTC_MAX_ITERS: u32 = 4u;

// Low BATCH=26 bits — used by the k*p modular-cancellation trick.
const BYL_MASK_BATCH: u32 = (1u << 26u) - 1u;
// p^(-1) mod 2^26 (Hensel-lifted), the same value by_inverse_a consumes.
const BYL_P_INV_LO: u32 = {{ p_inv_by_a_lo }}u;

// 2x2 transition matrix from BYL_BATCH divsteps. After 26 divsteps every
// entry satisfies |u,v,q,r| <= 2^26, so a plain i32 holds it.
struct BylMat {
    u: i32,
    v: i32,
    q: i32,
    r: i32,
}

// ============================================================================
// byl_divsteps: BYL_BATCH branchy divsteps on the low 64 bits of (f, g),
// carried as a vec2<u32>. We need >= BATCH bits to drive the decisions; 64
// leaves 38 bits of sign-propagation headroom. Transliteration of
// `bya_divsteps` / the TS `divsteps`.
// ============================================================================
fn byl_divsteps(delta: ptr<function, i32>, f_lo_in: vec2<u32>, g_lo_in: vec2<u32>) -> BylMat {
    var f_lo: vec2<u32> = f_lo_in;
    var g_lo: vec2<u32> = g_lo_in;
    var u: i32 = 1;
    var v: i32 = 0;
    var q: i32 = 0;
    var r: i32 = 1;
    var d: i32 = *delta;
    // Branchless divsteps: the three cases (swap / add / shift) are folded
    // into per-variable `select`s so every lane runs identical control flow.
    // A wide-wave GPU otherwise serialises all three case-bodies on any wave
    // whose lanes land in different cases. Every `new_*` is formed from the
    // pre-iteration f/g/u/v/q/r/d, then the seven are committed together.
    for (var i: u32 = 0u; i < BYL_BATCH; i = i + 1u) {
        let g_odd: bool = u64_low_bit(g_lo) != 0u;
        let swap: bool = g_odd && (d > 0);
        let addc: bool = g_odd && (d <= 0);

        // u64_sub / u64_add wrap on the low 64 bits; computing both
        // unconditionally is harmless — the unused one is just discarded.
        let g_minus_f: vec2<u32> = u64_sub(g_lo, f_lo);
        let g_plus_f: vec2<u32> = u64_add(g_lo, f_lo);
        let g_pre: vec2<u32> = select(select(g_lo, g_plus_f, addc), g_minus_f, swap);

        let new_f: vec2<u32> = select(f_lo, g_lo, swap);
        let new_g: vec2<u32> = u64_shr1(g_pre);
        let new_u: i32 = select(u << 1u, q << 1u, swap);
        let new_v: i32 = select(v << 1u, r << 1u, swap);
        let new_q: i32 = select(select(q, q + u, addc), q - u, swap);
        let new_r: i32 = select(select(r, r + v, addc), r - v, swap);
        let new_d: i32 = select(d + 1, 1 - d, swap);

        f_lo = new_f;
        g_lo = new_g;
        u = new_u;
        v = new_v;
        q = new_q;
        r = new_r;
        d = new_d;
    }
    *delta = d;
    return BylMat(u, v, q, r);
}

// ============================================================================
// byl_low_u64: low 64 bits of a 20 x 13-bit BigInt with canonical 13-bit
// limbs (the apply_matrix output guarantees limbs 0..18 are canonical).
// ============================================================================
fn byl_low_u64(x: ptr<function, BigInt>) -> vec2<u32> {
    let l0: u32 = (*x).limbs[0] & MASK;
    let l1: u32 = (*x).limbs[1] & MASK;
    let l2: u32 = (*x).limbs[2] & MASK;
    let l3: u32 = (*x).limbs[3] & MASK;
    let l4: u32 = (*x).limbs[4] & MASK;
    let lo32: u32 = l0 | (l1 << 13u) | (l2 << 26u);
    let hi32: u32 = (l2 >> 6u) | (l3 << 7u) | (l4 << 20u);
    return vec2<u32>(lo32, hi32);
}

// ============================================================================
// byl_normalise: carry-propagate so every limb in [0, NUM_WORDS-1) is a
// canonical 13-bit value and the top limb absorbs the signed extension.
// ============================================================================
fn byl_normalise(x: ptr<function, BigInt>) {
    var c: i32 = 0;
    for (var i: u32 = 0u; i < {{ num_words }}u - 1u; i = i + 1u) {
        let v: i32 = i32((*x).limbs[i]) + c;
        (*x).limbs[i] = u32(v) & MASK;
        c = v >> WORD_SIZE;
    }
    (*x).limbs[{{ num_words }}u - 1u] =
        u32(i32((*x).limbs[{{ num_words }}u - 1u]) + c) & MASK;
}

// ============================================================================
// byl_apply_matrix_fg: (f, g) <- ((u*f + v*g) >> 26, (q*f + r*g) >> 26).
//
// Rolling lookahead loop, in place. Iteration i forms the base-2^13 product
// limb i of each row from input limbs i and i-1 (fp/gp hold the i-1 window),
// propagates the carry, and stores out[i-2] = product-limb[i] (the >>26 drop).
// The two top product limbs are emitted after the loop.
// ============================================================================
fn byl_apply_matrix_fg(m: BylMat, f: ptr<function, BigInt>, g: ptr<function, BigInt>) {
    let top: u32 = {{ num_words }}u - 1u;
    let sign_shift: u32 = 32u - WORD_SIZE;

    let u_lo: i32 = i32(u32(m.u) & MASK);
    let u_hi: i32 = m.u >> WORD_SIZE;
    let v_lo: i32 = i32(u32(m.v) & MASK);
    let v_hi: i32 = m.v >> WORD_SIZE;
    let q_lo: i32 = i32(u32(m.q) & MASK);
    let q_hi: i32 = m.q >> WORD_SIZE;
    let r_lo: i32 = i32(u32(m.r) & MASK);
    let r_hi: i32 = m.r >> WORD_SIZE;

    var cf: i32 = 0;
    var cg: i32 = 0;
    var fp: i32 = 0;
    var gp: i32 = 0;
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        // Top limb carries the signed extension of the whole integer;
        // lower limbs are canonical [0, 2^13).
        var fi: i32;
        var gi: i32;
        if (i == top) {
            fi = (i32((*f).limbs[i]) << sign_shift) >> sign_shift;
            gi = (i32((*g).limbs[i]) << sign_shift) >> sign_shift;
        } else {
            fi = i32((*f).limbs[i]);
            gi = i32((*g).limbs[i]);
        }
        let nf: i32 = u_lo * fi + v_lo * gi + u_hi * fp + v_hi * gp + cf;
        let ng: i32 = q_lo * fi + r_lo * gi + q_hi * fp + r_hi * gp + cg;
        cf = nf >> WORD_SIZE;
        cg = ng >> WORD_SIZE;
        if (i >= 2u) {
            (*f).limbs[i - 2u] = u32(nf) & MASK;
            (*g).limbs[i - 2u] = u32(ng) & MASK;
        }
        fp = fi;
        gp = gi;
    }
    // Two top product limbs: position 20 (= u_hi*f[19] + v_hi*g[19] + carry)
    // splits into output limbs top-1 and top.
    let nf_top: i32 = u_hi * fp + v_hi * gp + cf;
    let ng_top: i32 = q_hi * fp + r_hi * gp + cg;
    (*f).limbs[top - 1u] = u32(nf_top) & MASK;
    (*g).limbs[top - 1u] = u32(ng_top) & MASK;
    (*f).limbs[top] = u32(nf_top >> WORD_SIZE);
    (*g).limbs[top] = u32(ng_top >> WORD_SIZE);
}

// ============================================================================
// byl_apply_matrix_de: (d, e) <- ((u*d + v*e + k_d*p) >> 26,
//                                 (q*d + r*e + k_e*p) >> 26).
//
// k_d, k_e are chosen so the low 26 bits of each numerator cancel mod p
// (standard safegcd k*p trick). Product limbs 0 and 1 are then zero; the
// rolling loop starts at i=2 with cd/ce seeded to their carry-out.
// ============================================================================
fn byl_apply_matrix_de(
    m: BylMat,
    d: ptr<function, BigInt>,
    e: ptr<function, BigInt>,
    p: ptr<function, BigInt>,
) {
    let top: u32 = {{ num_words }}u - 1u;
    let sign_shift: u32 = 32u - WORD_SIZE;

    let u_lo: i32 = i32(u32(m.u) & MASK);
    let u_hi: i32 = m.u >> WORD_SIZE;
    let v_lo: i32 = i32(u32(m.v) & MASK);
    let v_hi: i32 = m.v >> WORD_SIZE;
    let q_lo: i32 = i32(u32(m.q) & MASK);
    let q_hi: i32 = m.q >> WORD_SIZE;
    let r_lo: i32 = i32(u32(m.r) & MASK);
    let r_hi: i32 = m.r >> WORD_SIZE;

    let d0: i32 = i32((*d).limbs[0]);
    let e0: i32 = i32((*e).limbs[0]);
    let d1: i32 = i32((*d).limbs[1]);
    let e1: i32 = i32((*e).limbs[1]);
    let p0: i32 = i32((*p).limbs[0]);
    let p1: i32 = i32((*p).limbs[1]);

    // Pre-k*p product limbs 0 and 1 of (u*d+v*e) and (q*d+r*e).
    let nd0: i32 = u_lo * d0 + v_lo * e0;
    let ne0: i32 = q_lo * d0 + r_lo * e0;
    let nd1: i32 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
    let ne1: i32 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;

    // k = (-t) * p^-1 mod 2^26, where t = low 26 bits of the numerator.
    let nd0_low: u32 = u32(nd0) & MASK;
    let nd1_carry: u32 = u32(nd1 + (nd0 >> WORD_SIZE)) & MASK;
    let t_d: u32 = (nd0_low | (nd1_carry << WORD_SIZE)) & BYL_MASK_BATCH;
    let ne0_low: u32 = u32(ne0) & MASK;
    let ne1_carry: u32 = u32(ne1 + (ne0 >> WORD_SIZE)) & MASK;
    let t_e: u32 = (ne0_low | (ne1_carry << WORD_SIZE)) & BYL_MASK_BATCH;

    let neg_td: u32 = (~t_d + 1u) & BYL_MASK_BATCH;
    let neg_te: u32 = (~t_e + 1u) & BYL_MASK_BATCH;
    let k_d: u32 = (neg_td * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let k_e: u32 = (neg_te * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let kd_lo: i32 = i32(k_d & MASK);
    let kd_hi: i32 = i32(k_d >> WORD_SIZE);
    let ke_lo: i32 = i32(k_e & MASK);
    let ke_hi: i32 = i32(k_e >> WORD_SIZE);

    // Carry into product limb 2: product limbs 0 and 1 (with k*p folded in)
    // have zero low-13 bits; cd/ce are their carry-out.
    var cd: i32 = (nd1 + kd_lo * p1 + kd_hi * p0 + ((nd0 + kd_lo * p0) >> WORD_SIZE)) >> WORD_SIZE;
    var ce: i32 = (ne1 + ke_lo * p1 + ke_hi * p0 + ((ne0 + ke_lo * p0) >> WORD_SIZE)) >> WORD_SIZE;

    var dp: i32 = d1;
    var ep: i32 = e1;
    for (var i: u32 = 2u; i < {{ num_words }}u; i = i + 1u) {
        var di: i32;
        var ei: i32;
        if (i == top) {
            di = (i32((*d).limbs[i]) << sign_shift) >> sign_shift;
            ei = (i32((*e).limbs[i]) << sign_shift) >> sign_shift;
        } else {
            di = i32((*d).limbs[i]);
            ei = i32((*e).limbs[i]);
        }
        let pi: i32 = i32((*p).limbs[i]);
        let pim1: i32 = i32((*p).limbs[i - 1u]);
        let nd: i32 = u_lo * di + v_lo * ei + u_hi * dp + v_hi * ep + kd_lo * pi + kd_hi * pim1 + cd;
        let ne: i32 = q_lo * di + r_lo * ei + q_hi * dp + r_hi * ep + ke_lo * pi + ke_hi * pim1 + ce;
        cd = nd >> WORD_SIZE;
        ce = ne >> WORD_SIZE;
        (*d).limbs[i - 2u] = u32(nd) & MASK;
        (*e).limbs[i - 2u] = u32(ne) & MASK;
        dp = di;
        ep = ei;
    }
    let p_top: i32 = i32((*p).limbs[top]);
    let nd_top: i32 = u_hi * dp + v_hi * ep + kd_hi * p_top + cd;
    let ne_top: i32 = q_hi * dp + r_hi * ep + ke_hi * p_top + ce;
    (*d).limbs[top - 1u] = u32(nd_top) & MASK;
    (*e).limbs[top - 1u] = u32(ne_top) & MASK;
    (*d).limbs[top] = u32(nd_top >> WORD_SIZE);
    (*e).limbs[top] = u32(ne_top >> WORD_SIZE);
}

// ============================================================================
// Driver helpers — rolling loops.
// ============================================================================

fn byl_is_zero(x: ptr<function, BigInt>) -> bool {
    var a: u32 = 0u;
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        a = a | (*x).limbs[i];
    }
    return a == 0u;
}

fn byl_neg_inplace(x: ptr<function, BigInt>) {
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        (*x).limbs[i] = u32(-i32((*x).limbs[i]));
    }
    byl_normalise(x);
}

fn byl_add_p_inplace(x: ptr<function, BigInt>, p: ptr<function, BigInt>) {
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        (*x).limbs[i] = u32(i32((*x).limbs[i]) + i32((*p).limbs[i]));
    }
    byl_normalise(x);
}

fn byl_sub_p_inplace(x: ptr<function, BigInt>, p: ptr<function, BigInt>) {
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        (*x).limbs[i] = u32(i32((*x).limbs[i]) - i32((*p).limbs[i]));
    }
    byl_normalise(x);
}

fn byl_reduce_to_canonical(x: ptr<function, BigInt>, p: ptr<function, BigInt>) {
    byl_normalise(x);
    var done: bool = false;
    for (var it: u32 = 0u; it < BYL_RTC_MAX_ITERS; it = it + 1u) {
        if (done) { continue; }
        if (bigint_is_neg_2c(x)) {
            byl_add_p_inplace(x, p);
        } else if (bigint_gte(x, p)) {
            byl_sub_p_inplace(x, p);
        } else {
            done = true;
        }
    }
}

// ============================================================================
// fr_inv_by_loop: Bernstein-Yang safegcd inverse driver. BATCH=26,
// NUM_OUTER=29 — identical structure to fr_inv_by_a, register-minimal
// rolling apply_matrix. Returns the Montgomery-form inverse of `a`; assumes
// `a` nonzero (the caller / batch-inverse prefix product guarantees this).
// ============================================================================
fn fr_inv_by_loop(a: BigInt) -> BigInt {
    var p_loc: BigInt = get_p();
    var f: BigInt = get_p();
    var g: BigInt = a;

    var d: BigInt;
    var e: BigInt;
    for (var k: u32 = 0u; k < {{ num_words }}u; k = k + 1u) {
        d.limbs[k] = 0u;
        e.limbs[k] = 0u;
    }
    e.limbs[0] = 1u;

    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        let f_lo: vec2<u32> = byl_low_u64(&f);
        let g_lo: vec2<u32> = byl_low_u64(&g);
        let m: BylMat = byl_divsteps(&delta, f_lo, g_lo);
        byl_apply_matrix_fg(m, &f, &g);
        byl_apply_matrix_de(m, &d, &e, &p_loc);
        if (((iter + 1u) % BYL_REDUCE_INTERVAL) == 0u) {
            byl_reduce_to_canonical(&d, &p_loc);
            byl_reduce_to_canonical(&e, &p_loc);
        }
        if (byl_is_zero(&g)) {
            done = true;
        }
    }

    byl_reduce_to_canonical(&d, &p_loc);
    if (bigint_is_neg_2c(&f)) {
        byl_neg_inplace(&d);
        byl_reduce_to_canonical(&d, &p_loc);
    }

    var inv_native: BigInt = d;
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&inv_native, &r_cubed);
}
