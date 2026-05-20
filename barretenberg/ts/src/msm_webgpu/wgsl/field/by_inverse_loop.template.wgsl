// ============================================================================
// Option "loop": register-MINIMAL Bernstein-Yang safegcd field inverse.
//
// Drop-in alternative to `fr_inv_by_a` (in by_inverse_a.template.wgsl). Same
// signature and contract:  fr_inv_by_loop(a: BigInt) -> BigInt  returns the
// Montgomery-form inverse of `a` for the BN254 scalar field `p` (= `get_p()`).
//
// WHY THIS FILE EXISTS
// --------------------
//   The MSM compute kernel is register / occupancy bound. The current
//   `by_inverse_a` apply_matrix functions are fully unrolled flat expressions
//   that materialise ~110-230 named i32 locals each (all 20 f-limbs + 20
//   g-limbs as locals, plus ~150 partial-product temporaries). That unrolled
//   apply_matrix is the per-thread REGISTER PEAK of the whole kernel, so it
//   caps achievable occupancy and therefore throughput. This file recomputes
//   the SAME safegcd math with rolling loops instead of flat unrolls, trading
//   instruction count (the kernel is NOT ALU-bound) for a much smaller live
//   register set.
//
// DESIGN
// ------
//   1. Rolling-loop apply_matrix. After BATCH=12 inner divsteps every 2x2
//      matrix entry satisfies |u,v,q,r| <= 2^12 < 2^13, so each entry fits a
//      SINGLE signed 13-bit limb (no lo/hi split). The product (u*x + v*y)
//      then has a fixed one-limb lookahead: product limb j depends only on
//      input limbs j and j-1. That collapses the multiply + carry into ONE
//      rolling loop carrying ~20 live values (carry, one previous product
//      limb, the 4 matrix entries, loop index, the BigInt pointers) instead
//      of the ~150-230 simultaneously-live locals of the unrolled form.
//
//   2. BATCH = 12 divsteps per outer round  ->  NUM_OUTER = ceil(735/12) = 62.
//      The Bernstein-Yang divstep bound for a 256-bit modulus is 735 divsteps.
//      BATCH=12 is the LARGEST batch for which every matrix entry still fits a
//      single 13-bit limb: a divstep grows |u,v,q,r| by at most a factor 2 per
//      step, so after B steps |entry| <= 2^B; 2^12 < 2^13 fits, 2^13 does not.
//      BATCH=12 also keeps the divstep window inside a SINGLE u32 (12 needed
//      bits + 20 bits of headroom for sign propagation across the 12 steps),
//      so there is no vec2<u32> window and no u64_* helpers — plain u32 ops.
//
//   3. Exact /2^12 with a 13-bit limb base. Bernstein-Yang guarantees the low
//      BATCH bits of (u*f+v*g) (resp. (q*f+r*g)) are zero, so >>12 is exact.
//      The rolling loop first forms the base-2^13 product limbs P[i], then a
//      fused one-limb-lookahead recombination emits  out[j] =
//      (P[j] >> 12) | (P[j+1] << 1)  masked to 13 bits. Both happen in the
//      same loop body (we keep the previous product limb in one register).
//
//   4. Merged f/g and d/e apply_matrix. The two are structurally identical:
//      (m_a*x + m_b*y + k*p) >> 12. f/g passes k = 0 (the k*p term folds
//      away); d/e passes the modular-cancellation coefficient k chosen so the
//      low 12 bits cancel mod p (the standard safegcd k*p trick). One
//      parametric function `byl_apply_matrix` serves both.
//
//   5. Rolling loops everywhere (divsteps, normalise, reduce-to-canonical),
//      never flat unrolled expressions, even at the cost of more instructions.
//
// ESTIMATED PER-THREAD REGISTER FOOTPRINT
// ---------------------------------------
//   `byl_apply_matrix` peak live set (the kernel's apply_matrix is what
//   currently dominates):
//     - 4 matrix entries (u/v or q/r + the two it is called with) ......  4
//     - k coefficient + p_inv scratch ..................................  2
//     - loop index i ...................................................  1
//     - rolling carry ..................................................  1
//     - previous product limb P_prev ...................................  1
//     - current s / product-limb scratch ...............................  2
//     - 2 BigInt function-pointer operands (x/y or d/e) + p ptr ......... ~3
//     - top-limb sign-extension scratch ................................  2
//     ----------------------------------------------------------------------
//     ~16-20 i32-equivalent registers, plus a handful of spill slack.
//   Compare with the current unrolled `bya_apply_matrix_fg` /
//   `bya_apply_matrix_de`: ~110-230 simultaneously-live i32 locals each.
//   Expected reduction of the kernel register PEAK: roughly an order of
//   magnitude (~150-230  ->  ~20), which is what unblocks occupancy.
//
// HOW TO WIRE IT IN
// -----------------
//   This file is a drop-in replacement for the `by_inverse_a_funcs` Mustache
//   partial. To use it:
//     - In shader_manager.ts, import this template alongside (or instead of)
//       `by_inverse_a` and expose it as a partial, e.g.
//         `import by_inverse_loop_funcs from '.../by_inverse_loop.template.wgsl'`
//       and add `by_inverse_loop_funcs` to the partials object passed to
//       `mustache.render(...)` for each shader that needs the inverse.
//     - In the consuming WGSL shader, change the call site
//         `fr_inv_by_a(...)`  ->  `fr_inv_by_loop(...)`.
//   It relies on the SAME Mustache context variables as `by_inverse_a`
//   (`{{ num_words }}`, `{{ p_inv_by_a_lo }}`) and the SAME external helpers
//   assumed in scope from sibling partials: `montgomery_product`, `get_p`,
//   `get_r_cubed`, `bigint_is_neg_2c`, `bigint_gte`, and the constants
//   `MASK`, `WORD_SIZE`, `NUM_WORDS`. All identifiers added here are
//   namespaced `byl_` / `BYL_` so this file can coexist with `by_inverse_a`'s
//   `bya_` / `BYA_` names if both partials are ever included together.
//
// STATUS
// ------
//   The math is a faithful transliteration of the tested TypeScript reference
//   `src/msm_webgpu/cuzk/bernstein_yang_a.ts` (`divsteps` + `applyMatrix`),
//   re-derived for BATCH=12 (single-limb matrix entries, lookahead-1, explicit
//   >>12 recombination) and matching `by_inverse_a`'s divstep decisions,
//   matrix accumulation, k*p modular-cancellation trick and final Montgomery
//   correction. It renders to structurally valid WGSL but has NOT been run on
//   a GPU here. Before trusting it: wire it as above and run the MSM harness
//   with `?validate=1` so the inverse is checked against the reference.
// ============================================================================

