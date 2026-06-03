// Parallel transpose — Phase 2 of 4: reduce per-point-tile partials over
// the point-tile axis.
//
// Dispatch (ceil(BW/WG), num_windows): each thread owns one bucket. It
//   (a) sums the bucket's per-tile counts into the window's column count,
//       written to all_csc_col_ptr[window*(BW+1) + bucket + 1], and
//   (b) rewrites partials[window][point_tile][bucket] in place with the
//       point-tile-exclusive prefix sum
//       Sum_{pt<point_tile} partials0[window][pt][bucket].
//
// Each thread owns a disjoint bucket column of `partials`, so the in-place
// rewrite needs no atomics and has no races. Slot 0 of every window's
// all_csc_col_ptr row is left at 0 (zeroed by the host before this pass);
// Phase 3 (the scan) turns the per-column counts into inclusive offsets.

const WG: u32 = {{ workgroup_size }}u;
const WD_STRIDE: u32 = 8u;

@group(0) @binding(0)
var<storage, read_write> partials: array<u32>;

@group(0) @binding(1)
var<storage, read_write> all_csc_col_ptr: array<u32>;

@group(0) @binding(2)
var<uniform> params: vec4<u32>;
// params[0] = num_point_tiles  params[1] = BW (unused; column count now from WindowDesc)

// WindowDesc (SPLIT_C_PLAN.md): num_columns at +5, work_off (prefix) at +3.
@group(0) @binding(3)
var<storage, read> window_desc: array<u32>;
// batch_window_base.x = global index of this batch's first window.
@group(0) @binding(4)
var<uniform> batch_window_base: vec4<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let num_point_tiles = params[0];
    let bucket = gid.x;
    let window = wid.y;

    // Per-window CSR geometry from WindowDesc (batch-local work_off = global
    // prefix minus the batch base). Uniform fill ⇒ identical to the old path.
    let gwin = window + batch_window_base.x;
    let n_cols = window_desc[gwin * WD_STRIDE + 5u];
    let work_off_local = window_desc[gwin * WD_STRIDE + 3u]
                       - window_desc[batch_window_base.y * WD_STRIDE + 3u]; // .y = work_off base (global batch base; differs from .x gwin offset for the split-c upper region)
    if (bucket >= n_cols) { return; }

    let win_part = num_point_tiles * work_off_local;
    var run: u32 = 0u;
    for (var k: u32 = 0u; k < num_point_tiles; k = k + 1u) {
        let idx = win_part + k * n_cols + bucket;
        let t = partials[idx];
        partials[idx] = run;          // point-tile-exclusive prefix
        run = run + t;
    }
    // `run` is now the bucket's total count across the whole window. The
    // row_ptr base for this window is Σ(n_cols+1) = work_off_local + window.
    all_csc_col_ptr[(work_off_local + window) + bucket + 1u] = run;

    {{{ recompile }}}
}
