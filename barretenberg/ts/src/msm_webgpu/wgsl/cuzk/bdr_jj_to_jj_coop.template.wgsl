{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Bit-decomposition reduction round r >= 1, COOPERATIVE variant: 4 threads
// per merge, shared via workgroup memory across the 6 dependency levels of
// jac_add. Same total mults as the non-coop variant (16 mp per merge), but:
//   - per-thread peak live state shrinks from ~16 fields to ~6 (the lane
//     holds 6 inputs + 1-2 intermediates at a time, not the full jac_add
//     working set);
//   - dispatched thread count grows 4× (every JJ round now launches 4 ×
//     merge_count threads), so the smallest-round occupancy for c=8 goes
//     from 32 threads to 128 — closer to c=13's 640-thread last round
//     that previously hit 4.5× better per-mult.
//
// All active lanes within a level do the SAME operation kind (each level
// is "every active lane does one montgomery_product, just on different
// operands"), so SIMD lockstep doesn't penalise the cooperation.
//
// jac_add dependency graph (lane assignments in [...]):
//   L0   [4 lanes do mp]: z1z1 [0], z2z2 [1], y1z2 [2], y2z1 [3]
//   L1   [4 lanes do mp]: u1 [0], u2 [1], s1 [2], s2 [3]
//        + scalar zsum2 — folded into L2 to keep L1 at 4 mp.
//   L2a  [3 lanes do mp]: i = twoh*twoh [0], r2 = r*r [1], zsum2 = zsum*zsum [2]
//   L2b  [2 lanes do mp]: j = h*i [0], v = u1*i [1]
//   L2c  [3 lanes do mp]: rvx3 = r*vx3 [0], s1j = s1*j [1], z3 = zdelta*h [2]
// = 5 workgroupBarriers per merge (after L0, L1, L2a, L2b, L2c).
//
// Cross-barrier state staged in tg_inter (10 field-elements per merge ×
// 16 merges per WG × 32 B = 5 KiB per WG with WG=64).

const PG: u32 = 2u;
const WG: u32 = 64u;
const LANES_PER_MERGE: u32 = 4u;
const MERGES_PER_WG: u32 = WG / LANES_PER_MERGE; // = 16

// Per-merge intermediate slots (each = 1 field-element = 2 vec4<u32>):
//   0: z1z1     1: z2z2    2: y1z2    3: y2z1
//   4: u1       5: u2      6: s1      7: s2
//   8: zsum     (z1 + z2; needed for zsum2)
//   9: h        (u2 - u1; needed for j, z3)
//  10: i        11: r       (s2 - s1 doubled; needed for rvx3)
//  12: j        13: v
//  14: x3       (becomes output plane X)
//  15: r2       (transient — overwritten by rvx3 later if reused)
// Plus L2c outputs reuse slots 12-14 for the final answer.
// We round up to 16 slots per merge.
const SLOTS_PER_MERGE: u32 = 16u;
var<workgroup> tg_inter: array<vec4<u32>, MERGES_PER_WG * SLOTS_PER_MERGE * 2u>;

@group(0) @binding(0) var<storage, read>       in_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out_buf:   array<vec4<u32>>;
@group(0) @binding(2) var<storage, read>       meta_in:   array<u32>;
@group(0) @binding(3) var<storage, read_write> meta_out:  array<u32>;
@group(0) @binding(4) var<uniform>             params:    vec4<u32>;
// params.x = m_out_merges (= count of merges this round)
// params.y = in_plane_stride
// params.z = out_plane_stride
// params.w = nodes_per_tree_out (= nodes_per_tree_in / 2)

fn load_plane(plane: u32, node: u32) -> array<u32, 8> {
    let base = PG * plane + PG * node;
    let q0 = in_buf[base + 0u];
    let q1 = in_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_plane(plane: u32, node: u32, val: array<u32, 8>) {
    let base = PG * plane + PG * node;
    out_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    out_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn tg_store(local_merge: u32, slot: u32, v: array<u32, 8>) {
    let base = local_merge * SLOTS_PER_MERGE * 2u + slot * 2u;
    tg_inter[base + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    tg_inter[base + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

fn tg_load(local_merge: u32, slot: u32) -> array<u32, 8> {
    let base = local_merge * SLOTS_PER_MERGE * 2u + slot * 2u;
    let q0 = tg_inter[base + 0u];
    let q1 = tg_inter[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

@compute
@workgroup_size(WG)
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
) {
    let merge_id = gid.x / LANES_PER_MERGE;
    let lane = gid.x % LANES_PER_MERGE;
    let local_merge = lid.x / LANES_PER_MERGE;

    let m_out = params.x;
    let in_stride = params.y;
    let out_stride = params.z;
    let nodes_out = params.w;

    // Decode the two input children of this merge.
    let nodes_in = 2u * nodes_out;
    let k_out = merge_id % nodes_out;
    let after_k = merge_id / nodes_out;
    let in_base = after_k * nodes_in;
    let il = in_base + 2u * k_out;
    let ir = in_base + 2u * k_out + 1u;

    // OOB merges: still participate in barriers (workgroupBarrier requires
    // uniform control flow over the WG) but their final stores are guarded.
    let oob = merge_id >= m_out;
    // Presence handling: empty buckets become Jacobian inf (Z=0). The
    // straight-line cooperative path computes case (1,1); we override at
    // the end for (0,*), (*,0), (0,0).
    let l_pres_u = select(0u, 1u, !oob && (meta_in[il] & 1u) != 0u);
    let r_pres_u = select(0u, 1u, !oob && (meta_in[ir] & 1u) != 0u);

    // Per-lane inputs. Lane 0/2 work primarily with the L child, lane 1/3
    // with R; everyone needs at least its own x|y|z slice. To keep loads
    // simple and let the compiler hold whatever it needs, every lane loads
    // every input plane (the load_plane function calls are tiny, in_buf
    // hits L2 cache, and the compiler will drop unused inputs).
    let x1 = load_plane(0u * in_stride, il);
    let y1 = load_plane(1u * in_stride, il);
    let z1 = load_plane(2u * in_stride, il);
    let x2 = load_plane(0u * in_stride, ir);
    let y2 = load_plane(1u * in_stride, ir);
    let z2 = load_plane(2u * in_stride, ir);

    // Each level: pick per-lane (a, b) via switch (cheap register moves),
    // then ALL active lanes call the SAME montgomery_product_f8 site so
    // Adreno SIMD lockstep runs the heavy mp in parallel across lanes.
    // Idle-lane work goes through (a=b=zeros) → result discarded; cheaper
    // than the alternative serialised mp-per-case dispatch.
    let zero8: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    // ============================================================
    // L0: z1z1, z2z2, y1z2, y2z1 — one mp per lane.
    // ============================================================
    {
        var a: array<u32, 8>;
        var b: array<u32, 8>;
        switch (lane) {
            case 0u: { a = z1; b = z1; }
            case 1u: { a = z2; b = z2; }
            case 2u: { a = y1; b = z2; }
            default: { a = y2; b = z1; }
        }
        let v = montgomery_product_f8(a, b);
        tg_store(local_merge, lane, v);  // slots 0..3
    }
    workgroupBarrier();

    // ============================================================
    // L1: u1=x1*z2z2, u2=x2*z1z1, s1=y1z2*z2z2, s2=y2z1*z1z1 — one mp per lane.
    // ============================================================
    {
        let z1z1 = tg_load(local_merge, 0u);
        let z2z2 = tg_load(local_merge, 1u);
        let y1z2 = tg_load(local_merge, 2u);
        let y2z1 = tg_load(local_merge, 3u);
        var a: array<u32, 8>;
        var b: array<u32, 8>;
        switch (lane) {
            case 0u: { a = x1;   b = z2z2; }
            case 1u: { a = x2;   b = z1z1; }
            case 2u: { a = y1z2; b = z2z2; }
            default: { a = y2z1; b = z1z1; }
        }
        let v = montgomery_product_f8(a, b);
        tg_store(local_merge, 4u + lane, v);  // u1, u2, s1, s2 at slots 4..7
        if (lane == 0u) {
            let zsum = fr_add_f8(z1, z2);
            tg_store(local_merge, 8u, zsum);
        }
    }
    workgroupBarrier();

    // ============================================================
    // L2a: i = twoh*twoh, r2 = r*r, zsum2 = zsum*zsum (lane 3 idle ⇒ mp(0,0)).
    // Stash h (slot 9) and r (slot 12) for later levels.
    // ============================================================
    {
        let u1 = tg_load(local_merge, 4u);
        let u2 = tg_load(local_merge, 5u);
        let s1 = tg_load(local_merge, 6u);
        let s2 = tg_load(local_merge, 7u);
        let zsum = tg_load(local_merge, 8u);
        let h = fr_sub_f8(u2, u1);
        let twoh = fr_add_f8(h, h);
        let r = fr_add_f8(fr_sub_f8(s2, s1), fr_sub_f8(s2, s1));
        var a: array<u32, 8>;
        var b: array<u32, 8>;
        switch (lane) {
            case 0u: { a = twoh; b = twoh; }
            case 1u: { a = r;    b = r; }
            case 2u: { a = zsum; b = zsum; }
            default: { a = zero8; b = zero8; }
        }
        let v = montgomery_product_f8(a, b);
        // Store per-lane: l0→i (10), l1→r2 (15), l2→zsum2 (11); l3 discards.
        // Plus stash h, r for L2b/L2c.
        if (lane == 0u) {
            tg_store(local_merge, 10u, v);
            tg_store(local_merge, 9u, h);
        }
        if (lane == 1u) {
            tg_store(local_merge, 15u, v);
            tg_store(local_merge, 12u, r);
        }
        if (lane == 2u) {
            tg_store(local_merge, 11u, v);
        }
    }
    workgroupBarrier();

    // ============================================================
    // L2b: j = h*i, v = u1*i (lanes 2,3 idle).
    // ============================================================
    {
        let u1 = tg_load(local_merge, 4u);
        let h = tg_load(local_merge, 9u);
        let i_t = tg_load(local_merge, 10u);
        var a: array<u32, 8>;
        var b: array<u32, 8>;
        switch (lane) {
            case 0u: { a = h;  b = i_t; }
            case 1u: { a = u1; b = i_t; }
            default: { a = zero8; b = zero8; }
        }
        let v = montgomery_product_f8(a, b);
        if (lane == 0u) { tg_store(local_merge, 13u, v); }  // j
        if (lane == 1u) { tg_store(local_merge, 14u, v); }  // v
    }
    workgroupBarrier();

    // ============================================================
    // L2c: rvx3 = r*vx3, s1j = s1*j, z3 = zdelta*h, x3 = sub-only (lane 3).
    // ============================================================
    {
        let s1 = tg_load(local_merge, 6u);
        let z1z1 = tg_load(local_merge, 0u);
        let z2z2 = tg_load(local_merge, 1u);
        let h = tg_load(local_merge, 9u);
        let r = tg_load(local_merge, 12u);
        let j = tg_load(local_merge, 13u);
        let v_field = tg_load(local_merge, 14u);
        let r2 = tg_load(local_merge, 15u);
        let zsum2 = tg_load(local_merge, 11u);
        let twov = fr_add_f8(v_field, v_field);
        let x3 = fr_sub_f8(fr_sub_f8(r2, j), twov);
        let vx3 = fr_sub_f8(v_field, x3);
        let zdelta = fr_sub_f8(fr_sub_f8(zsum2, z1z1), z2z2);
        var a: array<u32, 8>;
        var b: array<u32, 8>;
        switch (lane) {
            case 0u: { a = r;      b = vx3; }
            case 1u: { a = s1;     b = j; }
            case 2u: { a = zdelta; b = h; }
            default: { a = zero8;  b = zero8; }
        }
        let v = montgomery_product_f8(a, b);
        // Store: l0→rvx3 (slot 13, was j), l1→s1j (slot 14, was v_field),
        // l2→z3 (slot 11, was zsum2). l3 stores x3 directly (slot 12, was r).
        if (lane == 0u) { tg_store(local_merge, 13u, v); }
        if (lane == 1u) { tg_store(local_merge, 14u, v); }
        if (lane == 2u) { tg_store(local_merge, 11u, v); }
        if (lane == 3u) { tg_store(local_merge, 12u, x3); }
    }
    workgroupBarrier();

    // ============================================================
    // Final assembly: y3 = rvx3 - 2*s1j (free). Each lane writes ONE
    // output plane to out_buf (skipped for OOB merges + presence-overrides).
    // ============================================================
    let s1j = tg_load(local_merge, 14u);
    let rvx3 = tg_load(local_merge, 13u);
    let z3 = tg_load(local_merge, 11u);
    let x3 = tg_load(local_merge, 12u);
    let y3 = fr_sub_f8(rvx3, fr_add_f8(s1j, s1j));

    if (oob) { return; }

    let both_present = (l_pres_u != 0u) && (r_pres_u != 0u);
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    if (both_present) {
        if (lane == 0u) { store_plane(0u * out_stride, merge_id, x3); }
        else if (lane == 1u) { store_plane(1u * out_stride, merge_id, y3); }
        else if (lane == 2u) { store_plane(2u * out_stride, merge_id, z3); }
        else if (lane == 3u) { meta_out[merge_id] = 1u; }
    } else if (l_pres_u != 0u && r_pres_u == 0u) {
        if (lane == 0u) { store_plane(0u * out_stride, merge_id, load_plane(0u * in_stride, il)); }
        else if (lane == 1u) { store_plane(1u * out_stride, merge_id, load_plane(1u * in_stride, il)); }
        else if (lane == 2u) { store_plane(2u * out_stride, merge_id, load_plane(2u * in_stride, il)); }
        else if (lane == 3u) { meta_out[merge_id] = 1u; }
    } else if (l_pres_u == 0u && r_pres_u != 0u) {
        if (lane == 0u) { store_plane(0u * out_stride, merge_id, load_plane(0u * in_stride, ir)); }
        else if (lane == 1u) { store_plane(1u * out_stride, merge_id, load_plane(1u * in_stride, ir)); }
        else if (lane == 2u) { store_plane(2u * out_stride, merge_id, load_plane(2u * in_stride, ir)); }
        else if (lane == 3u) { meta_out[merge_id] = 1u; }
    } else {
        if (lane == 0u) { store_plane(0u * out_stride, merge_id, zero); }
        else if (lane == 1u) { store_plane(1u * out_stride, merge_id, zero); }
        else if (lane == 2u) { store_plane(2u * out_stride, merge_id, zero); }
        else if (lane == 3u) { meta_out[merge_id] = 0u; }
    }

    {{{ recompile }}}
}