// Bernstein-Yang divstep bound for a 256-bit modulus.
//   BATCH = 12  ->  NUM_OUTER = ceil(735 / 12) = 62.
const BYL_BATCH: u32 = 12u;
const BYL_NUM_OUTER: u32 = 62u;
// Canonicalise d/e periodically so non-canonical limb magnitudes stay bounded.
const BYL_REDUCE_INTERVAL: u32 = 4u;
// Worst-case add-p / sub-p iterations to bring a value into [0, p).
const BYL_RTC_MAX_ITERS: u32 = 4u;

const BYL_MASK13: u32 = (1u << 13u) - 1u;
// Mask for the low BATCH=12 bits — used by the k*p modular-cancellation trick.
const BYL_MASK_BATCH: u32 = (1u << 12u) - 1u;

// p^(-1) mod 2^12. `{{ p_inv_by_a_lo }}` is p^(-1) mod 2^26 (Hensel-lifted);
// Hensel lifts are consistent across power-of-two moduli, so its low 12 bits
// are exactly p^(-1) mod 2^12.
const BYL_P_INV_LO12: u32 = {{ p_inv_by_a_lo }}u & BYL_MASK_BATCH;

// 2x2 transition matrix produced by BYL_BATCH divsteps. Each entry is a signed
// i32 with |entry| <= 2^12, so it fits a single signed 13-bit limb.
struct BylMat {
    u: i32,
    v: i32,
    q: i32,
    r: i32,
}

