// Two-kernel pipeline stage 2: affine apply, minimal-temporary form.
//
// Lean formula (no slope/dy/t1/dxb temporaries kept live — reuse r_x/r_y
// in place, only `lambda` survives across steps):
//   lambda = (y2 - y1) * inv_dx
//   x3     = lambda^2 - x1 - x2
//   y3     = lambda * (x1 - x3) - y1
// Peak named live BigInts ≈ 5 (p_x,p_y,q_x,lambda,r_x) vs ~8 in the
// previous apply kernel. M distinct pairs/thread (M={{ m }}, no chaining).

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

        var lambda = fr_sub(&q_y, &p_y);
        lambda = montgomery_product(&lambda, &inv_dx);
        var r_x = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &p_x);
        r_x = fr_sub(&r_x, &q_x);
        var r_y = fr_sub(&p_x, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &p_y);

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;
    }
}
