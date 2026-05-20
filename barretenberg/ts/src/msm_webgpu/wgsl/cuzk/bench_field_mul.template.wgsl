{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Standalone throughput microbench for the base-field Montgomery
// multiply `montgomery_product` (Karatsuba + Yuval body, 20 x 13-bit
// limbs).
//
// GOAL: isolate the ns-per-multiply of one field mul, free of the
// register-pressure interactions of the full MSM super-kernel, so it
// can be compared 1:1 against the field-inversion microbench. The
// ratio (inv ns) / (mul ns) is the headline number — how many field
// muls one inversion costs.
//
// SHAPE — a THROUGHPUT measurement, not a latency chain:
//   - One thread per global invocation; THREADS threads total.
//   - Each thread runs ITERS field multiplies. Total operations =
//     THREADS * ITERS, sized by the host to exactly 10,000,000.
//   - Every multiply is DISJOINT: both operands are perturbed each
//     iteration (limb 0 incremented) so no two products share inputs.
//   - Crucially the multiplies are mutually INDEPENDENT — the result of
//     iteration i is NOT fed into iteration i+1. Each `montgomery_
//     product` reads only `a`/`b`, which are perturbed by a cheap
//     non-multiply limb op. The loop is therefore throughput-bound, not
//     latency-bound: the GPU can overlap successive multiplies.
//   - To defeat dead-code elimination without creating a dependency
//     chain, each product is folded into a per-thread `sink` via a
//     cheap limb-wise XOR (NOT another field op). The sink is written
//     to a small output buffer, so every iteration is observable.
//
// MEMORY: only THREADS field elements are materialised (one seed each,
// + one sink each) — both small buffers, nowhere near the ~128 MiB
// WebGPU buffer-binding limit. 10M elements are NEVER materialised;
// each thread loops.
//
// Operands are kept in Montgomery form throughout (the seed buffer is
// host-built in Montgomery form). montgomery_product(a_mont, b_mont)
// yields a_mont*b_mont in Montgomery form, the same domain a real MSM
// multiply operates in.
//
// PARAMS:
//   params.x = THREADS  (active threads; one sink each)
//   params.y = ITERS    (independent multiplies per thread)

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

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let threads = params.x;
    let t = gid.x;
    if (t >= threads) { return; }

    // Two distinct seeds per thread keep the operands uncorrelated; the
    // index arithmetic wraps so threads never read out of bounds.
    var a: BigInt = load_packed(t);
    var b: BigInt = load_packed((t + 1u) % threads);

    // Per-thread sink. Folds in every product via a cheap limb-wise XOR
    // so the optimiser cannot drop any iteration — and, unlike feeding
    // the product back into an operand, XOR does NOT make iteration i+1
    // depend on iteration i, so the multiplies stay mutually
    // independent and the loop measures multiply THROUGHPUT.
    var s: BigInt;
    for (var k: u32 = 0u; k < NUM_WORDS; k = k + 1u) { s.limbs[k] = 0u; }

    for (var i: u32 = 0u; i < ITERS; i = i + 1u) {
        // Perturb limb 0 of both operands so this multiply is distinct
        // from every other. A 13-bit limb cannot overflow within ITERS
        // steps for any plausible ITERS (< 2^13), so a/b stay
        // well-formed BigInts and montgomery_product's loop bounds are
        // unaffected.
        a.limbs[0] = a.limbs[0] + 1u;
        b.limbs[0] = b.limbs[0] + 1u;
        var prod: BigInt = montgomery_product(&a, &b);
        for (var k: u32 = 0u; k < NUM_WORDS; k = k + 1u) {
            s.limbs[k] = s.limbs[k] ^ prod.limbs[k];
        }
    }

    store_packed(t, &s);

    {{{ recompile }}}
}
