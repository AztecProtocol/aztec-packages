{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 2-A of the tree-reduce SMVP (iter 4 — layer-wide batch inverse).
// Sister of `smvp_tree_phase1_a` for layers L >= 1. Reads (bucket_id, x, y)
// directly from the previous layer's ping-pong output. Spills the per-WG
// global product and per-thread block_total for Layer-Inverse / Phase 2-D.

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_ENTRIES: u32 = {{ per_thread_entries }}u;
const PER_THREAD_PAIRS: u32 = {{ per_thread_pairs }}u;
const UNPAIRED_SENTINEL: u32 = 0xffffffffu;

@group(0) @binding(0)
var<storage, read> input_bucket_id: array<u32>;

@group(0) @binding(1)
var<storage, read> input_x: array<BigInt>;

@group(0) @binding(2)
var<storage, read> slice_bounds: array<u32>;

@group(0) @binding(3)
var<storage, read> wg_output_offset: array<u32>;

@group(0) @binding(4)
var<storage, read_write> prefix_scratch: array<BigInt>;

@group(0) @binding(5)
var<storage, read_write> output_bucket_id: array<u32>;

@group(0) @binding(6)
var<storage, read_write> meta_pool: array<u32>;

// See phase1_a header for the layout of wg_spill.
@group(0) @binding(7)
var<storage, read_write> wg_spill: array<BigInt>;

@group(0) @binding(8)
var<storage, read_write> wg_counts_global: array<u32>;

const META_PER_WG_STRIDE: u32 = {{ meta_per_wg_stride }}u;
const META_OFF_PAIR_IDX_A: u32 = 0u;
const META_OFF_PAIR_IDX_B: u32 = {{ max_slice_entries }}u;
const META_OFF_RANK_TO_RAW: u32 = {{ meta_off_rank_to_raw }}u;
const META_OFF_PREV_RAW: u32 = {{ meta_off_prev_raw }}u;
const WG_SPILL_TOTAL_BASE: u32 = 0u;
const WG_SPILL_BLOCK_BASE: u32 = {{ max_wgs }}u;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

var<workgroup> thread_max_break: array<u32, {{ tpb }}>;
var<workgroup> thread_emit_prefix: array<u32, {{ tpb }}>;
var<workgroup> thread_pair_prefix: array<u32, {{ tpb }}>;

var<workgroup> pair_count_wg: u32;
var<workgroup> num_pairs_real_wg: u32;

var<workgroup> wg_fwd: array<BigInt, {{ tpb }}>;

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

    let chunk_lo = slice_lo + tid * PER_THREAD_ENTRIES;
    var chunk_hi_v: u32 = chunk_lo + PER_THREAD_ENTRIES;
    if (chunk_hi_v > slice_hi) { chunk_hi_v = slice_hi; }
    if (chunk_lo > slice_hi) { chunk_hi_v = chunk_lo; }
    let chunk_hi = chunk_hi_v;

    let meta_base = wg_id * META_PER_WG_STRIDE;
    let pair_idx_a_base = meta_base + META_OFF_PAIR_IDX_A;
    let pair_idx_b_base = meta_base + META_OFF_PAIR_IDX_B;
    let rank_to_raw_base = meta_base + META_OFF_RANK_TO_RAW;
    let prev_raw_base = meta_base + META_OFF_PREV_RAW;

    var local_buckets: array<u32, {{ per_thread_entries }}>;
    var local_break_pos: array<u32, {{ per_thread_entries }}>;
    var prev_bucket: u32 = UNPAIRED_SENTINEL;
    if (chunk_lo > slice_lo && chunk_lo < slice_hi) {
        prev_bucket = input_bucket_id[chunk_lo - 1u];
    }
    var max_break: u32 = 0u;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        let e = chunk_lo + off;
        if (e < chunk_hi) {
            let b = input_bucket_id[e];
            local_buckets[off] = b;
            var is_break: bool;
            if (e == slice_lo) {
                is_break = true;
            } else if (off == 0u) {
                is_break = b != prev_bucket;
            } else {
                is_break = b != local_buckets[off - 1u];
            }
            if (is_break) {
                max_break = e;
            }
        } else {
            local_buckets[off] = UNPAIRED_SENTINEL;
        }
        local_break_pos[off] = max_break;
    }

    thread_max_break[tid] = max_break;
    workgroupBarrier();
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var v: u32 = thread_max_break[tid];
        if (tid >= stride) {
            let lhs = thread_max_break[tid - stride];
            if (lhs > v) { v = lhs; }
        }
        workgroupBarrier();
        thread_max_break[tid] = v;
        workgroupBarrier();
    }
    var prev_thread_max: u32 = 0u;
    if (tid > 0u) {
        prev_thread_max = thread_max_break[tid - 1u];
    }
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        if (prev_thread_max > local_break_pos[off]) {
            local_break_pos[off] = prev_thread_max;
        }
    }

    var next_chunk_bucket: u32 = UNPAIRED_SENTINEL;
    if (chunk_hi < slice_hi) {
        next_chunk_bucket = input_bucket_id[chunk_hi];
    }
    var local_emit: u32 = 0u;
    var local_pair: u32 = 0u;
    var local_emit_mask: u32 = 0u;
    var local_pair_mask: u32 = 0u;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        let e = chunk_lo + off;
        if (e >= chunk_hi) { continue; }
        let p = e - local_break_pos[off];
        if ((p & 1u) != 0u) { continue; }
        local_emit = local_emit + 1u;
        local_emit_mask = local_emit_mask | (1u << off);
        var next_b: u32 = UNPAIRED_SENTINEL;
        if (off + 1u < PER_THREAD_ENTRIES) {
            if (e + 1u < chunk_hi) {
                next_b = local_buckets[off + 1u];
            }
        } else {
            if (e + 1u < slice_hi) {
                next_b = next_chunk_bucket;
            }
        }
        if (next_b == local_buckets[off]) {
            local_pair = local_pair + 1u;
            local_pair_mask = local_pair_mask | (1u << off);
        }
    }

    thread_emit_prefix[tid] = local_emit;
    thread_pair_prefix[tid] = local_pair;
    workgroupBarrier();
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var ev: u32 = thread_emit_prefix[tid];
        var pv: u32 = thread_pair_prefix[tid];
        if (tid >= stride) {
            ev = ev + thread_emit_prefix[tid - stride];
            pv = pv + thread_pair_prefix[tid - stride];
        }
        workgroupBarrier();
        thread_emit_prefix[tid] = ev;
        thread_pair_prefix[tid] = pv;
        workgroupBarrier();
    }
    var raw_base: u32 = 0u;
    var pair_base: u32 = 0u;
    if (tid > 0u) {
        raw_base = thread_emit_prefix[tid - 1u];
        pair_base = thread_pair_prefix[tid - 1u];
    }
    if (tid == 0u) {
        pair_count_wg = thread_emit_prefix[TPB - 1u];
        num_pairs_real_wg = thread_pair_prefix[TPB - 1u];
        wg_counts_global[wg_id * 2u + 0u] = pair_count_wg;
        wg_counts_global[wg_id * 2u + 1u] = num_pairs_real_wg;
    }
    workgroupBarrier();

    var raw_w: u32 = raw_base;
    var pair_w: u32 = pair_base;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        if ((local_emit_mask & (1u << off)) == 0u) { continue; }
        let e = chunk_lo + off;
        let raw = raw_w;
        raw_w = raw_w + 1u;
        meta_pool[pair_idx_a_base + raw] = e;
        if ((local_pair_mask & (1u << off)) != 0u) {
            meta_pool[pair_idx_b_base + raw] = e + 1u;
            let pair_rank = pair_w;
            pair_w = pair_w + 1u;
            meta_pool[rank_to_raw_base + pair_rank] = raw;
        } else {
            meta_pool[pair_idx_b_base + raw] = UNPAIRED_SENTINEL;
        }
        output_bucket_id[out_base + raw] = local_buckets[off];
    }
    workgroupBarrier();

    var raw_r: u32 = raw_base;
    var pair_r: u32 = pair_base;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        if ((local_emit_mask & (1u << off)) == 0u) { continue; }
        let raw = raw_r;
        raw_r = raw_r + 1u;
        if ((local_pair_mask & (1u << off)) != 0u) {
            let pair_rank = pair_r;
            pair_r = pair_r + 1u;
            if (pair_rank == 0u) {
                meta_pool[prev_raw_base + raw] = UNPAIRED_SENTINEL;
            } else {
                meta_pool[prev_raw_base + raw] = meta_pool[rank_to_raw_base + pair_rank - 1u];
            }
        }
    }
    workgroupBarrier();

    let total_pairs = num_pairs_real_wg;

    let chunk_start_rank = tid * PER_THREAD_PAIRS;
    var block_total: BigInt = get_r();
    for (var t: u32 = 0u; t < PER_THREAD_PAIRS; t = t + 1u) {
        let rank = chunk_start_rank + t;
        if (rank >= total_pairs) { break; }
        let raw = meta_pool[rank_to_raw_base + rank];
        let idx_a = meta_pool[pair_idx_a_base + raw];
        let idx_b = meta_pool[pair_idx_b_base + raw];
        var p_x: BigInt = input_x[idx_a];
        var q_x: BigInt = input_x[idx_b];
        var dx: BigInt = fr_sub(&q_x, &p_x);
        if (t == 0u) {
            block_total = dx;
        } else {
            block_total = montgomery_product(&block_total, &dx);
        }
        prefix_scratch[wg_id * MAX_SLICE_ENTRIES + raw] = block_total;
    }

    wg_spill[WG_SPILL_BLOCK_BASE + wg_id * TPB + tid] = block_total;

    wg_fwd[tid] = block_total;
    workgroupBarrier();

    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var fwd_x: BigInt = wg_fwd[tid];
        if (tid >= stride) {
            var lhs: BigInt = wg_fwd[tid - stride];
            fwd_x = montgomery_product(&lhs, &fwd_x);
        }
        workgroupBarrier();
        wg_fwd[tid] = fwd_x;
        workgroupBarrier();
    }

    if (tid == 0u) {
        var global_total: BigInt;
        if (total_pairs == 0u) {
            global_total = get_r();
        } else {
            global_total = wg_fwd[TPB - 1u];
        }
        wg_spill[WG_SPILL_TOTAL_BASE + wg_id] = global_total;
    }

    {{{ recompile }}}
}
