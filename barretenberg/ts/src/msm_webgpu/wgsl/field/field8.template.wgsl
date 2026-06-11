// === The 8x u32 field representation — the ONE field interface. ===
// Field elements are `array<u32, 8>`: the canonical 256-bit packed form,
// which is ALSO the storage form, so loads/stores are plain 8-word copies.
// Live values cost 8 registers each. The multiply (the injected
// montgomery_product_f8 body) extracts its 13-bit limbs internally with
// compile-time shifts; add / sub / is_zero run natively on the 8 words.
//
// LAZY-REDUCTION CONTRACT (BN254: p = 0.189*2^256, R = 2^260, R/p = 84.6):
//   - STORED field elements (buffers and cross-iteration registers) lie in
//     [0, 2p). Canonical [0, p) holds only at the algorithm boundary: the
//     decompressed SRS coming in, and the host decode (which multiplies by
//     R^-1 mod p) going out.
//   - montgomery_product_f8 has NO final reduce: for ANY 8x u32 inputs the
//     result t < p + a*b/R <= p(1 + 28/84.6) < 1.34p. Inputs k1*p x k2*p
//     give t < p(1 + k1*k2/84.6).
//   - fr_add_f8 / fr_sub_f8 reduce against 2p: [0,2p) x [0,2p) -> [0,2p).
//   - fr_neg_wide_f8 (2p - y, one chain, no conditional) is the only
//     unreduced op: negated pool y's stay in (0, 2p). Wider transients were
//     tried and reverted — they save ~0.4% ALU but push Mali's allocator
//     into extra spilling (malioc: +64 B walker spill, +5-11 LS cycles).
//   - The all-zero bit pattern stays reserved for infinity sentinels:
//     fr_neg_wide_f8 cannot produce it (results are strictly positive), and
//     montgomery_product_f8 maps exact-zero inputs to exact zero.

// p and 2p as eight 32-bit words (p < 2^255, so 2p fits in 256 bits).
const P8_0: u32 = 3632069959u;
const P8_1: u32 = 1008765974u;
const P8_2: u32 = 1752287885u;
const P8_3: u32 = 2541841041u;
const P8_4: u32 = 2172737629u;
const P8_5: u32 = 3092268470u;
const P8_6: u32 = 3778125865u;
const P8_7: u32 = 811880050u;
const TWOP8_0: u32 = 2969172622u;
const TWOP8_1: u32 = 2017531949u;
const TWOP8_2: u32 = 3504575770u;
const TWOP8_3: u32 = 788714786u;
const TWOP8_4: u32 = 50507963u;
const TWOP8_5: u32 = 1889569645u;
const TWOP8_6: u32 = 3261284435u;
const TWOP8_7: u32 = 1623760101u;

// R mod p (Montgomery one) as 8x u32 — the montgomery_product identity.
fn get_r_f8() -> array<u32, 8> {
    return array<u32, 8>(4143768756u, 1163004032u, 3131673000u, 1233717321u, 2173632842u, 2242453533u, 465007183u, 521552462u);
}

// is_zero on the 8x u32 form. Valid on sentinels (exact zero stores) — a
// [0,2p) value that is ≡ 0 mod p but represented as p does NOT match; see
// the contract note above for why no live value ever needs that test.
fn is_zero_f8(v: array<u32, 8>) -> bool {
    return (v[0] | v[1] | v[2] | v[3] | v[4] | v[5] | v[6] | v[7]) == 0u;
}

// The packed Montgomery multiply body (karat or cios_unrolled — same
// montgomery_product_f8 symbol, selected by ShaderManager's montmul).
{{> montgomery_product_f8_native }}

// The matching Montgomery square: montgomery_square_f8(v) ≡
// montgomery_product_f8(v, v) with ~24% (cios) / ~14% (karat) fewer int32
// muls. Same lazy contract (any input, output < 1.34p). Kernels that never
// square carry it as dead code, which the drivers compile for free.
{{> montgomery_square_f8_native }}

