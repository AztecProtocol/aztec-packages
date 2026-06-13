


{{> field8_funcs }}

// Halving-reduction finisher, pass 1 of 2: one small workgroup per
// (window, array) — grid x = array, y = window. The region's L_f slots are
// loaded into workgroup memory, tree-reduced there with workgroupBarrier()
// between rolled steps, and the total is written back to the array's home
// slot — which IS the staging slot pass 2 reads. Carry workgroups apply
// the carry's power-of-two constant ((r − a) doublings, concurrent across
// workgroups); the weighted-array workgroup (a = 0) continues the halving
// recursion inside its region with a lane-0 Horner over the internal
// carries.
//
// Absence (z == 0) is the only special case the arithmetic handles —
// equal/negated operands are dlog-hard for disjoint subset-sums of SRS
// points, so there are no equal-point branches (the walker's discipline).
// The cooperative load synthesizes z from is_present (affine entries get
// Montgomery 1; a cleared presence flag wins over any stale red_z).

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(3) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(4) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(5) var<storage, read>       hsched:     array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> stage_out:  array<vec4<u32>>;
// cparams = (M_RED, _, _, _);
// lparams = (finisher_depth, inputs_jac, log2_B, dump_mode) — the finisher
// geometry lives in the UNIFORM buffer (not hsched) because the master
// loop's trip count derives from it and the workgroupBarrier()s inside
// require uniform control flow; dump_mode: 0 = real run, 1 = raw-slot
// depth-bisection dump, 2+K = run K master-loop iterations then stage;
// hsched[w] = (base, B, 0, 0) — only base is read here.
// stage_out: compact export of the staged points for the early-exit
// readback — record (w·(1+d_f) + a) holds x, y, z as 6 vec4s of
// standard-form (NON-Montgomery) LE integers, z == 0 ⇒ absent — the same
// wire convention as the legacy 64-byte window roots, so any bb build
// re-wraps them with its own Montgomery radix (native R = 2^256, wasm
// R = 2^261 differ; shipping either kernel-domain or bb-domain limbs
// cannot be portable). stage_set converts each coordinate out of the
// kernel's R_gpu = 2^(num_words·word_size) domain with one montmul by 1.

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
fn load_zp(idx: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_z[base + 0u];
    let q1 = red_z[base + 1u];
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
fn store_z(idx: u32, val: array<u32, 8>) {
    let base = PG * idx;
    red_z[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_z[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn stage_to_std(v: array<u32, 8>) -> array<u32, 8> {
    let one = array<u32, 8>(1u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return montgomery_product_f8(v, one);
}

fn stage_set(i: u32, p: Jac) {
    let b = 6u * i;
    let cx = stage_to_std(p.x);
    let cy = stage_to_std(p.y);
    let cz = stage_to_std(p.z);
    stage_out[b + 0u] = vec4<u32>(cx[0], cx[1], cx[2], cx[3]);
    stage_out[b + 1u] = vec4<u32>(cx[4], cx[5], cx[6], cx[7]);
    stage_out[b + 2u] = vec4<u32>(cy[0], cy[1], cy[2], cy[3]);
    stage_out[b + 3u] = vec4<u32>(cy[4], cy[5], cy[6], cy[7]);
    stage_out[b + 4u] = vec4<u32>(cz[0], cz[1], cz[2], cz[3]);
    stage_out[b + 5u] = vec4<u32>(cz[4], cz[5], cz[6], cz[7]);
}

fn fr_eq_f8(a: array<u32, 8>, b: array<u32, 8>) -> bool {
    return a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3] &&
           a[4] == b[4] && a[5] == b[5] && a[6] == b[6] && a[7] == b[7];
}
fn fr_is_zero_f8(a: array<u32, 8>) -> bool {
    return (a[0] | a[1] | a[2] | a[3] | a[4] | a[5] | a[6] | a[7]) == 0u;
}
fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }



fn gstore(idx: u32, v: Jac) {
    store_x(idx, cparams.x, v.x);
    store_y(idx, cparams.x, v.y);
    store_z(idx, v.z);
}

// Workgroup-shared mirror of the region's Lf slots: the cooperative tree
// synchronizes through workgroup memory + workgroupBarrier() (storage-buffer
// writes are NOT reliably visible across a workgroup on mobile drivers).
// Flat SCALAR u32 element type — every phone-proven kernel stores scalars
// in workgroup memory; composite array<u32,8> copies at dynamic LDS indices
// are untrodden driver ground.
var<workgroup> sh: array<u32, {{ sh_words }}>;

fn sl_x(i: u32) -> array<u32, 8> {
    let b = 24u * i;
    return array<u32, 8>(sh[b], sh[b + 1u], sh[b + 2u], sh[b + 3u], sh[b + 4u], sh[b + 5u], sh[b + 6u], sh[b + 7u]);
}
fn sl_y(i: u32) -> array<u32, 8> {
    let b = 24u * i + 8u;
    return array<u32, 8>(sh[b], sh[b + 1u], sh[b + 2u], sh[b + 3u], sh[b + 4u], sh[b + 5u], sh[b + 6u], sh[b + 7u]);
}
fn sl_z(i: u32) -> array<u32, 8> {
    let b = 24u * i + 16u;
    return array<u32, 8>(sh[b], sh[b + 1u], sh[b + 2u], sh[b + 3u], sh[b + 4u], sh[b + 5u], sh[b + 6u], sh[b + 7u]);
}
fn ss_x(i: u32, v: array<u32, 8>) {
    let b = 24u * i;
    for (var c = 0u; c < 8u; c = c + 1u) { sh[b + c] = v[c]; }
}
fn ss_y(i: u32, v: array<u32, 8>) {
    let b = 24u * i + 8u;
    for (var c = 0u; c < 8u; c = c + 1u) { sh[b + c] = v[c]; }
}
fn ss_z(i: u32, v: array<u32, 8>) {
    let b = 24u * i + 16u;
    for (var c = 0u; c < 8u; c = c + 1u) { sh[b + c] = v[c]; }
}
fn sload(i: u32) -> Jac {
    return Jac(sl_x(i), sl_y(i), sl_z(i));
}
fn sstore(i: u32, v: Jac) {
    ss_x(i, v.x);
    ss_y(i, v.y);
    ss_z(i, v.z);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let a = wgid.x;
    let w = wgid.y;
    let M_RED = cparams.x;
    let h = hsched[w];
    let base = h.x;
    let B = 1u << lparams.z;
    let t = lid.x;
    let off = select(B >> a, 0u, a == 0u);

{{{ f1_body }}}
}
