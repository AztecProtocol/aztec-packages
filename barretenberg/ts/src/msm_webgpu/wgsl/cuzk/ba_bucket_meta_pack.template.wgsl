// Stream-walker planner support: pack sorted_bucket_list + sorted_count_list
// + offsets + cumulative_adds into a single vec4<u32>-per-bucket buffer so
// the walker stays within the 8-storage-binding mobile WebGPU limit.
//
// bucket_meta[i] = (sorted_bucket_id, count, offset_in_l0_index, cum_adds_prefix)
//
// One thread per dense bucket. Dispatched as ceil(num_dense/TPB) workgroups.

const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       sorted_count_list:  array<u32>;
@group(0) @binding(2) var<storage, read>       offsets:            array<u32>;
@group(0) @binding(3) var<storage, read>       cumulative_adds:    array<u32>;
@group(0) @binding(4) var<storage, read_write> bucket_meta:        array<vec4<u32>>;
@group(0) @binding(5) var<storage, read>       planner_meta:       array<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let num_dense = planner_meta[1];
    let b = gid.x;
    if (b >= num_dense) { return; }

    let bucket_id = sorted_bucket_list[b];
    bucket_meta[b] = vec4<u32>(
        bucket_id,
        sorted_count_list[b],
        offsets[bucket_id],
        cumulative_adds[b],
    );

    {{{ recompile }}}
}
