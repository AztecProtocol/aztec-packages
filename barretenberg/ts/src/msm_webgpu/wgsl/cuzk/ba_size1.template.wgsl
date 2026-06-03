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
// and writes directly into red_buf at the unified-buffer slot for that
// bucket, also marking is_present[slot] = 1.
//
// bid is the packed-window id (window << 15 | mag). red_slot =
// (window + batch_offset) * STRIDE + (mag - 1), batch_offset = params.x.
// (See UNIFIED_COMBINE_PLAN.md §Phase 2, SPLIT_C_PLAN.md for the bid encoding.)
//
// Dispatch: indirect from planner_meta (ceil(num_size1 / 64), 1, 1).

const PG: u32 = 2u;
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;
const BW:    u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
// M_RED (red_buf Y-plane stride) is runtime in params.z (= Σ redM for a packed
// multi-MSM pass, = this MSM's redM otherwise — byte-identical to the old baked M_RED).
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       size1_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       l0_index:          array<u32>;
@group(0) @binding(2) var<storage, read>       point_x:           array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       point_y:           array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> red_buf:           array<vec4<u32>>;
@group(0) @binding(5) var<storage, read>       planner_meta:      array<u32>;
// params.x = batch_offset = bi * batchWindows — added to the bucket's local
// window so each window-batch's size-1 buckets land in their GLOBAL red_buf
// slice, exactly as ba_stream_walker / ba_walker_combine_filter do. 0 when
// numBatches == 1.
@group(0) @binding(6) var<uniform>             params:            vec4<u32>;
@group(0) @binding(7) var<storage, read_write> is_present:        array<u32>;
// WindowDesc as a uniform array<vec4<u32>> (row g = 2 vec4): reduce_off
// (red_buf base for GLOBAL window g) = u32 +4 = vec4[g*2+1].x. Uniform (not
// storage) keeps the at-cap consumers within the 10-storage-buffer limit; used
// here too for one consistent decode across all bid consumers.
@group(0) @binding(8) var<uniform> window_desc: array<vec4<u32>, 256>;
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * 2u + 1u].x; }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    let num_size1 = planner_meta[0];

    if (i >= num_size1) { return; }

    let bucket_idx = size1_bucket_list[2u * i + 0u];
    let l0_slot    = size1_bucket_list[2u * i + 1u];

    // Magnitude is guaranteed in [1, STRIDE] — ba_planner_classify filters
    // out zero-digit and BW-padding buckets before they reach size1_bucket_list.

    let packed = l0_index[l0_slot];
    let pt   = packed & L0_IDX_MASK;
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

    let window = bucket_idx >> WBID_SHIFT;
    let mag = bucket_idx & WBID_MAG_MASK;
    // Global window = batch-local window + batch_offset (params.x).
    let red_slot = wd_reduce_off(window + params.x) + (mag - 1u);

    let base_x = PG * red_slot;
    red_buf[base_x + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    red_buf[base_x + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);

    let base_y = PG * params.z + PG * red_slot;
    red_buf[base_y + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    red_buf[base_y + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);

    is_present[red_slot] = 1u;

    {{{ recompile }}}
}
