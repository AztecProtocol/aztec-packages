{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 1 of the tree-reduce SMVP (v4 — preamble extracted).
//
// The bucket-walk preamble (Steps 1-6: per-thread max-scan + prefix-sum +
// pair_idx_a/b / rank_to_raw / prev_raw_for_pair writes + per-WG counts)
// now runs in its own kernel: smvp_tree_meta_phase1. By the time this
// kernel dispatches, meta_pool is fully populated and the per-WG
// (emit_count, pair_count) tuple sits in wg_counts[wg*2 + (0|1)].
//
// This kernel runs only the math (Phase A/B/C/D) + the UNPAIRED point
// writeout. Storage bindings are reduced (no preamble I/O), workgroup
// memory drops to just wg_fwd/wg_bwd/wg_inv_total (~20 KB).
//
// Workgroup memory at MAX_PAIRS=2048, MAX_SLICE_ENTRIES=4096, TPB=128:
//   wg_fwd, wg_bwd:                  2 × TPB × 80 = 20.48 KB
//   wg_inv_total + counters:         ~120 B
//   total:                           ~20.6 KB (under M2's 32 KB cap).
//
// Static loop bounds:
//   Phase A:                                          PER_THREAD_PAIRS
//   Phase B:                                          log2(TPB)
//   Phase D:                                          PER_THREAD_PAIRS
//   UNPAIRED write-out:                              MAX_SLICE_ENTRIES / TPB

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_PAIRS: u32 = {{ per_thread_pairs }}u;
const UNPAIRED_SENTINEL: u32 = 0xffffffffu;
const SCHEDULE_SIGN_BIT: u32 = 0x80000000u;
const SCHEDULE_IDX_MASK: u32 = 0x7fffffffu;

@group(0) @binding(0)
var<storage, read> schedule: array<u32>;            // (sign << 31) | scalar_idx

@group(0) @binding(1)
var<storage, read> point_x: array<BigInt>;

@group(0) @binding(2)
var<storage, read> point_y: array<BigInt>;

@group(0) @binding(3)
var<storage, read> wg_output_offset: array<u32>;    // length num_wgs+1

@group(0) @binding(4)
var<storage, read_write> prefix_scratch: array<BigInt>;  // size num_wgs * MAX_SLICE_ENTRIES

@group(0) @binding(5)
var<storage, read_write> output_x: array<BigInt>;

@group(0) @binding(6)
var<storage, read_write> output_y: array<BigInt>;

// Per-WG metadata pool: pre-populated by smvp_tree_meta_phase1.
// Layout matches the meta kernel (4 contiguous sections per WG).
@group(0) @binding(7)
var<storage, read> meta_pool: array<u32>;

// Per-WG (emit_count, pair_count) tuples. Pre-populated by the meta kernel.
@group(0) @binding(8)
var<storage, read> wg_counts: array<u32>;

const META_PER_WG_STRIDE: u32 = {{ meta_per_wg_stride }}u;
const META_OFF_PAIR_IDX_A: u32 = 0u;
const META_OFF_PAIR_IDX_B: u32 = {{ max_slice_entries }}u;
const META_OFF_RANK_TO_RAW: u32 = {{ meta_off_rank_to_raw }}u;
const META_OFF_PREV_RAW: u32 = {{ meta_off_prev_raw }}u;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}
// `get_p()` is provided by the `montgomery_product_funcs` partial.

var<workgroup> wg_fwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_bwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_inv_total: BigInt;

fn load_point_x_only(entry_idx: u32) -> BigInt {
    let raw = schedule[entry_idx];
    let scalar_idx = raw & SCHEDULE_IDX_MASK;
    return point_x[scalar_idx];
}

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
    let out_base = wg_output_offset[wg_id];

    let meta_base = wg_id * META_PER_WG_STRIDE;
    let pair_idx_a_base = meta_base + META_OFF_PAIR_IDX_A;
    let pair_idx_b_base = meta_base + META_OFF_PAIR_IDX_B;
    let rank_to_raw_base = meta_base + META_OFF_RANK_TO_RAW;
    let prev_raw_base = meta_base + META_OFF_PREV_RAW;

    let total_outputs = wg_counts[wg_id * 2u + 0u];
    let total_pairs = wg_counts[wg_id * 2u + 1u];

    // Phase A: per-thread prefix product over PER_THREAD_PAIRS PAIRs.
    let chunk_start_rank = tid * PER_THREAD_PAIRS;
    var block_total: BigInt = get_r();
    for (var t: u32 = 0u; t < PER_THREAD_PAIRS; t = t + 1u) {
        let rank = chunk_start_rank + t;
        if (rank >= total_pairs) { break; }
        let raw = meta_pool[rank_to_raw_base + rank];
        let idx_a = meta_pool[pair_idx_a_base + raw];
        let idx_b = meta_pool[pair_idx_b_base + raw];
        var p_x: BigInt = load_point_x_only(idx_a);
        var q_x: BigInt = load_point_x_only(idx_b);
        var dx: BigInt = fr_sub(&q_x, &p_x);
        if (t == 0u) {
            block_total = dx;
        } else {
            block_total = montgomery_product(&block_total, &dx);
        }
        prefix_scratch[wg_id * MAX_SLICE_ENTRIES + raw] = block_total;
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

    // Phase D: back-walk this thread's PAIR-rank chunk.
    var thread_pair_count_local: u32 = 0u;
    if (chunk_start_rank < total_pairs) {
        let avail = total_pairs - chunk_start_rank;
        if (avail >= PER_THREAD_PAIRS) {
            thread_pair_count_local = PER_THREAD_PAIRS;
        } else {
            thread_pair_count_local = avail;
        }
    }
    var inv_acc_local: BigInt = inv_acc;
    for (var off: u32 = 0u; off < PER_THREAD_PAIRS; off = off + 1u) {
        if (off >= thread_pair_count_local) { break; }
        let rank = chunk_start_rank + (thread_pair_count_local - 1u - off);
        let raw = meta_pool[rank_to_raw_base + rank];
        let idx_a = meta_pool[pair_idx_a_base + raw];
        let idx_b = meta_pool[pair_idx_b_base + raw];
        var p_x: BigInt; var p_y: BigInt;
        load_point(idx_a, &p_x, &p_y);
        var q_x: BigInt; var q_y: BigInt;
        load_point(idx_b, &q_x, &q_y);

        var inv_dx: BigInt;
        if (rank == chunk_start_rank) {
            inv_dx = inv_acc_local;
        } else {
            let prev_raw = meta_pool[prev_raw_base + raw];
            var prev_prefix: BigInt = prefix_scratch[wg_id * MAX_SLICE_ENTRIES + prev_raw];
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

    // Write-out UNPAIRED slots cooperatively round-robin.
    for (var off: u32 = 0u; off < (MAX_SLICE_ENTRIES + TPB - 1u) / TPB; off = off + 1u) {
        let i = tid + off * TPB;
        if (i >= total_outputs) { break; }
        let idx_b = meta_pool[pair_idx_b_base + i];
        if (idx_b != UNPAIRED_SENTINEL) { continue; }
        let idx_a = meta_pool[pair_idx_a_base + i];
        var p_x: BigInt; var p_y: BigInt;
        load_point(idx_a, &p_x, &p_y);
        output_x[out_base + i] = p_x;
        output_y[out_base + i] = p_y;
    }

    {{{ recompile }}}
}
