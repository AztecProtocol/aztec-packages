{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Disjoint pair-sum kernel — prod variant for the v2 pair-tree
// integration. Same disjoint pair-sum math as
// ba_pair_disjoint_tree_bench (suffix-product single fr_inv_by_a per
// chunk + lean affine add); the per-level T (= num_chunks) is read
// from the planner's totals[3] storage output and the dispatch happens
// indirectly so only real chunks run. Always uses the final-mode
// strided write (matches what ba_scatter_pairs_prod expects).
//
// LAYOUT: same as the bench variant. Combined-SoA input/output (2
// planes, PG=2 vec4 per element, plane-major then element-major then
// vec4 within an element).

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       totals: array<u32>;

fn load_in(plane: u32, t: u32, i: u32, T: u32, N_in: u32) -> BigInt {
    let plane_base = plane * PG * N_in;
    let base = plane_base + PG * (t + i * T);
    let q0 = inp[base + 0u];
    let q1 = inp[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_out_simple(plane: u32, t: u32, k: u32, T_curr: u32, N_out: u32, val: ptr<function, BigInt>) {
    let plane_base = plane * PG * N_out;
    let elem = t + k * T_curr;
    let base = plane_base + PG * elem;
    let w = pack_limbs_to_256(val);
    outp[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    outp[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T_curr = totals[3];
    let N_in = 2u * S * T_curr;
    let N_out = S * T_curr;

    let t = gid.x;
    if (t >= T_curr) { return; }

    var pref: array<BigInt, {{ s }}>;
    var acc: BigInt = get_r();
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        var p_lx: BigInt = load_in(0u, t, 2u * k + 0u, T_curr, N_in);
        var p_rx: BigInt = load_in(0u, t, 2u * k + 1u, T_curr, N_in);
        var dx: BigInt = fr_sub(&p_rx, &p_lx);
        if (k == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[k] = acc;
    }

    var inv: BigInt = fr_inv_by_a(acc);

    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;

        var p_lx: BigInt = load_in(0u, t, 2u * k + 0u, T_curr, N_in);
        var p_ly: BigInt = load_in(1u, t, 2u * k + 0u, T_curr, N_in);
        var p_rx: BigInt = load_in(0u, t, 2u * k + 1u, T_curr, N_in);
        var p_ry: BigInt = load_in(1u, t, 2u * k + 1u, T_curr, N_in);

        var inv_dx: BigInt;
        if (k == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[k - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }

        var lambda: BigInt = fr_sub(&p_ry, &p_ly);
        lambda = montgomery_product(&lambda, &inv_dx);
        var r_x: BigInt = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &p_lx);
        r_x = fr_sub(&r_x, &p_rx);
        var r_y: BigInt = fr_sub(&p_lx, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &p_ly);

        store_out_simple(0u, t, k, T_curr, N_out, &r_x);
        store_out_simple(1u, t, k, T_curr, N_out, &r_y);

        if (k > 0u) {
            var dx_back: BigInt = fr_sub(&p_rx, &p_lx);
            inv = montgomery_product(&inv, &dx_back);
        }
    }

    {{{ recompile }}}
}
