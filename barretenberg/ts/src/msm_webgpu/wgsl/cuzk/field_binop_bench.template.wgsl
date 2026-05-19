// Per-thread chained binary-field-op micro-benchmark (BN254 base field,
// u32 / 20x13-bit limbs, Montgomery form). Each thread loads one (a, b)
// pair and runs `k` chained calls to the field op selected by the
// `{{ op_fn }}` Mustache substitution (`fr_add` or `fr_sub`):
//   a <- {{ op_fn }}(&a, &b)   repeated k times,
// then writes the final `a` back. Mirrors the bind layout and loop
// structure of field_mul_bench_u32 so the primitives bench can drive
// add / sub / mul through one consistent harness.
//
// LOOP BOUNDS
//   - The only data-dependent loop is `for (var i = 0u; i < k; i++)`
//     with `k = params.y`, host-capped before dispatch.
//   - `if (tid >= n)` is a guard, not a loop bound; `n = params.x`.
//   - Every loop inside fr_add / fr_sub / bigint_* is bounded by the
//     compile-time constant NUM_WORDS.

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
        a = {{ op_fn }}(&a, &b);
    }
    outputs[tid] = a;
}
