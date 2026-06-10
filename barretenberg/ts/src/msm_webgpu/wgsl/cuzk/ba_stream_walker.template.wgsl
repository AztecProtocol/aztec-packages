{{> inverse_funcs }}

{{> field8_funcs }}

// Per-thread bucket-monotonic stream-walker (replaces ba_stream_accum's
// queue model). Each of NUM_THREADS threads owns a contiguous slice of the
// sorted bucket stream (from thread_cuts), splits it into S equal-work
// tasks, and runs S pair-pointer slots through one field inversion per S
// adds — the same batched-inversion inner loop as ba_stream_accum.
//
// DESIGN-KNOB VARIATION (thread C):
//   KNOB 1: pref_scratch lives in var<workgroup> (16 KB at TPB=64), not a
//           device storage buffer; accumulators live in private registers.
//           No cross-thread sharing, so no workgroup barrier in the loop.
//   KNOB 2: task cut points are precomputed by ba_planner_partition_task and
//           read from `task_cuts`; the walker does no binary search at init.
//
// Retirement: a bucket fully consumed within one task retires to
// bucket_sums; a bucket spanning a task/thread boundary retires its piece to
// partials_buf at a deterministic slot and records its bucket id in
// partial_dest. A thread's slot k owns partial slots 2*(t*S+k)+{0,1}
// (split-start completion, task-end). The host sums partials per bucket.
//
// params.x = NUM_THREADS
// params.y = IDLE_ANCHOR (index into l0_index for the non-zero-dx pad trio)
// params.z = M_buckets  (bucket_sums plane stride = B_TOTAL)
// params.w = M_partials (partials_buf plane stride = 2 * NUM_THREADS * S)

