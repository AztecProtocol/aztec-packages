// Bucket-accumulate planner stage 1.2a: radix histogram.
//
// Per-tile 256-bin histogram of the radix digit at the current pass's
// byte position. Sorts descending by using the bitwise complement of
// count as the sort key.
//
// Dispatch: ceil(num_dense / TILE_SIZE) workgroups of 256 threads.
// Each thread processes TILE_SIZE / 256 elements (coarsened).

const TILE_SIZE: u32 = {{ tile_size }}u;

@group(0) @binding(0) var<storage, read>       in_count:     array<u32>;
@group(0) @binding(1) var<storage, read_write> radix_hist:   array<u32>;
@group(0) @binding(2) var<storage, read>       planner_meta: array<u32>;
@group(0) @binding(3) var<uniform>             params:       vec4<u32>;

var<workgroup> hist: array<atomic<u32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let tile = wid.x;
    let pass_idx = params.x;
    let num_dense = planner_meta[1];

    atomicStore(&hist[tid], 0u);
    workgroupBarrier();

    let base = tile * TILE_SIZE;
    let end = min(base + TILE_SIZE, num_dense);
    for (var i: u32 = base + tid; i < end; i = i + 256u) {
        let count_key = ~in_count[i];
        let digit = (count_key >> (pass_idx * 8u)) & 0xFFu;
        atomicAdd(&hist[digit], 1u);
    }
    workgroupBarrier();

    radix_hist[tile * 256u + tid] = atomicLoad(&hist[tid]);

    {{{ recompile }}}
}
