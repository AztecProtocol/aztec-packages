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

// Cooperative-inversion bucket accumulator ("coop-walker").
//
// Structural re-architecture of ba_stream_walker. Each thread owns ONE
// contiguous task (its whole [thread_cut, next_thread_cut) range — read as
// cut 0 .. cut S of the per-thread task_cuts block, so this is a drop-in for
// the stream_walker bind group and indirect dispatch). Instead of each thread
// carrying S private slot accumulators and running its own S-wide batched
// inversion through a 16 KB var<workgroup> pref_scratch, the batched inversion
// is shared across the whole workgroup: every active thread contributes one
// dx per round, the workgroup computes all TPB inverses with a cooperative
// prefix/suffix product scan plus a SINGLE safegcd inversion, and each thread
// applies its affine add.
//
// Why: the walker is memory-bound / occupancy-limited; its occupancy is capped
// by per-thread register pressure (~150+ regs at S=8) and the 16 KB workgroup
// footprint (one resident workgroup on Mali). coop-walker drops per-thread
// state to a single accumulator (~20 regs) and workgroup memory to ~4 KB
// (two TPB-wide 256-bit scan arrays), so many more workgroups stay resident to
// hide memory latency — MsmV2-like occupancy at stream-walker memory.
//
// Output contract is identical to ba_stream_walker (so walker_partials_index +
// walker_combine + reduce are reused unchanged):
//   - a bucket fully inside one thread's range  -> bucket_sums[bucket_id]
//   - a bucket split across a thread boundary    -> partials at slot
//        2*(t*S+0)+{0,1} (split-start suffix / task-end prefix), summed by
//        walker_combine.
// S is retained only for partial-slot layout compatibility with the shared
// partials buffer; coop-walker runs exactly ONE task per thread.
//
// params.x = NUM_THREADS, params.y = IDLE_ANCHOR,
// params.z = M_buckets, params.w = M_partials.

const S: u32 = {{ s }}u;
const CUTS: u32 = S + 1u;
const TPB: u32 = {{ workgroup_size }}u;
// Inversion granularity: number of threads that share ONE batched inversion.
// G==TPB -> cooperative prefix/suffix scan (one inversion per workgroup).
// 1<G<TPB -> per-group serial Montgomery batch inversion (TPB/G inversions,
//            one per group leader, run concurrently across leaders).
// G==1   -> each thread inverts its own dx (no workgroup memory, no barriers).
const G: u32 = {{ g }}u;
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

