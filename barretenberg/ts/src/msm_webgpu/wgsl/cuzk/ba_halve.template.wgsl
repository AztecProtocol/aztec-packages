{{> inverse_funcs }}



{{> field8_funcs }}

// One depth of the halving bucket reduction (Mitschabaude), batch-affine,
// CPAIRS independent pair-additions per thread sharing ONE inversion.
//
// Live state at depth d: (1+d) arrays per window, each of length L = B >> d
// — the weighted array W (arena offset 0) and carries 1..d (carry_j at arena
// offset B >> j). One depth halves every array in place:
//     dst[i] += src[i],  src = dst + L/2,  i < L/2
// The src half is NEVER written; for W it IS the newly-born carry, already
// at its home address. Pairs are completely independent — this kernel just
// grabs CPAIRS of them per thread, strided for coalescing.
//
// Pair completeness (matches the C++ try_filter_pair semantics): equal x
// selects the doubling denominator 2y into the shared inversion chain
// (a zero denominator would poison the whole batch) and a rare branch in
// the apply uses the 3x² numerator; equal x with negated y writes infinity.
// These branches are uniformly not-taken for non-adversarial inputs.
//
// The per-pair work runs in ROLLED loops whose trip count is lparams.y
// (== CPAIRS, but read from a uniform so mobile driver compilers cannot
// unroll them — fully inlining CPAIRS copies of the montmul body crashes
// the Adreno/Mali shader compilers). CPAIRS only sizes the private
// partial-product array for the shared batch inversion.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const CPAIRS: u32 = {{ cpairs }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(2) var<uniform>             cparams:      vec4<u32>;
@group(0) @binding(3) var<uniform>             lparams:      vec4<u32>;
@group(0) @binding(4) var<storage, read>       hsched:       array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> pref_scratch: array<vec4<u32>>;
// cparams = (M_RED (red_buf x/y plane stride), _, _, _).
// lparams = (depth, cpairs, 0, 0) — cpairs duplicated here so loop bounds
// stay opaque to the driver's unroller.
// hsched[w] = (base, B, 0, 0) — window w's arena base slot and stride.

fn load_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_x(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn store_y(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * M + PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn fr_eq_f8(a: array<u32, 8>, b: array<u32, 8>) -> bool {
    return a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3] &&
           a[4] == b[4] && a[5] == b[5] && a[6] == b[6] && a[7] == b[7];
}

fn fr_is_zero_f8(a: array<u32, 8>) -> bool {
    return (a[0] | a[1] | a[2] | a[3] | a[4] | a[5] | a[6] | a[7]) == 0u;
}

// Arena offset of array a: 0 for W, B >> a for carry_a.
fn arena_off(B: u32, a: u32) -> u32 {
    return select(B >> a, 0u, a == 0u);
}

// Per-thread partial products for the shared batch inversion, in the GLOBAL
// pref scratch — the stream walker's exact pattern (store_pref/load_pref,
// k-major × flat-thread-minor so adjacent lanes share cache lines). The
// region is the dense reduce's reducePrefScratch, idle in halving mode.
fn store_pref(k: u32, ft: u32, k_stride: u32, val: array<u32, 8>) {
    let b = k * k_stride + ft * 2u;
    pref_scratch[b + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    pref_scratch[b + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn load_pref(k: u32, ft: u32, k_stride: u32) -> array<u32, 8> {
    let b = k * k_stride + ft * 2u;
    let q0 = pref_scratch[b + 0u];
    let q1 = pref_scratch[b + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.y;
    let t = wgid.x * WG + lid.x;
    let M_RED = cparams.x;
    let d = lparams.x;
    let h = hsched[w];
    let base = h.x;
    let B = h.y;
    let L = B >> d;
    let half = L >> 1u;
    let hshift = firstTrailingBit(half);
    let pairs = (1u + d) * half;
    // CPAIRS strided pairs per thread; T threads cover the window.
    let T = (pairs + CPAIRS - 1u) / CPAIRS;
    if (t >= T) {
        return;
    }
    let r1: array<u32, 8> = get_r_f8();

{{{ pairs_gather }}}

{{{ chain_invert_peel }}}

{{{ pairs_apply }}}
}
