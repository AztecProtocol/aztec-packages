{{> structs }}

// Marshal kernel for the bench-msm-chain pipeline. Transposes a CSR
// point list (sorted by bucket) into the strided SoA layout the
// ba_rev_packed_carry_bench chain kernel consumes.
//
// Input layout (point_pool):
//   2 planes (P.x, P.y), each PG=2 vec4 per element, params.y elements total.
//   Plane p at point idx i: vec4 indices p*PG*N + PG*i + {0,1}.
//   Convention: point_pool[0] is the "decoy" — used as the seed for every
//   chunk so the chain kernel's first dx (= P_0.x - seed.x) is well-
//   defined. csr_indices values are in [1, N), never 0.
//
// Output layout (chain_buf):
//   4 planes (A.x, A.y, P.x, P.y), each PG=2 vec4 per element, T*S
//   elements per plane. Plane p at strided element e = t + i*T: vec4
//   indices p*PG*(T*S) + PG*e + {0,1}.
//
// Per chunk-thread t:
//   - csr_start = chunk_plan[2*t + 1]    (chunk_plan[2*t] = bucket_id, unused here)
//   - Seed at index t (planes 0,1) := point_pool[0] (universal decoy)
//   - For i in 0..S: P_i at index e = t + i*T (planes 2,3)
//                    := point_pool[csr_indices[csr_start + i]]
//
// The chain kernel then produces S pair-sums per chunk. The S/2 odd-
// indexed outputs (R_1, R_3, ..., R_{S-1}) are disjoint pair sums of
// {P_0..P_{S-1}}; the even outputs (R_0, R_2, ...) incorporate the
// decoy or share a P with the next odd output and are discarded by the
// subsequent reduce pass.
//
// Pure memory-shuffle kernel: no field arithmetic. Reads are coalesced
// because consecutive threads t, t+1 read adjacent csr_indices entries
// and the gathered point coords are written to adjacent vec4 slots
// (PG*e for e=t, t+1, ...).

const S: u32 = {{ s }}u;
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

    let chain_N = T * S;
    let chain_plane = PG * chain_N;
    let chain_ax_base = 0u * chain_plane;
    let chain_ay_base = 1u * chain_plane;
    let chain_px_base = 2u * chain_plane;
    let chain_py_base = 3u * chain_plane;

    let pool_plane = PG * N;
    let pool_px_base = 0u * pool_plane;
    let pool_py_base = 1u * pool_plane;

    // Seed (A.x, A.y at index t) := point_pool[0] (decoy).
    let decoy_x_off = pool_px_base + PG * 0u;
    let decoy_y_off = pool_py_base + PG * 0u;
    let seed_x_off = chain_ax_base + PG * t;
    let seed_y_off = chain_ay_base + PG * t;
    chain_buf[seed_x_off + 0u] = point_pool[decoy_x_off + 0u];
    chain_buf[seed_x_off + 1u] = point_pool[decoy_x_off + 1u];
    chain_buf[seed_y_off + 0u] = point_pool[decoy_y_off + 0u];
    chain_buf[seed_y_off + 1u] = point_pool[decoy_y_off + 1u];

    // Gather S points from csr_indices[csr_start..csr_start+S] into the
    // strided P-planes at indices e = t + i*T for i in 0..S.
    for (var i = 0u; i < S; i = i + 1u) {
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
