// Pair-tree v2: write each hot bucket's final partial to the unified
// red_buf at its reduce slot, also marking is_present.
//
// After MAX_LEVELS rounds of (pt_build + pt_combine), every hot bucket
// has converged to a single partial sitting at pt_buf[pt_off[hot_idx]].
// One thread per hot bucket copies that into red_buf at the unified
// reduce slot for that bucket.
//
// red_slot(bid) = (bid / BW) * STRIDE + (bid % BW - 1)
// (See UNIFIED_COMBINE_PLAN.md §Phase 2.)
//
// params.x = M_pt    (pt_buf plane stride)

const HOT_THRESHOLD: u32 = 8u;
const PG: u32 = 2u;
const BW:     u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
const M_RED:  u32 = {{ m_red }}u;

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

    let red_slot = ((bid / BW) + batch_offset.x) * STRIDE + (bid % BW - 1u);

    red_buf[PG * red_slot + 0u] = x0;
    red_buf[PG * red_slot + 1u] = x1;
    red_buf[PG * M_RED + PG * red_slot + 0u] = y0;
    red_buf[PG * M_RED + PG * red_slot + 1u] = y1;
    is_present[red_slot] = 1u;

    {{{ recompile }}}
}
