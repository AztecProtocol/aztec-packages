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
    for (var i: u32 = 0u; i < BYL_BATCH; i = i + 1u) {
        if (u64_low_bit(g_lo) != 0u) {
            if (d > 0) {
                let nf: vec2<u32> = g_lo;
                let diff: vec2<u32> = u64_sub(g_lo, f_lo);
                let ng: vec2<u32> = u64_shr1(diff);
                let nu: i32 = q << 1u;
                let nv: i32 = r << 1u;
                let nq: i32 = q - u;
                let nr: i32 = r - v;
                f_lo = nf;
                g_lo = ng;
                u = nu;
                v = nv;
                q = nq;
                r = nr;
                d = 1 - d;
            } else {
                let sum: vec2<u32> = u64_add(g_lo, f_lo);
                g_lo = u64_shr1(sum);
                q = q + u;
                r = r + v;
                u = u << 1u;
                v = v << 1u;
                d = d + 1;
            }
        } else {
            g_lo = u64_shr1(g_lo);
            u = u << 1u;
            v = v << 1u;
            d = d + 1;
        }
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


// ============================================================================
// byl_divsteps_bl: BRANCHLESS variant of byl_divsteps. Identical 2x2
// transition matrix and (delta, f, g) recurrence, with every per-iteration
// branch replaced by arithmetic masks, so the inner loop has uniform control
// flow across a wave/subgroup — no data-dependent divergence. This is the
// candidate fix for the divstep cost on Adreno (Galaxy S25), where the branchy
// byl_divsteps serialises lanes that take different cases.
//
// Masks (all-ones / zero i32):
//   og  = -1 iff g is odd        (drives "g odd" case)
//   sw  = -1 iff (g odd && d>0)  (drives the swap case)
// Branchy cases recovered exactly:
//   swap (sw):       f'=g; g'=(g-f)/2; u'=2q; v'=2r; q'=q-u; r'=r-v; d'=1-d
//   g odd, !swap:    f'=f; g'=(g+f)/2; u'=2u; v'=2v; q'=q+u; r'=r+v; d'=d+1
//   g even:          f'=f; g'=g/2;     u'=2u; v'=2v; q'=q;   r'=r;   d'=d+1
// ============================================================================
fn byl_divsteps_bl(delta: ptr<function, i32>, f_lo_in: vec2<u32>, g_lo_in: vec2<u32>) -> BylMat {
    var f_lo: vec2<u32> = f_lo_in;
    var g_lo: vec2<u32> = g_lo_in;
    var u: i32 = 1;
    var v: i32 = 0;
    var q: i32 = 0;
    var r: i32 = 1;
    var d: i32 = *delta;
    for (var i: u32 = 0u; i < BYL_BATCH; i = i + 1u) {
        let og: i32 = select(0, -1, (g_lo.x & 1u) != 0u);
        let sw: i32 = og & select(0, -1, d > 0);
        let swu: u32 = u32(sw);

        // g' = (g + addend) >> 1, addend = sw ? -f : (og & f). The summed
        // value is always even (f is odd), so the logical >>1 drops a 0.
        let neg_f: vec2<u32> = u64_sub(vec2<u32>(0u, 0u), f_lo);
        let addend: vec2<u32> = vec2<u32>(
            (neg_f.x & swu) | (f_lo.x & u32(og) & ~swu),
            (neg_f.y & swu) | (f_lo.y & u32(og) & ~swu),
        );
        let g_new: vec2<u32> = u64_shr1(u64_add(g_lo, addend));

        // f' = sw ? g : f (old g).
        let f_new: vec2<u32> = vec2<u32>(
            (g_lo.x & swu) | (f_lo.x & ~swu),
            (g_lo.y & swu) | (f_lo.y & ~swu),
        );

        // Matrix update. nu = 2*(sw?q:u); nv = 2*(sw?r:v);
        // nq = q + (sw ? -u : og&u); nr = r + (sw ? -v : og&v).
        let nu: i32 = ((q & sw) | (u & ~sw)) << 1u;
        let nv: i32 = ((r & sw) | (v & ~sw)) << 1u;
        let nq: i32 = q + ((sw & (-u)) | (~sw & (og & u)));
        let nr: i32 = r + ((sw & (-v)) | (~sw & (og & v)));

        // d' = (sw ? -d : d) + 1.
        let nd: i32 = ((d ^ sw) - sw) + 1;

        f_lo = f_new;
        g_lo = g_new;
        u = nu;
        v = nv;
        q = nq;
        r = nr;
        d = nd;
    }
    *delta = d;
    return BylMat(u, v, q, r);
}

// fr_inv_by_loop_bl: fr_inv_by_loop with the branchy divsteps swapped for the
// branchless byl_divsteps_bl. Same contract, must produce identical inverses
// (the bench validates the result against R / R^-1).
fn fr_inv_by_loop_bl(a: BigInt) -> BigInt {
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
        let m: BylMat = byl_divsteps_bl(&delta, f_lo, g_lo);
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

// ============================================================================
// ATTRIBUTION WRAPPERS — split the loop-inverse cost into its two heavy
// components. Each runs BYL_NUM_OUTER calls of ONE component (the same count
// the real driver makes), so (divsteps_only + applymatrix_only) ~= the full
// loop inverse minus driver/reduce/final-mont overhead. They do NOT compute a
// real inverse; their output is a DCE-defeating fold and must not be validated.
// ============================================================================

// Cost of the BYL_NUM_OUTER branchy divsteps calls in isolation. f_lo/g_lo are
// fixed (from `a`); only `delta` carries across calls (loop-carried, so the
// calls can't be hoisted/CSE'd), and the matrix is XOR-folded so nothing dies.
fn fr_inv_byl_divsteps_only(a: BigInt) -> BigInt {
    var f: BigInt = get_p();
    var g: BigInt = a;
    let f_lo: vec2<u32> = byl_low_u64(&f);
    let g_lo: vec2<u32> = byl_low_u64(&g);
    var delta: i32 = 1;
    var acc: u32 = 0u;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        let m: BylMat = byl_divsteps(&delta, f_lo, g_lo);
        acc = acc ^ u32(m.u) ^ u32(m.v) ^ u32(m.q) ^ u32(m.r) ^ u32(delta);
    }
    var out: BigInt = f;
    out.limbs[0] = acc & MASK;
    return out;
}

// Same isolation, branchless divsteps.
fn fr_inv_byl_divsteps_bl_only(a: BigInt) -> BigInt {
    var f: BigInt = get_p();
    var g: BigInt = a;
    let f_lo: vec2<u32> = byl_low_u64(&f);
    let g_lo: vec2<u32> = byl_low_u64(&g);
    var delta: i32 = 1;
    var acc: u32 = 0u;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        let m: BylMat = byl_divsteps_bl(&delta, f_lo, g_lo);
        acc = acc ^ u32(m.u) ^ u32(m.v) ^ u32(m.q) ^ u32(m.r) ^ u32(delta);
    }
    var out: BigInt = f;
    out.limbs[0] = acc & MASK;
    return out;
}

// Cost of the BYL_NUM_OUTER (apply_matrix_fg + apply_matrix_de) pairs in
// isolation. apply_matrix has no data-dependent control flow, so its cost is
// independent of the actual f/g/d/e values — the fixed matrix `m` (entries in
// [-2^25, 2^25), built from `a`, well within the 2^26 bound) keeps the limbs
// bounded across iterations with no i32 overflow.
fn fr_inv_byl_applymatrix_only(a: BigInt) -> BigInt {
    var p_loc: BigInt = get_p();
    var f: BigInt = get_p();
    var g: BigInt = a;
    var d: BigInt;
    var e: BigInt;
    for (var k: u32 = 0u; k < {{ num_words }}u; k = k + 1u) { d.limbs[k] = 0u; e.limbs[k] = 0u; }
    e.limbs[0] = 1u;

    let m0: i32 = (i32(a.limbs[0] & MASK) | (i32(a.limbs[1] & MASK) << WORD_SIZE)) - 33554432;
    let m1: i32 = (i32(a.limbs[2] & MASK) | (i32(a.limbs[3] & MASK) << WORD_SIZE)) - 33554432;
    let m2: i32 = (i32(a.limbs[4] & MASK) | (i32(a.limbs[5] & MASK) << WORD_SIZE)) - 33554432;
    let m3: i32 = (i32(a.limbs[6] & MASK) | (i32(a.limbs[7] & MASK) << WORD_SIZE)) - 33554432;
    let m: BylMat = BylMat(m0, m1, m2, m3);

    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        byl_apply_matrix_fg(m, &f, &g);
        byl_apply_matrix_de(m, &d, &e, &p_loc);
    }

    var out: BigInt = d;
    out.limbs[0] = out.limbs[0] ^ f.limbs[0] ^ g.limbs[0] ^ e.limbs[0];
    return out;
}


