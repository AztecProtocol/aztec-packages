// Fully-coalesced SoA + vec4 lean-affine apply. One thread = one pair.
//
// LAYOUT (fully coalesced, vectorised). Each BigInt is 20 u32 limbs =
// 5 vec4<u32> groups. Buffer element type is array<vec4<u32>>. For a
// coordinate plane c and vec4-group v in {0..4}, pair e of N is at
//   index = c*(5*N) + v*N + e
// Consecutive threads e, e+1 reading the same (c,v) hit consecutive
// vec4 slots => fully coalesced, and each BigInt load is 5 vectorised
// loads instead of 20 scalar loads.
//
//   inp planes c: 0=P.x 1=P.y 2=Q.x 3=Q.y      (4 planes, 5*N each)
//   invdx        : single plane (5*N), pair e   inv_dx
//   outp planes c: 0=R.x 1=R.y                  (2 planes, 5*N each)
//   params.x = N (pair count = thread count)
//
// Lean affine formula (P + Q, distinct, supplied inv_dx = 1/(Q.x-P.x)):
//   lambda = (Q.y - P.y) * inv_dx
//   R.x    = lambda^2 - P.x - Q.x
//   R.y    = lambda*(P.x - R.x) - P.y

const VG: u32 = 5u; // 20 limbs / 4 = 5 vec4 groups

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       invdx:  array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

fn load_be(plane_base: u32, e: u32, N: u32) -> BigInt {
    var b: BigInt;
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = inp[plane_base + v * N + e];
        b.limbs[4u * v + 0u] = q.x;
        b.limbs[4u * v + 1u] = q.y;
        b.limbs[4u * v + 2u] = q.z;
        b.limbs[4u * v + 3u] = q.w;
    }
    return b;
}

fn load_invdx(e: u32, N: u32) -> BigInt {
    var b: BigInt;
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = invdx[v * N + e];
        b.limbs[4u * v + 0u] = q.x;
        b.limbs[4u * v + 1u] = q.y;
        b.limbs[4u * v + 2u] = q.z;
        b.limbs[4u * v + 3u] = q.w;
    }
    return b;
}

fn store_be(plane_base: u32, e: u32, N: u32, val: ptr<function, BigInt>) {
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = vec4<u32>(
            (*val).limbs[4u * v + 0u],
            (*val).limbs[4u * v + 1u],
            (*val).limbs[4u * v + 2u],
            (*val).limbs[4u * v + 3u],
        );
        outp[plane_base + v * N + e] = q;
    }
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = params.x;
    let e = gid.x;
    if (e >= N) { return; }

    let plane = VG * N;
    var p_x = load_be(0u * plane, e, N);
    var p_y = load_be(1u * plane, e, N);
    var q_x = load_be(2u * plane, e, N);
    var q_y = load_be(3u * plane, e, N);
    var inv_dx = load_invdx(e, N);

    var lambda = fr_sub(&q_y, &p_y);
    lambda = montgomery_product(&lambda, &inv_dx);
    var r_x = montgomery_product(&lambda, &lambda);
    r_x = fr_sub(&r_x, &p_x);
    r_x = fr_sub(&r_x, &q_x);
    var r_y = fr_sub(&p_x, &r_x);
    r_y = montgomery_product(&lambda, &r_y);
    r_y = fr_sub(&r_y, &p_y);

    store_be(0u * plane, e, N, &r_x);
    store_be(1u * plane, e, N, &r_y);
}
