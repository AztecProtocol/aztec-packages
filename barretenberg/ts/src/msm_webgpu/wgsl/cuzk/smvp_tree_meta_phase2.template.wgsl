// Tree-reduce Phase 2 metadata kernel. Companion to
// smvp_tree_meta_phase1, for layers >= 1 (input is from input_bucket_id
// + slice_bounds[wg], not entry_bucket_id + uniform per_wg).
//
// See smvp_tree_meta_phase1.template.wgsl for the algorithm.

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_ENTRIES: u32 = {{ per_thread_entries }}u;
const UNPAIRED_SENTINEL: u32 = 0xffffffffu;

@group(0) @binding(0)
var<storage, read> input_bucket_id: array<u32>;

@group(0) @binding(1)
var<storage, read> slice_bounds: array<u32>;

@group(0) @binding(2)
var<storage, read> wg_output_offset: array<u32>;

@group(0) @binding(3)
var<storage, read_write> output_bucket_id: array<u32>;

@group(0) @binding(4)
var<storage, read_write> meta_pool: array<u32>;

@group(0) @binding(5)
var<storage, read_write> wg_counts: array<u32>;

const META_PER_WG_STRIDE: u32 = {{ meta_per_wg_stride }}u;
const META_OFF_PAIR_IDX_A: u32 = 0u;
const META_OFF_PAIR_IDX_B: u32 = {{ max_slice_entries }}u;
const META_OFF_RANK_TO_RAW: u32 = {{ meta_off_rank_to_raw }}u;
const META_OFF_PREV_RAW: u32 = {{ meta_off_prev_raw }}u;

var<workgroup> thread_max_break: array<u32, {{ tpb }}>;
var<workgroup> thread_emit_prefix: array<u32, {{ tpb }}>;
var<workgroup> thread_pair_prefix: array<u32, {{ tpb }}>;

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

    // Step 1.
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

    // Step 2.
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

    // Step 3.
    var next_chunk_bucket: u32 = UNPAIRED_SENTINEL;
    if (chunk_hi < slice_hi) {
        next_chunk_bucket = input_bucket_id[chunk_hi];
    }
    // PER_THREAD_ENTRIES can exceed 32 (iter 9: 64), so the emit/pair
    // flag bitmasks split into low (off ∈ [0, 32)) and high (off ∈ [32, 64))
    // u32s. A single u32 would silently overflow on `1u << off` for off >= 32.
    var local_emit: u32 = 0u;
    var local_pair: u32 = 0u;
    var local_emit_mask_lo: u32 = 0u;
    var local_emit_mask_hi: u32 = 0u;
    var local_pair_mask_lo: u32 = 0u;
    var local_pair_mask_hi: u32 = 0u;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        let e = chunk_lo + off;
        if (e >= chunk_hi) { continue; }
        let p = e - local_break_pos[off];
        if ((p & 1u) != 0u) { continue; }
        local_emit = local_emit + 1u;
        if (off < 32u) {
            local_emit_mask_lo = local_emit_mask_lo | (1u << off);
        } else {
            local_emit_mask_hi = local_emit_mask_hi | (1u << (off - 32u));
        }
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
            if (off < 32u) {
                local_pair_mask_lo = local_pair_mask_lo | (1u << off);
            } else {
                local_pair_mask_hi = local_pair_mask_hi | (1u << (off - 32u));
            }
        }
    }

    // Step 4.
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
        wg_counts[wg_id * 2u + 0u] = thread_emit_prefix[TPB - 1u];
        wg_counts[wg_id * 2u + 1u] = thread_pair_prefix[TPB - 1u];
    }
    workgroupBarrier();

    // Step 5.
    var raw_w: u32 = raw_base;
    var pair_w: u32 = pair_base;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        var emit_bit: u32;
        var pair_bit: u32;
        if (off < 32u) {
            emit_bit = local_emit_mask_lo & (1u << off);
            pair_bit = local_pair_mask_lo & (1u << off);
        } else {
            emit_bit = local_emit_mask_hi & (1u << (off - 32u));
            pair_bit = local_pair_mask_hi & (1u << (off - 32u));
        }
        if (emit_bit == 0u) { continue; }
        let e = chunk_lo + off;
        let raw = raw_w;
        raw_w = raw_w + 1u;
        meta_pool[pair_idx_a_base + raw] = e;
        if (pair_bit != 0u) {
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

    // Step 6.
    var raw_r: u32 = raw_base;
    var pair_r: u32 = pair_base;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        var emit_bit: u32;
        var pair_bit: u32;
        if (off < 32u) {
            emit_bit = local_emit_mask_lo & (1u << off);
            pair_bit = local_pair_mask_lo & (1u << off);
        } else {
            emit_bit = local_emit_mask_hi & (1u << (off - 32u));
            pair_bit = local_pair_mask_hi & (1u << (off - 32u));
        }
        if (emit_bit == 0u) { continue; }
        let raw = raw_r;
        raw_r = raw_r + 1u;
        if (pair_bit != 0u) {
            let pair_rank = pair_r;
            pair_r = pair_r + 1u;
            if (pair_rank == 0u) {
                meta_pool[prev_raw_base + raw] = UNPAIRED_SENTINEL;
            } else {
                meta_pool[prev_raw_base + raw] = meta_pool[rank_to_raw_base + pair_rank - 1u];
            }
        }
    }

    {{{ recompile }}}
}
