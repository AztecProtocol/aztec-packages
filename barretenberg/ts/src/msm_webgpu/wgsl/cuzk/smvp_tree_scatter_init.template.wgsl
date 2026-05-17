{{> structs }}

// Companion to `smvp_tree_scatter`: zeros the dense
// `running_x/y/bucket_active` arrays before the scatter pass so
// inactive bucket slots end up identity.
//
// Dispatch (ceil(total_buckets / TPB), 1, 1).

const TPB: u32 = {{ tpb }}u;

@group(0) @binding(0)
var<storage, read_write> running_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read_write> running_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read_write> bucket_active: array<u32>;

struct Params { total_buckets: u32 }
@group(0) @binding(3)
var<uniform> params: Params;

@compute
@workgroup_size({{ tpb }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.total_buckets) { return; }
    var zero: BigInt;
    running_x[i] = zero;
    running_y[i] = zero;
    bucket_active[i] = 0u;

    {{{ recompile }}}
}
