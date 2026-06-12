// walker_index v2 — E: bin offsets + pair-tree schedule epilogue.
//
// One workgroup of 64 threads (one per histogram bin). Thread 0 runs the
// serial 64-bin exclusive scan, emits the sorted-scatter (W5) indirect
// args from active_meta[0], then computes the ENTIRE pair-tree combine
// schedule from the count histogram: level count k*, tier boundaries, and
// every combine-stage indirect dispatch arg. The other lanes zero
// bin_write_pos in parallel.
//
// active_meta[0] = active_count, active_meta[1] = alloc total.

const MAX_N: u32 = 64u;
const SORT_TPB: u32 = {{ sort_tpb }}u;

@group(0) @binding(0) var<storage, read>       count_histogram: array<u32>;
@group(0) @binding(1) var<storage, read_write> active_meta:     array<u32>;
@group(0) @binding(2) var<storage, read_write> bin_offsets:     array<u32>;
@group(0) @binding(3) var<storage, read_write> bin_write_pos:   array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> wi_idx_args:     array<u32>;
// Pair-tree schedule + its indirect dispatch args. Args at u32 index
// 256 + 4k (k = arg slot); schedule words at [20..30].
@group(0) @binding(5) var<storage, read_write> ptree_meta:      array<u32>;

// Pair-tree STATIC schedule: adds at level k = Σ hist[n]·pairs_k(n)
// (exact while the 63-cap bin is empty; a non-empty cap bin forces full
// depth and the bounded folds absorb the rest); survivors are the
// contiguous TAIL of the sorted active list from bin_offsets[thr+1].
const PTREE_LEVELS: u32 = {{ ptree_levels }}u;
const PTREE_THETA: u32 = {{ ptree_theta }}u;
const PTREE_S: u32 = {{ ptree_s }}u;
const PTREE_TPB: u32 = {{ ptree_tpb }}u;
const PTREE_FIN_TPB: u32 = {{ ptree_fin_tpb }}u;
const PTREE_FIN_SN: u32 = {{ ptree_fin_sn }}u;
// Survivor scratch capacity (96 B Jacobian slots), baked from the host's
// ptreeSurvLayout(M): always >= the k*=LEVELS+1 worst case (2·cap_bin +
// mass chunks), so the scratch-fit loop below can never terminate unfit.
const PTREE_SURV_SLOTS: u32 = {{ ptree_surv_slots }}u;

