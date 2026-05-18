// Tree-reduce per-layer scan + dispatch-args writer.
//
// Inputs:
//   wg_pair_count_in[layer_idx*MAX_WGS + s] — count produced by prelude
//   num_wgs_per_layer[layer_idx]            — nw produced by prelude
//   num_active_count_buckets[0]                   — terminal count
//   layer_counts[layer_idx]                 — N for this layer (set by
//                                              the previous layer's
//                                              scan, or seeded for
//                                              layer 0)
//
// Outputs:
//   wg_output_offset_out[layer_idx*(MAX_WGS+1) + k]
//     exclusive prefix-sum over [0..nw], + total at index nw
//   layer_counts[layer_idx + 1] = total           (output count for next layer)
//   dispatch_args_phase2[layer_idx*3 + 0..3]      = (nw, 1, 1) if this layer's
//                                                   phase1/2 should run; else 0
//   dispatch_args_prelude[(layer_idx+1)*3 + 0..3] = next layer's prelude
//                                                   dispatch geometry (X, 1, 1),
//                                                   or 0 if we are at the
//                                                   terminal layer.
//   layer_counts[max_layers_slot] = final_total   (when we terminate)
//   final_slot_index[0] = ((layer_idx+1) & 1u)    (which ping-pong slot
//                                                   holds the final output)
//
// Single workgroup of SCAN_WG_SIZE threads. SCAN_WG_SIZE >= MAX_WGS is
// the simple case; otherwise the scan loops over MAX_WGS/SCAN_WG_SIZE
// elements per thread (work-efficient Blelloch up to MAX_WGS rounded
// to the next power of two).

const SCAN_WG_SIZE: u32 = {{ scan_wg_size }}u;
const MAX_WGS: u32 = {{ max_wgs }}u;
const ELEMS_PER_THREAD: u32 = {{ elems_per_thread }}u;

@group(0) @binding(0)
var<storage, read> wg_pair_count_in: array<u32>;

@group(0) @binding(1)
var<storage, read> num_wgs_per_layer: array<u32>;

@group(0) @binding(2)
var<storage, read_write> layer_counts: array<u32>;

@group(0) @binding(3)
var<storage, read_write> wg_output_offset_out: array<u32>;

@group(0) @binding(4)
var<storage, read_write> dispatch_args_phase2: array<u32>;

@group(0) @binding(5)
var<storage, read_write> dispatch_args_prelude: array<u32>;

@group(0) @binding(6)
var<storage, read> num_active_count_buckets: array<u32>;

struct Params {
    layer_idx: u32,
    max_slice_entries: u32,
    max_wgs: u32,
    prelude_wg_size: u32,
    is_layer_zero: u32,
    max_layers_slot: u32,
    final_slot_index_slot: u32,
    wg_output_offset_stride_u32: u32,
}
@group(0) @binding(7)
var<uniform> params: Params;

// Sequential scan in shared memory. Simpler + safer than a Blelloch
// across multiple thread chunks since MAX_WGS is at most a few
// thousand in practice and the kernel runs in a single workgroup.
var<workgroup> scan_values: array<u32, {{ max_wgs }}>;

