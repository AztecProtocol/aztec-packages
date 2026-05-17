{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 1 of the tree-reduce SMVP (v2 — rearchitected for thread util).
//
// One workgroup per slice. Per-WG work is dominated by the cooperative
// batch-affine over the PAIR sub-stream:
//   - Phase A: per-thread inclusive-prefix product of delta_x for that
//     thread's contiguous PAIR-rank chunk. ONE static loop of
//     PER_THREAD_PAIRS iterations — no scan over MAX_PAIRS, no
//     conditional skip.
//   - Phase B: TPB-wide Hillis-Steele scan of per-thread block_total.
//   - Phase C: thread-0 fr_inv_by_a on the global product.
//   - Phase D: per-thread back-walk of the same chunk in descending
//     PAIR-rank order, computing affine adds. inv_dx for PAIR rank R
//     uses the precomputed previous-PAIR raw_slot (O(1) lookup, no
//     backward scan).
//
// Preamble (thread 0, ~MAX_SLICE_ENTRIES sequential ops, ~µs):
//   Walks the slice left-to-right and fills four workgroup arrays:
//     pair_idx_a[i]          — first input entry index of pair_list[i]
//     pair_idx_b[i]          — second input entry index, or UNPAIRED
//     prev_raw_for_pair[i]   — raw_slot of the immediate PAIR before
//                              pair_list[i] (PAIRs only; UNPAIRED slots
//                              are skipped). Set to UNPAIRED_SENTINEL
//                              when there is no previous PAIR (i.e.
//                              when this is rank 0).
//     rank_to_raw[r]         — raw_slot of the PAIR with fwd-rank r.
//   pair_count and num_pairs_real are also written here.
//   pair_bucket is written to GLOBAL memory (one u32 per output,
//   needed only by the final write-out — keeps workgroup memory
//   under the 32 KiB cap at SWEET_B=1024).
//
// Workgroup memory at MAX_PAIRS=1024, TPB=64:
//   pair_idx_a/b/prev_raw/rank_to_raw: 4 × 4 KB = 16 KB
//   wg_fwd, wg_bwd:                   2 × TPB × 80 = 10.24 KB
//   wg_inv_total + counters:          ~120 B
//   total:                            ~26.4 KB (under M2's 32 KB max).
//
// Static loop bounds:
//   PHASE_A_LOOP:  PER_THREAD_PAIRS (compile-time const)
//   PHASE_B_LOOP:  TPB
//   PHASE_D_LOOP:  PER_THREAD_PAIRS
//   write-unpaired loop: MAX_PAIRS / TPB (cooperative cooperative round-robin)
//   preamble loop: MAX_SLICE_ENTRIES (thread-0 only, runs once per WG)

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_PAIRS: u32 = {{ per_thread_pairs }}u;
const UNPAIRED_BUCKET: u32 = 0xffffffffu;

const SCHEDULE_SIGN_BIT: u32 = 0x80000000u;
const SCHEDULE_IDX_MASK: u32 = 0x7fffffffu;

@group(0) @binding(0)
var<storage, read> schedule: array<u32>;            // (sign << 31) | scalar_idx

@group(0) @binding(1)
var<storage, read> entry_bucket_id: array<u32>;     // bucket id per entry

@group(0) @binding(2)
var<storage, read> point_x: array<BigInt>;

@group(0) @binding(3)
var<storage, read> point_y: array<BigInt>;

@group(0) @binding(4)
var<storage, read> slice_bounds: array<u32>;        // length num_wgs+1

@group(0) @binding(5)
var<storage, read> wg_output_offset: array<u32>;    // length num_wgs+1

@group(0) @binding(6)
var<storage, read_write> prefix_scratch: array<BigInt>;  // size num_wgs * MAX_PAIRS

@group(0) @binding(7)
var<storage, read_write> output_bucket_id: array<u32>;

@group(0) @binding(8)
var<storage, read_write> output_x: array<BigInt>;

@group(0) @binding(9)
var<storage, read_write> output_y: array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}
// `get_p()` is provided by the `montgomery_product_funcs` partial.

var<workgroup> pair_idx_a: array<u32, {{ max_pairs }}>;
var<workgroup> pair_idx_b: array<u32, {{ max_pairs }}>;
var<workgroup> prev_raw_for_pair: array<u32, {{ max_pairs }}>;
var<workgroup> rank_to_raw: array<u32, {{ max_pairs }}>;
var<workgroup> pair_count: u32;
var<workgroup> num_pairs_real: u32;