// ============================================================================
// fr_inv_by_win: STATIC-INDEX unrolled-window apply_matrix. Identical math to
// byl_apply_matrix_fg/de, but every limb access is a compile-time constant so
// the BigInt arrays stay register-resident (dynamic loop-variable indexing
// would force them into private/scratch memory on Adreno). Generated by
// /tmp/gen_win.mjs from the rolling-loop recurrence. BN254 only (20 limbs).
// ============================================================================
fn byl_apply_matrix_fg_win(m: BylMat, f: ptr<function, BigInt>, g: ptr<function, BigInt>) {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> WORD_SIZE;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> WORD_SIZE;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> WORD_SIZE;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> WORD_SIZE;
    let ss: u32 = 32u - WORD_SIZE;
    let f0: i32 = i32((*f).limbs[0u]); let g0: i32 = i32((*g).limbs[0u]);
    let f1: i32 = i32((*f).limbs[1u]); let g1: i32 = i32((*g).limbs[1u]);
    let f2: i32 = i32((*f).limbs[2u]); let g2: i32 = i32((*g).limbs[2u]);
    let f3: i32 = i32((*f).limbs[3u]); let g3: i32 = i32((*g).limbs[3u]);
    let f4: i32 = i32((*f).limbs[4u]); let g4: i32 = i32((*g).limbs[4u]);
    let f5: i32 = i32((*f).limbs[5u]); let g5: i32 = i32((*g).limbs[5u]);
    let f6: i32 = i32((*f).limbs[6u]); let g6: i32 = i32((*g).limbs[6u]);
    let f7: i32 = i32((*f).limbs[7u]); let g7: i32 = i32((*g).limbs[7u]);
    let f8: i32 = i32((*f).limbs[8u]); let g8: i32 = i32((*g).limbs[8u]);
    let f9: i32 = i32((*f).limbs[9u]); let g9: i32 = i32((*g).limbs[9u]);
    let f10: i32 = i32((*f).limbs[10u]); let g10: i32 = i32((*g).limbs[10u]);
    let f11: i32 = i32((*f).limbs[11u]); let g11: i32 = i32((*g).limbs[11u]);
    let f12: i32 = i32((*f).limbs[12u]); let g12: i32 = i32((*g).limbs[12u]);
    let f13: i32 = i32((*f).limbs[13u]); let g13: i32 = i32((*g).limbs[13u]);
    let f14: i32 = i32((*f).limbs[14u]); let g14: i32 = i32((*g).limbs[14u]);
    let f15: i32 = i32((*f).limbs[15u]); let g15: i32 = i32((*g).limbs[15u]);
    let f16: i32 = i32((*f).limbs[16u]); let g16: i32 = i32((*g).limbs[16u]);
    let f17: i32 = i32((*f).limbs[17u]); let g17: i32 = i32((*g).limbs[17u]);
    let f18: i32 = i32((*f).limbs[18u]); let g18: i32 = i32((*g).limbs[18u]);
    let f19: i32 = (i32((*f).limbs[19u]) << ss) >> ss; let g19: i32 = (i32((*g).limbs[19u]) << ss) >> ss;
    let nf0: i32 = u_lo*f0 + v_lo*g0; let ng0: i32 = q_lo*f0 + r_lo*g0;
    var cf: i32 = nf0 >> WORD_SIZE; var cg: i32 = ng0 >> WORD_SIZE;
    let nf1: i32 = u_lo*f1 + v_lo*g1 + u_hi*f0 + v_hi*g0 + cf; let ng1: i32 = q_lo*f1 + r_lo*g1 + q_hi*f0 + r_hi*g0 + cg;
    cf = nf1 >> WORD_SIZE; cg = ng1 >> WORD_SIZE;
    let nf2: i32 = u_lo*f2 + v_lo*g2 + u_hi*f1 + v_hi*g1 + cf; let ng2: i32 = q_lo*f2 + r_lo*g2 + q_hi*f1 + r_hi*g1 + cg;
    let of0: u32 = u32(nf2) & MASK; let og0: u32 = u32(ng2) & MASK; cf = nf2 >> WORD_SIZE; cg = ng2 >> WORD_SIZE;
    let nf3: i32 = u_lo*f3 + v_lo*g3 + u_hi*f2 + v_hi*g2 + cf; let ng3: i32 = q_lo*f3 + r_lo*g3 + q_hi*f2 + r_hi*g2 + cg;
    let of1: u32 = u32(nf3) & MASK; let og1: u32 = u32(ng3) & MASK; cf = nf3 >> WORD_SIZE; cg = ng3 >> WORD_SIZE;
    let nf4: i32 = u_lo*f4 + v_lo*g4 + u_hi*f3 + v_hi*g3 + cf; let ng4: i32 = q_lo*f4 + r_lo*g4 + q_hi*f3 + r_hi*g3 + cg;
    let of2: u32 = u32(nf4) & MASK; let og2: u32 = u32(ng4) & MASK; cf = nf4 >> WORD_SIZE; cg = ng4 >> WORD_SIZE;
    let nf5: i32 = u_lo*f5 + v_lo*g5 + u_hi*f4 + v_hi*g4 + cf; let ng5: i32 = q_lo*f5 + r_lo*g5 + q_hi*f4 + r_hi*g4 + cg;
    let of3: u32 = u32(nf5) & MASK; let og3: u32 = u32(ng5) & MASK; cf = nf5 >> WORD_SIZE; cg = ng5 >> WORD_SIZE;
    let nf6: i32 = u_lo*f6 + v_lo*g6 + u_hi*f5 + v_hi*g5 + cf; let ng6: i32 = q_lo*f6 + r_lo*g6 + q_hi*f5 + r_hi*g5 + cg;
    let of4: u32 = u32(nf6) & MASK; let og4: u32 = u32(ng6) & MASK; cf = nf6 >> WORD_SIZE; cg = ng6 >> WORD_SIZE;
    let nf7: i32 = u_lo*f7 + v_lo*g7 + u_hi*f6 + v_hi*g6 + cf; let ng7: i32 = q_lo*f7 + r_lo*g7 + q_hi*f6 + r_hi*g6 + cg;
    let of5: u32 = u32(nf7) & MASK; let og5: u32 = u32(ng7) & MASK; cf = nf7 >> WORD_SIZE; cg = ng7 >> WORD_SIZE;
    let nf8: i32 = u_lo*f8 + v_lo*g8 + u_hi*f7 + v_hi*g7 + cf; let ng8: i32 = q_lo*f8 + r_lo*g8 + q_hi*f7 + r_hi*g7 + cg;
    let of6: u32 = u32(nf8) & MASK; let og6: u32 = u32(ng8) & MASK; cf = nf8 >> WORD_SIZE; cg = ng8 >> WORD_SIZE;
    let nf9: i32 = u_lo*f9 + v_lo*g9 + u_hi*f8 + v_hi*g8 + cf; let ng9: i32 = q_lo*f9 + r_lo*g9 + q_hi*f8 + r_hi*g8 + cg;
    let of7: u32 = u32(nf9) & MASK; let og7: u32 = u32(ng9) & MASK; cf = nf9 >> WORD_SIZE; cg = ng9 >> WORD_SIZE;
    let nf10: i32 = u_lo*f10 + v_lo*g10 + u_hi*f9 + v_hi*g9 + cf; let ng10: i32 = q_lo*f10 + r_lo*g10 + q_hi*f9 + r_hi*g9 + cg;
    let of8: u32 = u32(nf10) & MASK; let og8: u32 = u32(ng10) & MASK; cf = nf10 >> WORD_SIZE; cg = ng10 >> WORD_SIZE;
    let nf11: i32 = u_lo*f11 + v_lo*g11 + u_hi*f10 + v_hi*g10 + cf; let ng11: i32 = q_lo*f11 + r_lo*g11 + q_hi*f10 + r_hi*g10 + cg;
    let of9: u32 = u32(nf11) & MASK; let og9: u32 = u32(ng11) & MASK; cf = nf11 >> WORD_SIZE; cg = ng11 >> WORD_SIZE;
    let nf12: i32 = u_lo*f12 + v_lo*g12 + u_hi*f11 + v_hi*g11 + cf; let ng12: i32 = q_lo*f12 + r_lo*g12 + q_hi*f11 + r_hi*g11 + cg;
    let of10: u32 = u32(nf12) & MASK; let og10: u32 = u32(ng12) & MASK; cf = nf12 >> WORD_SIZE; cg = ng12 >> WORD_SIZE;
    let nf13: i32 = u_lo*f13 + v_lo*g13 + u_hi*f12 + v_hi*g12 + cf; let ng13: i32 = q_lo*f13 + r_lo*g13 + q_hi*f12 + r_hi*g12 + cg;
    let of11: u32 = u32(nf13) & MASK; let og11: u32 = u32(ng13) & MASK; cf = nf13 >> WORD_SIZE; cg = ng13 >> WORD_SIZE;
    let nf14: i32 = u_lo*f14 + v_lo*g14 + u_hi*f13 + v_hi*g13 + cf; let ng14: i32 = q_lo*f14 + r_lo*g14 + q_hi*f13 + r_hi*g13 + cg;
    let of12: u32 = u32(nf14) & MASK; let og12: u32 = u32(ng14) & MASK; cf = nf14 >> WORD_SIZE; cg = ng14 >> WORD_SIZE;
    let nf15: i32 = u_lo*f15 + v_lo*g15 + u_hi*f14 + v_hi*g14 + cf; let ng15: i32 = q_lo*f15 + r_lo*g15 + q_hi*f14 + r_hi*g14 + cg;
    let of13: u32 = u32(nf15) & MASK; let og13: u32 = u32(ng15) & MASK; cf = nf15 >> WORD_SIZE; cg = ng15 >> WORD_SIZE;
    let nf16: i32 = u_lo*f16 + v_lo*g16 + u_hi*f15 + v_hi*g15 + cf; let ng16: i32 = q_lo*f16 + r_lo*g16 + q_hi*f15 + r_hi*g15 + cg;
    let of14: u32 = u32(nf16) & MASK; let og14: u32 = u32(ng16) & MASK; cf = nf16 >> WORD_SIZE; cg = ng16 >> WORD_SIZE;
    let nf17: i32 = u_lo*f17 + v_lo*g17 + u_hi*f16 + v_hi*g16 + cf; let ng17: i32 = q_lo*f17 + r_lo*g17 + q_hi*f16 + r_hi*g16 + cg;
    let of15: u32 = u32(nf17) & MASK; let og15: u32 = u32(ng17) & MASK; cf = nf17 >> WORD_SIZE; cg = ng17 >> WORD_SIZE;
    let nf18: i32 = u_lo*f18 + v_lo*g18 + u_hi*f17 + v_hi*g17 + cf; let ng18: i32 = q_lo*f18 + r_lo*g18 + q_hi*f17 + r_hi*g17 + cg;
    let of16: u32 = u32(nf18) & MASK; let og16: u32 = u32(ng18) & MASK; cf = nf18 >> WORD_SIZE; cg = ng18 >> WORD_SIZE;
    let nf19: i32 = u_lo*f19 + v_lo*g19 + u_hi*f18 + v_hi*g18 + cf; let ng19: i32 = q_lo*f19 + r_lo*g19 + q_hi*f18 + r_hi*g18 + cg;
    let of17: u32 = u32(nf19) & MASK; let og17: u32 = u32(ng19) & MASK; cf = nf19 >> WORD_SIZE; cg = ng19 >> WORD_SIZE;
    let nft: i32 = u_hi*f19 + v_hi*g19 + cf; let ngt: i32 = q_hi*f19 + r_hi*g19 + cg;
    let of18: u32 = u32(nft) & MASK; let of19: u32 = u32(nft >> WORD_SIZE); let og18: u32 = u32(ngt) & MASK; let og19: u32 = u32(ngt >> WORD_SIZE);
    (*f).limbs[0u] = of0; (*g).limbs[0u] = og0;
    (*f).limbs[1u] = of1; (*g).limbs[1u] = og1;
    (*f).limbs[2u] = of2; (*g).limbs[2u] = og2;
    (*f).limbs[3u] = of3; (*g).limbs[3u] = og3;
    (*f).limbs[4u] = of4; (*g).limbs[4u] = og4;
    (*f).limbs[5u] = of5; (*g).limbs[5u] = og5;
    (*f).limbs[6u] = of6; (*g).limbs[6u] = og6;
    (*f).limbs[7u] = of7; (*g).limbs[7u] = og7;
    (*f).limbs[8u] = of8; (*g).limbs[8u] = og8;
    (*f).limbs[9u] = of9; (*g).limbs[9u] = og9;
    (*f).limbs[10u] = of10; (*g).limbs[10u] = og10;
    (*f).limbs[11u] = of11; (*g).limbs[11u] = og11;
    (*f).limbs[12u] = of12; (*g).limbs[12u] = og12;
    (*f).limbs[13u] = of13; (*g).limbs[13u] = og13;
    (*f).limbs[14u] = of14; (*g).limbs[14u] = og14;
    (*f).limbs[15u] = of15; (*g).limbs[15u] = og15;
    (*f).limbs[16u] = of16; (*g).limbs[16u] = og16;
    (*f).limbs[17u] = of17; (*g).limbs[17u] = og17;
    (*f).limbs[18u] = of18; (*g).limbs[18u] = og18;
    (*f).limbs[19u] = of19; (*g).limbs[19u] = og19;
}

