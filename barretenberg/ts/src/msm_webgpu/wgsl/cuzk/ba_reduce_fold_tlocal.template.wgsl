{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Thread-local tower fold level, M = 8, no carried streams (a level-0
// kernel). Each thread folds its column's 8 points as an in-register binary
// tower instead of the running-sum walk: the recurrence releases only 2
// independent adds per row, but the subset-sum decomposition
//   R = ΣP_i,  Λ = Σ i·P_i = 4·H + 2·Pr + O
//   (H/Pr/O = the bit-2/bit-1/bit-0 index subsets, sharing the R tree)
// exposes rounds of 6/4/3/2/1 INDEPENDENT ops, each round one batched
// inversion (16 ops, 5 inversions, avg C ≈ 3.2) — at full dispatch width,
// zero barriers, zero shared memory. The kernel body is fully straight-line
// (no row loop): the only loops in the module are pk14's own dynamic loops,
// so the Mali driver's loop-unroll pass has nothing to unroll.
//
// Inputs/outputs match the affine fold at ns = 0: affine x/y planes +
// is_present, R to the run slot (base+q), Λ to the alg slot (base+G+q).
// Ragged rows (rowslot ≥ B) enter as absent. The host dispatches this only
// for levels where EVERY window's schedule has M == 8 (no split-c).

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(2) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(3) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(4) var<storage, read>       fold_sched: array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, max_fold_levels, _).
// lparams = (lv, _, _, _).

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

fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}

fn fr_dbl_f8(a: array<u32, 8>) -> array<u32, 8> { return fr_add_f8(a, a); }

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.y;
    let q = wgid.x * WG + lid.x;
    let M_RED = cparams.x;
    let maxl = cparams.z;
    let lv = lparams.x;
    let row = w * (1u + maxl);
    let base = fold_sched[row].x;
    let e = fold_sched[row + 1u + lv];
    let G = e.x;
    let B = e.z;
    if (G == 0u || q >= G) {
        return;
    }
    let r1: array<u32, 8> = get_r_f8();

{{{ tlocal_body }}}

    {{{ recompile }}}
}
