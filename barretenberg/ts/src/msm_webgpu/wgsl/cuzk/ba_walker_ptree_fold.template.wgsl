{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Walker pair-tree: workgroup fold for the survivor tail (ONE dispatch,
// one WG per survivor). A survivor's residuals sit at segment-relative
// offsets j * 2^(k*-1) in the in-place stream. Threads stride-fold them in
// Jacobian (affine lift, inversion-free), then a fixed log2(TPB)-level
// shared-memory tree (FLAT u32 planes — Adreno rejects struct arrays)
// reduces to one Jacobian point per survivor, written to the survivor
// scratch for the batched finalize.
//
// jac_params: .x = survivor-scratch base (vec4 units, in merge scratch);
// params.w = M_partials. meta[20] = k*, survivor bids at meta[32+w].

const PG: u32 = 2u;
const TPB: u32 = {{ workgroup_size }}u;
// Survivors are the contiguous TAIL of the sorted active list (static
// schedule): bucket = sorted_active[meta[23] + w], scratch slot = w. This
// kernel folds buckets with <= TPB residuals; deeper (cap-bin) buckets
// belong to the two-stage deep pipeline (pair + combine).
const TPB64: u32 = 64u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

// rw (not ro): ptree_meta and surv_scratch are sub-ranges of ONE arena
// buffer — mixed ro+rw bindings of the same buffer in one scope are
// illegal (Dawn usage-scope rule). Bound rw, only read.
@group(0) @binding(0) var<storage, read_write> ptree_meta:     array<u32>;
@group(0) @binding(1) var<storage, read>       arena_a2:       array<u32>;
// rw (read-only use): shares arena A5 with sorted_active below.
@group(0) @binding(2) var<storage, read_write> partial_offset: array<u32>;
@group(0) @binding(3) var<storage, read>       partials_buf:   array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> surv_scratch:   array<vec4<u32>>;
@group(0) @binding(5) var<uniform>             params:         vec4<u32>;
@group(0) @binding(6) var<uniform>             arena_off:      vec4<u32>;
@group(0) @binding(7) var<uniform>             jac_params:     vec4<u32>;
@group(0) @binding(8) var<uniform>             bw_geom:        vec4<u32>;
// rw (read-only use): shares arena A5 with partial_offset.
@group(0) @binding(9) var<storage, read_write> sorted_active:  array<u32>;

fn pc_at(i: u32) -> u32 { return arena_a2[arena_off.x + i]; }
fn pl_at(i: u32) -> u32 { return arena_a2[arena_off.y + i]; }

fn load_partial_x(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_partial_y(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

// EFD add-2007-bl + branchless infinity handling (incomplete for equal
// finite points — standing assumption).
// EFD add-2007-bl, micro-coded 4-ISSUE: the same 16 multiplies packed
// into 5 loop iterations of 4 independent lanes (3 idle lanes pad the
// schedule off the critical path). Dependency depth is FIVE multiplies —
// shallower than the straight-lined form's compiler schedule — while
// the kernel inlines only four multiplier bodies (Mali's compile cost
// scales with inlined bodies). Routing is constant-case switches over
// named locals: registers only, no dynamic indexing.
fn jac_add_raw(p1: Jac, p2: Jac) -> Jac {
    var Z1Z1: array<u32, 8>;
    var Z2Z2: array<u32, 8>;
    var U1: array<u32, 8>;
    var U2: array<u32, 8>;
    var S1: array<u32, 8>;
    var S2: array<u32, 8>;
    var T1: array<u32, 8>;
    var T2: array<u32, 8>;
    var H: array<u32, 8>;
    var I: array<u32, 8>;
    var J: array<u32, 8>;
    var r: array<u32, 8>;
    var RR: array<u32, 8>;
    var V: array<u32, 8>;
    var ZZ: array<u32, 8>;
    var X3: array<u32, 8>;
    var Y3: array<u32, 8>;
    var Z3: array<u32, 8>;
    var a1: array<u32, 8>;
    var b1: array<u32, 8>;
    var a2: array<u32, 8>;
    var b2: array<u32, 8>;
    var a3: array<u32, 8>;
    var b3: array<u32, 8>;
    var a4: array<u32, 8>;
    var b4: array<u32, 8>;
    for (var st: u32 = 0u; st < 5u; st = st + 1u) {
        switch st {
            case 0u: {
                a1 = p1.z; b1 = p1.z;
                a2 = p2.z; b2 = p2.z;
                a3 = p1.y; b3 = p2.z;
                a4 = p2.y; b4 = p1.z;
            }
            case 1u: {
                a1 = p1.x; b1 = Z2Z2;
                a2 = p2.x; b2 = Z1Z1;
                a3 = T1; b3 = Z2Z2;
                a4 = T2; b4 = Z1Z1;
            }
            case 2u: {
                let tw = fr_dbl_f8(H);
                let zp = fr_add_f8(p1.z, p2.z);
                a1 = tw; b1 = tw;
                a2 = r; b2 = r;
                a3 = zp; b3 = zp;
                a4 = r; b4 = r;
            }
            case 3u: {
                a1 = H; b1 = I;
                a2 = U1; b2 = I;
                a3 = H; b3 = I;
                a4 = H; b4 = I;
            }
            case 4u: {
                a1 = S1; b1 = J;
                a2 = r; b2 = fr_sub_f8(V, X3);
                a3 = fr_sub_f8(fr_sub_f8(ZZ, Z1Z1), Z2Z2); b3 = H;
                a4 = S1; b4 = J;
            }
            default: {}
        }
        let m1 = montgomery_product_f8(a1, b1);
        let m2 = montgomery_product_f8(a2, b2);
        let m3 = montgomery_product_f8(a3, b3);
        let m4 = montgomery_product_f8(a4, b4);
        switch st {
            case 0u: { Z1Z1 = m1; Z2Z2 = m2; T1 = m3; T2 = m4; }
            case 1u: {
                U1 = m1;
                U2 = m2;
                S1 = m3;
                S2 = m4;
                H = fr_sub_f8(U2, U1);
                r = fr_dbl_f8(fr_sub_f8(S2, S1));
            }
            case 2u: { I = m1; RR = m2; ZZ = m3; }
            case 3u: {
                J = m1;
                V = m2;
                X3 = fr_sub_f8(fr_sub_f8(RR, J), fr_dbl_f8(V));
            }
            case 4u: {
                Y3 = fr_sub_f8(m2, fr_dbl_f8(m1));
                Z3 = m3;
            }
            default: {}
        }
    }
    return Jac(X3, Y3, Z3);
}

fn jac_add(dst: Jac, src: Jac) -> Jac {
    let sum = jac_add_raw(dst, src);
    let src_inf = is_zero_f8(src.z);
    let dst_inf = is_zero_f8(dst.z);
    var rx = fr_select_f8(sum.x, src.x, dst_inf);
    var ry = fr_select_f8(sum.y, src.y, dst_inf);
    var rz = fr_select_f8(sum.z, src.z, dst_inf);
    rx = fr_select_f8(rx, dst.x, src_inf);
    ry = fr_select_f8(ry, dst.y, src_inf);
    rz = fr_select_f8(rz, dst.z, src_inf);
    return Jac(rx, ry, rz);
}

// EFD mmadd-2007-bl: affine + affine -> Jacobian (Z1 = Z2 = 1). 6 montmuls.
// Incomplete: assumes x1 != x2 (walker's standing distinct-x assumption).
fn jac_mmadd(x1: array<u32, 8>, y1: array<u32, 8>, x2: array<u32, 8>, y2: array<u32, 8>) -> Jac {
    // Straight-lined (6 multiplies — cheap bodies; the compile cost lives
    // in jac_add, which is micro-coded 4-issue).
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
    return Jac(X3, Y3, fr_dbl_f8(H));
}


var<workgroup> wg_x: array<u32, {{ wg_words }}>;
var<workgroup> wg_y: array<u32, {{ wg_words }}>;
var<workgroup> wg_z: array<u32, {{ wg_words }}>;

fn wg_store(l: u32, p: Jac) {
    let b = l * 8u;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        wg_x[b + i] = p.x[i];
        wg_y[b + i] = p.y[i];
        wg_z[b + i] = p.z[i];
    }
}
fn wg_load(l: u32) -> Jac {
    let b = l * 8u;
    var x: array<u32, 8>;
    var y: array<u32, 8>;
    var z: array<u32, 8>;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        x[i] = wg_x[b + i];
        y[i] = wg_y[b + i];
        z[i] = wg_z[b + i];
    }
    return Jac(x, y, z);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;
    let l = lid.x;
    // Plain per-thread reads, stride PRECOMPUTED by ptree_scan (meta[22]):
    // both workgroupUniformLoad and the runtime shift fed Apple's Metal
    // compiler-service crash (XPC_ERROR_CONNECTION_INTERRUPTED).
    let stride = ptree_meta[22];
    let M_partials = params.w;

    // Position mapping (see epilogue): the exact non-cap range first, then
    // the cap tail (cap buckets with few residuals are this kernel's via
    // the n_resid guard; deeper ones belong to the deep pipeline).
    var pos: u32;
    if (w < ptree_meta[29]) {
        pos = ptree_meta[27] + w;
    } else {
        pos = ptree_meta[30] + (w - ptree_meta[29]);
    }
    let bid = sorted_active[pos];
    let fb = flat_bid(bid, bw_geom.x);
    let seg = partial_offset[fb] & 0x7fffffffu; // v2: bit 31 flags singles
    let cnt = pc_at(fb);
    let n_resid = (cnt + stride - 1u) / stride;
    // Cap-bin buckets that closed in-tree sit inside the range, and the
    // two variants split the range by residual count. The predicate is
    // workgroup-uniform in fact (per-bucket), but Tint cannot prove it —
    // so no early returns: skipped buckets just fold infinities through
    // the (barrier-bearing) tree below.
    let proceed = cnt > stride && n_resid <= TPB64;

    // Seed: mmadd-pair adjacent residuals (6 muls, both inputs affine) so
    // the tree starts at half the population.
    let pop = (n_resid + 1u) >> 1u;
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    var acc = Jac(zero, zero, zero); // infinity
    if (proceed && 2u * l < n_resid) {
        let j0 = 2u * l;
        let s0 = pl_at(seg + j0 * stride);
        let x0 = load_partial_x(s0);
        let y0 = load_partial_y(s0, M_partials);
        if (j0 + 1u < n_resid) {
            let s1 = pl_at(seg + (j0 + 1u) * stride);
            acc = jac_mmadd(x0, y0, load_partial_x(s1), load_partial_y(s1, M_partials));
        } else {
            // Odd tail: straight-line affine lift (constant R is only
            // hazardous inside loops).
            acc = Jac(x0, y0, get_r_f8());
        }
    }
    wg_store(l, acc);
    workgroupBarrier();

    // proceed and n_resid are uniform per workgroup (one bucket per WG);
    // the barrier stays outside the guard, so skipped workgroups pay
    // barriers only. s < n_resid additionally skips tree levels above the
    // bucket's population — slots there hold infinities, so the adds are
    // exact no-ops costing full montgomery chains. Chain depth becomes
    // ceil(log2(n_resid)): a 2-residual bucket pays ONE add, not log2(TPB).
    var s: u32 = TPB / 2u;
    loop {
        if (s == 0u) { break; }
        if (l < s && proceed && s < pop) { wg_store(l, jac_add(wg_load(l), wg_load(l + s))); }
        workgroupBarrier();
        s = s / 2u;
    }

    if (l == 0u && proceed) {
        let total = wg_load(0u);
        let b = jac_params.x + 6u * (pos - ptree_meta[23]);
        surv_scratch[b + 0u] = vec4<u32>(total.x[0], total.x[1], total.x[2], total.x[3]);
        surv_scratch[b + 1u] = vec4<u32>(total.x[4], total.x[5], total.x[6], total.x[7]);
        surv_scratch[b + 2u] = vec4<u32>(total.y[0], total.y[1], total.y[2], total.y[3]);
        surv_scratch[b + 3u] = vec4<u32>(total.y[4], total.y[5], total.y[6], total.y[7]);
        surv_scratch[b + 4u] = vec4<u32>(total.z[0], total.z[1], total.z[2], total.z[3]);
        surv_scratch[b + 5u] = vec4<u32>(total.z[4], total.z[5], total.z[6], total.z[7]);
    }

    {{{ recompile }}}
}
