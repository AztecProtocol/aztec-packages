{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Disjoint pair-sum kernel — each thread reduces 2*S input points to S
// disjoint pair sums R_k = P_{2k} + P_{2k+1} (k in 0..S) using the
// same forward-prefix / single-inversion / backward-peel batched-
// inverse pattern as ba_rev_packed_carry, but with NO load-carry
// overlap. Every kernel-output is a distinct pair sum suitable as
// input to the next level of a pair-tree reduction — closes the 50%
// kernel-efficiency loss inherent in the streaming chain kernel.
//
// Storage: SoA-packed 8x u32 per field (PG=2 vec4/elem).
//   Input planes (binding 0):
//     plane 0 (P.x): PG * N_in vec4, N_in = 2*S*T
//     plane 1 (P.y): PG * N_in vec4
//   Output planes (binding 2):
//     plane 0 (R.x): PG * N_out vec4, N_out = S*T
//     plane 1 (R.y): PG * N_out vec4
//
// Thread t reads P_i = (inp[plane c at index t + i*T] : c in {0,1}) for
// i in 0..2S (strided => coalesced). Pair k pairs adjacent strided
// slots: (P_{2k}, P_{2k+1}). Output R_k is written at index t + k*T in
// plane c of outp (also strided, coalesced).
//
// dx values dx_k = P_{2k+1}.x - P_{2k}.x are all mutually independent
// (no shared inputs across k), so the standard Montgomery batched
// inverse trick applies as-is: ONE fr_inv_by_a per chunk of S.
//
// Same Karatsuba+Yuval montmul and BY-safegcd fr_inv_by_a as the
// production stack and the chain kernel.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

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

fn store_out(plane: u32, t: u32, k: u32, T: u32, N_out: u32, val: ptr<function, BigInt>) {
    let plane_base = plane * PG * N_out;
    let base = plane_base + PG * (t + k * T);
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
    let N_in = params.x;
    let T = params.y;
    let N_out = N_in / 2u;

    let t = gid.x;
    if (t >= T) { return; }

    // Forward: prefix product of S independent dx values.
    var pref: array<BigInt, {{ s }}>;
    var acc: BigInt = get_r();
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        var p_lx: BigInt = load_in(0u, t, 2u * k + 0u, T, N_in);
        var p_rx: BigInt = load_in(0u, t, 2u * k + 1u, T, N_in);
        var dx: BigInt = fr_sub(&p_rx, &p_lx);
        if (k == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[k] = acc;
    }

    // One BY-safegcd inversion amortised over all S pair sums.
    var inv: BigInt = fr_inv_by_a(acc);

    // Backward peel: emit S disjoint pair sums.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;

        var p_lx: BigInt = load_in(0u, t, 2u * k + 0u, T, N_in);
        var p_ly: BigInt = load_in(1u, t, 2u * k + 0u, T, N_in);
        var p_rx: BigInt = load_in(0u, t, 2u * k + 1u, T, N_in);
        var p_ry: BigInt = load_in(1u, t, 2u * k + 1u, T, N_in);

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

        store_out(0u, t, k, T, N_out, &r_x);
        store_out(1u, t, k, T, N_out, &r_y);

        // Advance inv to 1/pref[k-1] for the next (smaller) iteration.
        if (k > 0u) {
            var dx_back: BigInt = fr_sub(&p_rx, &p_lx);
            inv = montgomery_product(&inv, &dx_back);
        }
    }

    {{{ recompile }}}
}
