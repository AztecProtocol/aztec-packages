{{> structs }}

// Marshal kernel — prod variant for the v2 pair-tree integration.
//
// Same indexing math as ba_marshal_pairs_bench. The only structural
// change: the per-level T (= num_chunks) is read from the planner's
// totals[3] storage output instead of a host-set uniform, and the
// host dispatches via dispatchWorkgroupsIndirect(totals, 16). This
// dispatches exactly ceil(num_chunks / WG) workgroups so no pad
// chunks are computed.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       chunk_plan:  array<u32>;
@group(0) @binding(1) var<storage, read>       active_sums: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> chain_buf:   array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       totals:      array<u32>;
@group(0) @binding(4) var<uniform>             consts:      vec4<u32>;
// consts.x = M_in

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = totals[3];
    let M_in = consts.x;
    let t = gid.x;
    if (t >= T) { return; }

    let chain_N = 2u * S * T;
    let chain_plane_x = 0u * PG * chain_N;
    let chain_plane_y = 1u * PG * chain_N;

    let active_plane_x = 0u * PG * M_in;
    let active_plane_y = 1u * PG * M_in;

    let chunk_base = 2u * S * t;
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let idx_l = chunk_plan[chunk_base + 2u * k + 0u];
        let idx_r = chunk_plan[chunk_base + 2u * k + 1u];

        let e_l = t + (2u * k + 0u) * T;
        let e_r = t + (2u * k + 1u) * T;

        let src_lx = active_plane_x + PG * idx_l;
        let src_ly = active_plane_y + PG * idx_l;
        let src_rx = active_plane_x + PG * idx_r;
        let src_ry = active_plane_y + PG * idx_r;

        let dst_lx = chain_plane_x + PG * e_l;
        let dst_ly = chain_plane_y + PG * e_l;
        let dst_rx = chain_plane_x + PG * e_r;
        let dst_ry = chain_plane_y + PG * e_r;

        chain_buf[dst_lx + 0u] = active_sums[src_lx + 0u];
        chain_buf[dst_lx + 1u] = active_sums[src_lx + 1u];
        chain_buf[dst_ly + 0u] = active_sums[src_ly + 0u];
        chain_buf[dst_ly + 1u] = active_sums[src_ly + 1u];
        chain_buf[dst_rx + 0u] = active_sums[src_rx + 0u];
        chain_buf[dst_rx + 1u] = active_sums[src_rx + 1u];
        chain_buf[dst_ry + 0u] = active_sums[src_ry + 0u];
        chain_buf[dst_ry + 1u] = active_sums[src_ry + 1u];
    }

    {{{ recompile }}}
}
