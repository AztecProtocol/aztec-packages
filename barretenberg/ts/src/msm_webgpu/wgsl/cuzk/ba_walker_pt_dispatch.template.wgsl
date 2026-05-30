// Pair-tree v2: write pt_combine's indirect dispatch args.
//
// pt_build sums all per-level tasks into pt_total_tasks. We convert that
// into (ceil(total / S / TPB), 1, 1) so pt_combine right-sizes its
// workgroup launch — no over-dispatch even when only a handful of
// pair-tasks remain in late levels.
//
// Also resets pt_total_tasks to 0 for the NEXT level's pt_build, so the
// driver loop doesn't need a separate clear pass per level.

const S: u32 = 8u;
const PT_TPB: u32 = 64u;

@group(0) @binding(0) var<storage, read_write> pt_total_tasks: array<u32>;
@group(0) @binding(1) var<storage, read_write> pt_dispatch:    array<u32>;

@compute @workgroup_size(1)
fn main() {
    let total = pt_total_tasks[0];
    let threads_needed = (total + S - 1u) / S;
    let wgs = (threads_needed + PT_TPB - 1u) / PT_TPB;
    pt_dispatch[0] = wgs;
    pt_dispatch[1] = 1u;
    pt_dispatch[2] = 1u;
    // NOTE: We do NOT reset pt_total_tasks here — pt_combine reads it
    // after us, so the value must survive. The TS driver clears
    // pt_total_tasks via enc.clearBuffer between levels (before each
    // pt_build dispatch).

    {{{ recompile }}}
}