const S: u32 = {{ s }}u;
const CUTS: u32 = S + 1u;
const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;
const NO_BUCKET: u32 = 0xffffffffu;
// M_RED (red_buf Y-plane stride = total red slots) is a runtime uniform in
// batch_offset.z, not a baked const: a concatenated multi-MSM pass sizes red_buf
// to Σ redM, while a single MSM passes its own redM (byte-identical to the old
// baked M_RED). reduce_level_bench already takes its M from cparams.x.
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
// arena_a0: the WHOLE colour-A0 arena (a monolithic block, ARENA_LAYOUT.md). Two
// of the walker's read-only buffers — sorted_count_list and l0_index — are
// sub-ranges of it, addressed via the u32 element offsets in `arena_off` (.x, .y).
// Binding the monolith once (instead of two sub-ranges) frees the storage-binding
// slot that lets `window_desc` be a storage buffer (no fixed-size uniform ⇒ no
// window cap). Memory is unchanged — same arena.
@group(0) @binding(1) var<storage, read>       arena_a0:           array<u32>;
// l0_base[i] = off_at(flat_bid(sorted_bucket_list[i])), precomputed by
// ba_planner_resolve_l0base. A DEDICATED buffer (reusing the slot the now-removed
// `offsets`/`flat_bid` gather freed) — NOT a sub-range of arena_a0, so the walker's
// hot loop reads it directly without adding a third widely-separated A0 region.
@group(0) @binding(2) var<storage, read>       l0_base:            array<u32>;
@group(0) @binding(3) var<storage, read>       task_cuts:          array<u32>;
@group(0) @binding(4) var<storage, read>       point_x:            array<vec4<u32>>;
@group(0) @binding(5) var<storage, read>       point_y:            array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> red_buf:            array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> partials_buf:       array<vec4<u32>>;
// partial_dest is atomic so a residency probe can overlay two counters on its
// tail (slots M_partials, M_partials+1) WITHOUT an 11th storage binding (Apple
// caps maxStorageBuffersPerShaderStage at 10, and the walker already uses 10).
// The probe's read-modify-write atomics run ONLY during the throwaway calibration
// dispatch (arena_off.z == 1); real runs use plain atomicStore writes only, which
// are byte-identical to the non-atomic buffer and never perturb the combine.
@group(0) @binding(8) var<storage, read_write> partial_dest:       array<atomic<u32>>;
// WindowDesc as a STORAGE array<u32> (full stride-8 rows): work_off = +3,
// reduce_off = +4. Storage (not a fixed uniform) ⇒ the global window count is
// unbounded. The A0-monolith bind above freed the slot for this.
@group(0) @binding(9) var<storage, read>       window_desc:        array<u32>;
@group(0) @binding(10) var<uniform>            params:             vec4<u32>;
// batch_offset.x = bi * batchWindows — added to local window index when
// computing red_slot so each batch's red_buf writes land in its globally
// correct window range. red_buf is no longer cleared per batch (only once
// per encode) so batches accumulate side-by-side.
@group(0) @binding(11) var<uniform>            batch_offset:       vec4<u32>;
// arena_off: u32 element offsets of the walker's A0 sub-ranges within arena_a0
// — .x = sorted_count_list, .y = l0_index.
@group(0) @binding(12) var<uniform>            arena_off:          vec4<u32>;
const WD_STRIDE: u32 = 8u;
fn wd_work_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 3u]; }
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 4u]; }
{{^l0prec}}
// l0_base v2 OFF (?l0_precompute=0): binding 2 is the raw `offsets` CSR, and the
// walker re-derives each bucket's l0 base inline via the dependent gather
// sorted_bucket_list[i] -> flat_bid -> offsets[.] (the pre-precompute v1 path).
fn off_at(i: u32) -> u32 { return l0_base[i]; }
fn flat_bid(bid: u32) -> u32 {
    let gwin = (bid >> WBID_SHIFT) + batch_offset.x;
    return wd_work_off(gwin) - wd_work_off(batch_offset.x) + (bid & WBID_MAG_MASK);
}
{{/l0prec}}
fn sc_at(i: u32) -> u32 { return arena_a0[arena_off.x + i]; }   // sorted_count_list[i]
fn l0_at(i: u32) -> u32 { return arena_a0[arena_off.y + i]; }   // l0_index[i]
// is_present marking is hoisted into combine_filter; stream_walker stays
// within the 10-storage-buffer cap. combine_filter sees every bucket with
// count >= 1, including those stream_walker whole-retired.
// pref_scratch lives in the TAIL of partials_buf at PREF_OFFSET (= 4 *
// M_partials vec4 units, the strictly disjoint tail of the partials
// region). COALESCED layout: slot k vec4 j (j ∈ {0,1}) for thread t lives
// at PREF_OFFSET + k * (2 * NUM_THREADS) + t * 2 + j.
// Adjacent threads (t, t+1) at same slot k write addresses 32 bytes apart
// → same 64-byte cache line. A SIMD group of 32 threads writing one slot
// touches just 2-4 cache lines (vs 32 lines in the naive per-thread-stride
// layout), letting the GPU coalesce the writes into a single transaction.


fn load_pt_x(cursor: u32) -> array<u32, 8> {
    let packed = l0_at(cursor);
    let pt = packed & L0_IDX_MASK;
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_pt_y(cursor: u32) -> array<u32, 8> {
    let packed = l0_at(cursor);
    let pt = packed & L0_IDX_MASK;
    let q0 = point_y[2u * pt];
    let q1 = point_y[2u * pt + 1u];
    let y = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) { return y; }
    // Pool y is a curve point's coordinate (y ≢ 0 mod p, < 2p), so the
    // unconditional 2p - y stays in (0, 2p).
    return fr_neg_wide_f8(y);
}

