{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Parallel Montgomery batch-inverse on the GPU.
//
// Replaces the single-threaded `batch_inverse.template.wgsl` (which
// dominated the SMVP wall time at ~243 ms per subtask × 16 subtasks
// = ~3.9 s of serial GPU work). This version does two-level scan
// (per-thread serial chunk + workgroup-level Hillis-Steele) in a single
// workgroup of TPB threads, dropping the per-dispatch cost from ~30 ms
// to ~1-3 ms at the realistic round sizes we see.
//
// MULTI-WORKGROUP + WINDOWS-PER-BATCH MODE. The dispatch is shaped
// (NUM_SUB_WGS, 1, num_batches), where num_batches = ceil(T / WPB).
// `wid.z` selects the batch; `wid.x` is the sub-workgroup index inside
// the batch. Each (wid.z, wid.x) pair inverts the COMBINED pair pool of
// WPB consecutive subtasks, treating it as one big logical pool of total
// length sum_{w=0..WPB-1} count_buf[batch * WPB + w], with one
// fr_inv_by_a call per (batch, sub_wg).
//
// Amortisation: with WPB=4 we run T/WPB × W fr_inv_by_a calls per round
// instead of T × W — a 4× drop in the dominant Phase C cost. The
// per-subtask layout of the pair pool (and the `prefix` / `outputs`
// scratch buffers) is unchanged, so `batch_affine_apply_scatter` reads
// outputs[subtask_global * pitch + slot_in_subtask] just like before.
// The kernel "sews together" the gaps between subtask slices in the
// scan: a logical position p in the merged pool decodes to
// (subtask_in_batch, slot_in_subtask) via the per-batch exclusive
// prefix-sum `wg_cum`, then to a physical buffer position
// (batch * WPB + subtask_in_batch) * pitch + slot_in_subtask.
//
// Per-thread walks advance a (cur_w, cur_off) cursor as they step
// through their chunk so the per-step decode is O(1); the only WPB-loop
// is the const-bounded prefix-sum setup at the top of the kernel.
//
// Two clients today:
//   - SMVP (cross-subtask): pitch = num_columns, count_buf[g] =
//     round_count[g] (per-subtask, forwarded by dispatch_args).
//   - Finalize: pitch = half_num_columns, count_buf[g] =
//     half_num_columns for all g (pre-populated by host). With WPB=1 in
//     the finalize call this degenerates to the previous behaviour.
//
// Algorithm (Montgomery's batch-inverse trick, two-level, merged pool):
//
//   1. Each thread i computes block_inclusive_prefix[k] for k in its
//      chunk into the `prefix` scratch buffer (serial, length bs =
//      ceil(n / TPB)). Captures block_total[i] in a register. The walk
//      is over LOGICAL positions in the merged pool, but each write
//      lands at the corresponding PHYSICAL buffer position (decoded via
//      wg_cum).
//   2. All TPB block_totals are pushed into workgroup memory.
//   3. Two parallel inclusive scans over wg memory: forward (wg_fwd)
//      and backward (wg_bwd). Hillis-Steele, log2(TPB) passes.
//   4. Thread 0 computes inv_global = inv(global_total) — single
//      fr_inv_by_a per (batch, sub_wg). Broadcast via wg_inv_total.
//   5. Each thread walks back through its chunk. Within a single block,
//      block_excl_prefix cancels algebraically, so the back-walk runs
//      as the standard 2-mul/element batch inverse on the per-block
//      prefix array (same as before). Outputs land at physical buffer
//      positions matching the input layout.
//
// TPB = 64 keeps workgroup memory at 2 * 64 * sizeof(BigInt) = 10240
// bytes (BN254: BigInt = 80 bytes), comfortably under the WebGPU
// default maxComputeWorkgroupStorageSize = 16384.
//
// When total_n == 0 for this (batch, sub_wg) the kernel returns
// immediately at the top.

const TPB: u32 = 64u;
const NUM_SUB_WGS: u32 = {{ num_sub_wgs }}u;
const WPB: u32 = {{ windows_per_batch }}u;

@group(0) @binding(0)
var<storage, read> inputs: array<BigInt>;

@group(0) @binding(1)
var<storage, read_write> prefix: array<BigInt>;

@group(0) @binding(2)
var<storage, read_write> outputs: array<BigInt>;

@group(0) @binding(3)
var<storage, read_write> count_buf: array<atomic<u32>>;

// params[0] = pitch (per-subtask slice stride inside inputs/prefix/outputs)
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
// Per-batch exclusive prefix of subtask counts: wg_cum[w] is the
// cumulative count of subtasks 0..w-1 within this batch (so wg_cum[0]
// is always 0 and the merged-pool total length is
// wg_cum[WPB-1] + wg_counts[WPB-1]). Used to decode "logical position
// p in the merged pool" → "(subtask_in_batch w, slot s in that
// subtask)" via the largest w with wg_cum[w] <= p.
var<workgroup> wg_counts: array<u32, WPB>;
var<workgroup> wg_cum: array<u32, WPB>;
// Broadcast slot for the merged-pool total count. atomicLoad returns a
// non-uniform value as far as the WGSL uniformity analysis is
// concerned, so the downstream `workgroupBarrier()`s would be
// ill-formed if we branched directly on it. Funnelling it through a
// workgroup variable + an explicit `workgroupUniformLoad` re-uniforms
// the value (and acts as an implicit barrier).
var<workgroup> wg_total_n: u32;
// Per-sub-WG element offset into the merged pool. Set by tid 0
// alongside wg_total_n; broadcast through workgroup memory so every
// thread agrees on the slice base. (workgroupUniformLoad over
// wg_total_n implicitly synchronises this write too, since both are
// written before the load.)
var<workgroup> wg_sub_offset: u32;

// Decode a logical position p in the merged batch pool into
// (subtask_in_batch, slot_in_subtask). The WPB-loop is const-bounded.
struct PoolPos { w: u32, slot: u32 };
fn decode_pool_pos(p: u32) -> PoolPos {
    var out: PoolPos;
    out.w = 0u;
    out.slot = p;
    for (var i = 1u; i < WPB; i = i + 1u) {
        if (p >= wg_cum[i]) {
            out.w = i;
            out.slot = p - wg_cum[i];
        }
    }
    return out;
}

@compute
@workgroup_size(64)
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let pitch = params[0];
    let batch_idx = wid.z;
    let sub_idx = wid.x;
    let subtask_base = batch_idx * WPB;

    // Thread 0 reads the WPB per-subtask atomic counts in this batch,
    // computes the exclusive prefix-sum into wg_cum + wg_counts, and
    // resolves the sub-WG's slice bounds inside the merged pool.
    // Broadcasts via wg_total_n + wg_sub_offset. workgroupUniformLoad
    // over wg_total_n then re-uniforms across the workgroup.
    if (tid == 0u) {
        var cum: u32 = 0u;
        for (var w = 0u; w < WPB; w = w + 1u) {
            let g = subtask_base + w;
            // count_buf is sized to a multiple of WPB so the tail loads
            // here return the host's initial zero (no out-of-bounds).
            let c = atomicLoad(&count_buf[g]);
            wg_counts[w] = c;
            wg_cum[w] = cum;
            cum = cum + c;
        }
        let total_n = cum;
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
        wg_total_n = sub_n;
    }
    let n = workgroupUniformLoad(&wg_total_n);
    if (n == 0u) {
        return;
    }
    let sub_offset_in_batch = wg_sub_offset;

    // Block size = ceil(n / TPB). Last thread may have a shorter chunk.
    let bs = (n + TPB - 1u) / TPB;
    let chunk_start_in_sub = tid * bs;
    var chunk_end_in_sub = chunk_start_in_sub + bs;
    if (chunk_end_in_sub > n) {
        chunk_end_in_sub = n;
    }

    // Translate this thread's [chunk_start, chunk_end) window from
    // sub-WG-local indexing into batch-merged-pool indexing.
    let chunk_start = sub_offset_in_batch + chunk_start_in_sub;
    let chunk_end = sub_offset_in_batch + chunk_end_in_sub;

    // Phase A: per-thread inclusive prefix product over the chunk.
    // Each k iterates over LOGICAL positions in the merged pool but
    // every read/write lands at the PHYSICAL buffer position decoded
    // through wg_cum. block_total = product of all elements in this
    // thread's chunk, or R (Montgomery 1) if the chunk is empty.
    var block_total: BigInt = get_r();
    if (chunk_start_in_sub < n) {
        // Decode the starting logical position once, then carry
        // (cur_w, cur_off) forward through the chunk so the per-step
        // decode is O(1). cur_off is the slot within the current
        // subtask; when it reaches wg_counts[cur_w] we advance to the
        // next subtask.
        let start_pos = decode_pool_pos(chunk_start);
        var cur_w: u32 = start_pos.w;
        var cur_off: u32 = start_pos.slot;
        let g0 = subtask_base + cur_w;
        let phys0 = g0 * pitch + cur_off;
        var acc: BigInt = inputs[phys0];
        prefix[phys0] = acc;
        // Advance one step past the seed (k = chunk_start) and walk to
        // chunk_end. The k variable here is the BATCH-MERGED logical
        // position; advance cur_off in lockstep, rolling cur_w + cur_off
        // across the wg_counts[cur_w] boundary when the subtask runs out.
        for (var k = chunk_start + 1u; k < chunk_end; k = k + 1u) {
            cur_off = cur_off + 1u;
            // Bounded rollover: cross at most one boundary per step
            // (counts never exceed pitch, which exceeds bs in practice).
            // The const-bounded loop guards against any degenerate
            // input where wg_counts[cur_w] could be zero — we still
            // can't iterate past WPB steps because cur_w is in [0, WPB).
            for (var hop = 0u; hop < WPB; hop = hop + 1u) {
                if (cur_off >= wg_counts[cur_w]) {
                    cur_w = cur_w + 1u;
                    cur_off = 0u;
                } else {
                    break;
                }
            }
            let g = subtask_base + cur_w;
            let phys = g * pitch + cur_off;
            var x: BigInt = inputs[phys];
            acc = montgomery_product(&acc, &x);
            prefix[phys] = acc;
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
    // One fr_inv_by_a per (batch, sub_wg), independent of WPB — that's
    // the amortisation this layout buys.
    if (tid == 0u) {
        var global_total: BigInt = wg_fwd[TPB - 1u];
        wg_inv_total = fr_inv_by_a(global_total);
    }
    workgroupBarrier();

    // Phase D: walk back through this thread's chunk, emitting inverses.
    if (chunk_start_in_sub >= n) {
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

    // Decode the END position (chunk_end - 1) and walk backward,
    // mirroring Phase A's forward decode. Maintain (cur_w, cur_off) as
    // we step k from chunk_end-1 down to chunk_start.
    let end_pos = decode_pool_pos(chunk_end - 1u);
    var cur_w: u32 = end_pos.w;
    var cur_off: u32 = end_pos.slot;

    // Walk from k = chunk_end-1 down to chunk_start. Within a block,
    // block_excl_prefix cancels algebraically (see header comment), so
    // we run the standard backward batch-inverse over the per-block
    // prefix array: 2 muls/element (1 output + 1 update).
    var k: u32 = chunk_end;
    while (k > chunk_start) {
        k = k - 1u;

        let g = subtask_base + cur_w;
        let phys = g * pitch + cur_off;

        // out[k] = inv_acc * prefix_in_block[k-1] (or inv_acc itself
        // for k = chunk_start). The "k-1" position in the BLOCK is the
        // previous logical position in the merged pool; if that lies
        // in a different subtask, prefix is still indexed by physical
        // position so we decode the neighbour separately.
        var inv_a_k: BigInt;
        if (k > chunk_start) {
            // Compute the physical position of (k - 1). This is the
            // logical predecessor of the current step. We carry a
            // dedicated (prev_w, prev_off) cursor by mirroring the
            // forward-from-decode but starting from (cur_w, cur_off):
            // step back by one slot; if cur_off was 0, roll back to
            // the previous subtask's last slot.
            var prev_w: u32 = cur_w;
            var prev_off: u32;
            if (cur_off > 0u) {
                prev_off = cur_off - 1u;
            } else {
                // Roll back to the largest preceding subtask with a
                // non-empty count. Const-bounded by WPB.
                prev_off = 0u;
                for (var hop = 0u; hop < WPB; hop = hop + 1u) {
                    if (prev_w == 0u) {
                        // Should not happen — we'd be past chunk_start.
                        break;
                    }
                    prev_w = prev_w - 1u;
                    if (wg_counts[prev_w] > 0u) {
                        prev_off = wg_counts[prev_w] - 1u;
                        break;
                    }
                }
            }
            let g_prev = subtask_base + prev_w;
            let phys_prev = g_prev * pitch + prev_off;
            var prev_in_block: BigInt = prefix[phys_prev];
            inv_a_k = montgomery_product(&inv_acc, &prev_in_block);
        } else {
            inv_a_k = inv_acc;
        }
        outputs[phys] = inv_a_k;

        // Update: inv_acc <- inv_acc * a[k] = inv(prefix_in_block[k-1])
        // for the next iteration. The update on the last iteration
        // (k = chunk_start) is wasted — minor cost, kept for code
        // simplicity; the loop exit condition skips it naturally.
        if (k > chunk_start) {
            var a_k: BigInt = inputs[phys];
            inv_acc = montgomery_product(&inv_acc, &a_k);
            // Step (cur_w, cur_off) back by one logical position, same
            // rollover logic as the prev_* decode above.
            if (cur_off > 0u) {
                cur_off = cur_off - 1u;
            } else {
                for (var hop = 0u; hop < WPB; hop = hop + 1u) {
                    if (cur_w == 0u) {
                        break;
                    }
                    cur_w = cur_w - 1u;
                    if (wg_counts[cur_w] > 0u) {
                        cur_off = wg_counts[cur_w] - 1u;
                        break;
                    }
                }
            }
        }
    }

    {{{ recompile }}}
}
