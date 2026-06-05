// MSM bucket-accumulate planner — pass A of 2: per-window scan + offsets.
//
// One workgroup per Pippenger window. Computes, for every bucket, the
// window-local prefix offsets the emit pass (ba_planner_v2_emit) needs,
// plus new_counts / new_offsets and the per-window plan_meta totals — but
// NOT the O(pairs) pair_block / scatter / carry plans, which the emit
// pass writes in parallel across buckets.
//
// Phase A  per-thread tally of (pair, carry, new) counts.
// Phase B  workgroup Hillis-Steele scan of the 3 per-thread totals.
// Phase C  per bucket: write new_counts, new_offsets, carry_off. The emit
//          pass derives the pair prefix as new_offsets - w*wstride
//          - carry_off (pc + cf = nc, so the pair prefix is the new
//          prefix minus the carry prefix).
// Phase D  window totals + level-wide indirect-dispatch args.
//
// O(BW) per window — flat in n, so the NUM_WINDOWS-workgroup dispatch is
// not an occupancy bottleneck (the O(pairs) work is all in the emit pass).

// TPB (workgroup_size) is baked — it sizes the shared scan arrays. The window
// geometry (BW, num_windows; per_thread = BW/TPB) rides the `geom` uniform so
// the WGSL stays one-program across every (n, c) the pool serves.
const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       counts:      array<u32>;
@group(0) @binding(1) var<storage, read_write> carry_off:   array<u32>;
@group(0) @binding(2) var<storage, read_write> new_counts:  array<u32>;
@group(0) @binding(3) var<storage, read_write> new_offsets: array<u32>;
@group(0) @binding(4) var<storage, read_write> plan_meta:   array<u32>;
@group(0) @binding(5) var<uniform>             params:      vec4<u32>;
@group(0) @binding(6) var<uniform>             geom:        vec4<u32>; // x=BW, y=num_windows

var<workgroup> pair_scan:  array<u32, {{ workgroup_size }}>;
var<workgroup> carry_scan: array<u32, {{ workgroup_size }}>;
var<workgroup> new_scan:   array<u32, {{ workgroup_size }}>;

fn ceil_div(a: u32, b: u32) -> u32 {
    return (a + b - 1u) / b;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let w = wid.x;
    let BW = geom.x;
    let NUM_WINDOWS = geom.y;
    let PER_THREAD = BW / TPB;
    if (w >= NUM_WINDOWS) { return; }

    let pair_blocks_per_window = params.x;
    let carries_per_window     = params.y;
    let wstride                = params.w;
    let window_bucket_base = w * BW;

    // Phase A: per-thread tally over this thread's PER_THREAD buckets.
    var sum_p: u32 = 0u;
    var sum_c: u32 = 0u;
    var sum_n: u32 = 0u;
    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b_local = tid * PER_THREAD + k;
        if (b_local < BW) {
            let n = counts[window_bucket_base + b_local];
            let pc = n / 2u;
            let cf = select(n & 1u, 0u, n == 1u);
            sum_p += pc;
            sum_c += cf;
            sum_n += pc + cf;
        }
    }

    // Phase B: workgroup Hillis-Steele inclusive scan (3 interleaved).
    pair_scan[tid] = sum_p;
    carry_scan[tid] = sum_c;
    new_scan[tid] = sum_n;
    workgroupBarrier();
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var add_p: u32 = 0u;
        var add_c: u32 = 0u;
        var add_n: u32 = 0u;
        if (tid >= stride) {
            add_p = pair_scan[tid - stride];
            add_c = carry_scan[tid - stride];
            add_n = new_scan[tid - stride];
        }
        workgroupBarrier();
        if (tid >= stride) {
            pair_scan[tid] = pair_scan[tid] + add_p;
            carry_scan[tid] = carry_scan[tid] + add_c;
            new_scan[tid] = new_scan[tid] + add_n;
        }
        workgroupBarrier();
    }
    var local_carry_off: u32 = carry_scan[tid] - sum_c;
    var local_new_off: u32 = new_scan[tid] - sum_n;

    // Phase D: window totals + level-wide indirect-dispatch args.
    if (tid == TPB - 1u) {
        plan_meta[3u * w + 0u] = pair_scan[tid];
        plan_meta[3u * w + 1u] = carry_scan[tid];
        plan_meta[3u * w + 2u] = new_scan[tid];
    }
    if (w == 0u && tid == 0u) {
        let wgi = max(params.z, 1u);
        let d = 3u * NUM_WINDOWS;
        plan_meta[d + 0u] = ceil_div(NUM_WINDOWS * pair_blocks_per_window, wgi);
        plan_meta[d + 1u] = 1u;
        plan_meta[d + 2u] = 1u;
        plan_meta[d + 3u] = ceil_div(NUM_WINDOWS * carries_per_window, wgi);
        plan_meta[d + 4u] = 1u;
        plan_meta[d + 5u] = 1u;
    }

    // Phase C: per-bucket offsets — consumed by the emit pass.
    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b_local = tid * PER_THREAD + k;
        if (b_local >= BW) { break; }
        let b = window_bucket_base + b_local;
        let n = counts[b];
        let pc = n / 2u;
        let cf = select(n & 1u, 0u, n == 1u);
        new_counts[b] = pc + cf;
        new_offsets[b] = w * wstride + local_new_off;
        carry_off[b] = local_carry_off;
        local_carry_off += cf;
        local_new_off += pc + cf;
    }

    {{{ recompile }}}
}
