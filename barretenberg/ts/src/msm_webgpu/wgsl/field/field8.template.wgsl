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
// unpack256_to_limbs, pack_limbs_to_256. fr_add_f8 / fr_sub_f8 are native
// 8x u32 (no unpack/repack). Include this partial after dec_unpack / dec_pack.

// p as eight 32-bit words, for the native fr_add_f8 / fr_sub_f8.
{{#p8_consts}}
const P8_{{idx}}: u32 = {{val}}u;
{{/p8_consts}}

// R mod p (Montgomery one) as 8x u32 — the montgomery_product identity.
fn get_r_f8() -> array<u32, 8>  {
    return array<u32, 8>({{ r8_csv }});
}

// get_r in the 20x13-limb form. Only `fr_pow` (the G1 decompression sqrt)
// references it. Derived from the get_r_f8 constant, so it is itself
// compile-time constant — no per-thread `var` materialisation.
fn get_r() -> BigInt {
    return unpack256_to_limbs(get_r_f8());
}

// is_zero on the 8x u32 form.
fn is_zero_f8(v: array<u32, 8>) -> bool {
    return (v[0] | v[1] | v[2] | v[3] | v[4] | v[5] | v[6] | v[7]) == 0u;
}

{{#f8_native}}
// Packed-native register-lean CIOS multiply (cios_unrolled 13-bit): packed in/out,
// per-iter working_x, s0..s19 packed + conditional-reduced in place. No BigInt temps.
{{> montgomery_product_f8_native }}
{{/f8_native}}
{{^f8_native}}
// montgomery_product on the 8x u32 form: expand both operands to the
// 20x13-limb arithmetic form, run the multiply, contract back to 8x u32.
fn montgomery_product_f8(x: array<u32, 8>, y: array<u32, 8>) -> array<u32, 8> {
    var x20: BigInt = unpack256_to_limbs(x);
    var y20: BigInt = unpack256_to_limbs(y);
{{#regfile_lean}}
    // Workgroup-backed multiply: the 20 CIOS accumulators live in `mont_s`
    // (declared by the kernel) instead of registers, freeing GPRs for occupancy.
    var r: BigInt = montgomery_product_wg(&x20, &y20);
{{/regfile_lean}}
{{^regfile_lean}}
    var r: BigInt = montgomery_product(&x20, &y20);
{{/regfile_lean}}
    return pack_limbs_to_256(&r);
}
{{/f8_native}}

// Native 8x u32 fr_add / fr_sub — 8-word modular add / sub. WGSL has no
// add-with-carry; the carry/borrow out of each word is u32(sum < operand). The
// two overflow sources per word are mutually exclusive, so | composes them
// (each is 0/1). a, b are canonical in [0, p).
fn fr_add_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var s: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let lo: u32 = a[{{i}}] + b[{{i}}];
        let v: u32 = lo + carry;
        s[{{i}}] = v;
        carry = u32(lo < a[{{i}}]) | u32(v < lo);
    }
{{/f8_words}}
    // s = a + b in [0, 2p); subtract p iff s >= p — the s - p borrow chain
    // underflows (borrow != 0) exactly when s < p.
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = s[{{i}}] - P8_{{i}};
        d[{{i}}] = t1 - borrow;
        borrow = u32(s[{{i}}] < P8_{{i}}) | u32(t1 < borrow);
    }
{{/f8_words}}
    let lt_p: bool = borrow != 0u;  // s < p -> keep s; else use s - p
    var out: array<u32, 8>;
{{#f8_words}}
    out[{{i}}] = select(d[{{i}}], s[{{i}}], lt_p);
{{/f8_words}}
    return out;
}

fn fr_sub_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = a[{{i}}] - b[{{i}}];
        d[{{i}}] = t1 - borrow;
        borrow = u32(a[{{i}}] < b[{{i}}]) | u32(t1 < borrow);
    }
{{/f8_words}}
    // d = a - b; on borrow (a < b) add p back, discarding the 2^256 wrap.
    let neg: bool = borrow != 0u;
    var out: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let pw: u32 = select(0u, P8_{{i}}, neg);
        let lo: u32 = d[{{i}}] + pw;
        let v: u32 = lo + carry;
        out[{{i}}] = v;
        carry = u32(lo < d[{{i}}]) | u32(v < lo);
    }
{{/f8_words}}
    return out;
}
