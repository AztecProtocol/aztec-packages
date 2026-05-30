// Bucket-accumulate planner stage 1.3: prefix sum of (count - 1).
//
// Builds cumulative_adds[i] = exclusive prefix sum of
// (sorted_count_list[i] - 1) over i in [0, num_dense). The final
// inclusive sum = total_adds is written to planner_meta[2].
//
// Also computes num_workgroups and writes indirect dispatch args for
// ba_stream_accum at planner_meta[12..14].
//
// Uses a 3-phase chunked scan (same as transpose_parallel_scan):
//   A — each thread sums its chunk → wg_sums[tid]
//   B — Hillis-Steele inclusive scan on wg_sums
//   C — re-read chunk and write per-element exclusive prefix

// TPB = this cumsum kernel's own scan workgroup size. By convention it
// equals STREAM_PLANNER_TPB (the walker's planner-thread grain) so the
// target_work formula below correctly sizes work per walker WG. If you
// change STREAM_PLANNER_TPB in ba_stream_plan.ts, change this together
// — they are coupled, not coincidentally equal.
const TPB: u32 = {{ planner_tpb }}u;
const NUM_THREADS: u32 = {{ num_threads }}u;
const MIN_ITERS_PER_WG: u32 = {{ min_iters_per_wg }}u;
const MAX_WORKGROUPS: u32 = {{ max_workgroups }}u;

@group(0) @binding(0) var<storage, read>       sorted_count_list: array<u32>;
@group(0) @binding(1) var<storage, read_write> cumulative_adds:   array<u32>;
@group(0) @binding(2) var<storage, read_write> planner_meta:      array<u32>;
@group(0) @binding(3) var<uniform>             params:            vec4<u32>;

var<workgroup> wg_sums: array<u32, {{ planner_tpb }}>;

fn ceil_div(a: u32, b: u32) -> u32 {
    return (a + b - 1u) / b;
}

@compute @workgroup_size({{ planner_tpb }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let num_dense = planner_meta[1];

    // No early return — workgroupBarrier requires uniform control flow.
    // When num_dense==0, chunk/my_start/my_end all become 0 and the
    // loops execute zero iterations, producing the correct result.
    let chunk = max(ceil_div(num_dense, TPB), 1u);
    let my_start = min(tid * chunk, num_dense);
    let my_end = min(my_start + chunk, num_dense);

    // Phase A: sum (count - 1) across this thread's chunk.
    var local_sum: u32 = 0u;
    for (var i: u32 = my_start; i < my_end; i = i + 1u) {
        let c = sorted_count_list[i];
        local_sum += c - 1u;
    }
    wg_sums[tid] = local_sum;
    workgroupBarrier();

    // Phase B: Hillis-Steele inclusive scan over wg_sums.
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var add_val: u32 = 0u;
        if (tid >= stride) {
            add_val = wg_sums[tid - stride];
        }
        workgroupBarrier();
        if (tid >= stride) {
            wg_sums[tid] = wg_sums[tid] + add_val;
        }
        workgroupBarrier();
    }

    // Phase C: per-element exclusive prefix within each chunk.
    let block_prefix = select(0u, wg_sums[tid - 1u], tid > 0u);
    var running: u32 = block_prefix;
    for (var i: u32 = my_start; i < my_end; i = i + 1u) {
        cumulative_adds[i] = running;
        let c = sorted_count_list[i];
        running += c - 1u;
    }

    // Last thread writes total_adds + dispatch args.
    if (tid == TPB - 1u) {
        let total_adds = wg_sums[TPB - 1u];
        planner_meta[2] = total_adds;

        let target_work = TPB * {{ s }}u * MIN_ITERS_PER_WG;
        var nwg: u32 = 1u;
        if (total_adds > target_work) {
            nwg = total_adds / target_work;
        }
        nwg = min(nwg, MAX_WORKGROUPS);
        nwg = max(nwg, 1u);
        planner_meta[3] = nwg;

        planner_meta[12] = nwg;
        planner_meta[13] = 1u;
        planner_meta[14] = 1u;
    }

    {{{ recompile }}}
}
