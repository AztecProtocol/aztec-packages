{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// GLV precomputed-phi fill (one thread per base point).
//
// The precomputed-phi pool holds 2n point_x slots: the lower n are the
// Montgomery-form base x-coordinates (written by convert_points_only), the
// upper n are phi(P).x = beta*x. point_y is only n slots (phi(P).y == P.y, so
// the gather reuses the original y). This kernel fills the upper half once at
// pool-build time so the bucket-accumulate gather can read phi.x directly
// instead of doing a Montgomery beta-multiply per gather — each phi point is
// gathered ~T/2 times, so caching beta*x trades T/2 multiplies-per-point for
// one, at the cost of n extra x-slots (no extra y, no extra binding).

fn beta_mont_f8() -> array<u32, 8> { return array<u32, 8>({{ beta8_csv }}); }

@group(0) @binding(0) var<storage, read_write> point_x: array<vec4<u32>>;
@group(0) @binding(1) var<uniform>             n:       u32;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= n) { return; }
    let q0 = point_x[2u * i];
    let q1 = point_x[2u * i + 1u];
    let x: array<u32, 8> = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    let bx = montgomery_product_f8(beta_mont_f8(), x);
    point_x[2u * (n + i)]      = vec4<u32>(bx[0], bx[1], bx[2], bx[3]);
    point_x[2u * (n + i) + 1u] = vec4<u32>(bx[4], bx[5], bx[6], bx[7]);

    {{{ recompile }}}
}