fn byl_apply_matrix_de_win(m: BylMat, d: ptr<function, BigInt>, e: ptr<function, BigInt>, p: ptr<function, BigInt>) {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> WORD_SIZE;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> WORD_SIZE;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> WORD_SIZE;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> WORD_SIZE;
    let ss: u32 = 32u - WORD_SIZE;
    let d0: i32 = i32((*d).limbs[0u]); let e0: i32 = i32((*e).limbs[0u]);
    let d1: i32 = i32((*d).limbs[1u]); let e1: i32 = i32((*e).limbs[1u]);
    let d2: i32 = i32((*d).limbs[2u]); let e2: i32 = i32((*e).limbs[2u]);
    let d3: i32 = i32((*d).limbs[3u]); let e3: i32 = i32((*e).limbs[3u]);
    let d4: i32 = i32((*d).limbs[4u]); let e4: i32 = i32((*e).limbs[4u]);
    let d5: i32 = i32((*d).limbs[5u]); let e5: i32 = i32((*e).limbs[5u]);
    let d6: i32 = i32((*d).limbs[6u]); let e6: i32 = i32((*e).limbs[6u]);
    let d7: i32 = i32((*d).limbs[7u]); let e7: i32 = i32((*e).limbs[7u]);
    let d8: i32 = i32((*d).limbs[8u]); let e8: i32 = i32((*e).limbs[8u]);
    let d9: i32 = i32((*d).limbs[9u]); let e9: i32 = i32((*e).limbs[9u]);
    let d10: i32 = i32((*d).limbs[10u]); let e10: i32 = i32((*e).limbs[10u]);
    let d11: i32 = i32((*d).limbs[11u]); let e11: i32 = i32((*e).limbs[11u]);
    let d12: i32 = i32((*d).limbs[12u]); let e12: i32 = i32((*e).limbs[12u]);
    let d13: i32 = i32((*d).limbs[13u]); let e13: i32 = i32((*e).limbs[13u]);
    let d14: i32 = i32((*d).limbs[14u]); let e14: i32 = i32((*e).limbs[14u]);
    let d15: i32 = i32((*d).limbs[15u]); let e15: i32 = i32((*e).limbs[15u]);
    let d16: i32 = i32((*d).limbs[16u]); let e16: i32 = i32((*e).limbs[16u]);
    let d17: i32 = i32((*d).limbs[17u]); let e17: i32 = i32((*e).limbs[17u]);
    let d18: i32 = i32((*d).limbs[18u]); let e18: i32 = i32((*e).limbs[18u]);
    let d19: i32 = (i32((*d).limbs[19u]) << ss) >> ss; let e19: i32 = (i32((*e).limbs[19u]) << ss) >> ss;
    let p0: i32 = i32((*p).limbs[0u]);
    let p1: i32 = i32((*p).limbs[1u]);
    let p2: i32 = i32((*p).limbs[2u]);
    let p3: i32 = i32((*p).limbs[3u]);
    let p4: i32 = i32((*p).limbs[4u]);
    let p5: i32 = i32((*p).limbs[5u]);
    let p6: i32 = i32((*p).limbs[6u]);
    let p7: i32 = i32((*p).limbs[7u]);
    let p8: i32 = i32((*p).limbs[8u]);
    let p9: i32 = i32((*p).limbs[9u]);
    let p10: i32 = i32((*p).limbs[10u]);
    let p11: i32 = i32((*p).limbs[11u]);
    let p12: i32 = i32((*p).limbs[12u]);
    let p13: i32 = i32((*p).limbs[13u]);
    let p14: i32 = i32((*p).limbs[14u]);
    let p15: i32 = i32((*p).limbs[15u]);
    let p16: i32 = i32((*p).limbs[16u]);
    let p17: i32 = i32((*p).limbs[17u]);
    let p18: i32 = i32((*p).limbs[18u]);
    let p19: i32 = i32((*p).limbs[19u]);
    let nd0: i32 = u_lo*d0 + v_lo*e0; let ne0: i32 = q_lo*d0 + r_lo*e0;
    let nd1: i32 = u_lo*d1 + v_lo*e1 + u_hi*d0 + v_hi*e0; let ne1: i32 = q_lo*d1 + r_lo*e1 + q_hi*d0 + r_hi*e0;
    let nd0_low: u32 = u32(nd0) & MASK; let nd1_carry: u32 = u32(nd1 + (nd0 >> WORD_SIZE)) & MASK; let t_d: u32 = (nd0_low | (nd1_carry << WORD_SIZE)) & BYL_MASK_BATCH;
    let ne0_low: u32 = u32(ne0) & MASK; let ne1_carry: u32 = u32(ne1 + (ne0 >> WORD_SIZE)) & MASK; let t_e: u32 = (ne0_low | (ne1_carry << WORD_SIZE)) & BYL_MASK_BATCH;
    let k_d: u32 = (((~t_d + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH; let k_e: u32 = (((~t_e + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let kd_lo: i32 = i32(k_d & MASK); let kd_hi: i32 = i32(k_d >> WORD_SIZE); let ke_lo: i32 = i32(k_e & MASK); let ke_hi: i32 = i32(k_e >> WORD_SIZE);
    var cd: i32 = (nd1 + kd_lo*p1 + kd_hi*p0 + ((nd0 + kd_lo*p0) >> WORD_SIZE)) >> WORD_SIZE;
    var ce: i32 = (ne1 + ke_lo*p1 + ke_hi*p0 + ((ne0 + ke_lo*p0) >> WORD_SIZE)) >> WORD_SIZE;
    let nd2: i32 = u_lo*d2 + v_lo*e2 + u_hi*d1 + v_hi*e1 + kd_lo*p2 + kd_hi*p1 + cd; let ne2: i32 = q_lo*d2 + r_lo*e2 + q_hi*d1 + r_hi*e1 + ke_lo*p2 + ke_hi*p1 + ce;
    let od0: u32 = u32(nd2) & MASK; let oe0: u32 = u32(ne2) & MASK; cd = nd2 >> WORD_SIZE; ce = ne2 >> WORD_SIZE;
    let nd3: i32 = u_lo*d3 + v_lo*e3 + u_hi*d2 + v_hi*e2 + kd_lo*p3 + kd_hi*p2 + cd; let ne3: i32 = q_lo*d3 + r_lo*e3 + q_hi*d2 + r_hi*e2 + ke_lo*p3 + ke_hi*p2 + ce;
    let od1: u32 = u32(nd3) & MASK; let oe1: u32 = u32(ne3) & MASK; cd = nd3 >> WORD_SIZE; ce = ne3 >> WORD_SIZE;
    let nd4: i32 = u_lo*d4 + v_lo*e4 + u_hi*d3 + v_hi*e3 + kd_lo*p4 + kd_hi*p3 + cd; let ne4: i32 = q_lo*d4 + r_lo*e4 + q_hi*d3 + r_hi*e3 + ke_lo*p4 + ke_hi*p3 + ce;
    let od2: u32 = u32(nd4) & MASK; let oe2: u32 = u32(ne4) & MASK; cd = nd4 >> WORD_SIZE; ce = ne4 >> WORD_SIZE;
    let nd5: i32 = u_lo*d5 + v_lo*e5 + u_hi*d4 + v_hi*e4 + kd_lo*p5 + kd_hi*p4 + cd; let ne5: i32 = q_lo*d5 + r_lo*e5 + q_hi*d4 + r_hi*e4 + ke_lo*p5 + ke_hi*p4 + ce;
    let od3: u32 = u32(nd5) & MASK; let oe3: u32 = u32(ne5) & MASK; cd = nd5 >> WORD_SIZE; ce = ne5 >> WORD_SIZE;
    let nd6: i32 = u_lo*d6 + v_lo*e6 + u_hi*d5 + v_hi*e5 + kd_lo*p6 + kd_hi*p5 + cd; let ne6: i32 = q_lo*d6 + r_lo*e6 + q_hi*d5 + r_hi*e5 + ke_lo*p6 + ke_hi*p5 + ce;
    let od4: u32 = u32(nd6) & MASK; let oe4: u32 = u32(ne6) & MASK; cd = nd6 >> WORD_SIZE; ce = ne6 >> WORD_SIZE;
    let nd7: i32 = u_lo*d7 + v_lo*e7 + u_hi*d6 + v_hi*e6 + kd_lo*p7 + kd_hi*p6 + cd; let ne7: i32 = q_lo*d7 + r_lo*e7 + q_hi*d6 + r_hi*e6 + ke_lo*p7 + ke_hi*p6 + ce;
    let od5: u32 = u32(nd7) & MASK; let oe5: u32 = u32(ne7) & MASK; cd = nd7 >> WORD_SIZE; ce = ne7 >> WORD_SIZE;
    let nd8: i32 = u_lo*d8 + v_lo*e8 + u_hi*d7 + v_hi*e7 + kd_lo*p8 + kd_hi*p7 + cd; let ne8: i32 = q_lo*d8 + r_lo*e8 + q_hi*d7 + r_hi*e7 + ke_lo*p8 + ke_hi*p7 + ce;
    let od6: u32 = u32(nd8) & MASK; let oe6: u32 = u32(ne8) & MASK; cd = nd8 >> WORD_SIZE; ce = ne8 >> WORD_SIZE;
    let nd9: i32 = u_lo*d9 + v_lo*e9 + u_hi*d8 + v_hi*e8 + kd_lo*p9 + kd_hi*p8 + cd; let ne9: i32 = q_lo*d9 + r_lo*e9 + q_hi*d8 + r_hi*e8 + ke_lo*p9 + ke_hi*p8 + ce;
    let od7: u32 = u32(nd9) & MASK; let oe7: u32 = u32(ne9) & MASK; cd = nd9 >> WORD_SIZE; ce = ne9 >> WORD_SIZE;
    let nd10: i32 = u_lo*d10 + v_lo*e10 + u_hi*d9 + v_hi*e9 + kd_lo*p10 + kd_hi*p9 + cd; let ne10: i32 = q_lo*d10 + r_lo*e10 + q_hi*d9 + r_hi*e9 + ke_lo*p10 + ke_hi*p9 + ce;
    let od8: u32 = u32(nd10) & MASK; let oe8: u32 = u32(ne10) & MASK; cd = nd10 >> WORD_SIZE; ce = ne10 >> WORD_SIZE;
    let nd11: i32 = u_lo*d11 + v_lo*e11 + u_hi*d10 + v_hi*e10 + kd_lo*p11 + kd_hi*p10 + cd; let ne11: i32 = q_lo*d11 + r_lo*e11 + q_hi*d10 + r_hi*e10 + ke_lo*p11 + ke_hi*p10 + ce;
    let od9: u32 = u32(nd11) & MASK; let oe9: u32 = u32(ne11) & MASK; cd = nd11 >> WORD_SIZE; ce = ne11 >> WORD_SIZE;
    let nd12: i32 = u_lo*d12 + v_lo*e12 + u_hi*d11 + v_hi*e11 + kd_lo*p12 + kd_hi*p11 + cd; let ne12: i32 = q_lo*d12 + r_lo*e12 + q_hi*d11 + r_hi*e11 + ke_lo*p12 + ke_hi*p11 + ce;
    let od10: u32 = u32(nd12) & MASK; let oe10: u32 = u32(ne12) & MASK; cd = nd12 >> WORD_SIZE; ce = ne12 >> WORD_SIZE;
    let nd13: i32 = u_lo*d13 + v_lo*e13 + u_hi*d12 + v_hi*e12 + kd_lo*p13 + kd_hi*p12 + cd; let ne13: i32 = q_lo*d13 + r_lo*e13 + q_hi*d12 + r_hi*e12 + ke_lo*p13 + ke_hi*p12 + ce;
    let od11: u32 = u32(nd13) & MASK; let oe11: u32 = u32(ne13) & MASK; cd = nd13 >> WORD_SIZE; ce = ne13 >> WORD_SIZE;
    let nd14: i32 = u_lo*d14 + v_lo*e14 + u_hi*d13 + v_hi*e13 + kd_lo*p14 + kd_hi*p13 + cd; let ne14: i32 = q_lo*d14 + r_lo*e14 + q_hi*d13 + r_hi*e13 + ke_lo*p14 + ke_hi*p13 + ce;
    let od12: u32 = u32(nd14) & MASK; let oe12: u32 = u32(ne14) & MASK; cd = nd14 >> WORD_SIZE; ce = ne14 >> WORD_SIZE;
    let nd15: i32 = u_lo*d15 + v_lo*e15 + u_hi*d14 + v_hi*e14 + kd_lo*p15 + kd_hi*p14 + cd; let ne15: i32 = q_lo*d15 + r_lo*e15 + q_hi*d14 + r_hi*e14 + ke_lo*p15 + ke_hi*p14 + ce;
    let od13: u32 = u32(nd15) & MASK; let oe13: u32 = u32(ne15) & MASK; cd = nd15 >> WORD_SIZE; ce = ne15 >> WORD_SIZE;
    let nd16: i32 = u_lo*d16 + v_lo*e16 + u_hi*d15 + v_hi*e15 + kd_lo*p16 + kd_hi*p15 + cd; let ne16: i32 = q_lo*d16 + r_lo*e16 + q_hi*d15 + r_hi*e15 + ke_lo*p16 + ke_hi*p15 + ce;
    let od14: u32 = u32(nd16) & MASK; let oe14: u32 = u32(ne16) & MASK; cd = nd16 >> WORD_SIZE; ce = ne16 >> WORD_SIZE;
    let nd17: i32 = u_lo*d17 + v_lo*e17 + u_hi*d16 + v_hi*e16 + kd_lo*p17 + kd_hi*p16 + cd; let ne17: i32 = q_lo*d17 + r_lo*e17 + q_hi*d16 + r_hi*e16 + ke_lo*p17 + ke_hi*p16 + ce;
    let od15: u32 = u32(nd17) & MASK; let oe15: u32 = u32(ne17) & MASK; cd = nd17 >> WORD_SIZE; ce = ne17 >> WORD_SIZE;
    let nd18: i32 = u_lo*d18 + v_lo*e18 + u_hi*d17 + v_hi*e17 + kd_lo*p18 + kd_hi*p17 + cd; let ne18: i32 = q_lo*d18 + r_lo*e18 + q_hi*d17 + r_hi*e17 + ke_lo*p18 + ke_hi*p17 + ce;
    let od16: u32 = u32(nd18) & MASK; let oe16: u32 = u32(ne18) & MASK; cd = nd18 >> WORD_SIZE; ce = ne18 >> WORD_SIZE;
    let nd19: i32 = u_lo*d19 + v_lo*e19 + u_hi*d18 + v_hi*e18 + kd_lo*p19 + kd_hi*p18 + cd; let ne19: i32 = q_lo*d19 + r_lo*e19 + q_hi*d18 + r_hi*e18 + ke_lo*p19 + ke_hi*p18 + ce;
    let od17: u32 = u32(nd19) & MASK; let oe17: u32 = u32(ne19) & MASK; cd = nd19 >> WORD_SIZE; ce = ne19 >> WORD_SIZE;
    let ndt: i32 = u_hi*d19 + v_hi*e19 + kd_hi*p19 + cd; let net: i32 = q_hi*d19 + r_hi*e19 + ke_hi*p19 + ce;
    let od18: u32 = u32(ndt) & MASK; let od19: u32 = u32(ndt >> WORD_SIZE); let oe18: u32 = u32(net) & MASK; let oe19: u32 = u32(net >> WORD_SIZE);
    (*d).limbs[0u] = od0; (*e).limbs[0u] = oe0;
    (*d).limbs[1u] = od1; (*e).limbs[1u] = oe1;
    (*d).limbs[2u] = od2; (*e).limbs[2u] = oe2;
    (*d).limbs[3u] = od3; (*e).limbs[3u] = oe3;
    (*d).limbs[4u] = od4; (*e).limbs[4u] = oe4;
    (*d).limbs[5u] = od5; (*e).limbs[5u] = oe5;
    (*d).limbs[6u] = od6; (*e).limbs[6u] = oe6;
    (*d).limbs[7u] = od7; (*e).limbs[7u] = oe7;
    (*d).limbs[8u] = od8; (*e).limbs[8u] = oe8;
    (*d).limbs[9u] = od9; (*e).limbs[9u] = oe9;
    (*d).limbs[10u] = od10; (*e).limbs[10u] = oe10;
    (*d).limbs[11u] = od11; (*e).limbs[11u] = oe11;
    (*d).limbs[12u] = od12; (*e).limbs[12u] = oe12;
    (*d).limbs[13u] = od13; (*e).limbs[13u] = oe13;
    (*d).limbs[14u] = od14; (*e).limbs[14u] = oe14;
    (*d).limbs[15u] = od15; (*e).limbs[15u] = oe15;
    (*d).limbs[16u] = od16; (*e).limbs[16u] = oe16;
    (*d).limbs[17u] = od17; (*e).limbs[17u] = oe17;
    (*d).limbs[18u] = od18; (*e).limbs[18u] = oe18;
    (*d).limbs[19u] = od19; (*e).limbs[19u] = oe19;
}

fn fr_inv_by_win(a: BigInt) -> BigInt {
    var p_loc: BigInt = get_p();
    var f: BigInt = get_p();
    var g: BigInt = a;
    var d: BigInt;
    var e: BigInt;
    for (var k: u32 = 0u; k < {{ num_words }}u; k = k + 1u) { d.limbs[k] = 0u; e.limbs[k] = 0u; }
    e.limbs[0] = 1u;
    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        let f_lo: vec2<u32> = byl_low_u64(&f);
        let g_lo: vec2<u32> = byl_low_u64(&g);
        let m: BylMat = byl_divsteps(&delta, f_lo, g_lo);
        byl_apply_matrix_fg_win(m, &f, &g);
        byl_apply_matrix_de_win(m, &d, &e, &p_loc);
        if (((iter + 1u) % BYL_REDUCE_INTERVAL) == 0u) {
            byl_reduce_to_canonical(&d, &p_loc);
            byl_reduce_to_canonical(&e, &p_loc);
        }
        if (byl_is_zero(&g)) { done = true; }
    }
    byl_reduce_to_canonical(&d, &p_loc);
    if (bigint_is_neg_2c(&f)) { byl_neg_inplace(&d); byl_reduce_to_canonical(&d, &p_loc); }
    var inv_native: BigInt = d;
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&inv_native, &r_cubed);
}


// ===========================================================================
// vec4-packed safegcd inverse (fr_inv_by_loop_v4). GENERATED by /tmp/gen_v4.mjs
// from the validated rolling recurrence. BN254 only (20 x 13-bit limbs).
// B5 holds the 20 limbs as 5 vec4<u32> so all state stays in the Adreno's
// vec4-native register file (no private-memory spill from dynamic indexing).
// ===========================================================================
struct B5 { w0: vec4<u32>, w1: vec4<u32>, w2: vec4<u32>, w3: vec4<u32>, w4: vec4<u32> }
struct B5Pair { a: B5, b: B5 }

fn b5_from_bigint(x: BigInt) -> B5 {
    var o: B5;
    o.w0 = vec4<u32>(x.limbs[0u], x.limbs[1u], x.limbs[2u], x.limbs[3u]);
    o.w1 = vec4<u32>(x.limbs[4u], x.limbs[5u], x.limbs[6u], x.limbs[7u]);
    o.w2 = vec4<u32>(x.limbs[8u], x.limbs[9u], x.limbs[10u], x.limbs[11u]);
    o.w3 = vec4<u32>(x.limbs[12u], x.limbs[13u], x.limbs[14u], x.limbs[15u]);
    o.w4 = vec4<u32>(x.limbs[16u], x.limbs[17u], x.limbs[18u], x.limbs[19u]);
    return o;
}

fn b5_to_bigint(x: B5) -> BigInt {
    var o: BigInt;
    o.limbs[0u] = x.w0.x;
    o.limbs[1u] = x.w0.y;
    o.limbs[2u] = x.w0.z;
    o.limbs[3u] = x.w0.w;
    o.limbs[4u] = x.w1.x;
    o.limbs[5u] = x.w1.y;
    o.limbs[6u] = x.w1.z;
    o.limbs[7u] = x.w1.w;
    o.limbs[8u] = x.w2.x;
    o.limbs[9u] = x.w2.y;
    o.limbs[10u] = x.w2.z;
    o.limbs[11u] = x.w2.w;
    o.limbs[12u] = x.w3.x;
    o.limbs[13u] = x.w3.y;
    o.limbs[14u] = x.w3.z;
    o.limbs[15u] = x.w3.w;
    o.limbs[16u] = x.w4.x;
    o.limbs[17u] = x.w4.y;
    o.limbs[18u] = x.w4.z;
    o.limbs[19u] = x.w4.w;
    return o;
}

fn b5_get_p() -> B5 { return b5_from_bigint(get_p()); }

fn b5_low_u64(x: B5) -> vec2<u32> {
    let l0: u32 = x.w0.x & MASK;
    let l1: u32 = x.w0.y & MASK;
    let l2: u32 = x.w0.z & MASK;
    let l3: u32 = x.w0.w & MASK;
    let l4: u32 = x.w1.x & MASK;
    let lo32: u32 = l0 | (l1 << 13u) | (l2 << 26u);
    let hi32: u32 = (l2 >> 6u) | (l3 << 7u) | (l4 << 20u);
    return vec2<u32>(lo32, hi32);
}

fn b5_is_zero(x: B5) -> bool {
    let acc = x.w0 | x.w1 | x.w2 | x.w3 | x.w4;
    return (acc.x | acc.y | acc.z | acc.w) == 0u;
}

fn b5_is_neg_2c(x: B5) -> bool { return ((x.w4.w >> 12u) & 1u) == 1u; }

fn b5_normalise(x: B5) -> B5 {
    var o: B5;
    var c: i32 = 0;
    { let v: i32 = i32(x.w0.x) + c; o.w0.x = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w0.y) + c; o.w0.y = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w0.z) + c; o.w0.z = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w0.w) + c; o.w0.w = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w1.x) + c; o.w1.x = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w1.y) + c; o.w1.y = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w1.z) + c; o.w1.z = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w1.w) + c; o.w1.w = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w2.x) + c; o.w2.x = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w2.y) + c; o.w2.y = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w2.z) + c; o.w2.z = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w2.w) + c; o.w2.w = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w3.x) + c; o.w3.x = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w3.y) + c; o.w3.y = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w3.z) + c; o.w3.z = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w3.w) + c; o.w3.w = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w4.x) + c; o.w4.x = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w4.y) + c; o.w4.y = u32(v) & MASK; c = v >> 13u; }
    { let v: i32 = i32(x.w4.z) + c; o.w4.z = u32(v) & MASK; c = v >> 13u; }
    o.w4.w = u32(i32(x.w4.w) + c) & MASK;
    return o;
}

