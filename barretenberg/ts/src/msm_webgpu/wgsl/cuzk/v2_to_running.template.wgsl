// Boundary adapter from the v2 bin-packed pair-tree's per-window
// active_sums buffer (combined SoA, plane 0 = X / plane 1 = Y at vec4
// indices [PG*elem + v]) to the production running_x / running_y /
// bucket_active layout that batch_affine_finalize_collect consumes.
//
// Per-window dispatch: one thread per (subtask, bucket_local). The
// caller binds the per-window active_sums (combined SoA), the final
// counts and offsets emitted by the planner's last level, and views of
// the global running_x / running_y / bucket_active arrays offset by
// subtask_idx * num_columns so a single bucket_global is addressable
// via gid.x.
//
// For non-empty buckets the v2 pair-tree has reduced the bucket to one
// packed-Montgomery point sitting at active_sums[final_offsets[b]] in
// the input plane layout. We copy that element into running_x /
// running_y at the matching bucket_global slot (packed 8x u32 = two
// vec4 per element, same layout production already uses when packed).
// Empty buckets only set bucket_active = 0 — running_x / running_y are
// left untouched; finalize is gated on bucket_active and never reads
// the unwritten slot.

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       active_sums:   array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       final_counts:  array<u32>;
@group(0) @binding(2) var<storage, read>       final_offsets: array<u32>;
@group(0) @binding(3) var<storage, read_write> running_x:     array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> running_y:     array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> bucket_active: array<u32>;
@group(0) @binding(6) var<uniform>             params:        vec4<u32>;
// params.x = num_columns (active per-window bucket count)
// params.y = M            (elements per plane in the v2 active_sums buffer)

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let bucket_local = gid.x;
    let num_columns = params.x;
    let M = params.y;
    if (bucket_local >= num_columns) {
        return;
    }

    let count = final_counts[bucket_local];
    if (count == 0u) {
        bucket_active[bucket_local] = 0u;
        return;
    }

    bucket_active[bucket_local] = 1u;

    let slot = final_offsets[bucket_local];
    let plane_x_base = PG * slot;
    let plane_y_base = PG * M + PG * slot;
    let dst = PG * bucket_local;

    running_x[dst + 0u] = active_sums[plane_x_base + 0u];
    running_x[dst + 1u] = active_sums[plane_x_base + 1u];
    running_y[dst + 0u] = active_sums[plane_y_base + 0u];
    running_y[dst + 1u] = active_sums[plane_y_base + 1u];

    {{{ recompile }}}
}
