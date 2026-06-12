{{> inverse_funcs }}

{{> field8_funcs }}

// Walker pair-tree: survivor finalize (static schedule). Survivors are
// the contiguous TAIL of the sorted active list: bucket i (range index)
// = sorted_active[meta[23] + i], its fold result at scratch slot i. SN
// survivors per thread, ONE batched safegcd over their fold Z's, affine
// to red_buf. Cap-bin buckets that closed in-tree sit inside the range
// with unwritten scratch — skipped via the count guard (z substituted R
// so the batch product stays clean).
//
// jac_params: .x = survivor-scratch base (vec4); meta[20] = k*,
// meta[22] = stride, meta[23] = range base, meta[24] = range size.
// params.w = M_partials.

const PG: u32 = 2u;
const SN: u32 = {{ sn }}u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

// rw: ptree_meta, sorted actives and surv_scratch share arena A4 — all
// bindings of that buffer must be rw (mixed ro+rw is illegal).
@group(0) @binding(0) var<storage, read_write> ptree_meta:     array<u32>;
// sorted_active_buckets: pure bids from walker_index v2's counting sort
// (in-bin order nondeterministic — irrelevant here, we visit all). rw
// (read-only use): shares arena A5 with partial_offset, which therefore
// must also be rw — mixed ro+rw of one buffer is illegal.
@group(0) @binding(1) var<storage, read_write> active_buckets: array<u32>;
@group(0) @binding(2) var<storage, read>       active_meta:    array<u32>;
@group(0) @binding(3) var<storage, read>       arena_a2:       array<u32>;
@group(0) @binding(4) var<storage, read_write> partial_offset: array<u32>;
@group(0) @binding(5) var<storage, read>       partials_buf:   array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> surv_scratch:   array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> red_buf:        array<vec4<u32>>;
// WindowDesc as a STORAGE array<u32> (stride-8 rows): reduce_off = +4.
@group(0) @binding(8) var<storage, read>       window_desc:    array<u32>;
@group(0) @binding(9) var<uniform>             params:         vec4<u32>;
@group(0) @binding(10) var<uniform>            batch_offset:   vec4<u32>;
@group(0) @binding(11) var<uniform>            arena_off:      vec4<u32>;
@group(0) @binding(12) var<uniform>            bw_geom:        vec4<u32>;
@group(0) @binding(13) var<uniform>            jac_params:     vec4<u32>;

const WD_STRIDE: u32 = 8u;
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 4u]; }
fn pc_at(i: u32) -> u32 { return arena_a2[arena_off.x + i]; }
fn pl_at(i: u32) -> u32 { return arena_a2[arena_off.y + i]; }

fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}

fn load_surv_f8(base: u32) -> array<u32, 8> {
    let q0 = surv_scratch[base + 0u];
    let q1 = surv_scratch[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_px(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_py(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn write_red(bid: u32, x: array<u32, 8>, y: array<u32, 8>) {
    let window = bid >> WBID_SHIFT;
    let mag = bid & WBID_MAG_MASK;
    let rs = wd_reduce_off(window + batch_offset.x) + (mag - 1u);
    let bx = PG * rs;
    let by = PG * batch_offset.z + PG * rs;
    red_buf[bx + 0u] = vec4<u32>(x[0], x[1], x[2], x[3]);
    red_buf[bx + 1u] = vec4<u32>(x[4], x[5], x[6], x[7]);
    red_buf[by + 0u] = vec4<u32>(y[0], y[1], y[2], y[3]);
    red_buf[by + 1u] = vec4<u32>(y[4], y[5], y[6], y[7]);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let M_partials = params.w;


    let n_surv = ptree_meta[24];
    let base = ptree_meta[23];
    let stride = ptree_meta[22];
    let t0 = gid.x * SN;
    if (t0 >= n_surv) { return; }
    let R: array<u32, 8> = get_r_f8();

    var zsub: array<array<u32, 8>, {{ sn }}>;
    var pref: array<array<u32, 8>, {{ sn }}>;
    var prod: array<u32, 8> = R;
    for (var k: u32 = 0u; k < SN; k = k + 1u) {
        var z: array<u32, 8> = R;
        if (t0 + k < n_surv) {
            let i = t0 + k;
            let bid = active_buckets[base + i];
            let cnt = pc_at(flat_bid(bid, bw_geom.x));
            if (cnt > stride) {
                let Z = load_surv_f8(jac_params.x + 6u * i + 4u);
                z = fr_select_f8(Z, R, is_zero_f8(Z));
            }
        }
        zsub[k] = z;
        if (k == 0u) {
            prod = z;
        }
{{#sn_gt1}}
        else {
            prod = montgomery_product_f8(prod, z);
        }
{{/sn_gt1}}
        if (k + 1u < SN) { pref[k] = prod; }
    }

    var inv = {{ inv_fn }}(prod);

    for (var kk: u32 = 0u; kk < SN; kk = kk + 1u) {
        let k = SN - 1u - kk;
        // At SN = 1 (production) the batch prefix/peel multiplies are
        // statically elided — they would never execute, but their inlined
        // bodies would still be paid at compile time.
        var zinv: array<u32, 8>;
        if (k == 0u) {
            zinv = inv;
        }
{{#sn_gt1}}
        else {
            zinv = montgomery_product_f8(inv, pref[k - 1u]);
            inv = montgomery_product_f8(inv, zsub[k]);
        }
{{/sn_gt1}}
        if (t0 + k >= n_surv) { continue; }

        let i = t0 + k;
        let bid = active_buckets[base + i];
        if (pc_at(flat_bid(bid, bw_geom.x)) <= stride) { continue; } // closed in-tree
        let b = jac_params.x + 6u * i;
        let X = load_surv_f8(b);
        let Y = load_surv_f8(b + 2u);
        // Survivor points are homogeneous PROJECTIVE (vmpack complete add):
        // affine x = X·Z⁻¹, y = Y·Z⁻¹ — two multiplies through ONE site.
        var Xn: array<u32, 8>;
        var Yn: array<u32, 8>;
        var np: array<u32, 8> = X;
        for (var t: u32 = 0u; t < 2u; t = t + 1u) {
            let m = montgomery_product_f8(np, zinv);
            switch t {
                case 0u: { Xn = m; np = Y; }
                case 1u: { Yn = m; }
                default: {}
            }
        }
        write_red(bid, Xn, Yn);
    }

    {{{ recompile }}}
}
