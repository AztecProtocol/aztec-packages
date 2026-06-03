// ============================================================================
// PACKED 13-bit Bernstein-Yang safegcd field inverse (fr_inv_by_loop_pk).
//
// Fully-expanded, hand-editable WGSL — NO mustache. This is the LIVE inverse
// for the 13-bit (cios_unrolled) MSM walker / reduce path. Optimise it here.
//
// Representation: f,g,d,e,p are 2x13-bit limbs per u32 word, 10 words = 260
// bits (limb 2w in bits 0..12, limb 2w+1 in bits 13..25 of word w). All
// arithmetic is i32/13-bit (no 64-bit emulation). Algorithm: BATCH=26,
// NUM_OUTER=29 divsteps; the k*p trick cancels the low 26 bits of (d,e).
//
// External symbols (resolved by the assembled module, NOT defined here):
//   - u64_low_bit / u64_sub / u64_add / u64_shr1   (bigint_by)  — byl_divsteps
//   - get_p / get_r_cubed                           (field)
//   - montgomery_product                            (montmul partial)
//   - P_LIMB_0 .. P_LIMB_19                          (montmul partial) — pk_p_word
//   - MASK (= 0x1fff), WORD_SIZE (= 13)             (module constants)
//
// Baked constant: BYL_P_INV_LO = p^(-1) mod 2^26 = 58301559 (BN254 Fr).
//
// NOTE: never write Mustache double-brace tags inside comments — the inliner renders
// them regardless of // and would corrupt the shader.
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
const BYL_P_INV_LO: u32 = 58301559u;

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
        let g_odd: bool = bool(g_lo.x & 1u);
        let swap: bool = g_odd && (d > 0);
        let addc: bool = g_odd && (d <= 0);

        // g-f and g+f on the low 64 bits (two's-complement wrap); the unused one
        // is discarded by the select. The high word takes the borrow/carry out of
        // the low word as u32(comparison): sub borrows iff g.x < f.x; add carries
        // iff the wrapped sum is below an operand.
        var g_minus_f: vec2<u32>;
        g_minus_f.x = g_lo.x - f_lo.x;
        g_minus_f.y = g_lo.y - f_lo.y - u32(g_lo.x < f_lo.x);
        var g_plus_f: vec2<u32>;
        g_plus_f.x = g_lo.x + f_lo.x;
        g_plus_f.y = g_lo.y + f_lo.y + u32(g_plus_f.x < g_lo.x);
        let g_pre: vec2<u32> = select(select(g_lo, g_plus_f, addc), g_minus_f, swap);

        let new_f: vec2<u32> = select(f_lo, g_lo, swap);
        // g_pre >> 1 (logical 64-bit): low word pulls in bit 0 of the high word.
        let new_g = vec2<u32>((g_pre.x >> 1u) | ((g_pre.y & 1u) << 31u), g_pre.y >> 1u);
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

struct Pk { w: array<u32, 10> }

fn pk_from_bigint(x: BigInt) -> Pk {
    var o: Pk;
    o.w[0u] = (x.limbs[0u]  & MASK) | ((x.limbs[1u]  & MASK) << 13u);
    o.w[1u] = (x.limbs[2u]  & MASK) | ((x.limbs[3u]  & MASK) << 13u);
    o.w[2u] = (x.limbs[4u]  & MASK) | ((x.limbs[5u]  & MASK) << 13u);
    o.w[3u] = (x.limbs[6u]  & MASK) | ((x.limbs[7u]  & MASK) << 13u);
    o.w[4u] = (x.limbs[8u]  & MASK) | ((x.limbs[9u]  & MASK) << 13u);
    o.w[5u] = (x.limbs[10u] & MASK) | ((x.limbs[11u] & MASK) << 13u);
    o.w[6u] = (x.limbs[12u] & MASK) | ((x.limbs[13u] & MASK) << 13u);
    o.w[7u] = (x.limbs[14u] & MASK) | ((x.limbs[15u] & MASK) << 13u);
    o.w[8u] = (x.limbs[16u] & MASK) | ((x.limbs[17u] & MASK) << 13u);
    o.w[9u] = (x.limbs[18u] & MASK) | ((x.limbs[19u] & MASK) << 13u);
    return o;
}

