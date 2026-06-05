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

// One level of the recursive affine bucket reduction. The host issues one
// dispatch per schedule level; WebGPU's between-pass ordering provides the
// cross-level memory ordering. ALL THREE kinds (phase-A suffix add,
// phase-B/D tree-add, phase-C double) share this single kernel and select
// behaviour via `lparams.w` — uniform across the workgroup, so the compiler
// specialises per-dispatch with zero SIMT divergence cost. Phase 5 of
// UNIFIED_COMBINE_PLAN.md collapses three kind-specialised pipelines into
// one.
//
// Branchless within a thread: every data-dependent decision (bucket
// presence, the add-vs-copy-vs-skip cases, the per-candidate denominator)
// is a `select`, not an `if`. Point-equality (P = +/-Q) handling is
// omitted — the algorithm assumes uniformly-random inputs with no point
// collisions, so the affine add denominator x_s - x_d is never zero.
//
// One workgroup per window. Field elements are 8x u32 (Lever 2); see
// field8_funcs.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const KIND_SUFFIX:  u32 = 0u;   // dst += src,  dst = src - 1
const KIND_TREE:    u32 = 1u;   // dst += src,  dst = 2*j2*pa, src = (2*j2+1)*pa
const KIND_DOUBLE:  u32 = 2u;   // slot = 2*slot, slot = base + (j2+1)*pa

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(2) var<storage, read_write> pref_scratch: array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             cparams:      vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:      vec4<u32>;
// cparams = (M (red_buf element stride), maxc (pref slots/thread), STRIDE, _)
//   — constant across all levels.
// lparams = (pa, pb, ppw, kind) — this level's flattened schedule entry.

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

