// Upper-region scalar decompose for split-c region-split (Phase 2C-ii).
//
// Identical Booth signed-window decode to decompose_scalars_booth, with two
// differences that let the W_hi narrow upper windows skip the n - n_large small
// scalars that contribute zero there:
//   1. point source = idx_large[j] (the indices whose MSB reaches the upper
//      region), not the dense index — so it iterates only n_large scalars.
//   2. output is written at the upper-region base (cci_base, in point-entry
//      units = W_lo*n) with row stride n_large, so the lower region
//      ([w*n + p], all n) and this region tile bucket_and_sign disjointly.
// The global window index is W_lo + w (batch.x), so the per-window geometry
// (window_bits / bit_base) comes from WindowDesc exactly as the lower region.

@group(0) @binding(0) var<storage, read>       scalars:         array<u32>;
@group(0) @binding(1) var<storage, read_write> bucket_and_sign: array<u32>;
@group(0) @binding(2) var<uniform>             params:          vec4<u32>;
// params.x = n_large (upper input size / row stride)  params.y = W_hi (upper window count)
// params.z = cci_base (bucket_and_sign upper base, point-entry units = W_lo*n)
// params.w = scalar_words
@group(0) @binding(3) var<uniform>             batch:           vec4<u32>;
// batch.x = W_lo (global index of the first upper window)
@group(0) @binding(4) var<storage, read>       window_desc:     array<u32>;
@group(0) @binding(5) var<storage, read>       idx_large:       array<u32>;

const WORD_BITS: u32 = 32u;
const WD_STRIDE: u32 = 8u;

fn read_bits(s: u32, scalar_words: u32, bit_off: u32, count: u32) -> u32 {
    let base = s * scalar_words;
    let word = bit_off / WORD_BITS;
    let off = bit_off % WORD_BITS;
    var v: u32 = 0u;
    if (word < scalar_words) {
        v = scalars[base + word] >> off;
    }
    if (off + count > WORD_BITS && word + 1u < scalar_words) {
        v = v | (scalars[base + word + 1u] << (WORD_BITS - off));
    }
    if (count >= WORD_BITS) {
        return v;
    }
    return v & ((1u << count) - 1u);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let j = gid.x;          // upper-region point index (into idx_large)
    let w = gid.y;          // upper-region window index (relative to W_lo)
    let n_large = params.x;
    let w_hi = params.y;
    if (j >= n_large || w >= w_hi) {
        return;
    }
    let scalar_words = params.w;
    let s = idx_large[j];           // the actual (dense) scalar index
    let w_global = w + batch.x;     // global window = W_lo + w
    let c = window_desc[w_global * WD_STRIDE + 0u];
    let bit_base = window_desc[w_global * WD_STRIDE + 1u];

    let win_bits = read_bits(s, scalar_words, bit_base, c);
    var lookback: u32 = 0u;
    if (w_global > 0u) {
        lookback = read_bits(s, scalar_words, bit_base - 1u, 1u);
    }
    let raw = (win_bits << 1u) | lookback;
    let neg = (raw >> c) & 1u;
    let neg_mask = 0u - neg;
    let val_mask = (1u << c) - 1u;
    let encode = (raw + 1u) >> 1u;
    let bucket = ((encode - neg) ^ neg_mask) & val_mask;

    let idx = params.z + w * n_large + j; // cci_base + w*n_large + j
    bucket_and_sign[idx] = bucket | (neg << 31u);

    {{{ recompile }}}
}
