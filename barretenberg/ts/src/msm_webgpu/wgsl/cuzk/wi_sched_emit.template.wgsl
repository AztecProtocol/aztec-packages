// walker_index — addition-schedule emitter.
//
// One thread per (active bucket, layer): gid.x indexes the sorted active
// list, gid.y = layer-1 (k = gid.y + 1). The bucket's pairing tree is the
// in-place pairing rule — at layer k, pairs are (rel, rel + 2^(k-1)) for
// rel = j*2^k with the partner in range — which is closed-form on
// (count, position) because in-place adds never move a value between
// positions. So each thread derives every entry of its (bucket, layer)
// from bit arithmetic + partial_layout lookups; no tree state exists.
//
// Entry (one vec4<u32>, 16 B, layer-major in entry order):
//   affine layer (k < boundary):
//     {srcA_slot, 0, srcB_slot, dst}; dst = srcA_slot, or
//     RED_FLAG | red_slot when this add closes the bucket.
//   projective layer (k >= boundary):
//     {srcA_slot | PROJ?, srcA_zslot, srcB_slot | PROJ?, srcB_zslot}.
//     dst is implicit (X3,Y3 -> srcA's slot; Z3 -> srcB's X cell). PROJ
//     (bit 31) = source was produced in the projective region: load its
//     Z from the z-slot; otherwise Z := Montgomery 1, z-slot ignored.
//
// A source's z-slot is the partner slot of its LAST pairing:
//   srcA (rel ≡ 0 mod 2^k) last paired at j = k-1 (its current partner
//   in range implies the previous one was);
//   srcB (rel_b = rel + 2^(k-1)) last paired at the largest j < k with
//   2^(j-1) <= (cnt - rel_b - 1); no such j ⇒ virgin ⇒ affine.
//   A source is projective iff that j >= boundary.
//
// Roots: k_root = ceil(log2(cnt)). Affine root (k_root < b) writes
// red_buf directly via the dst flag. Projective root (k_root >= b) stays
// in its slots; this thread also emits the normalize-list entry
// {root_xy_slot, root_z_slot, red_slot, 0} at the closed-form cursor.
//
// Cursors (per run deterministic): exact bins (n <= 62) use
// layer_base[k] + bin_layer_base[n][k] + rank_in_bin * adds(n, k); the
// cap bin (sorted tail) uses its planner-scanned per-bucket prefix.
//
// params.x = BW; params.w = M_partials. sched_off: .x = sched_meta base,
// .y = cap_prefix base, .z = cap_max, .w = entries base (all u32 units
// within sched_buf). norm list lives at entries_base + 4*total_entries
// (planner layer_base scan total), passed via sched_meta[24+18] slot
// computed here from layer bases — see norm_base() below.

const MAX_LAYERS: u32 = 18u;
const MAX_N: u32 = 64u;
const RED_FLAG: u32 = 0x80000000u;
const PROJ_FLAG: u32 = 0x80000000u;
const IDX_MASK: u32 = 0x7fffffffu;
const OFFSET_MASK: u32 = 0x7fffffffu;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;
const WD_STRIDE: u32 = 8u;

@group(0) @binding(0) var<storage, read>       sorted_active:  array<u32>;
@group(0) @binding(1) var<storage, read>       active_meta:    array<u32>;
@group(0) @binding(2) var<storage, read>       bin_offsets:    array<u32>;
// partial_count @ arena_off.x, partial_layout @ arena_off.y.
@group(0) @binding(3) var<storage, read>       arena_a2:       array<u32>;
@group(0) @binding(4) var<storage, read>       partial_offset: array<u32>;
@group(0) @binding(5) var<storage, read_write> sched_buf:      array<u32>;
@group(0) @binding(6) var<storage, read>       window_desc:    array<u32>;
@group(0) @binding(7) var<uniform>             params:         vec4<u32>;
@group(0) @binding(8) var<uniform>             arena_off:      vec4<u32>;
@group(0) @binding(9) var<uniform>             sched_off:      vec4<u32>;
@group(0) @binding(10) var<uniform>            batch_offset:   vec4<u32>;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}
fn pl_at(i: u32) -> u32 { return arena_a2[arena_off.y + i]; }
fn adds_at(m: u32, k: u32) -> u32 {
    let surv = (m + (1u << (k - 1u)) - 1u) >> (k - 1u);
    return surv >> 1u;
}
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 4u]; }

// Last pairing layer of position p in a count-m bucket, BELOW layer k.
// 0 = never paired (virgin). p's pairings are at layers j with
// p ≡ 0 mod 2^j and p + 2^(j-1) < m; divisibility holds for all
// j <= ctz(p) (and any j for p = 0), partner-range for
// 2^(j-1) <= m - p - 1.
fn last_pair_layer(p: u32, m: u32, k: u32) -> u32 {
    let d = m - p; // >= 1
    if (d < 2u) { return 0u; }
    var j = firstLeadingBit(d - 1u) + 1u; // largest j with 2^(j-1) <= d-1
    let div_cap = select(countTrailingZeros(p), 31u, p == 0u);
    j = min(j, min(div_cap, k - 1u));
    return j; // 0 when k == 1 or no valid layer
}

