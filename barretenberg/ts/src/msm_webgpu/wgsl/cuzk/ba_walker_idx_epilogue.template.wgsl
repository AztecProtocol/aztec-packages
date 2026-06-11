// walker_index v2 — E: bin offsets + indirect args epilogue.
//
// One workgroup of 64 threads (one per histogram bin). Thread 0 runs the
// same serial 64-bin exclusive scan + arg emission as the v1 sort_scan (so
// pt/cb dispatch args stay byte-identical); the other lanes zero
// bin_write_pos in parallel. Additionally emits the sorted-scatter (W5)
// indirect args from active_meta[0] and writes the alloc total to
// partial_offset[num_dense] (compat slot — nothing is known to read it).
//
// active_meta[0] = active_count, active_meta[1] = alloc total.

const MAX_N: u32 = 64u;
const HOT_THRESHOLD: u32 = 8u;
const PT_TPB: u32 = 64u;
const CB_TPB: u32 = 64u;
const CB_S: u32 = 8u;
const SORT_TPB: u32 = {{ sort_tpb }}u;

@group(0) @binding(0) var<storage, read>       count_histogram:    array<u32>;
@group(0) @binding(1) var<storage, read_write> active_meta:        array<u32>;
@group(0) @binding(2) var<storage, read_write> bin_offsets:        array<u32>;
@group(0) @binding(3) var<storage, read_write> bin_write_pos:      array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> pt_dispatch_args:   array<u32>;
@group(0) @binding(5) var<storage, read_write> pt_persistent_args: array<u32>;
@group(0) @binding(6) var<storage, read_write> cb_dispatch_args:   array<u32>;
@group(0) @binding(7) var<storage, read_write> wi_idx_args:        array<u32>;
{{^ptree}}
@group(0) @binding(8) var<storage, read_write> partial_offset:     array<u32>;
{{/ptree}}
{{#ptree}}
// Replaces the compat partial_offset binding (a write nothing reads): the
// pair-tree schedule + its indirect dispatch args live in the ptree meta
// region. Args at u32 index 256 + 4k (k = arg slot); schedule words at
// [20..28]. Keeps the variant at exactly 10 storage bindings.
@group(0) @binding(8) var<storage, read_write> ptree_meta:         array<u32>;
{{/ptree}}
@group(0) @binding(9) var<storage, read>       planner_meta:       array<u32>;
{{#ptree}}
// Pair-tree STATIC schedule (gated; byte-identical output when off):
// adds at level k = Σ hist[n]·pairs_k(n) (exact while the 63-cap bin is
// empty; a non-empty cap bin forces full depth and the bounded folds
// absorb the rest); survivors are the contiguous TAIL of the sorted
// active list from bin_offsets[thr+1].
const PTREE_LEVELS: u32 = {{ ptree_levels }}u;
const PTREE_THETA: u32 = {{ ptree_theta }}u;
const PTREE_S: u32 = {{ ptree_s }}u;
const PTREE_TPB: u32 = {{ ptree_tpb }}u;
const PTREE_FIN_TPB: u32 = {{ ptree_fin_tpb }}u;
const PTREE_FIN_SN: u32 = {{ ptree_fin_sn }}u;
// Survivor scratch capacity (96 B Jacobian slots in the 1 MB region).
const PTREE_SURV_SLOTS: u32 = 10240u;

fn ptree_pairs_k(n: u32, k: u32) -> u32 {
    let half = 1u << (k - 1u);
    if (n <= half) { return 0u; }
    return (n - half + (1u << k) - 1u) >> k;
}
{{/ptree}}

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    atomicStore(&bin_write_pos[l], 0u);
    if (l != 0u) { return; }

    var sum: u32 = 0u;
    var hot_count: u32 = 0u;
    var cb_count: u32 = 0u;
    for (var i: u32 = 0u; i < MAX_N; i = i + 1u) {
        bin_offsets[i] = sum;
        sum = sum + count_histogram[i];
        if (i > HOT_THRESHOLD) { hot_count = hot_count + count_histogram[i]; }
        if (i >= 2u) { cb_count = cb_count + count_histogram[i]; }
    }
    let dx = (hot_count + PT_TPB - 1u) / PT_TPB;
    pt_dispatch_args[0] = dx;
    pt_dispatch_args[1] = 1u;
    pt_dispatch_args[2] = 1u;
    pt_persistent_args[0] = 0u;
    pt_persistent_args[1] = 1u;
    pt_persistent_args[2] = 1u;
    let cb = (cb_count + CB_TPB * CB_S - 1u) / (CB_TPB * CB_S);
    cb_dispatch_args[0] = cb;
    cb_dispatch_args[1] = 1u;
    cb_dispatch_args[2] = 1u;

    // W5 (sorted scatter) indirect args from the true active count.
    let n_active = active_meta[0];
    wi_idx_args[6] = (n_active + SORT_TPB - 1u) / SORT_TPB;
    wi_idx_args[7] = 1u;
    wi_idx_args[8] = 1u;

    // Compat: the v1 scan published the total at partial_offset[num_dense].
{{^ptree}}
    partial_offset[planner_meta[1]] = active_meta[1];
{{/ptree}}

{{#ptree}}
    // === Pair-tree schedule emission (thread 0, after the bin scan). ===
    let pt_n_active = active_meta[0];
    let pt_p_total = active_meta[1];
    let pt_cap_bin = count_histogram[MAX_N - 1u];
    var pt_kstar: u32 = PTREE_LEVELS + 1u;
    if (pt_cap_bin == 0u) {
        var pk: u32 = 2u;
        loop {
            if (pk > PTREE_LEVELS) { break; }
            var pt_adds: u32 = 0u;
            for (var n: u32 = 2u; n < MAX_N; n = n + 1u) {
                pt_adds = pt_adds + count_histogram[n] * ptree_pairs_k(n, pk - 1u);
            }
            if (pt_adds < PTREE_THETA) { pt_kstar = pk; break; }
            pk = pk + 1u;
        }
    }
    // The survivor range must fit the fold scratch; deeper trees shrink it.
    loop {
        let t = 1u << (pt_kstar - 1u);
        let tb = min(t + 1u, MAX_N - 1u);
        let sz = pt_n_active - bin_offsets[tb];
        if (sz <= PTREE_SURV_SLOTS || pt_kstar > PTREE_LEVELS) { break; }
        pt_kstar = pt_kstar + 1u;
    }
    let pt_thr = 1u << (pt_kstar - 1u);
    let pt_base = bin_offsets[min(pt_thr + 1u, MAX_N - 1u)];
    let pt_range = pt_n_active - pt_base;
    ptree_meta[20] = pt_kstar;
    ptree_meta[22] = pt_thr;
    ptree_meta[23] = pt_base;
    ptree_meta[24] = pt_range;
    ptree_meta[28] = pt_p_total;
    let pt_lvl_wgs = (pt_p_total + PTREE_S * PTREE_TPB - 1u) / (PTREE_S * PTREE_TPB);
    for (var k: u32 = 1u; k <= PTREE_LEVELS; k = k + 1u) {
        ptree_meta[256u + 4u * k + 0u] = select(0u, pt_lvl_wgs, k < pt_kstar);
        ptree_meta[256u + 4u * k + 1u] = 1u;
        ptree_meta[256u + 4u * k + 2u] = 1u;
    }
    // Both fold variants sweep the whole survivor range; complementary
    // in-kernel residual-count guards pick exactly one per bucket.
    ptree_meta[256u + 4u * 18u + 0u] = pt_range;
    ptree_meta[256u + 4u * 18u + 1u] = 1u;
    ptree_meta[256u + 4u * 18u + 2u] = 1u;
    ptree_meta[256u + 4u * 17u + 0u] = pt_range;
    ptree_meta[256u + 4u * 17u + 1u] = 1u;
    ptree_meta[256u + 4u * 17u + 2u] = 1u;
    ptree_meta[256u + 4u * 19u + 0u] = (pt_range + PTREE_FIN_TPB * PTREE_FIN_SN - 1u) / (PTREE_FIN_TPB * PTREE_FIN_SN);
    ptree_meta[256u + 4u * 19u + 1u] = 1u;
    ptree_meta[256u + 4u * 19u + 2u] = 1u;
{{/ptree}}

    {{{ recompile }}}
}
