// GPU SRS decompression for BN254 G1, compressed format.
//
// Replaces the JS bigint sqrt loop in dev/msm-webgpu/srs.ts. Each
// compressed point is 32 BE bytes: the top bit of byte 0 is the parity
// of y, the bottom 255 bits hold x. We recover y from
//
//     y = (x^3 + 3)^((q+1)/4)   (q ≡ 3 mod 4, BN254 b = 3)
//
// and flip its sign to match the encoded parity bit, then write affine
// (x, y) as interleaved 32 LE bytes each.
//
// All field work is in Montgomery form; the heavy lifting is one
// `fr_pow` per point (~260 squarings + ~126 mults for a 252-bit
// exponent). One thread per point.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> barrett_funcs }}
{{> montgomery_product_funcs }}
{{> fr_pow_funcs }}

// 32 bytes per point, with the BE input reversed by the host so that
// compressed_in[id*8 + i] is the i'th LE u32 of the value (low chunk
// first). The shader can therefore read words natively without any
// per-word byte-swap.
@group(0) @binding(0)
var<storage, read> compressed_in: array<u32>;

// 64 LE bytes per point, packed as 16 u32s where each u32 holds 4 LE
// bytes. First 8 u32s are x (LSB first), next 8 are y. Matches the JS
// `writeLe32` interleaved layout the convert+decompose shader expects.
@group(0) @binding(1)
var<storage, read_write> affine_out: array<u32>;

@group(0) @binding(2)
var<uniform> input_size: u32;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

// Montgomery form of 3 (the curve b parameter). Used in y² = x³ + 3.
fn get_b3_mont() -> BigInt {
    var b3: BigInt;
{{{ b3_mont_limbs }}}
    return b3;
}

// (q + 1) / 4. The exponent for the closed-form sqrt over a field of
// characteristic q ≡ 3 (mod 4).
fn get_sqrt_exp() -> BigInt {
    var e: BigInt;
{{{ sqrt_exp_limbs }}}
    return e;
}

// Extract the limb_idx'th WORD_SIZE-bit limb from 9 LE u32s holding the
// 256-bit native value (le_words[0] is the LSB u32). Up to two adjacent
// u32s are read; the 9th entry is a zero pad so the highest limb never
// needs a bounds check on the read.
fn extract_limb_le(le_words: ptr<function, array<u32, 9>>, limb_idx: u32) -> u32 {
    let bit_start = limb_idx * WORD_SIZE;
    let word_idx = bit_start / 32u;
    let bit_off = bit_start - word_idx * 32u;
    let lo = (*le_words)[word_idx] >> bit_off;
    var hi: u32 = 0u;
    // bit_off + WORD_SIZE crosses the 32-bit boundary when bit_off > 32 - WORD_SIZE
    // (= 19 for WORD_SIZE=13). The shift `32 - bit_off` is in [1, 12] there,
    // so it's well-defined; the alternative branch would attempt `<< 32u`.
    if (bit_off + WORD_SIZE > 32u) {
        hi = (*le_words)[word_idx + 1u] << (32u - bit_off);
    }
    return (lo | hi) & MASK;
}

