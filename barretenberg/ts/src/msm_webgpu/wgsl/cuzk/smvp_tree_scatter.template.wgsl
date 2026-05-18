{{> structs }}

// Scatters the tree-reduce orchestrator's sparse output into the dense
// `(running_x, running_y, bucket_active)` arrays expected by the
// existing finalize_collect pipeline.
//
// One thread per output tuple. `total_outputs` is read from
// `layer_counts[max_layers_slot]` (written by the terminating
// layer_scan kernel). The ping-pong slot is read from
// `layer_counts[final_slot_index_slot]` and chooses whether to read
// the final layer's outputs from ping_a or ping_b buffers.

const TPB: u32 = {{ tpb }}u;

@group(0) @binding(0)
var<storage, read> output_bucket_id_ping_a: array<u32>;
@group(0) @binding(1)
var<storage, read> output_x_ping_a: array<BigInt>;
@group(0) @binding(2)
var<storage, read> output_y_ping_a: array<BigInt>;

@group(0) @binding(3)
var<storage, read_write> running_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> running_y: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> bucket_active: array<u32>;

struct Params {
    total_buckets: u32,
    max_layers_slot: u32,
    final_slot_index_slot: u32,
    pad: u32,
}
@group(0) @binding(6)
var<uniform> params: Params;

@group(0) @binding(7)
var<storage, read> layer_counts: array<u32>;

@group(0) @binding(8)
var<storage, read> output_bucket_id_ping_b: array<u32>;
@group(0) @binding(9)
var<storage, read> output_x_ping_b: array<BigInt>;
@group(0) @binding(10)
var<storage, read> output_y_ping_b: array<BigInt>;

var<workgroup> wg_total_outputs: u32;
var<workgroup> wg_slot: u32;

@compute
@workgroup_size({{ tpb }})
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
) {
    if (lid.x == 0u) {
        wg_total_outputs = layer_counts[params.max_layers_slot];
        wg_slot = layer_counts[params.final_slot_index_slot];
    }
    workgroupBarrier();

    let i = gid.x;
    if (i >= wg_total_outputs) { return; }
    var bid: u32 = 0u;
    var rx: BigInt;
    var ry: BigInt;
    if (wg_slot == 0u) {
        bid = output_bucket_id_ping_a[i];
        rx = output_x_ping_a[i];
        ry = output_y_ping_a[i];
    } else {
        bid = output_bucket_id_ping_b[i];
        rx = output_x_ping_b[i];
        ry = output_y_ping_b[i];
    }
    if (bid >= params.total_buckets) { return; }
    running_x[bid] = rx;
    running_y[bid] = ry;
    bucket_active[bid] = 1u;

    {{{ recompile }}}
}
