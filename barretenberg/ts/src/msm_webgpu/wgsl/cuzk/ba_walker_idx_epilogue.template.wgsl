// walker_index v2 — E: bin offsets + indirect args epilogue.
//
// One workgroup of 64 threads (one per histogram bin). Thread 0 runs the
// same serial 64-bin exclusive scan + arg emission as the v1 sort_scan (so
// pt/cb dispatch args stay byte-identical); the other lanes zero
// bin_write_pos in parallel. Additionally emits the sorted-scatter (W5)
// indirect args from active_meta[0] and writes the alloc total to
// partial_offset[num_dense] (compat slot — nothing is known to read it).
//
// active_meta[0] = active_count, active_meta[1] = alloc total.

const MAX_N: u32 = 64u;
const HOT_THRESHOLD: u32 = 8u;
const PT_TPB: u32 = 64u;
const CB_TPB: u32 = 64u;
const CB_S: u32 = 8u;
const SORT_TPB: u32 = {{ sort_tpb }}u;

@group(0) @binding(0) var<storage, read>       count_histogram:    array<u32>;
@group(0) @binding(1) var<storage, read_write> active_meta:        array<u32>;
@group(0) @binding(2) var<storage, read_write> bin_offsets:        array<u32>;
@group(0) @binding(3) var<storage, read_write> bin_write_pos:      array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> pt_dispatch_args:   array<u32>;
@group(0) @binding(5) var<storage, read_write> pt_persistent_args: array<u32>;
@group(0) @binding(6) var<storage, read_write> cb_dispatch_args:   array<u32>;
@group(0) @binding(7) var<storage, read_write> wi_idx_args:        array<u32>;
@group(0) @binding(8) var<storage, read_write> partial_offset:     array<u32>;
@group(0) @binding(9) var<storage, read>       planner_meta:       array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    atomicStore(&bin_write_pos[l], 0u);
    if (l != 0u) { return; }

    var sum: u32 = 0u;
    var hot_count: u32 = 0u;
    var cb_count: u32 = 0u;
    for (var i: u32 = 0u; i < MAX_N; i = i + 1u) {
        bin_offsets[i] = sum;
        sum = sum + count_histogram[i];
        if (i > HOT_THRESHOLD) { hot_count = hot_count + count_histogram[i]; }
        if (i >= 2u) { cb_count = cb_count + count_histogram[i]; }
    }
    let dx = (hot_count + PT_TPB - 1u) / PT_TPB;
    pt_dispatch_args[0] = dx;
    pt_dispatch_args[1] = 1u;
    pt_dispatch_args[2] = 1u;
    pt_persistent_args[0] = 0u;
    pt_persistent_args[1] = 1u;
    pt_persistent_args[2] = 1u;
    let cb = (cb_count + CB_TPB * CB_S - 1u) / (CB_TPB * CB_S);
    cb_dispatch_args[0] = cb;
    cb_dispatch_args[1] = 1u;
    cb_dispatch_args[2] = 1u;

    // W5 (sorted scatter) indirect args from the true active count.
    let n_active = active_meta[0];
    wi_idx_args[6] = (n_active + SORT_TPB - 1u) / SORT_TPB;
    wi_idx_args[7] = 1u;
    wi_idx_args[8] = 1u;

    // Compat: the v1 scan published the total at partial_offset[num_dense].
    partial_offset[planner_meta[1]] = active_meta[1];

    {{{ recompile }}}
}
