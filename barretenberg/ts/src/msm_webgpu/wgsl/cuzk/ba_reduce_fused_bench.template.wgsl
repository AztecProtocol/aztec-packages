{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Fused recursive affine bucket reduction — the WHOLE 4-phase reduction in a
// single dispatch. One workgroup per window: every level's data dependency is
// then intra-workgroup, so a storageBarrier() between levels replaces the
// per-level dispatch boundary. This removes the ~0.35 ms fixed dispatch floor
// that dominated the 35-dispatch version.
//
// The level schedule (phases A, B, C, D flattened) is a uniform array; each
// entry is (kind, a, b, ppw):
//   kind 0  phase-A suffix-sum add   src = j*a+b,      dst = j*a+b-1   (a=L0, b=level)
//   kind 1  phase-B/D tree-add       dst = 2j*a,       src = (2j+1)*a  (a=level)
//   kind 2  phase-C double           slot = (j+1)*a                   (a=slot_stride)
// ppw = candidates per window for that level; j ranges over [0, ppw).
//
// Each level is a per-thread batched-affine round: the workgroup's WG threads
// split the window's ppw candidates into contiguous chunks of C = ceil(ppw/WG),
// each thread does a forward prefix-product of denominators, one inversion, and
// a backward peel. is_present filters identity slots (NOP -> denominator R, the
// montgomery_product identity); a COPY slot (dst absent, src present) copies.
// Equal operands (dx == 0, a COPY-duplicated point added to itself) become a
// double. See ba_reduce_init / the host 4-phase replay for the algorithm.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(2) var<storage, read_write> pref_scratch: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:       vec4<u32>;
@group(0) @binding(4) var<uniform>             schedule:     array<vec4<u32>, 64>;
// params.x = num_levels   params.y = M (red_buf element stride)
// params.z = maxc (pref_scratch slots per thread)   params.w = STRIDE

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

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;       // window — one workgroup per window
    let tid = lid.x;      // thread within the workgroup
    let num_levels = params.x;
    let M = params.y;
    let maxc = params.z;
    let stride = params.w;
    let base = w * stride;
    let scratch_base = (w * WG + tid) * maxc;

    for (var lv: u32 = 0u; lv < num_levels; lv = lv + 1u) {
        let desc = schedule[lv];
        let kind = desc.x;
        let pa = desc.y;
        let pb = desc.z;
        let ppw = desc.w;
        // Candidates per thread this level — uniform across the workgroup.
        let C = (ppw + WG - 1u) / WG;

        // ---- forward: prefix product of per-candidate denominators ----
        var acc: BigInt = get_r();
        for (var k: u32 = 0u; k < C; k = k + 1u) {
            let j2 = tid * C + k;
            var denom: BigInt = get_r();
            if (j2 < ppw) {
                if (kind == 2u) {
                    let slot = base + (j2 + 1u) * pa;
                    if (is_present[slot] != 0u) {
                        var y: BigInt = load_y(slot, M);
                        denom = fr_add(&y, &y); // 2y
                    }
                } else {
                    var src: u32;
                    var dst: u32;
                    if (kind == 0u) {
                        src = base + j2 * pa + pb;
                        dst = base + j2 * pa + pb - 1u;
                    } else {
                        dst = base + 2u * j2 * pa;
                        src = base + (2u * j2 + 1u) * pa;
                    }
                    if (is_present[src] != 0u && is_present[dst] != 0u) {
                        var x_s: BigInt = load_x(src, M);
                        var x_d: BigInt = load_x(dst, M);
                        var dx: BigInt = fr_sub(&x_s, &x_d);
                        if (is_zero(&dx)) {
                            var y_d: BigInt = load_y(dst, M);
                            denom = fr_add(&y_d, &y_d);
                        } else {
                            denom = dx;
                        }
                    }
                }
            }
            if (k == 0u) {
                acc = denom;
            } else {
                acc = montgomery_product(&acc, &denom);
            }
            store_pref(scratch_base + k, &acc);
        }

        var inv: BigInt = {{ inv_fn }}(acc);

        // ---- backward peel ----
        for (var kk: u32 = 0u; kk < C; kk = kk + 1u) {
            let k = C - 1u - kk;
            let j2 = tid * C + k;
            var inv_denom: BigInt;
            if (k == 0u) {
                inv_denom = inv;
            } else {
                var pp: BigInt = load_pref(scratch_base + (k - 1u));
                inv_denom = montgomery_product(&inv, &pp);
            }
            if (j2 < ppw) {
                if (kind == 2u) {
                    let slot = base + (j2 + 1u) * pa;
                    if (is_present[slot] != 0u) {
                        var x: BigInt = load_x(slot, M);
                        var y: BigInt = load_y(slot, M);
                        var denom: BigInt = fr_add(&y, &y);
                        var x2: BigInt = montgomery_product(&x, &x);
                        var num: BigInt = fr_add(&x2, &x2);
                        num = fr_add(&num, &x2);
                        var lambda: BigInt = montgomery_product(&num, &inv_denom);
                        var two_x: BigInt = fr_add(&x, &x);
                        var r_x: BigInt = montgomery_product(&lambda, &lambda);
                        r_x = fr_sub(&r_x, &two_x);
                        var r_y: BigInt = fr_sub(&x, &r_x);
                        r_y = montgomery_product(&lambda, &r_y);
                        r_y = fr_sub(&r_y, &y);
                        if (k > 0u) {
                            inv = montgomery_product(&inv, &denom);
                        }
                        store_x(slot, M, &r_x);
                        store_y(slot, M, &r_y);
                    }
                } else {
                    var src: u32;
                    var dst: u32;
                    if (kind == 0u) {
                        src = base + j2 * pa + pb;
                        dst = base + j2 * pa + pb - 1u;
                    } else {
                        dst = base + 2u * j2 * pa;
                        src = base + (2u * j2 + 1u) * pa;
                    }
                    let ps = is_present[src];
                    let pl = is_present[dst];
                    if (ps != 0u && pl != 0u) {
                        var x_d: BigInt = load_x(dst, M);
                        var x_s: BigInt = load_x(src, M);
                        var y_d: BigInt = load_y(dst, M);
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
                            var y_s: BigInt = load_y(src, M);
                            var lambda: BigInt = fr_sub(&y_s, &y_d);
                            lambda = montgomery_product(&lambda, &inv_denom);
                            r_x = montgomery_product(&lambda, &lambda);
                            var x_sum: BigInt = fr_add(&x_d, &x_s);
                            r_x = fr_sub(&r_x, &x_sum);
                            r_y = fr_sub(&x_d, &r_x);
                            r_y = montgomery_product(&lambda, &r_y);
                            r_y = fr_sub(&r_y, &y_d);
                        }
                        if (k > 0u) {
                            inv = montgomery_product(&inv, &denom_k);
                        }
                        store_x(dst, M, &r_x);
                        store_y(dst, M, &r_y);
                    } else if (ps != 0u && pl == 0u) {
                        // dst empty, src present: buckets[dst] = buckets[src].
                        var x_s: BigInt = load_x(src, M);
                        var y_s: BigInt = load_y(src, M);
                        store_x(dst, M, &x_s);
                        store_y(dst, M, &y_s);
                        is_present[dst] = 1u;
                    }
                }
            }
        }

        // Level boundary: make this level's red_buf / is_present writes visible
        // to the next level across the whole workgroup.
        storageBarrier();
    }

    {{{ recompile }}}
}