fn store_pref(k: u32, t: u32, pref_off: u32, k_stride: u32, val: array<u32, 8>) {
    let base = pref_off + k * k_stride + t * 2u;
    partials_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    partials_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn load_pref(k: u32, t: u32, pref_off: u32, k_stride: u32) -> array<u32, 8> {
    let base = pref_off + k * k_stride + t * 2u;
    let q0 = partials_buf[base + 0u];
    let q1 = partials_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_bucket_sum(bucket_id: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    // Magnitude is guaranteed in [1, STRIDE] — ba_planner_classify filters
    // out invalid bids before they reach sorted_bucket_list (the only source
    // stream_walker reads bucket_ids from).
    // Global window index = (batch-local window) + batch_offset (= bi * batchWindows).
    let window = bucket_id >> WBID_SHIFT;
    let mag = bucket_id & WBID_MAG_MASK;
    let red_slot = wd_reduce_off(window + batch_offset.x) + (mag - 1u);
    let bx = PG * red_slot;
    red_buf[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    red_buf[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * batch_offset.z + PG * red_slot;
    red_buf[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    red_buf[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_partial(pslot: u32, bucket_id: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * pslot;
    partials_buf[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    partials_buf[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * pslot;
    partials_buf[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    partials_buf[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
    atomicStore(&partial_dest[pslot], bucket_id);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let t = gid.x;
    let l = lid.x;
    let NUM_THREADS = params.x;
    let IDLE_ANCHOR = params.y;
    let M_buckets = params.z;
    let M_partials = params.w;

    if (t >= NUM_THREADS) { return; }

    // RESIDENCY PROBE (calibration only, arena_off.z == 1): thread 0 marks this
    // workgroup resident and records the peak concurrent count R = the device's
    // resident-wave capacity for this kernel. Gated so the RMW atomics run only on
    // the throwaway calibration dispatch — a real run (flag 0) does no RMW here, so
    // its partial stores are byte-identical to the plain-buffer path. R is read off
    // a single calibration run whose MSM output is discarded.
    if (arena_off.z == 1u && l == 0u) {
        let nlive = atomicAdd(&partial_dest[M_partials], 1u) + 1u;
        atomicMax(&partial_dest[M_partials + 1u], nlive);
    }

    let cut_base = t * CUTS * 2u;
    // Coalesced pref_scratch addressing:
    //   pref_off = 4 * M_partials (start of pref region in partials_buf)
    //   k_stride = 2 * NUM_THREADS (per-slot stride; adjacent threads share cache line)
    let pref_off = 4u * M_partials;
    let k_stride = 2u * NUM_THREADS;

    // Per-slot state (private). acc lives in registers (plan §7.1). The task
    // end is tracked as (sorted index, l0 cursor within that bucket) — NOT a
    // bare l0 cursor — because l0 positions are not monotonic across sorted
    // buckets, so a raw cursor>=task_end test would be meaningless once a
    // multi-bucket task walks into a bucket whose l0 region precedes the end.
    var cursor:         array<u32, {{ s }}>;   // l0_index point position
    var bucket_end:     array<u32, {{ s }}>;   // l0 position past current bucket
    var task_end_sort:  array<u32, {{ s }}>;   // sorted index of the task's last bucket
    var task_end_cur:   array<u32, {{ s }}>;   // l0 position past the task within that bucket
    var cur_sorted:     array<u32, {{ s }}>;   // index into sorted_bucket_list
    var is_first_m: u32 = 0u;
    var slot_done_m: u32 = 0u;
    var split_start_m: u32 = 0u;
    var acc_x:          array<array<u32, 8>, {{ s }}>;
    var acc_y:          array<array<u32, 8>, {{ s }}>;

    // Initialise slots from precomputed task cuts (KNOB 2).
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        atomicStore(&partial_dest[2u * (t * S + k) + 0u], NO_BUCKET);
        atomicStore(&partial_dest[2u * (t * S + k) + 1u], NO_BUCKET);

        let sb = task_cuts[cut_base + k * 2u + 0u];
        let so = task_cuts[cut_base + k * 2u + 1u];
        let eb = task_cuts[cut_base + (k + 1u) * 2u + 0u];
        let eo = task_cuts[cut_base + (k + 1u) * 2u + 1u];

        let sb_id = sorted_bucket_list[sb];
        let sb_base = {{#l0prec}}l0_base[sb]{{/l0prec}}{{^l0prec}}off_at(flat_bid(sb_id)){{/l0prec}};
        let sb_count = sc_at(sb);

        // Start cursor. so==0 → fresh at the bucket's first point. so in
        // (0,count-1) → continuation beginning at point so+1. so==count-1 →
        // bucket sb is wholly the prior piece's, so this begins fresh at the
        // next bucket.
        var eff_sorted = sb;
        var eff_id = sb_id;
        var eff_base = sb_base;
        var eff_count = sb_count;
        var start_cursor: u32;
        if (so == 0u) {
            start_cursor = sb_base;
            split_start_m = split_start_m & ~(1u << k);
        } else if (so + 1u < sb_count) {
            start_cursor = sb_base + so + 1u;
            split_start_m = split_start_m | (1u << k);
        } else {
            eff_sorted = sb + 1u;
            eff_id = sorted_bucket_list[eff_sorted];
            eff_base = {{#l0prec}}l0_base[eff_sorted]{{/l0prec}}{{^l0prec}}off_at(flat_bid(eff_id)){{/l0prec}};
            eff_count = sc_at(eff_sorted);
            start_cursor = eff_base;
            split_start_m = split_start_m & ~(1u << k);
        }

        // Task end. eo>0 → last bucket is eb, ending past point eo. eo==0 →
        // the task stops at the end of bucket eb-1 (it does not touch eb).
        var te_sort: u32;
        var te_cur: u32;
        if (eo > 0u) {
            te_sort = eb;
            te_cur = {{#l0prec}}l0_base[eb]{{/l0prec}}{{^l0prec}}off_at(flat_bid(sorted_bucket_list[eb])){{/l0prec}} + eo + 1u;
        } else if (eb > 0u) {
            te_sort = eb - 1u;
            te_cur = {{#l0prec}}l0_base[te_sort]{{/l0prec}}{{^l0prec}}off_at(flat_bid(sorted_bucket_list[te_sort])){{/l0prec}} + sc_at(te_sort);
        } else {
            te_sort = 0u;
            te_cur = 0u;
        }

        cursor[k] = start_cursor;
        bucket_end[k] = eff_base + eff_count;
        task_end_sort[k] = te_sort;
        task_end_cur[k] = te_cur;
        cur_sorted[k] = eff_sorted;

        is_first_m = is_first_m | (1u << k);
        slot_done_m = slot_done_m & ~(1u << k);

        // Empty task (region-aware): the start is at or past the task end.
        if (eff_sorted > te_sort || (eff_sorted == te_sort && start_cursor >= te_cur)) {
            slot_done_m = slot_done_m | (1u << k);
            continue;
        }

        // Single-point leading segment. The is_first step consumes two points,
        // so a piece with one point before its first boundary can't go through
        // it. Dense buckets have count>=2, so this only arises for a split
        // continuation landing on a bucket's last point.
        var seg_end = bucket_end[k];
        if (eff_sorted == te_sort) { seg_end = te_cur; }
        if ((((split_start_m >> k) & 1u) == 1u) && seg_end - start_cursor == 1u) {
            let px = load_pt_x(start_cursor);
            let py = load_pt_y(start_cursor);
            if (eff_sorted == te_sort) {
                store_partial(2u * (t * S + k) + 1u, eff_id, M_partials, px, py);
                slot_done_m = slot_done_m | (1u << k);
            } else {
                store_partial(2u * (t * S + k) + 0u, eff_id, M_partials, px, py);
                let nxt = eff_sorted + 1u;
                let nxt_base = {{#l0prec}}l0_base[nxt]{{/l0prec}}{{^l0prec}}off_at(flat_bid(sorted_bucket_list[nxt])){{/l0prec}};
                cur_sorted[k] = nxt;

                bucket_end[k] = nxt_base + sc_at(nxt);
                cursor[k] = nxt_base;
                split_start_m = split_start_m & ~(1u << k);
                if (nxt > te_sort) { slot_done_m = slot_done_m | (1u << k); }
            }
        }
    }

    // Defensive iteration cap. The legitimate max per-slot iteration count
    // is bounded by the task's total adds, which at logn<=25 stays well
    // under a few thousand. 32768 gives a large safety margin while
    // guaranteeing the dispatch terminates if any upstream corruption (stale
    // task_cuts, wraparound in partition_task arithmetic, etc.) drives
    // cur_sorted past task_end_sort so task_done can never fire. Without
    // this, a corrupted task descriptor can hang the GPU indefinitely.
    const MAX_WALKER_ITERS: u32 = 32768u;
    var walker_iter: u32 = 0u;
    loop {
        if (walker_iter >= MAX_WALKER_ITERS) { break; }
        walker_iter = walker_iter + 1u;
        var any_active: bool = false;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            if ((((slot_done_m >> k) & 1u) == 0u)) { any_active = true; }
        }
        if (!any_active) { break; }

        // Forward prefix of dx across the S slots (idle slots use the pad
        // trio so the product stays invertible), exactly as ba_stream_accum.
        var acc: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            let sd_b = (slot_done_m >> k) & 1u;
            let isf_b = (is_first_m >> k) & 1u;
            let rx_addr = select(select(cursor[k], cursor[k] + 1u, isf_b == 1u), IDLE_ANCHOR + 1u, sd_b == 1u);
            p_rx = load_pt_x(rx_addr);
            if (sd_b == 1u || isf_b == 1u) {
                p_lx = load_pt_x(select(cursor[k], IDLE_ANCHOR, sd_b == 1u));
            } else {
                p_lx = acc_x[k];
            }
            // Wide (< 4p: both coords < 2p): dx feeds only the prefix
            // montmuls, and pref_scratch's sole consumer is montmul. The
            // inverse canonicalizes its own input.
            let dx = fr_sub_wide_f8(p_rx, p_lx);
            if (k == 0u) { acc = dx; } else { acc = montgomery_product_f8(acc, dx); }
            // OPTIMIZATION (c): the final prefix (k = S-1) is consumed only
            // by the inverter below, in-register. Skip its store_pref.
            if (k + 1u < S) {
                store_pref(k, t, pref_off, k_stride, acc);
            }
        }

        // pk14 packed-native inverse: takes/returns the 8x u32 form directly
        // (Montgomery form via the e0=R^2 seed) -- no unpack/pack round-trip.
        var inv = {{ inv_fn }}(acc);

        // OPTIMIZATION (c): fused inverse pass + backward peel.
        // Original had two separate descending loops:
        //   (1) compute inv_dx[k], store to pref_scratch
        //   (2) reload inv_dx[k], do affine add
        // Fused: compute inv_dx[k] in register, immediately use it for the
        // affine add. Eliminates 8 stores + 8 loads of pref_scratch per
        // outer iter (the largest device-storage savings available).
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;

            // X-coord loads (needed for both inv update and affine add).
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            let sd_b = (slot_done_m >> k) & 1u;
            let isf_b = (is_first_m >> k) & 1u;
            let rx_addr = select(select(cursor[k], cursor[k] + 1u, isf_b == 1u), IDLE_ANCHOR + 1u, sd_b == 1u);
            p_rx = load_pt_x(rx_addr);
            if (sd_b == 1u || isf_b == 1u) {
                p_lx = load_pt_x(select(cursor[k], IDLE_ANCHOR, sd_b == 1u));
            } else {
                p_lx = acc_x[k];
            }

            // Lever V1: compute x_sum = p_lx + p_rx immediately, so p_rx's
            // live range ends here (before the inv-update mul, the inversion-
            // derived inv_dx mul, the Y-loads, and the lambda/r_x chain). This
            // removes one 256-bit value (8 regs) from the peak-pressure affine
            // window. dx_b for the inv chain is also derived here from the same
            // two operands, so p_rx is fully dead afterwards.
            let x_sum = fr_add_f8(p_lx, p_rx);

            // Derive inv_dx[k] in register, update running inv for next iter.
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = load_pref(k - 1u, t, pref_off, k_stride);
                inv_dx = montgomery_product_f8(inv, pp);
                // Wide (< 4p): feeds the running-inverse montmul only.
                let dx_b = fr_sub_wide_f8(p_rx, p_lx);
                inv = montgomery_product_f8(inv, dx_b);
            }

            // Idle slots exist only to feed dx_k into the inv chain. Skip
            // the affine add.
            if ((((slot_done_m >> k) & 1u) == 1u)) { continue; }

            // Y-coord loads + cursor advance.
            var p_ly: array<u32, 8>;
            var p_ry: array<u32, 8>;
            let ry_addr = select(cursor[k], cursor[k] + 1u, isf_b == 1u);
            p_ry = load_pt_y(ry_addr);
            if (isf_b == 1u) {
                p_ly = load_pt_y(cursor[k]);
            } else {
                p_ly = acc_y[k];
            }
            cursor[k] = cursor[k] + select(1u, 2u, isf_b == 1u);

            // Affine add using inv_dx (in register). p_rx already consumed.
            // lambda and the pre-multiply r_y are wide (< 4p, montmul-input
            // only); r_x and the final r_y are stored coordinates and stay
            // under the [0, 2p) invariant via the reducing ops.
            var lambda = fr_sub_wide_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var r_x = montgomery_square_f8(lambda);
            r_x = fr_sub_f8(r_x, x_sum);
            var r_y = fr_sub_wide_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            // Task end is region-aware: only the task's designated last bucket
            // can trigger it (cursor is meaningful only within the current
            // bucket's l0 region).
            let task_done = (cur_sorted[k] == task_end_sort[k]) && (cursor[k] >= task_end_cur[k]);
            let bucket_done = cursor[k] >= bucket_end[k];

            if (task_done) {
                let is_partial = ((((split_start_m >> k) & 1u) == 1u)) || (cursor[k] < bucket_end[k]);
                if (is_partial) {
                    store_partial(2u * (t * S + k) + 1u, sorted_bucket_list[cur_sorted[k]], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(sorted_bucket_list[cur_sorted[k]], r_x, r_y);
                }
                slot_done_m = slot_done_m | (1u << k);
            } else if (bucket_done) {
                if ((((split_start_m >> k) & 1u) == 1u)) {
                    store_partial(2u * (t * S + k) + 0u, sorted_bucket_list[cur_sorted[k]], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(sorted_bucket_list[cur_sorted[k]], r_x, r_y);
                }
                // Advance to the next bucket within the task. Subsequent
                // buckets always begin fresh (never split-start).
                let nxt = cur_sorted[k] + 1u;
                let nxt_base = {{#l0prec}}l0_base[nxt]{{/l0prec}}{{^l0prec}}off_at(flat_bid(sorted_bucket_list[nxt])){{/l0prec}};
                cur_sorted[k] = nxt;

                bucket_end[k] = nxt_base + sc_at(nxt);
                cursor[k] = nxt_base;
                is_first_m = is_first_m | (1u << k);
                split_start_m = split_start_m & ~(1u << k);
            } else {
                acc_x[k] = r_x;
                acc_y[k] = r_y;
                is_first_m = is_first_m & ~(1u << k);
            }
        }
    }

    {{{ recompile }}}

    // RESIDENCY PROBE (calibration only): workgroup retiring — release its live
    // slot (peak already captured). Pairs the entry increment.
    if (arena_off.z == 1u && l == 0u) { atomicSub(&partial_dest[M_partials], 1u); }
}
