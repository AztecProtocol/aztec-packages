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
{{#lds_pref}}
// Per-thread batch-inverse prefix products held in on-chip workgroup memory
// instead of the global pref_scratch buffer: the forward pass writes each
// thread's prefix products and the same thread reads them back on the peel,
// so no cross-thread sharing (no barrier) — but on the Adreno this turns a
// global round-trip (low bandwidth) into on-chip LDS traffic, and drops the
// numWindows*WG*maxc*32-byte global buffer entirely.
var<workgroup> lds_pref: array<vec4<u32>, {{lds_pref_vecs}}u>;
{{/lds_pref}}

// FP is a field element kept in the compact 256-bit packed form (8 u32 = the
// red_buf layout). The batch-affine code holds every live coordinate as an FP
// (8 words) instead of unpacking it to a 20-word BigInt, then unpacks only
// transiently inside the field-op wrappers below — cutting the affine-add's
// per-lane footprint (~7 live coords) from 20 words each to 8.
alias FP = array<u32, 8>;

fn fp_of(q0: vec4<u32>, q1: vec4<u32>) -> FP {
    return FP(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_x(idx: u32, M: u32) -> FP {
    let base = PG * idx;
    return fp_of(red_buf[base + 0u], red_buf[base + 1u]);
}

fn load_y(idx: u32, M: u32) -> FP {
    let base = PG * M + PG * idx;
    return fp_of(red_buf[base + 0u], red_buf[base + 1u]);
}

fn store_x(idx: u32, M: u32, v: FP) {
    let base = PG * idx;
    red_buf[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    red_buf[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

fn store_y(idx: u32, M: u32, v: FP) {
    let base = PG * M + PG * idx;
    red_buf[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    red_buf[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_r_packed() -> FP {
    var r: BigInt = get_r();
    return pack_limbs_to_256(&r);
}

fn is_zero(v: FP) -> bool {
    return (v[0] | v[1] | v[2] | v[3] | v[4] | v[5] | v[6] | v[7]) == 0u;
}

// Field-op wrappers: unpack the packed operands to 20-word BigInts, run the
// shared field op, repack. The 20-word forms live only for the op's duration.
fn fr_add_p(a: FP, b: FP) -> FP {
    var ba = unpack256_to_limbs(a);
    var bb = unpack256_to_limbs(b);
    var r = fr_add(&ba, &bb);
    return pack_limbs_to_256(&r);
}

fn fr_sub_p(a: FP, b: FP) -> FP {
    var ba = unpack256_to_limbs(a);
    var bb = unpack256_to_limbs(b);
    var r = fr_sub(&ba, &bb);
    return pack_limbs_to_256(&r);
}

fn mmul_p(a: FP, b: FP) -> FP {
    var ba = unpack256_to_limbs(a);
    var bb = unpack256_to_limbs(b);
    var r = montgomery_product(&ba, &bb);
    return pack_limbs_to_256(&r);
}

fn inv_p(a: FP) -> FP {
    var ba = unpack256_to_limbs(a);
    var r = {{ inv_fn }}(ba);
    return pack_limbs_to_256(&r);
}

fn store_pref(slot: u32, v: FP) {
    let base = 2u * slot;
{{#lds_pref}}
    lds_pref[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    lds_pref[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
{{/lds_pref}}
{{^lds_pref}}
    pref_scratch[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    pref_scratch[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
{{/lds_pref}}
}

fn load_pref(slot: u32) -> FP {
    let base = 2u * slot;
{{#lds_pref}}
    return fp_of(lds_pref[base + 0u], lds_pref[base + 1u]);
{{/lds_pref}}
{{^lds_pref}}
    return fp_of(pref_scratch[base + 0u], pref_scratch[base + 1u]);
{{/lds_pref}}
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
{{#lds_pref}}
    let scratch_base = tid * maxc;
{{/lds_pref}}
{{^lds_pref}}
    let scratch_base = (w * WG + tid) * maxc;
{{/lds_pref}}

    for (var lv: u32 = 0u; lv < num_levels; lv = lv + 1u) {
        let desc = schedule[lv];
        let kind = desc.x;
        let pa = desc.y;
        let pb = desc.z;
        let ppw = desc.w;
        // Candidates per thread this level — uniform across the workgroup.
        let C = (ppw + WG - 1u) / WG;

        // ---- forward: prefix product of per-candidate denominators ----
        var acc: FP = get_r_packed();
        for (var k: u32 = 0u; k < C; k = k + 1u) {
            let j2 = tid * C + k;
            var denom: FP = get_r_packed();
            if (j2 < ppw) {
                if (kind == 2u) {
                    let slot = base + (j2 + 1u) * pa;
                    if (is_present[slot] != 0u) {
                        let y: FP = load_y(slot, M);
                        denom = fr_add_p(y, y); // 2y
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
                        let x_s: FP = load_x(src, M);
                        let x_d: FP = load_x(dst, M);
                        let dx: FP = fr_sub_p(x_s, x_d);
                        if (is_zero(dx)) {
                            let y_d: FP = load_y(dst, M);
                            denom = fr_add_p(y_d, y_d);
                        } else {
                            denom = dx;
                        }
                    }
                }
            }
            if (k == 0u) {
                acc = denom;
            } else {
                acc = mmul_p(acc, denom);
            }
            store_pref(scratch_base + k, acc);
        }

        var inv: FP = inv_p(acc);

        // ---- backward peel ----
        for (var kk: u32 = 0u; kk < C; kk = kk + 1u) {
            let k = C - 1u - kk;
            let j2 = tid * C + k;
            var inv_denom: FP;
            if (k == 0u) {
                inv_denom = inv;
            } else {
                let pp: FP = load_pref(scratch_base + (k - 1u));
                inv_denom = mmul_p(inv, pp);
            }
            if (j2 < ppw) {
                if (kind == 2u) {
                    let slot = base + (j2 + 1u) * pa;
                    if (is_present[slot] != 0u) {
                        let x: FP = load_x(slot, M);
                        let y: FP = load_y(slot, M);
                        let denom: FP = fr_add_p(y, y);
                        let x2: FP = mmul_p(x, x);
                        var num: FP = fr_add_p(x2, x2);
                        num = fr_add_p(num, x2);
                        let lambda: FP = mmul_p(num, inv_denom);
                        let two_x: FP = fr_add_p(x, x);
                        var r_x: FP = mmul_p(lambda, lambda);
                        r_x = fr_sub_p(r_x, two_x);
                        var r_y: FP = fr_sub_p(x, r_x);
                        r_y = mmul_p(lambda, r_y);
                        r_y = fr_sub_p(r_y, y);
                        if (k > 0u) {
                            inv = mmul_p(inv, denom);
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
                        let x_d: FP = load_x(dst, M);
                        let x_s: FP = load_x(src, M);
                        let y_d: FP = load_y(dst, M);
                        let dx: FP = fr_sub_p(x_s, x_d);
                        var r_x: FP;
                        var r_y: FP;
                        var denom_k: FP;
                        if (is_zero(dx)) {
                            // Equal operands: 2 * buckets[dst].
                            denom_k = fr_add_p(y_d, y_d);
                            let x2: FP = mmul_p(x_d, x_d);
                            var num: FP = fr_add_p(x2, x2);
                            num = fr_add_p(num, x2);
                            let lambda: FP = mmul_p(num, inv_denom);
                            let two_x: FP = fr_add_p(x_d, x_d);
                            r_x = mmul_p(lambda, lambda);
                            r_x = fr_sub_p(r_x, two_x);
                            r_y = fr_sub_p(x_d, r_x);
                            r_y = mmul_p(lambda, r_y);
                            r_y = fr_sub_p(r_y, y_d);
                        } else {
                            // buckets[dst] + buckets[src].
                            denom_k = dx;
                            let y_s: FP = load_y(src, M);
                            var lambda: FP = fr_sub_p(y_s, y_d);
                            lambda = mmul_p(lambda, inv_denom);
                            r_x = mmul_p(lambda, lambda);
                            r_x = fr_sub_p(r_x, x_d);
                            r_x = fr_sub_p(r_x, x_s);
                            r_y = fr_sub_p(x_d, r_x);
                            r_y = mmul_p(lambda, r_y);
                            r_y = fr_sub_p(r_y, y_d);
                        }
                        if (k > 0u) {
                            inv = mmul_p(inv, denom_k);
                        }
                        store_x(dst, M, r_x);
                        store_y(dst, M, r_y);
                    } else if (ps != 0u && pl == 0u) {
                        // dst empty, src present: buckets[dst] = buckets[src].
                        let x_s: FP = load_x(src, M);
                        let y_s: FP = load_y(src, M);
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
