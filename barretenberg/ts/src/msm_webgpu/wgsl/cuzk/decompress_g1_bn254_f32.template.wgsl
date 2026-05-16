// 23-bit f32 mirror of `decompress_g1_bn254.template.wgsl`. Decompresses
// a compressed BN254 G1 point (32 BE bytes: top bit of byte 0 = parity
// of y, bottom 255 bits = x) into f32-Montgomery affine (x, y).
//
// Output layout: 2 * NUM_LIMBS_F32 f32s per point. Layout:
//   affine_out[id*24 .. id*24 + 12)        = x in Mont-f32 form
//   affine_out[id*24 + 12 .. id*24 + 24)   = y in Mont-f32 form
//
// Math closed-form sqrt for q ≡ 3 (mod 4):  y = (x³ + 3)^((q+1)/4)
// fr_sqrt_f32 returns one of the two roots; we flip the sign to match
// the encoded parity bit. SRS points are non-zero affine so the bare
// (p - y) subtraction is always canonical.

// Input compressed buffer is identical to the u32 path's: 32 LE bytes
// per point with the original BE reversed by the host. compressed_in[i]
// gives the i'th LE u32 of the value.
@group(0) @binding(0)
var<storage, read> compressed_in: array<u32>;

// 24 f32s per point: 12 x-Mont + 12 y-Mont.
@group(0) @binding(1)
var<storage, read_write> affine_out: array<f32>;

@group(0) @binding(2)
var<uniform> input_size: u32;

fn get_r_local_f32() -> BigIntF32 {
    var r: BigIntF32;
{{{ r_limbs_f32 }}}
    return r;
}

// Montgomery form of 3 in the f32 ring: 3·R_f mod p.
fn get_b3_mont_f32() -> BigIntF32 {
    var b3: BigIntF32;
{{{ b3_mont_limbs_f32 }}}
    return b3;
}

// Extract the limb_idx'th 23-bit limb from 9 LE u32s holding the
// 256-bit native value (le_words[0] is the LSB u32). One 23-bit window
// spans at most two adjacent u32s.
fn extract_limb_le_f32(le_words: ptr<function, array<u32, 9>>, limb_idx: u32) -> f32 {
    let bit_start = limb_idx * 23u;
    let word_idx = bit_start / 32u;
    let bit_off = bit_start - word_idx * 32u;
    let lo = (*le_words)[word_idx] >> bit_off;
    var hi: u32 = 0u;
    if (bit_off + 23u > 32u) {
        hi = (*le_words)[word_idx + 1u] << (32u - bit_off);
    }
    let mask: u32 = (1u << 23u) - 1u;
    return f32((lo | hi) & mask);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= input_size) { return; }

    var le_words: array<u32, 9>;
    for (var i = 0u; i < 8u; i = i + 1u) {
        le_words[i] = compressed_in[id * 8u + i];
    }
    le_words[8] = 0u;

    let y_bit: u32 = (le_words[7] >> 31u) & 1u;
    le_words[7] = le_words[7] & 0x7fffffffu;

    // Assemble x in native (non-Mont) f32 form: 12 × 23-bit limbs.
    var x_native: BigIntF32;
    for (var i = 0u; i < {{ num_limbs_f32 }}u; i = i + 1u) {
        x_native.limbs[i] = extract_limb_le_f32(&le_words, i);
    }

    // x_mont = x · R_f mod p.
    var x_mont: BigIntF32 = to_mont_f32(&x_native);

    // y_mont² = x_mont³ + 3·R_f mod p.
    var x_sq_mont: BigIntF32 = montgomery_product_f32(&x_mont, &x_mont);
    var x_cu_mont: BigIntF32 = montgomery_product_f32(&x_sq_mont, &x_mont);
    var b3_mont: BigIntF32 = get_b3_mont_f32();
    var y_sq_mont: BigIntF32 = fr_add_f32(&x_cu_mont, &b3_mont);

    // y_mont = (y_sq_mont)^((q+1)/4).
    var y_mont: BigIntF32 = fr_sqrt_f32(y_sq_mont);

    // Parity flip: pull y back to canonical, inspect the LSB. The LSB
    // of a 12 × 23-bit limb representation lives in limbs[0] & 1.
    var y_native: BigIntF32 = from_mont_f32(&y_mont);
    let parity: u32 = u32(y_native.limbs[0]) & 1u;
    if (parity != y_bit) {
        var p_const: BigIntF32 = get_p_f32();
        // Negate IN MONT form: (p · R - y_mont) mod p. The simpler path
        // is to negate canonical y then push back to Mont; cheaper still
        // is to compute -y_mont = p - y_mont when 0 < y_mont < p, which
        // fr_sub_f32 outputs always satisfy. y_mont was produced by
        // fr_pow_f32 (which only emits canonical Mont values), so the
        // bare subtraction stays canonical.
        var neg: BigIntF32;
        let _b = bigint_f32_sub(&p_const, &y_mont, &neg);
        y_mont = neg;
    }

    let out_base = id * (2u * {{ num_limbs_f32 }}u);
    for (var i = 0u; i < {{ num_limbs_f32 }}u; i = i + 1u) {
        affine_out[out_base + i] = x_mont.limbs[i];
    }
    for (var i = 0u; i < {{ num_limbs_f32 }}u; i = i + 1u) {
        affine_out[out_base + {{ num_limbs_f32 }}u + i] = y_mont.limbs[i];
    }

    {{{ recompile }}}
}
