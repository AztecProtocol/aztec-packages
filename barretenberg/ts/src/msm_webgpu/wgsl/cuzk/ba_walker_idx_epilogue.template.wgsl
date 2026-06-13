// walker_index v2 — E: bin offsets + sorted-scatter args.
//
// One workgroup of 64 threads (one per histogram bin). Thread 0 runs the
// serial 64-bin exclusive scan and emits the sorted-scatter (W5) indirect
// args from active_meta[0]; the other lanes zero bin_write_pos in
// parallel. The addition-schedule planner (wi_sched_plan, after the sort)
// consumes the scan.
//
// active_meta[0] = active_count, active_meta[1] = alloc total.

const MAX_N: u32 = 64u;
const SORT_TPB: u32 = {{ sort_tpb }}u;

@group(0) @binding(0) var<storage, read>       count_histogram: array<u32>;
@group(0) @binding(1) var<storage, read_write> active_meta:     array<u32>;
@group(0) @binding(2) var<storage, read_write> bin_offsets:     array<u32>;
@group(0) @binding(3) var<storage, read_write> bin_write_pos:   array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> wi_idx_args:     array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    atomicStore(&bin_write_pos[l], 0u);
    if (l != 0u) { return; }

    var sum: u32 = 0u;
    for (var i: u32 = 0u; i < MAX_N; i = i + 1u) {
        bin_offsets[i] = sum;
        sum = sum + count_histogram[i];
    }

    // W5 (sorted scatter) indirect args from the true active count.
    let n_active = active_meta[0];
    wi_idx_args[6] = (n_active + SORT_TPB - 1u) / SORT_TPB;
    wi_idx_args[7] = 1u;
    wi_idx_args[8] = 1u;

    {{{ recompile }}}
}
