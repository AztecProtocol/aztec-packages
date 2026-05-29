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

// Stream-walker bucket accumulator. See STREAM_WALKER_PLAN.md §6-§9.
//
// Each thread owns S=8 affine-add slots. The thread reads its bucket range
// from thread_cuts and partitions that range into 8 equal-work sub-ranges
// ("tasks") at init. Each slot walks its task monotonically: per iteration,
// the thread performs 8 batched-inversion affine adds, advances each slot,
// and retires either to bucket_sums (whole bucket inside one task) or to
// partials_buf (task ends mid-bucket → split).
//
// Bindings (8 total — within mobile WebGPU storage-binding limit):
//   0 bucket_meta       : (sorted_bucket_id, count, offset, cum_adds) per dense bucket
//   1 thread_cuts       : (cut_bucket_meta_idx, cut_offset) per thread
//   2 l0_index          : packed (sign, pt_idx) per l0 position
//   3 points            : combined point_x and point_y, x_plane at base 0, y_plane at offset params.z
//   4 sums_and_partials : bucket_sums + partials_buf in one buffer (x then y planes, see §3.1)
//   5 split_records     : per-thread × 9 record slots, (bucket, slot_idx) pairs, sentinel=0xFFFFFFFF
//   6 planner_meta      : shared planner output
//   7 params            : uniform vec4<u32>
//
// params.x = NUM_THREADS                   (active count)
// params.y = M_buckets                      (bucket_sums stride in 64-B point units)
// params.z = point_y_offset_in_points       (where point_y begins, in vec4 elements)
// params.w = idle_anchor_l0_pos             (l0_index position with a known non-degenerate dx)

const S: u32 = {{ s }}u;
const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;
// Each slot can write two distinct partials in its lifetime:
//   slot's split-start partial (when first bucket exhausts mid-task)
//   slot's split-end   partial (when task ends mid-bucket)
// These are at different buckets so they need distinct partials_buf slots.
const PARTIALS_PER_THREAD: u32 = 16u;       // 2 × S
const SPLIT_RECORDS_PER_THREAD: u32 = 16u;  // worst-case (every task boundary mid-bucket)
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;
const SPLIT_SENTINEL: u32 = 0xFFFFFFFFu;

@group(0) @binding(0) var<storage, read>        bucket_meta:       array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>        thread_cuts:       array<u32>;
@group(0) @binding(2) var<storage, read>        l0_index:          array<u32>;
@group(0) @binding(3) var<storage, read>        points:            array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write>  sums_and_partials: array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write>  split_records:     array<u32>;
@group(0) @binding(6) var<storage, read>        planner_meta:      array<u32>;
@group(0) @binding(7) var<uniform>              params:            vec4<u32>;

// pref_scratch — workgroup-local. Sized TPB × S × 2 vec4 (forward prefix +
// inverse storage per slot). At TPB=128, S=8: 128*8*2 = 2048 vec4 = 32 KB,
// which is at the M2 workgroup-memory limit.
var<workgroup> pref_scratch: array<vec4<u32>, {{ pref_scratch_len }}>;

