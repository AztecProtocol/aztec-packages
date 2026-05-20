{{> structs }}

// Carry-copy kernel for the bin-packed pair-tree MSM bucket-accumulate.
//
// For each carry slot t, copies one packed (x, y) point from
// active_sums_old[carry_plan[2*t + 0]] to
// active_sums_new[carry_plan[2*t + 1]].
//
// Used when a bucket has an odd active count at the current level:
// floor(N_b / 2) elements get paired and produce floor(N_b / 2) sums
// in the next level, plus the (N_b mod 2 == 1) carry element propagates
// forward unchanged.
//
// Pure memory shuffle, no field arithmetic.
//
// params.x = T (number of carry-copies / threads)
// params.y = M_old (active_sums_old size, vec4-stride scaling)
// params.z = M_new (active_sums_new size, vec4-stride scaling)

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       carry_plan:      array<u32>;
@group(0) @binding(1) var<storage, read>       active_sums_old: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:          vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M_old = params.y;
    let M_new = params.z;
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
