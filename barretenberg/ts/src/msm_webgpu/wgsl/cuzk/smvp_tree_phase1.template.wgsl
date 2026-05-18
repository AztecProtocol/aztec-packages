{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 1 of the tree-reduce SMVP (v3 — fully parallel preamble).
//
// One workgroup per slice. PER-WG WORK IS NOW EVENLY DISTRIBUTED:
//   - Preamble (parallel pair detection):
//       Each of TPB threads processes PER_THREAD_ENTRIES =
//       MAX_SLICE_ENTRIES / TPB entries from the slice's bucket-sorted
//       stream. Each entry's `pos_in_run` (its position within its
//       contiguous same-bucket run, with the run reset at slice_lo)
//       is recovered by a TPB-wide max-scan of per-thread "last break
//       position". An entry "emits" iff (pos_in_run & 1u) == 0u — and
//       is a PAIR iff its successor in the slice has the same bucket
//       id (else UNPAIRED). Per-thread emit / pair counts feed two
//       TPB-wide prefix-sums to assign raw_slot and pair_rank ranges
//       without any serial state machine.
//   - Phase A: per-thread inclusive-prefix product of delta_x over
//       PER_THREAD_PAIRS PAIRs in PAIR-rank order. ONE static loop —
//       no scan over MAX_PAIRS. ONLY reads point_x — point_y is not
//       touched in Phase A (saves ~50% of point-data bandwidth on
//       large WG inputs).
//   - Phase B: TPB-wide Hillis-Steele scan of per-thread block_total.
//   - Phase C: thread-0 fr_inv_by_a on the global product.
//   - Phase D: per-thread back-walk of the same chunk in descending
//       PAIR-rank order, computing affine adds. inv_dx for PAIR rank R
//       uses the precomputed previous-PAIR raw_slot (O(1) lookup,
//       no backward scan).
//
// Workgroup memory at MAX_PAIRS=1024, MAX_SLICE_ENTRIES=2048, TPB=128:
//   thread_max_break/emit_prefix/pair_prefix: 3 × TPB × 4 = 1.5 KB
//   wg_fwd, wg_bwd:                  2 × TPB × 80 = 20.48 KB
//   wg_inv_total + counters:         ~120 B
//   total:                           ~22.1 KB (under M2's 32 KB cap).
//
// pair_idx_a/b, rank_to_raw, and prev_raw_for_pair all live in the
// single per-WG `meta_pool` storage binding (binding 10). The per-WG
// slice has four contiguous sections — see META_OFF_* below.
//
// Static loop bounds:
//   Preamble Step 1 (load buckets + local break-max): PER_THREAD_ENTRIES
//   Preamble Step 2 (TPB max-scan):                  log2(TPB)
//   Preamble Step 3 (emit/pair flags):               PER_THREAD_ENTRIES
//   Preamble Step 4 (TPB prefix-sum):                log2(TPB)
//   Preamble Step 5 (write pair_idx*/rank_to_raw):   PER_THREAD_ENTRIES
//   Preamble Step 6 (write prev_raw_for_pair):       PER_THREAD_ENTRIES
//   Phase A:                                          PER_THREAD_PAIRS
//   Phase B:                                          log2(TPB)
//   Phase D:                                          PER_THREAD_PAIRS
//   UNPAIRED write-out:                              MAX_SLICE_ENTRIES / TPB

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_ENTRIES: u32 = {{ per_thread_entries }}u;
const PER_THREAD_PAIRS: u32 = {{ per_thread_pairs }}u;
const UNPAIRED_SENTINEL: u32 = 0xffffffffu;
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

// Layer-0 slice geometry. Layer 0 is the only layer phase1 runs on, and
// its slice_bounds are computed by the prelude as
//   slice_bounds[k] = min(k * per_wg, N) for k in [0, num_wgs]
// with per_wg = ceil(N / num_wgs). Both per_wg and N are host-known at
// layer-0 dispatch time, so we pass them via uniform and reconstruct
// slice_lo/slice_hi in-shader rather than spending a storage binding.
struct Phase1Params {
    per_wg: u32,
    total_entries: u32,
}
@group(0) @binding(4)
var<uniform> phase1_params: Phase1Params;

@group(0) @binding(5)
var<storage, read> wg_output_offset: array<u32>;    // length num_wgs+1

@group(0) @binding(6)
var<storage, read_write> prefix_scratch: array<BigInt>;  // size num_wgs * MAX_SLICE_ENTRIES

@group(0) @binding(7)
var<storage, read_write> output_bucket_id: array<u32>;

@group(0) @binding(8)
var<storage, read_write> output_x: array<BigInt>;

@group(0) @binding(9)
var<storage, read_write> output_y: array<BigInt>;

// Single combined per-WG metadata pool. Four contiguous sections:
//   [0 .. MAX_SLICE_ENTRIES)               = pair_idx_a
//   [MAX_SLICE_ENTRIES .. 2*MSE)           = pair_idx_b
//   [2*MSE .. 2*MSE + MAX_PAIRS)           = rank_to_raw
//   [2*MSE + MAX_PAIRS .. 2*MSE + MP + MSE) = prev_raw_for_pair
// Per-WG stride = 3 * MAX_SLICE_ENTRIES + MAX_PAIRS u32s.
// pair_idx_a/b are indexed by raw_slot ∈ [0, MAX_SLICE_ENTRIES).
// rank_to_raw is indexed by pair_rank ∈ [0, MAX_PAIRS).
// prev_raw_for_pair is INDEXED by raw_slot ∈ [0, MAX_SLICE_ENTRIES) —
// when many UNPAIRED slots precede a PAIR, the PAIR's raw_slot can
// exceed MAX_PAIRS, so this section must be sized by MAX_SLICE_ENTRIES.
@group(0) @binding(10)
var<storage, read_write> meta_pool: array<u32>;

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

var<workgroup> thread_max_break: array<u32, {{ tpb }}>;
var<workgroup> thread_emit_prefix: array<u32, {{ tpb }}>;
var<workgroup> thread_pair_prefix: array<u32, {{ tpb }}>;

var<workgroup> pair_count_wg: u32;
var<workgroup> num_pairs_real_wg: u32;

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

    // === Preamble Step 1: per-thread bucket load + local "last break pos" ===
    // For each entry e in [chunk_lo, chunk_hi):
    //   is_break iff (e == slice_lo) OR (bucket[e] != bucket[e-1])
    //   local_break_pos[off] = max{e' <= e : is_break(e')}
    // local_buckets[] caches bucket_id for re-use in Steps 3 and 5.
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
    // Exclusive prefix-max for this thread.
    var prev_thread_max: u32 = 0u;
    if (tid > 0u) {
        prev_thread_max = thread_max_break[tid - 1u];
    }
    for (var off: u32 = 0u; off < PER_THREAD_ENTRIES; off = off + 1u) {
        if (prev_thread_max > local_break_pos[off]) {
            local_break_pos[off] = prev_thread_max;
        }
    }
    // Now: pos_in_run(e) = e - local_break_pos[off] for e in this chunk.

    // === Preamble Step 3: emit / pair flags ===
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
                meta_pool[prev_raw_base + raw] = UNPAIRED_SENTINEL;
            } else {
                meta_pool[prev_raw_base + raw] = meta_pool[rank_to_raw_base + pair_rank - 1u];
            }
        }
    }
    workgroupBarrier();

    let total_outputs = pair_count_wg;
    let total_pairs = num_pairs_real_wg;

    // Phase A: per-thread prefix product over PER_THREAD_PAIRS PAIRs
    // assigned to this thread's contiguous PAIR-rank chunk. Only x is
    // read; y is not needed for dx = Q.x - P.x.
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

    // Phase D: back-walk this thread's PAIR-rank chunk in descending
    // fwd-rank order. PER_THREAD_PAIRS iterations, no scan.
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

    // Write-out UNPAIRED slots cooperatively round-robin. Total emitted
    // slots can reach MAX_SLICE_ENTRIES in the all-alternating-bucket
    // worst case (every entry emits and is UNPAIRED), so iterate over
    // ceil(MAX_SLICE_ENTRIES / TPB) chunks rather than MAX_PAIRS / TPB.
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
