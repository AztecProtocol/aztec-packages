{{> structs }}

// Finalize-copy kernel for the bin-packed pair-tree MSM bucket-accumulate.
//
// The planner's finalize-and-drop sets a bucket's next-level count to 0
// once it reaches count 1 — at that point the bucket's single element
// (active_sums[offsets[b]]) IS its accumulated sum. This kernel harvests
// it: one thread per bucket, and the threads whose bucket has count 1
// copy that element into bucket_result[b]. Run once per level; across
// all levels every bucket is harvested exactly once (a finalized bucket
// has count 0 thereafter, so it is never seen at count 1 again).
//
// Pure memory shuffle, no field arithmetic.
//
// Layouts (2-plane SoA, PG=2 vec4 per element):
//   active_sums   : M elements per plane (params.y)
//   bucket_result : B elements per plane (params.x)
//
// params.x = B   (bucket count = thread count)
// params.y = M   (active_sums vec4-stride length)

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       counts:        array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:       array<u32>;
@group(0) @binding(2) var<storage, read>       active_sums:   array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> bucket_result: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:        vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let B = params.x;
    let M = params.y;
    let b = gid.x;
    if (b >= B) { return; }
    if (counts[b] != 1u) { return; }

    let src = offsets[b];
    let src_x = 0u * PG * M + PG * src;
    let src_y = 1u * PG * M + PG * src;
    let dst_x = 0u * PG * B + PG * b;
    let dst_y = 1u * PG * B + PG * b;

    bucket_result[dst_x + 0u] = active_sums[src_x + 0u];
    bucket_result[dst_x + 1u] = active_sums[src_x + 1u];
    bucket_result[dst_y + 0u] = active_sums[src_y + 0u];
    bucket_result[dst_y + 1u] = active_sums[src_y + 1u];

    {{{ recompile }}}
}
