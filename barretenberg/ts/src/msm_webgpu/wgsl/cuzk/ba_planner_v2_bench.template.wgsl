{{> structs }}

// Bin-packing planner for the MSM bucket-accumulate pair-tree —
// one workgroup per Pippenger window.
//
// The MSM splits each scalar into NUM_WINDOWS windows of c bits; each
// window is an independent bucket-method sub-problem of BW = 2^(c-1)
// buckets. This kernel dispatches one workgroup per window: workgroup
// w plans window w entirely on its own, with no cross-workgroup
// communication (the windows never interact).
//
// Within a workgroup the algorithm is the single-window scan+scatter
// planner. One workgroup of TPB threads covers BW buckets; thread tid
// owns the contiguous slice [tid*PER_THREAD, (tid+1)*PER_THREAD).
//
// Finalize-and-drop: a bucket whose count is exactly 1 is already
// reduced — its single element IS the bucket sum. Such a bucket emits
// no pair and no carry, and gets new_count = 0, so it drops out of
// every deeper level (the offset scan compacts around it for free).
// The one-time copy of its element to the bucket-result buffer is left
// to a downstream kernel, which finds finalized buckets directly via
// counts[b] == 1 — the planner emits nothing extra for it. This keeps
// the deep tree levels (reached only when some bucket is unusually
// large) from carry-copying every already-finished bucket forever.
//
// Phase A — Per-thread local tally
//   For each of its PER_THREAD buckets compute (pair_count, carry_flag,
//   new_count) and accumulate per-thread totals. The per-bucket triples
//   are NOT cached (PER_THREAD is large for production windows); Phase
//   C recomputes them.
//
// Phase B — Workgroup-wide Hillis-Steele scan (3 in parallel)
//   Scan the per-thread totals for pair / carry / new across the TPB
//   threads in shared memory. Each thread gets the exclusive prefix at
//   the start of its slice (= base offset for its first bucket).
//
// Phase C — Per-thread scatter
//   Walk the slice again, recomputing (pc, cf, nc) per bucket, and
//   write the chunk_plan / scatter_plan / carry_plan entries plus
//   new_counts / new_offsets, seeded by the Phase B prefix.
//
// Phase D — Window totals + level-wide indirect-dispatch args.
//
// Per-window output layout: window w's chunk_plan / scatter_plan /
// carry_plan occupy fixed-size regions of CHUNKS_PER_WINDOW chunks and
// CARRIES_PER_WINDOW carries (params.x / params.y — the host sizes them
// to the largest window). new_counts / new_offsets are indexed by
// global bucket id.
//
// plan_meta buffer layout (u32):
//   [0 .. 3*NUM_WINDOWS)        per-window totals: 3*w + {pairs,carries,new}
//   [3*NUM_WINDOWS   .. +3)     indirect-dispatch args for the chunk
//                               kernels: (workgroup_count, 1, 1)
//   [3*NUM_WINDOWS+3 .. +3)     indirect-dispatch args for the carry
//                               kernel:  (workgroup_count, 1, 1)
//   The workgroup counts assume a consumer of workgroup size WGI
//   walking the full NUM_WINDOWS * stride layout. They right-size per
//   level for free: the host shrinks CHUNKS/CARRIES_PER_WINDOW as the
//   pair count falls, so an all-finished level yields a (0,1,1) no-op.
//
// One dispatch of NUM_WINDOWS workgroups, no atomics, no host sync.
// Each window's BW buckets must fit one workgroup, so BW must be a
// positive multiple of TPB (PER_THREAD = BW / TPB).
//
// Compile-time constants:
//   TPB          : workgroup size (e.g. 256)
//   BW           : buckets per window = 2^(c-1)
//   PER_THREAD   : buckets per thread = BW / TPB
//   NUM_WINDOWS  : ceil(num_bits / c)
//   PAIR_CAP     : per-bucket pair-count bound (Poisson(λ=32) tail is
//                  ~30; 64 is safe)
//   S            : chunk size in pairs (e.g. 16)
//
// Runtime (params uniform):
//   params.x = CHUNKS_PER_WINDOW    per-window output stride, in chunks
//   params.y = CARRIES_PER_WINDOW   per-window output stride, in carries
//   params.z = WGI                  consumer workgroup size, used to
//                                   size the indirect-dispatch args
//   params.w = WSTRIDE              active_sums slots per window; added
//                                   to new_offsets / scatter_plan /
//                                   carry destinations so they index
//                                   the global active_sums. 0 keeps the
//                                   window-local behaviour (back-compat).

