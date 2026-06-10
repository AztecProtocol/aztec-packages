{{> inverse_funcs }}

{{> field8_funcs }}

// Convert each window's reduced Jacobian sum back to affine (x, y) =
// (X/Z^2, Y/Z^3), in place, in Montgomery form — matching what the affine
// reduce kernel leaves at that slot so the existing per-window gather is
// unchanged. One inversion per window (num_windows total, ~20). Empty window
// (Z == 0) writes the (0, 0) infinity sentinel the host combine expects.
//
// The window root lives at its tight reduce_off prefix base (reduce_sched
// row[0].x), not w*stride — this branch packs windows by reduceOffsets, so
// the per-window base is read from the same schedule table the levels use.
//
// The Jacobian levels track presence via Z and never touch the affine
// is_present plane, so this finalize also stamps is_present at each root slot
// (present iff Z != 0). Without it the gather reads the stale level-0
// is_present (set for the window's magnitude-1 bucket) and drops the reduced
// root of any window whose magnitude-1 bucket happened to be empty.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       red_z:        array<vec4<u32>>;
@group(0) @binding(2) var<uniform>             cparams:      vec4<u32>; // (M, _, max_levels, num_windows)
@group(0) @binding(3) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(4) var<storage, read>       reduce_sched: array<vec4<u32>>;

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
fn load_z(idx: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_z[base + 0u];
    let q1 = red_z[base + 1u];
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

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let w = gid.x;
    let M = cparams.x;
    let max_levels = cparams.z;
    let num_windows = cparams.w;
    if (w >= num_windows) { return; }
    let row = w * (1u + max_levels);
    let slot = reduce_sched[row].x;          // window root = tight reduce_off prefix

    let Z = load_z(slot);
    if (is_zero_f8(Z)) {
        let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        store_x(slot, M, zero);
        store_y(slot, M, zero);
        is_present[slot] = 0u;
        return;
    }
    let X = load_x(slot, M);
    let Y = load_y(slot, M);

    // Zinv = (1/Z)~ : same expand -> safegcd -> contract path the affine
    // kernel uses; Montgomery-in / Montgomery-out.
    var Zinv: array<u32, 8> = {{ inv_fn }}(Z);

    let Z2inv = montgomery_square_f8(Zinv);
    let Z3inv = montgomery_product_f8(Z2inv, Zinv);
    let x = montgomery_product_f8(X, Z2inv);
    let y = montgomery_product_f8(Y, Z3inv);
    store_x(slot, M, x);
    store_y(slot, M, y);
    is_present[slot] = 1u;
}
