// === Lever 2: 8x u32 live field representation ===
// Shared by the accumulate (ba_fused_super) and reduction (ba_reduce_level)
// kernels. Field elements live as `array<u32, 8>` — the canonical 256-bit
// packed form, which is ALSO the storage form, so loads/stores are plain
// 8-word copies. Live values cost 8 registers each instead of the
// 20x13-limb form's 20. Only the multiply needs 13-bit limbs:
// montgomery_product_f8 expands its operands to the 20x13 BigInt form,
// multiplies, contracts back. fr_add / fr_sub run natively on 8x u32.
//
// Resolved across the assembled shader: montgomery_product,
// unpack256_to_limbs, pack_limbs_to_256, and (addsub=unpack only)
// fr_add / fr_sub. Include this partial after dec_unpack / dec_pack.

// p as eight 32-bit words, for the native fr_add_f8 / fr_sub_f8.
{{#p8_consts}}
const P8_{{idx}}: u32 = {{val}}u;
{{/p8_consts}}

// R mod p (Montgomery one) as 8x u32 — the montgomery_product identity.
fn get_r_f8() -> array<u32, 8> {
    return array<u32, 8>({{ r8_csv }});
}

// get_r in the 20x13-limb form. Only `fr_pow` references it — a dead-code
// path in these kernels (fr_pow_funcs is pulled in for get_r_cubed, which
// the pk inverse needs). Derived from the get_r_f8 constant, so it is
// itself compile-time constant — no per-thread `var` materialisation.
fn get_r() -> BigInt {
    return unpack256_to_limbs(get_r_f8());
}

// is_zero on the 8x u32 form.
fn is_zero_f8(v: array<u32, 8>) -> bool {
    return (v[0] | v[1] | v[2] | v[3] | v[4] | v[5] | v[6] | v[7]) == 0u;
}

{{#f8_native}}
// Packed-native register-lean CIOS multiply (montmul=cios_native, 13-bit):
// packed 8x u32 in/out, per-iter working_x limb extraction, accumulators packed +
// conditional-reduced in place. No BigInt temps -- eliminates the x20/r/s spill
// that throttled occupancy on Adreno (3.8x there; Apple-neutral). Byte-identical
// to the unpack wrapper below.
{{> montgomery_product_f8_native }}
{{/f8_native}}
{{^f8_native}}
// montgomery_product on the 8x u32 form: expand both operands to the
// 20x13-limb arithmetic form, run the grouped Karatsuba multiply,
// contract the result back to 8x u32.
fn montgomery_product_f8(x: array<u32, 8>, y: array<u32, 8>) -> array<u32, 8> {
    var x20: BigInt = unpack256_to_limbs(x);
    var y20: BigInt = unpack256_to_limbs(y);
    var r: BigInt = montgomery_product(&x20, &y20);
    return pack_limbs_to_256(&r);
}
{{/f8_native}}

{{#addsub_unpack}}
// fr_add / fr_sub via expand -> 20x13 op -> contract. The A/B alternative
// to the native path; selected by `addsub=unpack`.
fn fr_add_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var a20: BigInt = unpack256_to_limbs(a);
    var b20: BigInt = unpack256_to_limbs(b);
    var r: BigInt = fr_add(&a20, &b20);
    return pack_limbs_to_256(&r);
}

fn fr_sub_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var a20: BigInt = unpack256_to_limbs(a);
    var b20: BigInt = unpack256_to_limbs(b);
    var r: BigInt = fr_sub(&a20, &b20);
    return pack_limbs_to_256(&r);
}
{{/addsub_unpack}}
{{^addsub_unpack}}
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
{{/addsub_unpack}}