{{#coop_scan}}
// Two TPB-wide 256-bit scratch planes for the cooperative batch inversion:
// wpre becomes the inclusive prefix products, wsuf the inclusive suffix
// products. 2 vec4 per slot. ~4 KB total at TPB=64 (vs the walker's 16 KB).
var<workgroup> wpre: array<vec4<u32>, TPB * 2u>;
var<workgroup> wsuf: array<vec4<u32>, TPB * 2u>;
var<workgroup> w_inv_total: array<vec4<u32>, 2u>;
{{/coop_scan}}
{{#coop_group}}
// Per-group serial batch inversion: wdx holds each thread's dx (then is
// overwritten with its inv_dx); wpx holds the running prefix products the
// group leader needs for the backward pass. 2 vec4 per slot, ~4 KB total.
var<workgroup> wdx: array<vec4<u32>, TPB * 2u>;
var<workgroup> wpx: array<vec4<u32>, TPB * 2u>;
{{/coop_group}}
{{^coop_local}}
var<workgroup> w_any_active: atomic<u32>;
// Mirror of the activity flag read through workgroupUniformLoad so the loop
// break is a provably-uniform value (atomic loads are not, which would make
// the in-loop barriers fail Tint's uniformity analysis).
var<workgroup> w_active_flag: u32;
{{/coop_local}}

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

{{#coop_scan}}
fn wstore(arr_pre: bool, l: u32, v: array<u32, 8>) {
    let a = vec4<u32>(v[0], v[1], v[2], v[3]);
    let b = vec4<u32>(v[4], v[5], v[6], v[7]);
    if (arr_pre) {
        wpre[2u * l + 0u] = a;
        wpre[2u * l + 1u] = b;
    } else {
        wsuf[2u * l + 0u] = a;
        wsuf[2u * l + 1u] = b;
    }
}

fn wload_pre(l: u32) -> array<u32, 8> {
    let a = wpre[2u * l + 0u];
    let b = wpre[2u * l + 1u];
    return array<u32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
}

fn wload_suf(l: u32) -> array<u32, 8> {
    let a = wsuf[2u * l + 0u];
    let b = wsuf[2u * l + 1u];
    return array<u32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
}
{{/coop_scan}}
{{#coop_group}}
fn wdx_store(l: u32, v: array<u32, 8>) {
    wdx[2u * l + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    wdx[2u * l + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}
fn wdx_load(l: u32) -> array<u32, 8> {
    let a = wdx[2u * l + 0u];
    let b = wdx[2u * l + 1u];
    return array<u32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
}
fn wpx_store(l: u32, v: array<u32, 8>) {
    wpx[2u * l + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    wpx[2u * l + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}
fn wpx_load(l: u32) -> array<u32, 8> {
    let a = wpx[2u * l + 0u];
    let b = wpx[2u * l + 1u];
    return array<u32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
}
{{/coop_group}}

// Single field inversion in Montgomery form (unpack -> safegcd -> repack).
fn finv8(v: array<u32, 8>) -> array<u32, 8> {
    var lin = unpack256_to_limbs(v);
    var lout = {{ inv_fn }}(lin);
    let p = pack_limbs_to_256(&lout);
    return array<u32, 8>(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
}

fn coop_is_zero_f8(v: array<u32, 8>) -> bool {
    return (v[0] | v[1] | v[2] | v[3] | v[4] | v[5] | v[6] | v[7]) == 0u;
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

    // Per-thread scalar state (one task per thread; acc lives in registers).
    var cursor: u32 = 0u;          // l0_index point position
    var bucket_end: u32 = 0u;      // l0 position past current bucket
    var task_end_sort: u32 = 0u;   // sorted index of the task's last bucket
    var task_end_cur: u32 = 0u;    // l0 position past the task within that bucket
    var cur_sorted: u32 = 0u;      // index into sorted_bucket_list
    var cur_bucket: u32 = 0u;      // bucket id (for bucket_sums)
    var is_first: u32 = 1u;
    var slot_done: u32 = 1u;       // default idle (covers t >= active range)
    var split_start: u32 = 0u;     // current bucket shared with a prior task
    var acc_x: array<u32, 8>;
    var acc_y: array<u32, 8>;

    // Slot-layout-compatible NO_BUCKET init: clear all S partial-slot pairs so
    // the shared partials buffer is well-defined for walker_partials_index
    // (matches ba_stream_walker's coverage of slots 2*(t*S+k)+{0,1}).
    if (t < NUM_THREADS) {
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            partial_dest[2u * (t * S + k) + 0u] = NO_BUCKET;
            partial_dest[2u * (t * S + k) + 1u] = NO_BUCKET;
        }
    }

    // Initialise the single task from cut 0 (start) .. cut S (end). Mirrors
    // ba_stream_walker's per-slot init for the whole thread range.
    if (t < NUM_THREADS) {
        let cut_base = t * CUTS * 2u;
        let sb = task_cuts[cut_base + 0u];
        let so = task_cuts[cut_base + 1u];
        let eb = task_cuts[cut_base + S * 2u + 0u];
        let eo = task_cuts[cut_base + S * 2u + 1u];

        let sb_id = sorted_bucket_list[sb];
        let sb_base = offsets[sb_id];
        let sb_count = sorted_count_list[sb];

        var eff_sorted = sb;
        var eff_id = sb_id;
        var eff_base = sb_base;
        var eff_count = sb_count;
        var start_cursor: u32;
        if (so == 0u) {
            start_cursor = sb_base;
            split_start = 0u;
        } else if (so + 1u < sb_count) {
            start_cursor = sb_base + so + 1u;
            split_start = 1u;
        } else {
            eff_sorted = sb + 1u;
            eff_id = sorted_bucket_list[eff_sorted];
            eff_base = offsets[eff_id];
            eff_count = sorted_count_list[eff_sorted];
            start_cursor = eff_base;
            split_start = 0u;
        }

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

        cursor = start_cursor;
        bucket_end = eff_base + eff_count;
        task_end_sort = te_sort;
        task_end_cur = te_cur;
        cur_sorted = eff_sorted;
        cur_bucket = eff_id;
        is_first = 1u;
        slot_done = 0u;

        // Empty task (region-aware): start at or past the task end.
        if (eff_sorted > te_sort || (eff_sorted == te_sort && start_cursor >= te_cur)) {
            slot_done = 1u;
        } else {
            // Single-point leading segment: a split continuation landing on a
            // bucket's last point can't go through the 2-point is_first step.
            var seg_end = bucket_end;
            if (eff_sorted == te_sort) { seg_end = te_cur; }
            if (split_start == 1u && seg_end - start_cursor == 1u) {
                let px = load_pt_x(start_cursor);
                let py = load_pt_y(start_cursor);
                if (eff_sorted == te_sort) {
                    store_partial(2u * (t * S + 0u) + 1u, eff_id, M_partials, px, py);
                    slot_done = 1u;
                } else {
                    store_partial(2u * (t * S + 0u) + 0u, eff_id, M_partials, px, py);
                    let nxt = eff_sorted + 1u;
                    let nxt_id = sorted_bucket_list[nxt];
                    let nxt_base = offsets[nxt_id];
                    cur_sorted = nxt;
                    cur_bucket = nxt_id;
                    bucket_end = nxt_base + sorted_count_list[nxt];
                    cursor = nxt_base;
                    split_start = 0u;
                    if (nxt > te_sort) { slot_done = 1u; }
                }
            }
        }
    }

    // Main loop. For the cooperative modes (scan / group) every iteration is
    // uniform across the workgroup: the break is decided by a workgroup-shared
    // activity flag, so all threads execute the same barriers regardless of
    // when their own task ends. The local mode (G==1) has no in-loop barriers,
    // so each thread simply runs until its own task is done.
    loop {
{{^coop_local}}
        workgroupBarrier();
        if (l == 0u) { atomicStore(&w_any_active, 0u); }
        workgroupBarrier();
        if (slot_done == 0u) { atomicStore(&w_any_active, 1u); }
        workgroupBarrier();
        if (l == 0u) { w_active_flag = atomicLoad(&w_any_active); }
        // Uniform read (implicit barrier) so the break below is uniform.
        let any_active = workgroupUniformLoad(&w_active_flag);
        if (any_active == 0u) { break; }
{{/coop_local}}
{{#coop_local}}
        if (slot_done == 1u) { break; }
{{/coop_local}}

        // Each active thread computes its pending dx; idle threads contribute
        // Montgomery one (inert in the batch product).
        var dx: array<u32, 8>;
        if (slot_done == 1u) {
            dx = get_r_f8();
        } else {
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            if (is_first == 1u) {
                p_lx = load_pt_x(cursor);
                p_rx = load_pt_x(cursor + 1u);
            } else {
                p_lx = acc_x;
                p_rx = load_pt_x(cursor);
            }
            dx = fr_sub_f8(p_rx, p_lx);
            // Guard the batch product: a zero dx (equal x-coords, a measure-zero
            // doubling case for distinct SRS points) would zero the whole group
            // product. Substitute one so the failure stays isolated.
            if (coop_is_zero_f8(dx)) { dx = get_r_f8(); }
        }

{{#coop_scan}}
        wstore(true, l, dx);
        wstore(false, l, dx);

        // Interleaved inclusive prefix- (wpre) and suffix- (wsuf) product
        // scans (Hillis-Steele). Both share the same step schedule, so fusing
        // them halves the workgroup-barrier count versus two sequential scans.
        for (var off: u32 = 1u; off < TPB; off = off << 1u) {
            workgroupBarrier();
            var ptmp: array<u32, 8>;
            var stmp: array<u32, 8>;
            let pact = l >= off;
            let sact = l + off < TPB;
            if (pact) { ptmp = montgomery_product_f8(wload_pre(l - off), wload_pre(l)); }
            if (sact) { stmp = montgomery_product_f8(wload_suf(l), wload_suf(l + off)); }
            workgroupBarrier();
            if (pact) { wstore(true, l, ptmp); }
            if (sact) { wstore(false, l, stmp); }
        }
        workgroupBarrier();

        // One inversion for the whole workgroup: invert the total product.
        if (l == 0u) {
            let total = wload_pre(TPB - 1u);
            var total20 = unpack256_to_limbs(total);
            var invtot20 = {{ inv_fn }}(total20);
            let invtot = pack_limbs_to_256(&invtot20);
            w_inv_total[0u] = vec4<u32>(invtot[0], invtot[1], invtot[2], invtot[3]);
            w_inv_total[1u] = vec4<u32>(invtot[4], invtot[5], invtot[6], invtot[7]);
        }
        workgroupBarrier();
        let it0 = w_inv_total[0u];
        let it1 = w_inv_total[1u];
        let inv_total = array<u32, 8>(it0.x, it0.y, it0.z, it0.w, it1.x, it1.y, it1.z, it1.w);

        // inv_dx_l = inv_total * (prod_{j<l} dx_j) * (prod_{j>l} dx_j).
        var pre_excl: array<u32, 8>;
        if (l == 0u) { pre_excl = get_r_f8(); } else { pre_excl = wload_pre(l - 1u); }
        var suf_excl: array<u32, 8>;
        if (l + 1u >= TPB) { suf_excl = get_r_f8(); } else { suf_excl = wload_suf(l + 1u); }
        var inv_dx = montgomery_product_f8(inv_total, pre_excl);
        inv_dx = montgomery_product_f8(inv_dx, suf_excl);
{{/coop_scan}}
{{#coop_group}}
        // Per-group serial Montgomery batch inversion. Each group of G threads
        // shares ONE safegcd inversion; the TPB/G group leaders run their
        // inversions concurrently (one per leader). Only 2 barriers per round
        // regardless of G, versus the scan's 2*log2(TPB).
        wdx_store(l, dx);
        workgroupBarrier();
        if ((l % G) == 0u) {
            // Forward prefix products over the group's G dx values.
            var run = wdx_load(l);
            wpx_store(l, run);
            for (var i: u32 = 1u; i < G; i = i + 1u) {
                run = montgomery_product_f8(run, wdx_load(l + i));
                wpx_store(l + i, run);
            }
            // One inversion of the group product, then the backward pass: each
            // inv_dx overwrites its dx slot in wdx.
            var inv = finv8(run);
            for (var i: u32 = G - 1u; i >= 1u; i = i - 1u) {
                let invi = montgomery_product_f8(inv, wpx_load(l + i - 1u));
                inv = montgomery_product_f8(inv, wdx_load(l + i));
                wdx_store(l + i, invi);
            }
            wdx_store(l, inv);
        }
        workgroupBarrier();
        let inv_dx = wdx_load(l);
{{/coop_group}}
{{#coop_local}}
        // Each thread inverts its own dx — no workgroup memory, no barriers.
        let inv_dx = finv8(dx);
{{/coop_local}}

        if (slot_done == 0u) {
            var p_lx: array<u32, 8>;
            var p_ly: array<u32, 8>;
            var p_rx: array<u32, 8>;
            var p_ry: array<u32, 8>;
            if (is_first == 1u) {
                p_lx = load_pt_x(cursor);
                p_ly = load_pt_y(cursor);
                p_rx = load_pt_x(cursor + 1u);
                p_ry = load_pt_y(cursor + 1u);
                cursor = cursor + 2u;
            } else {
                p_lx = acc_x;
                p_ly = acc_y;
                p_rx = load_pt_x(cursor);
                p_ry = load_pt_y(cursor);
                cursor = cursor + 1u;
            }

            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(p_lx, p_rx);
            r_x = fr_sub_f8(r_x, x_sum);
            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            let task_done = (cur_sorted == task_end_sort) && (cursor >= task_end_cur);
            let bucket_done = cursor >= bucket_end;

            if (task_done) {
                let is_partial = (split_start == 1u) || (cursor < bucket_end);
                if (is_partial) {
                    store_partial(2u * (t * S + 0u) + 1u, cur_bucket, M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(cur_bucket, M_buckets, r_x, r_y);
                }
                slot_done = 1u;
            } else if (bucket_done) {
                if (split_start == 1u) {
                    store_partial(2u * (t * S + 0u) + 0u, cur_bucket, M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(cur_bucket, M_buckets, r_x, r_y);
                }
                let nxt = cur_sorted + 1u;
                let nxt_id = sorted_bucket_list[nxt];
                let nxt_base = offsets[nxt_id];
                cur_sorted = nxt;
                cur_bucket = nxt_id;
                bucket_end = nxt_base + sorted_count_list[nxt];
                cursor = nxt_base;
                is_first = 1u;
                split_start = 0u;
            } else {
                acc_x = r_x;
                acc_y = r_y;
                is_first = 0u;
            }
        }
    }

    {{{ recompile }}}
}
