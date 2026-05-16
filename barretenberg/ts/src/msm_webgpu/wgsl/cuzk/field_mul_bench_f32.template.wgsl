// Field-mul micro-benchmark, f32 / 12×23-bit limbs (CIOS over f32 FMA).
// Every thread loads one (a, b) pair, runs `k` chained Montgomery
// products (a = montgomery_product_f32(a, b) repeated k times), and
// writes the final `a` back. The host caps `k` at <=100 before passing
// it in.
//
// Loop bounds. The only data-dependent loop is `for (var i = 0u; i < k; i++)`
// where `k = params.y` is a host-uniform capped at 100. The early-out
// `if (tid >= n)` is a guard, not a loop bound, and `n = params.x` is
// host-capped at 2^23 to keep dispatch sizes reasonable. The inner
// `montgomery_product_f32` loops are bounded by the compile-time constant
// `NUM_LIMBS`.

// Inputs are split into two separate `xs`/`ys` arrays (one BigIntF32
// per thread per array). This mirrors the working layout used by
// `testMontgomeryProductF32` in wgsl_unit_tests.ts — packing into a
// single `array<Pair{a,b}>` produced all-zero outputs on Dawn/Metal
// even when the inputs read back correctly via a passthrough variant,
// so we sidestep struct-in-array layout concerns entirely.
@group(0) @binding(0) var<storage, read>       xs:      array<BigIntF32>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigIntF32>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigIntF32>;
@group(0) @binding(3) var<uniform>             params:  vec2<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let k = params.y;
    let tid = gid.x;
    if (tid >= n) { return; }

    var a = xs[tid];
    var b = ys[tid];
    // Chained loop calls the unreduced body — Mont is closed over inputs
    // in [0, 2p) since all limbs stay < W. Final conditional_reduce
    // canonicalizes the result.
    for (var i = 0u; i < k; i = i + 1u) {
        a = montgomery_product_f32_unreduced(&a, &b);
    }
    var p_final = get_p_f32();
    outputs[tid] = conditional_reduce_f32(&a, &p_final);
}
