// Parallel transpose — Phase 2 of 3: in-place inclusive prefix sum
// (scan) of per-column counts → per-column start offsets.
//
// One *workgroup* per subtask, 256 threads per workgroup, each thread
// handles ceil((n_cols + 1) / 256) elements. Standard three-phase
// chunked scan:
//
//   A. Each thread sums its chunk into a local register; thread sums go
//      into workgroup-shared memory.
//   B. Workgroup-level inclusive scan over the 256 thread sums via
//      Hillis–Steele (O(N log N) work but log N depth — fine at N=256).
//      Convert to exclusive prefix per thread.
//   C. Each thread re-reads its chunk and writes inclusive prefix-sum
//      values starting from its block prefix.
//
// Replaces the previous serial-per-subtask scan that measured 37 ms of
// GPU time at N=2^16 (the new dominant cost after the parallel
// count/scatter dispatches dropped to <0.5 ms each). Expected to drop
// to ~1-2 ms with full workgroup parallelism.
//
// Bit-equivalent output to the serial scan in transpose_serial.wgsl
// lines 58-61: csc_col_ptr[k] = sum_{j=0}^{k-1} count(j) for k in [0, n].
// (Inclusive scan over the array where csc_col_ptr[0] = 0 and
// csc_col_ptr[i] = count(i-1) for i >= 1.)

const SCAN_WG_SIZE = 256u;
const WD_STRIDE: u32 = 8u;

@group(0) @binding(0)
var<storage, read_write> all_csc_col_ptr: array<atomic<u32>>;

@group(0) @binding(1)
var<uniform> params: vec3<u32>;
// params[1] = BW (unused; per-window column count now from WindowDesc)

// WindowDesc (SPLIT_C_PLAN.md): num_columns at +5, work_off (prefix) at +3.
@group(0) @binding(2)
var<storage, read> window_desc: array<u32>;
// batch_window_base.x = global index of this batch's first window.
@group(0) @binding(3)
var<uniform> batch_window_base: vec4<u32>;

var<workgroup> wg_sums: array<u32, SCAN_WG_SIZE>;

@compute
@workgroup_size(SCAN_WG_SIZE)
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let subtask_idx = wid.x;

    // Per-window CSR geometry from WindowDesc; the row_ptr base for this
    // subtask is Σ(n_cols+1) = work_off_local + subtask. Uniform fill ⇒
    // n == BW and base == subtask*(BW+1), byte-identical to the old path.
    let gwin = subtask_idx + batch_window_base.x;
    let n = window_desc[gwin * WD_STRIDE + 5u];
    let work_off_local = window_desc[gwin * WD_STRIDE + 3u]
                       - window_desc[batch_window_base.y * WD_STRIDE + 3u]; // .y = work_off base (global batch base; differs from .x gwin offset for the split-c upper region)
    let n_plus_1 = n + 1u;
    let base = work_off_local + subtask_idx;

    let chunk_size = (n_plus_1 + SCAN_WG_SIZE - 1u) / SCAN_WG_SIZE;
    let chunk_start = tid * chunk_size;
    var chunk_end = chunk_start + chunk_size;
    if (chunk_end > n_plus_1) {
        chunk_end = n_plus_1;
    }

    // Phase A: compute this thread's chunk-local sum.
    var local_sum: u32 = 0u;
    var _phaseA_iter: u32 = 0u;
    for (var i = chunk_start; i < chunk_end; i = i + 1u) {
        if (_phaseA_iter >= 65536u) { break; }
        _phaseA_iter = _phaseA_iter + 1u;
        local_sum = local_sum + atomicLoad(&all_csc_col_ptr[base + i]);
    }
    wg_sums[tid] = local_sum;
    workgroupBarrier();

    // Phase B: Hillis–Steele inclusive scan over wg_sums.
    for (var stride = 1u; stride < SCAN_WG_SIZE; stride = stride * 2u) {
        var x = wg_sums[tid];
        if (tid >= stride) {
            x = x + wg_sums[tid - stride];
        }
        workgroupBarrier();
        wg_sums[tid] = x;
        workgroupBarrier();
    }
    // After the loop, wg_sums[tid] = inclusive scan up through tid.
    // The exclusive prefix is wg_sums[tid] - local_sum.
    let block_prefix = wg_sums[tid] - local_sum;

    // Phase C: in-place inclusive prefix scan over this thread's chunk,
    // starting from block_prefix. The serial version did exactly the
    // same in-place inclusive write; the only race-free constraint is
    // that distinct threads operate on disjoint chunks, which holds by
    // construction here.
    var running = block_prefix;
    var _phaseC_iter: u32 = 0u;
    for (var i = chunk_start; i < chunk_end; i = i + 1u) {
        if (_phaseC_iter >= 65536u) { break; }
        _phaseC_iter = _phaseC_iter + 1u;
        running = running + atomicLoad(&all_csc_col_ptr[base + i]);
        atomicStore(&all_csc_col_ptr[base + i], running);
    }

    {{{ recompile }}}
}
