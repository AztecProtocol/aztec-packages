{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Finalize-ACCUMULATE kernel for the point-chunked bin-packed pair-tree.
//
// Identical harvesting to ba_finalize_copy_bench (one thread per bucket; the
// threads whose bucket reached count==1 write its single accumulated element to
// bucket_result[gb]) — except the per-MSM accumulate is now split into
// POINT-CHUNKS, so a bucket can be finalized by more than one chunk (a bucket
// whose points straddle a chunk boundary, or — the structured/profile-E case —
// a giant bucket finalized once per chunk). The first chunk to finalize a
// bucket COPIES; every later chunk AFFINE-ADDS its partial into the running
// bucket_result. `touched[gb]` (0/1 per global bucket, cleared once before the
// chunk loop) distinguishes first-vs-subsequent.
//
// bucket_result stays affine (the all-Jacobian reduce reads it + seeds Z), so
// the accumulate is a self-contained affine point-add — at most one inversion
// per (split bucket, chunk), i.e. O(#chunks) total, negligible. The two partials
// of one bucket are sums over disjoint point subsets of the same bucket; for the
// MSM's random SRS they are never ±each other, so the incomplete affine add does
// not hit the doubling/infinity case (matching the rest of the pipeline's
// no-collision assumption).
//
//   active_sums   : M elements per plane (params.y), 2-plane SoA PG=2
//   bucket_result : B_global elements per plane (params.w)
// params.x = B (this batch's bucket count = thread count), .y = M,
// params.z = bb_base (batch_bucket_base), .w = B_global plane stride.

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
@group(0) @binding(5) var<storage, read_write> touched:       array<u32>;
{{#l0_index_mode}}
@group(0) @binding(6) var<storage, read>       point_x:       array<vec4<u32>>;
@group(0) @binding(7) var<storage, read>       point_y:       array<vec4<u32>>;
{{/l0_index_mode}}

fn ld8(q0: vec4<u32>, q1: vec4<u32>) -> array<u32, 8> {
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

// Incomplete affine addition P + Q (Montgomery 8×u32), one inversion.
fn affine_add(x1: array<u32, 8>, y1: array<u32, 8>, x2: array<u32, 8>, y2: array<u32, 8>) -> array<array<u32, 8>, 2> {
    let dx = fr_sub_f8(x2, x1);
    let dy = fr_sub_f8(y2, y1);
    let dx_inv = {{ inv_fn }}(dx);
    let lambda = montgomery_product_f8(dy, dx_inv);
    let l2 = montgomery_product_f8(lambda, lambda);
    let x3 = fr_sub_f8(fr_sub_f8(l2, x1), x2);
    let y3 = fr_sub_f8(montgomery_product_f8(lambda, fr_sub_f8(x1, x3)), y1);
    return array<array<u32, 8>, 2>(x3, y3);
}

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

    // Materialize this chunk's partial for bucket b as affine (nx, ny).
    var nx: array<u32, 8>;
    var ny: array<u32, 8>;
{{#l0_index_mode}}
    let packed = active_sums[src];
    let pt = packed & 0x7fffffffu;
    nx = ld8(point_x[2u * pt + 0u], point_x[2u * pt + 1u]);
    let yraw = ld8(point_y[2u * pt + 0u], point_y[2u * pt + 1u]);
    if ((packed & 0x80000000u) == 0u) {
        ny = yraw;
    } else {
        let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        ny = fr_sub_f8(zero, yraw);
    }
{{/l0_index_mode}}
{{^l0_index_mode}}
    let src_x = 0u * PG * M + PG * src;
    let src_y = 1u * PG * M + PG * src;
    nx = ld8(active_sums[src_x + 0u], active_sums[src_x + 1u]);
    ny = ld8(active_sums[src_y + 0u], active_sums[src_y + 1u]);
{{/l0_index_mode}}

    if (touched[gb] == 0u) {
        // First chunk to finalize this bucket: write through.
        bucket_result[dst_x + 0u] = vec4<u32>(nx[0], nx[1], nx[2], nx[3]);
        bucket_result[dst_x + 1u] = vec4<u32>(nx[4], nx[5], nx[6], nx[7]);
        bucket_result[dst_y + 0u] = vec4<u32>(ny[0], ny[1], ny[2], ny[3]);
        bucket_result[dst_y + 1u] = vec4<u32>(ny[4], ny[5], ny[6], ny[7]);
        touched[gb] = 1u;
    } else {
        // Subsequent chunk: affine-add the partial into the running sum.
        let ex = ld8(bucket_result[dst_x + 0u], bucket_result[dst_x + 1u]);
        let ey = ld8(bucket_result[dst_y + 0u], bucket_result[dst_y + 1u]);
        let s = affine_add(ex, ey, nx, ny);
        bucket_result[dst_x + 0u] = vec4<u32>(s[0][0], s[0][1], s[0][2], s[0][3]);
        bucket_result[dst_x + 1u] = vec4<u32>(s[0][4], s[0][5], s[0][6], s[0][7]);
        bucket_result[dst_y + 0u] = vec4<u32>(s[1][0], s[1][1], s[1][2], s[1][3]);
        bucket_result[dst_y + 1u] = vec4<u32>(s[1][4], s[1][5], s[1][6], s[1][7]);
    }

    {{{ recompile }}}
}
