// ABLATION 3 of msm_bucket_s16: amortised inversion removed.
//
// Byte-identical to ba_msm_bucket_bench EXCEPT the single fr_inv_by_a
// call is replaced by a cheap stand-in (one fr_sub of the accumulated
// product with itself's R-residue) so forward + backward peel + the
// 3-distinct-montmul lean apply all still run on every thread, only
// the inversion's amortised contribution is gone. (full - this)
// isolates the per-chunk fr_inv_by_a amortised over S.
//
// Models the MSM bucket inner loop: each thread owns ONE resident
// accumulator A (kept in registers across the whole S-point chunk) and
// folds a streamed chunk of S independent points P_0..P_{S-1} into it
// via the unconditional lean affine add, with the batched inversion
// shared across all S adds in the chunk (exactly ONE fr_inv_by_a per
// chunk of S). The batched-inverse math is byte-identical to
// ba_fused_tight_bench: a forward running prefix-product of the S
// dx values in a private array<BigInt,S>, ONE fr_inv_by_a, then a
// backward peel with the lean affine formula (dx recomputed free in
// the backward pass).
//
// The accumulator A and its running prefix array stay in registers for
// the whole chunk; only the streamed P_i incur a global load, and that
// load is coalesced (SoA + vec4 + strided thread/point assignment so
// consecutive threads read consecutive points on every chunk-iter,
// amortised exactly like the k=40 montmul-realism load pattern).
//
// LAYOUT: each BigInt = 20 u32 limbs = 5 vec4<u32> groups (VG=5). For
// the S-streamed points there are 4 coordinate planes (A.x, A.y of the
// per-thread accumulator seed, plus P.x, P.y of the streamed point);
// plane c, vec4-group v in {0..4}, slot e of N: index = (c*VG+v)*N+e.
//   inp planes: 0=A.x 1=A.y 2=P.x 3=P.y   (4 planes, VG*N each)
//   outp planes: 0=R.x 1=R.y              (2 planes, VG*N each)
//   params.x = N (total point-adds), params.y = T (thread count = N/S)
//
// Thread t streams points e = t + i*T for i in 0..S (strided => fully
// coalesced). The "left" operand of add i is the running prefix
// accumulator A_i; A_0 is the per-thread seed (plane 0/1 at e=t), and
// P_i (plane 2/3) is the streamed independent point (x != A.x).

const S: u32 = {{ s }}u;
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
    let ax_base = 0u * plane;
    let ay_base = 1u * plane;
    let px_base = 2u * plane;
    let py_base = 3u * plane;

    // Resident accumulator A.x stays in registers across the whole
    // chunk (drives the forward dx prefix chain). A.y is only needed in
    // the backward peel and is re-loaded there from the same SoA plane.
    var acc_x = load_be(ax_base, t, N);

    // Forward pass: running prefix-product of the S dx values
    // dx_i = P_i.x - A_i.x. A_i is the prefix accumulator (resident).
    var pref: array<BigInt, {{ s }}>;
    var acc: BigInt = get_r();
    for (var i = 0u; i < S; i = i + 1u) {
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var dx = fr_sub(&p_x, &acc_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
        // The resident accumulator advances along the streamed chain:
        // A_0 is the seed, A_{i+1} := P_i. Points are independent
        // (P_i.x != A_i.x) so every dx is a well-defined nonzero
        // difference. inv_dx is deferred to the backward pass (ONE
        // fr_inv_by_a per chunk of S); A stays in registers throughout.
        acc_x = p_x;
    }

    // Cheap inversion stand-in: copy the accumulated product instead of
    // calling fr_inv_by_a. Downstream forward/backward/lean montmuls are
    // unchanged so only the amortised inversion cost is removed.
    var inv: BigInt = acc;

    // Backward peel + lean affine formula (dx recomputed free).
    for (var jj = 0u; jj < S; jj = jj + 1u) {
        let i = S - 1u - jj;
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var p_y = load_be(py_base, e, N);

        // A_i (left operand): A_0 is the seed, A_i = P_{i-1} for i>0
        // (matches the forward acc_x recurrence; points independent so
        // dx = P_i.x - A_i.x is always well-defined and nonzero).
        var a_x: BigInt;
        var a_y: BigInt;
        if (i == 0u) {
            a_x = load_be(ax_base, t, N);
            a_y = load_be(ay_base, t, N);
        } else {
            let ep = t + (i - 1u) * T;
            a_x = load_be(px_base, ep, N);
            a_y = load_be(py_base, ep, N);
        }

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
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

        store_be(0u * plane, e, N, &r_x);
        store_be(1u * plane, e, N, &r_y);

        if (i != 0u) {
            var dx_back = fr_sub(&p_x, &a_x);
            inv = montgomery_product(&inv, &dx_back);
        }
    }
}
