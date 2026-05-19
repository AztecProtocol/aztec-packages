// Packed 256-bit field-element type and primitive wrappers for v2 MSM.
//
// A `PackedField` holds one canonical [0, q) BN254 base-field value as two
// vec4<u32> (8 × u32 = 32 bytes little-endian). Storage buffers are
// `array<vec4<u32>>` with logical stride 2 vec4s per element.
//
// Design constraint (from the v2 plan): every shader-level field-element
// variable, struct field, workgroup-shared var, and binding is
// `PackedField`. The 20×13-bit `BigInt` representation only appears as a
// transient local inside the wrappers below. No kernel ever calls
// `unpack256_to_limbs` or `pack_limbs_to_256` directly.
//
// Cost per primitive call: ~2 unpacks + 1 pack on top of the underlying
// BigInt operation. On Apple M2 each pack/unpack is ~10 cycles vs ~100
// cycles for `montgomery_product`, so chains of mont-muls pay <15%
// overhead vs the BigInt calling convention used by the legacy
// msm_webgpu/ shaders.
//
// PRECONDITION: this partial must be included after `bigint_funcs`,
// `montgomery_product_funcs`, `field_funcs`, `by_inverse_a_funcs`, and
// after the {{{ dec_unpack }}} / {{{ dec_pack }}} substitution blocks
// have rendered `unpack256_to_limbs` / `pack_limbs_to_256` into the
// shader.

struct PackedField {
    lo: vec4<u32>,
    hi: vec4<u32>,
}

fn pf_to_words(p: PackedField) -> array<u32, 8> {
    var w: array<u32, 8>;
    w[0] = p.lo.x; w[1] = p.lo.y; w[2] = p.lo.z; w[3] = p.lo.w;
    w[4] = p.hi.x; w[5] = p.hi.y; w[6] = p.hi.z; w[7] = p.hi.w;
    return w;
}

fn pf_from_words(w0: u32, w1: u32, w2: u32, w3: u32,
                 w4: u32, w5: u32, w6: u32, w7: u32) -> PackedField {
    var p: PackedField;
    p.lo = vec4<u32>(w0, w1, w2, w3);
    p.hi = vec4<u32>(w4, w5, w6, w7);
    return p;
}

fn unpack_field(p: PackedField) -> BigInt {
    let w = pf_to_words(p);
    return unpack256_to_limbs(w);
}

fn pack_field(b: ptr<function, BigInt>) -> PackedField {
    let w = pack_limbs_to_256(b);
    return pf_from_words(w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7]);
}

fn field_load_ro(idx: u32, src: ptr<storage, array<vec4<u32>>, read>) -> PackedField {
    var p: PackedField;
    p.lo = (*src)[2u * idx];
    p.hi = (*src)[2u * idx + 1u];
    return p;
}

fn field_load_rw(idx: u32, src: ptr<storage, array<vec4<u32>>, read_write>) -> PackedField {
    var p: PackedField;
    p.lo = (*src)[2u * idx];
    p.hi = (*src)[2u * idx + 1u];
    return p;
}

fn field_store(idx: u32, dst: ptr<storage, array<vec4<u32>>, read_write>, val: PackedField) {
    (*dst)[2u * idx] = val.lo;
    (*dst)[2u * idx + 1u] = val.hi;
}

fn is_zero_packed(a: PackedField) -> bool {
    return all(a.lo == vec4<u32>(0u, 0u, 0u, 0u))
        && all(a.hi == vec4<u32>(0u, 0u, 0u, 0u));
}

fn eq_packed(a: PackedField, b: PackedField) -> bool {
    return all(a.lo == b.lo) && all(a.hi == b.hi);
}

fn get_zero_packed() -> PackedField {
    return PackedField(vec4<u32>(0u), vec4<u32>(0u));
}

fn get_p_packed() -> PackedField {
    var p: BigInt = get_p();
    return pack_field(&p);
}

fn get_r_packed() -> PackedField {
    var r: BigInt;
{{{ r_limbs }}}
    return pack_field(&r);
}

fn mont_p(a: PackedField, b: PackedField) -> PackedField {
    var a_l = unpack_field(a);
    var b_l = unpack_field(b);
    var out = montgomery_product(&a_l, &b_l);
    return pack_field(&out);
}

fn fr_add_p(a: PackedField, b: PackedField) -> PackedField {
    var a_l = unpack_field(a);
    var b_l = unpack_field(b);
    var out = fr_add(&a_l, &b_l);
    return pack_field(&out);
}

fn fr_sub_p(a: PackedField, b: PackedField) -> PackedField {
    var a_l = unpack_field(a);
    var b_l = unpack_field(b);
    var out = fr_sub(&a_l, &b_l);
    return pack_field(&out);
}

fn fr_neg_p(a: PackedField) -> PackedField {
    var a_l = unpack_field(a);
    var p_l: BigInt = get_p();
    var out: BigInt;
    let _b = bigint_sub(&p_l, &a_l, &out);
    return pack_field(&out);
}

fn fr_inv_p(a: PackedField) -> PackedField {
    let a_l = unpack_field(a);
    var out = fr_inv_by_a(a_l);
    return pack_field(&out);
}
