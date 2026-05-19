// LADDER A rung 1: apA1_mul1 — apA0_loadstore + ONE montmul.
//
// Same AoS layout/bindings/geometry/load-store volume as apA0. Adds
// exactly one Montgomery multiply: lambda = dy * inv_dx with dy = qy-py
// (the single sub needed to form montmul#1's first operand). lambda is
// folded into the same XOR accumulator that is stored, so the montmul
// cannot be dead-code-eliminated. Delta (apA1-apA0) = the in-context
// marginal cost of one montmul under this exact memory/launch profile.

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
        var lambda = montgomery_product(&dy, &inv_dx);

        var r_x: BigInt;
        var r_y: BigInt;
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            r_x.limbs[w] = p_x.limbs[w] ^ q_x.limbs[w] ^ inv_dx.limbs[w] ^ lambda.limbs[w];
            r_y.limbs[w] = p_y.limbs[w] ^ q_y.limbs[w] ^ inv_dx.limbs[w] ^ lambda.limbs[w];
        }

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;
    }
}
