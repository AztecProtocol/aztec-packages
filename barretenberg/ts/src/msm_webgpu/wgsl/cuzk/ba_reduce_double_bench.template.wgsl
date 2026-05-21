{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// In-place batched-affine DOUBLE for the recursive affine bucket reduction
// (phase C). Doubles selected red_buf slots in place: buckets[slot] = 2*buckets[slot].
// Affine double: lambda = 3x^2 / 2y, x3 = lambda^2 - 2x, y3 = lambda*(x - x3) - y.
// The batched inverse is over the per-slot denominators 2y; an absent or
// out-of-range slot uses denominator R (the montgomery_product identity) so
// it stays inert. Each doubling level is its own dispatch.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       is_present:   array<u32>;
@group(0) @binding(2) var<storage, read_write> pref_scratch: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:       vec4<u32>;
@group(0) @binding(4) var<uniform>             params2:      vec4<u32>;
// params.x = T (threads)   params.y = M (red_buf element stride)
// params.z = STRIDE        params.w = unused
// params2.x = slot_stride  params2.y = unused   params2.z = ppw   params2.w = T_cands

struct DCand {
    slot: u32,
    present: u32,
}

fn load_x(idx: u32, M: u32) -> BigInt {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn load_y(idx: u32, M: u32) -> BigInt {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_x(idx: u32, M: u32, val: ptr<function, BigInt>) {
    let base = PG * idx;
    let w = pack_limbs_to_256(val);
    red_buf[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    red_buf[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

fn store_y(idx: u32, M: u32, val: ptr<function, BigInt>) {
    let base = PG * M + PG * idx;
    let w = pack_limbs_to_256(val);
    red_buf[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    red_buf[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn store_pref(slot: u32, val: ptr<function, BigInt>) {
    let base = 2u * slot;
    let w = pack_limbs_to_256(val);
    pref_scratch[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    pref_scratch[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

fn load_pref(slot: u32) -> BigInt {
    let base = 2u * slot;
    let q0 = pref_scratch[base + 0u];
    let q1 = pref_scratch[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

// Map a flat candidate index to its red_buf slot: phase C doubles slots
// d*slot_stride for d in [1, ppw]; window = cand / ppw.
fn dcand(cand: u32, stride: u32, slot_stride: u32, ppw: u32, t_cands: u32) -> DCand {
    var c: DCand;
    c.slot = 0u;
    c.present = 0u;
    if (cand >= t_cands) {
        return c;
    }
    let w = cand / ppw;
    let j2 = cand % ppw;
    c.slot = w * stride + (j2 + 1u) * slot_stride;
    c.present = is_present[c.slot];
    return c;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M = params.y;
    let stride = params.z;
    let slot_stride = params2.x;
    let ppw = params2.z;
    let t_cands = params2.w;
    let t = gid.x;
    if (t >= T) { return; }

    // Forward: prefix product of per-slot 2y (present) or R (absent).
    var acc: BigInt = get_r();
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let c = dcand(t * S + k, stride, slot_stride, ppw, t_cands);
        var denom: BigInt = get_r();
        if (c.present != 0u) {
            var y: BigInt = load_y(c.slot, M);
            denom = fr_add(&y, &y);
        }
        if (k == 0u) {
            acc = denom;
        } else {
            acc = montgomery_product(&acc, &denom);
        }
        store_pref(t * S + k, &acc);
    }

    var inv: BigInt = {{ inv_fn }}(acc);

    // Backward peel: per present slot, affine double in place.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        let c = dcand(t * S + k, stride, slot_stride, ppw, t_cands);

        var inv_denom: BigInt;
        if (k == 0u) {
            inv_denom = inv;
        } else {
            var pp: BigInt = load_pref(t * S + (k - 1u));
            inv_denom = montgomery_product(&inv, &pp);
        }

        if (c.present != 0u) {
            var x: BigInt = load_x(c.slot, M);
            var y: BigInt = load_y(c.slot, M);
            var denom: BigInt = fr_add(&y, &y);          // 2y
            var x2: BigInt = montgomery_product(&x, &x); // x^2
            var num: BigInt = fr_add(&x2, &x2);
            num = fr_add(&num, &x2);                     // 3x^2
            var lambda: BigInt = montgomery_product(&num, &inv_denom);
            var two_x: BigInt = fr_add(&x, &x);
            var r_x: BigInt = montgomery_product(&lambda, &lambda);
            r_x = fr_sub(&r_x, &two_x);
            if (k > 0u) {
                inv = montgomery_product(&inv, &denom);
            }
            var r_y: BigInt = fr_sub(&x, &r_x);
            r_y = montgomery_product(&lambda, &r_y);
            r_y = fr_sub(&r_y, &y);
            store_x(c.slot, M, &r_x);
            store_y(c.slot, M, &r_y);
        }
        // absent slot: nothing; inv unchanged (montgomery_product by R).
    }

    {{{ recompile }}}
}
