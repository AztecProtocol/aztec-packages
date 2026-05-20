{{> structs }}

// Multi-workgroup v2 planner — Pass 3 of 3: per-tile scatter.
//
// One workgroup per TILE buckets (same launch shape as pass 1). Reads
// the per-bucket local prefix offsets from pass 1 plus the per-WG
// exclusive global starts from pass 2 to compute global pair / carry /
// new offsets per bucket, then writes:
//   chunk_plan    — pair-major operand indices into active_sums
//   scatter_plan  — per-pair destination index into next-level
//                   active_sums
//   carry_plan    — odd-count bucket carry-forward (src, dst) pairs
//   new_offsets   — per-bucket offset in next-level active_sums
//
// Compile-time:
//   TPB        : workgroup size (must match pass 1)
//   PER_THREAD : buckets per thread (must match pass 1)
//   PAIR_CAP   : per-bucket pair-count bound (matches the single-WG
//                planner — guards the inner emit loop so the WGSL
//                compiler can const-bound it; pc is enforced separately)
//   S          : chunk size in pairs

const TPB: u32 = {{ workgroup_size }}u;
const PER_THREAD: u32 = {{ per_thread }}u;
const PAIR_CAP: u32 = {{ pair_cap }}u;
const S: u32 = {{ s }}u;
const TILE: u32 = TPB * PER_THREAD;

@group(0) @binding(0)  var<storage, read>       counts:                 array<u32>;
@group(0) @binding(1)  var<storage, read>       offsets:                array<u32>;
@group(0) @binding(2)  var<storage, read>       bucket_local_pair_off:  array<u32>;
@group(0) @binding(3)  var<storage, read>       bucket_local_carry_off: array<u32>;
@group(0) @binding(4)  var<storage, read>       bucket_local_new_off:   array<u32>;
@group(0) @binding(5)  var<storage, read>       wg_totals:              array<u32>;
@group(0) @binding(6)  var<storage, read_write> chunk_plan:             array<u32>;
@group(0) @binding(7)  var<storage, read_write> scatter_plan:           array<u32>;
@group(0) @binding(8)  var<storage, read_write> carry_plan:             array<u32>;
@group(0) @binding(9)  var<storage, read_write> new_offsets:            array<u32>;
@group(0) @binding(10) var<uniform>             params:                 vec4<u32>;
// params.x = B (num_columns)

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wgid: vec3<u32>) {
    let tid = lid.x;
    let wg_id = wgid.x;
    let B = params.x;
    let tile_start = wg_id * TILE;

    let wg_global_pair_start  = wg_totals[3u * wg_id + 0u];
    let wg_global_carry_start = wg_totals[3u * wg_id + 1u];
    let wg_global_new_start   = wg_totals[3u * wg_id + 2u];

    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b = tile_start + tid * PER_THREAD + k;
        if (b >= B) { break; }

        let n = counts[b];
        let pc = n / 2u;
        let cf = n & 1u;
        let bucket_base = offsets[b];

        let global_pair_off  = wg_global_pair_start  + bucket_local_pair_off[b];
        let global_carry_off = wg_global_carry_start + bucket_local_carry_off[b];
        let global_new_off   = wg_global_new_start   + bucket_local_new_off[b];

        new_offsets[b] = global_new_off;

        for (var j: u32 = 0u; j < PAIR_CAP; j = j + 1u) {
            if (j >= pc) { break; }
            let global_slot = global_pair_off + j;
            let chunk_id = global_slot / S;
            let slot_in_chunk = global_slot % S;
            let cp_base = 2u * (chunk_id * S + slot_in_chunk);
            chunk_plan[cp_base + 0u] = bucket_base + 2u * j;
            chunk_plan[cp_base + 1u] = bucket_base + 2u * j + 1u;
            scatter_plan[chunk_id * S + slot_in_chunk] = global_new_off + j;
        }

        if (cf != 0u) {
            carry_plan[2u * global_carry_off + 0u] = bucket_base + n - 1u;
            carry_plan[2u * global_carry_off + 1u] = global_new_off + pc;
        }
    }

    {{{ recompile }}}
}
