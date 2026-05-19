// Packed 256-bit field-element storage helpers for v2 MSM.
//
// Storage convention: every field-element buffer is `array<vec4<u32>>`
// with logical stride 2 vec4s per element (8 × u32 = 32 bytes,
// canonical little-endian 256-bit value, value < q < 2^254).
//
// Conversions between the packed storage layout and the 20×13-bit
// `BigInt` arithmetic representation happen ONLY at the storage I/O
// boundary (field_load_*, field_store, fold_packed_pair). Once loaded,
// values live as BigInt limbs for the entire kernel body and only
// repack on the final write. This matches the bench_batch_affine design
// that hit ~22 ns/pair on M2; the prior PackedField-wrapper design
// repacked between every mont and paid ~2× the cost.
//
// PRECONDITION: this partial must be included after bigint_funcs,
// montgomery_product_funcs, field_funcs, by_inverse_a_funcs, and after
// the host has injected unpack256_to_limbs and pack_limbs_to_256 (those
// come from the decoupledPackUnpackWgsl() generator in shader_manager).

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn field_load_ro(idx: u32, src: ptr<storage, array<vec4<u32>>, read>) -> BigInt {
    var w: array<u32, 8>;
    let q0 = (*src)[2u * idx];
    let q1 = (*src)[2u * idx + 1u];
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn field_load_rw(idx: u32, src: ptr<storage, array<vec4<u32>>, read_write>) -> BigInt {
    var w: array<u32, 8>;
    let q0 = (*src)[2u * idx];
    let q1 = (*src)[2u * idx + 1u];
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn field_store(idx: u32, dst: ptr<storage, array<vec4<u32>>, read_write>, val: ptr<function, BigInt>) {
    let w = pack_limbs_to_256(val);
    (*dst)[2u * idx] = vec4<u32>(w[0], w[1], w[2], w[3]);
    (*dst)[2u * idx + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}