// Native 8x u32 fr_add / fr_sub — 8-word add / sub, reduced against 2p.
// WGSL has no add-with-carry, so the carry out of each word is
// `u32(sum < operand)` (one compare, no branch). a, b in [0, 2p).
// First and last words are emitted outside the unrolled middle: word 0 has
// no carry-in (one compare, no add), and word 7 emits no carry-out unless
// it is the chain's predicate. Mirrors the C++ field's coarse add/sub.
fn fr_add_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var s: array<u32, 8>;
    s[0] = a[0] + b[0];
    var carry: u32 = u32(s[0] < a[0]);
    {
        let lo: u32 = a[1] + b[1];
        let v: u32 = lo + carry;
        s[1] = v;
        carry = u32(lo < a[1]) + u32(v < lo);
    }
    {
        let lo: u32 = a[2] + b[2];
        let v: u32 = lo + carry;
        s[2] = v;
        carry = u32(lo < a[2]) + u32(v < lo);
    }
    {
        let lo: u32 = a[3] + b[3];
        let v: u32 = lo + carry;
        s[3] = v;
        carry = u32(lo < a[3]) + u32(v < lo);
    }
    {
        let lo: u32 = a[4] + b[4];
        let v: u32 = lo + carry;
        s[4] = v;
        carry = u32(lo < a[4]) + u32(v < lo);
    }
    {
        let lo: u32 = a[5] + b[5];
        let v: u32 = lo + carry;
        s[5] = v;
        carry = u32(lo < a[5]) + u32(v < lo);
    }
    {
        let lo: u32 = a[6] + b[6];
        let v: u32 = lo + carry;
        s[6] = v;
        carry = u32(lo < a[6]) + u32(v < lo);
    }
    s[7] = a[7] + b[7] + carry;
    // s = a + b in [0, 4p); subtract 2p iff s >= 2p — the s - 2p borrow
    // chain underflows exactly when s < 2p (word 7's borrow-out is the
    // predicate, so it is kept).
    var d: array<u32, 8>;
    d[0] = s[0] - TWOP8_0;
    var borrow: u32 = u32(s[0] < TWOP8_0);
    {
        let t1: u32 = s[1] - TWOP8_1;
        let v: u32 = t1 - borrow;
        d[1] = v;
        borrow = u32(s[1] < TWOP8_1) + u32(t1 < borrow);
    }
    {
        let t1: u32 = s[2] - TWOP8_2;
        let v: u32 = t1 - borrow;
        d[2] = v;
        borrow = u32(s[2] < TWOP8_2) + u32(t1 < borrow);
    }
    {
        let t1: u32 = s[3] - TWOP8_3;
        let v: u32 = t1 - borrow;
        d[3] = v;
        borrow = u32(s[3] < TWOP8_3) + u32(t1 < borrow);
    }
    {
        let t1: u32 = s[4] - TWOP8_4;
        let v: u32 = t1 - borrow;
        d[4] = v;
        borrow = u32(s[4] < TWOP8_4) + u32(t1 < borrow);
    }
    {
        let t1: u32 = s[5] - TWOP8_5;
        let v: u32 = t1 - borrow;
        d[5] = v;
        borrow = u32(s[5] < TWOP8_5) + u32(t1 < borrow);
    }
    {
        let t1: u32 = s[6] - TWOP8_6;
        let v: u32 = t1 - borrow;
        d[6] = v;
        borrow = u32(s[6] < TWOP8_6) + u32(t1 < borrow);
    }
    {
        let t1: u32 = s[7] - TWOP8_7;
        d[7] = t1 - borrow;
        borrow = u32(s[7] < TWOP8_7) + u32(t1 < borrow);
    }
    var out: array<u32, 8>;
    out[0] = select(d[0], s[0], borrow != 0u);
    out[1] = select(d[1], s[1], borrow != 0u);
    out[2] = select(d[2], s[2], borrow != 0u);
    out[3] = select(d[3], s[3], borrow != 0u);
    out[4] = select(d[4], s[4], borrow != 0u);
    out[5] = select(d[5], s[5], borrow != 0u);
    out[6] = select(d[6], s[6], borrow != 0u);
    out[7] = select(d[7], s[7], borrow != 0u);
    return out;
}

