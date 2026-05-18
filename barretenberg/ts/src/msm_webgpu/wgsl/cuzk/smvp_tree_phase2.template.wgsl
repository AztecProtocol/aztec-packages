{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 2 of the tree-reduce SMVP (v3 — fully parallel preamble).
// See `smvp_tree_phase1.template.wgsl` header for the preamble design.
// The only differences vs Phase 1 are at the load_point boundary
// (Mont-form points already in place, no schedule decode or sign flip)
// and the bucket_id source (read from `input_bucket_id[]` instead of
// `entry_bucket_id[]`).

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
var<storage, read> input_y: array<BigInt>;

@group(0) @binding(3)
var<storage, read> slice_bounds: array<u32>;

@group(0) @binding(4)
var<storage, read> wg_output_offset: array<u32>;

@group(0) @binding(5)
var<storage, read_write> prefix_scratch: array<BigInt>;

@group(0) @binding(6)
var<storage, read_write> output_bucket_id: array<u32>;

@group(0) @binding(7)
var<storage, read_write> output_x: array<BigInt>;

@group(0) @binding(8)
var<storage, read_write> output_y: array<BigInt>;

// Combined pair_idx_a/b global. Interleaved layout per WG:
//   pair_idx_combined[wg_id * 2 * MAX_SLICE_ENTRIES + raw * 2 + 0] = idx_a
//   pair_idx_combined[wg_id * 2 * MAX_SLICE_ENTRIES + raw * 2 + 1] = idx_b
// Hoisted out of workgroup memory at MAX_SLICE_ENTRIES=2048; see the
// phase1 header comment for the WG-memory accounting.
@group(0) @binding(9)
var<storage, read_write> pair_idx_combined: array<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}
// `get_p()` is provided by the `montgomery_product_funcs` partial.

// prev_raw_for_pair is INDEXED by raw_slot (∈ [0, MAX_SLICE_ENTRIES)),
// not by pair_rank — when many UNPAIRED slots precede a PAIR, the PAIR's
// raw_slot can exceed MAX_PAIRS, so the array must be sized by
// MAX_SLICE_ENTRIES.
// rank_to_raw is indexed by pair_rank (∈ [0, MAX_PAIRS)), so MAX_PAIRS is
// correct here even though its values are raw_slots (which may be larger).
var<workgroup> prev_raw_for_pair: array<u32, {{ max_slice_entries }}>;
var<workgroup> rank_to_raw: array<u32, {{ max_pairs }}>;

var<workgroup> thread_max_break: array<u32, {{ tpb }}>;
var<workgroup> thread_emit_prefix: array<u32, {{ tpb }}>;
var<workgroup> thread_pair_prefix: array<u32, {{ tpb }}>;

var<workgroup> pair_count_wg: u32;
var<workgroup> num_pairs_real_wg: u32;

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
    let wg_id = wid.x;
    let slice_lo = slice_bounds[wg_id];
    let slice_hi = slice_bounds[wg_id + 1u];
    let out_base = wg_output_offset[wg_id];

    let chunk_lo = slice_lo + tid * PER_THREAD_ENTRIES;
    var chunk_hi_v: u32 = chunk_lo + PER_THREAD_ENTRIES;
    if (chunk_hi_v > slice_hi) { chunk_hi_v = slice_hi; }
    if (chunk_lo > slice_hi) { chunk_hi_v = chunk_lo; }
    let chunk_hi = chunk_hi_v;

    let pair_idx_base = wg_id * 2u * MAX_SLICE_ENTRIES;

    // === Preamble Step 1: per-thread bucket load + local "last break pos" ===
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

    // === Preamble Step 2: TPB-wide inclusive max-scan of max_break ===
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

    // === Preamble Step 3: emit / pair flags ===
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

    // === Preamble Step 4: TPB-wide prefix-sum of emit + pair counts ===
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
    }
    workgroupBarrier();

    // === Preamble Step 5: write pair_idx_a/b, rank_to_raw, output_bucket_id ===
    var raw_w: u32 = raw_base;
    var pair_w: u32 = pair_base;
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        if ((local_emit_mask & (1u << off)) == 0u) { continue; }
        let e = chunk_lo + off;
        let raw = raw_w;
        raw_w = raw_w + 1u;
        pair_idx_combined[pair_idx_base + raw * 2u + 0u] = e;
        if ((local_pair_mask & (1u << off)) != 0u) {
            pair_idx_combined[pair_idx_base + raw * 2u + 1u] = e + 1u;
            let pair_rank = pair_w;
            pair_w = pair_w + 1u;
            rank_to_raw[pair_rank] = raw;
        } else {
            pair_idx_combined[pair_idx_base + raw * 2u + 1u] = UNPAIRED_SENTINEL;
        }
        output_bucket_id[out_base + raw] = local_buckets[off];
    }
    workgroupBarrier();

    // === Preamble Step 6: write prev_raw_for_pair using rank_to_raw ===
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
                prev_raw_for_pair[raw] = UNPAIRED_SENTINEL;
            } else {
                prev_raw_for_pair[raw] = rank_to_raw[pair_rank - 1u];
            }
        }
    }
    workgroupBarrier();

    let total_outputs = pair_count_wg;
    let total_pairs = num_pairs_real_wg;

    // Phase A: per-thread prefix product over PER_THREAD_PAIRS PAIRs.
    // Only x is read; y is not needed for dx = Q.x - P.x.
    let chunk_start_rank = tid * PER_THREAD_PAIRS;
    var block_total: BigInt = get_r();
    for (var t: u32 = 0u; t < PER_THREAD_PAIRS; t = t + 1u) {
        let rank = chunk_start_rank + t;
        if (rank >= total_pairs) { break; }
        let raw = rank_to_raw[rank];
        let idx_a = pair_idx_combined[pair_idx_base + raw * 2u + 0u];
        let idx_b = pair_idx_combined[pair_idx_base + raw * 2u + 1u];
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

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

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
        let raw = rank_to_raw[rank];
        let idx_a = pair_idx_combined[pair_idx_base + raw * 2u + 0u];
        let idx_b = pair_idx_combined[pair_idx_base + raw * 2u + 1u];
        var p_x: BigInt = input_x[idx_a];
        var p_y: BigInt = input_y[idx_a];
        var q_x: BigInt = input_x[idx_b];
        var q_y: BigInt = input_y[idx_b];

        var inv_dx: BigInt;
        if (rank == chunk_start_rank) {
            inv_dx = inv_acc_local;
        } else {
            let prev_raw = prev_raw_for_pair[raw];
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

    // Total emitted slots can reach MAX_SLICE_ENTRIES in the worst case
    // (all alternating buckets emit and are UNPAIRED), so iterate over
    // ceil(MAX_SLICE_ENTRIES / TPB) chunks.
    for (var off: u32 = 0u; off < (MAX_SLICE_ENTRIES + TPB - 1u) / TPB; off = off + 1u) {
        let i = tid + off * TPB;
        if (i >= total_outputs) { break; }
        let idx_b = pair_idx_combined[pair_idx_base + i * 2u + 1u];
        if (idx_b != UNPAIRED_SENTINEL) { continue; }
        let idx_a = pair_idx_combined[pair_idx_base + i * 2u + 0u];
        output_x[out_base + i] = input_x[idx_a];
        output_y[out_base + i] = input_y[idx_a];
    }

    {{{ recompile }}}
}
