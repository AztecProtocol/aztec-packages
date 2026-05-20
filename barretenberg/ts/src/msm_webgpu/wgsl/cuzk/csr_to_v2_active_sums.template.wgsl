// Layout converter for the v2 pair-tree MSM bucket-accumulate path.
//
// Materializes the bucket-major active_sums buffer by copying packed
// 8×u32 base coords from the cached_bases (new_point_x / new_point_y)
// at the indices listed in val_idx (cuZK transpose output, bucket-major
// per subtask).
//
// active_sums is one combined-SoA storage buffer (matching what the v2
// pair-tree kernels marshal_pairs / pair_disjoint_tree / scatter_pairs
// / carry_copy consume):
//   plane 0 (x) at vec4 indices [0, PG * M)
//   plane 1 (y) at vec4 indices [PG * M, 2 * PG * M)
//   per-element layout: PG=2 vec4 at [PG*elem, PG*elem+1].
// M (elements per plane) is passed via params.y so this shader uses a
// single storage binding instead of two subviews of the same buffer —
// the subview path tripped a silent dispatch no-op on M2 Chrome 148
// because plane-y's byte offset (PG*M*16 = 8256 for M=258) is not a
// multiple of WebGPU's default minStorageBufferOffsetAlignment of 256.
//
// Per (subtask s, slot k) thread with slot = s * input_size + k:
//   pt_idx = val_idx[slot]
//   active_sums[PG * slot + v]              = new_point_x[PG * pt_idx + v]
//   active_sums[PG * M + PG * slot + v]     = new_point_y[PG * pt_idx + v]
// for v in {0, 1}.
//
// The copy is a raw element copy — destination element bytes equal
// source element bytes; no unpack / pack needed. Sign handling stays at
// finalize (cuZK encodes signed slices via bucket index, not via point
// negation).

const PG: u32 = 2u;

@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> active_sums: array<vec4<u32>>;

// params.x = total_slots (num_subtasks * input_size, OR per-window
// input_size when the caller binds val_idx as a per-window subview)
// params.y = M (elements per plane in active_sums)
@group(0) @binding(4)
var<uniform> params: vec4<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let total = params[0];
    if (slot >= total) {
        return;
    }

    let M = params[1];
    let pt_idx = val_idx[slot];

    let plane_x_base = PG * slot;
    let plane_y_base = PG * M + PG * slot;
    let src_x = PG * pt_idx;
    let src_y = PG * pt_idx;

    active_sums[plane_x_base + 0u] = new_point_x[src_x + 0u];
    active_sums[plane_x_base + 1u] = new_point_x[src_x + 1u];
    active_sums[plane_y_base + 0u] = new_point_y[src_y + 0u];
    active_sums[plane_y_base + 1u] = new_point_y[src_y + 1u];

    {{{ recompile }}}
}
