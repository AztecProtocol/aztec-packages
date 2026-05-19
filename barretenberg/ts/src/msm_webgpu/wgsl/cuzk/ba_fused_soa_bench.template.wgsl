// Single-kernel batched-inverse batch-affine, fully-coalesced SoA+vec4.
//
// Same batched-inverse algorithm as ba_fused_tight_bench: each thread
// owns a chunk of C pairs, builds a forward running prefix-product in a
// private array<BigInt,C>, does ONE fr_inv_by_a per chunk, then peels
// backward with the lean affine formula. The math is unchanged from
// ba_fused_tight (1 fr_inv_by_a per C pairs).
//
// DIFFERENCE vs ba_fused_tight: coalesced SoA+vec4 layout AND a STRIDED
// chunk assignment so global loads stay coalesced. With T = N/C threads,
// thread t handles pairs { t + i*T : i in 0..C } (NOT a contiguous
// t*C..t*C+C block). For chunk-iter i the pair is e = t + i*T, so
// consecutive threads t, t+1 read consecutive e for every (c,v) =>
// fully coalesced loads/stores on every iteration.
//
// LAYOUT: each BigInt = 20 u32 limbs = 5 vec4<u32>. Plane c, vec4-group
// v in {0..4}, pair e of N: index = c*(5*N) + v*N + e.
//   inp planes: 0=P.x 1=P.y 2=Q.x 3=Q.y   (4 planes, 5*N each)
//   outp planes: 0=R.x 1=R.y              (2 planes, 5*N each)
//   params.x = N (total pairs), params.y = T (thread count = N/C)

const CH: u32 = {{ chunk }}u;
const VG: u32 = 5u; // 20 limbs / 4 = 5 vec4 groups

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
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

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = params.x;
    let T = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let plane = VG * N;
    let px_base = 0u * plane;
    let py_base = 1u * plane;
    let qx_base = 2u * plane;
    let qy_base = 3u * plane;

    var pref: array<BigInt, {{ chunk }}>;

    var acc: BigInt = get_r();
    for (var i = 0u; i < CH; i = i + 1u) {
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var q_x = load_be(qx_base, e, N);
        var dx = fr_sub(&q_x, &p_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
    }

    var inv: BigInt = fr_inv_by_a(acc);

    for (var jj = 0u; jj < CH; jj = jj + 1u) {
        let i = CH - 1u - jj;
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var p_y = load_be(py_base, e, N);
        var q_x = load_be(qx_base, e, N);
        var q_y = load_be(qy_base, e, N);

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }

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

        if (i != 0u) {
            var dx_back = fr_sub(&q_x, &p_x);
            inv = montgomery_product(&inv, &dx_back);
        }
    }
}
