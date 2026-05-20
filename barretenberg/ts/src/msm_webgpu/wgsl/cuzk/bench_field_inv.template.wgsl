{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Standalone throughput microbench for one base-field inversion — a
// Bernstein-Yang safegcd inverse. The inverse is parameterised: the
// inverse-functions partial and the inverse-call name are host-supplied
// (gen_bench_field_inv_shader's `variant` arg), so the same kernel
// benches `by_inverse_a` (Option A, BATCH=26 / NUM_OUTER=29) or
// `by_inverse_loop` (register-minimal, BATCH=12 / NUM_OUTER=62).
//
// NOTE: do not write Mustache tags (double-brace, or > / # forms) in
// these comments — Mustache renders them regardless of WGSL comment
// syntax; a partial tag would inline a whole partial mid-comment.
//
// GOAL: isolate the ns-per-inversion of one field inverse, free of the
// register-pressure interactions of the full MSM super-kernel, so it
// can be compared 1:1 against the field-multiply microbench. The ratio
// (inv ns) / (mul ns) is the headline number — how many field muls one
// inversion costs.
//
// SHAPE — a THROUGHPUT measurement, not a latency chain:
//   - One thread per global invocation; THREADS threads total.
//   - Each thread runs ITERS field inversions. Total operations =
//     THREADS * ITERS, sized by the host to exactly 1,000,000.
//   - Every inversion is DISJOINT: the operand is perturbed each
//     iteration (limb 0 incremented) so no two inversions share input.
//   - The inversions are mutually INDEPENDENT — the result of iteration
//     i is NOT fed into iteration i+1. Each `fr_inv_by_a` reads only
//     `operand`, perturbed by a cheap non-inverse limb op. The loop is
//     therefore throughput-bound, not latency-bound.
//   - To defeat dead-code elimination without creating a dependency
//     chain, each inverse is folded into a per-thread `sink` via a
//     cheap limb-wise XOR (NOT another field op). The sink is written
//     to a small output buffer, so every iteration is observable.
//
// MEMORY: only THREADS field elements are materialised (one seed each,
// + one sink each) — both small buffers, nowhere near the ~128 MiB
// WebGPU buffer-binding limit. 1M elements are NEVER materialised; each
// thread loops.
//
// The seed buffer is host-built in Montgomery form. `fr_inv_by_a`
// consumes a Montgomery-form input and returns a Montgomery-form
// output (it folds in r^3 at the end), matching the domain a real MSM
// batch-inverse operates in. Any nonzero operand is invertible, and the
// safegcd driver only requires `p` odd and `g != 0` — perturbing limb 0
// by small amounts keeps every operand a valid, nonzero field element.
//
// PARAMS:
//   params.x = THREADS  (active threads; one sink each)
//   params.y = ITERS    (independent inversions per thread)

const ITERS: u32 = {{ iters }}u;

@group(0) @binding(0) var<storage, read>       seeds:  array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> sink:   array<vec4<u32>>;
@group(0) @binding(2) var<uniform>             params: vec4<u32>;

// Each field element occupies PACKED_VEC4 = 2 vec4<u32> in the seed /
// sink buffers (8 u32 packed limbs, decoupled pack/unpack).
const PACKED_VEC4: u32 = 2u;

fn load_packed(buf_idx: u32) -> BigInt {
    let base = PACKED_VEC4 * buf_idx;
    let q0 = seeds[base + 0u];
    let q1 = seeds[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_packed(buf_idx: u32, val: ptr<function, BigInt>) {
    let base = PACKED_VEC4 * buf_idx;
    let w = pack_limbs_to_256(val);
    sink[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    sink[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

// Montgomery 1 (R mod p). The safegcd inverse never calls it, but the
// included fr_pow partial does, and WGSL validates every function in the
// module — so this kernel-level definition must exist.
fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let threads = params.x;
    let t = gid.x;
    if (t >= threads) { return; }

    var operand: BigInt = load_packed(t);

    // Per-thread sink. Folds in every inverse via a cheap limb-wise XOR
    // so the optimiser cannot drop any iteration — and, unlike feeding
    // the inverse back into the operand, XOR does NOT make iteration i+1
    // depend on iteration i, so the inversions stay mutually
    // independent and the loop measures inversion THROUGHPUT.
    var s: BigInt;
    for (var k: u32 = 0u; k < NUM_WORDS; k = k + 1u) { s.limbs[k] = 0u; }

    for (var i: u32 = 0u; i < ITERS; i = i + 1u) {
        // Perturb limb 0 so this inversion is distinct from every other.
        // A 13-bit limb cannot overflow within ITERS steps for any
        // plausible ITERS (< 2^13), so `operand` stays a well-formed,
        // nonzero BigInt.
        operand.limbs[0] = operand.limbs[0] + 1u;
        // The inverse routine resolves to fr_inv_by_a or fr_inv_by_loop
        // per the host-selected variant.
        var inv: BigInt = {{ inv_fn }}(operand);
        for (var k: u32 = 0u; k < NUM_WORDS; k = k + 1u) {
            s.limbs[k] = s.limbs[k] ^ inv.limbs[k];
        }
    }

    store_packed(t, &s);

    {{{ recompile }}}
}