var<workgroup> wg_fwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_bwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_inv_total: BigInt;

fn load_point(entry_idx: u32, out_x: ptr<function, BigInt>, out_y: ptr<function, BigInt>) {
    let raw = schedule[entry_idx];
    let scalar_idx = raw & SCHEDULE_IDX_MASK;
    *out_x = point_x[scalar_idx];
    var py: BigInt = point_y[scalar_idx];
    if ((raw & SCHEDULE_SIGN_BIT) != 0u) {
        var zero: BigInt;
        py = fr_sub(&zero, &py);
    }
    *out_y = py;
}

@compute
@workgroup_size({{ tpb }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let wg_id = wid.x;
    let slice_lo = slice_bounds[wg_id];
    let slice_hi = slice_bounds[wg_id + 1u];
    let out_base = wg_output_offset[wg_id];

    if (tid == 0u) {
        var count: u32 = 0u;
        var pair_real: u32 = 0u;
        var open_idx: u32 = 0xffffffffu;
        var open_bucket: u32 = 0xffffffffu;
        var last_pair_raw: u32 = 0xffffffffu;
        for (var i: u32 = 0u; i < MAX_SLICE_ENTRIES; i = i + 1u) {
            let entry_idx = slice_lo + i;
            if (entry_idx >= slice_hi) { break; }
            let b = entry_bucket_id[entry_idx];
            if (open_idx != 0xffffffffu && b == open_bucket) {
                let raw = count;
                pair_idx_a[raw] = open_idx;
                pair_idx_b[raw] = entry_idx;
                prev_raw_for_pair[raw] = last_pair_raw;
                rank_to_raw[pair_real] = raw;
                output_bucket_id[out_base + raw] = b;
                count = count + 1u;
                pair_real = pair_real + 1u;
                last_pair_raw = raw;
                open_idx = 0xffffffffu;
                open_bucket = 0xffffffffu;
            } else {
                if (open_idx != 0xffffffffu) {
                    let raw = count;
                    pair_idx_a[raw] = open_idx;
                    pair_idx_b[raw] = 0xffffffffu;
                    prev_raw_for_pair[raw] = 0xffffffffu; // unused for UNPAIRED
                    output_bucket_id[out_base + raw] = open_bucket;
                    count = count + 1u;
                }
                open_idx = entry_idx;
                open_bucket = b;
            }
        }
        if (open_idx != 0xffffffffu) {
            let raw = count;
            pair_idx_a[raw] = open_idx;
            pair_idx_b[raw] = 0xffffffffu;
            prev_raw_for_pair[raw] = 0xffffffffu;
            output_bucket_id[out_base + raw] = open_bucket;
            count = count + 1u;
        }
        pair_count = count;
        num_pairs_real = pair_real;
    }
    workgroupBarrier();

    let total_outputs = pair_count;
    let total_pairs = num_pairs_real;

    // Phase A: per-thread prefix product over PER_THREAD_PAIRS PAIRs
    // assigned to this thread's contiguous PAIR-rank chunk. NO scan
    // over MAX_PAIRS; rank → raw_slot via rank_to_raw[].
    let chunk_start_rank = tid * PER_THREAD_PAIRS;
    var block_total: BigInt = get_r();
    for (var t: u32 = 0u; t < PER_THREAD_PAIRS; t = t + 1u) {
        let rank = chunk_start_rank + t;
        if (rank >= total_pairs) { break; }
        let raw = rank_to_raw[rank];
        let idx_a = pair_idx_a[raw];
        let idx_b = pair_idx_b[raw];
        var p_x: BigInt;
        var p_y: BigInt;
        load_point(idx_a, &p_x, &p_y);
        var q_x: BigInt;
        var q_y: BigInt;
        load_point(idx_b, &q_x, &q_y);
        var dx: BigInt = fr_sub(&q_x, &p_x);
        if (t == 0u) {
            block_total = dx;
        } else {
            block_total = montgomery_product(&block_total, &dx);
        }
        prefix_scratch[wg_id * MAX_PAIRS + raw] = block_total;
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    // Phase B: Hillis-Steele forward + backward scans.
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

    // Phase C: thread-0 global inverse.
    if (tid == 0u) {
        if (total_pairs > 0u) {
            var global_total: BigInt = wg_fwd[TPB - 1u];
            wg_inv_total = fr_inv_by_a(global_total);
        }
    }
    workgroupBarrier();

    // Per-thread inv_acc = inv(block_total[tid]) = inv_global * excl_prefix * excl_suffix.
    var block_excl_prefix: BigInt = get_r();
    if (tid > 0u) {
        block_excl_prefix = wg_fwd[tid - 1u];
    }
    var block_excl_suffix: BigInt = get_r();
    if (tid + 1u < TPB) {
        block_excl_suffix = wg_bwd[tid + 1u];
    }
    var inv_acc: BigInt;
    if (total_pairs == 0u) {
        inv_acc = get_r();
    } else {
        var inv_global: BigInt = wg_inv_total;
        inv_acc = montgomery_product(&inv_global, &block_excl_prefix);
        inv_acc = montgomery_product(&inv_acc, &block_excl_suffix);
    }

    // Phase D: back-walk this thread's PAIR-rank chunk in descending
    // fwd-rank order. PER_THREAD_PAIRS iterations, no scan, no
    // backward search — prev raw_slot comes from prev_raw_for_pair[].
    //
    // We need this thread's last PAIR rank (smallest of
    // {chunk_start_rank + PER_THREAD_PAIRS - 1, total_pairs - 1}).
    var thread_pair_count: u32 = 0u;
    if (chunk_start_rank < total_pairs) {
        let avail = total_pairs - chunk_start_rank;
        if (avail >= PER_THREAD_PAIRS) {
            thread_pair_count = PER_THREAD_PAIRS;
        } else {
            thread_pair_count = avail;
        }
    }
    var inv_acc_local: BigInt = inv_acc;
    for (var off: u32 = 0u; off < PER_THREAD_PAIRS; off = off + 1u) {
        if (off >= thread_pair_count) { break; }
        let rank = chunk_start_rank + (thread_pair_count - 1u - off);
        let raw = rank_to_raw[rank];
        let idx_a = pair_idx_a[raw];
        let idx_b = pair_idx_b[raw];
        var p_x: BigInt; var p_y: BigInt;
        load_point(idx_a, &p_x, &p_y);
        var q_x: BigInt; var q_y: BigInt;
        load_point(idx_b, &q_x, &q_y);

        var inv_dx: BigInt;
        if (rank == chunk_start_rank) {
            inv_dx = inv_acc_local;
        } else {
            let prev_raw = prev_raw_for_pair[raw];
            var prev_prefix: BigInt = prefix_scratch[wg_id * MAX_PAIRS + prev_raw];
            inv_dx = montgomery_product(&inv_acc_local, &prev_prefix);
        }

        var dy: BigInt = fr_sub(&q_y, &p_y);
        var slope: BigInt = montgomery_product(&dy, &inv_dx);
        var slope_sq: BigInt = montgomery_product(&slope, &slope);
        var t1: BigInt = fr_sub(&slope_sq, &p_x);
        var r_x: BigInt = fr_sub(&t1, &q_x);
        var dx_back: BigInt = fr_sub(&p_x, &r_x);
        var ldx: BigInt = montgomery_product(&slope, &dx_back);
        var r_y: BigInt = fr_sub(&ldx, &p_y);

        output_x[out_base + raw] = r_x;
        output_y[out_base + raw] = r_y;

        if (rank > chunk_start_rank) {
            var dx_k: BigInt = fr_sub(&q_x, &p_x);
            inv_acc_local = montgomery_product(&inv_acc_local, &dx_k);
        }
    }

    // Write-out UNPAIRED slots cooperatively round-robin. Static bound
    // = ceil(MAX_PAIRS / TPB). UNPAIRED count is bounded by
    // num_buckets_in_slice (small in practice); most iterations are
    // no-ops, but with TPB threads in parallel the wall time is
    // negligible.
    for (var off: u32 = 0u; off < (MAX_PAIRS + TPB - 1u) / TPB; off = off + 1u) {
        let i = tid + off * TPB;
        if (i >= total_outputs) { break; }
        let idx_b = pair_idx_b[i];
        if (idx_b != 0xffffffffu) { continue; }
        let idx_a = pair_idx_a[i];
        var p_x: BigInt; var p_y: BigInt;
        load_point(idx_a, &p_x, &p_y);
        output_x[out_base + i] = p_x;
        output_y[out_base + i] = p_y;
    }

    {{{ recompile }}}
}