fn b5_add_p(x: B5, p: B5) -> B5 {
    var s: B5;
    s.w0.x = u32(i32(x.w0.x) + i32(p.w0.x));
    s.w0.y = u32(i32(x.w0.y) + i32(p.w0.y));
    s.w0.z = u32(i32(x.w0.z) + i32(p.w0.z));
    s.w0.w = u32(i32(x.w0.w) + i32(p.w0.w));
    s.w1.x = u32(i32(x.w1.x) + i32(p.w1.x));
    s.w1.y = u32(i32(x.w1.y) + i32(p.w1.y));
    s.w1.z = u32(i32(x.w1.z) + i32(p.w1.z));
    s.w1.w = u32(i32(x.w1.w) + i32(p.w1.w));
    s.w2.x = u32(i32(x.w2.x) + i32(p.w2.x));
    s.w2.y = u32(i32(x.w2.y) + i32(p.w2.y));
    s.w2.z = u32(i32(x.w2.z) + i32(p.w2.z));
    s.w2.w = u32(i32(x.w2.w) + i32(p.w2.w));
    s.w3.x = u32(i32(x.w3.x) + i32(p.w3.x));
    s.w3.y = u32(i32(x.w3.y) + i32(p.w3.y));
    s.w3.z = u32(i32(x.w3.z) + i32(p.w3.z));
    s.w3.w = u32(i32(x.w3.w) + i32(p.w3.w));
    s.w4.x = u32(i32(x.w4.x) + i32(p.w4.x));
    s.w4.y = u32(i32(x.w4.y) + i32(p.w4.y));
    s.w4.z = u32(i32(x.w4.z) + i32(p.w4.z));
    s.w4.w = u32(i32(x.w4.w) + i32(p.w4.w));
    return b5_normalise(s);
}

