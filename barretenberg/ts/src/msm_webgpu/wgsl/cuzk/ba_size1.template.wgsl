{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bucket-accumulate: size-1 bucket handler.
//
// One thread per size-1 bucket. Reads (bucket_idx, l0_slot) from
// size1_bucket_list, loads the SRS point (with sign negation on y),
// and writes directly to bucket_sums.
//
// params.x = M_buckets (bucket_sums plane stride = B_TOTAL)
// params.y = bucket_base (global bucket offset for THIS batch = bi*batchBuckets;
//            0 at nb=1). size1_bucket_list holds LOCAL bucket ids in
//            [0, batchBuckets); adding the base writes each batch's disjoint
//            global slice of the full-bTotal bucket_sums.
//
// Dispatch: indirect from planner_meta (ceil(num_size1 / 64), 1, 1).

const PG: u32 = 2u;
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;

@group(0) @binding(0) var<storage, read>       size1_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       l0_index:          array<u32>;
@group(0) @binding(2) var<storage, read>       point_x:           array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       point_y:           array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> bucket_sums:       array<vec4<u32>>;
@group(0) @binding(5) var<storage, read>       planner_meta:      array<u32>;
@group(0) @binding(6) var<uniform>             params:            vec4<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    let num_size1 = planner_meta[0];
    let M_buckets = params.x;

    if (i >= num_size1) { return; }

    let bucket_idx = size1_bucket_list[2u * i + 0u] + params.y;
    let l0_slot = size1_bucket_list[2u * i + 1u];

    let packed = l0_index[l0_slot];
    let pt = packed & L0_IDX_MASK;
    let sign = (packed & L0_SIGN_BIT) != 0u;

    let q0x = point_x[2u * pt];
    let q1x = point_x[2u * pt + 1u];
    let x_val: array<u32, 8> = array<u32, 8>(q0x.x, q0x.y, q0x.z, q0x.w, q1x.x, q1x.y, q1x.z, q1x.w);

    let q0y = point_y[2u * pt];
    let q1y = point_y[2u * pt + 1u];
    var y_val: array<u32, 8> = array<u32, 8>(q0y.x, q0y.y, q0y.z, q0y.w, q1y.x, q1y.y, q1y.z, q1y.w);

    if (sign) {
        let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        y_val = fr_sub_f8(zero, y_val);
    }

    let base_x = 0u * PG * M_buckets + PG * bucket_idx;
    bucket_sums[base_x + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    bucket_sums[base_x + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);

    let base_y = 1u * PG * M_buckets + PG * bucket_idx;
    bucket_sums[base_y + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    bucket_sums[base_y + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);

    {{{ recompile }}}
}
