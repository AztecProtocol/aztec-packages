{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}

// Parallel Montgomery batch-inverse on the GPU.
//
// Replaces the single-threaded `batch_inverse.template.wgsl` (which
// dominated the SMVP wall time at ~243 ms per subtask × 16 subtasks
// = ~3.9 s of serial GPU work). This version does two-level scan
// (per-thread serial chunk + workgroup-level Hillis-Steele) in a single
// workgroup of TPB threads, dropping the per-dispatch cost from ~30 ms
// to ~1-3 ms at the realistic round sizes we see.
//
// MULTI-WORKGROUP MODE. The dispatch is shaped (NUM_SUB_WGS, 1, T).
// `wid.z` selects the subtask (count_buf[subtask]) and `wid.x` is the
// sub-workgroup index inside that subtask (0..NUM_SUB_WGS-1). Each
// sub-workgroup independently inverts a contiguous slice of length
// per_sub_chunk = ceil(n / NUM_SUB_WGS), using its own fr_inv. Reasoning:
//
//   - Phase A (per-thread fwd) and Phase D (per-thread back-walk) are
//     sequential per thread with bs = ceil(n / TPB). Splitting each
//     subtask across W sub-workgroups drops bs by W, giving up to W×
//     speedup on the dominant per-round latency at large N.
//
//   - Each sub-workgroup runs its own fr_inv. fr_invs across sub-WGs
//     run concurrently on different SMs, so the EXTRA fr_invs cost zero
//     wall time (gated only by SM occupancy). With T=16 subtasks × W=8
//     sub-WGs = 128 workgroups in flight, RTX-class GPUs are fully
//     occupied during the inverse pass.
//
// Two clients today:
//   - SMVP (cross-subtask): pitch = num_columns, count_buf[wid.z] =
//     pair_counter[wid.z] (per-subtask atomic).
//   - Finalize: pitch = half_num_columns, count_buf[wid.z] =
//     half_num_columns for all wid.z (pre-populated by host).
//
// Algorithm (Montgomery's batch-inverse trick, two-level):
//
//   1. Each thread i computes block_inclusive_prefix[k] for k in its
//      chunk into the `prefix` scratch buffer (serial, length bs =
//      ceil(n / TPB)). Captures block_total[i] in a register.
//   2. All TPB block_totals are pushed into workgroup memory.
//   3. Two parallel inclusive scans over wg memory: forward (wg_fwd)
//      and backward (wg_bwd). Hillis-Steele, log2(TPB) passes.
//      After scan:
//        wg_fwd[i] = block_total[0] * ... * block_total[i]
//        wg_bwd[i] = block_total[i] * ... * block_total[TPB-1]
//      So global_total = wg_fwd[TPB-1] = wg_bwd[0].
//   4. Thread 0 computes inv_global = inv(global_total) — single fr_inv.
//      Broadcast via wg_inv_total.
//   5. Each thread walks back through its chunk. The key trick: within
//      a single block, block_excl_prefix cancels algebraically, so the
//      back-walk reduces to the standard 2-mul/element batch inverse
//      on the per-block prefix array.
//
//        inv(global_prefix[k]) · global_prefix[k-1]
//          = inv(block_excl_prefix · P_in[k]) · (block_excl_prefix · P_in[k-1])
//          = inv(P_in[k]) · P_in[k-1]    // block_excl_prefix cancels
//
//      So:
//        block_excl_prefix[i] = wg_fwd[i-1] (or R for i=0)
//        block_excl_suffix[i] = wg_bwd[i+1] (or R for i=TPB-1)
//        // Setup: inv(block_total) = inv_global · block_excl_prefix · block_excl_suffix
//        inv_acc = inv(block_total[i])              // 2 muls (setup, one-time)
//        For k from chunk_end-1 down to chunk_start:
//          out[k] = inv_acc · (k>chunk_start ? prefix[k-1] : R)   // 1 mul (or 0)
//          inv_acc = inv_acc · inputs[k]                           // 1 mul
//
//      Cost: 2N muls in back-walk + N muls in forward + 2 muls setup
//      = 3N + O(1) per workgroup. Previously 3N + N back-walk muls
//      (extra mul-by-block_excl_prefix per element) = 4N total.
//
// TPB = 64 keeps workgroup memory at 2 * 64 * sizeof(BigInt) = 10240
// bytes (BN254: BigInt = 80 bytes), comfortably under the WebGPU
// default maxComputeWorkgroupStorageSize = 16384.
//
// When n == 0 for this workgroup the kernel returns immediately at the
// top.