// ============================================================================
// byl_divsteps: BYL_BATCH branchy divsteps on the LOW 32 BITS of (f, g).
//
// Faithful transliteration of `divsteps` in bernstein_yang_a.ts, narrowed from
// a 64-bit vec2<u32> window to a single u32: BATCH=12 needs only 12 low bits to
// drive the decisions, and 32 bits leaves 20 bits of headroom for sign
// propagation across the 12 steps. Plain u32 ops replace the u64_* helpers
// (>>1 logical, +, -, &1 — the wrapped two's-complement low bits stay exact
// because every decision reads only bit 0).
//
// Matrix entries grow by at most one shift-left or one add per step, so after
// BYL_BATCH=12 steps |u,v,q,r| <= 2^12.
// ============================================================================
fn byl_divsteps(delta: ptr<function, i32>, f_lo_in: u32, g_lo_in: u32) -> BylMat {
    var f_lo: u32 = f_lo_in;
    var g_lo: u32 = g_lo_in;
    var u: i32 = 1;
    var v: i32 = 0;
    var q: i32 = 0;
    var r: i32 = 1;
    var d: i32 = *delta;
    for (var i: u32 = 0u; i < BYL_BATCH; i = i + 1u) {
        if ((g_lo & 1u) != 0u) {
            if (d > 0) {
                // delta > 0 and g odd: swap-and-subtract branch.
                let nf: u32 = g_lo;
                let ng: u32 = (g_lo - f_lo) >> 1u;
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
                // delta <= 0 and g odd: add-and-halve branch.
                g_lo = (g_lo + f_lo) >> 1u;
                q = q + u;
                r = r + v;
                u = u << 1u;
                v = v << 1u;
                d = d + 1;
            }
        } else {
            // g even: plain halve.
            g_lo = g_lo >> 1u;
            u = u << 1u;
            v = v << 1u;
            d = d + 1;
        }
    }
    *delta = d;
    return BylMat(u, v, q, r);
}

// ============================================================================
// byl_low_u32: low 32 bits of a 20 x 13-bit BigInt with canonical limbs.
// Limbs 0,1 contribute bits 0..25 exactly; limb 2 contributes bits 26..31
// (its low 6 bits). The high bits of limb 2 are dropped — only the low 32
// bits of the integer are needed to drive BYL_BATCH=12 divsteps.
// ============================================================================
fn byl_low_u32(x: ptr<function, BigInt>) -> u32 {
    let l0: u32 = (*x).limbs[0] & MASK;
    let l1: u32 = (*x).limbs[1] & MASK;
    let l2: u32 = (*x).limbs[2] & MASK;
    return l0 | (l1 << 13u) | (l2 << 26u);
}

