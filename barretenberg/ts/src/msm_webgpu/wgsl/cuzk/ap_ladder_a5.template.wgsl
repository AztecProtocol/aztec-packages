// LADDER A rung 5: apA5_full — the REAL apply_precomputed_k1 formula.
//
// Byte-identical body to ba_apply_tight_bench (the apply_precomputed_k1
// anchor): same AoS layout, bindings, 1-pair/thread launch geometry and
// load/store volume as apA0..apA4, with the TRUE data-dependency chain
//   lambda = (q_y - p_y) * inv_dx
//   r_x    = lambda^2 - p_x - q_x
//   r_y    = lambda * (p_x - r_x) - p_y
// (3 montmul + 5 sub, real wiring). This rung must reproduce the ~18.9
// ns/pair anchor; delta (apA5-apA4) isolates the dependency-chain /
// scheduling overhead of the real wiring vs the loose op sum.

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