fn fr_sub_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var d: array<u32, 8>;
    d[0] = a[0] - b[0];
    var borrow: u32 = u32(a[0] < b[0]);
    {
        let t1: u32 = a[1] - b[1];
        let v: u32 = t1 - borrow;
        d[1] = v;
        borrow = u32(a[1] < b[1]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[2] - b[2];
        let v: u32 = t1 - borrow;
        d[2] = v;
        borrow = u32(a[2] < b[2]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[3] - b[3];
        let v: u32 = t1 - borrow;
        d[3] = v;
        borrow = u32(a[3] < b[3]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[4] - b[4];
        let v: u32 = t1 - borrow;
        d[4] = v;
        borrow = u32(a[4] < b[4]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[5] - b[5];
        let v: u32 = t1 - borrow;
        d[5] = v;
        borrow = u32(a[5] < b[5]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[6] - b[6];
        let v: u32 = t1 - borrow;
        d[6] = v;
        borrow = u32(a[6] < b[6]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[7] - b[7];
        d[7] = t1 - borrow;
        borrow = u32(a[7] < b[7]) + u32(t1 < borrow);
    }
    // d = a - b; on borrow (a < b) the result is d + 2p, with the 2^256
    // wrap discarded (a - b + 2p lands in (0, 2p) since a, b < 2p).
    let wrap: bool = borrow != 0u;
    var out: array<u32, 8>;
    {
        let pw: u32 = select(0u, TWOP8_0, wrap);
        out[0] = d[0] + pw;
    }
    var carry: u32 = u32(out[0] < d[0]);
    {
        let pw: u32 = select(0u, TWOP8_1, wrap);
        let lo: u32 = d[1] + pw;
        let v: u32 = lo + carry;
        out[1] = v;
        carry = u32(lo < d[1]) + u32(v < lo);
    }
    {
        let pw: u32 = select(0u, TWOP8_2, wrap);
        let lo: u32 = d[2] + pw;
        let v: u32 = lo + carry;
        out[2] = v;
        carry = u32(lo < d[2]) + u32(v < lo);
    }
    {
        let pw: u32 = select(0u, TWOP8_3, wrap);
        let lo: u32 = d[3] + pw;
        let v: u32 = lo + carry;
        out[3] = v;
        carry = u32(lo < d[3]) + u32(v < lo);
    }
    {
        let pw: u32 = select(0u, TWOP8_4, wrap);
        let lo: u32 = d[4] + pw;
        let v: u32 = lo + carry;
        out[4] = v;
        carry = u32(lo < d[4]) + u32(v < lo);
    }
    {
        let pw: u32 = select(0u, TWOP8_5, wrap);
        let lo: u32 = d[5] + pw;
        let v: u32 = lo + carry;
        out[5] = v;
        carry = u32(lo < d[5]) + u32(v < lo);
    }
    {
        let pw: u32 = select(0u, TWOP8_6, wrap);
        let lo: u32 = d[6] + pw;
        let v: u32 = lo + carry;
        out[6] = v;
        carry = u32(lo < d[6]) + u32(v < lo);
    }
    out[7] = d[7] + select(0u, TWOP8_7, wrap) + carry;
    return out;
}

// -y as 2p - y: a single subtract chain, NO conditional. Requires
// 0 < y < 2p — true for curve-point y coordinates (y ≢ 0 mod p on BN254,
// no 2-torsion) loaded from the pool or running sums; the all-zero infinity
// sentinel never reaches a negate. Result in (0, 2p).
fn fr_neg_wide_f8(y: array<u32, 8>) -> array<u32, 8> {
    var out: array<u32, 8>;
    out[0] = TWOP8_0 - y[0];
    var borrow: u32 = u32(TWOP8_0 < y[0]);
    {
        let t1: u32 = TWOP8_1 - y[1];
        let v: u32 = t1 - borrow;
        out[1] = v;
        borrow = u32(TWOP8_1 < y[1]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = TWOP8_2 - y[2];
        let v: u32 = t1 - borrow;
        out[2] = v;
        borrow = u32(TWOP8_2 < y[2]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = TWOP8_3 - y[3];
        let v: u32 = t1 - borrow;
        out[3] = v;
        borrow = u32(TWOP8_3 < y[3]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = TWOP8_4 - y[4];
        let v: u32 = t1 - borrow;
        out[4] = v;
        borrow = u32(TWOP8_4 < y[4]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = TWOP8_5 - y[5];
        let v: u32 = t1 - borrow;
        out[5] = v;
        borrow = u32(TWOP8_5 < y[5]) + u32(t1 < borrow);
    }
    {
        let t1: u32 = TWOP8_6 - y[6];
        let v: u32 = t1 - borrow;
        out[6] = v;
        borrow = u32(TWOP8_6 < y[6]) + u32(t1 < borrow);
    }
    out[7] = TWOP8_7 - y[7] - borrow;
    return out;
}

// Canonicalize [0, 2p) -> [0, p): one conditional subtract of p. Boundary
// use only (e.g. the decompressed-SRS y, whose canonicality the parity
// selection and validate-srs audit rely on).
fn fr_canon_f8(a: array<u32, 8>) -> array<u32, 8> {
    var d: array<u32, 8>;
    d[0] = a[0] - P8_0;
    var borrow: u32 = u32(a[0] < P8_0);
    {
        let t1: u32 = a[1] - P8_1;
        let v: u32 = t1 - borrow;
        d[1] = v;
        borrow = u32(a[1] < P8_1) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[2] - P8_2;
        let v: u32 = t1 - borrow;
        d[2] = v;
        borrow = u32(a[2] < P8_2) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[3] - P8_3;
        let v: u32 = t1 - borrow;
        d[3] = v;
        borrow = u32(a[3] < P8_3) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[4] - P8_4;
        let v: u32 = t1 - borrow;
        d[4] = v;
        borrow = u32(a[4] < P8_4) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[5] - P8_5;
        let v: u32 = t1 - borrow;
        d[5] = v;
        borrow = u32(a[5] < P8_5) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[6] - P8_6;
        let v: u32 = t1 - borrow;
        d[6] = v;
        borrow = u32(a[6] < P8_6) + u32(t1 < borrow);
    }
    {
        let t1: u32 = a[7] - P8_7;
        d[7] = t1 - borrow;
        borrow = u32(a[7] < P8_7) + u32(t1 < borrow);
    }
    var out: array<u32, 8>;
    out[0] = select(d[0], a[0], borrow != 0u);
    out[1] = select(d[1], a[1], borrow != 0u);
    out[2] = select(d[2], a[2], borrow != 0u);
    out[3] = select(d[3], a[3], borrow != 0u);
    out[4] = select(d[4], a[4], borrow != 0u);
    out[5] = select(d[5], a[5], borrow != 0u);
    out[6] = select(d[6], a[6], borrow != 0u);
    out[7] = select(d[7], a[7], borrow != 0u);
    return out;
}
