// Optimal walker_combine Kernel B2: scatter partial slots into the dense
// per-bucket layout produced by the scan.
//
// One thread per partial slot. Reads partial_dest[slot]; if active
// (!= NO_BUCKET), atomicAdd's a per-bucket write position and writes
// partial_layout[partial_offset[bid] + local_idx] = slot.
//
// After this kernel finishes:
//   partial_layout[partial_offset[bid] .. partial_offset[bid] +
//                  partial_count[bid] - 1] = slot indices of bucket bid's
//   partials, in arbitrary but contiguous order.
//
// partial_write_pos must be zero-initialised before dispatch.
//
// params.x = num_partial_slots

const NO_BUCKET: u32 = 0xffffffffu;

@group(0) @binding(0) var<storage, read>       partial_dest:      array<u32>;
@group(0) @binding(1) var<storage, read>       partial_offset:    array<u32>;
@group(0) @binding(2) var<storage, read_write> partial_write_pos: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> partial_layout:    array<u32>;
@group(0) @binding(4) var<uniform>             params:            vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let num_slots = params.x;
    if (slot >= num_slots) { return; }
    let bid = partial_dest[slot];
    if (bid == NO_BUCKET) { return; }
    let local_idx = atomicAdd(&partial_write_pos[bid], 1u);
    partial_layout[partial_offset[bid] + local_idx] = slot;

    {{{ recompile }}}
}