fn pk_to_bigint(x: ptr<function, Pk>) -> BigInt {
    var o: BigInt;
    let w0 = (*x).w[0u]; o.limbs[0u]  = w0 & MASK; o.limbs[1u]  = (w0 >> 13u) & MASK;
    let w1 = (*x).w[1u]; o.limbs[2u]  = w1 & MASK; o.limbs[3u]  = (w1 >> 13u) & MASK;
    let w2 = (*x).w[2u]; o.limbs[4u]  = w2 & MASK; o.limbs[5u]  = (w2 >> 13u) & MASK;
    let w3 = (*x).w[3u]; o.limbs[6u]  = w3 & MASK; o.limbs[7u]  = (w3 >> 13u) & MASK;
    let w4 = (*x).w[4u]; o.limbs[8u]  = w4 & MASK; o.limbs[9u]  = (w4 >> 13u) & MASK;
    let w5 = (*x).w[5u]; o.limbs[10u] = w5 & MASK; o.limbs[11u] = (w5 >> 13u) & MASK;
    let w6 = (*x).w[6u]; o.limbs[12u] = w6 & MASK; o.limbs[13u] = (w6 >> 13u) & MASK;
    let w7 = (*x).w[7u]; o.limbs[14u] = w7 & MASK; o.limbs[15u] = (w7 >> 13u) & MASK;
    let w8 = (*x).w[8u]; o.limbs[16u] = w8 & MASK; o.limbs[17u] = (w8 >> 13u) & MASK;
    let w9 = (*x).w[9u]; o.limbs[18u] = w9 & MASK; o.limbs[19u] = (w9 >> 13u) & MASK;
    return o;
}

fn pk_get_p() -> Pk { return pk_from_bigint(get_p()); }

// Packed modulus word w (limb 2w | limb(2w+1)<<13) as a compile-time
// immediate, from the module-scope P_i consts (montmul partial, always
// co-included). No per-thread modulus copy in scratch.
fn pk_p_word(w: u32) -> u32 {
    switch w {
        case 0u: { return P_LIMB_0 | (P_LIMB_1 << 13u); }
        case 1u: { return P_LIMB_2 | (P_LIMB_3 << 13u); }
        case 2u: { return P_LIMB_4 | (P_LIMB_5 << 13u); }
        case 3u: { return P_LIMB_6 | (P_LIMB_7 << 13u); }
        case 4u: { return P_LIMB_8 | (P_LIMB_9 << 13u); }
        case 5u: { return P_LIMB_10 | (P_LIMB_11 << 13u); }
        case 6u: { return P_LIMB_12 | (P_LIMB_13 << 13u); }
        case 7u: { return P_LIMB_14 | (P_LIMB_15 << 13u); }
        case 8u: { return P_LIMB_16 | (P_LIMB_17 << 13u); }
        default: { return P_LIMB_18 | (P_LIMB_19 << 13u); }
    }
}

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
    let a = (*x).w[0u] | (*x).w[1u] | (*x).w[2u] | (*x).w[3u] | (*x).w[4u]
          | (*x).w[5u] | (*x).w[6u] | (*x).w[7u] | (*x).w[8u] | (*x).w[9u];
    return a == 0u;
}

// Sign bit of the 260-bit value = bit 12 of limb 19 = bit 25 of word 9.
fn pk_is_neg_2c(x: ptr<function, Pk>) -> bool { return (((*x).w[9] >> 25u) & 1u) == 1u; }

