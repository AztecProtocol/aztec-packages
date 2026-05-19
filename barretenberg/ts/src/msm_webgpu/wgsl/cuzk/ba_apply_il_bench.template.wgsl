// Two-kernel pipeline stage 2: software-pipelined (stage-interleaved)
// affine apply. Each thread owns M = {{ m }} INDEPENDENT pairs and runs
// the lean affine formula STAGE-BY-STAGE across all M (NOT pair-by-pair),
// so that within each montmul stage the M ops are mutually independent
// and the GPU pipelines them — hiding montmul dependency-chain latency
// even at modest thread counts.
//
// Lean affine formula (per pair):
//   dy     = q_y - p_y
//   lambda = dy * inv_dx
//   lsq    = lambda^2
//   r_x    = lsq - p_x - q_x
//   t0     = p_x - r_x
//   r_y    = lambda * t0 - p_y
//
// Strided independent-pair assignment: thread t handles pairs
//   { t + s*T : s = 0..M-1 }   where T = params.x = #threads.
// Distinct pairs, so per-pair state has no cross-pair feedback.
//
// Bindings: 0 inp (4 BigInt/pair AoS: P.x,P.y,Q.x,Q.y),
//           1 invdx (1 BigInt/pair, supplied 1/dx), 2 outp (R.x,R.y/pair),
//           3 params uniform vec4<u32> (params.x = T = #threads;
//           total pairs = T*M).

const M: u32 = {{ m }}u;

@group(0) @binding(0) var<storage, read>       inp:    array<BigInt>;
@group(0) @binding(1) var<storage, read>       invdx:  array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outp:   array<BigInt>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let tcount = params.x;
    let tid = gid.x;
    if (tid >= tcount) { return; }

    var px:  array<BigInt, {{ m }}>;
    var py:  array<BigInt, {{ m }}>;
    var qx:  array<BigInt, {{ m }}>;
    var qy:  array<BigInt, {{ m }}>;
    var inv: array<BigInt, {{ m }}>;
    var dy:  array<BigInt, {{ m }}>;
    var lam: array<BigInt, {{ m }}>;
    var lsq: array<BigInt, {{ m }}>;
    var rx:  array<BigInt, {{ m }}>;
    var ry:  array<BigInt, {{ m }}>;
    var t0:  array<BigInt, {{ m }}>;

    // load
    for (var s = 0u; s < M; s = s + 1u) {
        let g = tid + s * tcount;
        let pb = g * 4u;
        px[s]  = inp[pb + 0u];
        py[s]  = inp[pb + 1u];
        qx[s]  = inp[pb + 2u];
        qy[s]  = inp[pb + 3u];
        inv[s] = invdx[g];
    }

    // stage A: dy = q_y - p_y
    for (var s = 0u; s < M; s = s + 1u) {
        var a = qy[s];
        var b = py[s];
        dy[s] = fr_sub(&a, &b);
    }

    // stage B: lambda = dy * inv_dx   (M independent montmuls)
    for (var s = 0u; s < M; s = s + 1u) {
        var a = dy[s];
        var b = inv[s];
        lam[s] = montgomery_product(&a, &b);
    }

    // stage C: lsq = lambda^2          (M independent montmuls)
    for (var s = 0u; s < M; s = s + 1u) {
        var a = lam[s];
        lsq[s] = montgomery_product(&a, &a);
    }

    // stage D: r_x = lsq - p_x - q_x
    for (var s = 0u; s < M; s = s + 1u) {
        var a = lsq[s];
        var b = px[s];
        var c = fr_sub(&a, &b);
        var d = qx[s];
        rx[s] = fr_sub(&c, &d);
    }

    // stage E: t0 = p_x - r_x
    for (var s = 0u; s < M; s = s + 1u) {
        var a = px[s];
        var b = rx[s];
        t0[s] = fr_sub(&a, &b);
    }

    // stage F: r_y = lambda * t0       (M independent montmuls)
    for (var s = 0u; s < M; s = s + 1u) {
        var a = lam[s];
        var b = t0[s];
        ry[s] = montgomery_product(&a, &b);
    }

    // stage G: r_y = r_y - p_y
    for (var s = 0u; s < M; s = s + 1u) {
        var a = ry[s];
        var b = py[s];
        ry[s] = fr_sub(&a, &b);
    }

    // store
    for (var s = 0u; s < M; s = s + 1u) {
        let g = tid + s * tcount;
        let ob = g * 2u;
        outp[ob + 0u] = rx[s];
        outp[ob + 1u] = ry[s];
    }
}
