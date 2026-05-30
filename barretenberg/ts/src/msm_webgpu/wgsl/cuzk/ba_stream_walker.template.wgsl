{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

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

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       sorted_count_list:  array<u32>;
@group(0) @binding(2) var<storage, read>       offsets:            array<u32>;
@group(0) @binding(3) var<storage, read>       task_cuts:          array<u32>;
@group(0) @binding(4) var<storage, read>       l0_index:           array<u32>;
@group(0) @binding(5) var<storage, read>       point_x:            array<vec4<u32>>;
@group(0) @binding(6) var<storage, read>       point_y:            array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> bucket_sums:        array<vec4<u32>>;
@group(0) @binding(8) var<storage, read_write> partials_buf:       array<vec4<u32>>;
@group(0) @binding(9) var<storage, read_write> partial_dest:       array<u32>;
@group(0) @binding(10) var<uniform>            params:             vec4<u32>;

// KNOB 1: workgroup-shared prefix scratch. Each thread uses its own
// [local_id*S .. local_id*S + S) region (2 vec4 per slot), so there is no
// cross-thread aliasing and no barrier is needed. 16 KB at TPB=64.
var<workgroup> pref_scratch: array<vec4<u32>, TPB * S * 2u>;

fn load_pt_x(cursor: u32) -> array<u32, 8> {
    let packed = l0_index[cursor];
    let pt = packed & L0_IDX_MASK;
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_pt_y(cursor: u32) -> array<u32, 8> {
    let packed = l0_index[cursor];
    let pt = packed & L0_IDX_MASK;
    let q0 = point_y[2u * pt];
    let q1 = point_y[2u * pt + 1u];
    let y = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) { return y; }
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return fr_sub_f8(zero, y);
}

// Packed-value loaders: the caller reads l0_index[cursor] once and caches the
// packed handle, so the dependent l0_index indirection is not re-issued when
// the same point is touched by the inverse pass and the backward peel. point_x
// is re-read from the cached handle in those passes (a cache hit after the
// forward gather, with the point index already resolved), and point_y is
// gathered once in the backward peel. Caching only the 4-byte handle — not the
// 32-byte x-coordinate — removes the redundant dependent gather without adding
// per-thread private state that would compete with kernel occupancy (#23726).
fn pt_x_from_packed(packed: u32) -> array<u32, 8> {
    let pt = packed & L0_IDX_MASK;
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn pt_y_from_packed(packed: u32) -> array<u32, 8> {
    let pt = packed & L0_IDX_MASK;
    let q0 = point_y[2u * pt];
    let q1 = point_y[2u * pt + 1u];
    let y = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) { return y; }
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return fr_sub_f8(zero, y);
}

fn store_pref(base: u32, val: array<u32, 8>) {
    pref_scratch[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    pref_scratch[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn load_pref(base: u32) -> array<u32, 8> {
    let q0 = pref_scratch[base + 0u];
    let q1 = pref_scratch[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_bucket_sum(bucket_id: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * bucket_id;
    bucket_sums[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    bucket_sums[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * bucket_id;
    bucket_sums[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    bucket_sums[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_partial(pslot: u32, bucket_id: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * pslot;
    partials_buf[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    partials_buf[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * pslot;
    partials_buf[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    partials_buf[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
    partial_dest[pslot] = bucket_id;
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

    let pref_base = l * S * 2u;
    let cut_base = t * CUTS * 2u;

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
    var cur_bucket:     array<u32, {{ s }}>;   // bucket id (for bucket_sums)
    var is_first:       array<u32, {{ s }}>;
    var slot_done:      array<u32, {{ s }}>;
    var split_start:    array<u32, {{ s }}>;   // current bucket shared with a prior task
    var acc_x:          array<array<u32, 8>, {{ s }}>;
    var acc_y:          array<array<u32, 8>, {{ s }}>;
    // Cached per-slot packed handles for the current iteration (KNOB 3 — load
    // reuse). l0a/l0b hold the packed l0_index handles of this iteration's
    // left/right points, read once in the forward pass and reused by the
    // inverse pass and the backward peel so the dependent l0_index gather is
    // issued once per point instead of 3-4 times. Only the 4-byte handle is
    // cached (8 bytes/slot); the x-coordinate is re-read from the handle (a
    // cache hit) rather than held in private memory, so this adds negligible
    // per-thread state and does not erode the occupancy that limits the kernel.
    // Compiled out in the pre-reuse baseline (reuse_loads off) so that variant
    // carries zero extra per-thread state.
{{#reuse_loads}}
    var l0a:            array<u32, {{ s }}>;
    var l0b:            array<u32, {{ s }}>;
{{/reuse_loads}}

    // Initialise slots from precomputed task cuts (KNOB 2).
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        partial_dest[2u * (t * S + k) + 0u] = NO_BUCKET;
        partial_dest[2u * (t * S + k) + 1u] = NO_BUCKET;

        let sb = task_cuts[cut_base + k * 2u + 0u];
        let so = task_cuts[cut_base + k * 2u + 1u];
        let eb = task_cuts[cut_base + (k + 1u) * 2u + 0u];
        let eo = task_cuts[cut_base + (k + 1u) * 2u + 1u];

        let sb_id = sorted_bucket_list[sb];
        let sb_base = offsets[sb_id];
        let sb_count = sorted_count_list[sb];

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
            split_start[k] = 0u;
        } else if (so + 1u < sb_count) {
            start_cursor = sb_base + so + 1u;
            split_start[k] = 1u;
        } else {
            eff_sorted = sb + 1u;
            eff_id = sorted_bucket_list[eff_sorted];
            eff_base = offsets[eff_id];
            eff_count = sorted_count_list[eff_sorted];
            start_cursor = eff_base;
            split_start[k] = 0u;
        }

        // Task end. eo>0 → last bucket is eb, ending past point eo. eo==0 →
        // the task stops at the end of bucket eb-1 (it does not touch eb).
        var te_sort: u32;
        var te_cur: u32;
        if (eo > 0u) {
            te_sort = eb;
            te_cur = offsets[sorted_bucket_list[eb]] + eo + 1u;
        } else if (eb > 0u) {
            te_sort = eb - 1u;
            let pid = sorted_bucket_list[te_sort];
            te_cur = offsets[pid] + sorted_count_list[te_sort];
        } else {
            te_sort = 0u;
            te_cur = 0u;
        }

        cursor[k] = start_cursor;
        bucket_end[k] = eff_base + eff_count;
        task_end_sort[k] = te_sort;
        task_end_cur[k] = te_cur;
        cur_sorted[k] = eff_sorted;
        cur_bucket[k] = eff_id;
        is_first[k] = 1u;
        slot_done[k] = 0u;

        // Empty task (region-aware): the start is at or past the task end.
        if (eff_sorted > te_sort || (eff_sorted == te_sort && start_cursor >= te_cur)) {
            slot_done[k] = 1u;
            continue;
        }

        // Single-point leading segment. The is_first step consumes two points,
        // so a piece with one point before its first boundary can't go through
        // it. Dense buckets have count>=2, so this only arises for a split
        // continuation landing on a bucket's last point.
        var seg_end = bucket_end[k];
        if (eff_sorted == te_sort) { seg_end = te_cur; }
        if (split_start[k] == 1u && seg_end - start_cursor == 1u) {
            let px = load_pt_x(start_cursor);
            let py = load_pt_y(start_cursor);
            if (eff_sorted == te_sort) {
                store_partial(2u * (t * S + k) + 1u, eff_id, M_partials, px, py);
                slot_done[k] = 1u;
            } else {
                store_partial(2u * (t * S + k) + 0u, eff_id, M_partials, px, py);
                let nxt = eff_sorted + 1u;
                let nxt_id = sorted_bucket_list[nxt];
                let nxt_base = offsets[nxt_id];
                cur_sorted[k] = nxt;
                cur_bucket[k] = nxt_id;
                bucket_end[k] = nxt_base + sorted_count_list[nxt];
                cursor[k] = nxt_base;
                split_start[k] = 0u;
                if (nxt > te_sort) { slot_done[k] = 1u; }
            }
        }
    }

    loop {
        var any_active: bool = false;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            if (slot_done[k] == 0u) { any_active = true; }
        }
        if (!any_active) { break; }

        // Forward prefix of dx across the S slots (idle slots use the pad
        // trio so the product stays invertible), exactly as ba_stream_accum.
        var acc: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
{{#reuse_loads}}
            if (slot_done[k] == 1u) {
                l0a[k] = l0_index[IDLE_ANCHOR];
                l0b[k] = l0_index[IDLE_ANCHOR + 1u];
                p_lx = pt_x_from_packed(l0a[k]);
                p_rx = pt_x_from_packed(l0b[k]);
            } else if (is_first[k] == 1u) {
                l0a[k] = l0_index[cursor[k]];
                l0b[k] = l0_index[cursor[k] + 1u];
                p_lx = pt_x_from_packed(l0a[k]);
                p_rx = pt_x_from_packed(l0b[k]);
            } else {
                p_lx = acc_x[k];
                l0b[k] = l0_index[cursor[k]];
                p_rx = pt_x_from_packed(l0b[k]);
            }
{{/reuse_loads}}
{{^reuse_loads}}
            if (slot_done[k] == 1u) {
                p_lx = load_pt_x(IDLE_ANCHOR);
                p_rx = load_pt_x(IDLE_ANCHOR + 1u);
            } else if (is_first[k] == 1u) {
                p_lx = load_pt_x(cursor[k]);
                p_rx = load_pt_x(cursor[k] + 1u);
            } else {
                p_lx = acc_x[k];
                p_rx = load_pt_x(cursor[k]);
            }
{{/reuse_loads}}
            let dx = fr_sub_f8(p_rx, p_lx);
            if (k == 0u) { acc = dx; } else { acc = montgomery_product_f8(acc, dx); }
            store_pref(pref_base + k * 2u, acc);
        }

        var acc20 = unpack256_to_limbs(acc);
        var inv20 = {{ inv_fn }}(acc20);
        var inv = pack_limbs_to_256(&inv20);

{{#fuse_peel}}
        // Fused inverse + backward peel (reuse-only path). One backward walk
        // derives inv_dx[k] = inv * prefix[k-1] and consumes it immediately for
        // the affine add, so each slot's point_x is gathered ONCE here instead
        // of once in a separate inverse pass and again in the peel — the
        // redundant middle gather pass is gone (point_x: 3 reads → 2). inv_dx is
        // used in registers, so the per-slot scratch round-trip (store inv_dx /
        // load inv_dx) also disappears. No new per-thread private state, so this
        // stays inside the register budget that the x-coord cache broke.
        // Idle pad slots still peel their dx from the running `inv` (so the
        // batched inverse stays correct) but produce no output.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;

            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = load_pref(pref_base + (k - 1u) * 2u);
                inv_dx = montgomery_product_f8(inv, pp);
            }

            if (slot_done[k] == 1u) {
                if (k != 0u) {
                    let pad_lx = pt_x_from_packed(l0a[k]);
                    let pad_rx = pt_x_from_packed(l0b[k]);
                    inv = montgomery_product_f8(inv, fr_sub_f8(pad_rx, pad_lx));
                }
                continue;
            }

            var p_lx: array<u32, 8>;
            var p_ly: array<u32, 8>;
            var p_rx: array<u32, 8>;
            var p_ry: array<u32, 8>;
            if (is_first[k] == 1u) {
                p_lx = pt_x_from_packed(l0a[k]);
                p_ly = pt_y_from_packed(l0a[k]);
                p_rx = pt_x_from_packed(l0b[k]);
                p_ry = pt_y_from_packed(l0b[k]);
                cursor[k] += 2u;
            } else {
                p_lx = acc_x[k];
                p_ly = acc_y[k];
                p_rx = pt_x_from_packed(l0b[k]);
                p_ry = pt_y_from_packed(l0b[k]);
                cursor[k] += 1u;
            }

            // Peel this slot's dx from the running inverse (prefix[-1] = 1, so
            // k==0 has no further slot to expose and skips the multiply).
            if (k != 0u) {
                inv = montgomery_product_f8(inv, fr_sub_f8(p_rx, p_lx));
            }

            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(p_lx, p_rx);
            r_x = fr_sub_f8(r_x, x_sum);
            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            let task_done = (cur_sorted[k] == task_end_sort[k]) && (cursor[k] >= task_end_cur[k]);
            let bucket_done = cursor[k] >= bucket_end[k];

            if (task_done) {
                let is_partial = (split_start[k] == 1u) || (cursor[k] < bucket_end[k]);
                if (is_partial) {
                    store_partial(2u * (t * S + k) + 1u, cur_bucket[k], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(cur_bucket[k], M_buckets, r_x, r_y);
                }
                slot_done[k] = 1u;
            } else if (bucket_done) {
                if (split_start[k] == 1u) {
                    store_partial(2u * (t * S + k) + 0u, cur_bucket[k], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(cur_bucket[k], M_buckets, r_x, r_y);
                }
                let nxt = cur_sorted[k] + 1u;
                let nxt_id = sorted_bucket_list[nxt];
                let nxt_base = offsets[nxt_id];
                cur_sorted[k] = nxt;
                cur_bucket[k] = nxt_id;
                bucket_end[k] = nxt_base + sorted_count_list[nxt];
                cursor[k] = nxt_base;
                is_first[k] = 1u;
                split_start[k] = 0u;
            } else {
                acc_x[k] = r_x;
                acc_y[k] = r_y;
                is_first[k] = 0u;
            }
        }
{{/fuse_peel}}
{{^fuse_peel}}
        // Inverse pass: derive per-slot 1/dx.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = load_pref(pref_base + (k - 1u) * 2u);
                inv_dx = montgomery_product_f8(inv, pp);
{{#reuse_loads}}
                // Rebuild dx from the cached packed handles. point_x is re-read
                // (a cache hit after the forward gather, with the point index
                // already resolved), but the l0_index indirection is not. A
                // mid-bucket left operand is the running accumulator, matching
                // the forward pass exactly.
                var p_lx_b: array<u32, 8>;
                if (is_first[k] == 1u || slot_done[k] == 1u) {
                    p_lx_b = pt_x_from_packed(l0a[k]);
                } else {
                    p_lx_b = acc_x[k];
                }
                let dx_b = fr_sub_f8(pt_x_from_packed(l0b[k]), p_lx_b);
                inv = montgomery_product_f8(inv, dx_b);
{{/reuse_loads}}
{{^reuse_loads}}
                var p_lx_b: array<u32, 8>;
                var p_rx_b: array<u32, 8>;
                if (slot_done[k] == 1u) {
                    p_lx_b = load_pt_x(IDLE_ANCHOR);
                    p_rx_b = load_pt_x(IDLE_ANCHOR + 1u);
                } else if (is_first[k] == 1u) {
                    p_lx_b = load_pt_x(cursor[k]);
                    p_rx_b = load_pt_x(cursor[k] + 1u);
                } else {
                    p_lx_b = acc_x[k];
                    p_rx_b = load_pt_x(cursor[k]);
                }
                let dx_b = fr_sub_f8(p_rx_b, p_lx_b);
                inv = montgomery_product_f8(inv, dx_b);
{{/reuse_loads}}
            }
            store_pref(pref_base + k * 2u, inv_dx);
        }

        // Backward peel: affine add, then retire / advance.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;
            if (slot_done[k] == 1u) { continue; }

            var p_lx: array<u32, 8>;
            var p_ly: array<u32, 8>;
            var p_rx: array<u32, 8>;
            var p_ry: array<u32, 8>;
{{#reuse_loads}}
            if (is_first[k] == 1u) {
                // Re-read x and gather y from the cached packed handles; the
                // l0_index indirection was already resolved in the forward pass.
                p_lx = pt_x_from_packed(l0a[k]);
                p_ly = pt_y_from_packed(l0a[k]);
                p_rx = pt_x_from_packed(l0b[k]);
                p_ry = pt_y_from_packed(l0b[k]);
                cursor[k] += 2u;
            } else {
                p_lx = acc_x[k];
                p_ly = acc_y[k];
                p_rx = pt_x_from_packed(l0b[k]);
                p_ry = pt_y_from_packed(l0b[k]);
                cursor[k] += 1u;
            }
{{/reuse_loads}}
{{^reuse_loads}}
            if (is_first[k] == 1u) {
                p_lx = load_pt_x(cursor[k]);
                p_ly = load_pt_y(cursor[k]);
                p_rx = load_pt_x(cursor[k] + 1u);
                p_ry = load_pt_y(cursor[k] + 1u);
                cursor[k] += 2u;
            } else {
                p_lx = acc_x[k];
                p_ly = acc_y[k];
                p_rx = load_pt_x(cursor[k]);
                p_ry = load_pt_y(cursor[k]);
                cursor[k] += 1u;
            }
{{/reuse_loads}}

            let inv_dx = load_pref(pref_base + k * 2u);
            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(p_lx, p_rx);
            r_x = fr_sub_f8(r_x, x_sum);
            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            // Task end is region-aware: only the task's designated last bucket
            // can trigger it (cursor is meaningful only within the current
            // bucket's l0 region).
            let task_done = (cur_sorted[k] == task_end_sort[k]) && (cursor[k] >= task_end_cur[k]);
            let bucket_done = cursor[k] >= bucket_end[k];

            if (task_done) {
                let is_partial = (split_start[k] == 1u) || (cursor[k] < bucket_end[k]);
                if (is_partial) {
                    store_partial(2u * (t * S + k) + 1u, cur_bucket[k], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(cur_bucket[k], M_buckets, r_x, r_y);
                }
                slot_done[k] = 1u;
            } else if (bucket_done) {
                if (split_start[k] == 1u) {
                    store_partial(2u * (t * S + k) + 0u, cur_bucket[k], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(cur_bucket[k], M_buckets, r_x, r_y);
                }
                // Advance to the next bucket within the task. Subsequent
                // buckets always begin fresh (never split-start).
                let nxt = cur_sorted[k] + 1u;
                let nxt_id = sorted_bucket_list[nxt];
                let nxt_base = offsets[nxt_id];
                cur_sorted[k] = nxt;
                cur_bucket[k] = nxt_id;
                bucket_end[k] = nxt_base + sorted_count_list[nxt];
                cursor[k] = nxt_base;
                is_first[k] = 1u;
                split_start[k] = 0u;
            } else {
                acc_x[k] = r_x;
                acc_y[k] = r_y;
                is_first[k] = 0u;
            }
        }
{{/fuse_peel}}
    }

    {{{ recompile }}}
}
