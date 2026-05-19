{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Disjoint pair-sum kernel — tree variant. Each thread reduces 2*S
// input points to S disjoint pair sums R_k = P_{2k} + P_{2k+1}, using
// one batched fr_inv_by_a per chunk of S.
//
// vs ba_pair_disjoint_bench: writes outputs in the LAYOUT THE NEXT
// PAIR-TREE LEVEL EXPECTS AS INPUT, eliminating the need for an
// intervening marshal/reshuffle dispatch between levels.
//
// Strided read at level k: thread t reads input slot i at flat
//   in_pos(t, i) = t + i * T_curr            (i in [0, 2*S))
//
// Strided write that next level reads correctly: thread t writes
// output slot i at flat
//   out_pos(t, i) = (t >> 1) + (i + S * (t & 1)) * (T_curr >> 1)
//
// Derivation: next level uses T_next = T_curr / 2 threads. For
// next-level thread t_n = t >> 1 to read its 2*S inputs in the right
// pair-tree order (first S from prev thread (2*t_n), next S from prev
// thread (2*t_n + 1)), the current level's output slots interleave:
// odd-t writes go into the upper-S input slots of the next level's
// thread (t >> 1), even-t into the lower-S slots.
//
// This preserves the per-bucket-pair invariant: at every level, the
// disjoint pairs (P_{2j}, P_{2j+1}) belong to the same bucket pool,
// so the lean affine formula is always combining points whose dx is
// well-defined.
//
// PARAMS:
//   params.x = N_in  = 2 * S * T_curr  (total input elements per plane)
//   params.y = T_curr
//
// LAYOUT (both input and output buffers):
//   2 planes (P.x, P.y), PG=2 vec4 per element.
//   Plane p flat index for vec4 access: p * PG * N_buf + PG * e + {0,1}
//   where N_buf is the elements-per-plane for that buffer.
//   Input buffer's N_buf = 2 * S * T_curr (= N_in).
//   Output buffer's N_buf = S * T_curr (= N_in / 2).

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

fn store_out_tree(plane: u32, t: u32, k: u32, T_curr: u32, N_out: u32, val: ptr<function, BigInt>) {
    // Tree write: out_pos(t, k) = (t >> 1) + (k + S * (t & 1)) * (T_curr >> 1)
    // Lands in next-level strided read at index (t >> 1) with slot
    // (k + S * (t & 1)).
    let t_next = t >> 1u;
    let slot_in_next = k + S * (t & 1u);
    let T_next = T_curr >> 1u;
    let plane_base = plane * PG * N_out;
    let elem = t_next + slot_in_next * T_next;
    let base = plane_base + PG * elem;
    let w = pack_limbs_to_256(val);
    outp[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    outp[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

fn store_out_simple(plane: u32, t: u32, k: u32, T_curr: u32, N_out: u32, val: ptr<function, BigInt>) {
    // Final-level simple strided write: out_pos(t, k) = t + k * T_curr.
    // Used when there is no next pair-tree level (T_curr == 1 thread, or
    // the host indicates this is the last reduction step).
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
    let N_in = params.x;
    let T_curr = params.y;
    let final_flag = params.z;   // non-zero => use simple strided write
    let N_out = N_in / 2u;

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

        if (final_flag != 0u) {
            store_out_simple(0u, t, k, T_curr, N_out, &r_x);
            store_out_simple(1u, t, k, T_curr, N_out, &r_y);
        } else {
            store_out_tree(0u, t, k, T_curr, N_out, &r_x);
            store_out_tree(1u, t, k, T_curr, N_out, &r_y);
        }

        if (k > 0u) {
            var dx_back: BigInt = fr_sub(&p_rx, &p_lx);
            inv = montgomery_product(&inv, &dx_back);
        }
    }

    {{{ recompile }}}
}