const TPB: u32 = 64u;
const NUM_SUB_WGS: u32 = {{ num_sub_wgs }}u;

@group(0) @binding(0)
var<storage, read> inputs: array<BigInt>;

@group(0) @binding(1)
var<storage, read_write> prefix: array<BigInt>;

@group(0) @binding(2)
var<storage, read_write> outputs: array<BigInt>;

@group(0) @binding(3)
var<storage, read_write> count_buf: array<atomic<u32>>;

// params[0] = pitch (per-workgroup slice stride)
// params[1..3] = unused
@group(0) @binding(4)
var<uniform> params: vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

var<workgroup> wg_fwd: array<BigInt, TPB>;
var<workgroup> wg_bwd: array<BigInt, TPB>;
var<workgroup> wg_inv_total: BigInt;
// Broadcast slot for the pair count. atomicLoad returns a non-uniform
// value as far as the WGSL uniformity analysis is concerned, so the
// downstream `workgroupBarrier()`s would be ill-formed if we branched
// directly on it. Funnelling it through a workgroup variable + an
// explicit `workgroupUniformLoad` re-uniforms the value (and acts as
// an implicit barrier).
var<workgroup> wg_n: u32;
// Per-sub-WG element offset into the subtask's slice. Set by tid 0
// alongside wg_n; broadcast through workgroup memory so every thread
// agrees on the slice base. (workgroupUniformLoad over wg_n implicitly
// synchronises this write too, since both are written before the load.)
var<workgroup> wg_sub_offset: u32;

