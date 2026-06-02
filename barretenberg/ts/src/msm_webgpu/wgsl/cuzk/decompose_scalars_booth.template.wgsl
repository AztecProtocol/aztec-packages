// Carry-free signed-Booth window decompose.
//
// Port of Constantine's signedWindowEncoding (barretenberg C++
// scalar_multiplication.cpp, get_constantine_packed_digit). A c-bit
// window's signed digit is a pure function of c+1 bits: the window's own
// c bits plus the top bit of the window below it (the "lookback" bit,
// a synthetic 0 for the bottom window). Reading that one shared bit is
// what removes the carry chain a plain signed-digit recoder needs — so
// every (point, window) digit is independent and the kernel is
// embarrassingly parallel.
//
// Per (window, point) it writes one u32: bits [0..30] hold the bucket index
// in [0, 2^(c-1)] (0 is the zero digit), bit 31 holds the sign (1 => negate
// the point in this window). Packing both into one buffer (instead of two
// parallel u32 arrays) halves the (window × point) working set — for n=131k
// that's ~10MB less GPU memory. The transpose phase reads the bucket via
// `entry & 0x7FFFFFFFu`; the csr_to_v2 gather reads the sign via
// `entry >> 31u`. Scalars must be in normal (non-Montgomery) form.
//
// Why the sign sits at bit 31 (a literal) and not at bit `c` (a uniform):
// Adreno's WGSL compiler (Galaxy S25, etc.) is unreliable for runtime
// shift amounts — `(neg << c)` where `c` comes from a uniform produces
// either garbage or compile errors. Bit 31 is a literal, Tint folds it
// into a constant-shift instruction, every driver handles it cleanly. We
// have plenty of headroom: pickC() caps c at 15, so bucket < 2^15 and
// bits [15..30] are unused but harmless.

@group(0) @binding(0) var<storage, read>       scalars:         array<u32>;
@group(0) @binding(1) var<storage, read_write> bucket_and_sign: array<u32>;
@group(0) @binding(2) var<uniform>             params:          vec4<u32>;
// params.x = input_size   (points per window)
// params.y = num_windows  (windows in this batch)
// params.z = window_bits  (c)
// params.w = scalar_words (u32 words per scalar)
// Lever G (window batching): batch.x = batch_window_base, the global
// index of this batch's first window. Window bits are sliced from the
// scalar at the GLOBAL window index (gid.y + batch_window_base);
// bucket_and_sign is written at the batch-local index (gid.y).
@group(0) @binding(3) var<uniform>             batch:           vec4<u32>;
// WindowDesc table (SPLIT_C_PLAN.md): one row per GLOBAL window, stride 8 u32;
// window_bits at +0, bit_base at +1. Uniform fill (window_bits=c, bit_base=w·c)
// makes this byte-identical to the old constant-c path; split-c fills it with the
// variable schedule. Read here (not params.z) so the per-window c/bit-offset is
// table-driven — `read_bits` already takes a runtime count, so variable c is free.
@group(0) @binding(4) var<storage, read>       window_desc:     array<u32>;

const WORD_BITS: u32 = 32u;
const WD_STRIDE: u32 = 8u;

// Read `count` (<= 32) bits at absolute bit `bit_off` from scalar `s`,
// little-endian. Bits past the scalar's words read as 0.
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
    let p = gid.x;
    let w = gid.y;
    let input_size = params.x;
    let num_windows = params.y;
    if (p >= input_size || w >= num_windows) {
        return;
    }
    let scalar_words = params.w;
    let w_global = w + batch.x;
    // Per-window geometry from the WindowDesc table (uniform fill ⇒ c, w_global·c).
    let c = window_desc[w_global * WD_STRIDE + 0u];       // window_bits
    let bit_base = window_desc[w_global * WD_STRIDE + 1u];

    // c+1-bit window: the window's c bits, with the lookback bit (top bit
    // of the window below; synthetic 0 for window 0) shifted in as the LSB.
    let win_bits = read_bits(p, scalar_words, bit_base, c);
    var lookback: u32 = 0u;
    if (w_global > 0u) {
        lookback = read_bits(p, scalar_words, bit_base - 1u, 1u);
    }
    let raw = (win_bits << 1u) | lookback;

    // Constantine signedWindowEncoding: bit c of raw is the sign; the
    // magnitude is the conditionally-negated (raw + 1) >> 1.
    let neg = (raw >> c) & 1u;
    let neg_mask = 0u - neg;            // 0 or 0xFFFFFFFF
    let val_mask = (1u << c) - 1u;
    let encode = (raw + 1u) >> 1u;
    let bucket = ((encode - neg) ^ neg_mask) & val_mask;

    let idx = w * input_size + p;
    // Pack: bucket in low bits, sign in bit 31. Constant shift — works on
    // Adreno (see header).
    bucket_and_sign[idx] = bucket | (neg << 31u);

    {{{ recompile }}}
}
