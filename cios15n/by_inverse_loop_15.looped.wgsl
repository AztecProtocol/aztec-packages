// ============================================================================
// 15-bit Bernstein-Yang safegcd field inverse — fr_inv_by_loop_pk15 (PACKED).
//
// SINGLE-LANE jumpy safegcd (Pornin K-step, K=15), state PACKED 2x15-bit limbs
// per u32 word => 9 words (Pk9) for f,g,u,v. Three design choices, all for the
// register-bound phone:
//   * single-lane: matrix row-sum <=2^K times a 15-bit limb => each column is
//     2 products of <=2^30 in ONE i32 lane (no 2-word macc, ~3 ops/limb).
//   * K=15 (the single-lane max, 2^30<2^31): fewest outer iters => least apply
//     work, since apply cost = NUM_OUTER*O(words). K=15 => 49 outer vs K=12 => 62.
//   * packed 9 words (not unpacked 18): HALVES per-thread private memory, the
//     dominant occupancy lever on Mali. 9 words even beats 13-bit pk's 10.
// 18 limbs (not 17): axby_modp_halve_k's pre-normalize value is in [-3p,3p].
// All host-validated bit-exact (cios15n/by15_jumpy_packed.mjs). BN254 Fq;
// p-limbs / p^-1 mod 2^15 baked. Relies on montgomery_product + get_r_cubed.
// NOTE: never write Mustache tags in these comments.
// ============================================================================

// K=15 is the MAX for a single-lane i32 apply: a product column is bounded by
// 2^(15+K) (matrix row-sum <=2^K times a 15-bit limb), so K=15 => 2^30 < 2^31.
// NUM_OUTER is ALGEBRAIC, not tuned: Bernstein-Yang (2019) prove the divstep
// recurrence drives g->0 within floor((49d+57)/17) divsteps for EVERY d-bit
// input. BN254 Fq is d=254 => 735 (the same bound the audited 13-bit pk uses).
// NUM_OUTER = ceil(735/K). K=15 => 49 (exactly 735 divsteps). Failure prob = 0.
// The single 15-bit low limb yields 15 EXACT divstep decisions (carries in g+-f
// propagate upward, so bit i depends only on bits 0..i; K bits => K exact steps).
const PK15_K: u32 = 15u;
const PK15_MAX_OUTER: u32 = 49u;           // ceil(735/15) — B-Y worst case, deterministic
const PK15_MASK: u32 = 32767u;             // 2^15 - 1
const PK15_KMASK: u32 = 32767u;            // 2^K - 1 (K=15) == MASK
const PK15_BOT: u32 = 0u;                  // WORD_SIZE - K = 15 - 15
const PK15_PINV: u32 = 7287u;              // p^-1 mod 2^15

struct Pk9 { w: array<u32, 9> }            // 9 words = 18 x 15-bit limbs (2/word)

fn pk15_p(i: u32) -> u32 {
    switch i {
        case 0u:  { return 32071u; } case 1u:  { return 12537u; } case 2u:  { return 12379u; }
        case 3u:  { return 24836u; } case 4u:  { return 10451u; } case 5u:  { return 3641u; }
        case 6u:  { return 9306u; }  case 7u:  { return 16565u; } case 8u:  { return 23959u; }
        case 9u:  { return 688u; }   case 10u: { return 23046u; } case 11u: { return 557u; }
        case 12u: { return 7045u; }  case 13u: { return 13317u; } case 14u: { return 14412u; }
        case 15u: { return 10041u; } case 16u: { return 12388u; } default:  { return 0u; }
    }
}
fn pk15_pw(w: u32) -> u32 { return pk15_p(2u * w) | (pk15_p(2u * w + 1u) << 15u); }  // packed p word
fn pk15_sext(limb: u32) -> i32 { return (i32(limb) << 17u) >> 17u; }

fn pk15_is_zero(x: ptr<function, Pk9>) -> bool { var a: u32 = 0u; for (var w: u32 = 0u; w < 9u; w = w + 1u) { a = a | (*x).w[w]; } return a == 0u; }
fn pk15_is_neg(x: ptr<function, Pk9>) -> bool { return (((*x).w[8] >> 29u) & 1u) == 1u; }  // bit 14 of limb 17

