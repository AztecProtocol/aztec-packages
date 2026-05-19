{{> structs }}

// Marshal kernel for the bench-msm-tree pair-tree pipeline: transposes
// a CSR-sorted point index list into the 2-plane strided SoA layout
// the ba_pair_disjoint_tree kernel consumes at level 0. Pure memory
// shuffle, no field arithmetic.
//
// Input (point_pool):
//   2 planes (P.x, P.y), each PG=2 vec4 per element, N pool elements.
//   Plane p flat vec4 indices: p*PG*N + PG*i + {0,1}.
//
// Output (chain_buf):
//   2 planes (P.x, P.y), each PG=2 vec4 per element, 2*S*T elements
//   per plane. Plane p at strided element e = t + i*T: vec4 indices
//   p*PG*(2*S*T) + PG*e + {0,1}.
//
// Per chunk-thread t with CSR slice [csr_start, csr_start + 2*S):
//   For i in 0..2*S:
//     pt_idx = csr_indices[csr_start + i]
//     copy point_pool[pt_idx] (P.x, P.y) into chain_buf at e = t + i*T

const S: u32 = {{ s }}u;
const TWOS: u32 = 2u * S;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       csr_indices: array<u32>;
@group(0) @binding(1) var<storage, read>       chunk_plan:  array<u32>;
@group(0) @binding(2) var<storage, read>       point_pool:  array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> chain_buf:   array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:      vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let N = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let csr_start = chunk_plan[2u * t + 1u];

    let chain_N = TWOS * T;
    let chain_plane = PG * chain_N;
    let chain_px_base = 0u * chain_plane;
    let chain_py_base = 1u * chain_plane;

    let pool_plane = PG * N;
    let pool_px_base = 0u * pool_plane;
    let pool_py_base = 1u * pool_plane;

    for (var i: u32 = 0u; i < TWOS; i = i + 1u) {
        let pt_idx = csr_indices[csr_start + i];
        let e = t + i * T;
        let pool_x_off = pool_px_base + PG * pt_idx;
        let pool_y_off = pool_py_base + PG * pt_idx;
        let chain_px_off = chain_px_base + PG * e;
        let chain_py_off = chain_py_base + PG * e;
        chain_buf[chain_px_off + 0u] = point_pool[pool_x_off + 0u];
        chain_buf[chain_px_off + 1u] = point_pool[pool_x_off + 1u];
        chain_buf[chain_py_off + 0u] = point_pool[pool_y_off + 0u];
        chain_buf[chain_py_off + 1u] = point_pool[pool_y_off + 1u];
    }

    {{{ recompile }}}
}