fn b5_sub_p(x: B5, p: B5) -> B5 {
    var s: B5;
    s.w0.x = u32(i32(x.w0.x) - i32(p.w0.x));
    s.w0.y = u32(i32(x.w0.y) - i32(p.w0.y));
    s.w0.z = u32(i32(x.w0.z) - i32(p.w0.z));
    s.w0.w = u32(i32(x.w0.w) - i32(p.w0.w));
    s.w1.x = u32(i32(x.w1.x) - i32(p.w1.x));
    s.w1.y = u32(i32(x.w1.y) - i32(p.w1.y));
    s.w1.z = u32(i32(x.w1.z) - i32(p.w1.z));
    s.w1.w = u32(i32(x.w1.w) - i32(p.w1.w));
    s.w2.x = u32(i32(x.w2.x) - i32(p.w2.x));
    s.w2.y = u32(i32(x.w2.y) - i32(p.w2.y));
    s.w2.z = u32(i32(x.w2.z) - i32(p.w2.z));
    s.w2.w = u32(i32(x.w2.w) - i32(p.w2.w));
    s.w3.x = u32(i32(x.w3.x) - i32(p.w3.x));
    s.w3.y = u32(i32(x.w3.y) - i32(p.w3.y));
    s.w3.z = u32(i32(x.w3.z) - i32(p.w3.z));
    s.w3.w = u32(i32(x.w3.w) - i32(p.w3.w));
    s.w4.x = u32(i32(x.w4.x) - i32(p.w4.x));
    s.w4.y = u32(i32(x.w4.y) - i32(p.w4.y));
    s.w4.z = u32(i32(x.w4.z) - i32(p.w4.z));
    s.w4.w = u32(i32(x.w4.w) - i32(p.w4.w));
    return b5_normalise(s);
}

fn b5_gte(x: B5, p: B5) -> bool {
    if (x.w4.w > p.w4.w) { return true; } if (x.w4.w < p.w4.w) { return false; }
    if (x.w4.z > p.w4.z) { return true; } if (x.w4.z < p.w4.z) { return false; }
    if (x.w4.y > p.w4.y) { return true; } if (x.w4.y < p.w4.y) { return false; }
    if (x.w4.x > p.w4.x) { return true; } if (x.w4.x < p.w4.x) { return false; }
    if (x.w3.w > p.w3.w) { return true; } if (x.w3.w < p.w3.w) { return false; }
    if (x.w3.z > p.w3.z) { return true; } if (x.w3.z < p.w3.z) { return false; }
    if (x.w3.y > p.w3.y) { return true; } if (x.w3.y < p.w3.y) { return false; }
    if (x.w3.x > p.w3.x) { return true; } if (x.w3.x < p.w3.x) { return false; }
    if (x.w2.w > p.w2.w) { return true; } if (x.w2.w < p.w2.w) { return false; }
    if (x.w2.z > p.w2.z) { return true; } if (x.w2.z < p.w2.z) { return false; }
    if (x.w2.y > p.w2.y) { return true; } if (x.w2.y < p.w2.y) { return false; }
    if (x.w2.x > p.w2.x) { return true; } if (x.w2.x < p.w2.x) { return false; }
    if (x.w1.w > p.w1.w) { return true; } if (x.w1.w < p.w1.w) { return false; }
    if (x.w1.z > p.w1.z) { return true; } if (x.w1.z < p.w1.z) { return false; }
    if (x.w1.y > p.w1.y) { return true; } if (x.w1.y < p.w1.y) { return false; }
    if (x.w1.x > p.w1.x) { return true; } if (x.w1.x < p.w1.x) { return false; }
    if (x.w0.w > p.w0.w) { return true; } if (x.w0.w < p.w0.w) { return false; }
    if (x.w0.z > p.w0.z) { return true; } if (x.w0.z < p.w0.z) { return false; }
    if (x.w0.y > p.w0.y) { return true; } if (x.w0.y < p.w0.y) { return false; }
    if (x.w0.x > p.w0.x) { return true; } if (x.w0.x < p.w0.x) { return false; }
    return true;
}

fn b5_neg(x: B5) -> B5 {
    var s: B5;
    s.w0.x = u32(-i32(x.w0.x));
    s.w0.y = u32(-i32(x.w0.y));
    s.w0.z = u32(-i32(x.w0.z));
    s.w0.w = u32(-i32(x.w0.w));
    s.w1.x = u32(-i32(x.w1.x));
    s.w1.y = u32(-i32(x.w1.y));
    s.w1.z = u32(-i32(x.w1.z));
    s.w1.w = u32(-i32(x.w1.w));
    s.w2.x = u32(-i32(x.w2.x));
    s.w2.y = u32(-i32(x.w2.y));
    s.w2.z = u32(-i32(x.w2.z));
    s.w2.w = u32(-i32(x.w2.w));
    s.w3.x = u32(-i32(x.w3.x));
    s.w3.y = u32(-i32(x.w3.y));
    s.w3.z = u32(-i32(x.w3.z));
    s.w3.w = u32(-i32(x.w3.w));
    s.w4.x = u32(-i32(x.w4.x));
    s.w4.y = u32(-i32(x.w4.y));
    s.w4.z = u32(-i32(x.w4.z));
    s.w4.w = u32(-i32(x.w4.w));
    return b5_normalise(s);
}

fn b5_reduce_to_canonical(xin: B5, p: B5) -> B5 {
    var x: B5 = b5_normalise(xin);
    var done: bool = false;
    for (var it: u32 = 0u; it < BYL_RTC_MAX_ITERS; it = it + 1u) {
        if (done) { continue; }
        if (b5_is_neg_2c(x)) { x = b5_add_p(x, p); }
        else if (b5_gte(x, p)) { x = b5_sub_p(x, p); }
        else { done = true; }
    }
    return x;
}

fn b5_apply_matrix_fg(m: BylMat, f: B5, g: B5) -> B5Pair {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;
    var outf: B5; var outg: B5;
    let fi0: i32 = i32(f.w0.x); let gi0: i32 = i32(g.w0.x);
    let nf0: i32 = u_lo*fi0 + v_lo*gi0;
    let ng0: i32 = q_lo*fi0 + r_lo*gi0;
    let cf0: i32 = nf0 >> 13u; let cg0: i32 = ng0 >> 13u;
    let fi1: i32 = i32(f.w0.y); let gi1: i32 = i32(g.w0.y);
    let nf1: i32 = u_lo*fi1 + v_lo*gi1 + u_hi*fi0 + v_hi*gi0 + cf0;
    let ng1: i32 = q_lo*fi1 + r_lo*gi1 + q_hi*fi0 + r_hi*gi0 + cg0;
    let cf1: i32 = nf1 >> 13u; let cg1: i32 = ng1 >> 13u;
    let fi2: i32 = i32(f.w0.z); let gi2: i32 = i32(g.w0.z);
    let nf2: i32 = u_lo*fi2 + v_lo*gi2 + u_hi*fi1 + v_hi*gi1 + cf1;
    let ng2: i32 = q_lo*fi2 + r_lo*gi2 + q_hi*fi1 + r_hi*gi1 + cg1;
    outf.w0.x = u32(nf2) & MASK; outg.w0.x = u32(ng2) & MASK;
    let cf2: i32 = nf2 >> 13u; let cg2: i32 = ng2 >> 13u;
    let fi3: i32 = i32(f.w0.w); let gi3: i32 = i32(g.w0.w);
    let nf3: i32 = u_lo*fi3 + v_lo*gi3 + u_hi*fi2 + v_hi*gi2 + cf2;
    let ng3: i32 = q_lo*fi3 + r_lo*gi3 + q_hi*fi2 + r_hi*gi2 + cg2;
    outf.w0.y = u32(nf3) & MASK; outg.w0.y = u32(ng3) & MASK;
    let cf3: i32 = nf3 >> 13u; let cg3: i32 = ng3 >> 13u;
    let fi4: i32 = i32(f.w1.x); let gi4: i32 = i32(g.w1.x);
    let nf4: i32 = u_lo*fi4 + v_lo*gi4 + u_hi*fi3 + v_hi*gi3 + cf3;
    let ng4: i32 = q_lo*fi4 + r_lo*gi4 + q_hi*fi3 + r_hi*gi3 + cg3;
    outf.w0.z = u32(nf4) & MASK; outg.w0.z = u32(ng4) & MASK;
    let cf4: i32 = nf4 >> 13u; let cg4: i32 = ng4 >> 13u;
    let fi5: i32 = i32(f.w1.y); let gi5: i32 = i32(g.w1.y);
    let nf5: i32 = u_lo*fi5 + v_lo*gi5 + u_hi*fi4 + v_hi*gi4 + cf4;
    let ng5: i32 = q_lo*fi5 + r_lo*gi5 + q_hi*fi4 + r_hi*gi4 + cg4;
    outf.w0.w = u32(nf5) & MASK; outg.w0.w = u32(ng5) & MASK;
    let cf5: i32 = nf5 >> 13u; let cg5: i32 = ng5 >> 13u;
    let fi6: i32 = i32(f.w1.z); let gi6: i32 = i32(g.w1.z);
    let nf6: i32 = u_lo*fi6 + v_lo*gi6 + u_hi*fi5 + v_hi*gi5 + cf5;
    let ng6: i32 = q_lo*fi6 + r_lo*gi6 + q_hi*fi5 + r_hi*gi5 + cg5;
    outf.w1.x = u32(nf6) & MASK; outg.w1.x = u32(ng6) & MASK;
    let cf6: i32 = nf6 >> 13u; let cg6: i32 = ng6 >> 13u;
    let fi7: i32 = i32(f.w1.w); let gi7: i32 = i32(g.w1.w);
    let nf7: i32 = u_lo*fi7 + v_lo*gi7 + u_hi*fi6 + v_hi*gi6 + cf6;
    let ng7: i32 = q_lo*fi7 + r_lo*gi7 + q_hi*fi6 + r_hi*gi6 + cg6;
    outf.w1.y = u32(nf7) & MASK; outg.w1.y = u32(ng7) & MASK;
    let cf7: i32 = nf7 >> 13u; let cg7: i32 = ng7 >> 13u;
    let fi8: i32 = i32(f.w2.x); let gi8: i32 = i32(g.w2.x);
    let nf8: i32 = u_lo*fi8 + v_lo*gi8 + u_hi*fi7 + v_hi*gi7 + cf7;
    let ng8: i32 = q_lo*fi8 + r_lo*gi8 + q_hi*fi7 + r_hi*gi7 + cg7;
    outf.w1.z = u32(nf8) & MASK; outg.w1.z = u32(ng8) & MASK;
    let cf8: i32 = nf8 >> 13u; let cg8: i32 = ng8 >> 13u;
    let fi9: i32 = i32(f.w2.y); let gi9: i32 = i32(g.w2.y);
    let nf9: i32 = u_lo*fi9 + v_lo*gi9 + u_hi*fi8 + v_hi*gi8 + cf8;
    let ng9: i32 = q_lo*fi9 + r_lo*gi9 + q_hi*fi8 + r_hi*gi8 + cg8;
    outf.w1.w = u32(nf9) & MASK; outg.w1.w = u32(ng9) & MASK;
    let cf9: i32 = nf9 >> 13u; let cg9: i32 = ng9 >> 13u;
    let fi10: i32 = i32(f.w2.z); let gi10: i32 = i32(g.w2.z);
    let nf10: i32 = u_lo*fi10 + v_lo*gi10 + u_hi*fi9 + v_hi*gi9 + cf9;
    let ng10: i32 = q_lo*fi10 + r_lo*gi10 + q_hi*fi9 + r_hi*gi9 + cg9;
    outf.w2.x = u32(nf10) & MASK; outg.w2.x = u32(ng10) & MASK;
    let cf10: i32 = nf10 >> 13u; let cg10: i32 = ng10 >> 13u;
    let fi11: i32 = i32(f.w2.w); let gi11: i32 = i32(g.w2.w);
    let nf11: i32 = u_lo*fi11 + v_lo*gi11 + u_hi*fi10 + v_hi*gi10 + cf10;
    let ng11: i32 = q_lo*fi11 + r_lo*gi11 + q_hi*fi10 + r_hi*gi10 + cg10;
    outf.w2.y = u32(nf11) & MASK; outg.w2.y = u32(ng11) & MASK;
    let cf11: i32 = nf11 >> 13u; let cg11: i32 = ng11 >> 13u;
    let fi12: i32 = i32(f.w3.x); let gi12: i32 = i32(g.w3.x);
    let nf12: i32 = u_lo*fi12 + v_lo*gi12 + u_hi*fi11 + v_hi*gi11 + cf11;
    let ng12: i32 = q_lo*fi12 + r_lo*gi12 + q_hi*fi11 + r_hi*gi11 + cg11;
    outf.w2.z = u32(nf12) & MASK; outg.w2.z = u32(ng12) & MASK;
    let cf12: i32 = nf12 >> 13u; let cg12: i32 = ng12 >> 13u;
    let fi13: i32 = i32(f.w3.y); let gi13: i32 = i32(g.w3.y);
    let nf13: i32 = u_lo*fi13 + v_lo*gi13 + u_hi*fi12 + v_hi*gi12 + cf12;
    let ng13: i32 = q_lo*fi13 + r_lo*gi13 + q_hi*fi12 + r_hi*gi12 + cg12;
    outf.w2.w = u32(nf13) & MASK; outg.w2.w = u32(ng13) & MASK;
    let cf13: i32 = nf13 >> 13u; let cg13: i32 = ng13 >> 13u;
    let fi14: i32 = i32(f.w3.z); let gi14: i32 = i32(g.w3.z);
    let nf14: i32 = u_lo*fi14 + v_lo*gi14 + u_hi*fi13 + v_hi*gi13 + cf13;
    let ng14: i32 = q_lo*fi14 + r_lo*gi14 + q_hi*fi13 + r_hi*gi13 + cg13;
    outf.w3.x = u32(nf14) & MASK; outg.w3.x = u32(ng14) & MASK;
    let cf14: i32 = nf14 >> 13u; let cg14: i32 = ng14 >> 13u;
    let fi15: i32 = i32(f.w3.w); let gi15: i32 = i32(g.w3.w);
    let nf15: i32 = u_lo*fi15 + v_lo*gi15 + u_hi*fi14 + v_hi*gi14 + cf14;
    let ng15: i32 = q_lo*fi15 + r_lo*gi15 + q_hi*fi14 + r_hi*gi14 + cg14;
    outf.w3.y = u32(nf15) & MASK; outg.w3.y = u32(ng15) & MASK;
    let cf15: i32 = nf15 >> 13u; let cg15: i32 = ng15 >> 13u;
    let fi16: i32 = i32(f.w4.x); let gi16: i32 = i32(g.w4.x);
    let nf16: i32 = u_lo*fi16 + v_lo*gi16 + u_hi*fi15 + v_hi*gi15 + cf15;
    let ng16: i32 = q_lo*fi16 + r_lo*gi16 + q_hi*fi15 + r_hi*gi15 + cg15;
    outf.w3.z = u32(nf16) & MASK; outg.w3.z = u32(ng16) & MASK;
    let cf16: i32 = nf16 >> 13u; let cg16: i32 = ng16 >> 13u;
    let fi17: i32 = i32(f.w4.y); let gi17: i32 = i32(g.w4.y);
    let nf17: i32 = u_lo*fi17 + v_lo*gi17 + u_hi*fi16 + v_hi*gi16 + cf16;
    let ng17: i32 = q_lo*fi17 + r_lo*gi17 + q_hi*fi16 + r_hi*gi16 + cg16;
    outf.w3.w = u32(nf17) & MASK; outg.w3.w = u32(ng17) & MASK;
    let cf17: i32 = nf17 >> 13u; let cg17: i32 = ng17 >> 13u;
    let fi18: i32 = i32(f.w4.z); let gi18: i32 = i32(g.w4.z);
    let nf18: i32 = u_lo*fi18 + v_lo*gi18 + u_hi*fi17 + v_hi*gi17 + cf17;
    let ng18: i32 = q_lo*fi18 + r_lo*gi18 + q_hi*fi17 + r_hi*gi17 + cg17;
    outf.w4.x = u32(nf18) & MASK; outg.w4.x = u32(ng18) & MASK;
    let cf18: i32 = nf18 >> 13u; let cg18: i32 = ng18 >> 13u;
    let fi19: i32 = ((i32(f.w4.w) << 19u) >> 19u); let gi19: i32 = ((i32(g.w4.w) << 19u) >> 19u);
    let nf19: i32 = u_lo*fi19 + v_lo*gi19 + u_hi*fi18 + v_hi*gi18 + cf18;
    let ng19: i32 = q_lo*fi19 + r_lo*gi19 + q_hi*fi18 + r_hi*gi18 + cg18;
    outf.w4.y = u32(nf19) & MASK; outg.w4.y = u32(ng19) & MASK;
    let cf19: i32 = nf19 >> 13u; let cg19: i32 = ng19 >> 13u;
    let nft: i32 = u_hi*fi19 + v_hi*gi19 + cf19; let ngt: i32 = q_hi*fi19 + r_hi*gi19 + cg19;
    outf.w4.z = u32(nft) & MASK; outf.w4.w = u32(nft >> 13u);
    outg.w4.z = u32(ngt) & MASK; outg.w4.w = u32(ngt >> 13u);
    return B5Pair(outf, outg);
}

