// LADDER A rung 3: apA3_mul3 — apA2_mul2 + 3rd montmul.
//
// Same AoS layout/bindings/geometry as apA0..apA2. Adds a third
// distinct Montgomery multiply (the real formula has exactly 3 montmuls:
// lambda=dy*inv_dx, l2=lambda^2, m=lambda*t). Here the 3rd is
// lambda*lambda again as a stand-in distinct montmul (t is not yet
// formed — its sub belongs to the apA4 sub group). lambda, l2 and m3
// all fold into the stored XOR accumulator so none can be DCE'd.
// Delta (apA3-apA2) = the in-context marginal cost of montmul#3.

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
        var l2 = montgomery_product(&lambda, &lambda);
        var m3 = montgomery_product(&lambda, &lambda);

        var r_x: BigInt;
        var r_y: BigInt;
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            r_x.limbs[w] = p_x.limbs[w] ^ q_x.limbs[w] ^ inv_dx.limbs[w] ^ lambda.limbs[w] ^ l2.limbs[w] ^ m3.limbs[w];
            r_y.limbs[w] = p_y.limbs[w] ^ q_y.limbs[w] ^ inv_dx.limbs[w] ^ lambda.limbs[w] ^ l2.limbs[w] ^ m3.limbs[w];
        }

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;
    }
}
