// Two-kernel pipeline stage 2: affine apply, M distinct pairs per thread.
//
// Each thread processes M independent pairs in a loop — NOT chained
// (no feedback): one affine formula per pair, operands loaded fresh
// inside the loop so only one pair's working set is live at any instant
// (peak register pressure unchanged from M=1, but kernel-launch /
// scheduling overhead is amortised over M pairs). AoS inputs.
//
// xs = inputs (4 BigInt/pair: P.x,P.y,Q.x,Q.y), ys = inv_dx (1/pair),
// outputs = R.x,R.y (2/pair). params=(n_threads, M, _, _). M = {{ m }}
// compile-time. pair g = tid*M + m.

const M: u32 = {{ m }}u;

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let tid = gid.x;
    if (tid >= n) { return; }

    for (var m = 0u; m < M; m = m + 1u) {
        let g = tid * M + m;
        let pb = g * 4u;
        var p_x = xs[pb + 0u];
        var p_y = xs[pb + 1u];
        var q_x = xs[pb + 2u];
        var q_y = xs[pb + 3u];
        var inv_dx = ys[g];

        var dy = fr_sub(&q_y, &p_y);
        var slope = montgomery_product(&dy, &inv_dx);
        var slope_sq = montgomery_product(&slope, &slope);
        var t1 = fr_sub(&slope_sq, &p_x);
        var r_x = fr_sub(&t1, &q_x);
        var dxb = fr_sub(&p_x, &r_x);
        var ldx = montgomery_product(&slope, &dxb);
        var r_y = fr_sub(&ldx, &p_y);

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;
    }
}
