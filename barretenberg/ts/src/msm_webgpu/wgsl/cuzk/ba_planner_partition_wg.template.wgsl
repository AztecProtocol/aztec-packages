// Bucket-accumulate planner stage 1.4: workgroup partition.
//
// For each workgroup w in [0, num_workgroups), binary-search
// cumulative_adds to find the bucket index where this workgroup's
// share of total_adds starts. Writes wg_cuts[2*w+0] = bucket_idx,
// wg_cuts[2*w+1] = offset within that bucket's adds.

@group(0) @binding(0) var<storage, read>       sorted_count_list: array<u32>;
@group(0) @binding(1) var<storage, read>       cumulative_adds:   array<u32>;
@group(0) @binding(2) var<storage, read>       planner_meta:      array<u32>;
@group(0) @binding(3) var<storage, read_write> wg_cuts:           array<u32>;
@group(0) @binding(4) var<uniform>             params:            vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let w = lid.x;
    let num_workgroups = planner_meta[3];
    let total_adds = planner_meta[2];
    let num_dense = planner_meta[1];

    if (w >= num_workgroups) { return; }

    let cut_target = ((w + 1u) * total_adds) / num_workgroups;

    // Binary search for smallest i with cumulative_adds[i] + (sorted_count_list[i] - 1) >= cut_target,
    // i.e. the bucket whose cumulative range contains the cut_target.
    var lo: u32 = 0u;
    var hi: u32 = num_dense;
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

    wg_cuts[2u * w + 0u] = cut_bucket;
    wg_cuts[2u * w + 1u] = cut_offset;

    {{{ recompile }}}
}
