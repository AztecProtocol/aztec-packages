// walker_index analytic (wi3) — K3′: per-task layout placement.
//
// One thread per walker task j (same classification as idx_cuts — see its
// header for the ported rules). Each nonempty task writes its ≤2 layout
// entries directly, with the slot id the walker will populate:
//
//   E1 departure (split-start at eff):
//     confined to eff (eff == te) → slot 2j+1, else slot 2j+0;
//     position = partial_offset[eff] + 1 + atomicAdd(write_pos[eff]).
//   E2 arrival (task ends mid-bucket te it did not split-start):
//     te_pt < c_te && (te > eff || !split) → slot 2j+1 at
//     position partial_offset[te] + 0  (the unique arriving piece).
//
// Rank order within a bucket differs from the v2 scatter's race order —
// legal: layout content is a per-bucket multiset; per-bucket sums are
// order-independent (exact group arithmetic).
//
// params.x = BW

const S: u32 = {{ s }}u;
const CUTS: u32 = S + 1u;
const THREAD_TPB: u32 = {{ thread_tpb }}u;
const OFFSET_MASK: u32 = 0x7fffffffu;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read_write> task_cuts:          array<u32>;
@group(0) @binding(1) var<storage, read_write> partial_layout:     array<u32>;
@group(0) @binding(2) var<storage, read>       partial_offset:     array<u32>;
// read_write (never written): A0 colour-mate of partial_write_pos — the
// usage classes must match within one dispatch.
@group(0) @binding(3) var<storage, read_write> partial_write_pos:  array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> sorted_count_list:  array<u32>;
@group(0) @binding(5) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(6) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(7) var<uniform>             params:             vec4<u32>;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let j = gid.x;
    let nat = planner_meta[3] * THREAD_TPB;
    if (j >= nat * S) { return; }
    let t = j / S;
    let k = j % S;
    let cut_base = t * CUTS * 2u;

    let sb = task_cuts[cut_base + k * 2u + 0u];
    let so = task_cuts[cut_base + k * 2u + 1u];
    let eb = task_cuts[cut_base + (k + 1u) * 2u + 0u];
    let eo = task_cuts[cut_base + (k + 1u) * 2u + 1u];

    let c_sb = sorted_count_list[sb];
    var eff: u32 = sb;
    var start_pt: u32 = 0u;
    var split: bool = false;
    if (so == 0u) {
        // fresh at sb
    } else if (so + 1u < c_sb) {
        start_pt = so + 1u;
        split = true;
    } else {
        eff = sb + 1u;
    }

    var te: u32;
    var te_pt: u32;
    if (eo > 0u) {
        te = eb;
        te_pt = eo + 1u;
    } else if (eb > 0u) {
        te = eb - 1u;
        te_pt = sorted_count_list[te];
    } else {
        te = 0u;
        te_pt = 0u;
    }

    if (eff > te || (eff == te && start_pt >= te_pt)) { return; }

    // E1 — departure.
    if (split) {
        let fb = flat_bid(sorted_bucket_list[eff], params.x);
        let off = partial_offset[fb] & OFFSET_MASK;
        let pos = atomicAdd(&partial_write_pos[fb], 1u);
        var slot = 2u * j;
        if (eff == te) { slot = slot + 1u; }
        partial_layout[off + 1u + pos] = slot;
    }

    // E2 — arrival.
    if (te_pt < sorted_count_list[te] && (te > eff || !split)) {
        let fb = flat_bid(sorted_bucket_list[te], params.x);
        let off = partial_offset[fb] & OFFSET_MASK;
        partial_layout[off] = 2u * j + 1u;
    }

    {{{ recompile }}}
}
