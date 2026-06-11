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
const MICRO_MAX: u32 = 8u;
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


// Pair-tree: micro-survivor fold (one THREAD per bucket). Buckets with
// <= MICRO_MAX residuals are folded serially in-thread (mmadd seed +
// madds — implicit Z=1 keeps constant R out of the loop, the Metal
// landmine) and the Jacobian goes to the survivor scratch for the
// batched finalize. Sweeps its exact non-cap tier range then the cap
// tail (count guards pick out its buckets there).

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= ptree_meta[26]) { return; }
    let stride = ptree_meta[22];
    let M_partials = params.w;
    var pos: u32;
    if (i < ptree_meta[25]) {
        pos = ptree_meta[23] + i;
    } else {
        pos = ptree_meta[30] + (i - ptree_meta[25]);
    }
    let bid = sorted_active[pos];
    let fb = flat_bid(bid, bw_geom.x);
    let seg = partial_offset[fb] & 0x7fffffffu; // v2: bit 31 flags singles
    let cnt = pc_at(fb);
    if (cnt <= stride) { return; } // cap bucket closed in-tree
    let n_resid = (cnt + stride - 1u) / stride;
    if (n_resid > MICRO_MAX) { return; } // cap bucket owned by a fold tier

    let s0 = pl_at(seg);
    let s1 = pl_at(seg + stride);
    var acc = jac_mmadd(
        load_partial_x(s0), load_partial_y(s0, M_partials),
        load_partial_x(s1), load_partial_y(s1, M_partials));
    var j: u32 = 2u;
    loop {
        if (j >= n_resid || j >= MICRO_MAX) { break; }
        let sj = pl_at(seg + j * stride);
        acc = jac_madd(acc, load_partial_x(sj), load_partial_y(sj, M_partials));
        j = j + 1u;
    }

    let b = jac_params.x + 6u * (pos - ptree_meta[23]);
    surv_scratch[b + 0u] = vec4<u32>(acc.x[0], acc.x[1], acc.x[2], acc.x[3]);
    surv_scratch[b + 1u] = vec4<u32>(acc.x[4], acc.x[5], acc.x[6], acc.x[7]);
    surv_scratch[b + 2u] = vec4<u32>(acc.y[0], acc.y[1], acc.y[2], acc.y[3]);
    surv_scratch[b + 3u] = vec4<u32>(acc.y[4], acc.y[5], acc.y[6], acc.y[7]);
    surv_scratch[b + 4u] = vec4<u32>(acc.z[0], acc.z[1], acc.z[2], acc.z[3]);
    surv_scratch[b + 5u] = vec4<u32>(acc.z[4], acc.z[5], acc.z[6], acc.z[7]);

    {{{ recompile }}}
}
