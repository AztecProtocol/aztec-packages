// Per-thread chained UNCONDITIONAL Jacobian point-addition micro-benchmark
// (BN254, u32 / 20x13-bit limbs, Montgomery form).
//
// Each thread loads two independent Jacobian points p1, p2 (each stored as
// 3 consecutive BigInt = x, y, z) and runs `k` chained calls to
// `add_points_no_collision` — the straight-line add-2007-bl formula with
// NO x1==x2 check, NO point-at-infinity fallback, NO doubling fallback
// (the only guards are the cheap is_zero(z) identity checks, which never
// fire for random non-zero z). Inputs are random, so p1 != p2 and
// x1 != x2 with overwhelming probability, matching the requested contract.
//
//   p1 <- add_points_no_collision(p1, p2)   repeated k times
//
// LOOP BOUNDS
//   - The only data-dependent loop is `for (var i = 0u; i < k; i++)`
//     with `k = params.y`, host-capped before dispatch.
//   - `if (tid >= n)` is a guard, not a loop bound; `n = params.x`.
//   - Every loop inside add_points_no_collision / montgomery_product /
//     fr_add / fr_sub is bounded by the compile-time constant NUM_WORDS.

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec2<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let k = params.y;
    let tid = gid.x;
    if (tid >= n) { return; }

    let base = tid * 3u;
    var p1: Point;
    p1.x = xs[base];
    p1.y = xs[base + 1u];
    p1.z = xs[base + 2u];
    var p2: Point;
    p2.x = ys[base];
    p2.y = ys[base + 1u];
    p2.z = ys[base + 2u];

    for (var i = 0u; i < k; i = i + 1u) {
        p1 = add_points_no_collision(p1, p2);
    }

    outputs[base]      = p1.x;
    outputs[base + 1u] = p1.y;
    outputs[base + 2u] = p1.z;
}
