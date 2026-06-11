{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// One fold level of the fold-tower bucket reduction (GROUPED_REDUCE_PLAN.md),
// batch-affine, CHUNKS_PER_THREAD-way interleaved.
//
// Thread (w, q) owns CHUNKS_PER_THREAD chunks of window w (chunk ids
// q + j·G/K, j < K), each the strided slot rows {i·G + chunk : i < M} of the
// level's input arrays, walked DESCENDING with batch-affine accumulators in
// registers:
//   alg_j += running_j           (weight advance — row i ends up weighted i)
//   running_j += R_in[i·G + cj]  (is_present-guarded)
//   stream_j_s += S_in_s[...]    (plain fold of older Λ-descendants)
// ALL K·(2+NSTREAMS) adds of one row share ONE inversion (the in-register
// forward-prefix / invert / backward-peel) — C = K·(2+NSTREAMS) per
// inversion. K is chosen by the host per level so threads stay at the
// device's saturation width; levels below it run the Jacobian fold variant
// instead (ba_reduce_fold_jac) — batch-affine with C ≤ 2 is never used (a
// mixed Jacobian add is cheaper than 6 + inv/2 muls).
//
// Branchless (selects only); the lone data-dependent branch is the P+P
// doubling numerator, unreachable for dense inputs and warp-coherent when
// sparse. `alg += running` is collision-safe via ONE boolean per chunk
// (alg_dup: set on copy, cleared when running absorbs — the structural P+P
// predicate; no field compares). Apply order is alg-then-running (no
// snapshot); V y-loads happen AFTER the inversion (smaller live set across
// the long safegcd chain). In-place outputs land on thread-owned slots
// (≡ chunk id mod G); pass boundaries order levels.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const K: u32 = {{ chunks_per_thread }}u;
const NSTREAMS: u32 = {{ nstreams }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present: array<u32>;
@group(0) @binding(2) var<uniform>             cparams:    vec4<u32>;
@group(0) @binding(3) var<uniform>             lparams:    vec4<u32>;
@group(0) @binding(4) var<storage, read>       fold_sched: array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, max_fold_levels, _).
// lparams = (lv, _, _, _).
// fold_sched rows: row[0] = (base, B0, n_levels, combine_z_flag);
//   row[1+lv] = (G, M, B, 0); G == 0 marks a no-op level for the window.

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
    let M = e.y;
    let B = e.z;
    let span = G / K; // chunks per interleave slice (G is a power of two)
    if (G == 0u || q >= span) {
        return;
    }
    let r1: array<u32, 8> = get_r_f8();

{{{ chunk_decls }}}

    for (var t: u32 = 0u; t < M; t = t + 1u) {
        let i = M - 1u - t;
        if (i * G + q >= B) { continue; } // ragged guard (never taken for pow2 strides)

{{{ chunk_gather }}}

{{{ chunk_invert }}}

{{{ chunk_apply }}}
    }

{{{ chunk_store }}}

    {{{ recompile }}}
}
