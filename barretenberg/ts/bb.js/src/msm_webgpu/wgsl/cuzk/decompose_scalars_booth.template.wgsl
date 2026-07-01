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
//
// Tier 2 batch mode: when WINDOWS_PER_MSM < total dispatch num_windows, the
// global window index `w_global = gid.y + batch_window_base` is interpreted
// as a *virtual* index spanning B*W effective windows. It splits into
// (b = w_global / WINDOWS_PER_MSM, w = w_global mod WINDOWS_PER_MSM); the
// thread reads scalar `b * input_size + p` and bits at offset `w * c`.
// bucket_and_sign is still written at the batch-local `gid.y * input_size +
// p` (the downstream pipeline is oblivious to MSM identity). For B=1
// (WINDOWS_PER_MSM == total num_windows), b is always 0 and w = w_global —
// identical to the single-MSM behaviour.

@group(0) @binding(0) var<storage, read>       scalars:         array<u32>;
@group(0) @binding(1) var<storage, read_write> bucket_and_sign: array<u32>;
@group(0) @binding(2) var<uniform>             params:          vec4<u32>;
// params.x = input_size   (points per MSM — also points per window)
// params.y = num_windows  (windows in this dispatch batch)
// params.z = window_bits  (c)
// params.w = scalar_words (u32 words per scalar)
// Lever G (window batching): batch.x = batch_window_base, the global
// index of this dispatch-batch's first effective window. Window bits are
// sliced at the GLOBAL effective window index (gid.y + batch_window_base);
// bucket_and_sign is written at the batch-local index (gid.y).
@group(0) @binding(3) var<uniform>             batch:           vec4<u32>;

// Per-MSM windows. For single-MSM (B=1) this equals the host's
// `m.numWindows`; for batch mode it is the per-MSM W and the total
// effective window count is `B * WINDOWS_PER_MSM`.
const WINDOWS_PER_MSM: u32 = {{ windows_per_msm }}u;

const WORD_BITS: u32 = 32u;

// Adreno-safe variable shifts: express a runtime shift amount s in [0,31] as
// <= 5 constant-amount shifts (a barrel shifter). Adreno 7xx (Galaxy S23 /
// Adreno 740) miscompiles runtime shift amounts — the same reason the sign was
// packed at the literal bit 31 below — while constant amounts fold cleanly on
// every driver. Bit-identical to `x >> s` / `x << s` for s in [0,31] on a
// conformant target.
fn shr_var(x: u32, s: u32) -> u32 {
    var r = x;
    if ((s & 16u) != 0u) { r = r >> 16u; }
    if ((s & 8u) != 0u) { r = r >> 8u; }
    if ((s & 4u) != 0u) { r = r >> 4u; }
    if ((s & 2u) != 0u) { r = r >> 2u; }
    if ((s & 1u) != 0u) { r = r >> 1u; }
    return r;
}
fn shl_var(x: u32, s: u32) -> u32 {
    var r = x;
    if ((s & 16u) != 0u) { r = r << 16u; }
    if ((s & 8u) != 0u) { r = r << 8u; }
    if ((s & 4u) != 0u) { r = r << 4u; }
    if ((s & 2u) != 0u) { r = r << 2u; }
    if ((s & 1u) != 0u) { r = r << 1u; }
    return r;
}

// Read `count` (<= 32) bits at absolute bit `bit_off` from scalar `s`,
// little-endian. Bits past the scalar's words read as 0. Variable shifts go
// through shr_var/shl_var (Adreno-740 correctness).
fn read_bits(s: u32, scalar_words: u32, bit_off: u32, count: u32) -> u32 {
    let base = s * scalar_words;
    let word = bit_off / WORD_BITS;
    let off = bit_off % WORD_BITS;
    var v: u32 = 0u;
    if (word < scalar_words) {
        v = shr_var(scalars[base + word], off);
    }
    if (off + count > WORD_BITS && word + 1u < scalar_words) {
        v = v | shl_var(scalars[base + word + 1u], WORD_BITS - off);
    }
    if (count >= WORD_BITS) {
        return v;
    }
    return v & (shl_var(1u, count) - 1u);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let p = gid.x;
    let w_local = gid.y;
    let input_size = params.x;
    let num_windows = params.y;
    if (p >= input_size || w_local >= num_windows) {
        return;
    }
    let c = params.z;
    let scalar_words = params.w;
    let w_global = w_local + batch.x;

    // Tier-2 virtual-window split: w_global = b * WINDOWS_PER_MSM + w.
    // Lookback is 0 at w==0 (the bottom window of each MSM's scalar) — not
    // at w_global==0. Each MSM b reads bits from scalar `b * input_size + p`.
    let b = w_global / WINDOWS_PER_MSM;
    let w = w_global % WINDOWS_PER_MSM;
    let scalar_idx = b * input_size + p;

    // c+1-bit window: the window's c bits, with the lookback bit (top bit
    // of the window below in the same scalar; synthetic 0 for window 0) as
    // the LSB.
    let win_bits = read_bits(scalar_idx, scalar_words, w * c, c);
    var lookback: u32 = 0u;
    if (w > 0u) {
        lookback = read_bits(scalar_idx, scalar_words, w * c - 1u, 1u);
    }
    let raw = (win_bits << 1u) | lookback;

    // Constantine signedWindowEncoding: bit c of raw is the sign; the
    // magnitude is the conditionally-negated (raw + 1) >> 1.
    let neg = shr_var(raw, c) & 1u;
    let neg_mask = 0u - neg;            // 0 or 0xFFFFFFFF
    let val_mask = shl_var(1u, c) - 1u;
    let encode = (raw + 1u) >> 1u;
    let bucket = ((encode - neg) ^ neg_mask) & val_mask;

    let idx = w_local * input_size + p;
    // Pack: bucket in low bits, sign in bit 31. Constant shift — works on
    // Adreno (see header).
    bucket_and_sign[idx] = bucket | (neg << 31u);

    {{{ recompile }}}
}
