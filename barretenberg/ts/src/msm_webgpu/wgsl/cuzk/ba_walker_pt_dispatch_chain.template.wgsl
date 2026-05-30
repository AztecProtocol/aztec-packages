// Pair-tree v3: chained dispatch_compute.
//
// Writes BOTH per-level indirect args:
//   pt_combine_args  = (ceil(total / S / TPB), 1, 1)   — sizes combine.
//   pt_build_args    = (hot_wgs,               1, 1)   — sizes next level's
//                      build IF this level emitted work, else (0, 1, 1).
//
// Effect: once a level emits zero pair-tasks (all buckets converged), every
// subsequent level's build dispatches 0 WGs. The remaining dispatches are
// still recorded in the command buffer but become near-zero cost
// (dispatch_compute is 1 thread; build & combine are 0 WGs).
//
// hot_wgs is read from pt_hot_args (sort_scan-produced indirect args for
// the pre-loop init kernels). Sort_scan also initialises pt_build_args to
// (hot_wgs, 1, 1) so level 0's build runs unconditionally.

const S: u32 = 8u;
const PT_TPB: u32 = 64u;

@group(0) @binding(0) var<storage, read>       pt_total_tasks: array<u32>;
@group(0) @binding(1) var<storage, read_write> pt_combine_args: array<u32>;
@group(0) @binding(2) var<storage, read_write> pt_build_args:   array<u32>;
@group(0) @binding(3) var<storage, read>       pt_hot_args:     array<u32>;

@compute @workgroup_size(1)
fn main() {
    let total = pt_total_tasks[0];
    let threads_needed = (total + S - 1u) / S;
    let combine_wgs = (threads_needed + PT_TPB - 1u) / PT_TPB;
    pt_combine_args[0] = combine_wgs;
    pt_combine_args[1] = 1u;
    pt_combine_args[2] = 1u;

    if (total > 0u) {
        pt_build_args[0] = pt_hot_args[0];
    } else {
        pt_build_args[0] = 0u;
    }
    pt_build_args[1] = 1u;
    pt_build_args[2] = 1u;

    {{{ recompile }}}
}
