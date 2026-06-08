{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Cooperative fused-TAIL reducer for the bin-packed pair-tree.
//
// The bin-packed pair-tree's deep levels are starved: a structured MSM has a
// few giant buckets whose reduction is log2(count) SERIAL levels, and once the
// per-level pair count drops below the GPU width every level is its own
// dispatch that pays a full drain+refill while doing almost no work (measured:
// ~0.35 ms/level on M2 regardless of thread count, 50%+ of the fused at small
// structured N). This kernel collapses that tail into ONE dispatch: one
// workgroup per bucket reduces the bucket's <= CAP remaining points to a single
// sum entirely in workgroup memory, with barriers between tree levels (no
// drain+refill), then finalizes into bucket_result.
//
// All-Jacobian (inversion-free) tree — one inversion per non-trivial bucket at
// the end, vs the affine path's one inversion per S-pair-block per level. The
// host runs the affine fused for the high-occupancy levels 0..LT-1 (all buckets'
// pairs in parallel) and dispatches this for the starved tail; the trigger LT
// guarantees max bucket count <= CAP.
//
//   counts[b]     : this bucket's remaining active-point count
//   offsets[b]    : start index of the bucket's points in active_sums
//   active_sums   : M elements/plane (params.y), 2-plane SoA PG=2, AFFINE (x,y)
//   bucket_result : B_global elements/plane (params.w), AFFINE, touched-accumulated
// params.x = B (bucket count = workgroup count), .y = M, .z = bb_base, .w = B_global stride.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const CAP: u32 = {{ cap }}u;   // max points per bucket (= trigger guarantee), WG >= CAP

@group(0) @binding(0) var<storage, read>       counts:        array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:       array<u32>;
@group(0) @binding(2) var<storage, read>       active_sums:   array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> bucket_result: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:        vec4<u32>;
@group(0) @binding(5) var<storage, read_write> touched:       array<u32>;

fn ld8(q0: vec4<u32>, q1: vec4<u32>) -> array<u32, 8> {
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_active_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = 0u * PG * M + PG * idx;
    return ld8(active_sums[base + 0u], active_sums[base + 1u]);
}
fn load_active_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = 1u * PG * M + PG * idx;
    return ld8(active_sums[base + 0u], active_sums[base + 1u]);
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

// add-2007-bl (same formula as the reliable multi-dispatch reduce's jac_add_raw).
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

// Incomplete affine addition P + Q (one inversion) — for the touched-accumulate
// path when a later chunk adds into an already-written bucket_result.
fn affine_add(x1: array<u32, 8>, y1: array<u32, 8>, x2: array<u32, 8>, y2: array<u32, 8>) -> array<array<u32, 8>, 2> {
    let dx = fr_sub_f8(x2, x1);
    let dy = fr_sub_f8(y2, y1);
    let dx_inv = {{ inv_fn }}(dx);
    let lambda = montgomery_product_f8(dy, dx_inv);
    let l2 = montgomery_product_f8(lambda, lambda);
    let x3 = fr_sub_f8(fr_sub_f8(l2, x1), x2);
    let y3 = fr_sub_f8(montgomery_product_f8(lambda, fr_sub_f8(x1, x3)), y1);
    return array<array<u32, 8>, 2>(x3, y3);
}

// Finalize one bucket's affine partial into bucket_result (touched contract:
// first writes through, later affine-adds — matches ba_finalize_accumulate).
fn finalize_bucket(gb: u32, stride: u32, nx: array<u32, 8>, ny: array<u32, 8>) {
    let dst_x = 0u * PG * stride + PG * gb;
    let dst_y = 1u * PG * stride + PG * gb;
    if (touched[gb] == 0u) {
        bucket_result[dst_x + 0u] = vec4<u32>(nx[0], nx[1], nx[2], nx[3]);
        bucket_result[dst_x + 1u] = vec4<u32>(nx[4], nx[5], nx[6], nx[7]);
        bucket_result[dst_y + 0u] = vec4<u32>(ny[0], ny[1], ny[2], ny[3]);
        bucket_result[dst_y + 1u] = vec4<u32>(ny[4], ny[5], ny[6], ny[7]);
        touched[gb] = 1u;
    } else {
        let ex = ld8(bucket_result[dst_x + 0u], bucket_result[dst_x + 1u]);
        let ey = ld8(bucket_result[dst_y + 0u], bucket_result[dst_y + 1u]);
        let s = affine_add(ex, ey, nx, ny);
        bucket_result[dst_x + 0u] = vec4<u32>(s[0][0], s[0][1], s[0][2], s[0][3]);
        bucket_result[dst_x + 1u] = vec4<u32>(s[0][4], s[0][5], s[0][6], s[0][7]);
        bucket_result[dst_y + 0u] = vec4<u32>(s[1][0], s[1][1], s[1][2], s[1][3]);
        bucket_result[dst_y + 1u] = vec4<u32>(s[1][4], s[1][5], s[1][6], s[1][7]);
    }
}

// Per-bucket scratch: the active points, reduced in place by the tree. The
// in-place tree is race-free because each level READS into a register, then a
// barrier separates all reads from all writes, then a second barrier separates
// the writes from the next level's reads — so no thread ever reads a slot while
// another writes it (the bug that drove the prior coop reduce to serialise).
var<workgroup> sh: array<Jac, CAP>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    // 2D workgroup grid: bucket count can exceed the 65535 per-dimension cap
    // (numWindows*BW at large c), so the host dispatches X = min(B, 65535), Y =
    // ceil(B / 65535) and the global bucket id folds the two dimensions.
    let b = wgid.x + wgid.y * 65535u;
    let B = params.x;
    let M = params.y;
    let bb_base = params.z;
    let b_global_stride = params.w;
    if (b >= B) { return; }

    let C = counts[b];
    if (C == 0u) { return; }

    let t = lid.x;
    let off = offsets[b];
    let gb = b + bb_base;

    // count == 1 (the common shallow case): skip the Jacobian round-trip and its
    // inversion — just finalize the single affine point, like the plain finalize.
    if (C == 1u) {
        if (t == 0u) {
            finalize_bucket(gb, b_global_stride, load_active_x(off, M), load_active_y(off, M));
        }
        return;
    }

    // C > 1: cooperative all-Jacobian tree over the bucket's points.
    if (t < C) {
        sh[t] = Jac(load_active_x(off + t, M), load_active_y(off + t, M), get_r_f8());
    }
    workgroupBarrier();

    var n: u32 = C;
    loop {
        if (n <= 1u) { break; }
        let nhalf = (n + 1u) >> 1u;
        let do_pair = t < (n >> 1u);
        let do_carry = ((n & 1u) == 1u) && (t == (n >> 1u));
        // Read phase: every result lands in a register, nothing written yet.
        var myval: Jac;
        if (do_pair) { myval = jac_add(sh[2u * t], sh[2u * t + 1u]); }
        if (do_carry) { myval = sh[n - 1u]; }
        workgroupBarrier();
        // Write phase: writes target [0, nhalf); all reads above are done.
        if (do_pair || do_carry) { sh[t] = myval; }
        workgroupBarrier();
        n = nhalf;
    }

    if (t == 0u) {
        // sh[0] = Jacobian bucket sum. Convert to affine (one inversion).
        let Z = sh[0].z;
        let Zinv = {{ inv_fn }}(Z);
        let Z2inv = montgomery_product_f8(Zinv, Zinv);
        let Z3inv = montgomery_product_f8(Z2inv, Zinv);
        let nx = montgomery_product_f8(sh[0].x, Z2inv);
        let ny = montgomery_product_f8(sh[0].y, Z3inv);
        finalize_bucket(gb, b_global_stride, nx, ny);
    }

    {{{ recompile }}}
}
