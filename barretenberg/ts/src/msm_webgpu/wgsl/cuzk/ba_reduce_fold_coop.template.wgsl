{{> inverse_funcs }}



{{> field8_funcs }}

// One fold level of the fold-tower bucket reduction, batch-affine with a
// WORKGROUP-COOPERATIVE inversion (GROUPED_REDUCE_PLAN.md). The per-thread
// fold amortises one pk14 inversion over only C = 2+NSTREAMS adds at k = 1,
// and buying a bigger C via k chunks/thread sells occupancy 1:1 (C × threads
// is invariant). Here the batch crosses threads instead: each lane multiplies
// its row's C denominators into one value (the local chain), the workgroup
// builds a shared-memory product tree over the WG lane products (up-sweep,
// log2(WG) rounds × 1 montmul), lane 0 inverts the workgroup total ONCE per
// row, and the down-sweep distributes inverses back down — at each node the
// children receive parent-inverse × sibling-product — so every lane ends
// with the inverse of its own lane product and peels its C denominators
// locally. Scan + unwind ≈ 3 montmuls/lane/row; the inversion itself
// amortises over WG·C adds. Full dispatch width, no occupancy trade.
//
// Latency: while lane 0 runs the ~17.5-montmul inversion the other lanes
// wait at a barrier, but the core keeps executing other resident workgroups
// — same occupancy argument that hides memory latency. This kernel exists
// to validate that claim by measurement.
//
// Barriers must sit in uniform control flow: no early lane returns, no
// ragged-row `continue`. Idle lanes (q >= G) and ragged rows contribute
// identity denominators (r1) and are predicated out of apply/store via
// `row_on`/`lane_on`. The single uniform exit is the G == 0 no-op-level
// return, taken by the whole workgroup together. The row-loop bound M and
// the level geometry are uniform: workgroup_id-derived indices into the
// read-only fold_sched.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
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

// Binary product tree in workgroup memory, heap layout: internal nodes
// [1, WG), leaves [WG, 2·WG). Field elements as 2 vec4s; slot 0 unused.
var<workgroup> sh_tree: array<vec4<u32>, {{ tree_vec4s }}>;

fn tree_get(i: u32) -> array<u32, 8> {
    let q0 = sh_tree[2u * i];
    let q1 = sh_tree[2u * i + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn tree_set(i: u32, v: array<u32, 8>) {
    sh_tree[2u * i] = vec4<u32>(v[0], v[1], v[2], v[3]);
    sh_tree[2u * i + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
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
    if (G == 0u) {
        return;
    }
    let span = G;
    let lane_on = q < G;
    let r1: array<u32, 8> = get_r_f8();

{{{ chunk_decls }}}

    for (var t: u32 = 0u; t < M; t = t + 1u) {
        let i = M - 1u - t;
        let row_on = lane_on && (i * G + q < B);

{{{ chunk_gather }}}

{{{ coop_chain }}}
        tree_set(WG + lid.x, lp);
        workgroupBarrier();
        for (var s: u32 = WG >> 1u; s >= 1u; s = s >> 1u) {
            if (lid.x < s) {
                let n = s + lid.x;
                tree_set(n, montgomery_product_f8(tree_get(2u * n), tree_get(2u * n + 1u)));
            }
            workgroupBarrier();
        }
        if (lid.x == 0u) {
            tree_set(1u, fr_inv_by_loop_pk(tree_get(1u)));
        }
        workgroupBarrier();
        for (var s: u32 = 1u; s < WG; s = s << 1u) {
            if (lid.x < s) {
                let n = s + lid.x;
                let inv_n = tree_get(n);
                let lprod = tree_get(2u * n);
                let rprod = tree_get(2u * n + 1u);
                tree_set(2u * n, montgomery_product_f8(inv_n, rprod));
                tree_set(2u * n + 1u, montgomery_product_f8(inv_n, lprod));
            }
            workgroupBarrier();
        }
        var inv_acc: array<u32, 8> = tree_get(WG + lid.x);
{{{ coop_peel }}}

{{{ chunk_apply }}}
    }

    if (lane_on) {
{{{ chunk_store }}}
    }

    {{{ recompile }}}
}
