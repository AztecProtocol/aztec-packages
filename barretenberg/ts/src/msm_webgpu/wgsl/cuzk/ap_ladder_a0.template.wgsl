// LADDER A rung 0: apA0_loadstore — apply_precomputed memory floor.
//
// Identical AoS layout, binding set, 1-pair/thread launch geometry and
// load/store volume as ba_apply_tight_bench (the apply_precomputed_k1
// anchor): each thread loads p_x,p_y,q_x,q_y from xs[g*4..] and inv_dx
// from ys[g], and stores two BigInts to outputs[g*2..]. ZERO field
// arithmetic. Every loaded limb of all 5 inputs is XOR/ADD-folded into
// the two stored outputs so the compiler cannot dead-code-eliminate any
// load. (apA1 = this + montmul#1, etc.) Geometry HELD for all A-rungs.

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

        var r_x: BigInt;
        var r_y: BigInt;
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            r_x.limbs[w] = p_x.limbs[w] ^ q_x.limbs[w] ^ inv_dx.limbs[w];
            r_y.limbs[w] = p_y.limbs[w] ^ q_y.limbs[w] ^ inv_dx.limbs[w];
        }

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;
    }
}
