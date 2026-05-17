{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// get_r returns Montgomery R (= the integer 1 in Montgomery form). Each
// main shader defines its own with `r_limbs` substitution; the
// fr_pow / fr_inv partials in fr_pow_funcs call it.
fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

// Montgomery's batch-inverse trick on the GPU.
//
// Given N input field elements (in Montgomery form), compute their N
// inverses sharing ONE field inversion. Cost:
//   - 2(N-1) montgomery_products for prefix products + suffix walk
//   - 1 fr_inv (~500 montgomery_products of overhead)
//
// THIS KERNEL IS SINGLE-THREADED (workgroup_size = 1, single dispatch).
// The work is inherently sequential under this formulation; parallelising
// it (Hillis-Steele scan with mont_prod, or per-workgroup chunking with a
// global merge) is a non-trivial follow-up if profiling shows this kernel
// dominates.
//
// N is read from `count_buf[0]` rather than a uniform so the calling
// orchestrator (smvp_batch_affine_gpu) can chain this kernel directly
// after the schedule kernel — no CPU round-trip to read pair_counter
// between rounds. When N == 0 (no work this round), the kernel exits
// immediately at top.

@group(0) @binding(0)
var<storage, read> inputs: array<BigInt>;

@group(0) @binding(1)
var<storage, read_write> prefix: array<BigInt>;

@group(0) @binding(2)
var<storage, read_write> outputs: array<BigInt>;

// count_buf[0] = N (read from the upstream pair_counter).
//
// Bound as atomic-storage and read via atomicLoad to guarantee that
// the value written by the schedule kernel via atomicAdd in the
// previous compute pass is visible here. Without atomic semantics,
// some Dawn / Metal implementations have shown cross-shader
// visibility quirks for buffers re-bound with a different (non-
// atomic) view.
@group(0) @binding(3)
var<storage, read_write> count_buf: array<atomic<u32>>;

@compute
@workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x != 0u) {
        return;
    }

    let n = atomicLoad(&count_buf[0]);
    if (n == 0u) {
        return;
    }

    // Step 1: prefix products.
    var acc: BigInt = inputs[0];
    prefix[0] = acc;
    for (var i = 1u; i < n; i = i + 1u) {
        var a_i: BigInt = inputs[i];
        acc = montgomery_product(&acc, &a_i);
        prefix[i] = acc;
    }

    // Step 2: invert the final product.
    var inv_acc: BigInt = fr_inv_by_a(acc);

    // Step 3: walk back, emitting individual inverses.
    for (var idx = 0u; idx < n - 1u; idx = idx + 1u) {
        let i = n - 1u - idx;
        var prev: BigInt = prefix[i - 1u];
        var out_i: BigInt = montgomery_product(&inv_acc, &prev);
        outputs[i] = out_i;

        var a_i: BigInt = inputs[i];
        inv_acc = montgomery_product(&inv_acc, &a_i);
    }
    outputs[0] = inv_acc;

    {{{ recompile }}}
}