// ============================================================================
// byl_normalise: carry-propagate so every limb in [0, NUM_WORDS-1) is a
// canonical 13-bit value and the top limb absorbs the signed extension.
// Rolling loop (no unroll). Mirrors `normalise` in the TS reference and
// `bya_normalise` in by_inverse_a.
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
// byl_apply_matrix: register-minimal rolling apply_matrix, MERGED for f/g and
// d/e.
//
//   Computes, in place:
//       x_new = (m_a * x + m_b * y + k * p) >> 12
//       y_new = (m_c * x + m_d * y + k2 * p) >> 12   (when do_kp != 0)
//   ... but this function does ONE row at a time:
//       out  = (ma * X + mb * Y + k * P) >> 12
//   so the caller invokes it twice per matrix (once for the f/d row, once for
//   the g/e row). Doing one row per call keeps the live set minimal — only one
//   pair (X,Y) and one output BigInt are touched.
//
// PARAMETERS
//   ma, mb : signed 13-bit matrix entries for this row (|.| <= 2^12).
//   x, y   : input BigInts (the safegcd f/g or d/e). NON-CANONICAL between
//            outer rounds: limbs are signed with |limb| <= 2^15.
//   p      : the modulus, canonical 13-bit limbs. Ignored when use_kp == 0.
//   k      : the k*p modular-cancellation coefficient, in [0, 2^12). Pass 0
//            (with use_kp == 0u) for the f/g row, which needs no k*p term.
//   use_kp : 1u to fold k*p (the d/e rows), 0u for f/g.
//   out    : destination BigInt.
//
// MATH
//   Bernstein-Yang guarantees the low 12 bits of (ma*X + mb*Y) — and, with the
//   k*p trick, of (ma*X + mb*Y + k*p) — are zero, so the >>12 is EXACT and
//   integer-correct. With BATCH=12 each matrix entry and k fit one signed
//   13-bit limb, so product limb j depends only on input limbs j and j-1:
//   a fixed ONE-limb lookahead. The rolling loop forms the base-2^13 product
//   limbs P[i] = ma*X[i] + mb*Y[i] (+ k*P_mod[i]) + carry, then a fused
//   recombination emits  out[i-1] = (P[i-1] >> 12) | (P[i] << 1)  masked to
//   13 bits. P_prev holds P[i-1] across one iteration.
//
// SIGN / RANGE
//   Limbs of x,y in [0, NUM_WORDS-2] are non-negative-ish with |.| <= 2^15
//   between rounds; the top limb x[NUM_WORDS-1] carries the signed extension
//   of the whole integer and is sign-extended via arithmetic shifts before
//   multiplying. Worst-case |s| <= |ma*X| + |mb*Y| + |k*P| + |carry|
//   <= 2^12*2^15 + 2^12*2^15 + 2^12*2^13 + small ≈ 2^28.3 < 2^31, fits i32.
// ============================================================================
fn byl_apply_matrix(
    ma: i32,
    mb: i32,
    x: ptr<function, BigInt>,
    y: ptr<function, BigInt>,
    p: ptr<function, BigInt>,
    k: i32,
    use_kp: u32,
    out: ptr<function, BigInt>,
) {
    let top: u32 = {{ num_words }}u - 1u;
    let sign_shift: u32 = 32u - WORD_SIZE;

    var carry: i32 = 0;
    // P_prev holds the previous base-2^13 product limb P[i-1]; seeded so the
    // first emitted output limb (out[0], from i = 1) is well-defined. P[0]'s
    // low 12 bits are zero by the BY exactness / k*p invariant, so only its
    // contribution to bit 12 (-> out[0] bit 0) matters and that is captured by
    // the standard (P_prev >> 12) | (P_cur << 1) recombination once P_prev is
    // the genuine P[0].
    var p_prev: i32 = 0;

    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        // Sign-extend the top limb; lower limbs are taken as-is (their stored
        // magnitude already fits and is the intended signed value).
        var xi: i32;
        var yi: i32;
        if (i == top) {
            xi = (i32((*x).limbs[i]) << sign_shift) >> sign_shift;
            yi = (i32((*y).limbs[i]) << sign_shift) >> sign_shift;
        } else {
            xi = i32((*x).limbs[i]);
            yi = i32((*y).limbs[i]);
        }

        // Base-2^13 product limb of (ma*X + mb*Y + k*P). The k*p term —
        // and the load of p[i] — is only needed for the d/e rows.
        var s: i32 = ma * xi + mb * yi + carry;
        if (use_kp != 0u) {
            s = s + k * i32((*p).limbs[i]);
        }
        let p_cur: i32 = i32(u32(s) & MASK);
        carry = s >> WORD_SIZE;

        // Fused >>12 recombination, lookahead-1: out[i-1] uses P[i-1] and P[i].
        if (i > 0u) {
            let lo: i32 = (p_prev >> 12u) & 1;
            let hi: i32 = p_cur << 1u;
            (*out).limbs[i - 1u] = u32(lo | hi) & MASK;
        }
        p_prev = p_cur;
    }

    // Top output limb: (P[top] + (carry << 13)) >> 12. The product spans
    // NUM_WORDS+1 base-2^13 limbs; `carry` after the loop is that extra
    // high limb. Sign-extend so a negative result keeps its sign.
    let lo_top: i32 = (p_prev >> 12u) & 1;
    let hi_top: i32 = carry << 1u;
    let raw_top: i32 = lo_top | hi_top;
    (*out).limbs[top] = u32((raw_top << sign_shift) >> sign_shift) & MASK;
}