// Branchless elementwise select on the 8x u32 field form: returns `b` when
// `cond`, else `a` (matches WGSL's select(false_val, true_val, cond)).
fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;       // window — one workgroup per window
    let tid = lid.x;      // thread within the workgroup
    let M = cparams.x;
    let maxc = cparams.y;
    let stride = cparams.z;
    let pa = lparams.x;
    let pb = lparams.y;
    let ppw = lparams.z;
    let kind = lparams.w;
    let base = w * stride;
    let scratch_base = (w * WG + tid) * maxc;
    // Candidates per thread this level — uniform across the workgroup.
    let C = (ppw + WG - 1u) / WG;

    if (tid * C >= ppw) {
        return;
    }
    let R: array<u32, 8> = get_r_f8();

    // ---- forward: prefix product of per-candidate denominators ----
    var acc: array<u32, 8> = R;
    for (var k: u32 = 0u; k < C; k = k + 1u) {
        let j2 = tid * C + k;
        let in_range = j2 < ppw;

        var real_denom: array<u32, 8>;
        var present: bool;
        if (kind == KIND_DOUBLE) {
            let slot = base + (j2 + 1u) * pa;
            present = in_range && (is_present[slot] != 0u);
            let yv = load_y(slot, M);
            real_denom = fr_add_f8(yv, yv); // 2y
        } else {
            var src: u32;
            var dst: u32;
            if (kind == KIND_SUFFIX) {
                src = base + j2 * pa + pb;
                dst = src - 1u;
            } else {
                // KIND_TREE
                dst = base + 2u * j2 * pa;
                src = base + (2u * j2 + 1u) * pa;
            }
            present = in_range && (is_present[src] != 0u) && (is_present[dst] != 0u);
            let x_s = load_x(src, M);
            let x_d = load_x(dst, M);
            real_denom = fr_sub_f8(x_s, x_d); // x_s - x_d (nonzero: no collisions)
        }
        let denom: array<u32, 8> = fr_select_f8(R, real_denom, present);
        acc = montgomery_product_f8(acc, denom);
        store_pref(scratch_base + k, acc);
    }

    // Single inversion per chunk. f8 inverse: 8x u32 in/out; others: BigInt round-trip.
{{#inv_f8}}
    var inv: array<u32, 8> = {{ inv_fn }}(acc);
{{/inv_f8}}
{{^inv_f8}}
    var acc20: BigInt = unpack256_to_limbs(acc);
    var inv20: BigInt = {{ inv_fn }}(acc20);
    var inv: array<u32, 8> = pack_limbs_to_256(&inv20);
{{/inv_f8}}

    // ---- backward peel ----
    for (var kk: u32 = 0u; kk < C; kk = kk + 1u) {
        let k = C - 1u - kk;
        let j2 = tid * C + k;
        let in_range = j2 < ppw;
        let km1 = max(k, 1u) - 1u;
        let pp: array<u32, 8> = fr_select_f8(load_pref(scratch_base + km1), R, k == 0u);
        let inv_denom: array<u32, 8> = montgomery_product_f8(inv, pp);

        if (kind == KIND_DOUBLE) {
            let slot = base + (j2 + 1u) * pa;
            let present = in_range && (is_present[slot] != 0u);
            let xv: array<u32, 8> = load_x(slot, M);
            let yv: array<u32, 8> = load_y(slot, M);
            let real_denom: array<u32, 8> = fr_add_f8(yv, yv); // 2y
            let x2: array<u32, 8> = montgomery_product_f8(xv, xv);
            var num: array<u32, 8> = fr_add_f8(x2, x2);
            num = fr_add_f8(num, x2); // 3x^2
            let lambda: array<u32, 8> = montgomery_product_f8(num, inv_denom);
            let two_x: array<u32, 8> = fr_add_f8(xv, xv);
            var r_x: array<u32, 8> = montgomery_product_f8(lambda, lambda);
            r_x = fr_sub_f8(r_x, two_x);
            var r_y: array<u32, 8> = fr_sub_f8(xv, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, yv);
            let out_x: array<u32, 8> = fr_select_f8(xv, r_x, present);
            let out_y: array<u32, 8> = fr_select_f8(yv, r_y, present);
            let denom_k: array<u32, 8> = fr_select_f8(R, real_denom, present);
            inv = montgomery_product_f8(inv, denom_k);
            if (in_range) {
                store_x(slot, M, out_x);
                store_y(slot, M, out_y);
            }
        } else {
            var src: u32;
            var dst: u32;
            if (kind == KIND_SUFFIX) {
                src = base + j2 * pa + pb;
                dst = src - 1u;
            } else {
                dst = base + 2u * j2 * pa;
                src = base + (2u * j2 + 1u) * pa;
            }
            let ps = is_present[src] != 0u;
            let pl = is_present[dst] != 0u;
            let both = in_range && ps && pl;       // dst += src (affine add)
            let copy = in_range && ps && (!pl);    // dst = src (occupy empty slot)
            let x_d: array<u32, 8> = load_x(dst, M);
            let x_s: array<u32, 8> = load_x(src, M);
            let y_d: array<u32, 8> = load_y(dst, M);
            let y_s: array<u32, 8> = load_y(src, M);
            let dx: array<u32, 8> = fr_sub_f8(x_s, x_d);
            var lambda: array<u32, 8> = fr_sub_f8(y_s, y_d);
            lambda = montgomery_product_f8(lambda, inv_denom);
            var add_rx: array<u32, 8> = montgomery_product_f8(lambda, lambda);
            let x_sum: array<u32, 8> = fr_add_f8(x_d, x_s);
            add_rx = fr_sub_f8(add_rx, x_sum);
            var add_ry: array<u32, 8> = fr_sub_f8(x_d, add_rx);
            add_ry = montgomery_product_f8(lambda, add_ry);
            add_ry = fr_sub_f8(add_ry, y_d);
            var out_x: array<u32, 8> = fr_select_f8(x_d, x_s, copy);
            out_x = fr_select_f8(out_x, add_rx, both);
            var out_y: array<u32, 8> = fr_select_f8(y_d, y_s, copy);
            out_y = fr_select_f8(out_y, add_ry, both);
            let denom_k: array<u32, 8> = fr_select_f8(R, dx, both);
            inv = montgomery_product_f8(inv, denom_k);
            let new_present: u32 = select(u32(pl), 1u, copy);
            if (in_range) {
                store_x(dst, M, out_x);
                store_y(dst, M, out_y);
                is_present[dst] = new_present;
            }
        }
    }

    {{{ recompile }}}
}