// Inverse of `extract_limb_le`: gather bits [word_idx*32, word_idx*32 + 32)
// from the 13-bit limbs of `x` and pack them as an LE u32. A 32-bit
// window spans 3 or 4 13-bit limbs depending on bit_off; we always
// fold in 3 limbs and conditionally add a 4th when those don't cover
// the full 32 bits. The 4th limb is only needed for word_idx ∈ {2,4,6}
// (bit_off > 7); in those cases limb_idx_lo + 3 ≤ 17 < NUM_WORDS so
// the access is safe. For word_idx ∈ {1,3,5,7} the conditional is
// false and we skip the (would-be out-of-bounds for word_idx=7) read.
fn limbs_to_le_u32(x: ptr<function, BigInt>, word_idx: u32) -> u32 {
    let bit_start = word_idx * 32u;
    let limb_idx_lo = bit_start / WORD_SIZE;
    let bit_off = bit_start - limb_idx_lo * WORD_SIZE;
    // First limb: shift down by bit_off so its bits land at the bottom of acc.
    var acc: u32 = (*x).limbs[limb_idx_lo] >> bit_off;
    var bits: u32 = WORD_SIZE - bit_off;          // valid bits in acc; in [1, 13]
    acc = acc | ((*x).limbs[limb_idx_lo + 1u] << bits);
    bits = bits + WORD_SIZE;                       // in [14, 26]
    acc = acc | ((*x).limbs[limb_idx_lo + 2u] << bits);
    bits = bits + WORD_SIZE;                       // in [27, 39]
    if (bits < 32u) {
        acc = acc | ((*x).limbs[limb_idx_lo + 3u] << bits);
    }
    return acc;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= input_size) { return; }

    // Load the 8 LE u32s for this point. The host already byte-reversed
    // the original BE encoding so these are in natural LE order
    // (le_words[0] = low 32 bits, le_words[7] = high 32 bits). The 9th
    // slot is a zero pad so `extract_limb_le` never needs a bounds
    // branch when limb 19 spans the top of the value.
    var le_words: array<u32, 9>;
    for (var i = 0u; i < 8u; i = i + 1u) {
        le_words[i] = compressed_in[id * 8u + i];
    }
    le_words[8] = 0u;

    // The parity bit is the MSB of the top BE byte = bit 31 of the
    // top LE u32 (le_words[7]). Clear it from the value.
    let y_bit: u32 = (le_words[7] >> 31u) & 1u;
    le_words[7] = le_words[7] & 0x7fffffffu;

    // x's LE-u32 representation is just le_words[0..8] (with the sign
    // bit already cleared from le_words[7]). Snapshot it directly here
    // — no round trip through 13-bit limbs needed for the output, and
    // skipping that round trip empirically also avoids a WGSL/Tint
    // pattern where calling `limbs_to_le_u32(&x_native, …)` before
    // `field_mul` corrupts x_native (and therefore everything
    // downstream, including y).
    var x_out: array<u32, 8>;
    for (var i = 0u; i < 8u; i = i + 1u) {
        x_out[i] = le_words[i];
    }

    // Assemble x in native form: 20 WORD_SIZE-bit limbs (for the math).
    var x_native: BigInt;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        x_native.limbs[i] = extract_limb_le(&le_words, i);
    }

    // Convert x to Montgomery form: x_mont = x · R mod p (Barrett mul).
    var r = get_r();
    var x_mont: BigInt = field_mul(&x_native, &r);

    // y²_mont = x_mont³ + 3·R mod p.
    var x_sq_mont: BigInt = montgomery_product(&x_mont, &x_mont);
    var x_cu_mont: BigInt = montgomery_product(&x_sq_mont, &x_mont);
    var b3_mont: BigInt = get_b3_mont();
    var y_sq_mont: BigInt = fr_add(&x_cu_mont, &b3_mont);

    // y_mont = (y²_mont)^((q+1)/4) — closed-form sqrt for q ≡ 3 (mod 4).
    var sqrt_exp: BigInt = get_sqrt_exp();
    var y_mont: BigInt = fr_pow(y_sq_mont, sqrt_exp);

    // Convert y back to native: mp(y_mont, 1) = y_mont · 1 · R^(-1) = y.
    var one_native: BigInt;
    one_native.limbs[0] = 1u;
    var y_native: BigInt = montgomery_product(&y_mont, &one_native);

    // Parity flip: if recovered parity disagrees with encoded, negate
    // mod p. SRS points are non-zero affine, so y_native != 0 and the
    // bare subtraction is always canonical.
    let parity: u32 = y_native.limbs[0] & 1u;
    if (parity != y_bit) {
        var p_const: BigInt = get_p();
        var neg: BigInt;
        let _b = bigint_sub(&p_const, &y_native, &neg);
        y_native = neg;
    }

    // Write 8 LE u32s for x (pre-packed at the top), then 8 for y.
    // 16 u32s per point.
    let out_base = id * 16u;
    for (var i = 0u; i < 8u; i = i + 1u) {
        affine_out[out_base + i] = x_out[i];
    }
    for (var i = 0u; i < 8u; i = i + 1u) {
        affine_out[out_base + 8u + i] = limbs_to_le_u32(&y_native, i);
    }

    {{{ recompile }}}
}
