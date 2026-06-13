// Companion to csr_to_v2_active_sums: derives the per-bucket counts and
// GLOBAL offsets that drive the v2 pair-tree planner.
//
// row_ptr layout: per subtask, num_columns + 1 entries forming a
// CSR-style prefix sum. row_ptr[s*(num_columns+1) + b + 1] -
// row_ptr[s*(num_columns+1) + b] is bucket b's count; the begin value is
// the subtask-relative start within val_idx / active_sums.
//
// The v2 planner indexes counts/offsets by global bucket id and expects
// offsets in the global active_sums element space, so this shader adds
// subtask * input_size to the subtask-relative begin.
//
// One thread per (subtask, bucket) emits one (count, offset) pair.

const WD_STRIDE: u32 = 8u;

@group(0) @binding(0)
var<storage, read> row_ptr: array<u32>;
@group(0) @binding(1)
var<storage, read_write> active_counts: array<u32>;
@group(0) @binding(2)
var<storage, read_write> active_offsets: array<u32>;

// params[0] = num_windows (this batch's window count, tbw)
// params[1] = input_size   (per-subtask slot stride; globalises offsets)
@group(0) @binding(3)
var<uniform> params: vec4<u32>;
// WindowDesc (SPLIT_C_PLAN.md): per-GLOBAL-window geometry, stride 8 u32.
// num_columns at +5, work_off (prefix of num_columns) at +3.
@group(0) @binding(4)
var<storage, read> window_desc: array<u32>;
// batch_window_base.x = global index of this batch's first window.
@group(0) @binding(5)
var<uniform> batch_window_base: vec4<u32>;
// point_offsets: per-window val_idx base. active_offsets globalises the CSR begin
// by this window's base (= w·n uniform, byte-identical; Σ n_w for a heterogeneous
// union — val_idx is packed window-by-window at point_offsets[w]).
@group(0) @binding(6)
var<storage, read> point_offsets: array<u32>;

// 2D dispatch (bucket_local = gid.x, window = gid.y). Each window reads its own
// bucket count from WindowDesc, so windows of different widths (split-c) are
// handled in one unified pass. Uniform fill ⇒ id == subtask*BW + bucket_local
// and rp_offset == subtask*(BW+1), byte-identical to the old flat 1D path.
@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let window = gid.y;
    if (window >= params[0]) {
        return;
    }
    let gwin = window + batch_window_base.x;
    let num_columns = window_desc[gwin * WD_STRIDE + 5u];
    let bucket_local = gid.x;
    if (bucket_local >= num_columns) {
        return;
    }

    // Batch-local CSR base for this window: global work_off prefix minus the
    // batch's base work_off. The row_ptr stride is num_columns+1, so the
    // row_ptr base is Σ(num_columns+1) = work_off_local + window.
    let work_off_local = window_desc[gwin * WD_STRIDE + 3u]
                       - window_desc[batch_window_base.x * WD_STRIDE + 3u];
    let id = work_off_local + bucket_local;
    let rp_offset = work_off_local + window;

    let begin = row_ptr[rp_offset + bucket_local];
    let end = row_ptr[rp_offset + bucket_local + 1u];

    active_counts[id] = end - begin;
    active_offsets[id] = point_offsets[window] + begin;

    {{{ recompile }}}
}