// Signed carry-propagate normalisation, 2 limbs/word; limb 19 (top) absorbs.
// Fully unrolled: `c` (the inter-limb carry) threads through; word 9 omits the
// final high-carry propagation (the top limb absorbs it).
fn pk_normalise(x: ptr<function, Pk>) {
    var c: i32 = 0;
    { let wd = (*x).w[0u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[0u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[1u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[1u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[2u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[2u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[3u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[3u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[4u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[4u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[5u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[5u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[6u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[6u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[7u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[7u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[8u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[8u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[9u]; let lo = i32(wd & MASK) + c; c = lo >> 13u; let hi = i32((wd >> 13u) & MASK) + c;               (*x).w[9u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
}

// out = x + p, carry-propagated (combines add + normalise). Top limb absorbs.
fn pk_add_p(x: ptr<function, Pk>) {
    var c: i32 = 0;
    { let xw = (*x).w[0u]; let pw = pk_p_word(0u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[0u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[1u]; let pw = pk_p_word(1u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[1u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[2u]; let pw = pk_p_word(2u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[2u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[3u]; let pw = pk_p_word(3u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[3u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[4u]; let pw = pk_p_word(4u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[4u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[5u]; let pw = pk_p_word(5u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[5u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[6u]; let pw = pk_p_word(6u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[6u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[7u]; let pw = pk_p_word(7u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[7u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[8u]; let pw = pk_p_word(8u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[8u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[9u]; let pw = pk_p_word(9u); let lo = i32(xw & MASK) + i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c;               (*x).w[9u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
}

fn pk_sub_p(x: ptr<function, Pk>) {
    var c: i32 = 0;
    { let xw = (*x).w[0u]; let pw = pk_p_word(0u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[0u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[1u]; let pw = pk_p_word(1u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[1u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[2u]; let pw = pk_p_word(2u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[2u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[3u]; let pw = pk_p_word(3u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[3u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[4u]; let pw = pk_p_word(4u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[4u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[5u]; let pw = pk_p_word(5u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[5u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[6u]; let pw = pk_p_word(6u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[6u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[7u]; let pw = pk_p_word(7u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[7u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[8u]; let pw = pk_p_word(8u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[8u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let xw = (*x).w[9u]; let pw = pk_p_word(9u); let lo = i32(xw & MASK) - i32(pw & MASK) + c; c = lo >> 13u; let hi = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c;               (*x).w[9u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
}

fn pk_neg(x: ptr<function, Pk>) {
    var c: i32 = 0;
    { let wd = (*x).w[0u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[0u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[1u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[1u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[2u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[2u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[3u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[3u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[4u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[4u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[5u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[5u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[6u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[6u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[7u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[7u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[8u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c; c = hi >> 13u; (*x).w[8u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
    { let wd = (*x).w[9u]; let lo = -i32(wd & MASK) + c; c = lo >> 13u; let hi = -i32((wd >> 13u) & MASK) + c;               (*x).w[9u] = (u32(lo) & MASK) | ((u32(hi) & MASK) << 13u); }
}

// x >= p ? (compare from limb 19 down, i.e. word 9 → word 0).
fn pk_gte(x: ptr<function, Pk>) -> bool {
    { let pw = pk_p_word(9u); let xhi = ((*x).w[9u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[9u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(8u); let xhi = ((*x).w[8u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[8u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(7u); let xhi = ((*x).w[7u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[7u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(6u); let xhi = ((*x).w[6u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[6u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(5u); let xhi = ((*x).w[5u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[5u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(4u); let xhi = ((*x).w[4u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[4u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(3u); let xhi = ((*x).w[3u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[3u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(2u); let xhi = ((*x).w[2u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[2u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(1u); let xhi = ((*x).w[1u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[1u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
    { let pw = pk_p_word(0u); let xhi = ((*x).w[0u] >> 13u) & MASK; let phi = (pw >> 13u) & MASK; if (xhi > phi) { return true; } if (xhi < phi) { return false; } let xlo = (*x).w[0u] & MASK; let plo = pw & MASK; if (xlo > plo) { return true; } if (xlo < plo) { return false; } }
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
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;
    var cf: i32 = 0; var cg: i32 = 0; var fp: i32 = 0; var gp: i32 = 0;
    // w=0: fp=gp=0; no trailing write (w-1 out of range).
    // what's going on here?
    // gw = limb
    // u_lo = ? some rolling variable
    // u_lo * (prime const)
    { let fw = (*f).w[0u]; let gw = (*g).w[0u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      fp = fo; gp = go; }
    { let fw = (*f).w[1u]; let gw = (*g).w[1u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[0u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[0u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    { let fw = (*f).w[2u]; let gw = (*g).w[2u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[1u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[1u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    { let fw = (*f).w[3u]; let gw = (*g).w[3u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[2u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[2u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    { let fw = (*f).w[4u]; let gw = (*g).w[4u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[3u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[3u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    { let fw = (*f).w[5u]; let gw = (*g).w[5u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[4u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[4u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    { let fw = (*f).w[6u]; let gw = (*g).w[6u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[5u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[5u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    { let fw = (*f).w[7u]; let gw = (*g).w[7u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[6u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[6u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    { let fw = (*f).w[8u]; let gw = (*g).w[8u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = i32((fw >> 13u) & MASK); let go = i32((gw >> 13u) & MASK);
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[7u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[7u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    // w=9 (top): odd limb is sign-extended; trailing write of w-1=8.
    { let fw = (*f).w[9u]; let gw = (*g).w[9u]; let fe = i32(fw & MASK); let ge = i32(gw & MASK);
      let nfe = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf; let nge = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg; cf = nfe >> 13u; cg = nge >> 13u;
      let fo = (i32((fw >> 13u) & MASK) << 19u) >> 19u; let go = (i32((gw >> 13u) & MASK) << 19u) >> 19u;
      let nfo = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf; let ngo = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg; cf = nfo >> 13u; cg = ngo >> 13u;
      (*f).w[8u] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u); (*g).w[8u] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u); fp = fo; gp = go; }
    let nft: i32 = u_hi * fp + v_hi * gp + cf;
    let ngt: i32 = q_hi * fp + r_hi * gp + cg;
    (*f).w[9] = (u32(nft) & MASK) | (u32(nft >> 13u) << 13u);
    (*g).w[9] = (u32(ngt) & MASK) | (u32(ngt >> 13u) << 13u);
}

// (d,e) <- ((u*d+v*e+k_d*p)>>26, (q*d+r*e+k_e*p)>>26). k*p cancels low 26 bits.
fn pk_apply_matrix_de(m: BylMat, d: ptr<function, Pk>, e: ptr<function, Pk>) {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;

    let dw0 = (*d).w[0]; let ew0 = (*e).w[0]; let pw0 = pk_p_word(0u);
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

    // w=1..9 unrolled. Each word: even limb (2w) then odd limb (2w+1), carries
    // cd/ce threaded, window dp/ep = previous odd limb; the trailing write lands
    // word w-1 (>>26 = drop 2 limbs). pi_e=pw_lo, pim1_e=p(w-1)_hi, pi_o=pw_hi,
    // pim1_o=pw_lo. Only w=9's odd limb is sign-extended.
    { let dw = (*d).w[1u]; let ew = (*e).w[1u]; let pw = pk_p_word(1u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(0u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[0u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[0u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    { let dw = (*d).w[2u]; let ew = (*e).w[2u]; let pw = pk_p_word(2u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(1u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[1u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[1u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    { let dw = (*d).w[3u]; let ew = (*e).w[3u]; let pw = pk_p_word(3u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(2u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[2u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[2u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    { let dw = (*d).w[4u]; let ew = (*e).w[4u]; let pw = pk_p_word(4u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(3u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[3u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[3u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    { let dw = (*d).w[5u]; let ew = (*e).w[5u]; let pw = pk_p_word(5u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(4u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[4u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[4u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    { let dw = (*d).w[6u]; let ew = (*e).w[6u]; let pw = pk_p_word(6u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(5u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[5u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[5u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    { let dw = (*d).w[7u]; let ew = (*e).w[7u]; let pw = pk_p_word(7u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(6u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[6u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[6u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    { let dw = (*d).w[8u]; let ew = (*e).w[8u]; let pw = pk_p_word(8u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(7u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = i32((dw >> 13u) & MASK); let ei_o = i32((ew >> 13u) & MASK); let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[7u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[7u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    // w=9 (top): odd limb sign-extended; trailing write of w-1=8.
    { let dw = (*d).w[9u]; let ew = (*e).w[9u]; let pw = pk_p_word(9u);
      let di_e = i32(dw & MASK); let ei_e = i32(ew & MASK); let pi_e = i32(pw & MASK); let pim1_e = i32((pk_p_word(8u) >> 13u) & MASK);
      let nd_e = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd; let ne_e = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce; cd = nd_e >> 13u; ce = ne_e >> 13u;
      let di_o = (i32((dw >> 13u) & MASK) << 19u) >> 19u; let ei_o = (i32((ew >> 13u) & MASK) << 19u) >> 19u; let pi_o = i32((pw >> 13u) & MASK); let pim1_o = i32(pw & MASK);
      let nd_o = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd; let ne_o = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce; cd = nd_o >> 13u; ce = ne_o >> 13u;
      (*d).w[8u] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u); (*e).w[8u] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u); dp = di_o; ep = ei_o; }
    let p_top: i32 = i32((pk_p_word(9u) >> 13u) & MASK);
    let nd_top: i32 = u_hi * dp + v_hi * ep + kd_hi * p_top + cd;
    let ne_top: i32 = q_hi * dp + r_hi * ep + ke_hi * p_top + ce;
    (*d).w[9] = (u32(nd_top) & MASK) | (u32(nd_top >> 13u) << 13u);
    (*e).w[9] = (u32(ne_top) & MASK) | (u32(ne_top >> 13u) << 13u);
}

fn fr_inv_by_loop_pk(a: BigInt) -> BigInt {
    var f: Pk = pk_get_p();
    var g: Pk = pk_from_bigint(a);
    var d: Pk;
    var e: Pk; e.w[0] = 1u;
    var delta: i32 = 1;
    var done: bool = false;
    // NUM_OUTER = 29 = 7*4 + 1. The outer loop is unrolled by BYL_REDUCE_INTERVAL
    // (=4): each group runs 4 divstep batches then one (d,e) canonicalisation, so
    // the reduce cadence is structural — the (iter+1)%4 test is gone. One leftover
    // batch (the 29th) follows with no reduce. `done` short-circuits spent lanes;
    // the group-end reduce is unconditional (idempotent on an already-final d/e).
    for (var grp: u32 = 0u; grp < 7u; grp = grp + 1u) {
        if (!done) {
            let f_lo = pk_low_u64(&f); let g_lo = pk_low_u64(&g);
            let m = byl_divsteps(&delta, f_lo, g_lo);
            pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e);
            if (pk_is_zero(&g)) { done = true; }
        }
        if (!done) {
            let f_lo = pk_low_u64(&f); let g_lo = pk_low_u64(&g);
            let m = byl_divsteps(&delta, f_lo, g_lo);
            pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e);
            if (pk_is_zero(&g)) { done = true; }
        }
        if (!done) {
            let f_lo = pk_low_u64(&f); let g_lo = pk_low_u64(&g);
            let m = byl_divsteps(&delta, f_lo, g_lo);
            pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e);
            if (pk_is_zero(&g)) { done = true; }
        }
        if (!done) {
            let f_lo = pk_low_u64(&f); let g_lo = pk_low_u64(&g);
            let m = byl_divsteps(&delta, f_lo, g_lo);
            pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e);
            if (pk_is_zero(&g)) { done = true; }
        }
        pk_reduce_to_canonical(&d);
        pk_reduce_to_canonical(&e);
    }
    // 29th batch: no group reduce after it (matches 29 % 4 == 1).
    if (!done) {
        let f_lo = pk_low_u64(&f); let g_lo = pk_low_u64(&g);
        let m = byl_divsteps(&delta, f_lo, g_lo);
        pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e);
        if (pk_is_zero(&g)) { done = true; }
    }
    pk_reduce_to_canonical(&d);
    if (pk_is_neg_2c(&f)) { pk_neg(&d); pk_reduce_to_canonical(&d); }
    var dd: BigInt = pk_to_bigint(&d);
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&dd, &r_cubed);
}