@compute @workgroup_size({{ emit_tpb }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    let k = gid.y + 1u;
    let n_active = active_meta[0];
    if (i >= n_active || k > MAX_LAYERS) { return; }

    let mb = sched_off.x;
    let b = sched_buf[mb + 18u];

    let bid = sorted_active[i];
    let fb = flat_bid(bid, params.x);
    let m = arena_a2[arena_off.x + fb];
    let n_adds = adds_at(m, k);
    if (n_adds == 0u) { return; }
    let off = partial_offset[fb] & OFFSET_MASK;

    // Cursor for this (bucket, layer).
    var nb = m;
    if (nb >= MAX_N) { nb = MAX_N - 1u; }
    var cursor: u32;
    if (nb == MAX_N - 1u) {
        let ci = i - bin_offsets[MAX_N - 1u];
        cursor = sched_buf[mb + 256u + (MAX_N - 2u) * MAX_LAYERS + (k - 1u)]
               + sched_buf[sched_off.y + (k - 1u) * sched_off.z + ci];
    } else {
        let rank = i - bin_offsets[nb];
        cursor = sched_buf[mb + 256u + (nb - 1u) * MAX_LAYERS + (k - 1u)] + rank * n_adds;
    }
    let layer_base = sched_buf[mb + 24u + (k - 1u)];
    var e = sched_off.w + 4u * (layer_base + cursor);

    let half = 1u << (k - 1u);
    let proj_layer = k >= b;
    let k_root = firstLeadingBit(m - 1u) + 1u; // ceil(log2(m)), m >= 2

    for (var j: u32 = 0u; j < n_adds; j = j + 1u) {
        let rel = j << k;
        let rel_b = rel + half;
        let sa = pl_at(off + rel);
        let sb = pl_at(off + rel_b);
        if (proj_layer) {
            // srcA last paired at k-1 unless it is the bucket's virgin
            // chain (never paired below k); srcB by the general rule.
            let ja = last_pair_layer(rel, m, k);
            let jb = last_pair_layer(rel_b, m, k);
            var w0 = sa;
            var w1 = 0u;
            if (ja >= b && ja > 0u) {
                w0 = sa | PROJ_FLAG;
                w1 = pl_at(off + rel + (1u << (ja - 1u)));
            }
            var w2 = sb;
            var w3 = 0u;
            if (jb >= b && jb > 0u) {
                w2 = sb | PROJ_FLAG;
                w3 = pl_at(off + rel_b + (1u << (jb - 1u)));
            }
            sched_buf[e + 0u] = w0;
            sched_buf[e + 1u] = w1;
            sched_buf[e + 2u] = w2;
            sched_buf[e + 3u] = w3;
        } else {
            var dst = sa;
            if (rel == 0u && m <= (1u << k)) {
                let window = bid >> WBID_SHIFT;
                let mag = bid & WBID_MAG_MASK;
                dst = RED_FLAG | (wd_reduce_off(window + batch_offset.x) + (mag - 1u));
            }
            sched_buf[e + 0u] = sa;
            sched_buf[e + 1u] = 0u;
            sched_buf[e + 2u] = sb;
            sched_buf[e + 3u] = dst;
        }
        e = e + 4u;
    }

    // Projective root: emit the normalize entry (once, from the root layer's
    // thread — k == k_root implies n_adds == 1 and rel == 0).
    if (k == k_root && k_root >= b) {
        var nc: u32;
        if (nb == MAX_N - 1u) {
            nc = sched_buf[mb + 126u] + (i - bin_offsets[MAX_N - 1u]);
        } else {
            nc = sched_buf[mb + 64u + (nb - 1u)] + (i - bin_offsets[nb]);
        }
        // Norm list sits after the full entry region: total entries =
        // layer_base[18] + layer_adds[18].
        let total_entries = sched_buf[mb + 24u + (MAX_LAYERS - 1u)] + sched_buf[mb + (MAX_LAYERS - 1u)];
        let ne = sched_off.w + 4u * (total_entries + nc);
        let window = bid >> WBID_SHIFT;
        let mag = bid & WBID_MAG_MASK;
        sched_buf[ne + 0u] = pl_at(off + 0u);
        sched_buf[ne + 1u] = pl_at(off + half);
        sched_buf[ne + 2u] = wd_reduce_off(window + batch_offset.x) + (mag - 1u);
        sched_buf[ne + 3u] = 0u;
    }

    {{{ recompile }}}
}
