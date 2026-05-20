{{> structs }}

// Marshal kernel for the bin-packed pair-tree MSM bucket-accumulate.
//
// Reads (idx_l, idx_r) operand indices per pair from chunk_plan,
// fetches the corresponding packed 8x u32 points from an active_sums
// buffer (2-plane SoA), and writes them into the disjoint kernel's
// strided input layout.
//
// Used both at level 0 (active_sums = bucket-sorted point pool) and
// at levels 1+ (active_sums = previous level's pair-sum + carry
// outputs). The kernel is bucket-agnostic; the planner has packed
// each chunk's S pairs from whatever buckets fit, and chunk_plan
// encodes the operand source indices.
//
// chunk_plan layout: 2 * S u32 per chunk
//   chunk_plan[2 * (t * S + k) + 0] = idx_left   (active_sums index)
//   chunk_plan[2 * (t * S + k) + 1] = idx_right  (active_sums index)
//
// active_sums layout: 2 planes (P.x, P.y), PG=2 vec4 per element,
// M_in elements per plane (params.y).
//
// chain_buf layout: 2 planes (P.x, P.y), PG=2 vec4 per element,
// 2 * S * T elements per plane. Slot (t, 2k+0) holds left, slot
// (t, 2k+1) holds right at the disjoint kernel's strided positions
// e = t + i * T for i = 2k, 2k+1.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       chunk_plan:  array<u32>;
@group(0) @binding(1) var<storage, read>       active_sums: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> chain_buf:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:      vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M_in = params.y;
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
