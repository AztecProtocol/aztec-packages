// Additive scalar-masking pre-pass for the WebGPU MSM.
//
// Rewrites each scalar s_i in place to (s_i + R_{srs_offset + p}) mod r, where
// R is a fixed per-SRS-position random vector and r is the BN254 scalar field
// modulus. Masking turns the structured scalars (small / sparse / heavily
// repeated — the translator range-constraint polynomials) that the bucket
// accumulation pair-tree mishandles into uniform full-width scalars, which is
// the case MsmV2 is known to compute correctly. The host then recovers the
// true commitment C = C' - O by subtracting the precomputed offset
// O = sum_i R_i * P_i (one point per (srs_offset, n) point set).
//
// Dispatched BEFORE the bucket histogram in prepare(), so every downstream
// stage (histogram, level planning, Booth decompose) reads the masked scalars.
// Scalars are in normal (non-Montgomery) form, 8 little-endian u32 limbs each;
// R is generated in the same form. p = i mod input_size is the point index
// within the MSM, so every batch slot b (scalar i = b*input_size + p) is masked
// with the SAME R[srs_offset + p] — matching the single shared offset O that is
// subtracted from each slot's window-0 sum.
//
// Limb arithmetic mirrors field8's fr_add_f8: WGSL has no add-with-carry, so
// the carry out of each word is u32(sum < operand). The loop is unrolled with
// literal indices (no runtime-indexed arrays) — the same Adreno-safe idiom the
// rest of the MSM shaders use.

@group(0) @binding(0) var<storage, read_write> scalars: array<u32>;
@group(0) @binding(1) var<storage, read>       mask:    array<u32>;
@group(0) @binding(2) var<uniform>             params:  vec4<u32>;
// params.x = total_scalars (batchSize * input_size)
// params.y = input_size    (points per MSM, also the slot stride)
// params.z = srs_offset    (mask index base for point 0 of each slot)
// params.w = scalar_words  (must be 8)

const WORDS: u32 = 8u;

// BN254 scalar field modulus r as eight little-endian 32-bit words.
// r = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
const R8_0: u32 = 0xf0000001u;
const R8_1: u32 = 0x43e1f593u;
const R8_2: u32 = 0x79b97091u;
const R8_3: u32 = 0x2833e848u;
const R8_4: u32 = 0x8181585du;
const R8_5: u32 = 0xb85045b6u;
const R8_6: u32 = 0xe131a029u;
const R8_7: u32 = 0x30644e72u;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.x) {
        return;
    }
    let input_size = params.y;
    let srs_offset = params.z;
    let p = i % input_size;
    let s_base = i * WORDS;
    let m_base = (srs_offset + p) * WORDS;

    // Load operands (a = scalar, b = mask), both in [0, r).
    let a0 = scalars[s_base + 0u]; let b0 = mask[m_base + 0u];
    let a1 = scalars[s_base + 1u]; let b1 = mask[m_base + 1u];
    let a2 = scalars[s_base + 2u]; let b2 = mask[m_base + 2u];
    let a3 = scalars[s_base + 3u]; let b3 = mask[m_base + 3u];
    let a4 = scalars[s_base + 4u]; let b4 = mask[m_base + 4u];
    let a5 = scalars[s_base + 5u]; let b5 = mask[m_base + 5u];
    let a6 = scalars[s_base + 6u]; let b6 = mask[m_base + 6u];
    let a7 = scalars[s_base + 7u]; let b7 = mask[m_base + 7u];

    // s = a + b. a, b < r < 2^254 => s < 2^255, so the add never carries out of
    // the 8th word; the 9th-limb carry is provably 0 and is not tracked.
    var s: array<u32, 8>;
    var carry: u32 = 0u;
    { let lo = a0 + b0; let v = lo + carry; s[0] = v; carry = select(0u,1u, lo < a0) + select(0u,1u, v < lo); }
    { let lo = a1 + b1; let v = lo + carry; s[1] = v; carry = select(0u,1u, lo < a1) + select(0u,1u, v < lo); }
    { let lo = a2 + b2; let v = lo + carry; s[2] = v; carry = select(0u,1u, lo < a2) + select(0u,1u, v < lo); }
    { let lo = a3 + b3; let v = lo + carry; s[3] = v; carry = select(0u,1u, lo < a3) + select(0u,1u, v < lo); }
    { let lo = a4 + b4; let v = lo + carry; s[4] = v; carry = select(0u,1u, lo < a4) + select(0u,1u, v < lo); }
    { let lo = a5 + b5; let v = lo + carry; s[5] = v; carry = select(0u,1u, lo < a5) + select(0u,1u, v < lo); }
    { let lo = a6 + b6; let v = lo + carry; s[6] = v; carry = select(0u,1u, lo < a6) + select(0u,1u, v < lo); }
    { let lo = a7 + b7; let v = lo + carry; s[7] = v; carry = select(0u,1u, lo < a7) + select(0u,1u, v < lo); }

    // d = s - r (borrow chain). borrow == 0 after the last word iff s >= r.
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
    { let t = s[0] - R8_0; let v = t - borrow; d[0] = v; borrow = select(0u,1u, s[0] < R8_0) + select(0u,1u, t < borrow); }
    { let t = s[1] - R8_1; let v = t - borrow; d[1] = v; borrow = select(0u,1u, s[1] < R8_1) + select(0u,1u, t < borrow); }
    { let t = s[2] - R8_2; let v = t - borrow; d[2] = v; borrow = select(0u,1u, s[2] < R8_2) + select(0u,1u, t < borrow); }
    { let t = s[3] - R8_3; let v = t - borrow; d[3] = v; borrow = select(0u,1u, s[3] < R8_3) + select(0u,1u, t < borrow); }
    { let t = s[4] - R8_4; let v = t - borrow; d[4] = v; borrow = select(0u,1u, s[4] < R8_4) + select(0u,1u, t < borrow); }
    { let t = s[5] - R8_5; let v = t - borrow; d[5] = v; borrow = select(0u,1u, s[5] < R8_5) + select(0u,1u, t < borrow); }
    { let t = s[6] - R8_6; let v = t - borrow; d[6] = v; borrow = select(0u,1u, s[6] < R8_6) + select(0u,1u, t < borrow); }
    { let t = s[7] - R8_7; let v = t - borrow; d[7] = v; borrow = select(0u,1u, s[7] < R8_7) + select(0u,1u, t < borrow); }

    // borrow != 0  => s < r  => keep s (no reduction); else use d = s - r.
    let keep_s = borrow != 0u;
    scalars[s_base + 0u] = select(d[0], s[0], keep_s);
    scalars[s_base + 1u] = select(d[1], s[1], keep_s);
    scalars[s_base + 2u] = select(d[2], s[2], keep_s);
    scalars[s_base + 3u] = select(d[3], s[3], keep_s);
    scalars[s_base + 4u] = select(d[4], s[4], keep_s);
    scalars[s_base + 5u] = select(d[5], s[5], keep_s);
    scalars[s_base + 6u] = select(d[6], s[6], keep_s);
    scalars[s_base + 7u] = select(d[7], s[7], keep_s);

    {{{ recompile }}}
}
