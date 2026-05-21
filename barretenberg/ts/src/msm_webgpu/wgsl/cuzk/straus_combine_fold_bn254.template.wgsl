// straus_combine tree-fold pass for BN254 G1.
//
// Reads T_IN Jacobian partials from `in_{x,y,z}` and writes ceil(T_IN / 2)
// pairwise sums into `out_{x,y,z}`. The host re-dispatches with the input
// halved each pass until T_IN reaches 1, ping-pong-swapping the in/out
// buffers between dispatches. Each thread folds one pair via add_points;
// if the second slot is past the end (odd T_IN), the lone partial is
// copied through unchanged.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
{{> ec_funcs }}

const T_IN: u32 = {{ t_in }}u;

@group(0) @binding(0) var<storage, read>       in_x:  array<BigInt>;
@group(0) @binding(1) var<storage, read>       in_y:  array<BigInt>;
@group(0) @binding(2) var<storage, read>       in_z:  array<BigInt>;
@group(0) @binding(3) var<storage, read_write> out_x: array<BigInt>;
@group(0) @binding(4) var<storage, read_write> out_y: array<BigInt>;
@group(0) @binding(5) var<storage, read_write> out_z: array<BigInt>;

fn read_in(i: u32) -> Point {
    var p: Point;
    p.x = in_x[i];
    p.y = in_y[i];
    p.z = in_z[i];
    return p;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t: u32 = gid.x;
    let t_out: u32 = (T_IN + 1u) / 2u;
    if (t >= t_out) { return; }
    let lo: u32 = 2u * t;
    let hi: u32 = lo + 1u;
    var sum: Point = read_in(lo);
    if (hi < T_IN) {
        var other: Point = read_in(hi);
        sum = add_points(sum, other);
    }
    out_x[t] = sum.x;
    out_y[t] = sum.y;
    out_z[t] = sum.z;
    {{{ recompile }}}
}
