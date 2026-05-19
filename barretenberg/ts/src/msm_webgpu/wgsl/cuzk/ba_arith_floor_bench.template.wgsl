// Profiling kernel: the TRUE arithmetic floor of one batch-affine pair —
// the full per-pair op mix (1 batch-inverse running-product fold + the
// lean affine formula) with EVERY operand in registers, NO prefix array,
// NO inversion, chained k times at maximum occupancy. This is the
// "overwhelming complexity is the Montgomery ops" target:
//   per pair: dx=x2-x1 (sub); acc=acc*dx (mul, batch-inv fold);
//             lambda=(y2-y1)*inv (sub,mul); x3=lambda^2-x1-x2 (mul,2 sub);
//             y3=lambda*(x1-x3)-y1 (sub,mul,sub)
//   = ~4 mul + ~6 sub per pair (the 2 extra batch-inverse muls and the
//     amortised inversion are measured separately).
// Result fed back as next P so the chain is a real dependency.

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

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
    var acc = inv_dx;

    for (var i = 0u; i < k; i = i + 1u) {
        var dx = fr_sub(&q_x, &p_x);
        acc = montgomery_product(&acc, &dx);
        var lambda = fr_sub(&q_y, &p_y);
        lambda = montgomery_product(&lambda, &inv_dx);
        var r_x = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &p_x);
        r_x = fr_sub(&r_x, &q_x);
        var r_y = fr_sub(&p_x, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &p_y);
        p_x = r_x;
        p_y = r_y;
    }

    let ob = tid * 2u;
    outputs[ob + 0u] = p_x;
    var accf = acc;
    outputs[ob + 1u] = fr_add(&p_y, &accf);
}
