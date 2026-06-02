{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{#regfile_lean}}
// Register-lean path: the CIOS multiply's 20 accumulators live in workgroup
// memory (`mont_s`) instead of 20 registers, raising Adreno wave occupancy.
// Transposed layout (slot j of thread wg_slot at mont_s[wg_slot + j*MONT_TPB])
// keeps a wave's accesses to one accumulator on consecutive words = no bank
// conflicts. Each thread touches only its own slots, so no barrier is needed.
const MONT_TPB: u32 = {{ workgroup_size }}u;
var<workgroup> mont_s: array<u32, 20u * MONT_TPB>;
var<private> wg_slot: u32;
{{> montgomery_product_wg_funcs }}
{{/regfile_lean}}

// PERF PROBES (additive, correctness-preserving). Default 0 = no-op; sed to sweep.
const EXTRA_MUL_PROBE: u32 = 0u;
const EXTRA_INV_PROBE: u32 = 0u;
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}
{{#regfile_lean_inv}}
// Register-lean inverse: the packed safegcd state f,g,d,e (4x10 words) lives in
// the workgroup array `inv_state` (transposed, region-major) instead of private
// memory, cutting the inverse's contribution to per-thread spill (scratch).
const WG_TPB: u32 = MONT_TPB;
var<workgroup> inv_state: array<u32, 40u * WG_TPB>;
{{> inverse_wg_funcs }}
{{/regfile_lean_inv}}

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
const BW:     u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
const M_RED:  u32 = {{ m_red }}u;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       sorted_count_list:  array<u32>;
@group(0) @binding(2) var<storage, read>       offsets:            array<u32>;
@group(0) @binding(3) var<storage, read>       task_cuts:          array<u32>;
@group(0) @binding(4) var<storage, read>       l0_index:           array<u32>;
@group(0) @binding(5) var<storage, read>       point_x:            array<vec4<u32>>;
@group(0) @binding(6) var<storage, read>       point_y:            array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> red_buf:            array<vec4<u32>>;
@group(0) @binding(8) var<storage, read_write> partials_buf:       array<vec4<u32>>;
@group(0) @binding(9) var<storage, read_write> partial_dest:       array<u32>;
@group(0) @binding(10) var<uniform>            params:             vec4<u32>;
// batch_offset.x = bi * batchWindows — added to local window index when
// computing red_slot so each batch's red_buf writes land in its globally
// correct window range. red_buf is no longer cleared per batch (only once
// per encode) so batches accumulate side-by-side.
@group(0) @binding(11) var<uniform>            batch_offset:       vec4<u32>;
// is_present marking is hoisted into combine_filter; stream_walker stays
// at 10 storage bindings (M2 cap). combine_filter sees every bucket with
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
    let red_slot = ((bucket_id / BW) + batch_offset.x) * STRIDE + (bucket_id % BW - 1u);
    let bx = PG * red_slot;
    red_buf[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    red_buf[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M_RED + PG * red_slot;
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
    partial_dest[pslot] = bucket_id;
}

// === Per-slot scalar state relocated to GLOBAL memory ===
// The peel processes one slot at a time, so the per-slot state (cursor, bucket
// bounds, task end, sorted index) is used sequentially — never simultaneously
// register-resident. It lives in the tail of partial_dest: region r ∈ {2..6},
// element k of thread ps_t at partial_dest[r*ps_nt*S + k*ps_nt + ps_t]
// (coalesced over t). Set at kernel entry.
var<private> ps_t: u32;       // global thread id (gid.x)
var<private> ps_nt: u32;      // NUM_THREADS
const PS_CURSOR: u32 = 2u;
const PS_BEND:   u32 = 3u;
const PS_TES:    u32 = 4u;
const PS_TEC:    u32 = 5u;
const PS_CS:     u32 = 6u;
fn ld_ps(r: u32, k: u32) -> u32 { return partial_dest[r * ps_nt * S + k * ps_nt + ps_t]; }
fn st_ps(r: u32, k: u32, v: u32) { partial_dest[r * ps_nt * S + k * ps_nt + ps_t] = v; }

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let t = gid.x;
    let l = lid.x;
{{#regfile_lean}}
    wg_slot = l;  // this thread's accumulator slot in the workgroup montmul scratch
{{/regfile_lean}}
    let NUM_THREADS = params.x;
    let IDLE_ANCHOR = params.y;
    let M_buckets = params.z;
    let M_partials = params.w;
    ps_t = t;
    ps_nt = NUM_THREADS;

    if (t >= NUM_THREADS) { return; }

    let cut_base = t * CUTS * 2u;
    // Coalesced pref_scratch addressing:
    //   pref_off = 4 * M_partials (start of pref region in partials_buf)
    //   k_stride = 2 * NUM_THREADS (per-slot stride; adjacent threads share cache line)
    let pref_off = 4u * M_partials;
    let k_stride = 2u * NUM_THREADS;
    // acc_x / acc_y (per-slot running partial sums) live in GLOBAL memory in the
    // tail of partials_buf, NOT in per-thread private arrays. The peel touches
    // one slot at a time, so each slot's accumulator is streamed in/out as
    // needed (load_pref/store_pref, same coalesced layout as pref). Holding all
    // S in a private array unrolled into S simultaneously-live 256-bit values
    // and spilled KB/thread to scratch; one-slot-at-a-time keeps it out of the
    // register file. Regions (vec4 units): acc_x at 5*M_partials, acc_y at 6*.
    let acc_x_off = 5u * M_partials;
    let acc_y_off = 6u * M_partials;

    // Per-slot state lives in GLOBAL memory (partial_dest tail) via ld_ps/st_ps,
    // streamed one slot at a time. The task end is tracked as (sorted index, l0
    // cursor within that bucket) — NOT a bare l0 cursor — because l0 positions
    // are not monotonic across sorted buckets, so a raw cursor>=task_end test
    // would be meaningless once a multi-bucket task walks into a bucket whose
    // l0 region precedes the end.
    //   PS_CURSOR    l0_index point position
    //   PS_BEND      l0 position past current bucket
    //   PS_TES       sorted index of the task's last bucket
    //   PS_TEC       l0 position past the task within that bucket
    //   PS_CS        index into sorted_bucket_list
    var is_first_m: u32 = 0u;
    var slot_done_m: u32 = 0u;
    var split_start_m: u32 = 0u;

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
            split_start_m = split_start_m & ~(1u << k);
        } else if (so + 1u < sb_count) {
            start_cursor = sb_base + so + 1u;
            split_start_m = split_start_m | (1u << k);
        } else {
            eff_sorted = sb + 1u;
            eff_id = sorted_bucket_list[eff_sorted];
            eff_base = offsets[eff_id];
            eff_count = sorted_count_list[eff_sorted];
            start_cursor = eff_base;
            split_start_m = split_start_m & ~(1u << k);
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

        st_ps(PS_CURSOR, k, start_cursor);
        st_ps(PS_BEND, k, eff_base + eff_count);
        st_ps(PS_TES, k, te_sort);
        st_ps(PS_TEC, k, te_cur);
        st_ps(PS_CS, k, eff_sorted);

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
        var seg_end = ld_ps(PS_BEND, k);
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
                let nxt_id = sorted_bucket_list[nxt];
                let nxt_base = offsets[nxt_id];
                st_ps(PS_CS, k, nxt);

                st_ps(PS_BEND, k, nxt_base + sorted_count_list[nxt]);
                st_ps(PS_CURSOR, k, nxt_base);
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
        // All slots retire when every done-bit is set. One mask compare against
        // (1<<S)-1 replaces the per-slot shift/mask/compare loop — fewer non-mul
        // ALU ops, which serialize on Adreno's unified ALU (free on Mali's CVT).
        if (slot_done_m == (1u << S) - 1u) { break; }

        // Forward prefix of dx across the S slots (idle slots use the pad
        // trio so the product stays invertible), exactly as ba_stream_accum.
        var acc: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            let sd_b = (slot_done_m >> k) & 1u;
            let isf_b = (is_first_m >> k) & 1u;
            let rx_addr = select(select(ld_ps(PS_CURSOR, k), ld_ps(PS_CURSOR, k) + 1u, isf_b == 1u), IDLE_ANCHOR + 1u, sd_b == 1u);
            p_rx = load_pt_x(rx_addr);
            if (sd_b == 1u || isf_b == 1u) {
                p_lx = load_pt_x(select(ld_ps(PS_CURSOR, k), IDLE_ANCHOR, sd_b == 1u));
            } else {
                p_lx = load_pref(k, t, acc_x_off, k_stride);
            }
            let dx = fr_sub_f8(p_rx, p_lx);
            if (k == 0u) { acc = dx; } else { acc = montgomery_product_f8(acc, dx); }
            // OPTIMIZATION (c): the final prefix (k = S-1) is consumed only
            // by the inverter below, in-register. Skip its store_pref.
            if (k + 1u < S) {
                store_pref(k, t, pref_off, k_stride, acc);
            }
        }

        var acc20 = unpack256_to_limbs(acc);
        var inv20 = {{ inv_fn }}(acc20);
        // PERF PROBE (additive, correctness-preserving): each pair is inv(inv(x))==x,
        // chained so the compiler cannot CSE it. EXTRA_INV_PROBE=0 => no-op.
        for (var ei: u32 = 0u; ei < EXTRA_INV_PROBE; ei = ei + 1u) { inv20 = {{ inv_fn }}(inv20); inv20 = {{ inv_fn }}(inv20); }
        var inv = pack_limbs_to_256(&inv20);

        // OPTIMIZATION (c): fused inverse pass + backward peel.
        // Original had two separate descending loops:
        //   (1) compute inv_dx[k], store to pref_scratch
        //   (2) reload inv_dx[k], do affine add
        // Fused: compute inv_dx[k] in register, immediately use it for the
        // affine add. Eliminates 8 stores + 8 loads of pref_scratch per
        // outer iter (the largest device-storage savings available).
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;

            // X-coord loads (registers).
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            let sd_b = (slot_done_m >> k) & 1u;
            let isf_b = (is_first_m >> k) & 1u;
            let rx_addr = select(select(ld_ps(PS_CURSOR, k), ld_ps(PS_CURSOR, k) + 1u, isf_b == 1u), IDLE_ANCHOR + 1u, sd_b == 1u);
            p_rx = load_pt_x(rx_addr);
            if (sd_b == 1u || isf_b == 1u) {
                p_lx = load_pt_x(select(ld_ps(PS_CURSOR, k), IDLE_ANCHOR, sd_b == 1u));
            } else {
                p_lx = load_pref(k, t, acc_x_off, k_stride);
            }

            let x_sum = fr_add_f8(p_lx, p_rx);

            // Derive inv_dx[k], update running inv (registers).
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = load_pref(k - 1u, t, pref_off, k_stride);
                inv_dx = montgomery_product_f8(inv, pp);
                let dx_b = fr_sub_f8(p_rx, p_lx);
                inv = montgomery_product_f8(inv, dx_b);
            }

            // Idle slots exist only to feed dx_k into the inv chain. Skip
            // the affine add.
            if ((((slot_done_m >> k) & 1u) == 1u)) { continue; }

            // Y-coord loads (registers) + cursor advance.
            var p_ly: array<u32, 8>;
            var p_ry: array<u32, 8>;
            let ry_addr = select(ld_ps(PS_CURSOR, k), ld_ps(PS_CURSOR, k) + 1u, isf_b == 1u);
            p_ry = load_pt_y(ry_addr);
            if (isf_b == 1u) {
                p_ly = load_pt_y(ld_ps(PS_CURSOR, k));
            } else {
                p_ly = load_pref(k, t, acc_y_off, k_stride);
            }
            st_ps(PS_CURSOR, k, ld_ps(PS_CURSOR, k) + select(1u, 2u, isf_b == 1u));

            // Affine add (registers).
            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var r_x = montgomery_product_f8(lambda, lambda);
            r_x = fr_sub_f8(r_x, x_sum);
            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);
            // PERF PROBE (additive, correctness-preserving): montmul(a,R)==a, chained
            // (no CSE). Adds EXTRA_MUL_PROBE montmuls per active slot. =0 => no-op.
            for (var em: u32 = 0u; em < EXTRA_MUL_PROBE; em = em + 1u) { r_y = montgomery_product_f8(r_y, get_r_f8()); }

            // Task end is region-aware: only the task's designated last bucket
            // can trigger it (cursor is meaningful only within the current
            // bucket's l0 region).
            let task_done = (ld_ps(PS_CS, k) == ld_ps(PS_TES, k)) && (ld_ps(PS_CURSOR, k) >= ld_ps(PS_TEC, k));
            let bucket_done = ld_ps(PS_CURSOR, k) >= ld_ps(PS_BEND, k);

            if (task_done) {
                let is_partial = ((((split_start_m >> k) & 1u) == 1u)) || (ld_ps(PS_CURSOR, k) < ld_ps(PS_BEND, k));
                if (is_partial) {
                    store_partial(2u * (t * S + k) + 1u, sorted_bucket_list[ld_ps(PS_CS, k)], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(sorted_bucket_list[ld_ps(PS_CS, k)], r_x, r_y);
                }
                slot_done_m = slot_done_m | (1u << k);
            } else if (bucket_done) {
                if ((((split_start_m >> k) & 1u) == 1u)) {
                    store_partial(2u * (t * S + k) + 0u, sorted_bucket_list[ld_ps(PS_CS, k)], M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(sorted_bucket_list[ld_ps(PS_CS, k)], r_x, r_y);
                }
                // Advance to the next bucket within the task. Subsequent
                // buckets always begin fresh (never split-start).
                let nxt = ld_ps(PS_CS, k) + 1u;
                let nxt_id = sorted_bucket_list[nxt];
                let nxt_base = offsets[nxt_id];
                st_ps(PS_CS, k, nxt);

                st_ps(PS_BEND, k, nxt_base + sorted_count_list[nxt]);
                st_ps(PS_CURSOR, k, nxt_base);
                is_first_m = is_first_m | (1u << k);
                split_start_m = split_start_m & ~(1u << k);
            } else {
                store_pref(k, t, acc_x_off, k_stride, r_x);
                store_pref(k, t, acc_y_off, k_stride, r_y);
                is_first_m = is_first_m & ~(1u << k);
            }
        }
    }

    {{{ recompile }}}
}
