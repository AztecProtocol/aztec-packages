// walker_index analytic (wi3) — K1′: per-task departure counting.
//
// One thread per walker task j = t*S + k (task-wide, coalesced task_cuts
// reads — NO partial_dest pass). Ports ba_stream_walker's init rules in
// (bucket, point-offset) space and counts each task's "departure": a task
// whose piece starts strictly inside a bucket (split-start) emits exactly
// one partial for that bucket (DEPARTURE), and a task ending mid-bucket in
// a bucket it did not split-start emits exactly one partial there (the
// unique ARRIVAL). departures + arrival = the bucket's full partial count,
// so partial_count[fb] is complete after this kernel and idx_alloc runs
// unchanged. (count == 1 is structurally impossible; WALKER_INDEX_PLAN.md §S4.)
//
// Emission model (verified against ba_stream_walker init + retire):
//   cut (sb, so):  so == 0          → fresh at sb        (no departure)
//                  so + 1 <  c_sb   → split-start at sb  (DEPARTURE)
//                  so + 1 == c_sb   → fresh at sb + 1    (no departure)
//   end (eb, eo):  te = eb, consumed through point eo (te_pt = eo + 1);
//                  eo == 0 && eb > 0 → te = eb-1 fully consumed
//                  (unreachable from planner cuts; kept for bit-fidelity).
//   empty piece (eff > te || (eff == te && start_pt >= te_pt)): no emission.
//
// task_cuts and partial_count are disjoint sub-ranges of the A2 arena,
// bound separately with the same (storage) usage class.
//
// params.x = BW

const S: u32 = {{ s }}u;
const CUTS: u32 = S + 1u;
const THREAD_TPB: u32 = {{ thread_tpb }}u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read_write> task_cuts:          array<u32>;
@group(0) @binding(1) var<storage, read_write> partial_count:      array<atomic<u32>>;
@group(0) @binding(2) var<storage, read>       sorted_count_list:  array<u32>;
@group(0) @binding(3) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(4) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(5) var<uniform>             params:             vec4<u32>;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let j = gid.x;
    let nat = planner_meta[3] * THREAD_TPB;
    if (j >= nat * S) { return; }
    let t = j / S;
    let k = j % S;
    let cut_base = t * CUTS * 2u;

    let sb = task_cuts[cut_base + k * 2u + 0u];
    let so = task_cuts[cut_base + k * 2u + 1u];
    let eb = task_cuts[cut_base + (k + 1u) * 2u + 0u];
    let eo = task_cuts[cut_base + (k + 1u) * 2u + 1u];

    // Start normalization (walker init, point space).
    let c_sb = sorted_count_list[sb];
    var eff: u32 = sb;
    var start_pt: u32 = 0u;
    var split: bool = false;
    if (so == 0u) {
        // fresh at sb
    } else if (so + 1u < c_sb) {
        start_pt = so + 1u;
        split = true;
    } else {
        eff = sb + 1u;
    }

    // End normalization.
    var te: u32;
    var te_pt: u32;
    if (eo > 0u) {
        te = eb;
        te_pt = eo + 1u;
    } else if (eb > 0u) {
        te = eb - 1u;
        te_pt = sorted_count_list[te];
    } else {
        te = 0u;
        te_pt = 0u;
    }

    // Empty piece → no emission.
    if (eff > te || (eff == te && start_pt >= te_pt)) { return; }

    // E1 departure: split-start pieces emit exactly one partial for eff.
    if (split) {
        let bid = sorted_bucket_list[eff];
        atomicAdd(&partial_count[flat_bid(bid, params.x)], 1u);
    }

    // E2 arrival: ends mid-bucket in a bucket it did not split-start.
    if (te_pt < sorted_count_list[te] && (te > eff || !split)) {
        let bid = sorted_bucket_list[te];
        atomicAdd(&partial_count[flat_bid(bid, params.x)], 1u);
    }

    {{{ recompile }}}
}