@compute
@workgroup_size(64)
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let pitch = params[0];
    let subtask_idx = wid.z;
    let sub_idx = wid.x;

    // Thread 0 reads the subtask's atomic count and the sub-WG's slice
    // bounds; broadcast via wg_n. workgroupUniformLoad ensures all
    // threads see a uniform `n` (= this sub-WG's element count) and
    // synchronises the workgroup before continuing.
    if (tid == 0u) {
        let total_n = atomicLoad(&count_buf[subtask_idx]);
        // Split [0, total_n) into NUM_SUB_WGS contiguous chunks. Chunks
        // are sized ceil(total_n / NUM_SUB_WGS); trailing sub-WGs may
        // see a shorter (or empty) chunk if total_n isn't a multiple of
        // NUM_SUB_WGS.
        let per_sub = (total_n + NUM_SUB_WGS - 1u) / NUM_SUB_WGS;
        let raw_start = sub_idx * per_sub;
        let raw_end = raw_start + per_sub;
        var sub_n: u32 = 0u;
        if (raw_start < total_n) {
            var clamped_end = raw_end;
            if (clamped_end > total_n) { clamped_end = total_n; }
            sub_n = clamped_end - raw_start;
        }
        wg_sub_offset = raw_start;
        wg_n = sub_n;
    }
    let n = workgroupUniformLoad(&wg_n);
    if (n == 0u) {
        return;
    }
    let sub_offset_in_subtask = wg_sub_offset;

    // Subtask owns a slice of `pitch` elements at offset
    // subtask_idx * pitch. This sub-WG owns
    // [subtask_offset + sub_offset_in_subtask,
    //  subtask_offset + sub_offset_in_subtask + n).
    let slice_offset = subtask_idx * pitch + sub_offset_in_subtask;

    // Block size = ceil(n / TPB). Last thread may have a shorter chunk.
    let bs = (n + TPB - 1u) / TPB;
    let chunk_start = tid * bs;
    var chunk_end = chunk_start + bs;
    if (chunk_end > n) {
        chunk_end = n;
    }

    // Phase A: per-thread inclusive prefix product over the chunk.
    // block_total = product of all elements in this thread's chunk,
    // or R (Montgomery 1) if the chunk is empty.
    var block_total: BigInt = get_r();
    if (chunk_start < n) {
        var acc: BigInt = inputs[slice_offset + chunk_start];
        prefix[slice_offset + chunk_start] = acc;
        for (var k = chunk_start + 1u; k < chunk_end; k = k + 1u) {
            var x: BigInt = inputs[slice_offset + k];
            acc = montgomery_product(&acc, &x);
            prefix[slice_offset + k] = acc;
        }
        block_total = acc;
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    // Phase B: forward + backward inclusive scans on the TPB block_totals.
    // Hillis-Steele, log2(TPB) passes. Each pass: every thread reads two
    // values, multiplies, writes back.
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var fwd_x: BigInt = wg_fwd[tid];
        if (tid >= stride) {
            var lhs: BigInt = wg_fwd[tid - stride];
            fwd_x = montgomery_product(&lhs, &fwd_x);
        }
        var bwd_x: BigInt = wg_bwd[tid];
        if (tid + stride < TPB) {
            var rhs: BigInt = wg_bwd[tid + stride];
            bwd_x = montgomery_product(&bwd_x, &rhs);
        }
        workgroupBarrier();
        wg_fwd[tid] = fwd_x;
        wg_bwd[tid] = bwd_x;
        workgroupBarrier();
    }

    // Phase C: thread 0 inverts the global total. Broadcast via workgroup mem.
    if (tid == 0u) {
        var global_total: BigInt = wg_fwd[TPB - 1u];
        wg_inv_total = fr_inv(global_total);
    }
    workgroupBarrier();

    // Phase D: walk back through this thread's chunk, emitting inverses.
    if (chunk_start >= n) {
        return;
    }

    // block_excl_prefix[i] = product of block_totals[0..i-1]
    // block_excl_suffix[i] = product of block_totals[i+1..TPB-1]
    var block_excl_prefix: BigInt = get_r();
    if (tid > 0u) {
        block_excl_prefix = wg_fwd[tid - 1u];
    }
    var block_excl_suffix: BigInt = get_r();
    if (tid + 1u < TPB) {
        block_excl_suffix = wg_bwd[tid + 1u];
    }

    // Setup: inv_acc = inv(block_total[tid]) = inv(prefix_in_block[chunk_end-1])
    //   = inv_global * block_excl_prefix * block_excl_suffix
    // Costs 2 muls once, but lets the back-walk run as the standard
    // 2-mul/element batch inverse — saving 1 mul per element vs the
    // previous formulation that multiplied by block_excl_prefix every
    // iteration.
    var inv_global: BigInt = wg_inv_total;
    var inv_acc: BigInt = montgomery_product(&inv_global, &block_excl_prefix);
    inv_acc = montgomery_product(&inv_acc, &block_excl_suffix);

    // Walk from k = chunk_end-1 down to chunk_start. Within a block,
    // block_excl_prefix cancels algebraically (see header comment), so
    // we run the standard backward batch-inverse over the per-block
    // prefix array: 2 muls/element (1 output + 1 update).
    var k: u32 = chunk_end;
    while (k > chunk_start) {
        k = k - 1u;

        // out[k] = inv_acc * prefix_in_block[k-1]   (or inv_acc itself for k = chunk_start)
        var inv_a_k: BigInt;
        if (k > chunk_start) {
            var prev_in_block: BigInt = prefix[slice_offset + k - 1u];
            inv_a_k = montgomery_product(&inv_acc, &prev_in_block);
        } else {
            inv_a_k = inv_acc;
        }
        outputs[slice_offset + k] = inv_a_k;

        // Update: inv_acc <- inv_acc * a[k] = inv(prefix_in_block[k-1])
        // for the next iteration. The update on the last iteration
        // (k = chunk_start) is wasted — minor cost, kept for code
        // simplicity; the loop exit condition skips it naturally.
        if (k > chunk_start) {
            var a_k: BigInt = inputs[slice_offset + k];
            inv_acc = montgomery_product(&inv_acc, &a_k);
        }
    }

    {{{ recompile }}}
}
