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
//   - fr_add_wide_f8 / fr_sub_wide_f8 / fr_neg_wide_f8 skip the conditional
//     reduce entirely; every call site carries a bound comment proving the
//     value stays below 2^256 (= 5.29p) and feeds a width-tolerant consumer
//     (montgomery_product_f8, or the safegcd inverse which canonicalizes its
//     input).
//   - The all-zero bit pattern stays reserved for infinity sentinels: the
//     wide ops cannot produce it (results are strictly positive), and
//     montgomery_product_f8 maps exact-zero inputs to exact zero.

// p and 2p as eight 32-bit words (p < 2^255, so 2p fits in 256 bits).
{{#p8_consts}}
const P8_{{idx}}: u32 = {{val}}u;
{{/p8_consts}}
{{#p8_consts}}
const TWOP8_{{idx}}: u32 = {{val2}}u;
{{/p8_consts}}

// R mod p (Montgomery one) as 8x u32 — the montgomery_product identity.
fn get_r_f8() -> array<u32, 8> {
    return array<u32, 8>({{ r8_csv }});
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
fn fr_add_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var s: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let lo: u32 = a[{{i}}] + b[{{i}}];
        let v: u32 = lo + carry;
        s[{{i}}] = v;
        carry = u32(lo < a[{{i}}]) + u32(v < lo);
    }
{{/f8_words}}
    // s = a + b in [0, 4p); subtract 2p iff s >= 2p — the s - 2p borrow
    // chain underflows exactly when s < 2p.
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = s[{{i}}] - TWOP8_{{i}};
        let v: u32 = t1 - borrow;
        d[{{i}}] = v;
        borrow = u32(s[{{i}}] < TWOP8_{{i}}) + u32(t1 < borrow);
    }
{{/f8_words}}
    var out: array<u32, 8>;
{{#f8_words}}
    out[{{i}}] = select(d[{{i}}], s[{{i}}], borrow != 0u);
{{/f8_words}}
    return out;
}

fn fr_sub_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = a[{{i}}] - b[{{i}}];
        let v: u32 = t1 - borrow;
        d[{{i}}] = v;
        borrow = u32(a[{{i}}] < b[{{i}}]) + u32(t1 < borrow);
    }
{{/f8_words}}
    // d = a - b; on borrow (a < b) the result is d + 2p, with the 2^256
    // wrap discarded (a - b + 2p lands in (0, 2p) since a, b < 2p).
    var out: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let pw: u32 = select(0u, TWOP8_{{i}}, borrow != 0u);
        let lo: u32 = d[{{i}}] + pw;
        let v: u32 = lo + carry;
        out[{{i}}] = v;
        carry = u32(lo < d[{{i}}]) + u32(v < lo);
    }
{{/f8_words}}
    return out;
}

// a + b with NO reduction — a plain 8-word add. Caller must ensure
// a + b < 2^256 (= 5.29p) and route the result only into width-tolerant
// consumers (montgomery_product_f8 / the inverse).
fn fr_add_wide_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var s: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let lo: u32 = a[{{i}}] + b[{{i}}];
        let v: u32 = lo + carry;
        s[{{i}}] = v;
        carry = u32(lo < a[{{i}}]) + u32(v < lo);
    }
{{/f8_words}}
    return s;
}

// a - b + 2p with NO conditional. Requires b < 2p (result strictly
// positive) and a < 3.29p (a + 2p must not wrap 2^256). Result ≡ a - b
// (mod p), bounded by a + 2p — montmul/inverse-input use only.
fn fr_sub_wide_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var t: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let lo: u32 = a[{{i}}] + TWOP8_{{i}};
        let v: u32 = lo + carry;
        t[{{i}}] = v;
        carry = u32(lo < a[{{i}}]) + u32(v < lo);
    }
{{/f8_words}}
    var out: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = t[{{i}}] - b[{{i}}];
        let v: u32 = t1 - borrow;
        out[{{i}}] = v;
        borrow = u32(t[{{i}}] < b[{{i}}]) + u32(t1 < borrow);
    }
{{/f8_words}}
    return out;
}

// -y as 2p - y: a single subtract chain, NO conditional. Requires
// 0 < y < 2p — true for curve-point y coordinates (y ≢ 0 mod p on BN254,
// no 2-torsion) loaded from the pool or running sums; the all-zero infinity
// sentinel never reaches a negate. Result in (0, 2p).
fn fr_neg_wide_f8(y: array<u32, 8>) -> array<u32, 8> {
    var out: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = TWOP8_{{i}} - y[{{i}}];
        let v: u32 = t1 - borrow;
        out[{{i}}] = v;
        borrow = u32(TWOP8_{{i}} < y[{{i}}]) + u32(t1 < borrow);
    }
{{/f8_words}}
    return out;
}

// Canonicalize [0, 2p) -> [0, p): one conditional subtract of p. Boundary
// use only (e.g. the decompressed-SRS y, whose canonicality the parity
// selection and validate-srs audit rely on).
fn fr_canon_f8(a: array<u32, 8>) -> array<u32, 8> {
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = a[{{i}}] - P8_{{i}};
        let v: u32 = t1 - borrow;
        d[{{i}}] = v;
        borrow = u32(a[{{i}}] < P8_{{i}}) + u32(t1 < borrow);
    }
{{/f8_words}}
    var out: array<u32, 8>;
{{#f8_words}}
    out[{{i}}] = select(d[{{i}}], a[{{i}}], borrow != 0u);
{{/f8_words}}
    return out;
}