fn b5_apply_matrix_de(m: BylMat, d: B5, e_in: B5, p: B5) -> B5Pair {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;
    let d0: i32 = i32(d.w0.x); let e0: i32 = i32(e_in.w0.x);
    let d1: i32 = i32(d.w0.y); let e1: i32 = i32(e_in.w0.y);
    let p0: i32 = i32(p.w0.x); let p1: i32 = i32(p.w0.y);
    let nd0: i32 = u_lo*d0 + v_lo*e0; let ne0: i32 = q_lo*d0 + r_lo*e0;
    let nd1: i32 = u_lo*d1 + v_lo*e1 + u_hi*d0 + v_hi*e0; let ne1: i32 = q_lo*d1 + r_lo*e1 + q_hi*d0 + r_hi*e0;
    let nd0_low: u32 = u32(nd0) & MASK; let nd1_carry: u32 = u32(nd1 + (nd0 >> 13u)) & MASK;
    let t_d: u32 = (nd0_low | (nd1_carry << 13u)) & BYL_MASK_BATCH;
    let ne0_low: u32 = u32(ne0) & MASK; let ne1_carry: u32 = u32(ne1 + (ne0 >> 13u)) & MASK;
    let t_e: u32 = (ne0_low | (ne1_carry << 13u)) & BYL_MASK_BATCH;
    let k_d: u32 = (((~t_d + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let k_e: u32 = (((~t_e + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let kd_lo: i32 = i32(k_d & MASK); let kd_hi: i32 = i32(k_d >> 13u);
    let ke_lo: i32 = i32(k_e & MASK); let ke_hi: i32 = i32(k_e >> 13u);
    let cd1: i32 = (nd1 + kd_lo*p1 + kd_hi*p0 + ((nd0 + kd_lo*p0) >> 13u)) >> 13u;
    let ce1: i32 = (ne1 + ke_lo*p1 + ke_hi*p0 + ((ne0 + ke_lo*p0) >> 13u)) >> 13u;
    var od: B5; var oe: B5;
    let di2: i32 = i32(d.w0.z); let ei2: i32 = i32(e_in.w0.z);
    let pi2: i32 = i32(p.w0.z); let pm2: i32 = i32(p.w0.y);
    let nd2: i32 = u_lo*di2 + v_lo*ei2 + u_hi*d1 + v_hi*e1 + kd_lo*pi2 + kd_hi*pm2 + cd1;
    let ne2: i32 = q_lo*di2 + r_lo*ei2 + q_hi*d1 + r_hi*e1 + ke_lo*pi2 + ke_hi*pm2 + ce1;
    od.w0.x = u32(nd2) & MASK; oe.w0.x = u32(ne2) & MASK;
    let cd2: i32 = nd2 >> 13u; let ce2: i32 = ne2 >> 13u;
    let di3: i32 = i32(d.w0.w); let ei3: i32 = i32(e_in.w0.w);
    let pi3: i32 = i32(p.w0.w); let pm3: i32 = i32(p.w0.z);
    let nd3: i32 = u_lo*di3 + v_lo*ei3 + u_hi*di2 + v_hi*ei2 + kd_lo*pi3 + kd_hi*pm3 + cd2;
    let ne3: i32 = q_lo*di3 + r_lo*ei3 + q_hi*di2 + r_hi*ei2 + ke_lo*pi3 + ke_hi*pm3 + ce2;
    od.w0.y = u32(nd3) & MASK; oe.w0.y = u32(ne3) & MASK;
    let cd3: i32 = nd3 >> 13u; let ce3: i32 = ne3 >> 13u;
    let di4: i32 = i32(d.w1.x); let ei4: i32 = i32(e_in.w1.x);
    let pi4: i32 = i32(p.w1.x); let pm4: i32 = i32(p.w0.w);
    let nd4: i32 = u_lo*di4 + v_lo*ei4 + u_hi*di3 + v_hi*ei3 + kd_lo*pi4 + kd_hi*pm4 + cd3;
    let ne4: i32 = q_lo*di4 + r_lo*ei4 + q_hi*di3 + r_hi*ei3 + ke_lo*pi4 + ke_hi*pm4 + ce3;
    od.w0.z = u32(nd4) & MASK; oe.w0.z = u32(ne4) & MASK;
    let cd4: i32 = nd4 >> 13u; let ce4: i32 = ne4 >> 13u;
    let di5: i32 = i32(d.w1.y); let ei5: i32 = i32(e_in.w1.y);
    let pi5: i32 = i32(p.w1.y); let pm5: i32 = i32(p.w1.x);
    let nd5: i32 = u_lo*di5 + v_lo*ei5 + u_hi*di4 + v_hi*ei4 + kd_lo*pi5 + kd_hi*pm5 + cd4;
    let ne5: i32 = q_lo*di5 + r_lo*ei5 + q_hi*di4 + r_hi*ei4 + ke_lo*pi5 + ke_hi*pm5 + ce4;
    od.w0.w = u32(nd5) & MASK; oe.w0.w = u32(ne5) & MASK;
    let cd5: i32 = nd5 >> 13u; let ce5: i32 = ne5 >> 13u;
    let di6: i32 = i32(d.w1.z); let ei6: i32 = i32(e_in.w1.z);
    let pi6: i32 = i32(p.w1.z); let pm6: i32 = i32(p.w1.y);
    let nd6: i32 = u_lo*di6 + v_lo*ei6 + u_hi*di5 + v_hi*ei5 + kd_lo*pi6 + kd_hi*pm6 + cd5;
    let ne6: i32 = q_lo*di6 + r_lo*ei6 + q_hi*di5 + r_hi*ei5 + ke_lo*pi6 + ke_hi*pm6 + ce5;
    od.w1.x = u32(nd6) & MASK; oe.w1.x = u32(ne6) & MASK;
    let cd6: i32 = nd6 >> 13u; let ce6: i32 = ne6 >> 13u;
    let di7: i32 = i32(d.w1.w); let ei7: i32 = i32(e_in.w1.w);
    let pi7: i32 = i32(p.w1.w); let pm7: i32 = i32(p.w1.z);
    let nd7: i32 = u_lo*di7 + v_lo*ei7 + u_hi*di6 + v_hi*ei6 + kd_lo*pi7 + kd_hi*pm7 + cd6;
    let ne7: i32 = q_lo*di7 + r_lo*ei7 + q_hi*di6 + r_hi*ei6 + ke_lo*pi7 + ke_hi*pm7 + ce6;
    od.w1.y = u32(nd7) & MASK; oe.w1.y = u32(ne7) & MASK;
    let cd7: i32 = nd7 >> 13u; let ce7: i32 = ne7 >> 13u;
    let di8: i32 = i32(d.w2.x); let ei8: i32 = i32(e_in.w2.x);
    let pi8: i32 = i32(p.w2.x); let pm8: i32 = i32(p.w1.w);
    let nd8: i32 = u_lo*di8 + v_lo*ei8 + u_hi*di7 + v_hi*ei7 + kd_lo*pi8 + kd_hi*pm8 + cd7;
    let ne8: i32 = q_lo*di8 + r_lo*ei8 + q_hi*di7 + r_hi*ei7 + ke_lo*pi8 + ke_hi*pm8 + ce7;
    od.w1.z = u32(nd8) & MASK; oe.w1.z = u32(ne8) & MASK;
    let cd8: i32 = nd8 >> 13u; let ce8: i32 = ne8 >> 13u;
    let di9: i32 = i32(d.w2.y); let ei9: i32 = i32(e_in.w2.y);
    let pi9: i32 = i32(p.w2.y); let pm9: i32 = i32(p.w2.x);
    let nd9: i32 = u_lo*di9 + v_lo*ei9 + u_hi*di8 + v_hi*ei8 + kd_lo*pi9 + kd_hi*pm9 + cd8;
    let ne9: i32 = q_lo*di9 + r_lo*ei9 + q_hi*di8 + r_hi*ei8 + ke_lo*pi9 + ke_hi*pm9 + ce8;
    od.w1.w = u32(nd9) & MASK; oe.w1.w = u32(ne9) & MASK;
    let cd9: i32 = nd9 >> 13u; let ce9: i32 = ne9 >> 13u;
    let di10: i32 = i32(d.w2.z); let ei10: i32 = i32(e_in.w2.z);
    let pi10: i32 = i32(p.w2.z); let pm10: i32 = i32(p.w2.y);
    let nd10: i32 = u_lo*di10 + v_lo*ei10 + u_hi*di9 + v_hi*ei9 + kd_lo*pi10 + kd_hi*pm10 + cd9;
    let ne10: i32 = q_lo*di10 + r_lo*ei10 + q_hi*di9 + r_hi*ei9 + ke_lo*pi10 + ke_hi*pm10 + ce9;
    od.w2.x = u32(nd10) & MASK; oe.w2.x = u32(ne10) & MASK;
    let cd10: i32 = nd10 >> 13u; let ce10: i32 = ne10 >> 13u;
    let di11: i32 = i32(d.w2.w); let ei11: i32 = i32(e_in.w2.w);
    let pi11: i32 = i32(p.w2.w); let pm11: i32 = i32(p.w2.z);
    let nd11: i32 = u_lo*di11 + v_lo*ei11 + u_hi*di10 + v_hi*ei10 + kd_lo*pi11 + kd_hi*pm11 + cd10;
    let ne11: i32 = q_lo*di11 + r_lo*ei11 + q_hi*di10 + r_hi*ei10 + ke_lo*pi11 + ke_hi*pm11 + ce10;
    od.w2.y = u32(nd11) & MASK; oe.w2.y = u32(ne11) & MASK;
    let cd11: i32 = nd11 >> 13u; let ce11: i32 = ne11 >> 13u;
    let di12: i32 = i32(d.w3.x); let ei12: i32 = i32(e_in.w3.x);
    let pi12: i32 = i32(p.w3.x); let pm12: i32 = i32(p.w2.w);
    let nd12: i32 = u_lo*di12 + v_lo*ei12 + u_hi*di11 + v_hi*ei11 + kd_lo*pi12 + kd_hi*pm12 + cd11;
    let ne12: i32 = q_lo*di12 + r_lo*ei12 + q_hi*di11 + r_hi*ei11 + ke_lo*pi12 + ke_hi*pm12 + ce11;
    od.w2.z = u32(nd12) & MASK; oe.w2.z = u32(ne12) & MASK;
    let cd12: i32 = nd12 >> 13u; let ce12: i32 = ne12 >> 13u;
    let di13: i32 = i32(d.w3.y); let ei13: i32 = i32(e_in.w3.y);
    let pi13: i32 = i32(p.w3.y); let pm13: i32 = i32(p.w3.x);
    let nd13: i32 = u_lo*di13 + v_lo*ei13 + u_hi*di12 + v_hi*ei12 + kd_lo*pi13 + kd_hi*pm13 + cd12;
    let ne13: i32 = q_lo*di13 + r_lo*ei13 + q_hi*di12 + r_hi*ei12 + ke_lo*pi13 + ke_hi*pm13 + ce12;
    od.w2.w = u32(nd13) & MASK; oe.w2.w = u32(ne13) & MASK;
    let cd13: i32 = nd13 >> 13u; let ce13: i32 = ne13 >> 13u;
    let di14: i32 = i32(d.w3.z); let ei14: i32 = i32(e_in.w3.z);
    let pi14: i32 = i32(p.w3.z); let pm14: i32 = i32(p.w3.y);
    let nd14: i32 = u_lo*di14 + v_lo*ei14 + u_hi*di13 + v_hi*ei13 + kd_lo*pi14 + kd_hi*pm14 + cd13;
    let ne14: i32 = q_lo*di14 + r_lo*ei14 + q_hi*di13 + r_hi*ei13 + ke_lo*pi14 + ke_hi*pm14 + ce13;
    od.w3.x = u32(nd14) & MASK; oe.w3.x = u32(ne14) & MASK;
    let cd14: i32 = nd14 >> 13u; let ce14: i32 = ne14 >> 13u;
    let di15: i32 = i32(d.w3.w); let ei15: i32 = i32(e_in.w3.w);
    let pi15: i32 = i32(p.w3.w); let pm15: i32 = i32(p.w3.z);
    let nd15: i32 = u_lo*di15 + v_lo*ei15 + u_hi*di14 + v_hi*ei14 + kd_lo*pi15 + kd_hi*pm15 + cd14;
    let ne15: i32 = q_lo*di15 + r_lo*ei15 + q_hi*di14 + r_hi*ei14 + ke_lo*pi15 + ke_hi*pm15 + ce14;
    od.w3.y = u32(nd15) & MASK; oe.w3.y = u32(ne15) & MASK;
    let cd15: i32 = nd15 >> 13u; let ce15: i32 = ne15 >> 13u;
    let di16: i32 = i32(d.w4.x); let ei16: i32 = i32(e_in.w4.x);
    let pi16: i32 = i32(p.w4.x); let pm16: i32 = i32(p.w3.w);
    let nd16: i32 = u_lo*di16 + v_lo*ei16 + u_hi*di15 + v_hi*ei15 + kd_lo*pi16 + kd_hi*pm16 + cd15;
    let ne16: i32 = q_lo*di16 + r_lo*ei16 + q_hi*di15 + r_hi*ei15 + ke_lo*pi16 + ke_hi*pm16 + ce15;
    od.w3.z = u32(nd16) & MASK; oe.w3.z = u32(ne16) & MASK;
    let cd16: i32 = nd16 >> 13u; let ce16: i32 = ne16 >> 13u;
    let di17: i32 = i32(d.w4.y); let ei17: i32 = i32(e_in.w4.y);
    let pi17: i32 = i32(p.w4.y); let pm17: i32 = i32(p.w4.x);
    let nd17: i32 = u_lo*di17 + v_lo*ei17 + u_hi*di16 + v_hi*ei16 + kd_lo*pi17 + kd_hi*pm17 + cd16;
    let ne17: i32 = q_lo*di17 + r_lo*ei17 + q_hi*di16 + r_hi*ei16 + ke_lo*pi17 + ke_hi*pm17 + ce16;
    od.w3.w = u32(nd17) & MASK; oe.w3.w = u32(ne17) & MASK;
    let cd17: i32 = nd17 >> 13u; let ce17: i32 = ne17 >> 13u;
    let di18: i32 = i32(d.w4.z); let ei18: i32 = i32(e_in.w4.z);
    let pi18: i32 = i32(p.w4.z); let pm18: i32 = i32(p.w4.y);
    let nd18: i32 = u_lo*di18 + v_lo*ei18 + u_hi*di17 + v_hi*ei17 + kd_lo*pi18 + kd_hi*pm18 + cd17;
    let ne18: i32 = q_lo*di18 + r_lo*ei18 + q_hi*di17 + r_hi*ei17 + ke_lo*pi18 + ke_hi*pm18 + ce17;
    od.w4.x = u32(nd18) & MASK; oe.w4.x = u32(ne18) & MASK;
    let cd18: i32 = nd18 >> 13u; let ce18: i32 = ne18 >> 13u;
    let di19: i32 = ((i32(d.w4.w) << 19u) >> 19u); let ei19: i32 = ((i32(e_in.w4.w) << 19u) >> 19u);
    let pi19: i32 = i32(p.w4.w); let pm19: i32 = i32(p.w4.z);
    let nd19: i32 = u_lo*di19 + v_lo*ei19 + u_hi*di18 + v_hi*ei18 + kd_lo*pi19 + kd_hi*pm19 + cd18;
    let ne19: i32 = q_lo*di19 + r_lo*ei19 + q_hi*di18 + r_hi*ei18 + ke_lo*pi19 + ke_hi*pm19 + ce18;
    od.w4.y = u32(nd19) & MASK; oe.w4.y = u32(ne19) & MASK;
    let cd19: i32 = nd19 >> 13u; let ce19: i32 = ne19 >> 13u;
    let ptop: i32 = i32(p.w4.w);
    let ndt: i32 = u_hi*di19 + v_hi*ei19 + kd_hi*ptop + cd19; let net: i32 = q_hi*di19 + r_hi*ei19 + ke_hi*ptop + ce19;
    od.w4.z = u32(ndt) & MASK; od.w4.w = u32(ndt >> 13u);
    oe.w4.z = u32(net) & MASK; oe.w4.w = u32(net >> 13u);
    return B5Pair(od, oe);
}

fn fr_inv_by_loop_v4(a: BigInt) -> BigInt {
    var p5: B5 = b5_get_p();
    var f: B5 = p5;
    var g: B5 = b5_from_bigint(a);
    var d: B5;
    var e: B5; e.w0 = vec4<u32>(1u, 0u, 0u, 0u);
    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        let f_lo: vec2<u32> = b5_low_u64(f);
        let g_lo: vec2<u32> = b5_low_u64(g);
        let m: BylMat = byl_divsteps_bl(&delta, f_lo, g_lo);
        let fg: B5Pair = b5_apply_matrix_fg(m, f, g); f = fg.a; g = fg.b;
        let de: B5Pair = b5_apply_matrix_de(m, d, e, p5); d = de.a; e = de.b;
        if (((iter + 1u) % BYL_REDUCE_INTERVAL) == 0u) {
            d = b5_reduce_to_canonical(d, p5); e = b5_reduce_to_canonical(e, p5);
        }
        if (b5_is_zero(g)) { done = true; }
    }
    d = b5_reduce_to_canonical(d, p5);
    if (b5_is_neg_2c(f)) { d = b5_neg(d); d = b5_reduce_to_canonical(d, p5); }
    var dd: BigInt = b5_to_bigint(d);
    var r3: BigInt = get_r_cubed();
    return montgomery_product(&dd, &r3);
}


// ===========================================================================
// PACKED safegcd inverse (fr_inv_by_loop_pk). Same Bernstein-Yang algorithm
// and arithmetic as fr_inv_by_loop, but f,g,d,e,p are stored 2x13-bit limbs
// per u32 word (10 words instead of 20) -> HALF the per-thread private-memory
// footprint and half the apply_matrix memory traffic. Smaller footprint =>
// the GPU can keep more inverse threads resident => higher occupancy on the
// Adreno. All arithmetic stays i32/13-bit (no 64-bit emulation). Hand-derived
// from the validated rolling recurrence; word w holds limb 2w (bits 0..12)
// and limb 2w+1 (bits 13..25).
// ===========================================================================
struct Pk { w: array<u32, 10> }

fn pk_from_bigint(x: BigInt) -> Pk {
    var o: Pk;
    for (var k: u32 = 0u; k < 10u; k = k + 1u) {
        o.w[k] = (x.limbs[2u * k] & MASK) | ((x.limbs[2u * k + 1u] & MASK) << 13u);
    }
    return o;
}

fn pk_to_bigint(x: ptr<function, Pk>) -> BigInt {
    var o: BigInt;
    for (var k: u32 = 0u; k < 10u; k = k + 1u) {
        let word = (*x).w[k];
        o.limbs[2u * k] = word & MASK;
        o.limbs[2u * k + 1u] = (word >> 13u) & MASK;
    }
    return o;
}

fn pk_get_p() -> Pk { return pk_from_bigint(get_p()); }

// Low 64 bits from limbs 0..4 (words 0,1 and low limb of word 2).
fn pk_low_u64(x: ptr<function, Pk>) -> vec2<u32> {
    let w0 = (*x).w[0];
    let w1 = (*x).w[1];
    let l0: u32 = w0 & MASK;
    let l1: u32 = (w0 >> 13u) & MASK;
    let l2: u32 = w1 & MASK;
    let l3: u32 = (w1 >> 13u) & MASK;
    let l4: u32 = (*x).w[2] & MASK;
    let lo32: u32 = l0 | (l1 << 13u) | (l2 << 26u);
    let hi32: u32 = (l2 >> 6u) | (l3 << 7u) | (l4 << 20u);
    return vec2<u32>(lo32, hi32);
}

fn pk_is_zero(x: ptr<function, Pk>) -> bool {
    var a: u32 = 0u;
    for (var k: u32 = 0u; k < 10u; k = k + 1u) { a = a | (*x).w[k]; }
    return a == 0u;
}

// Sign bit of the 260-bit value = bit 12 of limb 19 = bit 25 of word 9.
fn pk_is_neg_2c(x: ptr<function, Pk>) -> bool { return (((*x).w[9] >> 25u) & 1u) == 1u; }

// Signed carry-propagate normalisation, 2 limbs/word; limb 19 (top) absorbs.
fn pk_normalise(x: ptr<function, Pk>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let word = (*x).w[w];
        let lo: i32 = i32(word & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = i32((word >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

// out = x + p, carry-propagated (combines add + normalise). Top limb absorbs.
fn pk_add_p(x: ptr<function, Pk>, p: ptr<function, Pk>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let xw = (*x).w[w];
        let pw = (*p).w[w];
        let lo: i32 = i32(xw & MASK) + i32(pw & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

fn pk_sub_p(x: ptr<function, Pk>, p: ptr<function, Pk>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let xw = (*x).w[w];
        let pw = (*p).w[w];
        let lo: i32 = i32(xw & MASK) - i32(pw & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

fn pk_neg(x: ptr<function, Pk>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let word = (*x).w[w];
        let lo: i32 = -i32(word & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = -i32((word >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

// x >= p ? (compare from limb 19 down).
fn pk_gte(x: ptr<function, Pk>, p: ptr<function, Pk>) -> bool {
    for (var idx: u32 = 0u; idx < 10u; idx = idx + 1u) {
        let w = 9u - idx;
        let xhi = ((*x).w[w] >> 13u) & MASK;
        let phi = ((*p).w[w] >> 13u) & MASK;
        if (xhi > phi) { return true; }
        if (xhi < phi) { return false; }
        let xlo = (*x).w[w] & MASK;
        let plo = (*p).w[w] & MASK;
        if (xlo > plo) { return true; }
        if (xlo < plo) { return false; }
    }
    return true;
}

fn pk_reduce_to_canonical(x: ptr<function, Pk>, p: ptr<function, Pk>) {
    pk_normalise(x);
    var done: bool = false;
    for (var it: u32 = 0u; it < BYL_RTC_MAX_ITERS; it = it + 1u) {
        if (done) { continue; }
        if (pk_is_neg_2c(x)) { pk_add_p(x, p); }
        else if (pk_gte(x, p)) { pk_sub_p(x, p); }
        else { done = true; }
    }
}

// (f,g) <- ((u*f + v*g) >> 26, (q*f + r*g) >> 26). Rolling, 2 limbs/word.
fn pk_apply_matrix_fg(m: BylMat, f: ptr<function, Pk>, g: ptr<function, Pk>) {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;
    var cf: i32 = 0; var cg: i32 = 0; var fp: i32 = 0; var gp: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let fw = (*f).w[w]; let gw = (*g).w[w];
        let fe: i32 = i32(fw & MASK); let ge: i32 = i32(gw & MASK);
        let nfe: i32 = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf;
        let nge: i32 = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg;
        cf = nfe >> 13u; cg = nge >> 13u;
        var fo: i32; var go: i32;
        if (w == 9u) {
            fo = (i32((fw >> 13u) & MASK) << 19u) >> 19u;
            go = (i32((gw >> 13u) & MASK) << 19u) >> 19u;
        } else {
            fo = i32((fw >> 13u) & MASK); go = i32((gw >> 13u) & MASK);
        }
        let nfo: i32 = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf;
        let ngo: i32 = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg;
        cf = nfo >> 13u; cg = ngo >> 13u;
        if (w >= 1u) {
            (*f).w[w - 1u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u);
            (*g).w[w - 1u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u);
        }
        fp = fo; gp = go;
    }
    let nft: i32 = u_hi * fp + v_hi * gp + cf;
    let ngt: i32 = q_hi * fp + r_hi * gp + cg;
    (*f).w[9] = (u32(nft) & MASK) | (u32(nft >> 13u) << 13u);
    (*g).w[9] = (u32(ngt) & MASK) | (u32(ngt >> 13u) << 13u);
}

// (d,e) <- ((u*d+v*e+k_d*p)>>26, (q*d+r*e+k_e*p)>>26). k*p cancels low 26 bits.
fn pk_apply_matrix_de(m: BylMat, d: ptr<function, Pk>, e: ptr<function, Pk>, p: ptr<function, Pk>) {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;

    let dw0 = (*d).w[0]; let ew0 = (*e).w[0]; let pw0 = (*p).w[0];
    let d0: i32 = i32(dw0 & MASK); let d1: i32 = i32((dw0 >> 13u) & MASK);
    let e0: i32 = i32(ew0 & MASK); let e1: i32 = i32((ew0 >> 13u) & MASK);
    let p0: i32 = i32(pw0 & MASK); let p1: i32 = i32((pw0 >> 13u) & MASK);

    let nd0: i32 = u_lo * d0 + v_lo * e0; let ne0: i32 = q_lo * d0 + r_lo * e0;
    let nd1: i32 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
    let ne1: i32 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;
    let nd0_low: u32 = u32(nd0) & MASK; let nd1_carry: u32 = u32(nd1 + (nd0 >> 13u)) & MASK;
    let t_d: u32 = (nd0_low | (nd1_carry << 13u)) & BYL_MASK_BATCH;
    let ne0_low: u32 = u32(ne0) & MASK; let ne1_carry: u32 = u32(ne1 + (ne0 >> 13u)) & MASK;
    let t_e: u32 = (ne0_low | (ne1_carry << 13u)) & BYL_MASK_BATCH;
    let k_d: u32 = (((~t_d + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let k_e: u32 = (((~t_e + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let kd_lo: i32 = i32(k_d & MASK); let kd_hi: i32 = i32(k_d >> 13u);
    let ke_lo: i32 = i32(k_e & MASK); let ke_hi: i32 = i32(k_e >> 13u);

    var cd: i32 = (nd1 + kd_lo * p1 + kd_hi * p0 + ((nd0 + kd_lo * p0) >> 13u)) >> 13u;
    var ce: i32 = (ne1 + ke_lo * p1 + ke_hi * p0 + ((ne0 + ke_lo * p0) >> 13u)) >> 13u;
    var dp: i32 = d1; var ep: i32 = e1;

    for (var w: u32 = 1u; w < 10u; w = w + 1u) {
        let dw = (*d).w[w]; let ew = (*e).w[w]; let pw = (*p).w[w];
        // even limb i = 2w
        let di_e: i32 = i32(dw & MASK); let ei_e: i32 = i32(ew & MASK);
        let pi_e: i32 = i32(pw & MASK);
        let pim1_e: i32 = i32(((*p).w[w - 1u] >> 13u) & MASK);
        let nd_e: i32 = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd;
        let ne_e: i32 = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce;
        cd = nd_e >> 13u; ce = ne_e >> 13u;
        // odd limb i = 2w+1
        var di_o: i32; var ei_o: i32;
        if (w == 9u) {
            di_o = (i32((dw >> 13u) & MASK) << 19u) >> 19u;
            ei_o = (i32((ew >> 13u) & MASK) << 19u) >> 19u;
        } else {
            di_o = i32((dw >> 13u) & MASK); ei_o = i32((ew >> 13u) & MASK);
        }
        let pi_o: i32 = i32((pw >> 13u) & MASK);
        let pim1_o: i32 = i32(pw & MASK);
        let nd_o: i32 = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd;
        let ne_o: i32 = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce;
        cd = nd_o >> 13u; ce = ne_o >> 13u;
        (*d).w[w - 1u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u);
        (*e).w[w - 1u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u);
        dp = di_o; ep = ei_o;
    }
    let p_top: i32 = i32(((*p).w[9] >> 13u) & MASK);
    let nd_top: i32 = u_hi * dp + v_hi * ep + kd_hi * p_top + cd;
    let ne_top: i32 = q_hi * dp + r_hi * ep + ke_hi * p_top + ce;
    (*d).w[9] = (u32(nd_top) & MASK) | (u32(nd_top >> 13u) << 13u);
    (*e).w[9] = (u32(ne_top) & MASK) | (u32(ne_top >> 13u) << 13u);
}

fn fr_inv_by_loop_pk(a: BigInt) -> BigInt {
    var p_loc: Pk = pk_get_p();
    var f: Pk = p_loc;
    var g: Pk = pk_from_bigint(a);
    var d: Pk;
    var e: Pk; e.w[0] = 1u;
    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        let f_lo: vec2<u32> = pk_low_u64(&f);
        let g_lo: vec2<u32> = pk_low_u64(&g);
        let m: BylMat = byl_divsteps_bl(&delta, f_lo, g_lo);
        pk_apply_matrix_fg(m, &f, &g);
        pk_apply_matrix_de(m, &d, &e, &p_loc);
        if (((iter + 1u) % BYL_REDUCE_INTERVAL) == 0u) {
            pk_reduce_to_canonical(&d, &p_loc);
            pk_reduce_to_canonical(&e, &p_loc);
        }
        if (pk_is_zero(&g)) { done = true; }
    }
    pk_reduce_to_canonical(&d, &p_loc);
    if (pk_is_neg_2c(&f)) { pk_neg(&d); pk_reduce_to_canonical(&d, &p_loc); }
    var dd: BigInt = pk_to_bigint(&d);
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&dd, &r_cubed);
}
