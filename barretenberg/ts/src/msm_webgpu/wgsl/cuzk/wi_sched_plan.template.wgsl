// walker_index — addition-schedule planner (ONE workgroup, runs after the
// counting sort, before the schedule emitter).
//
// Computes, from the exact count histogram + the sorted active list:
//   - per-layer add totals: adds(m, k) = floor(ceil(m / 2^(k-1)) / 2)
//     summed over bins 1..62 (exact) and over cap-bin buckets (exact
//     per-bucket counts via partial_count),
//   - the affine->projective boundary layer b (first k >= 2 whose add
//     count starves S=8 batch-affine; layer 1 is always affine),
//   - layer entry-base offsets (exclusive scan, entry units),
//   - per-bin per-layer cursor bases for the emitter's closed-form
//     write positions, and per-bin normalize-list bases (buckets whose
//     root lands in the projective region: m > 2^(b-1)),
//   - a per-cap-bucket per-layer prefix table (64-lane chunked scan),
//   - every indirect dispatch arg (emitter, affine layers, projective
//     layers, normalize).
//
// sched_meta layout (u32 words, region base = sched_off.x in arena units):
//   [0..17]    layer_adds[k=1..18]
//   [18]       boundary b (first projective layer, k-based; >= 2)
//   [19]       norm_total
//   [20]       cap_cnt
//   [21]       P_total (copy, for executors' bounds)
//   [24..41]   layer_base[k=1..18] (exclusive scan of layer_adds)
//   [64..125]  norm_bin_base[n=1..62]
//   [126]      norm_cap_base
//   [128..235] dispatch args, 27 slots x4: [128] emitter (x,y,z,0);
//              [132+4*(k-1)] affine layer k=1..8; [164+4*(k-2)] coop layer
//              k=2..18; [232] normalize.
//   [256..1371] bin_layer_base[n=1..62][k=1..18] (row stride 18)
// cap_prefix table (separate region @ sched_off.y, row stride = cap_max):
//   cap_prefix[(k-1)*cap_max + ci] = sum of adds(m_cj, k) for cj < ci.
//
// params.x = BW; sched_off.x = sched_meta base (u32 units within
// sched_buf), sched_off.y = cap_prefix base, sched_off.z = cap_max.

const MAX_LAYERS: u32 = 18u;
const MAX_N: u32 = 64u;
const TPB: u32 = 64u;
const COOP_THRESH: u32 = {{ coop_thresh }}u;
const EMIT_TPB: u32 = {{ emit_tpb }}u;
const AFF_TPB: u32 = {{ aff_tpb }}u;
const AFF_S: u32 = {{ aff_s }}u;
const COOP_TPB: u32 = {{ coop_tpb }}u;
const NORM_TPB: u32 = {{ norm_tpb }}u;
const NORM_C: u32 = {{ norm_c }}u;
const MAX_AFF: u32 = 8u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       sorted_active:  array<u32>;
@group(0) @binding(1) var<storage, read>       active_meta:    array<u32>;
@group(0) @binding(2) var<storage, read>       count_histogram: array<u32>;
@group(0) @binding(3) var<storage, read>       bin_offsets:    array<u32>;
// partial_count lives in the A2 arena monolith at arena_off.x.
@group(0) @binding(4) var<storage, read>       arena_a2:       array<u32>;
@group(0) @binding(5) var<storage, read_write> sched_buf:      array<u32>;
@group(0) @binding(6) var<uniform>             params:         vec4<u32>;
@group(0) @binding(7) var<uniform>             arena_off:      vec4<u32>;
@group(0) @binding(8) var<uniform>             sched_off:      vec4<u32>;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

// adds at layer k (1-based) for a bucket of m partials.
fn adds_at(m: u32, k: u32) -> u32 {
    let surv = (m + (1u << (k - 1u)) - 1u) >> (k - 1u); // ceil(m / 2^(k-1))
    return surv >> 1u;
}

