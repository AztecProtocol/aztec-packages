// Pair-tree v2: write each hot bucket's final partial to the unified
// red_buf at its reduce slot, also marking is_present.
//
// After MAX_LEVELS rounds of (pt_build + pt_combine), every hot bucket
// has converged to a single partial sitting at pt_buf[pt_off[hot_idx]].
// One thread per hot bucket copies that into red_buf at the unified
// reduce slot for that bucket.
//
// bid is the packed-window id (window << 15 | mag). red_slot =
// (window + batch_offset) * STRIDE + (mag - 1).
// (See UNIFIED_COMBINE_PLAN.md §Phase 2, SPLIT_C_PLAN.md for the bid encoding.)
//
// params.x = M_pt    (pt_buf plane stride)

const HOT_THRESHOLD: u32 = 8u;
const PG: u32 = 2u;
const BW:     u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
// M_RED (red_buf Y-plane stride) is runtime in batch_offset.z (= Σ redM packed,
// = this MSM's redM otherwise — byte-identical to the old baked M_RED).
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       sorted_active:  array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:    array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:   array<u32>;
@group(0) @binding(3) var<storage, read>       pt_off:         array<u32>;
@group(0) @binding(4) var<storage, read>       pt_buf:         array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> red_buf:        array<vec4<u32>>;
@group(0) @binding(6) var<uniform>             params:         vec4<u32>;
@group(0) @binding(7) var<storage, read_write> is_present:     array<u32>;
// batch_offset.x = bi * batchWindows — added to local window index for red_slot.
@group(0) @binding(8) var<uniform>             batch_offset:   vec4<u32>;
// WindowDesc as uniform array<vec4<u32>> (row g = 2 vec4): reduce_off (u32 +4)
// = vec4[g*2+1].x. See ba_size1 for why this is a uniform.
@group(0) @binding(9) var<uniform>             window_desc:    array<vec4<u32>, 256>;
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * 2u + 1u].x; }

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let hot_idx = gid.x;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    if (cool_end + hot_idx >= NUM_ACTIVE) { return; }

    let bid = sorted_active[cool_end + hot_idx];
    let M_pt = params.x;
    let idx = pt_off[hot_idx];

    let x0 = pt_buf[PG * idx + 0u];
    let x1 = pt_buf[PG * idx + 1u];
    let y0 = pt_buf[PG * M_pt + PG * idx + 0u];
    let y1 = pt_buf[PG * M_pt + PG * idx + 1u];

    let window = bid >> WBID_SHIFT;
    let mag = bid & WBID_MAG_MASK;
    let red_slot = wd_reduce_off(window + batch_offset.x) + (mag - 1u);

    red_buf[PG * red_slot + 0u] = x0;
    red_buf[PG * red_slot + 1u] = x1;
    red_buf[PG * batch_offset.z + PG * red_slot + 0u] = y0;
    red_buf[PG * batch_offset.z + PG * red_slot + 1u] = y1;
    is_present[red_slot] = 1u;

    {{{ recompile }}}
}