// ============================================================================
// byl_apply_matrix_fg: (f, g) <- ((u*f + v*g) >> 12, (q*f + r*g) >> 12).
// Two byl_apply_matrix rows with use_kp = 0. Reads from snapshots so the f-row
// output does not corrupt the g-row inputs.
// ============================================================================
fn byl_apply_matrix_fg(m: BylMat, f: ptr<function, BigInt>, g: ptr<function, BigInt>) {
    var f_in: BigInt = *f;
    var g_in: BigInt = *g;
    // The f/g rows use use_kp = 0, so byl_apply_matrix never dereferences
    // the p pointer — pass &f_in as a harmless stand-in (no dummy BigInt).
    byl_apply_matrix(m.u, m.v, &f_in, &g_in, &f_in, 0, 0u, f);
    byl_apply_matrix(m.q, m.r, &f_in, &g_in, &f_in, 0, 0u, g);
}

// ============================================================================
// byl_apply_matrix_de: (d, e) <- ((u*d + v*e + k_d*p) >> 12,
//                                 (q*d + r*e + k_e*p) >> 12).
//
// k_d, k_e are chosen so the low 12 bits of each numerator cancel mod p,
// keeping the result an integer divisible by 2^12 and congruent mod p to
// (u*d+v*e) / (q*d+r*e). This is the standard safegcd k*p trick; it matches
// `bya_apply_matrix_de` and the d/e pass of `applyMatrix` in the TS reference.
//
//   k = ((-t) mod 2^12) * (p^-1 mod 2^12)  mod 2^12,  where t = low 12 bits
//   of the numerator-before-k*p. Because limb 0 IS the bottom limb, t is just
//   the low 12 bits of (u*d[0] + v*e[0]) — no lookahead needed to derive k.
// ============================================================================
fn byl_apply_matrix_de(
    m: BylMat,
    d: ptr<function, BigInt>,
    e: ptr<function, BigInt>,
    p: ptr<function, BigInt>,
) {
    var d_in: BigInt = *d;
    var e_in: BigInt = *e;

    let d0: i32 = i32(d_in.limbs[0]);
    let e0: i32 = i32(e_in.limbs[0]);

    // Low 12 bits of the un-cancelled numerators (limb 0 is the bottom limb).
    let t_d: u32 = u32(m.u * d0 + m.v * e0) & BYL_MASK_BATCH;
    let t_e: u32 = u32(m.q * d0 + m.r * e0) & BYL_MASK_BATCH;

    // k = (-t) * p^-1  mod 2^12.
    let neg_td: u32 = (~t_d + 1u) & BYL_MASK_BATCH;
    let neg_te: u32 = (~t_e + 1u) & BYL_MASK_BATCH;
    let k_d: i32 = i32((neg_td * BYL_P_INV_LO12) & BYL_MASK_BATCH);
    let k_e: i32 = i32((neg_te * BYL_P_INV_LO12) & BYL_MASK_BATCH);

    byl_apply_matrix(m.u, m.v, &d_in, &e_in, p, k_d, 1u, d);
    byl_apply_matrix(m.q, m.r, &d_in, &e_in, p, k_e, 1u, e);
}

// ============================================================================
// Driver helpers — rolling loops, mirrors of the by_inverse_a / TS equivalents.
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
// fr_inv_by_loop: Bernstein-Yang safegcd inverse driver.
//   BATCH = 12, NUM_OUTER = 62, on the 20 x 13-bit BigInt representation.
//   Register-minimal rolling apply_matrix.
//
// Same signature/contract as `fr_inv_by_a`: returns the Montgomery-form
// inverse of `a`. The caller is responsible for the a == 0 case (the TS
// reference returns 0 for a == 0; this driver, like `fr_inv_by_a`, assumes a
// nonzero input from the batch-inverse prefix product).
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
        let f_lo: u32 = byl_low_u32(&f);
        let g_lo: u32 = byl_low_u32(&g);
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
