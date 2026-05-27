// Bucket-accumulate planner stage 1.1: 3-way classify.
//
// Partitions B_TOTAL buckets by count:
//   count == 0  → skip
//   count == 1  → size1_bucket_list  (consumed by ba_size1)
//   count >= 2  → dense_bucket_list + dense_count_list  (consumed by radix sort)
//
// Atomic counters in planner_meta[0] (num_size1) and planner_meta[1]
// (num_dense) track list lengths.

const B_TOTAL: u32 = {{ b_total }}u;

@group(0) @binding(0) var<storage, read>       counts:             array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:            array<u32>;
@group(0) @binding(2) var<storage, read_write> size1_bucket_list:  array<u32>;
@group(0) @binding(3) var<storage, read_write> dense_bucket_list:  array<u32>;
@group(0) @binding(4) var<storage, read_write> dense_count_list:   array<u32>;
@group(0) @binding(5) var<storage, read_write> planner_meta:       array<atomic<u32>>;
@group(0) @binding(6) var<uniform>             params:             vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let b = gid.x;
    if (b >= B_TOTAL) { return; }

    let n = counts[b];
    if (n == 0u) { return; }

    if (n == 1u) {
        let slot = atomicAdd(&planner_meta[0], 1u);
        size1_bucket_list[2u * slot + 0u] = b;
        size1_bucket_list[2u * slot + 1u] = offsets[b];
    } else {
        let slot = atomicAdd(&planner_meta[1], 1u);
        dense_bucket_list[slot] = b;
        dense_count_list[slot] = n;
    }

    {{{ recompile }}}
}