fn pk15_add_p(x: ptr<function, Pk9>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let pw = pk15_pw(w);
        let e = i32((*x).w[w] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[w] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (w != 8u) { c = o >> 15u; }
        (*x).w[w] = le | (lo << 15u);
    }
}
fn pk15_sub_p(x: ptr<function, Pk9>) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let pw = pk15_pw(w);
        let e = i32((*x).w[w] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[w] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (w != 8u) { c = o >> 15u; }
        (*x).w[w] = le | (lo << 15u);
    }
}
fn pk15_gte(x: ptr<function, Pk9>) -> bool {
    for (var idx: u32 = 0u; idx < 18u; idx = idx + 1u) {
        let i = 17u - idx; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
    return true;
}
fn pk15_norm_modp(x: ptr<function, Pk9>) {
    for (var i: u32 = 0u; i < 4u; i = i + 1u) { if (pk15_is_neg(x)) { pk15_add_p(x); } else { break; } }
    for (var i: u32 = 0u; i < 4u; i = i + 1u) { if (pk15_gte(x)) { pk15_sub_p(x); } else { break; } }
}
fn pk15_neg_modp(x: ptr<function, Pk9>) {
    var borrow: i32 = 0;
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let pw = pk15_pw(w);
        let e = i32(pw & PK15_MASK) - i32((*x).w[w] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[w] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[w] = le | (lo << 15u);
    }
}

// (f,g) <- (x*a + y*b) >> K. Single-lane product limbs, packed; then >>K recombine.
fn pk15_axby_shr_k(a: ptr<function, Pk9>, x: i32, b: ptr<function, Pk9>, y: i32, out: ptr<function, Pk9>) {
    var acc: array<u32, 9>;
    var carry: i32 = 0;
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let pe = i32((*a).w[w] & PK15_MASK) * x + i32((*b).w[w] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (w == 8u) { fo = pk15_sext((*a).w[w] >> 15u); go = pk15_sext((*b).w[w] >> 15u); }
        else { fo = i32(((*a).w[w] >> 15u) & PK15_MASK); go = i32(((*b).w[w] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[w] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let ae = acc[w] & PK15_MASK; let ao = (acc[w] >> 15u) & PK15_MASK;
        var nextE: u32; if (w == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[w + 1u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[w] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
}

// (u,v) <- halve_mod_p((x*a + y*b), K) = (x*a + y*b)*2^-K mod p, in [0,p).
fn pk15_axby_modp_halve_k(a: ptr<function, Pk9>, x: i32, b: ptr<function, Pk9>, y: i32, out: ptr<function, Pk9>) {
    var acc: array<u32, 9>;
    var carry: i32 = 0;
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let pe = i32((*a).w[w] & PK15_MASK) * x + i32((*b).w[w] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (w == 8u) { fo = pk15_sext((*a).w[w] >> 15u); go = pk15_sext((*b).w[w] >> 15u); }
        else { fo = i32(((*a).w[w] >> 15u) & PK15_MASK); go = i32(((*b).w[w] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[w] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
    let lo_k = acc[0] & PK15_KMASK;
    let m = ((((PK15_KMASK + 1u) - lo_k) & PK15_KMASK) * PK15_PINV) & PK15_KMASK;
    var mp: u32 = 0u;
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let e = (acc[w] & PK15_MASK) + pk15_p(2u * w) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[w] >> 15u) & PK15_MASK) + pk15_p(2u * w + 1u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[w] = le | (lo << 15u);
    }
    let new_carry = carry + i32(mp);
    for (var w: u32 = 0u; w < 9u; w = w + 1u) {
        let ae = acc[w] & PK15_MASK; let ao = (acc[w] >> 15u) & PK15_MASK;
        var nextE: u32; if (w == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[w + 1u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[w] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
    pk15_norm_modp(out);
}

fn fr_inv_by_loop_pk15(a: BigInt) -> BigInt {
    var f: Pk9; var g: Pk9; var u: Pk9; var v: Pk9;
    for (var w: u32 = 0u; w < 9u; w = w + 1u) { f.w[w] = pk15_pw(w); g.w[w] = 0u; u.w[w] = 0u; v.w[w] = 0u; }
    for (var i: u32 = 0u; i < 17u; i = i + 1u) { g.w[i >> 1u] = g.w[i >> 1u] | (a.limbs[i] << ((i & 1u) * 15u)); }
    v.w[0] = 1u;
    var delta: i32 = 1;
    var found = false;
    for (var outer: u32 = 0u; outer < PK15_MAX_OUTER; outer = outer + 1u) {
        if (pk15_is_zero(&g)) { found = true; break; }
        var u00: i32 = 1; var u01: i32 = 0; var u10: i32 = 0; var u11: i32 = 1;
        var fi: i32 = i32(f.w[0] & PK15_MASK); var gi: i32 = i32(g.w[0] & PK15_MASK); var d: i32 = delta;
        for (var i: u32 = 0u; i < PK15_K; i = i + 1u) {
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
        delta = d;
        var nf: Pk9; var ng: Pk9;
        pk15_axby_shr_k(&f, u00, &g, u01, &nf);
        pk15_axby_shr_k(&f, u10, &g, u11, &ng);
        f = nf; g = ng;
        var nu: Pk9; var nv: Pk9;
        pk15_axby_modp_halve_k(&u, u00, &v, u01, &nu);
        pk15_axby_modp_halve_k(&u, u10, &v, u11, &nv);
        u = nu; v = nv;
    }
    pk15_norm_modp(&u);
    if (pk15_is_neg(&f)) { pk15_neg_modp(&u); }
    var d17: BigInt;
    for (var i: u32 = 0u; i < 17u; i = i + 1u) { d17.limbs[i] = (u.w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; }
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&d17, &r_cubed);
}
