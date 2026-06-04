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

// Cooperative pair-tree TAIL for the stream-walker's hot buckets.
//
// The walker's pt_loop reduces each hot bucket's slice of partials to a single
// sum via a multi-dispatch pair-tree (pt_build/pt_dispatch_chain/pt_combine per
// level, fixed PT_LEVELS=17). Its deep levels are a serial dependency chain of
// occupancy-starved dispatches — the same latency-floor tail the high-memory
// fused has. Hot buckets are few (NUM_HOT), so this collapses the tail into ONE
// dispatch: one workgroup per hot bucket reduces its remaining <= CAP partials
// in workgroup memory (all-Jacobian tree, barriers between levels), one
// inversion to affine, then writes red_buf at the bucket's reduce slot — exactly
// what pt_finalize does, which the host then skips for these buckets.
//
// pt_dispatch_chain fires this the moment max(pt_count) <= CAP (after that
// level's pt_combine has produced the <= CAP slice the coop reads).

const HOT_THRESHOLD: u32 = 8u;
const PG: u32 = 2u;
const BW:     u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
const M_RED:  u32 = {{ m_red }}u;
const WG:     u32 = {{ workgroup_size }}u;
const CAP:    u32 = {{ cap }}u;   // max partials per hot bucket, WG >= CAP

@group(0) @binding(0) var<storage, read>       sorted_active: array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:   array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:  array<u32>;
@group(0) @binding(3) var<storage, read>       pt_off:        array<u32>;
@group(0) @binding(4) var<storage, read>       pt_buf:        array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> red_buf:       array<vec4<u32>>;
@group(0) @binding(6) var<uniform>             params:        vec4<u32>;   // .x = M_pt
@group(0) @binding(7) var<storage, read_write> is_present:    array<u32>;
@group(0) @binding(8) var<uniform>             batch_offset:  vec4<u32>;
@group(0) @binding(9) var<storage, read>       pt_count:      array<u32>;

fn ld8(q0: vec4<u32>, q1: vec4<u32>) -> array<u32, 8> {
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_x(idx: u32) -> array<u32, 8> {
    return ld8(pt_buf[PG * idx + 0u], pt_buf[PG * idx + 1u]);
}
fn load_y(idx: u32, M_pt: u32) -> array<u32, 8> {
    return ld8(pt_buf[PG * M_pt + PG * idx + 0u], pt_buf[PG * M_pt + PG * idx + 1u]);
}

fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}
fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

// add-2007-bl (same formula the reliable multi-dispatch reduce uses).
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

fn write_red(bid: u32, nx: array<u32, 8>, ny: array<u32, 8>) {
    let red_slot = ((bid / BW) + batch_offset.x) * STRIDE + (bid % BW - 1u);
    red_buf[PG * red_slot + 0u] = vec4<u32>(nx[0], nx[1], nx[2], nx[3]);
    red_buf[PG * red_slot + 1u] = vec4<u32>(nx[4], nx[5], nx[6], nx[7]);
    red_buf[PG * M_RED + PG * red_slot + 0u] = vec4<u32>(ny[0], ny[1], ny[2], ny[3]);
    red_buf[PG * M_RED + PG * red_slot + 1u] = vec4<u32>(ny[4], ny[5], ny[6], ny[7]);
    is_present[red_slot] = 1u;
}

// Per-hot-bucket scratch. The in-place tree is race-free: each level reads into
// a register, a barrier separates all reads from all writes, a second barrier
// separates the writes from the next level's reads — so no thread reads a slot
// while another writes it.
var<workgroup> sh: array<Jac, CAP>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    // 2D grid: NUM_HOT can exceed the 65535 per-dimension cap on a dense MSM.
    let hot_idx = wgid.x + wgid.y * 65535u;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    if (cool_end + hot_idx >= NUM_ACTIVE) { return; }

    let t = lid.x;
    let M_pt = params.x;
    let base = pt_off[hot_idx];
    let C = pt_count[hot_idx];
    let bid = sorted_active[cool_end + hot_idx];
    if (C == 0u) { return; }

    // C == 1: the single partial is already affine — write it through, no tree
    // and no inversion (exactly the plain pt_finalize path).
    if (C == 1u) {
        if (t == 0u) { write_red(bid, load_x(base), load_y(base, M_pt)); }
        return;
    }

    // C > 1: cooperative all-Jacobian tree over the bucket's partials.
    if (t < C) {
        sh[t] = Jac(load_x(base + t), load_y(base + t, M_pt), get_r_f8());
    }
    workgroupBarrier();

    var n: u32 = C;
    loop {
        if (n <= 1u) { break; }
        let nhalf = (n + 1u) >> 1u;
        let do_pair = t < (n >> 1u);
        let do_carry = ((n & 1u) == 1u) && (t == (n >> 1u));
        var myval: Jac;
        if (do_pair) { myval = jac_add(sh[2u * t], sh[2u * t + 1u]); }
        if (do_carry) { myval = sh[n - 1u]; }
        workgroupBarrier();
        if (do_pair || do_carry) { sh[t] = myval; }
        workgroupBarrier();
        n = nhalf;
    }

    if (t == 0u) {
        let Z = sh[0].z;
        var z20: BigInt = unpack256_to_limbs(Z);
        var zinv20: BigInt = {{ inv_fn }}(z20);
        let Zinv = pack_limbs_to_256(&zinv20);
        let Z2inv = montgomery_product_f8(Zinv, Zinv);
        let Z3inv = montgomery_product_f8(Z2inv, Zinv);
        let nx = montgomery_product_f8(sh[0].x, Z2inv);
        let ny = montgomery_product_f8(sh[0].y, Z3inv);
        write_red(bid, nx, ny);
    }

    {{{ recompile }}}
}
