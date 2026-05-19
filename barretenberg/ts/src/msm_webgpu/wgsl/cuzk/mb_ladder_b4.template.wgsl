// LADDER B rung 4: mbB4_bwd_subs — mbB3_bwd_muls + backward per-pair
// fr_sub (the 5 lean-formula subs + the dx-recompute sub), wired loosely.
//
// Same SoA+vec4 layout / S=16 chunk / 8192-thread geometry and the same
// load volume as mbB3 (no extra a_x/a_y loads — the real kernel's
// distinct-operand wiring + a_x/a_y loads are the apB5 delta). Adds the
// six field subtractions of the backward pass:
//   u1 = p_y - acc_y      (dy)
//   u2 = l2  - acc_x      (r_x step 1)
//   u3 = u2  - p_x        (r_x step 2)
//   u4 = acc_x - u3       (p_x - r_x)
//   u5 = mm  - p_y        (r_y final)
//   u6 = p_x - acc_x      (dx recompute)
// loosely wired, each folded into the stored XOR sink so none can be
// DCE'd. Delta (mbB4-mbB3) = the in-context backward subs per pair.

const S: u32 = {{ s }}u;
const VG: u32 = 5u;

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

fn load_be(plane_base: u32, e: u32, N: u32) -> BigInt {
    var b: BigInt;
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = inp[plane_base + v * N + e];
        b.limbs[4u * v + 0u] = q.x;
        b.limbs[4u * v + 1u] = q.y;
        b.limbs[4u * v + 2u] = q.z;
        b.limbs[4u * v + 3u] = q.w;
    }
    return b;
}

fn store_be(plane_base: u32, e: u32, N: u32, val: ptr<function, BigInt>) {
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = vec4<u32>(
            (*val).limbs[4u * v + 0u],
            (*val).limbs[4u * v + 1u],
            (*val).limbs[4u * v + 2u],
            (*val).limbs[4u * v + 3u],
        );
        outp[plane_base + v * N + e] = q;
    }
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

    let plane = VG * N;
    let ax_base = 0u * plane;
    let ay_base = 1u * plane;
    let px_base = 2u * plane;
    let py_base = 3u * plane;

    var acc_x = load_be(ax_base, t, N);
    var acc_y = load_be(ay_base, t, N);

    var sink: BigInt;
    var pref: array<BigInt, {{ s }}>;
    var acc: BigInt = get_r();
    for (var i = 0u; i < S; i = i + 1u) {
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var dx = fr_sub(&p_x, &acc_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            sink.limbs[w] = sink.limbs[w] ^ p_x.limbs[w] ^ acc.limbs[w];
        }
        acc_x = p_x;
    }

    var inv: BigInt = fr_inv_by_a(acc);
    for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
        sink.limbs[w] = sink.limbs[w] ^ inv.limbs[w];
    }

    for (var jj = 0u; jj < S; jj = jj + 1u) {
        let i = S - 1u - jj;
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var p_y = load_be(py_base, e, N);

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }

        var lambda = montgomery_product(&p_y, &inv_dx);
        var l2 = montgomery_product(&lambda, &lambda);
        var mm = montgomery_product(&lambda, &p_x);
        inv = montgomery_product(&inv, &p_x);

        var u1 = fr_sub(&p_y, &acc_y);
        var u2 = fr_sub(&l2, &acc_x);
        var u3 = fr_sub(&u2, &p_x);
        var u4 = fr_sub(&acc_x, &u3);
        var u5 = fr_sub(&mm, &p_y);
        var u6 = fr_sub(&p_x, &acc_x);

        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            sink.limbs[w] = sink.limbs[w]
                ^ inv_dx.limbs[w] ^ lambda.limbs[w] ^ l2.limbs[w] ^ mm.limbs[w] ^ inv.limbs[w]
                ^ u1.limbs[w] ^ u2.limbs[w] ^ u3.limbs[w] ^ u4.limbs[w] ^ u5.limbs[w] ^ u6.limbs[w];
        }
        var r_x = sink;
        var r_y = p_y;
        store_be(0u * plane, e, N, &r_x);
        store_be(1u * plane, e, N, &r_y);
    }
}
