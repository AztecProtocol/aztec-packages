{{> structs }}

// Scatter kernel for the bin-packed pair-tree MSM bucket-accumulate.
//
// For each (chunk t, slot k), reads R.x/R.y from the disjoint kernel's
// strided output (where it landed at flat index t + k * T after
// running with final_flag=1) and writes them to active_sums_new at
// the destination index given by scatter_plan[t * S + k].
//
// This is the per-bucket-placement pass that re-groups pair sums for
// the next level's bin-packing planner.
//
// scatter_plan layout: 1 u32 per (chunk, slot).
//   scatter_plan[t * S + k] = dst_idx  (active_sums_new index)
//
// disjoint_out layout: 2 planes (R.x, R.y), PG=2 vec4 per element,
// S * T elements per plane (matches the disjoint kernel's
// final-mode simple strided write).
//
// active_sums_new layout: 2 planes (P.x, P.y), PG=2 vec4 per element,
// M_new elements per plane (params.y).

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       scatter_plan:    array<u32>;
@group(0) @binding(1) var<storage, read>       disjoint_out:    array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:          vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M_new = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let out_N = S * T;
    let out_plane_x = 0u * PG * out_N;
    let out_plane_y = 1u * PG * out_N;

    let new_plane_x = 0u * PG * M_new;
    let new_plane_y = 1u * PG * M_new;

    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let e = t + k * T;
        let dst_idx = scatter_plan[t * S + k];

        let src_x = out_plane_x + PG * e;
        let src_y = out_plane_y + PG * e;
        let dst_x = new_plane_x + PG * dst_idx;
        let dst_y = new_plane_y + PG * dst_idx;

        active_sums_new[dst_x + 0u] = disjoint_out[src_x + 0u];
        active_sums_new[dst_x + 1u] = disjoint_out[src_x + 1u];
        active_sums_new[dst_y + 0u] = disjoint_out[src_y + 0u];
        active_sums_new[dst_y + 1u] = disjoint_out[src_y + 1u];
    }

    {{{ recompile }}}
}
