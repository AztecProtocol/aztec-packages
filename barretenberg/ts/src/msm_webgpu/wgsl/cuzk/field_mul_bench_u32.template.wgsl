// Field-mul micro-benchmark, u32 / 20×13-bit limbs (Mitschabaude-CIOS).
// Every thread loads one (a, b) pair, runs `k` chained Montgomery
// products (a = montgomery_product(a, b) repeated k times), and writes
// the final `a` back. The host caps `k` at <=100 before passing it in.
//
// Loop bounds. The only data-dependent loop is `for (var i = 0u; i < k; i++)`
// where `k = params.y` is a host-uniform capped at 100. The early-out
// `if (tid >= n)` is a guard, not a loop bound, and `n = params.x` is
// host-capped at 2^23 to keep dispatch sizes reasonable. The inner
// `montgomery_product` loops are bounded by the compile-time constant
// `NUM_WORDS`.

// Inputs are split into two separate `xs`/`ys` arrays (one BigInt per
// thread per array). Matches the f32 path's layout for symmetry — the
// `array<struct{a,b}>` packing was found to produce all-zero outputs on
// Dawn/Metal in the f32 variant of this shader; using separate arrays
// sidesteps that concern.
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

    var a = xs[tid];
    var b = ys[tid];
    for (var i = 0u; i < k; i = i + 1u) {
        a = montgomery_product(&a, &b);
    }
    outputs[tid] = a;
}
