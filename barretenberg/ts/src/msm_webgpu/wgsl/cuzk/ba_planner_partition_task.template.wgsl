// Stream-walker planner stage 1.6: per-thread task partition (KNOB 2).
//
// Design-knob variation on the stream-walker plan (§1.4 / §8): instead of
// having ba_stream_walker compute its S task cuts at kernel init (9 binary
// searches per thread), hoist that work into this dedicated planner kernel.
// The walker then reads precomputed cuts from `task_cuts` rather than
// binary-searching cumulative_adds itself.
//
// For each active walker thread t this refines its work range
// [thread_cuts[t], thread_cuts[t+1]) into S equal-work tasks by binary
// searching cumulative_adds, and writes S+1 cut points (each a
// (sorted_bucket, adds_offset) pair) so the walker can read cut k and k+1
// as the [start, end) of task k. The cut encoding matches thread_cuts:
// adds_offset is measured in the (count-1) adds-prefix space of the bucket.

// thread_cuts are produced by ba_planner_partition_thread at THREAD_TPB
// granularity, so NUM_THREADS = nwg * THREAD_TPB. WALKER_TPB only governs
// the walker's own workgroup_size; the indirect dispatch count emitted
// below is nwg * THREAD_TPB / WALKER_TPB workgroups. Both constants come
// from ba_stream_plan.ts via the generator, NOT inlined.
const THREAD_TPB: u32 = {{ thread_tpb }}u;
const WALKER_TPB: u32 = {{ walker_tpb }}u;
const S: u32 = {{ s }}u;              // tasks per thread
const CUTS: u32 = S + 1u;             // cut points per thread

const IDX_TPB: u32 = {{ idx_tpb }}u;

@group(0) @binding(0) var<storage, read>       sorted_count_list: array<u32>;
@group(0) @binding(1) var<storage, read>       cumulative_adds:   array<u32>;
@group(0) @binding(2) var<storage, read>       thread_cuts:       array<u32>;
@group(0) @binding(3) var<storage, read_write> planner_meta:      array<u32>;
@group(0) @binding(4) var<storage, read_write> task_cuts:         array<u32>;
@group(0) @binding(5) var<uniform>             params:            vec4<u32>;
// walker_index v2 indirect args — [0..2] slot-wide kernels (idx_count /
// idx_scatter) at ceil(2*S*num_active_threads / IDX_TPB); [3..5] the
// dense-wide idx_alloc at ceil(num_dense / IDX_TPB); [6..8] written later
// by the epilogue (sorted scatter).
@group(0) @binding(6) var<storage, read_write> wi_idx_args:       array<u32>;

// Binary search for the lowest bucket b in [lo_b, hi_b) whose inclusive
// add-prefix end (cumulative_adds[b] + count[b] - 1) reaches `cut_target`,
// then resolve the within-bucket offset. Mirrors ba_planner_partition_thread.
fn resolve_cut(cut_target: u32, lo_b: u32, hi_b: u32, num_dense: u32) -> vec2<u32> {
    var lo: u32 = lo_b;
    var hi: u32 = hi_b;
    var _bs_iter: u32 = 0u;
    while (lo < hi) {
        if (_bs_iter >= 64u) { break; }
        _bs_iter = _bs_iter + 1u;
        let mid = (lo + hi) / 2u;
        let cum_end = cumulative_adds[mid] + sorted_count_list[mid] - 1u;
        if (cum_end < cut_target) {
            lo = mid + 1u;
        } else {
            hi = mid;
        }
    }
    let cut_bucket = min(lo, num_dense - 1u);
    var cut_offset: u32 = 0u;
    if (cut_target > cumulative_adds[cut_bucket]) {
        cut_offset = cut_target - cumulative_adds[cut_bucket];
    }
    return vec2<u32>(cut_bucket, cut_offset);
}

@compute @workgroup_size({{ thread_tpb }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let nwg = planner_meta[3];
    let num_dense = planner_meta[1];
    let num_active_threads = nwg * THREAD_TPB;

    // Thread 0 emits the walker's indirect-dispatch args (workgroups of
    // WALKER_TPB needed to cover num_active_threads walker threads).
    if (t == 0u) {
        planner_meta[15] = (num_active_threads + WALKER_TPB - 1u) / WALKER_TPB;
        planner_meta[16] = 1u;
        planner_meta[17] = 1u;
        let m_actual = 2u * S * num_active_threads;
        wi_idx_args[0] = (m_actual + IDX_TPB - 1u) / IDX_TPB;
        wi_idx_args[1] = 1u;
        wi_idx_args[2] = 1u;
        wi_idx_args[3] = (num_dense + IDX_TPB - 1u) / IDX_TPB;
        wi_idx_args[4] = 1u;
        wi_idx_args[5] = 1u;
    }

    if (t >= num_active_threads) { return; }

    let first_bucket = thread_cuts[2u * t + 0u];
    let first_off    = thread_cuts[2u * t + 1u];

    // The last active thread's end is the global work end. partition_thread
    // fills only nwg*256 start cuts (no end sentinel at index nwg*256), so
    // reading thread_cuts[t+1] there would pick up a stale slot.
    let total_adds = planner_meta[2];
    var last_bucket: u32;
    var last_off: u32;
    if (t + 1u >= num_active_threads) {
        last_bucket = num_dense - 1u;
        last_off    = total_adds - cumulative_adds[num_dense - 1u];
    } else {
        last_bucket = thread_cuts[2u * (t + 1u) + 0u];
        last_off    = thread_cuts[2u * (t + 1u) + 1u];
    }

    let start_adds = cumulative_adds[first_bucket] + first_off;
    let end_adds   = cumulative_adds[last_bucket] + last_off;
    let thread_total = end_adds - start_adds;

    let hi_b = min(last_bucket + 1u, num_dense);
    let base = t * CUTS * 2u;
    for (var k: u32 = 0u; k < CUTS; k = k + 1u) {
        let cut_target = start_adds + (k * thread_total) / S;
        let cut = resolve_cut(cut_target, first_bucket, hi_b, num_dense);
        task_cuts[base + k * 2u + 0u] = cut.x;
        task_cuts[base + k * 2u + 1u] = cut.y;
    }

    {{{ recompile }}}
}
