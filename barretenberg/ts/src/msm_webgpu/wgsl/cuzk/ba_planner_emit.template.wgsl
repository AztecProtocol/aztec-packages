// Bucket-accumulate planner stage 1.6: queue emit.
//
// Two-phase kernel with workgroupBarrier:
//   Phase A — count real queue entries per thread, workgroup scan,
//             atomic slab allocation, compute workgroup-uniform Q_total.
//   Phase B — re-walk bucket range, emit (start_cursor, end_cursor,
//             dest_pack) triples, pad with IDLE entries, write header.
//
// Partial slot convention (deterministic, no atomic allocation):
//   Continuation piece (piece_start > 0) → partials_buf slot 2*t
//   Start-of-split piece (piece_start == 0, piece_end < adds) → slot 2*t+1
//
// Queue header: queue_buf[2*t] = start_offset, queue_buf[2*t+1] = count.

const TPB: u32 = {{ workgroup_size }}u;
const S: u32 = {{ s }}u;
const NUM_THREADS: u32 = {{ num_threads }}u;
const IDLE_DEST: u32 = 0x40000000u;
const PARTIAL_BIT: u32 = 0x80000000u;
const QUEUE_HEADER_LEN: u32 = {{ queue_header_len }}u;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       sorted_count_list:  array<u32>;
@group(0) @binding(2) var<storage, read>       offsets:            array<u32>;
@group(0) @binding(3) var<storage, read>       thread_cuts:        array<u32>;
@group(0) @binding(4) var<storage, read_write> queue_buf:          array<u32>;
@group(0) @binding(5) var<storage, read_write> planner_meta:       array<atomic<u32>>;
@group(0) @binding(6) var<uniform>             params:             vec4<u32>;

var<workgroup> per_thread_count: array<u32, {{ workgroup_size }}>;
var<workgroup> wg_slab_base: u32;
var<workgroup> wg_q_total: u32;

struct PieceInfo {
    start_add: u32,
    end_add: u32,
    bucket_sorted_idx: u32,
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let t_local = lid.x;
    let wg = wid.x;
    let IDLE_ANCHOR = params.x;
    // Read num_workgroups from planner_meta (written by cumsum). The
    // host dispatches a static 32 workgroups; excess workgroups must
    // NOT early-return before workgroupBarrier — instead they participate
    // in the barrier with zero work.
    let num_workgroups = atomicLoad(&planner_meta[3]);
    let num_dense = atomicLoad(&planner_meta[1]);
    let is_active_wg = (wg < num_workgroups);
    let global_t = wg * TPB + t_local;
    let is_active_thread = is_active_wg && (global_t < NUM_THREADS);

    var my_start_b: u32 = 0u;
    var my_start_off: u32 = 0u;
    var my_end_b: u32 = 0u;
    var my_end_off: u32 = 0u;
    if (is_active_thread) {
        my_start_b = thread_cuts[2u * global_t + 0u];
        my_start_off = thread_cuts[2u * global_t + 1u];
        my_end_b = num_dense;
        if (global_t + 1u < NUM_THREADS) {
            my_end_b = thread_cuts[2u * (global_t + 1u) + 0u];
            my_end_off = thread_cuts[2u * (global_t + 1u) + 1u];
        }
    }

    // Phase A: count pieces (inactive threads contribute 0).
    var real_count: u32 = 0u;
    if (is_active_thread && num_dense > 0u) {
        var b = my_start_b;
        while (b < num_dense) {
            if (b > my_end_b) { break; }
            if (b == my_end_b && my_end_off == 0u && b != my_start_b) { break; }

            let adds = sorted_count_list[b] - 1u;
            let ps = select(0u, my_start_off, b == my_start_b);
            var pe = adds;
            if (b == my_end_b && my_end_off > 0u) { pe = my_end_off; }

            if (ps < pe) { real_count += 1u; }
            if (b == my_end_b) { break; }
            b += 1u;
        }
    }

    per_thread_count[t_local] = real_count;
    workgroupBarrier();

    // Hillis-Steele inclusive scan.
    for (var stride: u32 = 1u; stride < TPB; stride *= 2u) {
        var add_val: u32 = 0u;
        if (t_local >= stride) { add_val = per_thread_count[t_local - stride]; }
        workgroupBarrier();
        if (t_local >= stride) { per_thread_count[t_local] += add_val; }
        workgroupBarrier();
    }

    if (t_local == 0u) {
        var max_rc: u32 = per_thread_count[0];
        for (var i: u32 = 1u; i < TPB; i += 1u) {
            let rc = per_thread_count[i] - per_thread_count[i - 1u];
            max_rc = max(max_rc, rc);
        }
        wg_q_total = max_rc + S;
        wg_slab_base = atomicAdd(&planner_meta[6], wg_q_total * TPB * 3u);
    }
    workgroupBarrier();

    let q_total = wg_q_total;
    let my_slab = wg_slab_base + t_local * q_total * 3u;

    // Write header (active threads only).
    if (is_active_thread) {
        queue_buf[2u * global_t + 0u] = my_slab;
        queue_buf[2u * global_t + 1u] = q_total;
    }

    // Phase B: emit queue entries.
    var entry_idx: u32 = 0u;
    if (is_active_thread && num_dense > 0u) {
        var partial_idx: u32 = 0u;
        var b = my_start_b;
        while (b < num_dense) {
            if (b > my_end_b) { break; }
            if (b == my_end_b && my_end_off == 0u && b != my_start_b) { break; }

            let adds = sorted_count_list[b] - 1u;
            let ps = select(0u, my_start_off, b == my_start_b);
            var pe = adds;
            if (b == my_end_b && my_end_off > 0u) { pe = my_end_off; }

            if (ps < pe) {
                let bucket_idx = sorted_bucket_list[b];
                let start_cursor = offsets[bucket_idx] + ps;
                let end_cursor = offsets[bucket_idx] + pe + 1u;

                let is_continuation = (ps > 0u);
                let is_full_end = (pe == adds);
                let is_whole = (!is_continuation && is_full_end);

                var dest_pack: u32;
                if (is_whole) {
                    dest_pack = bucket_idx;
                } else if (is_continuation) {
                    dest_pack = PARTIAL_BIT | (2u * global_t);
                } else {
                    dest_pack = PARTIAL_BIT | (2u * global_t + 1u);
                }

                let q_off = my_slab + entry_idx * 3u;
                queue_buf[QUEUE_HEADER_LEN + q_off + 0u] = start_cursor;
                queue_buf[QUEUE_HEADER_LEN + q_off + 1u] = end_cursor;
                queue_buf[QUEUE_HEADER_LEN + q_off + 2u] = dest_pack;
                entry_idx += 1u;
            }

            if (b == my_end_b) { break; }
            b += 1u;
        }
    }

    // Pad with IDLE entries (active threads only).
    while (is_active_thread && entry_idx < q_total) {
        let q_off = my_slab + entry_idx * 3u;
        queue_buf[QUEUE_HEADER_LEN + q_off + 0u] = IDLE_ANCHOR;
        queue_buf[QUEUE_HEADER_LEN + q_off + 1u] = IDLE_ANCHOR + 2u;
        queue_buf[QUEUE_HEADER_LEN + q_off + 2u] = IDLE_DEST;
        entry_idx += 1u;
    }

    {{{ recompile }}}
}
