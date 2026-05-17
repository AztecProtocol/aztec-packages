// Per-thread chained-inversion micro-benchmark for the field inverse.
//
// Each thread reads one BN254 base-field value `a` (in Montgomery form) and
// runs `k` chained calls to the inverse function selected by the
// `{{ inv_fn }}` Mustache substitution (default `fr_inv_by`; the legacy
// `fr_inv` Pornin jumpy K=12 safegcd is the other supported variant):
//   a <- {{ inv_fn }}(a)   repeated k times,
// writing the final `a` back to `outputs[tid]`. The host caps k at 100
// before dispatch.
//
// LOOP BOUNDS
//   - The only data-dependent loop in this entry shader is
//     `for (var i = 0u; i < k; i = i + 1u)` with `k = params.y` host-capped
//     at 100. Every loop in the selected inverse function (and its callees)
//     is bounded by a compile-time `const` — see by_inverse.template.wgsl,
//     bigint_by, fr_pow.template.wgsl, and the inner `montgomery_product`
//     (`for i, j < NUM_WORDS`).
//   - The `if (tid >= n)` guard is not a loop bound.
//
// Bind layout mirrors `field_mul_bench_u32`: a single inputs buffer `xs`
// (no `ys`, since inversion is unary) and an outputs buffer. `params.x` is
// `n` (threads), `params.y` is `k` (chain length).

// get_r returns Montgomery R (= the integer 1 in Montgomery form). Defined
// per-entry shader by every cuzk pipeline kernel that uses fr_pow / fr_inv.
// fr_pow_funcs references it via fr_pow; not called on fr_inv_by's hot path
// but kept for binary compatibility with the partial.
fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(2) var<uniform>             params:  vec2<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let k = params.y;
    let tid = gid.x;
    if (tid >= n) { return; }

    var a = xs[tid];
    for (var i = 0u; i < k; i = i + 1u) {
        a = {{ inv_fn }}(a);
    }
    outputs[tid] = a;
}
