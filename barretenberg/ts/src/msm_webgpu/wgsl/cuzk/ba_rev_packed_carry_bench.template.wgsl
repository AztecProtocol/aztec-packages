{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// MSM-integrated bucket-accumulate batch-affine kernel — packed 8x u32
// storage + decoupled (full-ILP) pack/unpack + reversed direction +
// resident-accumulator load-carry. Drives the canonical
// ba_rev_packed_carry benchmark that reached ~22 ns/pair on M2 / Chrome
// 148 (-55% vs the production batch-affine kernel).
//
// Math is byte-identical to ba_msm_bucket_bench: forward running
// prefix-product of the S dx values in a private array<BigInt,S>, ONE
// fr_inv_by_a per chunk of S, backward peel with the lean affine
// formula (dx recomputed free in the backward pass), resident
// accumulator A.x kept in registers across the whole chunk (load-carry:
// A_{i+1} := P_i so the forward and backward passes share one global
// P_i.x load per iteration). Same Karatsuba+Yuval montmul and BY-safegcd
// fr_inv_by_a as the production stack.
//
// The single structural change from ba_msm_bucket_bench:
//   global storage is the packed 254-bit value stored as 8x u32
//   (32 bytes/elem == 2x vec4<u32>), not the 20x 13-bit-limb BigInt
//   (80 bytes/elem == 5x vec4<u32>). Unpack into 20x13-bit limbs only
//   in-register at load and repack on store. The pack/unpack is the
//   decoupled (`{{{ dec_unpack }}}` / `{{{ dec_pack }}}`) full-ILP
//   straight-line form: 20 mutually-independent compile-time-constant-
//   indexed limb extractions, zero loop-carried bit-cursor dependency
//   chain. This cuts global traffic 2.5x (the dominant cost in the
//   memory-bound batch-affine kernel) at a sub-cycle in-register cost.
//
// LAYOUT: packed elem = 2 vec4<u32>; for each of the 4 input planes
// (A.x, A.y, P.x, P.y) and 2 output planes (R.x, R.y), plane c holds
// N elements at indices c*2*N + 2*e + {0,1}. params.x = N (total
// point-adds), params.y = T (thread count = N/S).
//
// Thread t streams points e = t + i*T for i in 0..S (strided => fully
// coalesced across the apply phase). The "left" operand of add i is the
// running accumulator A_i; A_0 is the per-thread seed (plane 0/1 at
// e=t), A_{i+1} := P_i (load-carry; same global address as forward
// pass's P_i load, no extra global traffic).

const S: u32 = {{ s }}u;
const PG: u32 = 2u; // 8 u32 packed limbs / 4 = 2 vec4 groups

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

{{{ dec_unpack }}}

{{{ dec_pack }}}

fn load_be_packed(plane_base: u32, e: u32, N: u32) -> BigInt {
    // plane_base is in vec4 units; per plane: 2*N vec4 (PG=2).
    let base = plane_base + PG * e;
    let q0 = inp[base + 0u];
    let q1 = inp[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_be_packed(plane_base: u32, e: u32, N: u32, val: ptr<function, BigInt>) {
    let w = pack_limbs_to_256(val);
    let base = plane_base + PG * e;
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
    let N = params.x;
    let T = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    // Plane bases in vec4 units. Each plane spans PG*N vec4.
    let plane = PG * N;
    let ax_base = 0u * plane;
    let ay_base = 1u * plane;
    let px_base = 2u * plane;
    let py_base = 3u * plane;

    // Resident accumulator A.x stays in registers across the whole
    // chunk (drives the forward dx prefix chain). A.y is only needed in
    // the backward peel and is re-loaded there from the same SoA plane.
    var acc_x = load_be_packed(ax_base, t, N);

    // Forward pass: running prefix-product of the S dx values
    // dx_i = P_i.x - A_i.x. A_i is the prefix accumulator (resident).
    var pref: array<BigInt, {{ s }}>;
    var acc: BigInt = get_r();
    for (var i = 0u; i < S; i = i + 1u) {
        let e = t + i * T;
        var p_x = load_be_packed(px_base, e, N);
        var dx = fr_sub(&p_x, &acc_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
        // Resident accumulator advances along the streamed chain:
        // A_0 is the seed, A_{i+1} := P_i. Points are independent
        // (P_i.x != A_i.x) so every dx is a well-defined nonzero
        // difference. inv_dx is deferred to the backward pass (ONE
        // fr_inv_by_a per chunk of S); A stays in registers throughout.
        acc_x = p_x;
    }

    var inv: BigInt = fr_inv_by_a(acc);

    // Backward peel + lean affine formula (dx recomputed free).
    for (var jj = 0u; jj < S; jj = jj + 1u) {
        let i = S - 1u - jj;
        let e = t + i * T;
        var p_x = load_be_packed(px_base, e, N);
        var p_y = load_be_packed(py_base, e, N);

        // A_i (left operand): A_0 is the seed, A_i = P_{i-1} for i>0
        // (matches the forward acc_x recurrence; points independent so
        // dx = P_i.x - A_i.x is always well-defined and nonzero).
        var a_x: BigInt;
        var a_y: BigInt;
        if (i == 0u) {
            a_x = load_be_packed(ax_base, t, N);
            a_y = load_be_packed(ay_base, t, N);
        } else {
            let ep = t + (i - 1u) * T;
            a_x = load_be_packed(px_base, ep, N);
            a_y = load_be_packed(py_base, ep, N);
        }

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }

        var lambda = fr_sub(&p_y, &a_y);
        lambda = montgomery_product(&lambda, &inv_dx);
        var r_x = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &a_x);
        r_x = fr_sub(&r_x, &p_x);
        var r_y = fr_sub(&a_x, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &a_y);

        store_be_packed(0u * plane, e, N, &r_x);
        store_be_packed(1u * plane, e, N, &r_y);

        if (i != 0u) {
            var dx_back = fr_sub(&p_x, &a_x);
            inv = montgomery_product(&inv, &dx_back);
        }
    }
}
