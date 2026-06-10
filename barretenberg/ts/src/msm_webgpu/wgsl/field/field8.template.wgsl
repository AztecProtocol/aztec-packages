// === The 8x u32 field representation — the ONE field interface. ===
// Field elements are `array<u32, 8>`: the canonical 256-bit packed form,
// which is ALSO the storage form, so loads/stores are plain 8-word copies.
// Live values cost 8 registers each. The multiply (the injected
// montgomery_product_f8 body) extracts its 13-bit limbs internally with
// compile-time shifts; add / sub / is_zero run natively on the 8 words.

// p as eight 32-bit words, for fr_add_f8 / fr_sub_f8 / montgomery_product_f8's
// conditional reduce.
{{#p8_consts}}
const P8_{{idx}}: u32 = {{val}}u;
{{/p8_consts}}

// R mod p (Montgomery one) as 8x u32 — the montgomery_product identity.
fn get_r_f8() -> array<u32, 8> {
    return array<u32, 8>({{ r8_csv }});
}

// is_zero on the 8x u32 form.
fn is_zero_f8(v: array<u32, 8>) -> bool {
    return (v[0] | v[1] | v[2] | v[3] | v[4] | v[5] | v[6] | v[7]) == 0u;
}

// The packed Montgomery multiply body (karat or cios_unrolled — same
// montgomery_product_f8 symbol, selected by ShaderManager's montmul).
{{> montgomery_product_f8_native }}

// Native 8x u32 fr_add / fr_sub — 8-word modular add / sub. WGSL has no
// add-with-carry, so the carry out of each word is `u32(sum < operand)`
// (one compare, no branch). a, b are canonical in [0, p).
fn fr_add_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var s: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let lo: u32 = a[{{i}}] + b[{{i}}];
        let v: u32 = lo + carry;
        s[{{i}}] = v;
        carry = select(0u, 1u, lo < a[{{i}}]) + select(0u, 1u, v < lo);
    }
{{/f8_words}}
    // s = a + b in [0, 2p); subtract p iff s >= p — the s - p borrow
    // chain underflows exactly when s < p.
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = s[{{i}}] - P8_{{i}};
        let v: u32 = t1 - borrow;
        d[{{i}}] = v;
        borrow = select(0u, 1u, s[{{i}}] < P8_{{i}}) + select(0u, 1u, t1 < borrow);
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
        borrow = select(0u, 1u, a[{{i}}] < b[{{i}}]) + select(0u, 1u, t1 < borrow);
    }
{{/f8_words}}
    // d = a - b; on borrow (a < b) the canonical result is d + p, with the
    // 2^256 wrap discarded (a - b + p lands in (0, p)).
    var out: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let pw: u32 = select(0u, P8_{{i}}, borrow != 0u);
        let lo: u32 = d[{{i}}] + pw;
        let v: u32 = lo + carry;
        out[{{i}}] = v;
        carry = select(0u, 1u, lo < d[{{i}}]) + select(0u, 1u, v < lo);
    }
{{/f8_words}}
    return out;
}
