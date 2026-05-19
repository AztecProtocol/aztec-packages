// Software-pipelined (stage-interleaved) fully-coalesced SoA+vec4
// lean-affine apply. Each thread owns W = {{ w }} INDEPENDENT pairs and
// runs the lean affine formula STAGE-BY-STAGE across all W lanes (NOT
// pair-by-pair), so every montmul stage issues W mutually independent
// montmuls back-to-back. The independent montmuls of different lanes
// overlap and hide montmul dependency-chain latency, so the apply runs
// montmul-throughput-bound instead of latency-bound (the W=1
// apply_precomputed_k1 baseline is latency-bound at ~3 montmul latencies
// per pair because its 3 montmuls form one dependent chain).
//
// Lean affine formula (per pair, supplied inv_dx = 1/(Q.x - P.x)):
//   dy     = Q.y - P.y
//   lambda = dy * inv_dx
//   l2     = lambda^2
//   R.x    = l2 - P.x - Q.x
//   t      = P.x - R.x
//   R.y    = lambda * t - P.y
//
// Stages (all W lanes of a stage before the next stage so the W
// montmuls of stages B/C/F are provably independent — each writes a
// distinct private array slot and reads only slots produced by an
// earlier completed stage; no inter-lane or intra-stage data
// dependency, so the compiler/GPU cannot serialise them):
//   A: dy[l]    = Q.y[l] - P.y[l]
//   B: lam[l]   = dy[l]  * inv[l]            (W independent montmuls)
//   C: l2[l]    = lam[l] * lam[l]            (W independent squarings)
//   D: rx[l]    = (l2[l] - P.x[l]) - Q.x[l]
//   E: t[l]     = P.x[l] - rx[l]
//   F: m[l]     = lam[l] * t[l]              (W independent montmuls)
//   G: ry[l]    = m[l] - P.y[l] ; store rx[l], ry[l]
//
// LAYOUT: identical to ba_apply_soa_bench. Each BigInt = 20 u32 limbs =
// 5 vec4<u32> groups (VG=5). Buffer element type array<vec4<u32>>. For
// coordinate plane c and vec4-group v in {0..4}, slot e of N:
//   index = c*(VG*N) + v*N + e
// Consecutive threads at the same (c,v,l) hit consecutive vec4 slots
// (strided lane assignment e = t + l*T) => fully coalesced.
//   inp planes c: 0=P.x 1=P.y 2=Q.x 3=Q.y    (4 planes, VG*N each)
//   invdx        : single plane (VG*N), slot e = inv_dx
//   outp planes c: 0=R.x 1=R.y               (2 planes, VG*N each)
//   params.x = N (padded pair count = T*W), params.y = T (thread count)
//
// Lane l of thread t is pair e = t + l*T (distinct pairs, no cross-lane
// feedback). The host pads N up to a multiple of W; padding slots are
// well-formed random pairs so every lane does real work.

const W: u32 = {{ w }}u;
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
    let T = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let plane = VG * N;
    let pxb = 0u * plane;
    let pyb = 1u * plane;
    let qxb = 2u * plane;
    let qyb = 3u * plane;

    // Minimal live per-lane state. px,py,qx survive to stages D/E/G;
    // qy is dead after stage A so its array is reused for dy then l2
    // then ry; inv is dead after stage B so its array is reused for the
    // stage-E/F scratch t. Peak live arrays = 6 (px,py,qx,lam + the two
    // reused: qy/dy/l2/ry and inv/t).
    var px:  array<BigInt, {{ w }}>;
    var py:  array<BigInt, {{ w }}>;
    var qx:  array<BigInt, {{ w }}>;
    var qy:  array<BigInt, {{ w }}>; // role: Q.y -> dy -> l2 -> R.y
    var inv: array<BigInt, {{ w }}>; // role: inv_dx -> t
    var lam: array<BigInt, {{ w }}>;

    // load (coalesced: strided lane assignment e = t + l*T)
    for (var l = 0u; l < W; l = l + 1u) {
        let e = t + l * T;
        px[l]  = load_be(pxb, e, N);
        py[l]  = load_be(pyb, e, N);
        qx[l]  = load_be(qxb, e, N);
        qy[l]  = load_be(qyb, e, N);
        inv[l] = load_invdx(e, N);
    }

    // stage A: dy = Q.y - P.y           (qy[l] := dy[l])
    for (var l = 0u; l < W; l = l + 1u) {
        var a = qy[l];
        var b = py[l];
        qy[l] = fr_sub(&a, &b);
    }

    // stage B: lambda = dy * inv_dx     (W independent montmuls)
    for (var l = 0u; l < W; l = l + 1u) {
        var a = qy[l];
        var b = inv[l];
        lam[l] = montgomery_product(&a, &b);
    }

    // stage C: l2 = lambda^2            (W independent squarings)
    for (var l = 0u; l < W; l = l + 1u) {
        var a = lam[l];
        qy[l] = montgomery_product(&a, &a); // qy[l] := l2[l]
    }

    // stage D: R.x = (l2 - P.x) - Q.x   (qy[l] := R.x[l])
    for (var l = 0u; l < W; l = l + 1u) {
        var a = qy[l];
        var b = px[l];
        var c = fr_sub(&a, &b);
        var d = qx[l];
        qy[l] = fr_sub(&c, &d);
    }

    // stage E: t = P.x - R.x            (inv[l] := t[l])
    for (var l = 0u; l < W; l = l + 1u) {
        var a = px[l];
        var b = qy[l];
        inv[l] = fr_sub(&a, &b);
    }

    // stage F: m = lambda * t           (W independent montmuls)
    for (var l = 0u; l < W; l = l + 1u) {
        var a = lam[l];
        var b = inv[l];
        lam[l] = montgomery_product(&a, &b); // lam[l] := m[l]
    }

    // stage G: R.y = m - P.y ; store R.x (qy[l]), R.y (lam[l])
    for (var l = 0u; l < W; l = l + 1u) {
        var a = lam[l];
        var b = py[l];
        var ry = fr_sub(&a, &b);
        var rx = qy[l];
        let e = t + l * T;
        store_be(0u * plane, e, N, &rx);
        store_be(1u * plane, e, N, &ry);
    }
}
