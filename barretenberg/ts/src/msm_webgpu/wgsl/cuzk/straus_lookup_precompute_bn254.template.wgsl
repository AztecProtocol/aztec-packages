// straus_msm lookup-precompute kernel for BN254 G1 — **window-shifted**
// variant. The classic Straus LUT only stores `(k+1)·P_i`; the inter-
// window doublings then live on the critical path inside `straus_main`.
// Here we bake the per-window `2^(4w)` shift directly into the LUT, so
// `straus_main` becomes a straight sum of 64 lookups (32 windows × 2
// halves) with **zero between-window doublings**.
//
// Layout: `lut[i * STRIDE + w * 16 + h * 8 + k]` = `(k+1) · 2^(4w) · P_i`
// for h = 0, or the φ-image `(β · X, Y, Z)` of the same point for h = 1.
// STRIDE = 32 windows × 16 (h ∈ {0,1} × k ∈ [0, 8)) = 512 entries / point.
//
// Dispatch: one thread per (i, h, k) — N × 16 threads total. Each thread
// independently:
//   1. Builds its own `(k+1) · P_i` (h=0) or β-scaled variant (h=1) via
//      k chained mixed-adds from the affine base.
//   2. Writes the w=0 entry, then doubles 4× per window through w=31,
//      writing the chained entry after each round of doublings.
// No cross-thread state; serial only along the per-thread 124-doubling
// chain. With N × 16 threads in parallel on M2 (~512 lanes), the
// wall-clock per dispatch is ~one per-thread chain × per-op cost.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
{{> ec_funcs }}

const N:                 u32 = {{ n }}u;
const LOOKUP_SIZE:       u32 = 8u;
const HALVES:            u32 = 2u;
const ENTRIES_PER_POINT: u32 = LOOKUP_SIZE * HALVES;
const NUM_WINDOWS:       u32 = 32u;
const WINDOW_BITS:       u32 = 4u;
const STRIDE:            u32 = NUM_WINDOWS * ENTRIES_PER_POINT;

@group(0) @binding(0) var<storage, read>       base_x: array<BigInt>;
@group(0) @binding(1) var<storage, read>       base_y: array<BigInt>;
@group(0) @binding(2) var<storage, read_write> lut_x:  array<BigInt>;
@group(0) @binding(3) var<storage, read_write> lut_y:  array<BigInt>;
@group(0) @binding(4) var<storage, read_write> lut_z:  array<BigInt>;

fn get_mont_one() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_beta_mont() -> BigInt {
    var b: BigInt;
{{{ beta_mont_limbs }}}
    return b;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let tid: u32 = gid.x;
    let i:   u32 = tid / ENTRIES_PER_POINT;
    if (i >= N) { return; }
    let hk:  u32 = tid - i * ENTRIES_PER_POINT;
    let h:   u32 = hk / LOOKUP_SIZE;
    let k:   u32 = hk - h * LOOKUP_SIZE;

    var pt: Point;
    pt.x = base_x[i];
    pt.y = base_y[i];
    pt.z = get_mont_one();

    var entry: Point = pt;
    for (var j: u32 = 0u; j < k; j = j + 1u) {
        entry = add_points_mixed(entry, pt);
    }

    if (h == 1u) {
        var beta_v: BigInt = get_beta_mont();
        var x_in: BigInt = entry.x;
        entry.x = montgomery_product(&x_in, &beta_v);
    }

    let row_base: u32 = i * STRIDE + h * LOOKUP_SIZE + k;
    lut_x[row_base] = entry.x;
    lut_y[row_base] = entry.y;
    lut_z[row_base] = entry.z;

    for (var w: u32 = 1u; w < NUM_WINDOWS; w = w + 1u) {
        for (var d: u32 = 0u; d < WINDOW_BITS; d = d + 1u) {
            entry = double_point(entry);
        }
        let off: u32 = i * STRIDE + w * ENTRIES_PER_POINT + h * LOOKUP_SIZE + k;
        lut_x[off] = entry.x;
        lut_y[off] = entry.y;
        lut_z[off] = entry.z;
    }

    {{{ recompile }}}
}
