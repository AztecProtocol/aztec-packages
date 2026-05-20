{{> structs }}

// Scatter kernel — prod variant for the v2 pair-tree integration.
// Same per-bucket placement math as ba_scatter_pairs_bench; T is read
// from the planner's totals[3] and the dispatch is indirect via
// totals[4..6].

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       scatter_plan:    array<u32>;
@group(0) @binding(1) var<storage, read>       disjoint_out:    array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       totals:          array<u32>;
@group(0) @binding(4) var<uniform>             consts:          vec4<u32>;
// consts.x = M_new

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = totals[3];
    let M_new = consts.x;
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
