// Per-thread software-pipelined double-buffered batch-affine kernel.
//
// Goal: HIDE the serial data-dependent latency of fr_inv_by_a (the
// modular inversion) rather than reduce its frequency. The cooperative
// count-reduction approach regressed because the ~48 ns serial inversion
// stalls the whole SIMT group at a workgroup barrier. This kernel uses
// NO workgroup memory and NO workgroupBarrier() at all: it is pure
// per-thread, so the existing cross-thread latency hiding (many threads
// in flight) is preserved, and on TOP of that each thread overlaps the
// long-latency data-dependent inversion of one sub-chunk with the
// inverse-independent montmul work of the other.
//
// Each thread owns TWO independent sub-chunks A and B, each of g pairs
// (2*g pairs/thread total). Data flow that makes the two inversions
// mutually independent and overlappable:
//   1. forward-product A -> accA           (g montmuls; reads only A's
//      streamed points; independent of B entirely)
//   2. forward-product B -> accB           (g montmuls; reads only B's
//      streamed points; independent of A and of accA)
//   3. invA = fr_inv_by_a(accA)            (long-latency, data-dependent
//      ONLY on accA)
//   4. invB = fr_inv_by_a(accB)            (long-latency, data-dependent
//      ONLY on accB; NOT dependent on invA -> issued back-to-back so the
//      two inversions' latencies overlap, and the scheduler can also
//      overlap them with step-2/5 montmuls)
//   5. backward-peel + lean affine apply A using invA  (the montmuls
//      here are inverse-independent of invB and fill invB's latency
//      shadow)
//   6. backward-peel + lean affine apply B using invB
// accA depends only on A's loads; accB only on B's loads; invA only on
// accA; invB only on accB. invA and invB share no operand, so the GPU
// can have both inversions' long dependent chains in flight at once and
// overlap each with the other sub-chunk's montmul work.
//
// Per-pair math is byte-identical to ba_msm_bucket_bench (lean formula,
// accumulator-structured forward acc*=dx / backward inv*=dx, prefix-only
// private array<BigInt,g> per sub-chunk, dx recomputed free in backward,
// SoA+vec4 coalesced load). Only the minimal live state is kept (two
// array<BigInt,g> prefix arrays + accA/accB/invA/invB + lean temps);
// g is kept small because the earlier ILP attempt regressed from
// register spill.
//
// LAYOUT (identical to ba_msm_bucket_bench): each BigInt = 20 u32 limbs
// = 5 vec4<u32> groups (VG=5). Planes: 0=A.x 1=A.y 2=P.x 3=P.y, each
// VG*N. params.x = N (total point-adds), params.y = T (thread count).
// Sub-chunk A of thread t streams pairs i in 0..g at e = t + i*T;
// sub-chunk B streams pairs i in 0..g at e = t + (g+i)*T. Both are
// strided => fully coalesced, and points are independent (P.x != A.x).
// The chunk runner passes chunk = 2*g so T = N / (2*g).

const G: u32 = {{ g }}u;
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

// Forward running prefix-product of a sub-chunk's g dx values.
// base_i is the streamed-point index of the sub-chunk's pair 0; pair k
// of the sub-chunk is at e = base_i + k*T. A_0 is the per-thread seed
// (plane 0/1 at base e), A_{k+1} := P_k (independent => dx well-defined,
// nonzero). Writes the running prefix into pref and returns the full
// product accumulator.
fn fwd_product(base_e: u32, T: u32, N: u32, ax_base: u32, px_base: u32,
               pref: ptr<function, array<BigInt, {{ g }}>>) -> BigInt {
    var acc_x = load_be(ax_base, base_e, N);
    var acc: BigInt = get_r();
    for (var k = 0u; k < G; k = k + 1u) {
        let e = base_e + k * T;
        var p_x = load_be(px_base, e, N);
        var dx = fr_sub(&p_x, &acc_x);
        if (k == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        (*pref)[k] = acc;
        acc_x = p_x;
    }
    return acc;
}

// Backward peel + lean affine apply for a sub-chunk, consuming the
// sub-chunk's own inverse `inv` of its forward product. dx recomputed
// free in the backward pass; per-pair math byte-identical to
// ba_msm_bucket_bench. base_e is pair 0's streamed index.
fn bwd_apply(base_e: u32, T: u32, N: u32, ax_base: u32, ay_base: u32,
             px_base: u32, py_base: u32, inv_in: BigInt,
             pref: ptr<function, array<BigInt, {{ g }}>>) {
    var inv = inv_in;
    for (var jj = 0u; jj < G; jj = jj + 1u) {
        let k = G - 1u - jj;
        let e = base_e + k * T;
        var p_x = load_be(px_base, e, N);
        var p_y = load_be(py_base, e, N);

        var a_x: BigInt;
        var a_y: BigInt;
        if (k == 0u) {
            a_x = load_be(ax_base, base_e, N);
            a_y = load_be(ay_base, base_e, N);
        } else {
            let ep = base_e + (k - 1u) * T;
            a_x = load_be(px_base, ep, N);
            a_y = load_be(py_base, ep, N);
        }

        var inv_dx: BigInt;
        if (k == 0u) {
            inv_dx = inv;
        } else {
            var pp = (*pref)[k - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }

        var lambda = fr_sub(&p_y, &a_y);
        lambda = montgomery_product(&lambda, &inv_dx);
        var r_x = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &a_x);
        r_x = fr_sub(&r_x, &p_x);
        var r_y = fr_sub(&a_x, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &a_y);

        store_be(0u * (VG * N), e, N, &r_x);
        store_be(1u * (VG * N), e, N, &r_y);

        if (k != 0u) {
            var dx_back = fr_sub(&p_x, &a_x);
            inv = montgomery_product(&inv, &dx_back);
        }
    }
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = params.x;
    let T = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let plane = VG * N;
    let ax_base = 0u * plane;
    let ay_base = 1u * plane;
    let px_base = 2u * plane;
    let py_base = 3u * plane;

    // Sub-chunk A streams pairs i in 0..G at e = t + i*T.
    // Sub-chunk B streams pairs i in 0..G at e = t + (G+i)*T.
    let baseA = t;
    let baseB = t + G * T;

    var prefA: array<BigInt, {{ g }}>;
    var prefB: array<BigInt, {{ g }}>;

    // 1. forward-product A (independent of B)
    var accA = fwd_product(baseA, T, N, ax_base, px_base, &prefA);
    // 2. forward-product B (independent of A and of accA)
    var accB = fwd_product(baseB, T, N, ax_base, px_base, &prefB);

    // 3-4. The two inversions share no operand: invA depends only on
    // accA, invB only on accB. Issued back-to-back so their long
    // data-dependent latencies overlap with each other and with the
    // surrounding montmul work.
    var invA: BigInt = fr_inv_by_a(accA);
    var invB: BigInt = fr_inv_by_a(accB);

    // 5. backward-peel A (montmuls here are invB-independent and fill
    //    invB's latency shadow)
    bwd_apply(baseA, T, N, ax_base, ay_base, px_base, py_base, invA, &prefA);
    // 6. backward-peel B
    bwd_apply(baseB, T, N, ax_base, ay_base, px_base, py_base, invB, &prefB);
}
