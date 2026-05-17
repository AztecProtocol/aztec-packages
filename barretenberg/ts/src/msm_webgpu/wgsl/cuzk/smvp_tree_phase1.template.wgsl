{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 1 of the tree-reduce SMVP: initial sweep over the raw schedule.
//
// One workgroup per slice (slice = wg_id's contiguous range of entries
// in the bucket-sorted transpose output). Per workgroup:
//
//   1. Pair detection (thread 0, serial scan of the slice). Builds a
//      `pair_list[]` in workgroup memory; each entry is either a PAIR
//      (two consecutive same-bucket entries → input to batch-affine)
//      or an UNPAIRED carry (a single entry passed through to output).
//      pair_list is laid out left-to-right in the slice walk order, so
//      it is automatically bucket-sorted (no reorder postlude needed —
//      the schedule itself is bucket-sorted by upstream transpose).
//
//   2. Batch-affine (cooperative across TPB threads, Phase A/B/C/D
//      structure from bench_batch_affine.template.wgsl). All PAIR
//      entries in pair_list contribute one delta_x to a single
//      fr_inv_by_a global inverse amortised across the workgroup.
//      UNPAIRED entries are skipped during phases A/B/D — they emit
//      directly from their scalar_idx in the final write-out.
//
//   3. Write-out: each thread writes its pair_list slice to
//      `output_x[wg_output_offset[wg_id] + i]`, `output_y[...]`, with
//      bucket id tagged in `output_bucket_id[...]`. PAIR entries write
//      the affine-add result; UNPAIRED entries write the scalar point
//      (with sign flip from the schedule's high bit).
//
// MAX_SLICE_ENTRIES is the static upper bound on per-slice entry count
// (= per-slice pair_list length); baked at compile time so workgroup
// memory + loop bounds are constant. v0 uses 128 to keep workgroup
// memory comfortable while we validate correctness on small inputs;
// the production target is 1024 with prefix scratch hoisted to global
// (TODO once correctness gate passes).
//
// Loop bounds — every loop body in this kernel is bounded by a
// compile-time `const`:
//   - PHASE_A_LOOP: bound = PER_THREAD_PAIRS (compile-time).
//   - PHASE_B_LOOP: bound = TPB (compile-time).
//   - PHASE_D_LOOP: bound = PER_THREAD_PAIRS (compile-time).
//   - All Bigint inner loops are bounded by NUM_WORDS in partials.
// Walking the entry slice and the pair_list both use static
// MAX_SLICE_ENTRIES bounds.

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_PAIRS: u32 = {{ per_thread_pairs }}u;

const PAIR_KIND_UNPAIRED: u32 = 0u;
const PAIR_KIND_PAIR: u32 = 1u;
const SCHEDULE_SIGN_BIT: u32 = 0x80000000u;
const SCHEDULE_IDX_MASK: u32 = 0x7fffffffu;

// Per-WG inputs.
@group(0) @binding(0)
var<storage, read> schedule: array<u32>;            // sign_bit | scalar_idx

@group(0) @binding(1)
var<storage, read> entry_bucket_id: array<u32>;     // bucket id per entry (host-precomputed)

@group(0) @binding(2)
var<storage, read> point_x: array<BigInt>;          // base points (indexed by scalar_idx)

@group(0) @binding(3)
var<storage, read> point_y: array<BigInt>;

@group(0) @binding(4)
var<storage, read> slice_bounds: array<u32>;        // length num_wgs+1

@group(0) @binding(5)
var<storage, read> wg_output_offset: array<u32>;    // length num_wgs+1

// Scratch — per pair, holds the prefix product through batch-affine
// phase A and the negated-Q.y carrier needed by phase D. Sized to
// MAX_PAIRS × BigInt; allocated globally because workgroup memory at
// MAX_PAIRS=512 would be 40 KB (exceeds 16 KB limit on mobile). Slot
// k is owned exclusively by pair_list[k] within this WG, so no
// cross-WG sync is needed.
@group(0) @binding(6)
var<storage, read_write> prefix_scratch: array<BigInt>;  // size num_wgs * MAX_PAIRS

// Outputs.
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

// pair_list packs the per-WG list of (kind, idx_a, idx_b?) tuples.
// Element layout: vec2<u32> = (idx_a, kind_or_idx_b). When kind ==
// PAIR_KIND_PAIR, kind_or_idx_b holds idx_b (a global entry index <
// 2^31). When kind == PAIR_KIND_UNPAIRED, kind_or_idx_b is set to the
// sentinel 0xffffffff and idx_a alone identifies the entry.
//
// Bucket id per pair_list slot lives in a parallel array so the
// postlude write-out can tag outputs without re-reading
// entry_bucket_id (saves one global load per output).
var<workgroup> pair_list_idx_a: array<u32, {{ max_pairs }}>;
var<workgroup> pair_list_idx_b: array<u32, {{ max_pairs }}>;
var<workgroup> pair_list_bucket: array<u32, {{ max_pairs }}>;
var<workgroup> pair_count: u32;
var<workgroup> num_pairs_real: u32; // count of PAIR entries (not UNPAIRED)

// Per-thread Phase A/B scratch: each thread owns PER_THREAD_PAIRS pair
// slots from pair_list. Phase B reduction state across the workgroup.
var<workgroup> wg_fwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_bwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_inv_total: BigInt;

// Load the affine point for a schedule entry. The high bit of the
// schedule encodes a sign flip — if set, return -P (i.e. (P.x, -P.y)).
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

    // Preamble: thread 0 builds pair_list. Other threads spin on the
    // barrier. Pair detection is sequential and ~O(slice_size) — at
    // SWEET_B=1024 it's ~5µs of the kernel which is acceptable; the
    // parallel-scan version is a follow-up.
    if (tid == 0u) {
        var count: u32 = 0u;
        var pair_real: u32 = 0u;
        var open_idx: u32 = 0xffffffffu;
        var open_bucket: u32 = 0xffffffffu;
        for (var i: u32 = 0u; i < MAX_SLICE_ENTRIES; i = i + 1u) {
            let entry_idx = slice_lo + i;
            if (entry_idx >= slice_hi) { break; }
            let b = entry_bucket_id[entry_idx];
            if (open_idx != 0xffffffffu && b == open_bucket) {
                pair_list_idx_a[count] = open_idx;
                pair_list_idx_b[count] = entry_idx;
                pair_list_bucket[count] = b;
                count = count + 1u;
                pair_real = pair_real + 1u;
                open_idx = 0xffffffffu;
                open_bucket = 0xffffffffu;
            } else {
                if (open_idx != 0xffffffffu) {
                    pair_list_idx_a[count] = open_idx;
                    pair_list_idx_b[count] = 0xffffffffu;
                    pair_list_bucket[count] = open_bucket;
                    count = count + 1u;
                }
                open_idx = entry_idx;
                open_bucket = b;
            }
        }
        if (open_idx != 0xffffffffu) {
            pair_list_idx_a[count] = open_idx;
            pair_list_idx_b[count] = 0xffffffffu;
            pair_list_bucket[count] = open_bucket;
            count = count + 1u;
        }
        pair_count = count;
        num_pairs_real = pair_real;
    }
    workgroupBarrier();

    let total_outputs = pair_count;
    let total_pairs = num_pairs_real;

    // Phase A: per-thread inclusive-prefix product over delta_x for
    // its PER_THREAD_PAIRS slice of the PAIR-only sub-stream. The
    // sub-stream is implicit: thread t walks pair_list slots [a, b)
    // where a/b are computed from its PAIR rank, not the raw slot
    // index. We iterate over raw slots and skip UNPAIRED.
    //
    // Per-thread work is bounded by PER_THREAD_PAIRS = ceil(MAX_PAIRS / TPB)
    // pairs at the rate of one delta_x per PAIR. Threads with no PAIR
    // assignment skip the inversion completely (block_total stays at R).
    //
    // To make the per-thread chunk static, we map raw pair_list index
    // to its PAIR-rank via a serial loop: we keep a running pair_rank
    // counter and only act on entries where idx_b != UNPAIRED_SENTINEL.
    // Each thread chunks the PAIR sub-stream by rank, not raw index,
    // so the cooperative product is over PAIRs only.
    let chunk_start_rank = tid * PER_THREAD_PAIRS;
    let chunk_end_rank = chunk_start_rank + PER_THREAD_PAIRS;
    var block_total: BigInt = get_r();
    var rank: u32 = 0u;
    for (var i: u32 = 0u; i < MAX_PAIRS; i = i + 1u) {
        if (i >= total_outputs) { break; }
        let idx_b = pair_list_idx_b[i];
        if (idx_b == 0xffffffffu) { continue; }
        if (rank >= chunk_end_rank) { break; }
        if (rank >= chunk_start_rank) {
            let idx_a = pair_list_idx_a[i];
            var p_x: BigInt;
            var p_y: BigInt;
            load_point(idx_a, &p_x, &p_y);
            var q_x: BigInt;
            var q_y: BigInt;
            load_point(idx_b, &q_x, &q_y);
            var dx: BigInt = fr_sub(&q_x, &p_x);
            if (rank == chunk_start_rank) {
                block_total = dx;
            } else {
                block_total = montgomery_product(&block_total, &dx);
            }
            prefix_scratch[wg_id * MAX_PAIRS + i] = block_total;
        }
        rank = rank + 1u;
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    // Phase B: Hillis-Steele scans over per-thread block_totals.
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

    // Phase C: thread 0 inverts the global product. If there are zero
    // PAIRs (all entries are unpaired carries) skip — write_out doesn't
    // need an inverse.
    if (tid == 0u) {
        if (total_pairs > 0u) {
            var global_total: BigInt = wg_fwd[TPB - 1u];
            wg_inv_total = fr_inv_by_a(global_total);
        }
    }
    workgroupBarrier();

    // Setup per-thread inv_acc = inv(block_total[tid])
    //                          = inv_global * block_excl_prefix * block_excl_suffix
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

    // Phase D: back-walk this thread's PAIR rank chunk in descending
    // fwd_rank order. The Montgomery backward-batch-inverse trick
    //   inv_dx_k = inv_acc * prefix[k-1]
    //   inv_acc  *= dx_k             (after processing k, unless k = chunk_start)
    // requires the previous chunk-local PAIR's prefix_scratch entry.
    //
    // We iterate raw slots in reverse using `off = 0..MAX_PAIRS`,
    // i = total_outputs - 1 - off (descending), counting PAIRs from
    // the right via `rev_pair_rank`. fwd_rank = total_pairs - 1 -
    // rev_pair_rank. The gate `fwd_rank ∈ [chunk_start_rank,
    // chunk_end_rank)` selects this thread's chunk.
    //
    // For non-chunk-start PAIRs we need prev_i = raw slot of the
    // immediate prior PAIR (a strictly smaller raw slot, since pair
    // ranks are monotone with raw slot). prefix_scratch[prev_i] holds
    // that PAIR's chunk-local partial product because prev_i is
    // guaranteed to be in *this* thread's chunk (fwd_rank R-1 is in
    // [chunk_start_rank, R) ⊂ chunk when R > chunk_start_rank).
    var inv_acc_local: BigInt = inv_acc;
    var rev_pair_rank: u32 = 0u;
    for (var off: u32 = 0u; off < MAX_PAIRS; off = off + 1u) {
        if (off >= total_outputs) { break; }
        let i = total_outputs - 1u - off;
        let idx_b = pair_list_idx_b[i];
        if (idx_b == 0xffffffffu) { continue; }
        let my_rank_from_end = rev_pair_rank;
        rev_pair_rank = rev_pair_rank + 1u;
        let fwd_rank = total_pairs - 1u - my_rank_from_end;
        if (fwd_rank < chunk_start_rank || fwd_rank >= chunk_end_rank) { continue; }

        let idx_a = pair_list_idx_a[i];
        var p_x: BigInt; var p_y: BigInt;
        load_point(idx_a, &p_x, &p_y);
        var q_x: BigInt; var q_y: BigInt;
        load_point(idx_b, &q_x, &q_y);

        var inv_dx: BigInt;
        if (fwd_rank == chunk_start_rank) {
            inv_dx = inv_acc_local;
        } else {
            // Walk backward from i-1 looking for the immediate prior
            // PAIR (largest raw slot < i with idx_b != UNPAIRED).
            // Bound = MAX_PAIRS (UNPAIRED count between consecutive
            // PAIRs is bounded by buckets-in-slice, far smaller in
            // practice). Guaranteed to find one when fwd_rank > 0.
            var prev_i: u32 = 0xffffffffu;
            for (var j: u32 = 1u; j <= MAX_PAIRS; j = j + 1u) {
                if (j > i) { break; }
                let probe = i - j;
                if (pair_list_idx_b[probe] != 0xffffffffu) {
                    prev_i = probe;
                    break;
                }
            }
            var prev_prefix: BigInt = prefix_scratch[wg_id * MAX_PAIRS + prev_i];
            inv_dx = montgomery_product(&inv_acc_local, &prev_prefix);
        }

        // Affine add.
        var dy: BigInt = fr_sub(&q_y, &p_y);
        var slope: BigInt = montgomery_product(&dy, &inv_dx);
        var slope_sq: BigInt = montgomery_product(&slope, &slope);
        var t1: BigInt = fr_sub(&slope_sq, &p_x);
        var r_x: BigInt = fr_sub(&t1, &q_x);
        var dx_back: BigInt = fr_sub(&p_x, &r_x);
        var ldx: BigInt = montgomery_product(&slope, &dx_back);
        var r_y: BigInt = fr_sub(&ldx, &p_y);

        output_bucket_id[out_base + i] = pair_list_bucket[i];
        output_x[out_base + i] = r_x;
        output_y[out_base + i] = r_y;

        if (fwd_rank > chunk_start_rank) {
            var dx_k: BigInt = fr_sub(&q_x, &p_x);
            inv_acc_local = montgomery_product(&inv_acc_local, &dx_k);
        }
    }

    // Write-out UNPAIRED entries. Each unpaired slot copies its source
    // scalar point (with sign flip) to the output. Threads partition
    // the pair_list raw slots round-robin to avoid contention. Bound
    // = MAX_PAIRS / TPB.
    for (var off: u32 = 0u; off < MAX_PAIRS; off = off + 1u) {
        let i = tid + off * TPB;
        if (i >= total_outputs) { break; }
        let idx_b = pair_list_idx_b[i];
        if (idx_b != 0xffffffffu) { continue; } // skip PAIRs (already written)
        let idx_a = pair_list_idx_a[i];
        var p_x: BigInt; var p_y: BigInt;
        load_point(idx_a, &p_x, &p_y);
        output_bucket_id[out_base + i] = pair_list_bucket[i];
        output_x[out_base + i] = p_x;
        output_y[out_base + i] = p_y;
    }

    {{{ recompile }}}
}
