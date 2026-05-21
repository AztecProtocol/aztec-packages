{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

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
//
// Field elements are 8x u32 throughout (Lever 2); see field8_funcs.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(2) var<storage, read_write> pref_scratch: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:       vec4<u32>;
@group(0) @binding(4) var<uniform>             schedule:     array<vec4<u32>, 64>;
// params.x = num_levels   params.y = M (red_buf element stride)
// params.z = maxc (pref_scratch slots per thread)   params.w = STRIDE

fn load_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_x(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn store_y(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * M + PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn store_pref(slot: u32, val: array<u32, 8>) {
    let base = 2u * slot;
    pref_scratch[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    pref_scratch[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn load_pref(slot: u32) -> array<u32, 8> {
    let base = 2u * slot;
    let q0 = pref_scratch[base + 0u];
    let q1 = pref_scratch[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
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
        var acc: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < C; k = k + 1u) {
            let j2 = tid * C + k;
            var denom: array<u32, 8> = get_r_f8();
            if (j2 < ppw) {
                if (kind == 2u) {
                    let slot = base + (j2 + 1u) * pa;
                    if (is_present[slot] != 0u) {
                        let y: array<u32, 8> = load_y(slot, M);
                        denom = fr_add_f8(y, y); // 2y
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
                        let x_s: array<u32, 8> = load_x(src, M);
                        let x_d: array<u32, 8> = load_x(dst, M);
                        let dx: array<u32, 8> = fr_sub_f8(x_s, x_d);
                        if (is_zero_f8(dx)) {
                            let y_d: array<u32, 8> = load_y(dst, M);
                            denom = fr_add_f8(y_d, y_d);
                        } else {
                            denom = dx;
                        }
                    }
                }
            }
            if (k == 0u) {
                acc = denom;
            } else {
                acc = montgomery_product_f8(acc, denom);
            }
            store_pref(scratch_base + k, acc);
        }

        // Single inversion per chunk. The safegcd inverse is 20x13-limb; the
        // reduction is 8x u32, so expand on the way in and contract the result.
        var acc20: BigInt = unpack256_to_limbs(acc);
        var inv20: BigInt = {{ inv_fn }}(acc20);
        var inv: array<u32, 8> = pack_limbs_to_256(&inv20);

        // ---- backward peel ----
        for (var kk: u32 = 0u; kk < C; kk = kk + 1u) {
            let k = C - 1u - kk;
            let j2 = tid * C + k;
            var inv_denom: array<u32, 8>;
            if (k == 0u) {
                inv_denom = inv;
            } else {
                let pp: array<u32, 8> = load_pref(scratch_base + (k - 1u));
                inv_denom = montgomery_product_f8(inv, pp);
            }
            if (j2 < ppw) {
                if (kind == 2u) {
                    let slot = base + (j2 + 1u) * pa;
                    if (is_present[slot] != 0u) {
                        let x: array<u32, 8> = load_x(slot, M);
                        let y: array<u32, 8> = load_y(slot, M);
                        let denom: array<u32, 8> = fr_add_f8(y, y);
                        let x2: array<u32, 8> = montgomery_product_f8(x, x);
                        var num: array<u32, 8> = fr_add_f8(x2, x2);
                        num = fr_add_f8(num, x2);
                        let lambda: array<u32, 8> = montgomery_product_f8(num, inv_denom);
                        let two_x: array<u32, 8> = fr_add_f8(x, x);
                        var r_x: array<u32, 8> = montgomery_product_f8(lambda, lambda);
                        r_x = fr_sub_f8(r_x, two_x);
                        var r_y: array<u32, 8> = fr_sub_f8(x, r_x);
                        r_y = montgomery_product_f8(lambda, r_y);
                        r_y = fr_sub_f8(r_y, y);
                        if (k > 0u) {
                            inv = montgomery_product_f8(inv, denom);
                        }
                        store_x(slot, M, r_x);
                        store_y(slot, M, r_y);
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
                        let x_d: array<u32, 8> = load_x(dst, M);
                        let x_s: array<u32, 8> = load_x(src, M);
                        let y_d: array<u32, 8> = load_y(dst, M);
                        let dx: array<u32, 8> = fr_sub_f8(x_s, x_d);
                        var r_x: array<u32, 8>;
                        var r_y: array<u32, 8>;
                        var denom_k: array<u32, 8>;
                        if (is_zero_f8(dx)) {
                            // Equal operands: 2 * buckets[dst].
                            denom_k = fr_add_f8(y_d, y_d);
                            let x2: array<u32, 8> = montgomery_product_f8(x_d, x_d);
                            var num: array<u32, 8> = fr_add_f8(x2, x2);
                            num = fr_add_f8(num, x2);
                            let lambda: array<u32, 8> = montgomery_product_f8(num, inv_denom);
                            let two_x: array<u32, 8> = fr_add_f8(x_d, x_d);
                            r_x = montgomery_product_f8(lambda, lambda);
                            r_x = fr_sub_f8(r_x, two_x);
                            r_y = fr_sub_f8(x_d, r_x);
                            r_y = montgomery_product_f8(lambda, r_y);
                            r_y = fr_sub_f8(r_y, y_d);
                        } else {
                            // buckets[dst] + buckets[src].
                            denom_k = dx;
                            let y_s: array<u32, 8> = load_y(src, M);
                            var lambda: array<u32, 8> = fr_sub_f8(y_s, y_d);
                            lambda = montgomery_product_f8(lambda, inv_denom);
                            r_x = montgomery_product_f8(lambda, lambda);
                            let x_sum: array<u32, 8> = fr_add_f8(x_d, x_s);
                            r_x = fr_sub_f8(r_x, x_sum);
                            r_y = fr_sub_f8(x_d, r_x);
                            r_y = montgomery_product_f8(lambda, r_y);
                            r_y = fr_sub_f8(r_y, y_d);
                        }
                        if (k > 0u) {
                            inv = montgomery_product_f8(inv, denom_k);
                        }
                        store_x(dst, M, r_x);
                        store_y(dst, M, r_y);
                    } else if (ps != 0u && pl == 0u) {
                        // dst empty, src present: buckets[dst] = buckets[src].
                        let x_s: array<u32, 8> = load_x(src, M);
                        let y_s: array<u32, 8> = load_y(src, M);
                        store_x(dst, M, x_s);
                        store_y(dst, M, y_s);
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
