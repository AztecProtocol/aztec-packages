{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Standalone single-dispatch micro-benchmark for batch-affine EC addition.
// Measures the per-pair cost of `R_i = P_i + Q_i` using Montgomery's
// batch-inverse trick at a fixed BATCH_SIZE, swept across a range of sizes
// by the host to find the sweet spot for amortising the single
// `fr_inv_by_a` call per batch.
//
// Single-workgroup-per-batch layout. Each workgroup of TPB threads
// processes one batch of BATCH_SIZE consecutive pairs. The host dispatches
// (TOTAL_PAIRS / BATCH_SIZE, 1, 1) workgroups.
//
// Phase A: each thread serially walks its BS = BATCH_SIZE / TPB pairs,
//          computing delta_x_k = Q_k.x - P_k.x and accumulating the running
//          product `prefix[k] = prefix[k-1] * delta_x_k` for k in
//          [chunk_start, chunk_end). Captures `block_total` = product of
//          all chunk deltas.
//
// Phase B: workgroup-shared Hillis-Steele scan (forward + backward) over
//          the TPB block_totals.
//
// Phase C: thread 0 runs the SINGLE `fr_inv_by_a` call on the overall
//          product and broadcasts the result via workgroup memory.
//
// Phase D: each thread back-walks its chunk emitting one affine add per
//          step. Uses standard 2-mul/element backward batch-inverse:
//          `inv_acc = inv(block_total)` at the start, then for each k from
//          chunk_end-1 down to chunk_start:
//             inv_dx = (k > chunk_start) ? inv_acc * prefix[k-1] : inv_acc
//             ... affine add ...
//             outputs[2k]   = R.x
//             outputs[2k+1] = R.y
//             if (k > chunk_start) inv_acc = inv_acc * delta_x_k
//
// LOOP BOUNDS — every loop in this kernel is bounded by a compile-time
// `const`:
//   - PHASE_A_LOOP and PHASE_D_LOOP iterate `BS` times (compile-time
//     Mustache constant `{{ per_thread_count }}`).
//   - PHASE_B_LOOP runs while `stride < TPB` (compile-time const).
//   - Every inner `montgomery_product` / `fr_inv_by_a` / `fr_sub` loop is
//     bounded by `NUM_WORDS` or other compile-time constants in the
//     included partials.
//
// MEMORY BUDGET. Workgroup memory: 2 × TPB × sizeof(BigInt) = 2 × TPB × 80
// bytes (BN254 BigInt = 20 × u32 = 80 B) + 1 × BigInt broadcast slot.
// At TPB=64 this is 10 KiB + 80 B, well under the 16 KiB default.

const BATCH_SIZE: u32 = {{ batch_size }}u;
const TPB: u32 = {{ tpb }}u;
const BS: u32 = {{ per_thread_count }}u; // = BATCH_SIZE / TPB

@group(0) @binding(0)
var<storage, read> inputs: array<BigInt>;

@group(0) @binding(1)
var<storage, read_write> prefix: array<BigInt>;

@group(0) @binding(2)
var<storage, read_write> outputs: array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

var<workgroup> wg_fwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_bwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_inv_total: BigInt;

@compute
@workgroup_size({{ tpb }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let batch_idx = wid.x;
    let batch_base = batch_idx * BATCH_SIZE;
    let chunk_start = tid * BS;
    // chunk_end is statically BS past chunk_start since BATCH_SIZE is an
    // exact multiple of TPB by construction; no clamping needed.
    let chunk_end = chunk_start + BS;

    // Phase A: per-thread inclusive-prefix product over `delta_x_k`.
    var block_total: BigInt = get_r();
    // First iter (k = chunk_start): seed acc with delta_x at that slot.
    {
        let k = chunk_start;
        let pair_base = (batch_base + k) * 4u;
        var p_x: BigInt = inputs[pair_base + 0u];
        var q_x: BigInt = inputs[pair_base + 2u];
        var dx: BigInt = fr_sub(&q_x, &p_x);
        // prefix slot is per-WG-relative inside this batch's slice.
        prefix[batch_base + k] = dx;
        block_total = dx;
    }
    // Subsequent iters: const-bounded loop over the remaining BS-1 slots.
    // PHASE_A_LOOP: bound = BS (compile-time constant).
    for (var i = 1u; i < BS; i = i + 1u) {
        let k = chunk_start + i;
        let pair_base = (batch_base + k) * 4u;
        var p_x: BigInt = inputs[pair_base + 0u];
        var q_x: BigInt = inputs[pair_base + 2u];
        var dx: BigInt = fr_sub(&q_x, &p_x);
        block_total = montgomery_product(&block_total, &dx);
        prefix[batch_base + k] = block_total;
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    // Phase B: Hillis-Steele forward + backward scans on the TPB
    // block_totals. PHASE_B_LOOP: bound = TPB (compile-time constant).
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

    // Phase C: thread 0 inverts the global total via fr_inv_by_a.
    if (tid == 0u) {
        var global_total: BigInt = wg_fwd[TPB - 1u];
        wg_inv_total = fr_inv_by_a(global_total);
    }
    workgroupBarrier();

    // Setup: inv_acc = inv(block_total[tid])
    //                = inv_global * block_excl_prefix * block_excl_suffix
    var block_excl_prefix: BigInt = get_r();
    if (tid > 0u) {
        block_excl_prefix = wg_fwd[tid - 1u];
    }
    var block_excl_suffix: BigInt = get_r();
    if (tid + 1u < TPB) {
        block_excl_suffix = wg_bwd[tid + 1u];
    }
    var inv_global: BigInt = wg_inv_total;
    var inv_acc: BigInt = montgomery_product(&inv_global, &block_excl_prefix);
    inv_acc = montgomery_product(&inv_acc, &block_excl_suffix);

    // Phase D: back-walk this thread's chunk, emitting affine adds.
    // PHASE_D_LOOP: bound = BS (compile-time constant). Use the
    // forward-form `for (off = 0u; off < BS; ...)` and derive the
    // descending index k = chunk_end - 1 - off so the bound is provably
    // static at compile time. NO `while`/`loop` constructs.
    for (var off = 0u; off < BS; off = off + 1u) {
        let k = chunk_start + (BS - 1u - off);
        let pair_base = (batch_base + k) * 4u;

        // Load all four pair coords once.
        var p_x: BigInt = inputs[pair_base + 0u];
        var p_y: BigInt = inputs[pair_base + 1u];
        var q_x: BigInt = inputs[pair_base + 2u];
        var q_y: BigInt = inputs[pair_base + 3u];

        // Backward batch-inverse: inv_dx_k = inv_acc * prefix[k-1] for
        // k > chunk_start, or inv_acc itself at the chunk's start slot.
        var inv_dx: BigInt;
        if (k > chunk_start) {
            var prev_prefix: BigInt = prefix[batch_base + (k - 1u)];
            inv_dx = montgomery_product(&inv_acc, &prev_prefix);
        } else {
            inv_dx = inv_acc;
        }

        // Affine add (Montgomery form):
        //   λ        = (Q.y - P.y) * inv_dx
        //   R.x      = λ^2 - P.x - Q.x
        //   R.y      = λ * (P.x - R.x) - P.y
        var dy: BigInt = fr_sub(&q_y, &p_y);
        var slope: BigInt = montgomery_product(&dy, &inv_dx);
        var slope_sq: BigInt = montgomery_product(&slope, &slope);
        var t1: BigInt = fr_sub(&slope_sq, &p_x);
        var r_x: BigInt = fr_sub(&t1, &q_x);
        var dx_back: BigInt = fr_sub(&p_x, &r_x);
        var ldx: BigInt = montgomery_product(&slope, &dx_back);
        var r_y: BigInt = fr_sub(&ldx, &p_y);

        // Output: 2 BigInts per pair.
        let out_base = (batch_base + k) * 2u;
        outputs[out_base + 0u] = r_x;
        outputs[out_base + 1u] = r_y;

        // Update inv_acc for the next (smaller-k) iteration, unless we
        // just emitted the chunk-start slot.
        if (k > chunk_start) {
            var dx_k: BigInt = fr_sub(&q_x, &p_x);
            inv_acc = montgomery_product(&inv_acc, &dx_k);
        }
    }

    {{{ recompile }}}
}
