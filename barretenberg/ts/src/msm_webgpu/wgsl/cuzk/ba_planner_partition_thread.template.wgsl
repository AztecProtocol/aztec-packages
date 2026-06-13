// Bucket-accumulate planner stage 1.5: per-thread partition.
//
// Refines workgroup cuts into per-thread cuts. Each thread t in
// workgroup w binary-searches cumulative_adds within its workgroup's
// range to find the bucket where its share of work starts.

const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       sorted_count_list: array<u32>;
@group(0) @binding(1) var<storage, read>       cumulative_adds:   array<u32>;
@group(0) @binding(2) var<storage, read>       wg_cuts:           array<u32>;
@group(0) @binding(3) var<storage, read>       planner_meta:      array<u32>;
@group(0) @binding(4) var<storage, read_write> thread_cuts:       array<u32>;
@group(0) @binding(5) var<uniform>             params:            vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let t = lid.x;
    let wg = wid.x;
    let num_workgroups = planner_meta[3];
    let total_adds = planner_meta[2];
    let num_dense = planner_meta[1];

    if (wg >= num_workgroups) { return; }

    // wg_cuts[2*w] is the END cut for workgroup w (where its work ends).
    // Start of wg 0 is bucket 0; start of wg w>0 is wg_cuts[2*(w-1)].
    let wg_start_adds = (wg * total_adds) / num_workgroups;
    let wg_end_adds = ((wg + 1u) * total_adds) / num_workgroups;
    let wg_total = wg_end_adds - wg_start_adds;

    let cut_target = wg_start_adds + ((t * wg_total) / TPB);

    var wg_lo_bucket: u32 = 0u;
    if (wg > 0u) {
        wg_lo_bucket = wg_cuts[2u * (wg - 1u) + 0u];
    }
    let wg_hi_bucket = min(wg_cuts[2u * wg + 0u] + 1u, num_dense);

    // Binary search for the bucket containing this thread's cut_target.
    var lo: u32 = wg_lo_bucket;
    var hi: u32 = wg_hi_bucket;
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

    let flat = wg * TPB + t;
    thread_cuts[2u * flat + 0u] = cut_bucket;
    thread_cuts[2u * flat + 1u] = cut_offset;

    {{{ recompile }}}
}