const TPB: u32 = {{ workgroup_size }}u;
const BW: u32 = {{ buckets_per_window }}u;
const PER_THREAD: u32 = {{ per_thread }}u;
const NUM_WINDOWS: u32 = {{ num_windows }}u;
const PAIR_CAP: u32 = {{ pair_cap }}u;
const S: u32 = {{ s }}u;

@group(0) @binding(0) var<storage, read>       counts:       array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:      array<u32>;
@group(0) @binding(2) var<storage, read_write> chunk_plan:   array<u32>;
@group(0) @binding(3) var<storage, read_write> scatter_plan: array<u32>;
@group(0) @binding(4) var<storage, read_write> carry_plan:   array<u32>;
@group(0) @binding(5) var<storage, read_write> new_counts:   array<u32>;
@group(0) @binding(6) var<storage, read_write> new_offsets:  array<u32>;
@group(0) @binding(7) var<storage, read_write> plan_meta:    array<u32>;
@group(0) @binding(8) var<uniform>             params:       vec4<u32>;
{{#self_pad}}
// Lever E (plan-buffer 2-deep ring): pad_params holds the pad trio's slot
// indices — .x = pad_l, .y = pad_r (chunk_plan / carry sources), .z =
// pad_d (scatter / carry destination). With self_pad the planner rewrites
// every per-window tail slot, so a reused ring buffer needs no host
// pre-padding even though the per-level stride shrinks. The trio is passed
// explicitly (not derived from one M) because lever B's level-0 sources
// live in a different buffer than the destinations.
@group(0) @binding(9) var<uniform>             pad_params:   vec4<u32>;
{{/self_pad}}

// Workgroup-shared running prefixes for the 3 scans.
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
    let w = wid.x;                       // window index = workgroup index
    if (w >= NUM_WINDOWS) { return; }     // w is uniform across the workgroup

    let chunks_per_window  = params.x;
    let carries_per_window = params.y;
    let wstride            = params.w;   // active_sums slots per window

    let window_bucket_base = w * BW;
    let window_chunk_base  = w * chunks_per_window;
    let window_carry_base  = w * carries_per_window;

    // Phase A: per-thread tally over this thread's PER_THREAD buckets.
    var sum_p: u32 = 0u;
    var sum_c: u32 = 0u;
    var sum_n: u32 = 0u;
    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b_local = tid * PER_THREAD + k;
        if (b_local < BW) {
            let n = counts[window_bucket_base + b_local];
            let pc = n / 2u;
            // count == 1: bucket is already reduced -> finalize-and-drop
            // (no carry, no next-level slot). count 0 also yields cf = 0.
            let cf = select(n & 1u, 0u, n == 1u);
            sum_p += pc;
            sum_c += cf;
            sum_n += pc + cf;
        }
    }

    // Phase B: workgroup-wide Hillis-Steele inclusive scan over the
    // per-thread totals (3 scans interleaved).
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
    // pair_scan[tid] is now the inclusive prefix. Exclusive base = inclusive - own.
    var local_pair_off: u32 = pair_scan[tid] - sum_p;
    var local_carry_off: u32 = carry_scan[tid] - sum_c;
    var local_new_off: u32 = new_scan[tid] - sum_n;

    // Phase D: last thread writes this window's totals.
    if (tid == TPB - 1u) {
        plan_meta[3u * w + 0u] = pair_scan[tid];
        plan_meta[3u * w + 1u] = carry_scan[tid];
        plan_meta[3u * w + 2u] = new_scan[tid];
    }
    // One designated thread writes the level-wide indirect-dispatch
    // args (uniform across windows: function of strides + WGI only).
    if (w == 0u && tid == 0u) {
        let wgi = max(params.z, 1u);
        let d = 3u * NUM_WINDOWS;
        plan_meta[d + 0u] = ceil_div(NUM_WINDOWS * chunks_per_window, wgi);
        plan_meta[d + 1u] = 1u;
        plan_meta[d + 2u] = 1u;
        plan_meta[d + 3u] = ceil_div(NUM_WINDOWS * carries_per_window, wgi);
        plan_meta[d + 4u] = 1u;
        plan_meta[d + 5u] = 1u;
    }

    // Phase C: per-thread scatter.
    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b_local = tid * PER_THREAD + k;
        if (b_local >= BW) { break; }
        let b = window_bucket_base + b_local;

        let n = counts[b];
        let pc = n / 2u;
        let cf = select(n & 1u, 0u, n == 1u);   // count == 1 -> finalize-and-drop
        let nc = pc + cf;
        new_counts[b] = nc;
        new_offsets[b] = w * wstride + local_new_off;

        let bucket_base = offsets[b];

        // Pair entries: bounded loop, break at pc.
        for (var j: u32 = 0u; j < PAIR_CAP; j = j + 1u) {
            if (j >= pc) { break; }
            let slot_in_window = local_pair_off + j;
            let global_chunk = window_chunk_base + slot_in_window / S;
            let slot_in_chunk = slot_in_window % S;
            let flat_slot = global_chunk * S + slot_in_chunk;
            chunk_plan[2u * flat_slot + 0u] = bucket_base + 2u * j;
            chunk_plan[2u * flat_slot + 1u] = bucket_base + 2u * j + 1u;
            scatter_plan[flat_slot] = w * wstride + local_new_off + j;
        }

        // Carry entry (odd count > 1; count == 1 finalizes instead).
        if (cf != 0u) {
            let cs = window_carry_base + local_carry_off;
            carry_plan[2u * cs + 0u] = bucket_base + n - 1u;
            carry_plan[2u * cs + 1u] = w * wstride + local_new_off + pc;
        }

        local_pair_off += pc;
        local_carry_off += cf;
        local_new_off += nc;
    }

