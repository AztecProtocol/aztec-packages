// Tree-reduce Phase 1 metadata kernel. Extracts Steps 1-6 of the
// in-shader preamble from smvp_tree_phase1 so the math-only Phase A/B/C/D
// kernel can run with less VGPR/LDS pressure and (potentially) better
// occupancy.
//
// Per WG (one WG per slice, TPB threads):
//   - Walk entry_bucket_id[slice_lo..slice_hi) in parallel via TPB-wide
//     max-scan + prefix-sum (same algorithm as the in-shader preamble).
//   - Write pair_idx_a[wg, raw], pair_idx_b[wg, raw], rank_to_raw[wg, rank],
//     prev_raw_for_pair[wg, raw], and output_bucket_id[out_base + raw]
//     into the global meta_pool + output_bucket_id buffers.
//   - Write per-WG emit_count + pair_count into wg_counts.
//
// The companion phase1 kernel then reads wg_counts[wg] for its
// pair_count_wg / num_pairs_real_wg and reads meta_pool for pair/raw
// indices — it does NO preamble work of its own.
//
// Layer-0 only. Same slice_lo/slice_hi reconstruction as the phase1
// shader: per_wg + total_entries via uniform, no slice_bounds binding.

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_ENTRIES: u32 = {{ per_thread_entries }}u;
const UNPAIRED_SENTINEL: u32 = 0xffffffffu;

@group(0) @binding(0)
var<storage, read> entry_bucket_id: array<u32>;

struct Phase1Params {
    per_wg: u32,
    total_entries: u32,
}
@group(0) @binding(1)
var<uniform> phase1_params: Phase1Params;

@group(0) @binding(2)
var<storage, read> wg_output_offset: array<u32>;

@group(0) @binding(3)
var<storage, read_write> output_bucket_id: array<u32>;

@group(0) @binding(4)
var<storage, read_write> meta_pool: array<u32>;

// Per-WG (emit_count, pair_count) tuples. Layout: 2 u32s per WG, stride
// is host-known. wg_counts[wg * 2 + 0] = emit_count (total_outputs),
// wg_counts[wg * 2 + 1] = pair_count (num_pairs_real).
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
    let per_wg = phase1_params.per_wg;
    let total_entries = phase1_params.total_entries;
    var slice_lo: u32 = wg_id * per_wg;
    if (slice_lo > total_entries) { slice_lo = total_entries; }
    var slice_hi: u32 = slice_lo + per_wg;
    if (slice_hi > total_entries) { slice_hi = total_entries; }
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

    // Step 1: per-thread bucket load + local last-break-pos.
    var local_buckets: array<u32, {{ per_thread_entries }}>;
    var local_break_pos: array<u32, {{ per_thread_entries }}>;
    var prev_bucket: u32 = UNPAIRED_SENTINEL;
    if (chunk_lo > slice_lo && chunk_lo < slice_hi) {
        prev_bucket = entry_bucket_id[chunk_lo - 1u];
    }
    var max_break: u32 = 0u;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        let e = chunk_lo + off;
        if (e < chunk_hi) {
            let b = entry_bucket_id[e];
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

    // Step 2: TPB-wide inclusive max-scan.
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

    // Step 3: emit / pair flags.
    var next_chunk_bucket: u32 = UNPAIRED_SENTINEL;
    if (chunk_hi < slice_hi) {
        next_chunk_bucket = entry_bucket_id[chunk_hi];
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

    // Step 4: TPB-wide prefix-sum of emit + pair counts.
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

    // Step 5: write pair_idx_a/b, rank_to_raw, output_bucket_id.
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

    // Step 6: write prev_raw_for_pair using rank_to_raw.
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

    {{{ recompile }}}
}
