{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 1-D of the tree-reduce SMVP (iter 4 — layer-wide batch inverse).
//
// Companion to `smvp_tree_phase1_a`. Runs after
// `smvp_tree_layer_batch_inverse` has filled `wg_inv_per_wg[wg_id]` with
// the inverse of every WG's `block_total` product. Reloads the per-thread
// block_total spilled by Phase 1-A, re-runs Phase B locally to derive the
// per-thread exclusive prefix/suffix used by Phase D, then runs the
// affine-add back-walk and UNPAIRED write-out.
//
// Inputs and meta_pool state must match what Phase 1-A produced for the
// same wg_id. The kernel re-reads slice geometry / out_base from the
// host-known uniforms (`per_wg`, `total_entries`) and the persistent
// `wg_output_offset[wg_id]`, so no extra spill is needed for those.
//
// The pair_count_wg and num_pairs_real_wg per-WG counts are NOT spilled;
// instead the kernel re-derives them cheaply from `wg_output_offset`
// (total pair_count = wg_output_offset[wg_id+1] - wg_output_offset[wg_id])
// and from meta_pool's rank_to_raw chain. Actually simpler: rerun the
// preamble counters with one local pass over meta_pool.
//
// Wait — re-running the preamble would defeat the savings. Instead the
// kernel reuses the spilled `pair_count_wg`/`num_pairs_real_wg`. We
// piggy-back them onto the spill: Phase 1-A writes them in the last two
// slots of `wg_block_per_thread_global` (interpreting the BigInt's first
// two limbs as u32 isn't safe — too much aliasing). Cleanest: add a tiny
// `wg_counts_global[wg_id * 2 + {0,1}]` buffer.

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_ENTRIES: u32 = {{ per_thread_entries }}u;
const PER_THREAD_PAIRS: u32 = {{ per_thread_pairs }}u;
const UNPAIRED_SENTINEL: u32 = 0xffffffffu;
const SCHEDULE_SIGN_BIT: u32 = 0x80000000u;
const SCHEDULE_IDX_MASK: u32 = 0x7fffffffu;

@group(0) @binding(0)
var<storage, read> schedule: array<u32>;

@group(0) @binding(1)
var<storage, read> point_x: array<BigInt>;

@group(0) @binding(2)
var<storage, read> point_y: array<BigInt>;

@group(0) @binding(3)
var<storage, read> wg_output_offset: array<u32>;

@group(0) @binding(4)
var<storage, read> prefix_scratch: array<BigInt>;

@group(0) @binding(5)
var<storage, read_write> output_x: array<BigInt>;

@group(0) @binding(6)
var<storage, read_write> output_y: array<BigInt>;

@group(0) @binding(7)
var<storage, read_write> meta_pool: array<u32>;

// Combined per-WG / per-thread BigInt spill:
//   [0, MAX_WGS)                        wg_inv_per_wg[wg_id]
//                                       (written by Layer-Inverse)
//   [MAX_WGS, MAX_WGS + MAX_WGS * TPB)  per-thread block_total spilled
//                                       by Phase 1-A.
@group(0) @binding(8)
var<storage, read> wg_spill: array<BigInt>;

// pair_count_wg + num_pairs_real_wg packed as (2 * wg_id, 2 * wg_id + 1).
@group(0) @binding(9)
var<storage, read> wg_counts_global: array<u32>;

const WG_SPILL_INV_BASE: u32 = 0u;
const WG_SPILL_BLOCK_BASE: u32 = {{ max_wgs }}u;

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
    let out_base = wg_output_offset[wg_id];

    let total_outputs = wg_counts_global[wg_id * 2u + 0u];
    let total_pairs = wg_counts_global[wg_id * 2u + 1u];

    let meta_base = wg_id * META_PER_WG_STRIDE;
    let pair_idx_a_base = meta_base + META_OFF_PAIR_IDX_A;
    let pair_idx_b_base = meta_base + META_OFF_PAIR_IDX_B;
    let rank_to_raw_base = meta_base + META_OFF_RANK_TO_RAW;
    let prev_raw_base = meta_base + META_OFF_PREV_RAW;

    if (tid == 0u) {
        wg_inv_total = wg_spill[WG_SPILL_INV_BASE + wg_id];
    }
    workgroupBarrier();

    // Reload per-thread block_total spilled by Phase 1-A.
    var block_total: BigInt = wg_spill[WG_SPILL_BLOCK_BASE + wg_id * TPB + tid];
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

    let chunk_start_rank = tid * PER_THREAD_PAIRS;
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

    // UNPAIRED slot write-out. Iterate over ceil(MAX_SLICE_ENTRIES / TPB) chunks.
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
