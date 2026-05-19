// Register-pressure montmul microbench. Each thread keeps L independent
// (a, b) pairs in private register-array slots, then chains
// `a_i = montgomery_product(&a_i, &b_i)` for k iterations across all L
// slots. Measures montmul throughput when the surrounding kernel has a
// non-trivial live set of BigInts — i.e. the realistic composition cost,
// not the isolated 1-BigInt chained throughput of field_mul_bench_u32.
// L is the compile-time Mustache constant {{ live }}; k is runtime
// (params.y, host-capped). xs / ys: L BigInt per thread.

const L: u32 = {{ live }}u;

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

    let base = tid * L;
    var accs: array<BigInt, {{ live }}>;
    var bs: array<BigInt, {{ live }}>;
    for (var i = 0u; i < L; i = i + 1u) {
        accs[i] = xs[base + i];
        bs[i] = ys[base + i];
    }
    for (var iter = 0u; iter < k; iter = iter + 1u) {
        for (var i = 0u; i < L; i = i + 1u) {
            var ai = accs[i];
            var bi = bs[i];
            accs[i] = montgomery_product(&ai, &bi);
        }
    }
    for (var i = 0u; i < L; i = i + 1u) {
        outputs[base + i] = accs[i];
    }
}
