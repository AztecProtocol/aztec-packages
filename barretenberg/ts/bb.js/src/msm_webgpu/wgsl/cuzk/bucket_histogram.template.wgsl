// Per-bucket histogram of carry-free signed-Booth digits.
//
// Host mirror of `buildInitCounts` (msm_v2.ts): for every (point, window),
// extract the c-bit window plus its lookback bit, run the signed-Booth
// recode to get the absolute bucket index in [0, 2^(c-1)], and
// atomic-increment counts[w * BW + bucket]. BW comes in as a compile-time
// constant (matches the host-side `m.BW`).
//
// The dispatch is 2D: gid.x ranges over points, gid.y over windows. One
// thread per (point, window) — the same shape as the existing
// decompose_scalars_booth pass that runs at MSM-run time. The output is a
// flat NUM_WINDOWS × BW u32 array that MsmV2.prepare reads back and uses
// to plan the per-level pair/carry/stride counts.
//
// Tier 2 batch mode: when WINDOWS_PER_MSM < NUM_WINDOWS, the shader treats
// gid.y as a *virtual* window index spanning B*W effective windows. Each
// effective window y_eff decomposes into (b = y_eff / WINDOWS_PER_MSM, w =
// y_eff mod WINDOWS_PER_MSM), and reads scalar `b * input_size + p` for
// thread (p, y_eff). For B=1 (WINDOWS_PER_MSM == NUM_WINDOWS), b is always
// 0 and the formula collapses to the original single-MSM behaviour.
//
// Why we need this:
//   The host had been doing the same recode in JS — `n × num_windows`
//   iterations of integer math. At n=2^20 that is 17M iterations and
//   costs ~250 ms on the main thread, dominating `prepare()`. The GPU
//   does it in a few ms; the readback (NUM_WINDOWS × BW × 4 bytes ~=
//   2 MB at c=16) is cheap.
//
// Atomic contention: with BW ≈ 32k buckets per window and ~n/BW ≈ 32
// scalars hitting each bucket at n=2^20 with uniform Fr scalars, atomic
// pressure is low. Adversarial distributions would serialize, but the
// bridge's contract (MsmV2 only sees scalars from real Fr commits) makes
// this a non-issue.

const BW: u32 = {{ buckets_per_window }}u;
// Number of Pippenger windows per individual MSM. For single-MSM (B=1) use
// this equals the total dispatch's num_windows; for batch mode (B>1) it is
// the per-MSM W and total dispatch num_windows = B * WINDOWS_PER_MSM.
const WINDOWS_PER_MSM: u32 = {{ windows_per_msm }}u;

@group(0) @binding(0) var<storage, read>           scalars: array<u32>;
@group(0) @binding(1) var<storage, read_write>     counts:  array<atomic<u32>>;
@group(0) @binding(2) var<uniform>                 params:  vec4<u32>;
// params.x = input_size   (n)
// params.y = num_windows
// params.z = window_bits  (c)
// params.w = scalar_words (u32 words per scalar, always 8 for BN254)

const WORD_BITS: u32 = 32u;

// Adreno-safe variable shifts (barrel shifter): a runtime shift amount s in
// [0,31] as <= 5 constant-amount shifts. Adreno 7xx (Galaxy S23 / Adreno 740)
// miscompiles runtime shift amounts; constant amounts fold cleanly. Bit-
// identical to `x >> s` / `x << s` for s in [0,31]. Kept in sync with the copy
// in decompose_scalars_booth.
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

// Same `read_bits` as decompose_scalars_booth — kept inline so the two
// shaders stay independently editable. Reads `count` bits at absolute
// bit `bit_off` in scalar `s`, little-endian; bits past the scalar's
// words read as 0. Variable shifts go through shr_var/shl_var (Adreno-740).
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
    let y_eff = gid.y;
    let input_size = params.x;
    let num_windows = params.y;
    if (p >= input_size || y_eff >= num_windows) {
        return;
    }
    let c = params.z;
    let scalar_words = params.w;

    // Tier-2 virtual-window split: y_eff = b * WINDOWS_PER_MSM + w.
    // For B=1 (WINDOWS_PER_MSM == num_windows), b is always 0 and w = y_eff —
    // identical to the single-MSM behaviour.
    let b = y_eff / WINDOWS_PER_MSM;
    let w = y_eff % WINDOWS_PER_MSM;
    let scalar_idx = b * input_size + p;

    let win_bits = read_bits(scalar_idx, scalar_words, w * c, c);
    var lookback: u32 = 0u;
    if (w > 0u) {
        lookback = read_bits(scalar_idx, scalar_words, w * c - 1u, 1u);
    }
    let raw = (win_bits << 1u) | lookback;

    // Constantine signedWindowEncoding: bit c of raw is the sign; the
    // magnitude is the conditionally-negated (raw + 1) >> 1.
    let neg = shr_var(raw, c) & 1u;
    let neg_mask = 0u - neg;
    let val_mask = shl_var(1u, c) - 1u;
    let encode = (raw + 1u) >> 1u;
    let bucket = ((encode - neg) ^ neg_mask) & val_mask;

    atomicAdd(&counts[y_eff * BW + bucket], 1u);

    {{{ recompile }}}
}
