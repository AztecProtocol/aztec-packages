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

// The packed safegcd state stores the value as ten 26-bit words (two 13-bit
// sub-limbs each), INDEPENDENT of the source BigInt limb width — so PK_BITS/
// PK_MASK are fixed at 13, not the global WORD_SIZE/MASK (21 for the f32
// representation). The field element is bridged in/out through the canonical
// 8×32 form (pack_limbs_to_256 / unpack256_to_limbs), so the divstep core is
// the identical validated arithmetic at any source representation.
const PK_BITS: u32 = 13u;
const PK_MASK: u32 = (1u << 13u) - 1u;

// 26-bit window k = bits [26k, 26k+26) of the 256-bit value held in `w8`.
fn pk_window_get(w8: ptr<function, array<u32, 8>>, k: u32) -> u32 {
    let s: u32 = 26u * k;
    let wi: u32 = s / 32u;
    let off: u32 = s % 32u;
    var lo: u32 = (*w8)[wi] >> off;
    if (off > 0u && wi + 1u < 8u) { lo = lo | ((*w8)[wi + 1u] << (32u - off)); }
    return lo & ((1u << 26u) - 1u);
}

// Deposit 26-bit `word` into bits [26k, 26k+26) of the 8×32 accumulator `w8`.
fn pk_window_set(w8: ptr<function, array<u32, 8>>, k: u32, word: u32) {
    let s: u32 = 26u * k;
    let wi: u32 = s / 32u;
    let off: u32 = s % 32u;
    (*w8)[wi] = (*w8)[wi] | (word << off);
    if (off > 0u && wi + 1u < 8u) { (*w8)[wi + 1u] = (*w8)[wi + 1u] | (word >> (32u - off)); }
}

fn pk_from_bigint(x: BigInt) -> Pk {
    var xx: BigInt = x;
    var w8: array<u32, 8> = pack_limbs_to_256(&xx);
    var o: Pk;
    for (var k: u32 = 0u; k < 10u; k = k + 1u) { o.w[k] = pk_window_get(&w8, k); }
    return o;
}

fn pk_to_bigint(x: ptr<function, Pk>) -> BigInt {
    var w8: array<u32, 8>;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) { w8[i] = 0u; }
    for (var k: u32 = 0u; k < 10u; k = k + 1u) { pk_window_set(&w8, k, (*x).w[k] & ((1u << 26u) - 1u)); }
    return unpack256_to_limbs(w8);
}

fn pk_get_p() -> Pk { return pk_from_bigint(get_p()); }

// Packed modulus word w = bits [26w, 26w+26) of p, as a host-generated
// compile-time immediate (re-chunked from p, independent of limb width). No
// per-thread modulus copy in scratch.
fn pk_p_word(w: u32) -> u32 {
    switch w {
{{{ pk_p_words_cases }}}
        default: { return 0u; }
    }
}

