// Isolation bench #1: the affine-add FORMULA only (post-inverse), with all
// operands resident in registers. This is the "sum of parts" floor the
// batch-affine kernel should approach:
//   lambda = (Q.y - P.y) * inv_dx
//   R.x    = lambda^2 - P.x - Q.x
//   R.y    = lambda * (P.x - R.x) - P.y
// = 3 montgomery_product + 5 fr_sub per pair, zero scan, zero workgroup
// memory, one input load + one output store amortised over k.
//
// Each thread loads one (P, Q, inv_dx) tuple once, then runs the formula
// `k` times chained, writing the final R. xs = inputs (4 BigInt/pair:
// P.x,P.y,Q.x,Q.y), ys = precomputed inv_dx (1 BigInt/pair), outputs =
// 2 BigInt/pair. params = (n_threads, k).

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

    let pb = tid * 4u;
    var p_x = xs[pb + 0u];
    var p_y = xs[pb + 1u];
    var q_x = xs[pb + 2u];
    var q_y = xs[pb + 3u];
    var inv_dx = ys[tid];

    var r_x: BigInt;
    var r_y: BigInt;
    for (var i = 0u; i < k; i = i + 1u) {
        var dy = fr_sub(&q_y, &p_y);
        var slope = montgomery_product(&dy, &inv_dx);
        var slope_sq = montgomery_product(&slope, &slope);
        var t1 = fr_sub(&slope_sq, &p_x);
        r_x = fr_sub(&t1, &q_x);
        var dxb = fr_sub(&p_x, &r_x);
        var ldx = montgomery_product(&slope, &dxb);
        r_y = fr_sub(&ldx, &p_y);
        // Feed R back as the next P so the chain is a true data dependency
        // (prevents the compiler hoisting the loop body out).
        p_x = r_x;
        p_y = r_y;
    }

    let ob = tid * 2u;
    outputs[ob + 0u] = r_x;
    outputs[ob + 1u] = r_y;
}
