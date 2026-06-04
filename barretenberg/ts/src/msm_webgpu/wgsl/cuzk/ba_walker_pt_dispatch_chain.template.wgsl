// Pair-tree v3: chained dispatch_compute, with cooperative-tail switchover.
//
// Writes the per-level indirect args:
//   pt_combine_args  = (ceil(total / S / TPB), 1, 1)   — sizes combine.
//   pt_build_args    = (hot_wgs,               1, 1)   — sizes next level's
//                      build IF this level emitted work, else (0, 1, 1).
//   pt_coop_args     = (0, 1, 1) normally; (min(NUM_HOT,65535),
//                      ceil(NUM_HOT/65535), 1) on the one level the coop fires.
//
// Once a level emits zero pair-tasks (all buckets converged), every subsequent
// level's build dispatches 0 WGs. The remaining dispatches are still recorded
// in the command buffer but become near-zero cost.
//
// COOPERATIVE TAIL: the pair-tree's deep levels are a serial chain of starved
// dispatches. The moment every hot bucket's remaining count (pt_count, set by
// this level's pt_build to the count this level's combine will OUTPUT) fits one
// workgroup, we let this combine run (it produces that <= CAP slice) and fire
// the coop kernel after it — one workgroup per hot bucket reduces the slice and
// writes red_buf directly. So the build stops (pt_build_args -> 0) and
// pt_finalize is neutralised (pt_hot_args -> 0, which both ends the build chain
// and zeroes pt_finalize's indirect dispatch). pt_hot_args[0] == 0 doubles as
// the "already fired" sentinel so the coop fires exactly once.
//
// hot_wgs is read from pt_hot_args (sort_scan-produced indirect args). Sort_scan
// initialises pt_build_args to (hot_wgs, 1, 1) so level 0's build runs.

const S: u32 = 8u;
const PT_TPB: u32 = 64u;
const COOP_CAP: u32 = {{ coop_cap }}u;

@group(0) @binding(0) var<storage, read>       pt_total_tasks:  array<u32>;
@group(0) @binding(1) var<storage, read_write> pt_combine_args: array<u32>;
@group(0) @binding(2) var<storage, read_write> pt_build_args:   array<u32>;
@group(0) @binding(3) var<storage, read_write> pt_hot_args:     array<u32>;
@group(0) @binding(4) var<storage, read>       pt_count:        array<u32>;
@group(0) @binding(5) var<storage, read>       pt_meta:         array<u32>;
@group(0) @binding(6) var<storage, read_write> pt_coop_args:    array<u32>;

@compute @workgroup_size(1)
fn main() {
    let total = pt_total_tasks[0];
    let threads_needed = (total + S - 1u) / S;
    let combine_wgs = (threads_needed + PT_TPB - 1u) / PT_TPB;
    pt_combine_args[0] = combine_wgs;
    pt_combine_args[1] = 1u;
    pt_combine_args[2] = 1u;

    pt_coop_args[0] = 0u;
    pt_coop_args[1] = 1u;
    pt_coop_args[2] = 1u;

    let hot_wgs = pt_hot_args[0];      // 0 once the coop has already fired
    let NUM_HOT = pt_meta[0];
    var maxc: u32 = 0u;
    for (var h: u32 = 0u; h < NUM_HOT; h = h + 1u) {
        maxc = max(maxc, pt_count[h]);
    }

    let fire = (total > 0u) && (hot_wgs > 0u) && (maxc <= COOP_CAP);
    if (fire) {
        pt_coop_args[0] = min(NUM_HOT, 65535u);
        pt_coop_args[1] = (NUM_HOT + 65534u) / 65535u;
        pt_build_args[0] = 0u;
        pt_hot_args[0] = 0u;
    } else if (total > 0u) {
        pt_build_args[0] = hot_wgs;
    } else {
        pt_build_args[0] = 0u;
    }
    pt_build_args[1] = 1u;
    pt_build_args[2] = 1u;

    {{{ recompile }}}
}
