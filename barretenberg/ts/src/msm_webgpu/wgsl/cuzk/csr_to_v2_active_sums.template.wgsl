// Layout converter for the v2 pair-tree MSM bucket-accumulate path.
//
// Materializes the bucket-major active_sums buffer by copying packed
// 8×u32 base coords from the cached_bases (new_point_x / new_point_y)
// at the indices listed in val_idx (cuZK transpose output, bucket-major
// per subtask).
//
// Per (subtask s, slot k) thread, with slot = s * input_size + k:
//   pt_idx = val_idx[slot]
//   active_sums_x[slot] = new_point_x[pt_idx]
//   active_sums_y[slot] = new_point_y[pt_idx]
//
// Both source and destination are packed 8×u32 (two vec4<u32> per field
// element). The copy is a raw element copy — destination element bytes
// equal source element bytes; no unpack / pack needed.
//
// Sign handling: cuZK encodes signed slices via bucket index, not via
// point negation, so the converter does not flip y. The finalize pass
// negates y for negative-bucket contributions.

@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> active_sums_x: array<vec4<u32>>;
@group(0) @binding(4)
var<storage, read_write> active_sums_y: array<vec4<u32>>;

// params[0] = total_slots (num_subtasks * input_size)
@group(0) @binding(5)
var<uniform> params: vec4<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let total = params[0];
    if (slot >= total) {
        return;
    }

    let pt_idx = val_idx[slot];

    active_sums_x[2u * slot]      = new_point_x[2u * pt_idx];
    active_sums_x[2u * slot + 1u] = new_point_x[2u * pt_idx + 1u];
    active_sums_y[2u * slot]      = new_point_y[2u * pt_idx];
    active_sums_y[2u * slot + 1u] = new_point_y[2u * pt_idx + 1u];

    {{{ recompile }}}
}
