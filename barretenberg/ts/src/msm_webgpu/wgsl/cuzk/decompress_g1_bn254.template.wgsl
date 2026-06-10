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
// All field work is the packed 8x u32 Montgomery form and the same
// `montgomery_product_f8` the MSM kernels use, so the karat / f8_native
// montmul toggle applies here too. The heavy lifting is one closed-form
// sqrt per point — 256 squarings + ~126 mults of `montgomery_product_f8`
// over a 254-bit exponent. One thread per point.


{{> field8_funcs }}

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

// R^2 mod q, packed. Converts a native value to Montgomery form via
// montgomery_product_f8(x, R^2) = x · R^2 · R^-1 = x · R.
fn get_r_squared_f8() -> array<u32, 8> {
    return array<u32, 8>({{ r_squared_csv }});
}

// 3 · R mod q — the Montgomery form of the curve b = 3, packed. Added
// to x^3 (also Montgomery) to form y^2.
fn get_b3_mont_f8() -> array<u32, 8> {
    return array<u32, 8>({{ b3_mont_csv }});
}

// (q + 1) / 4 as the raw 256-bit exponent, 8 LE u32 words. The
// closed-form sqrt exponent for a field of characteristic q ≡ 3 (mod 4).
fn get_sqrt_exp_f8() -> array<u32, 8> {
    return array<u32, 8>({{ sqrt_exp_csv }});
}

// Square-and-multiply exponentiation on the packed Montgomery form.
// `result` is seeded at Montgomery one (get_r_f8); `exp` is the raw
// 256-bit exponent, scanned low-bit first across its 8 u32 words. Uses
// the same montgomery_product_f8 as the rest of the pipeline.
fn fr_pow_f8(base: array<u32, 8>, exp: array<u32, 8>) -> array<u32, 8> {
    var result: array<u32, 8> = get_r_f8();
    var b: array<u32, 8> = base;
    for (var w: u32 = 0u; w < 8u; w = w + 1u) {
        var bits: u32 = exp[w];
        for (var i: u32 = 0u; i < 32u; i = i + 1u) {
            if ((bits & 1u) == 1u) {
                result = montgomery_product_f8(result, b);
            }
            b = montgomery_product_f8(b, b);
            bits = bits >> 1u;
        }
    }
    return result;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let id = global_id.x;
    if (id >= input_size) { return; }

    // Load the 8 LE u32 words for this point. The host already
    // byte-reversed the original BE encoding so these are in natural LE
    // order (x[0] = low 32 bits, x[7] = high 32 bits). This packed form
    // IS the field8 representation, so x needs no limb round-trip.
    var x: array<u32, 8>;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        x[i] = compressed_in[id * 8u + i];
    }

    // The parity bit is the MSB of the top BE byte = bit 31 of the top
    // LE u32. Clear it from the value so x is canonical in [0, q).
    let y_bit: u32 = (x[7] >> 31u) & 1u;
    x[7] = x[7] & 0x7fffffffu;

    // To Montgomery form: x_mont = x · R = mp(x, R^2).
    let x_mont: array<u32, 8> = montgomery_product_f8(x, get_r_squared_f8());

    // y^2_mont = x_mont^3 + 3·R mod q.
    let x_sq_mont: array<u32, 8> = montgomery_product_f8(x_mont, x_mont);
    let x_cu_mont: array<u32, 8> = montgomery_product_f8(x_sq_mont, x_mont);
    let y_sq_mont: array<u32, 8> = fr_add_f8(x_cu_mont, get_b3_mont_f8());

    // y_mont = (y^2_mont)^((q+1)/4) — closed-form sqrt for q ≡ 3 (mod 4).
    let y_mont: array<u32, 8> = fr_pow_f8(y_sq_mont, get_sqrt_exp_f8());

    // Convert y back to native: mp(y_mont, 1) = y_mont · 1 · R^-1 = y.
    // This multiply-by-one is self-canonicalizing even under the lazy
    // montmul (no final reduce): t < p + y_mont/R <= p, and t ≡ y with
    // 0 < y < p forces t = y exactly. The parity test below depends on
    // this — do not replace it with a cheaper conversion.
    var one: array<u32, 8>;
    one[0] = 1u;
    var y: array<u32, 8> = montgomery_product_f8(y_mont, one);

    // Parity flip: if the recovered parity disagrees with the encoded
    // bit, negate mod q. SRS points are non-zero affine, so y != 0; the
    // canon keeps the decompressed-SRS contract (x, y < q) that the
    // validate-srs audit and the parity convention rely on.
    let parity: u32 = y[0] & 1u;
    if (parity != y_bit) {
        y = fr_canon_f8(fr_neg_wide_f8(y));
    }

    // Write 8 LE u32s for x, then 8 for y — 16 u32s per point.
    let out_base: u32 = id * 16u;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        affine_out[out_base + i] = x[i];
    }
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        affine_out[out_base + 8u + i] = y[i];
    }

    {{{ recompile }}}
}
