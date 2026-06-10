{{#l0_index_mode}}
{{> field8_funcs }}
{{/l0_index_mode}}

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
// Pure memory shuffle, no field arithmetic — except lever B's
// `l0_index_mode`, where active_sums is the level-0 (point index |
// sign<<31) array: the element is materialized by gathering the point
// from the pool and negating y on the sign bit.
//
// Layouts (2-plane SoA, PG=2 vec4 per element):
//   active_sums   : M elements per plane (params.y)
//   bucket_result : B_global elements per plane (params.w)
//
// params.x = B        (this batch's bucket count = thread count)
// params.y = M        (active_sums vec4-stride length)
// params.z = bb_base  (lever G: batch_bucket_base)
// params.w = B_global (global bucket_result plane stride)

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       counts:        array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:       array<u32>;
{{#l0_index_mode}}
@group(0) @binding(2) var<storage, read>       active_sums:   array<u32>;
{{/l0_index_mode}}
{{^l0_index_mode}}
@group(0) @binding(2) var<storage, read>       active_sums:   array<vec4<u32>>;
{{/l0_index_mode}}
@group(0) @binding(3) var<storage, read_write> bucket_result: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:        vec4<u32>;
{{#l0_index_mode}}
@group(0) @binding(5) var<storage, read>       point_x:       array<vec4<u32>>;
@group(0) @binding(6) var<storage, read>       point_y:       array<vec4<u32>>;
{{/l0_index_mode}}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let B = params.x;
    let M = params.y;
    let bb_base = params.z;
    let b_global_stride = params.w;
    let b = gid.x;
    if (b >= B) { return; }
    if (counts[b] != 1u) { return; }

    let src = offsets[b];
    let gb = b + bb_base;
    let dst_x = 0u * PG * b_global_stride + PG * gb;
    let dst_y = 1u * PG * b_global_stride + PG * gb;

{{#l0_index_mode}}
    // Lever B: the element is a level-0 (point index | sign<<31). Gather
    // the point from the pool, negate y on the sign bit.
    let packed = active_sums[src];
    let pt = packed & 0x7fffffffu;
    bucket_result[dst_x + 0u] = point_x[2u * pt + 0u];
    bucket_result[dst_x + 1u] = point_x[2u * pt + 1u];
    if ((packed & 0x80000000u) == 0u) {
        bucket_result[dst_y + 0u] = point_y[2u * pt + 0u];
        bucket_result[dst_y + 1u] = point_y[2u * pt + 1u];
    } else {
        let q0 = point_y[2u * pt + 0u];
        let q1 = point_y[2u * pt + 1u];
        var w: array<u32, 8>;
        w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
        w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
        // Pool y is a curve point's coordinate (y ≢ 0 mod p, < 2p), so the
        // unconditional 2p - y stays in (0, 2p).
        let nw = fr_neg_wide_f8(w);
        bucket_result[dst_y + 0u] = vec4<u32>(nw[0], nw[1], nw[2], nw[3]);
        bucket_result[dst_y + 1u] = vec4<u32>(nw[4], nw[5], nw[6], nw[7]);
    }
{{/l0_index_mode}}
{{^l0_index_mode}}
    let src_x = 0u * PG * M + PG * src;
    let src_y = 1u * PG * M + PG * src;
    bucket_result[dst_x + 0u] = active_sums[src_x + 0u];
    bucket_result[dst_x + 1u] = active_sums[src_x + 1u];
    bucket_result[dst_y + 0u] = active_sums[src_y + 0u];
    bucket_result[dst_y + 1u] = active_sums[src_y + 1u];
{{/l0_index_mode}}

    {{{ recompile }}}
}