var<workgroup> wg_scan: array<u32, 64>;
var<workgroup> wg_cap_layer: array<u32, MAX_LAYERS>;

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    let mb = sched_off.x;
    let cap_base = sched_off.y;
    let cap_max = sched_off.z;
    let n_active = active_meta[0];
    let cap_lo = bin_offsets[MAX_N - 1u];
    let cap_cnt = n_active - cap_lo;

    // --- cap-bin per-layer prefixes: 64-lane chunked scan, layer-outer ---
    // Lane l owns the contiguous chunk [l*chunk, (l+1)*chunk) of cap
    // buckets; per layer: serial local prefix, Hillis-Steele over lane
    // totals, rebase, write.
    let chunk = (cap_cnt + TPB - 1u) / TPB;
    for (var k: u32 = 1u; k <= MAX_LAYERS; k = k + 1u) {
        var local_sum: u32 = 0u;
        // First pass: lane total.
        for (var j: u32 = 0u; j < chunk; j = j + 1u) {
            let ci = l * chunk + j;
            if (ci < cap_cnt) {
                let bid = sorted_active[cap_lo + ci];
                let m = arena_a2[arena_off.x + flat_bid(bid, params.x)];
                local_sum = local_sum + adds_at(m, k);
            }
        }
        wg_scan[l] = local_sum;
        workgroupBarrier();
        // Inclusive scan over 64 lane sums (single array, double-buffer free:
        // read-then-barrier per step keeps it race-free at 64 lanes).
        for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
            var v = wg_scan[l];
            if (l >= stride) { v = v + wg_scan[l - stride]; }
            workgroupBarrier();
            wg_scan[l] = v;
            workgroupBarrier();
        }
        let lane_excl = wg_scan[l] - local_sum;
        if (l == TPB - 1u) { wg_cap_layer[k - 1u] = wg_scan[TPB - 1u]; }
        // Second pass: write the running prefix.
        var run = lane_excl;
        for (var j: u32 = 0u; j < chunk; j = j + 1u) {
            let ci = l * chunk + j;
            if (ci < cap_cnt) {
                sched_buf[cap_base + (k - 1u) * cap_max + ci] = run;
                let bid = sorted_active[cap_lo + ci];
                let m = arena_a2[arena_off.x + flat_bid(bid, params.x)];
                run = run + adds_at(m, k);
            }
        }
        workgroupBarrier();
    }

    // --- serial planning on lane 0 (histogram-scale work) ---
    if (l == 0u) {
        // Per-layer totals: exact bins + cap totals from the scan above,
        // and the per-bin per-layer cursor bases.
        var layer_adds: array<u32, MAX_LAYERS>;
        for (var k: u32 = 1u; k <= MAX_LAYERS; k = k + 1u) {
            var acc: u32 = 0u;
            for (var n: u32 = 2u; n < MAX_N - 1u; n = n + 1u) {
                sched_buf[mb + 256u + (n - 1u) * MAX_LAYERS + (k - 1u)] = acc;
                acc = acc + count_histogram[n] * adds_at(n, k);
            }
            // Cap bin sits after every exact bin in layer order.
            sched_buf[mb + 256u + (MAX_N - 2u) * MAX_LAYERS + (k - 1u)] = acc;
            layer_adds[k - 1u] = acc + wg_cap_layer[k - 1u];
            sched_buf[mb + (k - 1u)] = layer_adds[k - 1u];
        }
        // n=1 row: count-1 buckets never reach the combine; zero the row so
        // a stray read is loud-zero rather than stale.
        for (var k: u32 = 0u; k < MAX_LAYERS; k = k + 1u) {
            sched_buf[mb + 256u + 0u * MAX_LAYERS + k] = 0u;
        }

        // Boundary: first k >= 2 whose adds starve S=8 batch-affine.
        // Layer 1 is ALWAYS affine (the schedule's Z-space convention
        // depends on it). Clamped to 6: layer-6 adds = P/64 sit far under
        // any sane starvation threshold for every reachable P, and b <= 6
        // keeps "every cap-bin bucket (m >= 63 > 2^(b-1)) roots
        // projectively" exact, so the normalize cap base needs no
        // per-bucket threshold test.
        var b: u32 = 6u;
        for (var k: u32 = 2u; k < 6u; k = k + 1u) {
            if (layer_adds[k - 1u] < COOP_THRESH) { b = k; break; }
        }
        sched_buf[mb + 18u] = b;
        sched_buf[mb + 20u] = cap_cnt;
        sched_buf[mb + 21u] = active_meta[1];

        // Layer entry bases (exclusive scan).
        var base_acc: u32 = 0u;
        for (var k: u32 = 1u; k <= MAX_LAYERS; k = k + 1u) {
            sched_buf[mb + 24u + (k - 1u)] = base_acc;
            base_acc = base_acc + layer_adds[k - 1u];
        }

        // Normalize-list bases: buckets whose root is projective, i.e.
        // depth(m) = ceil(log2(m)) >= b  <=>  m > 2^(b-1).
        let m_thresh = 1u << (b - 1u); // norm iff m > m_thresh
        var norm_acc: u32 = 0u;
        for (var n: u32 = 2u; n < MAX_N - 1u; n = n + 1u) {
            sched_buf[mb + 64u + (n - 1u)] = norm_acc;
            if (n > m_thresh) { norm_acc = norm_acc + count_histogram[n]; }
        }
        // Cap-bin buckets all have m >= 63 > m_thresh (b <= 6 in practice;
        // even at the clamp, m >= 63 buckets root deeper than layer 8 only
        // when m > 256 — they are normalized via the cap base regardless).
        sched_buf[mb + 126u] = norm_acc;
        norm_acc = norm_acc + cap_cnt;
        sched_buf[mb + 19u] = norm_acc;

        // --- indirect dispatch args ---
        // Emitter: one thread per (active bucket, layer).
        sched_buf[mb + 128u + 0u] = (n_active + EMIT_TPB - 1u) / EMIT_TPB;
        sched_buf[mb + 128u + 1u] = MAX_LAYERS;
        sched_buf[mb + 128u + 2u] = 1u;
        // Affine layers k = 1..MAX_AFF: S entries per thread.
        for (var k: u32 = 1u; k <= MAX_AFF; k = k + 1u) {
            var wgs: u32 = 0u;
            if (k < b) {
                wgs = (layer_adds[k - 1u] + AFF_TPB * AFF_S - 1u) / (AFF_TPB * AFF_S);
            }
            sched_buf[mb + 132u + 4u * (k - 1u) + 0u] = wgs;
            sched_buf[mb + 132u + 4u * (k - 1u) + 1u] = 1u;
            sched_buf[mb + 132u + 4u * (k - 1u) + 2u] = 1u;
        }
        // Projective layers k = 2..MAX_LAYERS: 2 lanes per entry.
        for (var k: u32 = 2u; k <= MAX_LAYERS; k = k + 1u) {
            var wgs: u32 = 0u;
            if (k >= b) {
                wgs = (2u * layer_adds[k - 1u] + COOP_TPB - 1u) / COOP_TPB;
            }
            sched_buf[mb + 164u + 4u * (k - 2u) + 0u] = wgs;
            sched_buf[mb + 164u + 4u * (k - 2u) + 1u] = 1u;
            sched_buf[mb + 164u + 4u * (k - 2u) + 2u] = 1u;
        }
        // Normalize: C roots per thread.
        sched_buf[mb + 232u + 0u] = (norm_acc + NORM_TPB * NORM_C - 1u) / (NORM_TPB * NORM_C);
        sched_buf[mb + 232u + 1u] = 1u;
        sched_buf[mb + 232u + 2u] = 1u;
    }

    {{{ recompile }}}
}
