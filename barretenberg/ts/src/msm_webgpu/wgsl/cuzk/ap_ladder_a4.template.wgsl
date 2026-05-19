// LADDER A rung 4: apA4_subs — apA3_mul3 + the 5 fr_sub of the real
// formula (wired loosely).
//
// Same AoS layout/bindings/geometry as apA0..apA3. Adds the five field
// subtractions of the real apply_precomputed formula:
//   s1 = q_y - p_y      (dy)
//   s2 = l2  - p_x      (rx step 1)
//   s3 = s2  - q_x      (rx step 2)
//   s4 = p_x - s3       (t)
//   s5 = m3  - p_y      (ry)
// They are wired loosely (not the true dependency chain — that is apA5)
// and every sub result folds into the stored XOR accumulator so none can
// be DCE'd. Delta (apA4-apA3) = the in-context marginal cost of 5 subs.

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

        var s1 = fr_sub(&q_y, &p_y);
        var s2 = fr_sub(&l2, &p_x);
        var s3 = fr_sub(&s2, &q_x);
        var s4 = fr_sub(&p_x, &s3);
        var s5 = fr_sub(&m3, &p_y);

        var r_x: BigInt;
        var r_y: BigInt;
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            r_x.limbs[w] = p_x.limbs[w] ^ q_x.limbs[w] ^ inv_dx.limbs[w]
                ^ lambda.limbs[w] ^ l2.limbs[w] ^ m3.limbs[w]
                ^ s1.limbs[w] ^ s2.limbs[w] ^ s3.limbs[w] ^ s4.limbs[w] ^ s5.limbs[w];
            r_y.limbs[w] = p_y.limbs[w] ^ q_y.limbs[w] ^ inv_dx.limbs[w]
                ^ lambda.limbs[w] ^ l2.limbs[w] ^ m3.limbs[w]
                ^ s1.limbs[w] ^ s2.limbs[w] ^ s3.limbs[w] ^ s4.limbs[w] ^ s5.limbs[w];
        }

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;
    }
}