@compute
@workgroup_size({{ scan_wg_size }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
) {
    let tid = lid.x;
    let nw = num_wgs_per_layer[params.layer_idx];
    let in_count = layer_counts[params.layer_idx];

    // 1. Load wg_pair_count_in into shared memory (zero past nw).
    for (var k: u32 = 0u; k < ELEMS_PER_THREAD; k = k + 1u) {
        let i = tid * ELEMS_PER_THREAD + k;
        if (i < MAX_WGS) {
            var v: u32 = 0u;
            if (i < nw) {
                v = wg_pair_count_in[params.layer_idx * params.max_wgs + i];
            }
            scan_values[i] = v;
        }
    }
    workgroupBarrier();

    // 2. Thread 0 performs an exclusive prefix-sum over [0..nw].
    //    Result: scan_values[i] = exclusive_prefix[i] for i in [0..nw].
    //    Total written to scan_values[nw].
    if (tid == 0u) {
        var acc: u32 = 0u;
        for (var i: u32 = 0u; i < nw; i = i + 1u) {
            let v = scan_values[i];
            scan_values[i] = acc;
            acc = acc + v;
        }
        if (nw < MAX_WGS) {
            scan_values[nw] = acc;
        }
        scan_values[MAX_WGS - 1u] = scan_values[MAX_WGS - 1u]; // touch (silences unused warnings on some backends)
    }
    workgroupBarrier();

    // 3. Each thread writes its slice of wg_output_offset_out.
    let off_base = params.layer_idx * params.wg_output_offset_stride_u32;
    for (var k: u32 = 0u; k < ELEMS_PER_THREAD; k = k + 1u) {
        let i = tid * ELEMS_PER_THREAD + k;
        if (i < MAX_WGS) {
            wg_output_offset_out[off_base + i] = scan_values[i];
        }
    }
    if (tid == 0u) {
        var total: u32 = 0u;
        if (nw < MAX_WGS) {
            total = scan_values[nw];
        } else {
            // nw == MAX_WGS case: prefix at slot MAX_WGS not stored in shared
            // memory; recompute it by summing the last input plus its prefix.
            total = scan_values[MAX_WGS - 1u];
            // Add the last element's value (not yet folded since we did
            // exclusive scan and only stored prefixes for i < nw).
            // Read directly from the input buffer.
            total = total + wg_pair_count_in[params.layer_idx * params.max_wgs + (MAX_WGS - 1u)];
        }
        wg_output_offset_out[off_base + nw] = total;

        // 4. Termination + dispatch-args writes.
        let active_count = num_active_count_buckets[0];
        // Only forward `total` to the next layer's slot if there IS a
        // next layer. Writing past `max_layers_slot` here would clobber
        // the terminal output count when the chain runs its full MAX_LAYERS
        // depth — the slot at index max_layers_slot is reserved for the
        // terminating layer's final total.
        if (params.layer_idx + 1u < params.max_layers_slot) {
            layer_counts[params.layer_idx + 1u] = total;
        }

        var nw_next: u32 = (total + params.max_slice_entries - 1u) / params.max_slice_entries;
        if (nw_next > params.max_wgs) { nw_next = params.max_wgs; }
        // Need (nw_next + 1) threads so the boundary slice_bounds[nw_next]
        // gets written for phase2's slice_hi read on the last WG.
        let prelude_x_next = (nw_next + 1u + params.prelude_wg_size - 1u) / params.prelude_wg_size;

        var p2_x: u32 = 0u;
        if (params.is_layer_zero == 1u) {
            p2_x = nw;
        } else if (in_count > active_count) {
            p2_x = nw;
        }

        var prelude_x: u32 = 0u;
        if (total > active_count) { prelude_x = prelude_x_next; }

        dispatch_args_phase2[params.layer_idx * 3u + 0u] = p2_x;
        dispatch_args_phase2[params.layer_idx * 3u + 1u] = 1u;
        dispatch_args_phase2[params.layer_idx * 3u + 2u] = 1u;

        // Same guard: only emit next-layer prelude args if a next layer
        // exists. At layer_idx == max_layers - 1 there's no next layer to
        // dispatch — the chain naturally ends here whether we terminated
        // earlier or not.
        if (params.layer_idx + 1u < params.max_layers_slot) {
            dispatch_args_prelude[(params.layer_idx + 1u) * 3u + 0u] = prelude_x;
            dispatch_args_prelude[(params.layer_idx + 1u) * 3u + 1u] = 1u;
            dispatch_args_prelude[(params.layer_idx + 1u) * 3u + 2u] = 1u;
        }

        // Terminate when (a) layer 0 didn't reduce (in_count == active_count or
        // total <= active_count means this layer is the final one) or (b) we
        // just produced total <= active_count.
        let terminate_after_this_layer =
            (params.is_layer_zero == 1u && total <= active_count) ||
            (params.is_layer_zero != 1u && in_count > active_count && total <= active_count);
        if (terminate_after_this_layer) {
            layer_counts[params.max_layers_slot] = total;
            layer_counts[params.final_slot_index_slot] = (params.layer_idx + 1u) & 1u;
        }
    }

    {{{ recompile }}}
}
