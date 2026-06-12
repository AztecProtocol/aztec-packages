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

// EFD mmadd-2007-bl: affine + affine -> Jacobian (Z1 = Z2 = 1). 6 montmuls,
// micro-coded 2-ISSUE: 3 loop iterations of 2 independent lanes, so the
// kernel inlines TWO multiplier bodies instead of six (compile cost
// scales quasi-quadratically with inlined bodies). Dependency depth is
// three multiplies — the same as the straight-lined form's critical
// path (HH -> {J, V} -> Y3 terms). Routing is constant-case switches
// over named locals: registers only, no dynamic indexing.
// Incomplete: assumes x1 != x2 (walker's standing distinct-x assumption).
fn jac_mmadd(x1: array<u32, 8>, y1: array<u32, 8>, x2: array<u32, 8>, y2: array<u32, 8>) -> Jac {
    let H = fr_sub_f8(x2, x1);
    let r = fr_dbl_f8(fr_sub_f8(y2, y1));
    var HH: array<u32, 8>;
    var RR: array<u32, 8>;
    var I: array<u32, 8>;
    var J: array<u32, 8>;
    var V: array<u32, 8>;
    var X3: array<u32, 8>;
    var Y3: array<u32, 8>;
    var a1: array<u32, 8>;
    var b1: array<u32, 8>;
    var a2: array<u32, 8>;
    var b2: array<u32, 8>;
    for (var st: u32 = 0u; st < 3u; st = st + 1u) {
        switch st {
            case 0u: {
                a1 = H; b1 = H;
                a2 = r; b2 = r;
            }
            case 1u: {
                a1 = H; b1 = I;
                a2 = x1; b2 = I;
            }
            case 2u: {
                a1 = y1; b1 = J;
                a2 = r; b2 = fr_sub_f8(V, X3);
            }
            default: {}
        }
        let m1 = montgomery_product_f8(a1, b1);
        let m2 = montgomery_product_f8(a2, b2);
        switch st {
            case 0u: {
                HH = m1;
                RR = m2;
                I = fr_dbl_f8(fr_dbl_f8(HH));
            }
            case 1u: {
                J = m1;
                V = m2;
                X3 = fr_sub_f8(fr_sub_f8(RR, J), fr_dbl_f8(V));
            }
            case 2u: {
                Y3 = fr_sub_f8(m2, fr_dbl_f8(m1));
            }
            default: {}
        }
    }
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


// Pair-tree deep pipeline, stage A: pair-reduce a CHUNK of a cap-bin
// bucket. One 256-thread workgroup per 512-residual chunk; each thread
// mmadds one adjacent residual pair (no loop-carried montmul chains —
// the chain is the fixed log-depth tree), and thread 0 writes the
// chunk's Jacobian partial to the deep-partial scratch region at
// [range + wgid]. Chunk->bucket mapping scans the cap bin — the full bin,
// with no iteration ceiling: structured inputs (witness-like mass plus
// repeated values) produce cap bins of hundreds of entries, and a capped
// scan silently orphans every chunk past the cap. Overdispatched
// workgroups exit via the total.
//
// meta: [22] stride, [23] surv base, [24] range, [30] cap base.

const CHUNK: u32 = 512u;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let stride = ptree_meta[22];
    let M_partials = params.w;
    let cap_base = ptree_meta[30];
    let n_active_end = ptree_meta[23] + ptree_meta[24];

    // Find this workgroup's (bucket, chunk).
    var w = wgid.x;
    var pos = cap_base;
    var found = false;
    var seg: u32 = 0u;
    var n_resid: u32 = 0u;
    var chunk: u32 = 0u;
    loop {
        if (pos >= n_active_end) { break; }
        let bid = sorted_active[pos];
        let fb = flat_bid(bid, bw_geom.x);
        let cnt = pc_at(fb);
        let nr = (cnt + stride - 1u) / stride;
        let g = (nr + CHUNK - 1u) / CHUNK;
        if (w < g) {
            seg = partial_offset[fb] & 0x7fffffffu;
            n_resid = nr;
            chunk = w;
            found = true;
            break;
        }
        w = w - g;
        pos = pos + 1u;
    }

    let l = lid.x;
    let rem_chunk = select(0u, min(n_resid - chunk * CHUNK, CHUNK), found && n_resid > chunk * CHUNK);
    let pop = (rem_chunk + 1u) >> 1u;

    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    var acc = Jac(zero, zero, zero); // infinity
    if (found && 2u * l < rem_chunk) {
        let j0 = chunk * CHUNK + 2u * l;
        let s0 = pl_at(seg + j0 * stride);
        let x0 = load_partial_x(s0);
        let y0 = load_partial_y(s0, M_partials);
        if (2u * l + 1u < rem_chunk) {
            let s1 = pl_at(seg + (j0 + 1u) * stride);
            acc = jac_mmadd(x0, y0, load_partial_x(s1), load_partial_y(s1, M_partials));
        } else {
            acc = Jac(x0, y0, get_r_f8());
        }
    }
    wg_store(l, acc);
    workgroupBarrier();

    var s: u32 = TPB / 2u;
    loop {
        if (s == 0u) { break; }
        if (l < s && found && s < pop) { wg_store(l, jac_add(wg_load(l), wg_load(l + s))); }
        workgroupBarrier();
        s = s / 2u;
    }

    if (l == 0u && found) {
        let total = wg_load(0u);
        let b = jac_params.x + 6u * (ptree_meta[24] + wgid.x);
        surv_scratch[b + 0u] = vec4<u32>(total.x[0], total.x[1], total.x[2], total.x[3]);
        surv_scratch[b + 1u] = vec4<u32>(total.x[4], total.x[5], total.x[6], total.x[7]);
        surv_scratch[b + 2u] = vec4<u32>(total.y[0], total.y[1], total.y[2], total.y[3]);
        surv_scratch[b + 3u] = vec4<u32>(total.y[4], total.y[5], total.y[6], total.y[7]);
        surv_scratch[b + 4u] = vec4<u32>(total.z[0], total.z[1], total.z[2], total.z[3]);
        surv_scratch[b + 5u] = vec4<u32>(total.z[4], total.z[5], total.z[6], total.z[7]);
    }

    {{{ recompile }}}
}
