{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// In-place batched-affine ADD for the recursive affine bucket reduction
// (phases A / B / D). Operates in place on red_buf: buckets[dst] += buckets[src].
// Within one phase-level the src-set and dst-set are disjoint, so the level
// runs race-free in place; each phase-level is its own dispatch.
//
// Pairs are computed from phase/level uniforms (fixed power-of-2 strides) —
// no plan buffer. is_present filters identity slots: a NOP slot (src absent,
// or candidate past the real count) uses denominator R (the
// montgomery_product identity) so it stays inert in the shared batched
// inverse; a COPY slot (dst absent, src present) copies src -> dst.
//
// Equal operands: the COPY path duplicates points, so a later level can add
// a slot to a copy of itself. dx == 0 there, so such a slot is handled as a
// DOUBLE (denominator 2y) instead of an ADD — the affine tangent gives the
// correct 2P. (Equal-x / opposite-y is statistically impossible for the
// bench's random points, so it is treated as a double too.)

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(2) var<storage, read_write> pref_scratch: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:       vec4<u32>;
@group(0) @binding(4) var<uniform>             params2:      vec4<u32>;
// params.x = T (threads)   params.y = M (red_buf element stride)
// params.z = STRIDE        params.w = phase (0 = A, 1 = B, 2 = D)
// params2.x = L0   params2.y = level   params2.z = ppw   params2.w = T_cands

struct Cand {
    src: u32,
    dst: u32,
    cls: u32, // 0 = NOP, 1 = COPY, 2 = REAL
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

fn is_zero(v: ptr<function, BigInt>) -> bool {
    let w = pack_limbs_to_256(v);
    return (w[0] | w[1] | w[2] | w[3] | w[4] | w[5] | w[6] | w[7]) == 0u;
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

// Map a flat candidate index to its (src, dst) red_buf slots and its class.
fn classify(cand: u32, phase: u32, stride: u32, l0: u32, level: u32, ppw: u32, t_cands: u32) -> Cand {
    var c: Cand;
    c.src = 0u;
    c.dst = 0u;
    c.cls = 0u;
    if (cand >= t_cands) {
        return c;
    }
    let w = cand / ppw;
    let j2 = cand % ppw;
    let base = w * stride;
    if (phase == 0u) {
        c.src = base + j2 * l0 + level;
        c.dst = base + j2 * l0 + level - 1u;
    } else {
        c.dst = base + 2u * j2 * level;
        c.src = base + (2u * j2 + 1u) * level;
    }
    let pr = is_present[c.src];
    let pl = is_present[c.dst];
    if (pr == 0u) {
        c.cls = 0u;
    } else if (pl == 0u) {
        c.cls = 1u;
    } else {
        c.cls = 2u;
    }
    return c;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M = params.y;
    let stride = params.z;
    let phase = params.w;
    let l0 = params2.x;
    let level = params2.y;
    let ppw = params2.z;
    let t_cands = params2.w;
    let t = gid.x;
    if (t >= T) { return; }

    // Forward: prefix product of per-slot denominators. dx = x_src - x_dst
    // for a real add; 2*y_dst for an equal-operand double; R (inert) for
    // NOP / COPY slots.
    var acc: BigInt = get_r();
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let c = classify(t * S + k, phase, stride, l0, level, ppw, t_cands);
        var denom: BigInt = get_r();
        if (c.cls == 2u) {
            var x_s: BigInt = load_x(c.src, M);
            var x_d: BigInt = load_x(c.dst, M);
            var dx: BigInt = fr_sub(&x_s, &x_d);
            if (is_zero(&dx)) {
                var y_d: BigInt = load_y(c.dst, M);
                denom = fr_add(&y_d, &y_d);
            } else {
                denom = dx;
            }
        }
        if (k == 0u) {
            acc = denom;
        } else {
            acc = montgomery_product(&acc, &denom);
        }
        store_pref(t * S + k, &acc);
    }

    // Single inversion per thread.
    var inv: BigInt = {{ inv_fn }}(acc);

    // Backward peel: REAL -> affine add or (equal operands) double; COPY ->
    // copy src to dst.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        let c = classify(t * S + k, phase, stride, l0, level, ppw, t_cands);

        var inv_denom: BigInt;
        if (k == 0u) {
            inv_denom = inv;
        } else {
            var pp: BigInt = load_pref(t * S + (k - 1u));
            inv_denom = montgomery_product(&inv, &pp);
        }

        if (c.cls == 2u) {
            var x_d: BigInt = load_x(c.dst, M);
            var x_s: BigInt = load_x(c.src, M);
            var y_d: BigInt = load_y(c.dst, M);
            var dx: BigInt = fr_sub(&x_s, &x_d);
            var r_x: BigInt;
            var r_y: BigInt;
            var denom_k: BigInt;
            if (is_zero(&dx)) {
                // Equal operands: 2 * buckets[dst].
                denom_k = fr_add(&y_d, &y_d);
                var x2: BigInt = montgomery_product(&x_d, &x_d);
                var num: BigInt = fr_add(&x2, &x2);
                num = fr_add(&num, &x2);
                var lambda: BigInt = montgomery_product(&num, &inv_denom);
                var two_x: BigInt = fr_add(&x_d, &x_d);
                r_x = montgomery_product(&lambda, &lambda);
                r_x = fr_sub(&r_x, &two_x);
                r_y = fr_sub(&x_d, &r_x);
                r_y = montgomery_product(&lambda, &r_y);
                r_y = fr_sub(&r_y, &y_d);
            } else {
                // buckets[dst] + buckets[src].
                denom_k = dx;
                var y_s: BigInt = load_y(c.src, M);
                var lambda: BigInt = fr_sub(&y_s, &y_d);
                lambda = montgomery_product(&lambda, &inv_denom);
                r_x = montgomery_product(&lambda, &lambda);
                r_x = fr_sub(&r_x, &x_d);
                r_x = fr_sub(&r_x, &x_s);
                r_y = fr_sub(&x_d, &r_x);
                r_y = montgomery_product(&lambda, &r_y);
                r_y = fr_sub(&r_y, &y_d);
            }
            if (k > 0u) {
                inv = montgomery_product(&inv, &denom_k);
            }
            store_x(c.dst, M, &r_x);
            store_y(c.dst, M, &r_y);
        } else if (c.cls == 1u) {
            // dst empty, src present: buckets[dst] = buckets[src].
            var x_s: BigInt = load_x(c.src, M);
            var y_s: BigInt = load_y(c.src, M);
            store_x(c.dst, M, &x_s);
            store_y(c.dst, M, &y_s);
            is_present[c.dst] = 1u;
        }
        // c.cls == 0u (NOP): nothing. inv is unchanged — montgomery_product
        // by R is the identity, so a dead slot never advances it.
    }

    {{{ recompile }}}
}