// Low 64 bits from limbs 0..4 (words 0,1 and low limb of word 2).
fn pk_low_u64(x: ptr<function, Pk>) -> vec2<u32> {
    let w0 = (*x).w[0];
    let w1 = (*x).w[1];
    let l0: u32 = w0 & PK_MASK;
    let l1: u32 = (w0 >> 13u) & PK_MASK;
    let l2: u32 = w1 & PK_MASK;
    let l3: u32 = (w1 >> 13u) & PK_MASK;
    let l4: u32 = (*x).w[2] & PK_MASK;
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
        let lo: i32 = i32(word & PK_MASK) + c;
        let olo: u32 = u32(lo) & PK_MASK;
        c = lo >> 13u;
        let hi: i32 = i32((word >> 13u) & PK_MASK) + c;
        let ohi: u32 = u32(hi) & PK_MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

// out = x + p, carry-propagated (combines add + normalise). Top limb absorbs.
fn pk_add_p(x: ptr<function, Pk>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let xw = (*x).w[w];
        let pw = pk_p_word(w);
        let lo: i32 = i32(xw & PK_MASK) + i32(pw & PK_MASK) + c;
        let olo: u32 = u32(lo) & PK_MASK;
        c = lo >> 13u;
        let hi: i32 = i32((xw >> 13u) & PK_MASK) + i32((pw >> 13u) & PK_MASK) + c;
        let ohi: u32 = u32(hi) & PK_MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

fn pk_sub_p(x: ptr<function, Pk>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let xw = (*x).w[w];
        let pw = pk_p_word(w);
        let lo: i32 = i32(xw & PK_MASK) - i32(pw & PK_MASK) + c;
        let olo: u32 = u32(lo) & PK_MASK;
        c = lo >> 13u;
        let hi: i32 = i32((xw >> 13u) & PK_MASK) - i32((pw >> 13u) & PK_MASK) + c;
        let ohi: u32 = u32(hi) & PK_MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

fn pk_neg(x: ptr<function, Pk>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let word = (*x).w[w];
        let lo: i32 = -i32(word & PK_MASK) + c;
        let olo: u32 = u32(lo) & PK_MASK;
        c = lo >> 13u;
        let hi: i32 = -i32((word >> 13u) & PK_MASK) + c;
        let ohi: u32 = u32(hi) & PK_MASK;
        if (w != 9u) { c = hi >> 13u; }
        (*x).w[w] = olo | (ohi << 13u);
    }
}

// x >= p ? (compare from limb 19 down).
fn pk_gte(x: ptr<function, Pk>) -> bool {
    for (var idx: u32 = 0u; idx < 10u; idx = idx + 1u) {
        let w = 9u - idx;
        let pw = pk_p_word(w);
        let xhi = ((*x).w[w] >> 13u) & PK_MASK;
        let phi = (pw >> 13u) & PK_MASK;
        if (xhi > phi) { return true; }
        if (xhi < phi) { return false; }
        let xlo = (*x).w[w] & PK_MASK;
        let plo = pw & PK_MASK;
        if (xlo > plo) { return true; }
        if (xlo < plo) { return false; }
    }
    return true;
}

fn pk_reduce_to_canonical(x: ptr<function, Pk>) {
    pk_normalise(x);
    var done: bool = false;
    for (var it: u32 = 0u; it < BYL_RTC_MAX_ITERS; it = it + 1u) {
        if (done) { continue; }
        if (pk_is_neg_2c(x)) { pk_add_p(x); }
        else if (pk_gte(x)) { pk_sub_p(x); }
        else { done = true; }
    }
}

// (f,g) <- ((u*f + v*g) >> 26, (q*f + r*g) >> 26). Rolling, 2 limbs/word.
fn pk_apply_matrix_fg(m: BylMat, f: ptr<function, Pk>, g: ptr<function, Pk>) {
    let u_lo: i32 = i32(u32(m.u) & PK_MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & PK_MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & PK_MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & PK_MASK); let r_hi: i32 = m.r >> 13u;
    var cf: i32 = 0; var cg: i32 = 0; var fp: i32 = 0; var gp: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let fw = (*f).w[w]; let gw = (*g).w[w];
        let fe: i32 = i32(fw & PK_MASK); let ge: i32 = i32(gw & PK_MASK);
        let nfe: i32 = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf;
        let nge: i32 = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg;
        cf = nfe >> 13u; cg = nge >> 13u;
        var fo: i32; var go: i32;
        if (w == 9u) {
            fo = (i32((fw >> 13u) & PK_MASK) << 19u) >> 19u;
            go = (i32((gw >> 13u) & PK_MASK) << 19u) >> 19u;
        } else {
            fo = i32((fw >> 13u) & PK_MASK); go = i32((gw >> 13u) & PK_MASK);
        }
        let nfo: i32 = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf;
        let ngo: i32 = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg;
        cf = nfo >> 13u; cg = ngo >> 13u;
        if (w >= 1u) {
            (*f).w[w - 1u] = (u32(nfe) & PK_MASK) | ((u32(nfo) & PK_MASK) << 13u);
            (*g).w[w - 1u] = (u32(nge) & PK_MASK) | ((u32(ngo) & PK_MASK) << 13u);
        }
        fp = fo; gp = go;
    }
    let nft: i32 = u_hi * fp + v_hi * gp + cf;
    let ngt: i32 = q_hi * fp + r_hi * gp + cg;
    (*f).w[9] = (u32(nft) & PK_MASK) | (u32(nft >> 13u) << 13u);
    (*g).w[9] = (u32(ngt) & PK_MASK) | (u32(ngt >> 13u) << 13u);
}

// (d,e) <- ((u*d+v*e+k_d*p)>>26, (q*d+r*e+k_e*p)>>26). k*p cancels low 26 bits.
fn pk_apply_matrix_de(m: BylMat, d: ptr<function, Pk>, e: ptr<function, Pk>) {
    let u_lo: i32 = i32(u32(m.u) & PK_MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & PK_MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & PK_MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & PK_MASK); let r_hi: i32 = m.r >> 13u;

    let dw0 = (*d).w[0]; let ew0 = (*e).w[0]; let pw0 = pk_p_word(0u);
    let d0: i32 = i32(dw0 & PK_MASK); let d1: i32 = i32((dw0 >> 13u) & PK_MASK);
    let e0: i32 = i32(ew0 & PK_MASK); let e1: i32 = i32((ew0 >> 13u) & PK_MASK);
    let p0: i32 = i32(pw0 & PK_MASK); let p1: i32 = i32((pw0 >> 13u) & PK_MASK);

    let nd0: i32 = u_lo * d0 + v_lo * e0; let ne0: i32 = q_lo * d0 + r_lo * e0;
    let nd1: i32 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
    let ne1: i32 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;
    let nd0_low: u32 = u32(nd0) & PK_MASK; let nd1_carry: u32 = u32(nd1 + (nd0 >> 13u)) & PK_MASK;
    let t_d: u32 = (nd0_low | (nd1_carry << 13u)) & BYL_MASK_BATCH;
    let ne0_low: u32 = u32(ne0) & PK_MASK; let ne1_carry: u32 = u32(ne1 + (ne0 >> 13u)) & PK_MASK;
    let t_e: u32 = (ne0_low | (ne1_carry << 13u)) & BYL_MASK_BATCH;
    let k_d: u32 = (((~t_d + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let k_e: u32 = (((~t_e + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let kd_lo: i32 = i32(k_d & PK_MASK); let kd_hi: i32 = i32(k_d >> 13u);
    let ke_lo: i32 = i32(k_e & PK_MASK); let ke_hi: i32 = i32(k_e >> 13u);

    var cd: i32 = (nd1 + kd_lo * p1 + kd_hi * p0 + ((nd0 + kd_lo * p0) >> 13u)) >> 13u;
    var ce: i32 = (ne1 + ke_lo * p1 + ke_hi * p0 + ((ne0 + ke_lo * p0) >> 13u)) >> 13u;
    var dp: i32 = d1; var ep: i32 = e1;

    for (var w: u32 = 1u; w < 10u; w = w + 1u) {
        let dw = (*d).w[w]; let ew = (*e).w[w]; let pw = pk_p_word(w);
        // even limb i = 2w
        let di_e: i32 = i32(dw & PK_MASK); let ei_e: i32 = i32(ew & PK_MASK);
        let pi_e: i32 = i32(pw & PK_MASK);
        let pim1_e: i32 = i32((pk_p_word(w - 1u) >> 13u) & PK_MASK);
        let nd_e: i32 = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd;
        let ne_e: i32 = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce;
        cd = nd_e >> 13u; ce = ne_e >> 13u;
        // odd limb i = 2w+1
        var di_o: i32; var ei_o: i32;
        if (w == 9u) {
            di_o = (i32((dw >> 13u) & PK_MASK) << 19u) >> 19u;
            ei_o = (i32((ew >> 13u) & PK_MASK) << 19u) >> 19u;
        } else {
            di_o = i32((dw >> 13u) & PK_MASK); ei_o = i32((ew >> 13u) & PK_MASK);
        }
        let pi_o: i32 = i32((pw >> 13u) & PK_MASK);
        let pim1_o: i32 = i32(pw & PK_MASK);
        let nd_o: i32 = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd;
        let ne_o: i32 = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce;
        cd = nd_o >> 13u; ce = ne_o >> 13u;
        (*d).w[w - 1u] = (u32(nd_e) & PK_MASK) | ((u32(nd_o) & PK_MASK) << 13u);
        (*e).w[w - 1u] = (u32(ne_e) & PK_MASK) | ((u32(ne_o) & PK_MASK) << 13u);
        dp = di_o; ep = ei_o;
    }
    let p_top: i32 = i32((pk_p_word(9u) >> 13u) & PK_MASK);
    let nd_top: i32 = u_hi * dp + v_hi * ep + kd_hi * p_top + cd;
    let ne_top: i32 = q_hi * dp + r_hi * ep + ke_hi * p_top + ce;
    (*d).w[9] = (u32(nd_top) & PK_MASK) | (u32(nd_top >> 13u) << 13u);
    (*e).w[9] = (u32(ne_top) & PK_MASK) | (u32(ne_top >> 13u) << 13u);
}

fn fr_inv_by_loop_pk(a: BigInt) -> BigInt {
    var f: Pk = pk_get_p();
    var g: Pk = pk_from_bigint(a);
    var d: Pk;
    var e: Pk; e.w[0] = 1u;
    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        let f_lo: vec2<u32> = pk_low_u64(&f);
        let g_lo: vec2<u32> = pk_low_u64(&g);
        let m: BylMat = byl_divsteps(&delta, f_lo, g_lo);
        pk_apply_matrix_fg(m, &f, &g);
        pk_apply_matrix_de(m, &d, &e);
        if (((iter + 1u) % BYL_REDUCE_INTERVAL) == 0u) {
            pk_reduce_to_canonical(&d);
            pk_reduce_to_canonical(&e);
        }
        if (pk_is_zero(&g)) { done = true; }
    }
    pk_reduce_to_canonical(&d);
    if (pk_is_neg_2c(&f)) { pk_neg(&d); pk_reduce_to_canonical(&d); }
    var dd: BigInt = pk_to_bigint(&d);
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&dd, &r_cubed);
}
