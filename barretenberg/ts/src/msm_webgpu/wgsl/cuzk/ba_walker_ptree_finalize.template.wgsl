{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Walker pair-tree: finalize. MODE 0 (resolve): one thread per active
// bucket — tree-closed buckets (count <= 2^(k*-1)) copy their final
// AFFINE segment-head sum to red_buf; survivors are routed: <= MICRO
// residuals are serially madd-folded RIGHT HERE (Jacobian to the
// survivor scratch + appended to the shallow list, so the shallow fold
// dispatch is empty on uniform shapes), <= DEEP_MIN go to the shallow
// TPB-64 fold list, deeper to the TPB-256 deep list. MODE 1
// (survivors): SN survivors per thread, ONE batched safegcd over their
// fold Z's, affine to red_buf. Survivor count < THETA by construction.
//
// jac_params: .x = survivor-scratch base (vec4); meta[20] = k*,
// shallow bids at meta[32+i] (count meta[21], atomic), deep at
// meta[32+DEEP_BASE+i] (count meta[25]). params.w = M_partials.

const PG: u32 = 2u;
const SN: u32 = {{ sn }}u;
const MODE: u32 = {{ mode }}u;
// Survivor lists (bids at meta[32 + slot], fold result at scratch slot):
//   micro    [0, 2048):     folded in-place by MODE 0   (count meta[21])
//   shallow  [2048, 8192):  TPB-64 fold list             (count meta[26])
//   deep     [8192, 10240): TPB-256 fold list            (count meta[25])
const MICRO_CAP:    u32 = 2048u;
const SHALLOW_BASE: u32 = 2048u;
const SHALLOW_CAP:  u32 = 6144u;
const DEEP_BASE:    u32 = 8192u;
const DEEP_CAP:     u32 = 2048u;
const DEEP_MIN: u32 = 64u;
const MICRO: u32 = 8u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

// rw + atomic: MODE 0 appends to the survivor lists; surv_scratch is rw
// for the in-thread microfold results. Both are sub-ranges of one arena
// buffer, so both MUST be rw (mixed ro+rw of one buffer is illegal).
@group(0) @binding(0) var<storage, read_write> ptree_meta:     array<atomic<u32>>;
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

fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

// EFD mmadd-2007-bl: affine + affine -> Jacobian (Z1 = Z2 = 1). 6 montmuls.
// Incomplete: assumes x1 != x2 (walker's standing distinct-x assumption).
fn jac_mmadd(x1: array<u32, 8>, y1: array<u32, 8>, x2: array<u32, 8>, y2: array<u32, 8>) -> Jac {
    let H = fr_sub_f8(x2, x1);
    let HH = montgomery_product_f8(H, H);
    let I = fr_dbl_f8(fr_dbl_f8(HH));
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(y2, y1));
    let V = montgomery_product_f8(x1, I);
    var X3 = fr_sub_f8(montgomery_product_f8(r, r), J);
    X3 = fr_sub_f8(X3, fr_dbl_f8(V));
    let Y1J = montgomery_product_f8(y1, J);
    var Y3 = montgomery_product_f8(r, fr_sub_f8(V, X3));
    Y3 = fr_sub_f8(Y3, fr_dbl_f8(Y1J));
    let Z3 = fr_dbl_f8(H);
    return Jac(X3, Y3, Z3);
}

