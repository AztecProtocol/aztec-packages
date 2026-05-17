{{> structs }}

// Scatters the tree-reduce orchestrator's sparse output —
// `(bucket_id, AffinePoint)` tuples in `output_x/y` indexed by
// `output_bucket_id` — into the dense `(running_x, running_y,
// bucket_active)` arrays expected by the existing finalize_collect
// pipeline.
//
// One thread per output tuple. `total_outputs` is uniform.
//
// Pre: the host has zeroed `bucket_active`, `running_x`, `running_y`
// across all `total_buckets` slots (`smvp_tree_scatter_init` does
// this).

const TPB: u32 = {{ tpb }}u;

@group(0) @binding(0)
var<storage, read> output_bucket_id: array<u32>;
@group(0) @binding(1)
var<storage, read> output_x: array<BigInt>;
@group(0) @binding(2)
var<storage, read> output_y: array<BigInt>;

@group(0) @binding(3)
var<storage, read_write> running_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> running_y: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> bucket_active: array<u32>;

struct Params { total_outputs: u32, total_buckets: u32 }
@group(0) @binding(6)
var<uniform> params: Params;

@compute
@workgroup_size({{ tpb }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.total_outputs) { return; }
    let bid = output_bucket_id[i];
    if (bid >= params.total_buckets) { return; }
    running_x[bid] = output_x[i];
    running_y[bid] = output_y[i];
    bucket_active[bid] = 1u;

    {{{ recompile }}}
}
