// Fused single-kernel BATCHED-inverse batch-affine, software-pipelined.
//
// Batched-inverse math is IDENTICAL to ba_fused_tight: per-thread chunk
// of CH = {{ chunk }} pairs, ONE fr_inv_by_a per chunk, forward running
// product + backward serial peel producing inv_dx_i = 1/dx_i for every
// pair. The ONLY difference vs ba_fused_tight is that the lean affine
// formula is STAGE-INTERLEAVED across the CH pairs (instead of computed
// pair-by-pair), so the independent montmuls within each formula stage
// pipeline and hide montmul dependency-chain latency.
//
// Strided chunk assignment (independent pairs, no cross-pair feedback in
// the formula): thread t owns pairs { t + i*T : i = 0..CH-1 }, where
// T = params.x = #threads (= total_pairs / CH).
//
// Forward running product (pref[i] = dx[0]*..*dx[i]) and the backward
// peel are INHERENTLY serial (1 montmul/pair each) and kept serial —
// exactly as in ba_fused_tight; the serial chain across the grid's
// threads is hidden by thread-level parallelism (proven by standalone
// montmul throughput). Bindings: 0 inp (4 BigInt/pair AoS), 1 unused,
// 2 outp (R.x,R.y/pair), 3 params uniform (params.x = T = #threads).

const CH: u32 = {{ chunk }}u;

@group(0) @binding(0) var<storage, read>       inp:    array<BigInt>;
@group(0) @binding(1) var<storage, read>       unused: array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outp:   array<BigInt>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let tcount = params.x;
    let tid = gid.x;
    if (tid >= tcount) { return; }

    var px:  array<BigInt, {{ chunk }}>;
    var py:  array<BigInt, {{ chunk }}>;
    var qx:  array<BigInt, {{ chunk }}>;
    var qy:  array<BigInt, {{ chunk }}>;
    var dx:  array<BigInt, {{ chunk }}>;
    var pref: array<BigInt, {{ chunk }}>;
    var idx: array<BigInt, {{ chunk }}>;

    // forward stage 1: load + dx = q_x - p_x
    for (var i = 0u; i < CH; i = i + 1u) {
        let g = tid + i * tcount;
        let pb = g * 4u;
        px[i] = inp[pb + 0u];
        py[i] = inp[pb + 1u];
        qx[i] = inp[pb + 2u];
        qy[i] = inp[pb + 3u];
        var a = qx[i];
        var b = px[i];
        dx[i] = fr_sub(&a, &b);
    }

    // forward running product (serial, 1 montmul/pair — same as
    // ba_fused_tight): pref[i] = dx[0] * dx[1] * ... * dx[i].
    var acc: BigInt = get_r();
    for (var i = 0u; i < CH; i = i + 1u) {
        if (i == 0u) {
            acc = dx[0u];
        } else {
            var a = acc;
            var b = dx[i];
            acc = montgomery_product(&a, &b);
        }
        pref[i] = acc;
    }

    // ONE inversion per chunk (batched): inv = 1 / (dx[0]*..*dx[CH-1]).
    var inv: BigInt = fr_inv_by_a(acc);

    // backward serial peel (same as ba_fused_tight): produce
    // inv_dx_i = 1/dx_i for every pair. inv_dx_i = inv * pref[i-1]
    // (i>0), inv_dx_0 = inv after peeling; inv *= dx_i each step.
    for (var jj = 0u; jj < CH; jj = jj + 1u) {
        let i = CH - 1u - jj;
        if (i == 0u) {
            idx[0u] = inv;
        } else {
            var a = inv;
            var b = pref[i - 1u];
            idx[i] = montgomery_product(&a, &b);
            var c = inv;
            var d = dx[i];
            inv = montgomery_product(&c, &d);
        }
    }

    // ---- lean affine formula, STAGE-INTERLEAVED across the CH pairs ----
    // (exact stage A..G structure; independent montmuls per stage hide
    //  montmul latency). idx[i] == 1/dx_i (== inv_dx).
    var dy:  array<BigInt, {{ chunk }}>;
    var lam: array<BigInt, {{ chunk }}>;
    var lsq: array<BigInt, {{ chunk }}>;
    var rx:  array<BigInt, {{ chunk }}>;
    var ry:  array<BigInt, {{ chunk }}>;
    var t0:  array<BigInt, {{ chunk }}>;

    // stage A: dy = q_y - p_y
    for (var i = 0u; i < CH; i = i + 1u) {
        var a = qy[i];
        var b = py[i];
        dy[i] = fr_sub(&a, &b);
    }

    // stage B: lambda = dy * inv_dx   (CH independent montmuls)
    for (var i = 0u; i < CH; i = i + 1u) {
        var a = dy[i];
        var b = idx[i];
        lam[i] = montgomery_product(&a, &b);
    }

    // stage C: lsq = lambda^2          (CH independent montmuls)
    for (var i = 0u; i < CH; i = i + 1u) {
        var a = lam[i];
        lsq[i] = montgomery_product(&a, &a);
    }

    // stage D: r_x = lsq - p_x - q_x
    for (var i = 0u; i < CH; i = i + 1u) {
        var a = lsq[i];
        var b = px[i];
        var c = fr_sub(&a, &b);
        var d = qx[i];
        rx[i] = fr_sub(&c, &d);
    }

    // stage E: t0 = p_x - r_x
    for (var i = 0u; i < CH; i = i + 1u) {
        var a = px[i];
        var b = rx[i];
        t0[i] = fr_sub(&a, &b);
    }

    // stage F: r_y = lambda * t0       (CH independent montmuls)
    for (var i = 0u; i < CH; i = i + 1u) {
        var a = lam[i];
        var b = t0[i];
        ry[i] = montgomery_product(&a, &b);
    }

    // stage G: r_y = r_y - p_y
    for (var i = 0u; i < CH; i = i + 1u) {
        var a = ry[i];
        var b = py[i];
        ry[i] = fr_sub(&a, &b);
    }

    // store
    for (var i = 0u; i < CH; i = i + 1u) {
        let g = tid + i * tcount;
        let ob = g * 2u;
        outp[ob + 0u] = rx[i];
        outp[ob + 1u] = ry[i];
    }
}