fn ptree_pairs_k(n: u32, k: u32) -> u32 {
    let half = 1u << (k - 1u);
    if (n <= half) { return 0u; }
    return (n - half + (1u << k) - 1u) >> k;
}

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    atomicStore(&bin_write_pos[l], 0u);
    if (l != 0u) { return; }

    var sum: u32 = 0u;
    for (var i: u32 = 0u; i < MAX_N; i = i + 1u) {
        bin_offsets[i] = sum;
        sum = sum + count_histogram[i];
    }

    // W5 (sorted scatter) indirect args from the true active count.
    let n_active = active_meta[0];
    wi_idx_args[6] = (n_active + SORT_TPB - 1u) / SORT_TPB;
    wi_idx_args[7] = 1u;
    wi_idx_args[8] = 1u;

    // === Pair-tree schedule emission (thread 0, after the bin scan). ===
    let pt_n_active = active_meta[0];
    let pt_p_total = active_meta[1];
    let pt_cap_bin = count_histogram[MAX_N - 1u];
    // The cap bin hides counts >= 63, but its total MASS is exact:
    // p_total minus the known bins. A bucket of n partials performs about
    // n >> k adds at level k, so cap-bin adds are bounded by
    // (cap_mass >> k) + cap_bin, and the deepest bucket by cap_mass.
    var pt_known_mass: u32 = 0u;
    var pt_maxcnt: u32 = 0u;
    for (var n: u32 = 1u; n < MAX_N - 1u; n = n + 1u) {
        let h = count_histogram[n];
        pt_known_mass = pt_known_mass + n * h;
        if (h > 0u) { pt_maxcnt = n; }
    }
    let pt_cap_mass = pt_p_total - pt_known_mass;
    if (pt_cap_bin > 0u) { pt_maxcnt = max(pt_maxcnt, pt_cap_mass); }
    // k*: first level whose PREVIOUS level dropped below THETA, gated on
    // the deepest bucket's residuals fitting a bounded fold (<= 4096 =
    // 16 serial madds per deep-fold thread).
    var pt_kstar: u32 = PTREE_LEVELS + 1u;
    var pk: u32 = 2u;
    loop {
        if (pk > PTREE_LEVELS) { break; }
        var pt_adds: u32 = 0u;
        for (var n: u32 = 2u; n < MAX_N - 1u; n = n + 1u) {
            pt_adds = pt_adds + count_histogram[n] * ptree_pairs_k(n, pk - 1u);
        }
        if (pt_cap_bin > 0u) {
            pt_adds = pt_adds + (pt_cap_mass >> (pk - 1u)) + pt_cap_bin;
        }
        let depth_ok = (pt_maxcnt >> (pk - 1u)) <= 4096u;
        if (pt_adds < PTREE_THETA && depth_ok) { pt_kstar = pk; break; }
        pk = pk + 1u;
    }
    // The survivor range PLUS the deep pipeline's chunk partials must fit
    // the fold scratch; deeper trees shrink both.
    loop {
        let t = 1u << (pt_kstar - 1u);
        let tb = min(t + 1u, MAX_N - 1u);
        let sz = pt_n_active - bin_offsets[tb];
        var extra: u32 = 0u;
        if (pt_cap_bin > 0u) { extra = (pt_cap_mass / t) / 512u + pt_cap_bin; }
        if (sz + extra <= PTREE_SURV_SLOTS || pt_kstar > PTREE_LEVELS) { break; }
        pt_kstar = pt_kstar + 1u;
    }

    // Tier boundaries, exact outside the cap bin (the sort is by capped
    // count): micro = in-thread serial folds (<= MICRO_MAX residuals),
    // shallow = TPB-64 fold, deep = TPB-256 fold (cap bin only — deep
    // needs count > 64*stride >= 128 > 62). The cap-bin tail is appended
    // to the micro and shallow sweeps; in-kernel residual-count guards
    // pick the right tier for its (count-hidden) buckets.
    let pt_thr = 1u << (pt_kstar - 1u);
    let pt_surv_base = bin_offsets[min(pt_thr + 1u, MAX_N - 1u)];
    let pt_cap_base = bin_offsets[MAX_N - 1u];
    let pt_cap_size = pt_n_active - pt_cap_base;
    let pt_shallow_exact = pt_cap_base - pt_surv_base;

    ptree_meta[20] = pt_kstar;
    ptree_meta[22] = pt_thr;
    ptree_meta[23] = pt_surv_base;
    ptree_meta[24] = pt_n_active - pt_surv_base;
    ptree_meta[27] = pt_surv_base;
    ptree_meta[29] = pt_shallow_exact;
    ptree_meta[30] = pt_cap_base;
    ptree_meta[28] = pt_p_total;

    let pt_lvl_wgs = (pt_p_total + PTREE_S * PTREE_TPB - 1u) / (PTREE_S * PTREE_TPB);
    for (var k: u32 = 1u; k <= PTREE_LEVELS; k = k + 1u) {
        ptree_meta[256u + 4u * k + 0u] = select(0u, pt_lvl_wgs, k < pt_kstar);
        ptree_meta[256u + 4u * k + 1u] = 1u;
        ptree_meta[256u + 4u * k + 2u] = 1u;
    }
    // Slot 18 = shallow fold (one WG per bucket, <= 64 residuals — its
    // variable-depth tree makes tiny buckets cost ceil(log2(n_resid))
    // adds, so no separate micro tier), 17 = deep fold (cap tail only),
    // 19 = survivor finalize.
    ptree_meta[256u + 4u * 18u + 0u] = pt_shallow_exact + pt_cap_size;
    ptree_meta[256u + 4u * 18u + 1u] = 1u;
    ptree_meta[256u + 4u * 18u + 2u] = 1u;
    // Deep stage A: one WG per 512-residual chunk of cap-bin buckets —
    // bounded by mass (per-bucket ceil slack <= cap_bin); overdispatched
    // WGs exit in-kernel. Stage B (slot 17) = one WG per cap bucket.
    var pt_deep_a: u32 = 0u;
    if (pt_cap_bin > 0u) { pt_deep_a = (pt_cap_mass / pt_thr) / 512u + pt_cap_bin; }
    ptree_meta[256u + 4u * 16u + 0u] = pt_deep_a;
    ptree_meta[256u + 4u * 16u + 1u] = 1u;
    ptree_meta[256u + 4u * 16u + 2u] = 1u;
    ptree_meta[256u + 4u * 17u + 0u] = pt_cap_size;
    ptree_meta[256u + 4u * 17u + 1u] = 1u;
    ptree_meta[256u + 4u * 17u + 2u] = 1u;
    let pt_range = pt_n_active - pt_surv_base;
    ptree_meta[256u + 4u * 19u + 0u] = (pt_range + PTREE_FIN_TPB * PTREE_FIN_SN - 1u) / (PTREE_FIN_TPB * PTREE_FIN_SN);
    ptree_meta[256u + 4u * 19u + 1u] = 1u;
    ptree_meta[256u + 4u * 19u + 2u] = 1u;

    {{{ recompile }}}
}
