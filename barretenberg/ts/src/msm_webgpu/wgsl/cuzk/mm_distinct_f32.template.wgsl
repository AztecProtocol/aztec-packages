// f32-22 distinct-operand montmul microbench. The f32-22 sibling of the
// montmul_realism `chain_distinct_hard` mode (PROBE 1): each iteration
// reloads operand B fresh from the `ys` storage buffer at an index
// derived from the running product's low limb (loop-carried, unknowable
// at compile time), so the compiler cannot hoist the load, CSE the
// product, or DCE the chain. `a` evolves and feeds both the next product
// and the next index. 1 montmul/iter (mpi=1) => ns/op is a bulletproof
// per-single-f32-22-montmul number, directly comparable to the u32
// mm_distinct_hard (1 distinct-operand montmul/iter, same skeleton).
//
// Layout matches runChainedF32Mont: separate xs / ys Float32 arrays,
// ONE BigIntF32 per thread per array, inputs in the f32-22 Mont domain
// (x·R_f mod p). The reload index is taken mod n over the ys pool. As
// in the u32 probe the measured cost is per single montmul; the chained
// product just stays in the f32-22 Mont domain (montgomery_product_f32
// divides one R_f out each step), so no domain bridge is needed.
//
// Loop bounds: the only data-dependent loop is `for i in 0..k` with
// k = params.y host-uniform (host-capped). `if (tid >= n)` is a guard,
// not a loop bound. Inner montgomery_product_f32 loops are bounded by
// the compile-time NUM_LIMBS constant.

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

    for (var iter = 0u; iter < k; iter = iter + 1u) {
        // Loop-carried, storage-reloaded operand B at an index derived
        // from the running product (anti-DCE / anti-hoist), mirroring the
        // u32 chain_distinct_hard exactly. f32 limbs are integer-valued
        // in [0, 2^22); the u32() cast of the low limb is exact.
        let idx = (u32(a.limbs[0u]) ^ u32(b.limbs[0u])) % n;
        var bb = ys[idx];
        a = montgomery_product_f32(&a, &bb);
        b = bb;
    }

    var p_final = get_p_f32();
    outputs[tid] = conditional_reduce_f32(&a, &p_final);
}
