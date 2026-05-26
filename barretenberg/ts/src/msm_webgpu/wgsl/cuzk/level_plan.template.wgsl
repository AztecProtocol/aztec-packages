// Per-level bucket walk for the pair-tree plan. Host mirror is the
// `hostLevelWalk` helper in msm_v2.ts — same arithmetic per bucket,
// same per-window reduction.
//
// One workgroup per window, dispatched once per level. The workgroup
// strides BW buckets across its threads, computes next-level counts
// (pc, cf, nc) per bucket, and reduces per-window (pairs, carries,
// strideCnt) via workgroup-shared atomics. The triple is written to
// stats[lv * NUM_WINDOWS * 3 + w * 3 + i]; the host reads back the
// stats buffer once after all `LEVEL_PLAN_MAX_LEVELS` dispatches
// complete and trims trailing-zero levels.
//
// Buffer aliasing. `counts_in` and `counts_out` ping-pong across levels
// via the bind group (binding 0 / 1 swap each level). The
// `bucket_histogram` kernel writes its output as `atomic<u32>`; this
// kernel reads/writes the same byte range as `u32` (non-atomic). That
// is safe — atomic vs non-atomic only differs at the operation level,
// the underlying storage is identical u32s, and the histogram pass
// completes via queue order before this kernel runs.

const BW: u32 = {{ BW }}u;
const NUM_WINDOWS: u32 = {{ num_windows }}u;
const WG_SIZE: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       counts_in:  array<u32>;
@group(0) @binding(1) var<storage, read_write> counts_out: array<u32>;
@group(0) @binding(2) var<storage, read_write> stats:      array<u32>;
@group(0) @binding(3) var<uniform>             params:     vec4<u32>;
// params.x = level_idx — the row of `stats` this dispatch writes into.

// Per-workgroup (= per-window) accumulators. The kernel sums pairs,
// carries, and stride contributions across the workgroup's threads, all
// for the same window.
var<workgroup> sh_pairs: atomic<u32>;
var<workgroup> sh_carries: atomic<u32>;
var<workgroup> sh_stride: atomic<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let w = wid.x;
    let tid = lid.x;
    if (w >= NUM_WINDOWS) { return; }

    if (tid == 0u) {
        atomicStore(&sh_pairs, 0u);
        atomicStore(&sh_carries, 0u);
        atomicStore(&sh_stride, 0u);
    }
    workgroupBarrier();

    // Each thread strides through its share of this window's buckets.
    // For BW=33024 and WG_SIZE=256, that's 129 buckets/thread.
    var local_pairs: u32 = 0u;
    var local_carries: u32 = 0u;
    var local_stride: u32 = 0u;
    for (var b: u32 = tid; b < BW; b = b + WG_SIZE) {
        let g = w * BW + b;
        let cnt = counts_in[g];
        let pc = cnt >> 1u;
        // cf = (cnt & 1u) if cnt > 1, else 0. Mirrors the bucketSplit
        // identity: a bucket of count 1 finalizes — no pair, no carry.
        let cf = select(0u, cnt & 1u, cnt > 1u);
        let nc = pc + cf;
        counts_out[g] = nc;
        local_pairs += pc;
        local_carries += cf;
        local_stride += nc;
    }

    atomicAdd(&sh_pairs, local_pairs);
    atomicAdd(&sh_carries, local_carries);
    atomicAdd(&sh_stride, local_stride);
    workgroupBarrier();

    // One thread per workgroup writes the (pairs, carries, strideCnt)
    // triple into this level's slot for this window. Layout is
    // level-major then window-major: stats[lv * NUM_WINDOWS * 3 + w * 3 + i].
    if (tid == 0u) {
        let lv = params.x;
        let base = lv * NUM_WINDOWS * 3u + w * 3u;
        stats[base + 0u] = atomicLoad(&sh_pairs);
        stats[base + 1u] = atomicLoad(&sh_carries);
        stats[base + 2u] = atomicLoad(&sh_stride);
    }

    {{{ recompile }}}
}
