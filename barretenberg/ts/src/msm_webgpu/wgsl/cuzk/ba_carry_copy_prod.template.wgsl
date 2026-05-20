{{> structs }}

// Carry-copy kernel — prod variant for the v2 pair-tree integration.
// num_carries is read from the planner's totals[1] and dispatch is
// indirect via totals[7..9].

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       carry_plan:      array<u32>;
@group(0) @binding(1) var<storage, read>       active_sums_old: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       totals:          array<u32>;
@group(0) @binding(4) var<uniform>             consts:          vec4<u32>;
// consts.x = M_old
// consts.y = M_new

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = totals[1];
    let M_old = consts.x;
    let M_new = consts.y;
    let t = gid.x;
    if (t >= T) { return; }

    let src_idx = carry_plan[2u * t + 0u];
    let dst_idx = carry_plan[2u * t + 1u];

    let old_plane_x = 0u * PG * M_old;
    let old_plane_y = 1u * PG * M_old;
    let new_plane_x = 0u * PG * M_new;
    let new_plane_y = 1u * PG * M_new;

    let src_x = old_plane_x + PG * src_idx;
    let src_y = old_plane_y + PG * src_idx;
    let dst_x = new_plane_x + PG * dst_idx;
    let dst_y = new_plane_y + PG * dst_idx;

    active_sums_new[dst_x + 0u] = active_sums_old[src_x + 0u];
    active_sums_new[dst_x + 1u] = active_sums_old[src_x + 1u];
    active_sums_new[dst_y + 0u] = active_sums_old[src_y + 0u];
    active_sums_new[dst_y + 1u] = active_sums_old[src_y + 1u];

    {{{ recompile }}}
}
