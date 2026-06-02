// Bucket-accumulate planner stage 1.1: 3-way classify.
//
// Partitions B_TOTAL buckets by count:
//   count == 0  → skip
//   count == 1  → size1_bucket_list  (consumed by ba_size1)
//   count >= 2  → dense_bucket_list + dense_count_list  (consumed by radix sort)
//
// Atomic counters in planner_meta[0] (num_size1) and planner_meta[1]
// (num_dense) track list lengths.

const WD_STRIDE: u32 = 8u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
// classify runs 2D (window = gid.y, magnitude = gid.x) so each window's bucket
// count / CSR base / stride are read from WindowDesc per window — correct for
// split-c variable widths. Uniform fill ⇒ byte-identical to the old b/BW path.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       counts:             array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:            array<u32>;
@group(0) @binding(2) var<storage, read_write> size1_bucket_list:  array<u32>;
@group(0) @binding(3) var<storage, read_write> dense_bucket_list:  array<u32>;
@group(0) @binding(4) var<storage, read_write> dense_count_list:   array<u32>;
@group(0) @binding(5) var<storage, read_write> planner_meta:       array<atomic<u32>>;
@group(0) @binding(6) var<uniform>             params:             vec4<u32>;
// params.x = num_windows (this batch's window count)
// WindowDesc (SPLIT_C_PLAN.md): num_columns at +5, work_off (prefix) at +3,
// num_buckets (= stride_w, red slots) at +2.
@group(0) @binding(7) var<storage, read>       window_desc:        array<u32>;
// batch_window_base.x = global index of this batch's first window.
@group(0) @binding(8) var<uniform>             batch_window_base:  vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let window = gid.y;
    if (window >= params.x) { return; }

    // Per-window CSR geometry from WindowDesc (global window = batch-local +
    // batch base). The batch-local CSR index b is the global work_off prefix
    // minus the batch's base. Uniform fill ⇒ b == window*BW + bucket_local.
    let gwin = window + batch_window_base.x;
    let num_columns = window_desc[gwin * WD_STRIDE + 5u];
    let bucket_local = gid.x;
    if (bucket_local >= num_columns) { return; }
    let work_off_local = window_desc[gwin * WD_STRIDE + 3u]
                       - window_desc[batch_window_base.x * WD_STRIDE + 3u];
    let b = work_off_local + bucket_local;

    let n = counts[b];
    if (n == 0u) { return; }

    // Drop buckets outside the reduce-valid magnitude range [1, stride_w].
    // The magnitude IS the column index (bucket_local); magnitude 0 is the
    // zero-digit, magnitude > stride_w is column padding. The per-window
    // stride comes from WindowDesc (num_buckets field). Hoisting the filter
    // here means walker output kernels never check magnitude per-store.
    let magnitude = bucket_local;
    let stride_w = window_desc[gwin * WD_STRIDE + 2u];
    if (magnitude == 0u || magnitude > stride_w) { return; }

    // Packed-window bid: batch-local window in the high bits, magnitude low.
    let packed = (window << WBID_SHIFT) | magnitude;

    if (n == 1u) {
        let slot = atomicAdd(&planner_meta[0], 1u);
        size1_bucket_list[2u * slot + 0u] = packed;
        size1_bucket_list[2u * slot + 1u] = offsets[b];
    } else {
        let slot = atomicAdd(&planner_meta[1], 1u);
        dense_bucket_list[slot] = packed;
        dense_count_list[slot] = n;
    }

    {{{ recompile }}}
}
