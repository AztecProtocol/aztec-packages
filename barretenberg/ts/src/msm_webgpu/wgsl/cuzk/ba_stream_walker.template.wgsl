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

    // Per-slot state (private). acc lives in registers (plan §7.1).
    var cursor:       array<u32, {{ s }}>;   // l0_index point position
    var bucket_end:   array<u32, {{ s }}>;   // l0 position past current bucket
    var task_end:     array<u32, {{ s }}>;   // l0 position past the task
    var cur_sorted:   array<u32, {{ s }}>;   // index into sorted_bucket_list
    var cur_bucket:   array<u32, {{ s }}>;   // bucket id (for bucket_sums)
    var is_first:     array<u32, {{ s }}>;
    var slot_done:    array<u32, {{ s }}>;
    var split_start:  array<u32, {{ s }}>;   // current bucket shared with a prior task
    var acc_x:        array<array<u32, 8>, {{ s }}>;
    var acc_y:        array<array<u32, 8>, {{ s }}>;

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

        // Point cursors. A continuation (so>0) skips the prior task's last
        // shared point: its piece is points (so+1 .. ] of bucket sb. A fresh
        // start (so==0) begins at the bucket's first point.
        var start_cursor: u32;
        if (so > 0u) {
            start_cursor = sb_base + so + 1u;
            split_start[k] = 1u;
        } else {
            start_cursor = sb_base + 0u;
            split_start[k] = 0u;
        }

        // Task end in l0 space. eo>0 → ends mid-bucket eb at point eo (piece
        // covers points [.., eo] of eb). eo==0 → ends at the start of eb,
        // i.e. just past the end of bucket eb-1; the end cut bucket is then
        // the previous sorted index with a full bucket boundary.
        var end_cursor: u32;
        if (eo > 0u) {
            let eb_id = sorted_bucket_list[eb];
            end_cursor = offsets[eb_id] + eo + 1u;
        } else {
            // eo==0: end coincides with bucket eb's first point. For the slot
            // walk that means "stop when the cursor reaches eb's base".
            let eb_id = sorted_bucket_list[eb];
            end_cursor = offsets[eb_id];
        }

        cursor[k] = start_cursor;
        bucket_end[k] = sb_base + sb_count;
        task_end[k] = end_cursor;
        cur_sorted[k] = sb;
        cur_bucket[k] = sb_id;
        is_first[k] = 1u;
        slot_done[k] = 0u;

        // Empty task → idle from the start.
        if (start_cursor >= end_cursor) {
            slot_done[k] = 1u;
            continue;
        }

        // Single-point leading segment. The batched inner loop's is_first
        // step consumes two points, so a piece with exactly one point before
        // its first boundary can't go through it. Dense buckets have count>=2,
        // so this only arises for a split continuation (so>0) landing on a
        // bucket's last point. Store that point directly as the piece sum.
        let seg_end = min(bucket_end[k], task_end[k]);
        if (split_start[k] == 1u && seg_end - start_cursor == 1u) {
            let px = load_pt_x(start_cursor);
            let py = load_pt_y(start_cursor);
            if (task_end[k] <= bucket_end[k]) {
                store_partial(2u * (t * S + k) + 1u, sb_id, M_partials, px, py);
                slot_done[k] = 1u;
            } else {
                store_partial(2u * (t * S + k) + 0u, sb_id, M_partials, px, py);
                let nxt = sb + 1u;
                let nxt_id = sorted_bucket_list[nxt];
                let nxt_base = offsets[nxt_id];
                cur_sorted[k] = nxt;
                cur_bucket[k] = nxt_id;
                bucket_end[k] = nxt_base + sorted_count_list[nxt];
                cursor[k] = nxt_base;
                split_start[k] = 0u;
                if (cursor[k] >= task_end[k]) { slot_done[k] = 1u; }
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
            let dx = fr_sub_f8(p_rx, p_lx);
            if (k == 0u) { acc = dx; } else { acc = montgomery_product_f8(acc, dx); }
            store_pref(pref_base + k * 2u, acc);
        }

        var acc20 = unpack256_to_limbs(acc);
        var inv20 = {{ inv_fn }}(acc20);
        var inv = pack_limbs_to_256(&inv20);

        // Inverse pass: derive per-slot 1/dx.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = load_pref(pref_base + (k - 1u) * 2u);
                inv_dx = montgomery_product_f8(inv, pp);
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

            let inv_dx = load_pref(pref_base + k * 2u);
            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(p_lx, p_rx);
            r_x = fr_sub_f8(r_x, x_sum);
            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            let task_done = cursor[k] >= task_end[k];
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
    }

    {{{ recompile }}}
}
