// Bucket-accumulate planner stage 1.2c: radix scatter.
//
// Scatters (bucket_idx, count) pairs from input to output arrays based
// on the digit at the current pass's byte position. Uses per-tile
// atomic cursors seeded from the scanned radix_hist.
//
// Dispatch: ceil(num_dense / TILE_SIZE) workgroups of 256 threads.

const TILE_SIZE: u32 = {{ tile_size }}u;

@group(0) @binding(0) var<storage, read>       in_bucket:    array<u32>;
@group(0) @binding(1) var<storage, read>       in_count:     array<u32>;
@group(0) @binding(2) var<storage, read>       radix_hist:   array<u32>;
@group(0) @binding(3) var<storage, read_write> out_bucket:   array<u32>;
@group(0) @binding(4) var<storage, read_write> out_count:    array<u32>;
@group(0) @binding(5) var<storage, read>       planner_meta: array<u32>;
@group(0) @binding(6) var<uniform>             params:       vec4<u32>;

var<workgroup> local_cursor: array<atomic<u32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let tile = wid.x;
    let pass_idx = params.x;
    let num_dense = planner_meta[1];

    // Seed each digit's cursor to 0 (offset is added from radix_hist).
    atomicStore(&local_cursor[tid], 0u);
    workgroupBarrier();

    let base = tile * TILE_SIZE;
    let end = min(base + TILE_SIZE, num_dense);
    for (var i: u32 = base + tid; i < end; i = i + 256u) {
        let count_key = ~in_count[i];
        let digit = (count_key >> (pass_idx * 8u)) & 0xFFu;
        let slot = atomicAdd(&local_cursor[digit], 1u) + radix_hist[tile * 256u + digit];
        out_bucket[slot] = in_bucket[i];
        out_count[slot] = in_count[i];
    }

    {{{ recompile }}}
}
