// Tree-reduce per-layer prelude. Replaces the host's
// pickNumWgs/evenSliceBounds/cpuPairCountPerSlice trio with an on-GPU
// equivalent so the entire tree chain can be recorded into the
// caller's command encoder without per-layer readbacks.
//
// Per layer:
//   N := layer_counts[layer_idx]
//   num_wgs   := min(max_wgs, ceil(N / max_slice_entries))
//   per_wg    := min(max_slice_entries, ceil(N / num_wgs))
//   slice_bounds_out[layer_idx*(max_wgs+1) + k] = min(k*per_wg, N) for k in [0, num_wgs]
//   wg_pair_count_out[layer_idx*max_wgs + s]   = pair_count(current_bucket_id[lo..hi))
//   num_wgs_per_layer[layer_idx]               = num_wgs
//
// Each thread covers one prospective WG. Dispatched by host as
// (ceil(initial_num_wgs / PRELUDE_WG_SIZE), 1, 1) for layer 0 and by
// the previous layer's scan kernel via dispatch_args_prelude[layer*3]
// for layers >= 1.

const PRELUDE_WG_SIZE: u32 = {{ prelude_wg_size }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_WGS: u32 = {{ max_wgs }}u;

@group(0) @binding(0)
var<storage, read> current_bucket_id: array<u32>;

@group(0) @binding(1)
var<storage, read> layer_counts: array<u32>;

@group(0) @binding(2)
var<storage, read_write> slice_bounds_out: array<u32>;

@group(0) @binding(3)
var<storage, read_write> wg_pair_count_out: array<u32>;

@group(0) @binding(4)
var<storage, read_write> num_wgs_per_layer: array<u32>;

struct Params {
    layer_idx: u32,
    max_slice_entries: u32,
    max_wgs: u32,
    slice_bounds_stride_u32: u32,
}
@group(0) @binding(5)
var<uniform> params: Params;

@compute
@workgroup_size({{ prelude_wg_size }})
fn main(
    @builtin(workgroup_id) wid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
) {
    let wg_idx = wid.x * PRELUDE_WG_SIZE + lid.x;
    let N = layer_counts[params.layer_idx];
    if (N == 0u) {
        if (wg_idx == 0u) {
            num_wgs_per_layer[params.layer_idx] = 0u;
            slice_bounds_out[params.layer_idx * params.slice_bounds_stride_u32 + 0u] = 0u;
        }
        return;
    }
    var num_wgs: u32 = (N + params.max_slice_entries - 1u) / params.max_slice_entries;
    if (num_wgs > params.max_wgs) { num_wgs = params.max_wgs; }
    var per_wg: u32 = (N + num_wgs - 1u) / num_wgs;
    if (per_wg > params.max_slice_entries) { per_wg = params.max_slice_entries; }

    if (wg_idx > num_wgs) { return; }
    var lo: u32 = wg_idx * per_wg;
    if (lo > N) { lo = N; }
    slice_bounds_out[params.layer_idx * params.slice_bounds_stride_u32 + wg_idx] = lo;
    if (wg_idx >= num_wgs) {
        if (wg_idx == 0u) { num_wgs_per_layer[params.layer_idx] = num_wgs; }
        return;
    }
    var hi: u32 = lo + per_wg;
    if (hi > N) { hi = N; }

    var count: u32 = 0u;
    var open: bool = false;
    var open_bucket: u32 = 0xffffffffu;
    for (var i: u32 = lo; i < hi; i = i + 1u) {
        let b = current_bucket_id[i];
        if (open && b == open_bucket) {
            count = count + 1u;
            open = false;
        } else {
            if (open) { count = count + 1u; }
            open = true;
            open_bucket = b;
        }
    }
    if (open) { count = count + 1u; }

    wg_pair_count_out[params.layer_idx * params.max_wgs + wg_idx] = count;

    if (wg_idx == 0u) { num_wgs_per_layer[params.layer_idx] = num_wgs; }

    {{{ recompile }}}
}
