{{> structs }}

// GPU-side bin-packing planner for the v3 MSM bucket-accumulate
// pipeline. One thread per bucket; uses atomicAdd to reserve global
// per-pair slots in chunk_plan / scatter_plan and per-carry slots in
// carry_plan, then writes that bucket's entries.
//
// Inputs (per current level):
//   counts:  array<u32>     per-bucket active count
//   offsets: array<u32>     per-bucket starting index in active_sums_old
//
// Outputs (filled in by this kernel for the current level):
//   chunk_plan:   array<u32>          2 u32 per (chunk_id, slot) — pair operand indices
//   scatter_plan: array<u32>          1 u32 per (chunk_id, slot) — destination in active_sums_new
//   carry_plan:   array<u32>          2 u32 per carry slot — (src in old, dst in new)
//   totals:       array<atomic<u32>>  [0]=total pairs, [1]=total carries, [2]=total new actives
//   new_counts:   array<u32>          per-bucket new active count (for next level)
//   new_offsets:  array<u32>          per-bucket new offset in active_sums_new (for next level)
//
// Convention: discard slot = M_new - 1 (the highest index in
// active_sums_new). Pad pair source indices = (pad_l_idx, pad_r_idx)
// supplied via params. All non-real chunk_plan / scatter_plan slots
// must be pre-padded to (pad_l_idx, pad_r_idx) and discard_idx by the
// host before each planner dispatch.
//
// params.x = B (bucket count)
// params.y = S (chunk size, slots per chunk)
//   (pad_l_idx / pad_r_idx / discard_idx live in the pre-padded
//    arrays, not in params)

const S: u32 = {{ s }}u;

@group(0) @binding(0) var<storage, read>             counts:       array<u32>;
@group(0) @binding(1) var<storage, read>             offsets:      array<u32>;
@group(0) @binding(2) var<storage, read_write>       chunk_plan:   array<u32>;
@group(0) @binding(3) var<storage, read_write>       scatter_plan: array<u32>;
@group(0) @binding(4) var<storage, read_write>       carry_plan:   array<u32>;
@group(0) @binding(5) var<storage, read_write>       totals:       array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write>       new_counts:   array<u32>;
@group(0) @binding(7) var<storage, read_write>       new_offsets:  array<u32>;
@group(0) @binding(8) var<uniform>                   params:       vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let B = params.x;
    let b = gid.x;
    if (b >= B) { return; }

    let n = counts[b];
    let pair_count = n / 2u;
    let carry_flag = n & 1u;
    let nc = pair_count + carry_flag;
    new_counts[b] = nc;

    // Atomic offset reservation. Each bucket gets a unique non-overlapping
    // range in the global arrays. Atomic order is non-deterministic but
    // that's fine: bucket b records its assigned offsets and uses them
    // consistently for its own chunk_plan / scatter_plan / new_offsets
    // writes. Different buckets land in different ranges by construction.
    let my_pair_off = atomicAdd(&totals[0u], pair_count);
    let my_carry_off = atomicAdd(&totals[1u], carry_flag);
    let my_new_off = atomicAdd(&totals[2u], nc);
    new_offsets[b] = my_new_off;

    let bucket_base = offsets[b];

    // Write this bucket's pair entries into chunk_plan / scatter_plan.
    // Loop bounded by pair_count (variable per bucket; typically ~16
    // for Poisson(λ=32)). The TAIL_CAP-style compile-time bound used
    // by ba_tail_reduce isn't strictly needed here since this kernel
    // doesn't do field arithmetic; the loop is plain integer writes.
    // We still bound it by a compile-time constant for WGSL static
    // analysis purposes.
    let PAIR_CAP: u32 = {{ pair_cap }}u;
    for (var j: u32 = 0u; j < PAIR_CAP; j = j + 1u) {
        if (j >= pair_count) { break; }
        let global_slot = my_pair_off + j;
        let chunk_id = global_slot / S;
        let slot_in_chunk = global_slot % S;
        let cp_base = 2u * (chunk_id * S + slot_in_chunk);
        chunk_plan[cp_base + 0u] = bucket_base + 2u * j;
        chunk_plan[cp_base + 1u] = bucket_base + 2u * j + 1u;
        scatter_plan[chunk_id * S + slot_in_chunk] = my_new_off + j;
    }

    if (carry_flag != 0u) {
        let cs = my_carry_off;
        carry_plan[2u * cs + 0u] = bucket_base + n - 1u;
        carry_plan[2u * cs + 1u] = my_new_off + pair_count;
    }

    {{{ recompile }}}
}
