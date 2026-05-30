// Optimal walker_combine Kernel B1: exclusive prefix scan over partial_count.
//
// Writes partial_offset[i] = sum(partial_count[0..i]) for i in [0, num_dense).
// Also writes partial_offset[num_dense] = total partial count (used as the
// upper bound for the scatter kernel dispatch).
//
// Single workgroup of TPB threads. Each thread processes a chunk of
// num_dense/TPB buckets via the standard 3-phase chunked scan:
//   A — sum chunk → wg_sums[tid]
//   B — Hillis-Steele inclusive scan on wg_sums
//   C — re-walk chunk emitting per-element exclusive prefix
//
// params.x = num_dense

const TPB: u32 = {{ tpb }}u;

@group(0) @binding(0) var<storage, read>       partial_count:  array<u32>;
@group(0) @binding(1) var<storage, read_write> partial_offset: array<u32>;
@group(0) @binding(2) var<uniform>             params:         vec4<u32>;

var<workgroup> wg_sums: array<u32, {{ tpb }}>;

fn ceil_div(a: u32, b: u32) -> u32 {
    return (a + b - 1u) / b;
}

@compute @workgroup_size({{ tpb }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let num_dense = params.x;

    let chunk = max(ceil_div(num_dense, TPB), 1u);
    let my_start = min(tid * chunk, num_dense);
    let my_end = min(my_start + chunk, num_dense);

    // Phase A: sum chunk.
    var local_sum: u32 = 0u;
    for (var i: u32 = my_start; i < my_end; i = i + 1u) {
        local_sum = local_sum + partial_count[i];
    }
    wg_sums[tid] = local_sum;
    workgroupBarrier();

    // Phase B: Hillis-Steele inclusive scan.
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var add_val: u32 = 0u;
        if (tid >= stride) { add_val = wg_sums[tid - stride]; }
        workgroupBarrier();
        if (tid >= stride) { wg_sums[tid] = wg_sums[tid] + add_val; }
        workgroupBarrier();
    }

    // Phase C: emit exclusive prefix within each chunk.
    let block_prefix = select(0u, wg_sums[tid - 1u], tid > 0u);
    var running: u32 = block_prefix;
    for (var i: u32 = my_start; i < my_end; i = i + 1u) {
        partial_offset[i] = running;
        running = running + partial_count[i];
    }

    // Last thread writes the total to partial_offset[num_dense].
    if (tid == TPB - 1u) {
        partial_offset[num_dense] = wg_sums[TPB - 1u];
    }

    {{{ recompile }}}
}
