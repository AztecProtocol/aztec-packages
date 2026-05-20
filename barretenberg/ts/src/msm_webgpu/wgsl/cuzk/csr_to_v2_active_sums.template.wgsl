// Layout converter for the v2 pair-tree MSM bucket-accumulate path.
//
// Materializes the bucket-major active_sums buffer — in the 2-plane SoA
// layout the v2 pair-tree consumes — by copying packed 8-u32 base coords
// from new_point_x / new_point_y at the indices listed in val_idx (cuZK
// transpose output, bucket-major per subtask).
//
// active_sums layout: ONE buffer, two planes. PG = 2 vec4 per element;
// plane p (0 = x, 1 = y) base = p * PG * M, where M is the element
// stride. Element e of plane p occupies vec4 indices p*PG*M + PG*e + {0,1}.
//
// Per slot k in [0, total_slots): pt_idx = val_idx[k]; copy
// new_point_x[pt_idx] -> plane 0 slot k, new_point_y[pt_idx] -> plane 1.
// The slot index is global: subtask s contributes slots
// [s*input_size, (s+1)*input_size), and input_size matches the v2
// per-window stride, so the slot IS the active_sums element index.
//
// Sign handling: cuZK encodes signed slices via bucket index, not point
// negation, so the converter does not flip y.

@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> active_sums: array<vec4<u32>>;

// params[0] = total_slots (num_subtasks * input_size)
// params[1] = M           (active_sums element stride; plane stride = PG*M)
@group(0) @binding(4)
var<uniform> params: vec4<u32>;

const PG: u32 = 2u;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let total = params[0];
    if (slot >= total) {
        return;
    }
    let m = params[1];

    let pt_idx = val_idx[slot];
    let x_base = PG * slot;
    let y_base = PG * m + PG * slot;

    active_sums[x_base]      = new_point_x[2u * pt_idx];
    active_sums[x_base + 1u] = new_point_x[2u * pt_idx + 1u];
    active_sums[y_base]      = new_point_y[2u * pt_idx];
    active_sums[y_base + 1u] = new_point_y[2u * pt_idx + 1u];

    {{{ recompile }}}
}