// EFD madd-2007-bl: Jacobian + affine (Z2 = 1). 11 montmuls. Incomplete (as
// above). Implicit Z2=1 keeps constant R out of the loop — the Metal
// compiler-service crash documented in the fold.
fn jac_madd(p: Jac, x2: array<u32, 8>, y2: array<u32, 8>) -> Jac {
    let Z1Z1 = montgomery_product_f8(p.z, p.z);
    let U2 = montgomery_product_f8(x2, Z1Z1);
    let S2 = montgomery_product_f8(montgomery_product_f8(y2, p.z), Z1Z1);
    let H = fr_sub_f8(U2, p.x);
    let HH = montgomery_product_f8(H, H);
    let I = fr_dbl_f8(fr_dbl_f8(HH));
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, p.y));
    let V = montgomery_product_f8(p.x, I);
    var X3 = fr_sub_f8(montgomery_product_f8(r, r), J);
    X3 = fr_sub_f8(X3, fr_dbl_f8(V));
    let Y1J = montgomery_product_f8(p.y, J);
    var Y3 = montgomery_product_f8(r, fr_sub_f8(V, X3));
    Y3 = fr_sub_f8(Y3, fr_dbl_f8(Y1J));
    let ZpH = fr_add_f8(p.z, H);
    var Z3 = montgomery_product_f8(ZpH, ZpH);
    Z3 = fr_sub_f8(Z3, Z1Z1);
    Z3 = fr_sub_f8(Z3, HH);
    return Jac(X3, Y3, Z3);
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
    let kstar = atomicLoad(&ptree_meta[20]);
    let thr = 1u << (max(kstar, 1u) - 1u);
    let M_partials = params.w;

    if (MODE == 0u) {
        let t = gid.x;
        if (t >= active_meta[0]) { return; }
        let bid = active_buckets[t];
        let fb = flat_bid(bid, bw_geom.x);
        let cnt = pc_at(fb);
        // count==1 buckets were copied to red_buf by idx_scatter and never
        // enter the active list on the v2 pipeline; counts here are >= 2.
        if (cnt <= thr) { return; } // closed in-tree (direct-close wrote red)
        let seg = partial_offset[fb];
        let n_resid = (cnt + thr - 1u) / thr;
        if (n_resid <= MICRO) {
            // Micro survivor: fold the residuals serially right here
            // (mmadd seed + madds; n_resid >= 2 by the survivor test) and
            // publish like a fold workgroup would.
            let s0 = pl_at(seg);
            let s1 = pl_at(seg + thr);
            var acc = jac_mmadd(
                load_px(s0), load_py(s0, M_partials),
                load_px(s1), load_py(s1, M_partials));
            var j: u32 = 2u;
            loop {
                if (j >= n_resid || j >= MICRO) { break; }
                let sj = pl_at(seg + j * thr);
                acc = jac_madd(acc, load_px(sj), load_py(sj, M_partials));
                j = j + 1u;
            }
            let idx = atomicAdd(&ptree_meta[21], 1u);
            if (idx >= MICRO_CAP) {
                // Micro list full: hand the bucket to the shallow fold
                // instead (the fold redoes it from the residuals).
                let sidx = atomicAdd(&ptree_meta[26], 1u);
                if (sidx < SHALLOW_CAP) { atomicStore(&ptree_meta[32u + SHALLOW_BASE + sidx], bid); }
                {{{ recompile }}}
                return;
            }
            {
                atomicStore(&ptree_meta[32u + idx], bid);
                let b = jac_params.x + 6u * idx;
                surv_scratch[b + 0u] = vec4<u32>(acc.x[0], acc.x[1], acc.x[2], acc.x[3]);
                surv_scratch[b + 1u] = vec4<u32>(acc.x[4], acc.x[5], acc.x[6], acc.x[7]);
                surv_scratch[b + 2u] = vec4<u32>(acc.y[0], acc.y[1], acc.y[2], acc.y[3]);
                surv_scratch[b + 3u] = vec4<u32>(acc.y[4], acc.y[5], acc.y[6], acc.y[7]);
                surv_scratch[b + 4u] = vec4<u32>(acc.z[0], acc.z[1], acc.z[2], acc.z[3]);
                surv_scratch[b + 5u] = vec4<u32>(acc.z[4], acc.z[5], acc.z[6], acc.z[7]);
            }
            {{{ recompile }}}
            return;
        }
        if (n_resid <= DEEP_MIN) {
            let idx = atomicAdd(&ptree_meta[26], 1u);
            if (idx < SHALLOW_CAP) { atomicStore(&ptree_meta[32u + SHALLOW_BASE + idx], bid); }
        } else {
            let idx = atomicAdd(&ptree_meta[25], 1u);
            if (idx < DEEP_CAP) { atomicStore(&ptree_meta[32u + DEEP_BASE + idx], bid); }
        }
        return;
    }

    // MODE 1: batched Z inversion over the fold results, all three lists
    // by virtual index: [0,n_m) micro, [n_m,n_m+n_s) shallow, then deep.
    let n_m = atomicLoad(&ptree_meta[21]);
    let n_s = atomicLoad(&ptree_meta[26]);
    let n_surv = n_m + n_s + atomicLoad(&ptree_meta[25]);
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
            var slot = i;
            if (i >= n_m + n_s) { slot = DEEP_BASE + (i - n_m - n_s); }
            else if (i >= n_m)  { slot = SHALLOW_BASE + (i - n_m); }
            let Z = load_surv_f8(jac_params.x + 6u * slot + 4u);
            z = fr_select_f8(Z, R, is_zero_f8(Z));
        }
        zsub[k] = z;
        if (k == 0u) {
            prod = z;
        } else {
            prod = montgomery_product_f8(prod, z);
        }
        if (k + 1u < SN) { pref[k] = prod; }
    }

    var inv = {{ inv_fn }}(prod);

    for (var kk: u32 = 0u; kk < SN; kk = kk + 1u) {
        let k = SN - 1u - kk;
        var zinv: array<u32, 8>;
        if (k == 0u) {
            zinv = inv;
        } else {
            zinv = montgomery_product_f8(inv, pref[k - 1u]);
            inv = montgomery_product_f8(inv, zsub[k]);
        }
        if (t0 + k >= n_surv) { continue; }

        let i = t0 + k;
        var slot = i;
        if (i >= n_m + n_s) { slot = DEEP_BASE + (i - n_m - n_s); }
        else if (i >= n_m)  { slot = SHALLOW_BASE + (i - n_m); }
        let b = jac_params.x + 6u * slot;
        let X = load_surv_f8(b);
        let Y = load_surv_f8(b + 2u);
        let z2 = montgomery_product_f8(zinv, zinv);
        let z3 = montgomery_product_f8(z2, zinv);
        write_red(
            atomicLoad(&ptree_meta[32u + slot]),
            montgomery_product_f8(X, z2),
            montgomery_product_f8(Y, z3));
    }

    {{{ recompile }}}
}
