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
// schedule): bucket = sorted_active[meta[23] + w], scratch slot = w. Both
// fold variants sweep the whole range; DEEP picks residual counts > TPB64
// (the 64-thread variant's one-madd-per-thread capacity), the shallow
// variant the rest. Exactly one variant proceeds per bucket.
const DEEP: u32 = {{ deep }}u;
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
fn jac_add_raw(p1: Jac, p2: Jac) -> Jac {
    let Z1Z1 = montgomery_product_f8(p1.z, p1.z);
    let Z2Z2 = montgomery_product_f8(p2.z, p2.z);
    let U1 = montgomery_product_f8(p1.x, Z2Z2);
    let U2 = montgomery_product_f8(p2.x, Z1Z1);
    let S1 = montgomery_product_f8(montgomery_product_f8(p1.y, p2.z), Z2Z2);
    let S2 = montgomery_product_f8(montgomery_product_f8(p2.y, p1.z), Z1Z1);
    let H = fr_sub_f8(U2, U1);
    let twoH = fr_dbl_f8(H);
    let I = montgomery_product_f8(twoH, twoH);
    let J = montgomery_product_f8(H, I);
    let r = fr_dbl_f8(fr_sub_f8(S2, S1));
    let V = montgomery_product_f8(U1, I);
    let X3 = fr_sub_f8(fr_sub_f8(montgomery_product_f8(r, r), J), fr_dbl_f8(V));
    let S1J = montgomery_product_f8(S1, J);
    let Y3 = fr_sub_f8(montgomery_product_f8(r, fr_sub_f8(V, X3)), fr_dbl_f8(S1J));
    let ZpZ = fr_add_f8(p1.z, p2.z);
    let Z3 = montgomery_product_f8(fr_sub_f8(fr_sub_f8(montgomery_product_f8(ZpZ, ZpZ), Z1Z1), Z2Z2), H);
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
// above). The serial phase MUST stay madd, not jac_add over an R-lifted
// point: a compile-time-constant Z operand inside this loop feeds the
// montgomery chain with constant limbs and crashes Apple's Metal compiler
// service (XPC_ERROR_CONNECTION_INTERRUPTED) — bisected exhaustively.
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

    let bid = sorted_active[ptree_meta[23] + w];
    let fb = flat_bid(bid, bw_geom.x);
    let seg = partial_offset[fb] & 0x7fffffffu; // v2: bit 31 flags singles
    let cnt = pc_at(fb);
    let n_resid = (cnt + stride - 1u) / stride;
    // Cap-bin buckets that closed in-tree sit inside the range, and the
    // two variants split the range by residual count. The predicate is
    // workgroup-uniform in fact (per-bucket), but Tint cannot prove it —
    // so no early returns: skipped buckets just fold infinities through
    // the (barrier-bearing) tree below.
    let proceed =
        cnt > stride && ((DEEP == 0u && n_resid <= TPB64) || (DEEP == 1u && n_resid > TPB64));

    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    var acc = Jac(zero, zero, zero); // infinity
    if (proceed && l < n_resid) {
        let s0 = pl_at(seg + l * stride);
        let x0 = load_partial_x(s0);
        let y0 = load_partial_y(s0, M_partials);
        if (l + TPB < n_resid) {
            let s1 = pl_at(seg + (l + TPB) * stride);
            acc = jac_mmadd(x0, y0, load_partial_x(s1), load_partial_y(s1, M_partials));
            var iter: u32 = 0u;
            for (var j: u32 = l + 2u * TPB; j < n_resid; j = j + TPB) {
                if (iter >= 1024u) { break; }
                iter = iter + 1u;
                let sj = pl_at(seg + j * stride);
                acc = jac_madd(acc, load_partial_x(sj), load_partial_y(sj, M_partials));
            }
        } else {
            // Single residual: straight-line affine lift (constant R is
            // only hazardous inside the loop).
            acc = Jac(x0, y0, get_r_f8());
        }
    }
    wg_store(l, acc);
    workgroupBarrier();

    var s: u32 = TPB / 2u;
    loop {
        if (s == 0u) { break; }
        if (l < s) { wg_store(l, jac_add(wg_load(l), wg_load(l + s))); }
        workgroupBarrier();
        s = s / 2u;
    }

    if (l == 0u && proceed) {
        let total = wg_load(0u);
        let b = jac_params.x + 6u * w;
        surv_scratch[b + 0u] = vec4<u32>(total.x[0], total.x[1], total.x[2], total.x[3]);
        surv_scratch[b + 1u] = vec4<u32>(total.x[4], total.x[5], total.x[6], total.x[7]);
        surv_scratch[b + 2u] = vec4<u32>(total.y[0], total.y[1], total.y[2], total.y[3]);
        surv_scratch[b + 3u] = vec4<u32>(total.y[4], total.y[5], total.y[6], total.y[7]);
        surv_scratch[b + 4u] = vec4<u32>(total.z[0], total.z[1], total.z[2], total.z[3]);
        surv_scratch[b + 5u] = vec4<u32>(total.z[4], total.z[5], total.z[6], total.z[7]);
    }

    {{{ recompile }}}
}
