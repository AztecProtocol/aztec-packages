// Computes the scatter dispatch geometry from the final tree-reduce
// output count. Single thread; reads layer_counts[max_layers_slot]
// (written by the terminating layer_scan kernel) and emits
//   dispatch_args_scatter = (ceil(count / scatter_tpb), 1, 1)
// for the host-side indirect scatter dispatch that follows.

@group(0) @binding(0)
var<storage, read> layer_counts: array<u32>;

@group(0) @binding(1)
var<storage, read_write> dispatch_args_scatter: array<u32>;

struct Params {
    max_layers_slot: u32,
    scatter_tpb: u32,
    pad: u32,
    pad2: u32,
}
@group(0) @binding(2)
var<uniform> params: Params;

@compute
@workgroup_size(1)
fn main() {
    let count = layer_counts[params.max_layers_slot];
    var x: u32 = 0u;
    if (count > 0u) {
        x = (count + params.scatter_tpb - 1u) / params.scatter_tpb;
    }
    dispatch_args_scatter[0] = x;
    dispatch_args_scatter[1] = 1u;
    dispatch_args_scatter[2] = 1u;
}