fn load_pt_x(packed: u32) -> array<u32, 8> {
    let pt = packed & L0_IDX_MASK;
    let q0 = points[2u * pt];
    let q1 = points[2u * pt + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_pt_y(packed: u32) -> array<u32, 8> {
    let pt = packed & L0_IDX_MASK;
    let py_off = params.z;
    let q0 = points[py_off + 2u * pt];
    let q1 = points[py_off + 2u * pt + 1u];
    let y = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) { return y; }
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return fr_sub_f8(zero, y);
}

// sums_and_partials layout (see STREAM_WALKER_PLAN.md §3.1):
//   [0, M_buckets * PG)             : bucket_sums x plane
//   [M_buckets * PG, 2 * M_buckets * PG) : bucket_sums y plane
//   [2 * M_buckets * PG, ...)       : partials_buf, same x-then-y plane layout
//                                      with stride = NUM_THREADS * S
//
// We compute the partials base offset on the fly from params.x and M_buckets.
fn store_bucket_sum(bucket_id: u32, M_buckets: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * bucket_id;
    sums_and_partials[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    sums_and_partials[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M_buckets + PG * bucket_id;
    sums_and_partials[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    sums_and_partials[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_partial(partials_base: u32, slot: u32, M_partials: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = partials_base + PG * slot;
    sums_and_partials[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    sums_and_partials[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = partials_base + PG * M_partials + PG * slot;
    sums_and_partials[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    sums_and_partials[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_pref(pref_idx: u32, val: array<u32, 8>) {
    pref_scratch[pref_idx + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    pref_scratch[pref_idx + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn load_pref(pref_idx: u32) -> array<u32, 8> {
    let q0 = pref_scratch[pref_idx + 0u];
    let q1 = pref_scratch[pref_idx + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

// Binary-search cumulative_adds for the bucket containing `target`.
// cumulative_adds[i] = exclusive prefix sum of (count[i] - 1) over i.
// bucket_meta[i].w == cumulative_adds[i]; bucket_meta[i].y == count.
// The bucket's add-stream covers cum_adds[i]..cum_adds[i]+count[i]-1.
fn binary_search_cum_adds(target: u32, lo_in: u32, hi_in: u32) -> vec2<u32> {
    var lo: u32 = lo_in;
    var hi: u32 = hi_in;
    while (lo < hi) {
        let mid = (lo + hi) >> 1u;
        let m = bucket_meta[mid];
        let cum_end_inclusive = m.w + m.y - 1u;
        if (cum_end_inclusive < target) {
            lo = mid + 1u;
        } else {
            hi = mid;
        }
    }
    let cut_bucket = lo;
    var cut_offset: u32 = 0u;
    let here = bucket_meta[lo];
    if (target > here.w) {
        cut_offset = target - here.w;
    }
    return vec2<u32>(cut_bucket, cut_offset);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let t = gid.x;
    let l = lid.x;
    let NUM_THREADS = params.x;
    let M_buckets = params.y;
    let IDLE_ANCHOR = params.w;
    // partials_buf stride is 2 partial slots per slot of every thread.
    let M_partials = NUM_THREADS * PARTIALS_PER_THREAD;
    let num_dense = planner_meta[1];

    if (t >= NUM_THREADS) { return; }
    if (num_dense == 0u) { return; }

    // Per-thread partials base offset within sums_and_partials, in vec4 elements.
    // Layout: [bucket_sums_x][bucket_sums_y][partials_x][partials_y]
    //   bucket_sums_x at [0, M_buckets * PG)
    //   bucket_sums_y at [M_buckets * PG, 2 * M_buckets * PG)
    //   partials_x   at [2 * M_buckets * PG, 2 * M_buckets * PG + M_partials * PG)
    //   partials_y   at [2 * M_buckets * PG + M_partials * PG, ...)
    let partials_base = 2u * PG * M_buckets;

    // Per-thread split_records base index (in u32 elements).
    // Each record is 2 u32 (bucket_id, partial_slot_idx).
    let split_base = t * SPLIT_RECORDS_PER_THREAD * 2u;

    // Read thread range from thread_cuts.
    let thread_first_bucket = thread_cuts[2u * t + 0u];
    let thread_first_offset = thread_cuts[2u * t + 1u];
    let thread_last_bucket  = thread_cuts[2u * (t + 1u) + 0u];
    let thread_last_offset  = thread_cuts[2u * (t + 1u) + 1u];

    // Initialize all split_records slots to sentinel before populating.
    for (var i: u32 = 0u; i < SPLIT_RECORDS_PER_THREAD; i = i + 1u) {
        split_records[split_base + 2u * i + 0u] = SPLIT_SENTINEL;
        split_records[split_base + 2u * i + 1u] = SPLIT_SENTINEL;
    }
    var split_write_count: u32 = 0u;

    // Compute total adds in thread's range.
    let cum_at_start = bucket_meta[thread_first_bucket].w + thread_first_offset;
    var cum_at_end: u32 = 0u;
    if (thread_last_bucket < num_dense) {
        let m = bucket_meta[thread_last_bucket];
        cum_at_end = m.w + thread_last_offset;
    } else {
        let last = num_dense - 1u;
        let m = bucket_meta[last];
        cum_at_end = m.w + m.y - 1u;
    }
    let thread_total = cum_at_end - cum_at_start;
    if (thread_total == 0u) { return; }

    // Compute S+1 task boundaries (in cumulative-adds space → bucket+offset).
    var task_b: array<u32, 9u>;  // 9 = S+1
    var task_o: array<u32, 9u>;
    task_b[0] = thread_first_bucket;
    task_o[0] = thread_first_offset;
    task_b[S] = thread_last_bucket;
    task_o[S] = thread_last_offset;

    var search_lo = thread_first_bucket;
    var search_hi = thread_last_bucket;
    if (search_hi >= num_dense) { search_hi = num_dense - 1u; }

    for (var k: u32 = 1u; k < S; k = k + 1u) {
        let target = cum_at_start + (k * thread_total) / S;
        let bs = binary_search_cum_adds(target, search_lo, search_hi);
        task_b[k] = bs.x;
        task_o[k] = bs.y;
        search_lo = bs.x;
    }

    // Per-slot private state (held in registers — WGSL compiler should
    // not spill these arrays; their per-thread size is ~96 B × 8 = 768 B).
    var cur_bucket_meta_idx: array<u32, {{ s }}>;
    var cur_offset:          array<u32, {{ s }}>;
    var cur_count:           array<u32, {{ s }}>;
    var cur_l0_base:         array<u32, {{ s }}>;
    var cur_bucket_id:       array<u32, {{ s }}>;
    var task_end_b:          array<u32, {{ s }}>;
    var task_end_o:          array<u32, {{ s }}>;
    var is_first:            array<u32, {{ s }}>;
    var is_idle:             array<u32, {{ s }}>;
    // acc_x / acc_y per slot — packed as two vec4 each in private memory.
    var acc_x_lo:            array<vec4<u32>, {{ s }}>;
    var acc_x_hi:            array<vec4<u32>, {{ s }}>;
    var acc_y_lo:            array<vec4<u32>, {{ s }}>;
    var acc_y_hi:            array<vec4<u32>, {{ s }}>;

    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let start_b = task_b[k];
        let start_o = task_o[k];
        let end_b   = task_b[k + 1u];
        let end_o   = task_o[k + 1u];

        cur_bucket_meta_idx[k] = start_b;
        cur_offset[k] = start_o;
        task_end_b[k] = end_b;
        task_end_o[k] = end_o;
        is_first[k] = 1u;
        is_idle[k] = 0u;

        if (start_b < num_dense) {
            let m = bucket_meta[start_b];
            cur_bucket_id[k] = m.x;
            cur_count[k] = m.y - 1u;
            cur_l0_base[k] = m.z;
        } else {
            is_idle[k] = 1u;
        }

        // Empty task: start == end exactly.
        if (start_b == end_b && start_o == end_o) {
            is_idle[k] = 1u;
        }
    }

    // pref_scratch index for thread l, slot k, lo/hi: l * S * 2 + k * 2 + half
    let pref_t_base = l * S * 2u;

    // Main loop.
    loop {
        var any_active: bool = false;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            if (is_idle[k] == 0u) { any_active = true; }
        }
        if (!any_active) { break; }

        // === Forward prefix: compute dx[k] = rhs.x - lhs.x for each slot,
        //     accumulating their product.
        var acc: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            var packed_lhs: u32;
            var packed_rhs: u32;
            if (is_idle[k] == 1u) {
                packed_lhs = l0_index[IDLE_ANCHOR];
                packed_rhs = l0_index[IDLE_ANCHOR + 1u];
                p_lx = load_pt_x(packed_lhs);
                p_rx = load_pt_x(packed_rhs);
            } else if (is_first[k] == 1u) {
                packed_lhs = l0_index[cur_l0_base[k] + cur_offset[k]];
                packed_rhs = l0_index[cur_l0_base[k] + cur_offset[k] + 1u];
                p_lx = load_pt_x(packed_lhs);
                p_rx = load_pt_x(packed_rhs);
            } else {
                let q0 = acc_x_lo[k];
                let q1 = acc_x_hi[k];
                p_lx = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
                packed_rhs = l0_index[cur_l0_base[k] + cur_offset[k]];
                p_rx = load_pt_x(packed_rhs);
            }
            let dx = fr_sub_f8(p_rx, p_lx);
            if (k == 0u) {
                acc = dx;
            } else {
                acc = montgomery_product_f8(acc, dx);
            }
            store_pref(pref_t_base + k * 2u, acc);
        }

        // === One safegcd inversion of the running product.
        var acc20 = unpack256_to_limbs(acc);
        var inv20 = {{ inv_fn }}(acc20);
        var inv = pack_limbs_to_256(&inv20);

        // === Inverse pass: derive 1/dx[k] for each slot.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = load_pref(pref_t_base + (k - 1u) * 2u);
                inv_dx = montgomery_product_f8(inv, pp);
                // Re-fetch dx for this slot to advance inv via Mont(inv * dx).
                var p_lx_b: array<u32, 8>;
                var p_rx_b: array<u32, 8>;
                if (is_idle[k] == 1u) {
                    let packed_l = l0_index[IDLE_ANCHOR];
                    let packed_r = l0_index[IDLE_ANCHOR + 1u];
                    p_lx_b = load_pt_x(packed_l);
                    p_rx_b = load_pt_x(packed_r);
                } else if (is_first[k] == 1u) {
                    let packed_l = l0_index[cur_l0_base[k] + cur_offset[k]];
                    let packed_r = l0_index[cur_l0_base[k] + cur_offset[k] + 1u];
                    p_lx_b = load_pt_x(packed_l);
                    p_rx_b = load_pt_x(packed_r);
                } else {
                    let q0 = acc_x_lo[k];
                    let q1 = acc_x_hi[k];
                    p_lx_b = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
                    let packed_r = l0_index[cur_l0_base[k] + cur_offset[k]];
                    p_rx_b = load_pt_x(packed_r);
                }
                let dx_b = fr_sub_f8(p_rx_b, p_lx_b);
                inv = montgomery_product_f8(inv, dx_b);
            }
            store_pref(pref_t_base + k * 2u, inv_dx);
        }

        // === Backward peel: affine add + slot advance.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;

            if (is_idle[k] == 1u) { continue; }

            // Load lhs/rhs once more for the y-pass + affine-add.
            var p_lx: array<u32, 8>;
            var p_ly: array<u32, 8>;
            var p_rx: array<u32, 8>;
            var p_ry: array<u32, 8>;
            var advance: u32;
            if (is_first[k] == 1u) {
                let packed_l = l0_index[cur_l0_base[k] + cur_offset[k]];
                let packed_r = l0_index[cur_l0_base[k] + cur_offset[k] + 1u];
                p_lx = load_pt_x(packed_l);
                p_ly = load_pt_y(packed_l);
                p_rx = load_pt_x(packed_r);
                p_ry = load_pt_y(packed_r);
                advance = 2u;
            } else {
                let q0x = acc_x_lo[k];
                let q1x = acc_x_hi[k];
                p_lx = array<u32, 8>(q0x.x, q0x.y, q0x.z, q0x.w, q1x.x, q1x.y, q1x.z, q1x.w);
                let q0y = acc_y_lo[k];
                let q1y = acc_y_hi[k];
                p_ly = array<u32, 8>(q0y.x, q0y.y, q0y.z, q0y.w, q1y.x, q1y.y, q1y.z, q1y.w);
                let packed_r = l0_index[cur_l0_base[k] + cur_offset[k]];
                p_rx = load_pt_x(packed_r);
                p_ry = load_pt_y(packed_r);
                advance = 1u;
            }

            let inv_dx = load_pref(pref_t_base + k * 2u);

            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);

            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(p_lx, p_rx);
            r_x = fr_sub_f8(r_x, x_sum);

            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            cur_offset[k] = cur_offset[k] + advance;
            is_first[k] = 0u;

            // Check bucket / task exhaustion.
            let bucket_exhausted = (cur_offset[k] >= cur_count[k]);
            let at_task_end_bucket = (cur_bucket_meta_idx[k] == task_end_b[k]);
            let task_exhausted = at_task_end_bucket && (cur_offset[k] >= task_end_o[k]);

            if (task_exhausted) {
                // Task done. Decide retire destination:
                //  - If task ends mid-bucket (bucket not exhausted at task end),
                //    retire to split-END partial slot.
                //  - Else if started-mid-bucket and this is still slot's FIRST bucket,
                //    retire to split-START partial slot (slot's whole task was inside
                //    one bucket — CC-2 / sub-task-of-CC-2 case).
                //  - Else retire to bucket_sums (clean whole-bucket inside the task).
                let bucket_finished_here = bucket_exhausted && (cur_offset[k] == cur_count[k]);
                let started_mid_bucket = (cur_bucket_meta_idx[k] == task_b[k] && task_o[k] > 0u);
                let ends_mid_bucket = !bucket_finished_here;

                if (ends_mid_bucket) {
                    // Split-end partial — slot index 2*k+1 within thread.
                    let slot_global = t * PARTIALS_PER_THREAD + 2u * k + 1u;
                    store_partial(partials_base, slot_global, M_partials, r_x, r_y);
                    if (split_write_count < SPLIT_RECORDS_PER_THREAD) {
                        split_records[split_base + 2u * split_write_count + 0u] = cur_bucket_id[k];
                        split_records[split_base + 2u * split_write_count + 1u] = slot_global;
                        split_write_count = split_write_count + 1u;
                    }
                } else if (started_mid_bucket) {
                    // Whole bucket inside task, started mid → split-start partial.
                    let slot_global = t * PARTIALS_PER_THREAD + 2u * k;
                    store_partial(partials_base, slot_global, M_partials, r_x, r_y);
                    if (split_write_count < SPLIT_RECORDS_PER_THREAD) {
                        split_records[split_base + 2u * split_write_count + 0u] = cur_bucket_id[k];
                        split_records[split_base + 2u * split_write_count + 1u] = slot_global;
                        split_write_count = split_write_count + 1u;
                    }
                } else {
                    // Clean whole-bucket completion at task end.
                    store_bucket_sum(cur_bucket_id[k], M_buckets, r_x, r_y);
                }
                is_idle[k] = 1u;
            } else if (bucket_exhausted) {
                // Bucket completed inside the task. If slot started mid-bucket,
                // this is the split-START partial for slot's first bucket.
                let started_mid_bucket = (cur_bucket_meta_idx[k] == task_b[k] && task_o[k] > 0u);
                if (started_mid_bucket) {
                    let slot_global = t * PARTIALS_PER_THREAD + 2u * k;
                    store_partial(partials_base, slot_global, M_partials, r_x, r_y);
                    if (split_write_count < SPLIT_RECORDS_PER_THREAD) {
                        split_records[split_base + 2u * split_write_count + 0u] = cur_bucket_id[k];
                        split_records[split_base + 2u * split_write_count + 1u] = slot_global;
                        split_write_count = split_write_count + 1u;
                    }
                } else {
                    store_bucket_sum(cur_bucket_id[k], M_buckets, r_x, r_y);
                }
                // Advance to next bucket in task.
                cur_bucket_meta_idx[k] = cur_bucket_meta_idx[k] + 1u;
                cur_offset[k] = 0u;
                if (cur_bucket_meta_idx[k] < num_dense) {
                    let m = bucket_meta[cur_bucket_meta_idx[k]];
                    cur_bucket_id[k] = m.x;
                    cur_count[k] = m.y - 1u;
                    cur_l0_base[k] = m.z;
                    is_first[k] = 1u;
                } else {
                    is_idle[k] = 1u;
                }
            } else {
                // Within-bucket progress — stash accumulator in private registers.
                acc_x_lo[k] = vec4<u32>(r_x[0], r_x[1], r_x[2], r_x[3]);
                acc_x_hi[k] = vec4<u32>(r_x[4], r_x[5], r_x[6], r_x[7]);
                acc_y_lo[k] = vec4<u32>(r_y[0], r_y[1], r_y[2], r_y[3]);
                acc_y_hi[k] = vec4<u32>(r_y[4], r_y[5], r_y[6], r_y[7]);
            }
        }
    }

    {{{ recompile }}}
}
