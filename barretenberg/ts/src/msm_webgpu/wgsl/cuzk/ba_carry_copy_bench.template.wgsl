{{#l0_index_mode}}
{{> field8_funcs }}
{{/l0_index_mode}}

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
// Pure memory shuffle, no field arithmetic — except lever B's
// `l0_index_mode`, where active_sums_old is the level-0 (point index |
// sign<<31) array: the carry element is materialized by gathering the
// point from the pool and negating y on the sign bit.
//
// params.x = T (number of carry-copies / threads)
// params.y = M_old (active_sums_old size, vec4-stride scaling)
// params.z = M_new (active_sums_new size, vec4-stride scaling)

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       carry_plan:      array<u32>;
{{#l0_index_mode}}
@group(0) @binding(1) var<storage, read>       active_sums_old: array<u32>;
{{/l0_index_mode}}
{{^l0_index_mode}}
@group(0) @binding(1) var<storage, read>       active_sums_old: array<vec4<u32>>;
{{/l0_index_mode}}
@group(0) @binding(2) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:          vec4<u32>;
{{#l0_index_mode}}
@group(0) @binding(4) var<storage, read>       point_x:         array<vec4<u32>>;
@group(0) @binding(5) var<storage, read>       point_y:         array<vec4<u32>>;
{{/l0_index_mode}}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M_old = params.y;
    let M_new = params.z;
    let t = gid.x;
    if (t >= T) { return; }

    let src_idx = carry_plan[2u * t + 0u];
    let dst_idx = carry_plan[2u * t + 1u];

{{#l0_index_mode}}
    // Lever B: src is a level-0 (point index | sign<<31). Gather the point
    // from the pool, negate y on the sign bit, write the full point.
    let packed = active_sums_old[src_idx];
    let pt = packed & 0x7fffffffu;
    let dst_x = 0u * PG * M_new + PG * dst_idx;
    let dst_y = 1u * PG * M_new + PG * dst_idx;
    active_sums_new[dst_x + 0u] = point_x[2u * pt + 0u];
    active_sums_new[dst_x + 1u] = point_x[2u * pt + 1u];
    if ((packed & 0x80000000u) == 0u) {
        active_sums_new[dst_y + 0u] = point_y[2u * pt + 0u];
        active_sums_new[dst_y + 1u] = point_y[2u * pt + 1u];
    } else {
        let q0 = point_y[2u * pt + 0u];
        let q1 = point_y[2u * pt + 1u];
        var w: array<u32, 8>;
        w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
        w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
        var zw: array<u32, 8>;
        let nw = fr_sub_f8(zw, w);
        active_sums_new[dst_y + 0u] = vec4<u32>(nw[0], nw[1], nw[2], nw[3]);
        active_sums_new[dst_y + 1u] = vec4<u32>(nw[4], nw[5], nw[6], nw[7]);
    }
{{/l0_index_mode}}
{{^l0_index_mode}}
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
{{/l0_index_mode}}

    {{{ recompile }}}
}