{{#self_pad}}
    // Self-pad this window's plan tails. Real Phase-C entries occupy the
    // contiguous prefix [0, total) of the window's chunk / carry region;
    // pair_scan / carry_scan still hold the Phase-B inclusive totals (no
    // later phase writes them). The fused / carry kernels read the full
    // CHUNKS/CARRIES_PER_WINDOW stride, so the leftover suffix is filled
    // with the pad trio (pad_l, pad_r -> sources; discard -> dest).
    let pad_l = pad_params.x;
    let pad_r = pad_params.y;
    let pad_d = pad_params.z;
    let total_pairs = pair_scan[TPB - 1u];
    let total_carries = carry_scan[TPB - 1u];
    let chunk_slots = chunks_per_window * S;
    for (var sp: u32 = total_pairs + tid; sp < chunk_slots; sp = sp + TPB) {
        let flat = window_chunk_base * S + sp;
        chunk_plan[2u * flat + 0u] = pad_l;
        chunk_plan[2u * flat + 1u] = pad_r;
        scatter_plan[flat] = pad_d;
    }
    for (var sc: u32 = total_carries + tid; sc < carries_per_window; sc = sc + TPB) {
        let cflat = window_carry_base + sc;
        carry_plan[2u * cflat + 0u] = pad_l;
        carry_plan[2u * cflat + 1u] = pad_d;
    }
{{/self_pad}}

    {{{ recompile }}}
}
